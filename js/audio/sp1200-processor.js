/**
 * SP-1200 AudioWorklet Processor
 * Uses ES module imports — Vite dev server resolves them for the AudioWorklet context.
 */

import { PPQN, NUM_PADS, TOTAL_PADS, MAX_PATTERNS, BPM_MIN, BPM_MAX, SWING_MIN, SWING_MAX, FILTER_DYNAMIC, BASE_PITCH_STEP } from '../constants.js';
import { Voice } from '../dsp/voice.js';
import { SSM2044Filter, FixedFilter } from '../dsp/filters.js';
import { Mixer } from '../dsp/mixer.js';
import { Clock } from '../sequencer/clock.js';
import { Pattern, PatternEvent } from '../sequencer/pattern.js';
import { Song } from '../sequencer/song.js';
import { applySwing } from '../sequencer/swing.js';
import { MetronomeClick } from './metronome.js';
import { SetupHandler } from './setup-handler.js';

// ---------------------------------------------------------------------------
// SP1200Processor
// ---------------------------------------------------------------------------
class SP1200Processor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    // Voices: 8 voices (polyphony), one per physical pad
    this.voices = Array.from({ length: NUM_PADS }, (_, i) => new Voice(i));

    // Sample slots: 32 (4 banks × 8 pads) — hold sample data + per-slot settings
    this.sampleSlots = Array.from({ length: TOTAL_PADS }, () => ({
      sample: null,
      name: '',
      pitch: BASE_PITCH_STEP,
      decayRate: 1.0,
      reversed: false,
      loopEnabled: false, loopStart: 0, loopEnd: 0,
      startPoint: 0, endPoint: 0,
    }));
    // Current bank for the processor (set by UI)
    this.currentBank = 0;

    // Filters: ch 0-1 → SSM2044 (wider cutoff for fuller bass), ch 2-5 → FixedFilter, ch 6-7 → none
    this.dynamicFilters = [new SSM2044Filter(12000, 0.1), new SSM2044Filter(12000, 0.1)];
    this.fixedFilters = [new FixedFilter(10000), new FixedFilter(10000), new FixedFilter(10000), new FixedFilter(10000)];

    // Mixer + input gain
    this.mixer = new Mixer();
    this.inputGain = 1.0;

    // Clock (AudioWorklet global sampleRate)
    this.clock = new Clock(sampleRate);

    // Sequencer state
    this.patterns = Array.from({ length: MAX_PATTERNS }, () => new Pattern());
    this.currentPatternIndex = 0;
    this.patternTick = 0;
    this.swingPercent = 50;
    this.quantizeGrid = PPQN / 4; // default 1/16

    // Transport / mode
    this.isPlaying = false;
    this.isRecording = false;
    this.mode = 'pattern'; // 'pattern' | 'song'

    // Song
    this.song = new Song();
    this.songPlaying = false;

    // Auto-repeat: when pattern ends, loop back
    this.autoRepeat = true;

    // Metronome
    this.metronomeEnabled = false;
    this.metronomeVolume = 0.7;
    this.metronomeClick = new MetronomeClick();

    // Setup module state
    this.mixSnapshots = Array.from({ length: 8 }, () => new Float32Array(8).fill(0.75));
    this.dynamicButtons = false;
    this.dynamicAlloc = false;
    this.padModes = new Array(8).fill('tune');
    this._multiBackup = null;
    this.channelAssign = new Uint8Array(8);
    for (let i = 0; i < 8; i++) this.channelAssign[i] = i;

    // Sync / MIDI / time-sig state
    this.syncMode = 1; // 1=internal, 2=midi
    this.midiChannel = 1;
    this.midiMode = 'omni';
    this.timeSig = '4/4';
    this.clickDivisor = 1;

    // Real-time erase: pads currently held in erase mode
    this.erasingPads = new Set();

    // Recording: suppress sequencer playback for pads just recorded this pass
    // Maps pad -> tick that was just recorded, to avoid double-trigger
    this._justRecorded = new Map();

    // Setup handler for setup-module messages
    this.setup = new SetupHandler(this);

    // Gradual tempo ramp state (accelerando / ritardando)
    this._tempoRamp = null; // { targetBpm, bpmPerTick, ticksRemaining }

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------
  _handleMessage(msg) {
    // Delegate setup-module messages
    if (this.setup.handle(msg)) return;

    switch (msg.type) {
      case 'trigger': {
        // If bank specified, load that bank's sample into the voice before triggering
        const bank = msg.bank ?? this.currentBank;
        const slotIdx = bank * NUM_PADS + msg.pad;
        const slot = this.sampleSlots[slotIdx];
        if (slot?.sample) {
          const v = this.voices[msg.pad];
          v.sample = slot.sample;
          v.startPoint = slot.startPoint;
          v.endPoint = slot.endPoint;
          v.loopEnabled = slot.loopEnabled;
          v.loopStart = slot.loopStart;
          v.loopEnd = slot.loopEnd;
          v.reversed = slot.reversed;
          v.pitch = slot.pitch;
          v.decayRate = slot.decayRate;
        }
        this._triggerVoice(msg.pad, msg.velocity ?? 127);
        break;
      }

      case 'stop-voice':
        if (msg.pad >= 0 && msg.pad < NUM_PADS) this.voices[msg.pad].stop();
        break;

      case 'load-sample': {
        const slot = msg.pad;  // pad index already includes bank offset from UI
        if (slot >= 0 && slot < TOTAL_PADS) {
          const buf = new Float32Array(msg.buffer);
          const s = this.sampleSlots[slot];
          s.sample = buf;
          s.startPoint = 0;
          s.endPoint = buf.length - 1;
          s.loopEnd = buf.length - 1;
          // Also load into the voice if it's in the current bank
          const voiceIdx = slot % NUM_PADS;
          if (Math.floor(slot / NUM_PADS) === this.currentBank) {
            this.voices[voiceIdx].loadSample(buf);
          }
        }
        break;
      }

      case 'set-bank':
        this.currentBank = msg.bank;
        // Load current bank's samples into voices
        for (let i = 0; i < NUM_PADS; i++) {
          const s = this.sampleSlots[this.currentBank * NUM_PADS + i];
          if (s.sample) {
            this.voices[i].sample = s.sample;
            this.voices[i].startPoint = s.startPoint;
            this.voices[i].endPoint = s.endPoint;
            this.voices[i].loopEnabled = s.loopEnabled;
            this.voices[i].loopStart = s.loopStart;
            this.voices[i].loopEnd = s.loopEnd;
            this.voices[i].reversed = s.reversed;
            this.voices[i].pitch = s.pitch;
            this.voices[i].decayRate = s.decayRate;
          } else {
            this.voices[i].sample = null;
          }
        }
        break;

      case 'set-param':
        this._setParam(msg.param, msg.pad, msg.value);
        break;

      case 'transport':
        this._handleTransport(msg.action);
        break;

      case 'set-bpm':
        this.clock.setBpm(msg.bpm);
        break;

      case 'set-swing':
        this.swingPercent = Math.max(SWING_MIN, Math.min(SWING_MAX, msg.amount));
        break;

      case 'set-quantize':
        if (msg.grid && typeof msg.grid === 'number') this.quantizeGrid = msg.grid;
        break;

      case 'pattern-select':
        if (msg.number >= 0 && msg.number < MAX_PATTERNS) {
          this.currentPatternIndex = msg.number;
          this.patternTick = 0;
        }
        break;

      case 'step-edit': {
        const p = this.patterns[msg.pattern ?? this.currentPatternIndex];
        if (msg.remove) {
          p.removeEvent(msg.track, msg.tick);
        } else {
          p.addEvent(msg.track, new PatternEvent(msg.tick, msg.velocity ?? 127, msg.pitchOffset ?? 0));
        }
        break;
      }

      case 'query-step-events': {
        const pattern = this.patterns[this.currentPatternIndex];
        const tick = msg.tick;
        const events = pattern.getEventsAtTick(tick);
        this.port.postMessage({
          type: 'step-events',
          tick,
          events: events.map(e => ({ track: e.track, velocity: e.velocity })),
        });
        break;
      }

      case 'song-chain': {
        const songNum = msg.song ?? 0;
        this.song.songs[songNum].steps = [];
        if (Array.isArray(msg.entries)) {
          for (const e of msg.entries) {
            const repeats = e.repeats ?? 1;
            if (repeats > 1) {
              this.song.addStep(songNum, 999, { type: 'repeat-start', value: repeats - 1 });
            }
            this.song.addStep(songNum, 999, { type: 'segment', value: e.pattern });
            if (repeats > 1) {
              this.song.addStep(songNum, 999, { type: 'repeat-end' });
            }
          }
          this.song.addStep(songNum, 999, { type: 'end' });
        }
        break;
      }

      case 'song-add-step':
        this.song.addStep(msg.song, msg.step, { type: msg.stepType, value: msg.value });
        break;

      case 'song-delete-step':
        this.song.deleteStep(msg.song, msg.step);
        break;

      case 'song-set-tempo':
        this.song.setTempo(msg.song, msg.bpm);
        break;

      case 'song-play': {
        this.mode = 'song';
        this.song.start(msg.song);
        this.clock.setBpm(this.song.songs[msg.song].tempo);
        this.isPlaying = true;
        this.isRecording = false;
        this.songPlaying = true;
        this.patternTick = 0;
        this.clock.start();
        const first = this.song.getNextSegment();
        if (first && first.segment !== undefined) {
          this.currentPatternIndex = first.segment;
          this.port.postMessage({ type: 'song-position', ...this.song.getPosition() });
        } else {
          this.isPlaying = false;
          this.songPlaying = false;
          this.clock.stop();
          this.port.postMessage({ type: 'song-end' });
        }
        break;
      }

      case 'set-sync':
        this.syncMode = msg.mode; // 1=internal, 2=midi
        break;

      case 'set-midi-channel':
        this.midiChannel = Math.max(1, Math.min(16, msg.channel));
        break;

      case 'set-midi-mode':
        this.midiMode = msg.mode; // 'omni' | 'poly'
        break;

      case 'set-time-sig':
        this.timeSig = msg.timeSig;
        break;

      case 'set-click-divisor':
        this.clickDivisor = Math.max(1, msg.divisor || 1);
        break;

      case 'song-end-mark':
        this.song.addStep(this.song.currentSong, 999, { type: 'end' });
        this.port.postMessage({ type: 'song-end-mark-set' });
        break;

      case 'song-insert': {
        const songNum = msg.song ?? this.song.currentSong;
        const step = msg.step ?? msg.segment ?? 0;
        this.song.addStep(songNum, step, { type: 'segment', value: step });
        this.port.postMessage({ type: 'song-step-inserted' });
        break;
      }

      case 'song-delete': {
        const songNum = msg.song ?? this.song.currentSong;
        const step = msg.step ?? 0;
        this.song.deleteStep(songNum, step);
        this.port.postMessage({ type: 'song-step-deleted' });
        break;
      }

      case 'set-mode':
        this.mode = msg.mode;
        break;

      case 'auto-repeat':
        this.autoRepeat = !!msg.enabled;
        break;

      case 'set-metronome':
        this.metronomeEnabled = !!msg.enabled;
        break;

      case 'set-metronome-vol':
        this.metronomeVolume = Math.max(0, Math.min(1, msg.vol));
        break;

      case 'song-set-start':
        if (msg.song >= 0 && msg.song < 100) {
          this.song.startStep = msg.step || 0;
        }
        break;

      case 'clear-all':
        for (let i = 0; i < NUM_PADS; i++) { this.voices[i].sample = null; }
        for (let i = 0; i < TOTAL_PADS; i++) { this.sampleSlots[i].sample = null; }
        for (let i = 0; i < MAX_PATTERNS; i++) this.patterns[i] = new Pattern();
        this.port.postMessage({ type: 'all-cleared' });
        break;

      case 'clear-sounds':
        for (let i = 0; i < NUM_PADS; i++) { this.voices[i].sample = null; }
        for (let i = 0; i < TOTAL_PADS; i++) { this.sampleSlots[i].sample = null; }
        this.port.postMessage({ type: 'sounds-cleared' });
        break;

      case 'clear-sequences':
        for (let i = 0; i < MAX_PATTERNS; i++) this.patterns[i] = new Pattern();
        this.port.postMessage({ type: 'sequences-cleared' });
        break;

      case 'query-sample-info': {
        const bank = msg.bank ?? this.currentBank;
        const slotIdx = bank * NUM_PADS + msg.pad;
        const slot = this.sampleSlots[slotIdx];
        this.port.postMessage({
          type: 'sample-info',
          pad: msg.pad,
          bank,
          length: slot.sample ? slot.sample.length : 0,
          startPoint: slot.startPoint,
          endPoint: slot.endPoint,
          loopStart: slot.loopStart,
          loopEnd: slot.loopEnd,
          loopEnabled: slot.loopEnabled,
        });
        break;
      }

      case 'set-default-decay':
        for (let i = 0; i < NUM_PADS; i++) {
          if (this.padModes[i] === 'tune') this.voices[i].setDecay(msg.value / 31);
        }
        break;

      case 'query-full-state': {
        const slots = this.sampleSlots.map((s, i) => ({
          slot: i,
          hasSample: !!s.sample,
          buffer: s.sample ? Array.from(s.sample) : null,
          pitch: s.pitch, decayRate: s.decayRate, reversed: s.reversed,
          loopEnabled: s.loopEnabled, loopStart: s.loopStart, loopEnd: s.loopEnd,
          startPoint: s.startPoint, endPoint: s.endPoint,
          name: s.name || '',
        }));
        const patterns = this.patterns.map(p => p.serialize());
        this.port.postMessage({
          type: 'full-state',
          slots, patterns,
          bpm: this.clock.bpm,
          swing: this.swingPercent,
        });
        break;
      }

      case 'set-sample-name': {
        const slotIdx = (msg.bank ?? this.currentBank) * NUM_PADS + msg.pad;
        if (slotIdx >= 0 && slotIdx < TOTAL_PADS) {
          this.sampleSlots[slotIdx].name = msg.name || '';
        }
        break;
      }

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------
  _handleTransport(action) {
    switch (action) {
      case 'play':
        this.isPlaying = true;
        // Don't clear isRecording — play can be called while record is armed
        if (!this.clock.playing) {
          this.patternTick = 0;
          this.clock.start();
        }
        if (this.mode === 'song') {
          this.songPlaying = true;
          this.song.start(this.song.currentSong);
          this.clock.setBpm(this.song.songs[this.song.currentSong].tempo);
          const firstSeg = this.song.getNextSegment();
          if (firstSeg && firstSeg.segment !== undefined) {
            this.currentPatternIndex = firstSeg.segment;
          } else if (firstSeg && firstSeg.tempoChange) {
            this.clock.setBpm(firstSeg.tempoChange.amount || firstSeg.tempoChange);
          }
        }
        break;

      case 'stop':
        this.isPlaying = false;
        this.isRecording = false;
        this.songPlaying = false;
        this.patternTick = 0;
        this._tempoRamp = null;
        this.erasingPads.clear();
        this._justRecorded.clear();
        this.clock.stop();
        for (const v of this.voices) v.stop();
        break;

      case 'record':
        this.isRecording = true;
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.patternTick = 0;
          this.clock.start();
        }
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Parameter setting
  // -------------------------------------------------------------------------
  _setParam(param, pad, value) {
    if (pad < 0 || pad >= NUM_PADS) return;
    const voice = this.voices[pad];
    const slot = this.sampleSlots[this.currentBank * NUM_PADS + pad];
    switch (param) {
      case 'pitch': {
        // Store for recording; only apply live if not locked by per-note playback
        this._faderPitch = this._faderPitch || new Float64Array(NUM_PADS);
        const pitchRate = BASE_PITCH_STEP * Math.pow(2, value / 12);
        this._faderPitch[pad] = pitchRate;
        slot.pitch = pitchRate;
        if (!voice.perNoteLock) voice.setPitch(pitchRate);
        break;
      }
      case 'volume':
        this._faderVolume = this._faderVolume || new Float64Array(NUM_PADS);
        this._faderVolume[pad] = value;
        if (!voice.perNoteLock) this.mixer.setVolume(pad, value);
        break;
      case 'pan':
        this.mixer.setPan(pad, value);
        break;
      case 'decay': {
        this._faderDecay = this._faderDecay || new Float64Array(NUM_PADS);
        this._faderDecay[pad] = value;
        slot.decayRate = voice.decayRate; // store after computing
        if (!voice.perNoteLock) voice.setDecay(value);
        slot.decayRate = voice.decayRate; // update after setDecay
        break;
      }
      case 'reverse':
        voice.setReversed(!!value);
        slot.reversed = !!value;
        break;
      case 'loop':
        voice.setLoop(!!value);
        slot.loopEnabled = !!value;
        break;
      case 'truncate':
        if (value && typeof value === 'object') {
          voice.setTruncate(value.start, value.end);
          slot.startPoint = value.start;
          slot.endPoint = value.end;
        }
        break;
      case 'filter-cutoff':
        if (FILTER_DYNAMIC.includes(pad)) {
          this.dynamicFilters[FILTER_DYNAMIC.indexOf(pad)].setCutoff(value);
        }
        break;
      case 'filter-resonance':
        if (FILTER_DYNAMIC.includes(pad)) {
          this.dynamicFilters[FILTER_DYNAMIC.indexOf(pad)].setResonance(value);
        }
        break;
      case 'gain':
        this.inputGain = value * 2;
        break;
      case 'mix-volume':
        this.mixer.masterVolume = Math.max(0, Math.min(1, value));
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Trigger a voice (also used from sequencer)
  // -------------------------------------------------------------------------
  _triggerVoice(pad, velocity, fromSequencer = false, eventParams = null) {
    if (pad < 0 || pad >= NUM_PADS) return;
    const voice = this.voices[pad];

    if (fromSequencer && eventParams) {
      // Load sample from recorded slot (may be a different bank)
      if (eventParams.slot !== null) {
        const s = this.sampleSlots[eventParams.slot];
        if (s?.sample) {
          voice.sample = s.sample;
          voice.startPoint = s.startPoint;
          voice.endPoint = s.endPoint;
          voice.loopEnabled = s.loopEnabled;
          voice.loopStart = s.loopStart;
          voice.loopEnd = s.loopEnd;
          voice.reversed = s.reversed;
        }
      }
      // Apply per-note params and lock so faders don't overwrite
      if (eventParams.pitch !== null) voice.pitch = eventParams.pitch;
      if (eventParams.decay !== null) voice.decayRate = eventParams.decay;
      if (eventParams.mixVolume !== null) this.mixer.setVolume(pad, eventParams.mixVolume);
      voice.perNoteLock = true;
    } else {
      // Manual trigger — unlock so faders work normally
      voice.perNoteLock = false;
    }

    // Dynamic allocation: steal an inactive voice to continue the current sound
    if (this.dynamicAlloc && voice.active) {
      for (let i = 0; i < NUM_PADS; i++) {
        if (i !== pad && !this.voices[i].active) {
          const steal = this.voices[i];
          steal.sample = voice.sample;
          steal.position = voice.position;
          steal.velocity = voice.velocity;
          steal.decayLevel = voice.decayLevel;
          steal.decayRate = voice.decayRate;
          steal.pitch = voice.pitch;
          steal.reversed = voice.reversed;
          steal.startPoint = voice.startPoint;
          steal.endPoint = voice.endPoint;
          steal.active = true;
          break;
        }
      }
    }

    voice.trigger(velocity);
    this.port.postMessage({ type: 'trigger-visual', pad, velocity });

    if (!fromSequencer && this.isRecording && this.isPlaying) {
      const pattern = this.patterns[this.currentPatternIndex];
      let quantizedTick = this.patternTick;
      if (this.quantizeGrid > 1) {
        quantizedTick = Math.round(this.patternTick / this.quantizeGrid) * this.quantizeGrid;
      }
      const totalTicks = pattern.bars * PPQN * 4;
      quantizedTick = quantizedTick % totalTicks;

      // Capture current state as per-note params
      const params = {
        slot: this.currentBank * NUM_PADS + pad,
        pitch: this._faderPitch?.[pad] ?? this.voices[pad].pitch,
        decay: this.voices[pad].decayRate,
        mixVolume: this._faderVolume?.[pad] ?? this.mixer.channels[pad].volume,
      };
      pattern.addEvent(pad, new PatternEvent(quantizedTick, velocity, 0, params));

      // Mark this pad+tick so the sequencer won't double-trigger it
      this._justRecorded.set(pad, quantizedTick);
    }
  }

  // -------------------------------------------------------------------------
  // Sequencer tick processing
  // -------------------------------------------------------------------------
  _processTick(clockTick) {
    if (this._tempoRamp) {
      this.clock.setBpm(this.clock.bpm + this._tempoRamp.bpmPerTick);
      this._tempoRamp.ticksRemaining--;
      if (this._tempoRamp.ticksRemaining <= 0) {
        this.clock.setBpm(this._tempoRamp.targetBpm);
        this._tempoRamp = null;
      }
    }

    let patternIndex = this.currentPatternIndex;
    if (this.mode === 'song' && this.songPlaying) {
      patternIndex = this.song.currentPattern();
      if (patternIndex < 0) {
        this.isPlaying = false;
        this.songPlaying = false;
        this.clock.stop();
        this.port.postMessage({ type: 'song-end' });
        return;
      }
    }

    const pattern = this.patterns[patternIndex];
    const swungTick = applySwing(this.patternTick, this.swingPercent);

    // Real-time erase: remove events for held pads near current tick
    if (this.erasingPads.size > 0) {
      const window = Math.max(1, this.quantizeGrid);
      for (const pad of this.erasingPads) {
        const track = pattern.tracks[pad];
        track.events = track.events.filter(
          e => Math.abs(e.tick - this.patternTick) > window
        );
      }
    }

    const events = pattern.getEventsAtTick(swungTick);
    for (const ev of events) {
      // Skip events that were just live-recorded to avoid double-trigger
      if (this.isRecording && this._justRecorded.has(ev.track) &&
          this._justRecorded.get(ev.track) === swungTick) {
        this._justRecorded.delete(ev.track);
        continue;
      }
      const evParams = (ev.slot !== null || ev.pitch !== null || ev.decay !== null || ev.mixVolume !== null)
        ? { slot: ev.slot ?? null, pitch: ev.pitch ?? null, decay: ev.decay ?? null, mixVolume: ev.mixVolume ?? null }
        : null;
      this._triggerVoice(ev.track, ev.velocity, true, evParams);
    }

    // Metronome click on quarter-note boundaries
    if (this.metronomeEnabled && this.patternTick % PPQN === 0) {
      const beatInBar = (this.patternTick / PPQN) % 4;
      this.metronomeClick.trigger(beatInBar === 0);
    }

    // Post tick position — use patternTick so bar/beat wraps at segment length
    const pos = this.clock.getPosition(this.patternTick);
    if (pos.sixteenth === 0 || this.patternTick === 0) {
      this.port.postMessage({
        type: 'tick',
        ...pos,
        patternTick: this.patternTick,
        patternIndex,
      });
    }

    // Advance pattern tick
    this.patternTick++;

    if (this.patternTick >= pattern.totalTicks) {
      this.patternTick = 0;
      this._justRecorded.clear();
      this.port.postMessage({ type: 'pattern-end', patternIndex });

      if (this.mode === 'song' && this.songPlaying) {
        let next = this.song.getNextSegment();
        while (next !== null && next.segment === undefined) {
          if (next.tempoChange) {
            const tc = next.tempoChange;
            if (typeof tc === 'number') {
              this.clock.setBpm(tc);
            } else if (tc.beats && tc.beats > 0) {
              const totalTicks = tc.beats * PPQN;
              const currentBpm = this.clock.bpm;
              const delta = tc.direction === 'accel' ? tc.amount : -tc.amount;
              this._tempoRamp = {
                targetBpm: Math.max(BPM_MIN, Math.min(BPM_MAX, currentBpm + delta)),
                bpmPerTick: delta / totalTicks,
                ticksRemaining: totalTicks,
              };
            } else {
              const delta = tc.direction === 'accel' ? (tc.amount || 0) : -(tc.amount || 0);
              this.clock.setBpm(Math.max(BPM_MIN, Math.min(BPM_MAX, this.clock.bpm + delta)));
            }
          } else if (next.mixChange !== undefined) {
            const slot = next.mixChange;
            if (slot >= 0 && slot < 8) {
              for (let ch = 0; ch < NUM_PADS; ch++) {
                this.mixer.setVolume(ch, this.mixSnapshots[slot][ch]);
              }
            }
          } else if (next.trigger) {
            const t = next.trigger;
            this._triggerVoice(t.pad, t.velocity ?? 127);
          }
          next = this.song.getNextSegment();
        }

        if (next === null) {
          this.isPlaying = false;
          this.songPlaying = false;
          this.clock.stop();
          this.port.postMessage({ type: 'song-end' });
          return;
        }
        this.currentPatternIndex = next.segment;
        this.port.postMessage({ type: 'song-position', ...this.song.getPosition() });
      } else if (!this.autoRepeat) {
        this.isPlaying = false;
        this.clock.stop();
      }
    }
  }

  // -------------------------------------------------------------------------
  // AudioWorkletProcessor.process()
  // -------------------------------------------------------------------------
  process(_inputs, outputs) {
    const output = outputs[0];
    const leftOut = output[0];
    const rightOut = output[1];

    for (let i = 0; i < leftOut.length; i++) {
      const newTick = this.clock.advance();
      if (newTick !== null && this.isPlaying) {
        this._processTick(newTick);
      }

      const voiceOutputs = new Array(NUM_PADS);
      for (let v = 0; v < NUM_PADS; v++) {
        let sample = this.voices[v].process();

        if (FILTER_DYNAMIC.includes(v)) {
          const fi = FILTER_DYNAMIC.indexOf(v);
          sample = this.dynamicFilters[fi].process(sample);
        } else if (v >= 2 && v <= 5) {
          const fi = v - 2;
          sample = this.fixedFilters[fi].process(sample);
        }

        voiceOutputs[v] = sample;
      }

      const [left, right] = this.mixer.process(voiceOutputs);
      const metroSample = this.metronomeClick.process() * this.metronomeVolume;
      leftOut[i] = left * this.mixer.masterVolume + metroSample;
      rightOut[i] = right * this.mixer.masterVolume + metroSample;
    }

    return true;
  }
}

registerProcessor('sp1200-processor', SP1200Processor);

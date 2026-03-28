/**
 * SP-1200 AudioWorklet Processor
 * Uses ES module imports — Vite dev server resolves them for the AudioWorklet context.
 */

import { PPQN, NUM_PADS, MAX_PATTERNS, BPM_MIN, BPM_MAX, SWING_MIN, SWING_MAX, FILTER_DYNAMIC, BASE_PITCH_STEP } from '../constants.js';
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

    // Voices: 8 voices (one per pad)
    this.voices = Array.from({ length: NUM_PADS }, (_, i) => new Voice(i));

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

    // Setup handler for setup-module messages
    this.setup = new SetupHandler(this);

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------
  _handleMessage(msg) {
    // Delegate setup-module messages
    if (this.setup.handle(msg)) return;

    switch (msg.type) {
      case 'trigger':
        this._triggerVoice(msg.pad, msg.velocity ?? 127);
        break;

      case 'stop-voice':
        if (msg.pad >= 0 && msg.pad < NUM_PADS) this.voices[msg.pad].stop();
        break;

      case 'load-sample': {
        const pad = msg.pad;
        if (pad >= 0 && pad < NUM_PADS) {
          const buf = new Float32Array(msg.buffer);
          this.voices[pad].loadSample(buf);
        }
        break;
      }

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
        for (let i = 0; i < MAX_PATTERNS; i++) this.patterns[i] = new Pattern();
        this.port.postMessage({ type: 'all-cleared' });
        break;

      case 'clear-sounds':
        for (let i = 0; i < NUM_PADS; i++) { this.voices[i].sample = null; }
        this.port.postMessage({ type: 'sounds-cleared' });
        break;

      case 'clear-sequences':
        for (let i = 0; i < MAX_PATTERNS; i++) this.patterns[i] = new Pattern();
        this.port.postMessage({ type: 'sequences-cleared' });
        break;

      case 'set-default-decay':
        for (let i = 0; i < NUM_PADS; i++) {
          if (this.padModes[i] === 'tune') this.voices[i].setDecay(msg.value / 31);
        }
        break;

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
        this.isRecording = false;
        this.patternTick = 0;
        this.clock.start();
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
        this.clock.stop();
        for (const v of this.voices) v.stop();
        break;

      case 'record':
        this.isPlaying = true;
        this.isRecording = true;
        this.patternTick = 0;
        this.clock.start();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Parameter setting
  // -------------------------------------------------------------------------
  _setParam(param, pad, value) {
    if (pad < 0 || pad >= NUM_PADS) return;
    const voice = this.voices[pad];
    switch (param) {
      case 'pitch':
        voice.setPitch(BASE_PITCH_STEP * Math.pow(2, value / 12));
        break;
      case 'volume':
        this.mixer.setVolume(pad, value);
        break;
      case 'pan':
        this.mixer.setPan(pad, value);
        break;
      case 'decay':
        voice.setDecay(value);
        break;
      case 'reverse':
        voice.setReversed(!!value);
        break;
      case 'loop':
        voice.setLoop(!!value);
        break;
      case 'truncate':
        if (value && typeof value === 'object') voice.setTruncate(value.start, value.end);
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
  _triggerVoice(pad, velocity, fromSequencer = false) {
    if (pad < 0 || pad >= NUM_PADS) return;
    this.voices[pad].trigger(velocity);
    this.port.postMessage({ type: 'trigger-visual', pad, velocity });

    if (!fromSequencer && this.isRecording && this.isPlaying) {
      const pattern = this.patterns[this.currentPatternIndex];
      let quantizedTick = this.patternTick;
      if (this.quantizeGrid > 1) {
        quantizedTick = Math.round(this.patternTick / this.quantizeGrid) * this.quantizeGrid;
      }
      const totalTicks = pattern.bars * PPQN * 4;
      quantizedTick = quantizedTick % totalTicks;
      pattern.addEvent(pad, new PatternEvent(quantizedTick, velocity));
    }
  }

  // -------------------------------------------------------------------------
  // Sequencer tick processing
  // -------------------------------------------------------------------------
  _processTick(clockTick) {
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

    const events = pattern.getEventsAtTick(swungTick);
    for (const ev of events) {
      this._triggerVoice(ev.track, ev.velocity, true);
    }

    // Metronome click on quarter-note boundaries
    if (this.metronomeEnabled && this.patternTick % PPQN === 0) {
      const beatInBar = (this.patternTick / PPQN) % 4;
      this.metronomeClick.trigger(beatInBar === 0);
    }

    // Post tick position
    const pos = this.clock.getPosition(clockTick);
    this.port.postMessage({
      type: 'tick',
      ...pos,
      patternTick: this.patternTick,
      patternIndex,
    });

    // Advance pattern tick
    this.patternTick++;

    if (this.patternTick >= pattern.totalTicks) {
      this.patternTick = 0;
      this.port.postMessage({ type: 'pattern-end', patternIndex });

      if (this.mode === 'song' && this.songPlaying) {
        let next = this.song.getNextSegment();
        while (next !== null && next.segment === undefined) {
          if (next.tempoChange) {
            const tc = next.tempoChange;
            this.clock.setBpm(typeof tc === 'number' ? tc : (tc.amount || this.clock.bpm));
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

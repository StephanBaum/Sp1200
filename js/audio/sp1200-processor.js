/**
 * SP-1200 AudioWorklet Processor
 * Self-contained — no ES module imports (AudioWorklet restriction).
 * All DSP logic is inlined from the reference implementations in js/dsp/ and js/sequencer/.
 */

// ---------------------------------------------------------------------------
// Constants (from js/constants.js)
// ---------------------------------------------------------------------------
const SP_SAMPLE_RATE = 26040;
const OUTPUT_SAMPLE_RATE = 44100;
const NUM_PADS = 8;
const PPQN = 96;
const MAX_PATTERNS = 99;
const MAX_SONG_ENTRIES = 99;
const BPM_MIN = 30;
const BPM_MAX = 250;
const BPM_DEFAULT = 90;
const SWING_MIN = 50;
const SWING_MAX = 75;
const FILTER_DYNAMIC = [0, 1];
const FILTER_FIXED = [2, 3, 4, 5];
// FILTER_NONE = [6, 7]

// ---------------------------------------------------------------------------
// Metronome Click Generator
// ---------------------------------------------------------------------------
class MetronomeClick {
  constructor() {
    this.counter = 0;
    this.length = 200; // ~5ms at 44100Hz
    this.frequency = 1000;
    this.active = false;
    this.phase = 0;
  }
  trigger(isDownbeat) {
    this.frequency = isDownbeat ? 1000 : 800;
    this.counter = 0;
    this.active = true;
    this.phase = 0;
  }
  process() {
    if (!this.active) return 0;
    if (this.counter >= this.length) {
      this.active = false;
      return 0;
    }
    const sample = Math.sin(this.phase * 2 * Math.PI);
    this.phase += this.frequency / 44100;
    // Apply a quick fade-out envelope to avoid clicks at the end
    const envelope = 1 - (this.counter / this.length);
    this.counter++;
    return sample * envelope;
  }
}

// ---------------------------------------------------------------------------
// Voice (from js/dsp/voice.js)
// ---------------------------------------------------------------------------
class Voice {
  constructor(channelIndex) {
    this.channelIndex = channelIndex;
    this.sample = null;
    this.active = false;
    this.position = 0;
    this.velocity = 0;
    this.pitch = 1.0;
    this.decayRate = 1.0;
    this.decayLevel = 1.0;
    this.reversed = false;
    this.loopEnabled = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.startPoint = 0;
    this.endPoint = 0;
  }
  loadSample(buffer) {
    this.sample = buffer;
    this.startPoint = 0;
    this.endPoint = buffer.length - 1;
    this.loopEnd = buffer.length - 1;
  }
  trigger(velocity) {
    if (!this.sample) return;
    this.active = true;
    this.velocity = velocity / 127;
    this.decayLevel = 1.0;
    this.position = this.reversed ? this.endPoint : this.startPoint;
  }
  stop() {
    this.active = false;
    this.position = 0;
  }
  setPitch(rate) { this.pitch = rate; }
  setDecay(amount) {
    if (amount < 1) {
      this.decayRate = 0.995 + (amount * 0.005);
    } else {
      this.decayRate = 1.0;
    }
  }
  setReversed(reversed) { this.reversed = reversed; }
  setLoop(enabled, start = 0, end = 0) {
    this.loopEnabled = enabled;
    if (enabled) { this.loopStart = start; this.loopEnd = end; }
  }
  setTruncate(start, end) { this.startPoint = start; this.endPoint = end; }
  process() {
    if (!this.active || !this.sample) return 0;
    const index = Math.floor(this.position);
    if (this.reversed) {
      if (index < this.startPoint) {
        if (this.loopEnabled) { this.position = this.loopEnd; } else { this.active = false; return 0; }
      }
    } else {
      if (index > this.endPoint) {
        if (this.loopEnabled) { this.position = this.loopStart; } else { this.active = false; return 0; }
      }
    }
    const safeIndex = Math.max(0, Math.min(Math.floor(this.position), this.sample.length - 1));
    const raw = this.sample[safeIndex];
    const out = raw * this.velocity * this.decayLevel;
    this.position += this.reversed ? -this.pitch : this.pitch;
    this.decayLevel *= this.decayRate;
    if (this.decayLevel < 0.001) this.active = false;
    return out;
  }
}

// ---------------------------------------------------------------------------
// SSM2044 Filter — 4-pole ladder (from js/dsp/filters.js)
// ---------------------------------------------------------------------------
class SSM2044Filter {
  constructor(cutoff = 10000, resonance = 0) {
    this.cutoff = cutoff;
    this.resonance = resonance;
    this.sampleRate = SP_SAMPLE_RATE;
    this.s = [0, 0, 0, 0];
    this._updateCoefficients();
  }
  _updateCoefficients() {
    const fc = Math.max(20, Math.min(this.cutoff, this.sampleRate * 0.49));
    this.g = Math.tan(Math.PI * fc / this.sampleRate);
  }
  setCutoff(cutoff) { this.cutoff = cutoff; this._updateCoefficients(); }
  setResonance(resonance) { this.resonance = Math.max(0, Math.min(resonance, 4)); }
  process(input) {
    let x = input - this.resonance * Math.tanh(this.s[3]);
    const g = this.g;
    const denom = 1 + g;
    for (let i = 0; i < 4; i++) {
      const y = (g * x + this.s[i]) / denom;
      this.s[i] = 2 * y - this.s[i];
      x = y;
    }
    return x;
  }
  reset() { this.s = [0, 0, 0, 0]; }
}

// ---------------------------------------------------------------------------
// Fixed Filter — 2-pole (from js/dsp/filters.js)
// ---------------------------------------------------------------------------
class FixedFilter {
  constructor(cutoff = 8000) {
    this.sampleRate = SP_SAMPLE_RATE;
    this.s = [0, 0];
    const fc = Math.max(20, Math.min(cutoff, this.sampleRate * 0.49));
    this.g = Math.tan(Math.PI * fc / this.sampleRate);
  }
  process(input) {
    let x = input;
    const g = this.g;
    const denom = 1 + g;
    for (let i = 0; i < 2; i++) {
      const y = (g * x + this.s[i]) / denom;
      this.s[i] = 2 * y - this.s[i];
      x = y;
    }
    return x;
  }
  reset() { this.s = [0, 0]; }
}

// ---------------------------------------------------------------------------
// Mixer (from js/dsp/mixer.js)
// ---------------------------------------------------------------------------
class Mixer {
  constructor() {
    this.masterVolume = 0.75;
    this.channels = Array.from({ length: NUM_PADS }, () => ({
      volume: 1.0,
      pan: 0,
      gainL: Math.SQRT1_2,
      gainR: Math.SQRT1_2,
    }));
  }
  setVolume(channel, volume) {
    this.channels[channel].volume = Math.max(0, Math.min(1, volume));
  }
  setPan(channel, pan) {
    const ch = this.channels[channel];
    ch.pan = Math.max(-1, Math.min(1, pan));
    const angle = (ch.pan + 1) * Math.PI / 4;
    ch.gainL = Math.cos(angle);
    ch.gainR = Math.sin(angle);
  }
  process(inputs) {
    let left = 0, right = 0;
    for (let i = 0; i < NUM_PADS; i++) {
      const signal = inputs[i] * this.channels[i].volume;
      left += signal * this.channels[i].gainL;
      right += signal * this.channels[i].gainR;
    }
    return [left, right];
  }
}

// ---------------------------------------------------------------------------
// Clock (from js/sequencer/clock.js)
// ---------------------------------------------------------------------------
class Clock {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.bpm = BPM_DEFAULT;
    this.samplesPerTick = 0;
    this.sampleCounter = 0;
    this.tick = 0;
    this.playing = false;
    this._calcSamplesPerTick();
  }
  _calcSamplesPerTick() {
    this.samplesPerTick = (this.sampleRate * 60) / (this.bpm * PPQN);
  }
  setBpm(bpm) {
    this.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
    this._calcSamplesPerTick();
  }
  start() { this.playing = true; this.tick = 0; this.sampleCounter = 0; }
  stop() { this.playing = false; this.tick = 0; this.sampleCounter = 0; }
  advance() {
    if (!this.playing) return null;
    this.sampleCounter++;
    const nextTickAt = Math.floor((this.tick + 1) * this.samplesPerTick);
    if (this.sampleCounter >= nextTickAt) { this.tick++; return this.tick; }
    return null;
  }
  getPosition(tick) {
    const ticksPerBeat = PPQN;
    const ticksPerBar = PPQN * 4;
    const ticksPer16th = PPQN / 4;
    const bar = Math.floor(tick / ticksPerBar);
    const beatTick = tick % ticksPerBar;
    const beat = Math.floor(beatTick / ticksPerBeat);
    const sixteenthTick = beatTick % ticksPerBeat;
    const sixteenth = Math.floor(sixteenthTick / ticksPer16th);
    return { bar, beat, sixteenth, tick };
  }
}

// ---------------------------------------------------------------------------
// Swing helpers (from js/sequencer/swing.js)
// ---------------------------------------------------------------------------
const TICKS_PER_16TH = PPQN / 4;

function getSwingOffset(tick, swingPercent) {
  if (swingPercent <= 50) return 0;
  const sixteenthIndex = Math.floor(tick / TICKS_PER_16TH);
  const posInSixteenth = tick % TICKS_PER_16TH;
  if (sixteenthIndex % 2 === 0 || posInSixteenth !== 0) return 0;
  const swingAmount = (swingPercent - 50) / 25;
  return Math.round(TICKS_PER_16TH * swingAmount * 0.5);
}

function applySwing(tick, swingPercent) {
  return tick + getSwingOffset(tick, swingPercent);
}

// ---------------------------------------------------------------------------
// Pattern (from js/sequencer/pattern.js)
// ---------------------------------------------------------------------------
class PatternEvent {
  constructor(tick, velocity = 127, pitchOffset = 0) {
    this.tick = tick;
    this.velocity = velocity;
    this.pitchOffset = pitchOffset;
  }
}

class Track {
  constructor() { this.events = []; }
  addEvent(event) { this.events.push(event); this.events.sort((a, b) => a.tick - b.tick); }
  removeEventAtTick(tick) {
    const idx = this.events.findIndex(e => e.tick === tick);
    if (idx !== -1) this.events.splice(idx, 1);
  }
  clear() { this.events = []; }
  getEventsAtTick(tick) { return this.events.filter(e => e.tick === tick); }
}

class Pattern {
  constructor() {
    this.bars = 2; // SP-1200 default is 2 bars
    this.totalTicks = PPQN * 4 * 2;
    this.tracks = Array.from({ length: NUM_PADS }, () => new Track());
  }
  setBars(bars) {
    this.bars = Math.max(1, Math.min(99, bars));
    this.totalTicks = PPQN * 4 * this.bars;
  }
  addEvent(trackIndex, event) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].addEvent(event);
  }
  removeEvent(trackIndex, tick) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].removeEventAtTick(tick);
  }
  getEventsAtTick(tick) {
    const results = [];
    for (let i = 0; i < NUM_PADS; i++) {
      for (const e of this.tracks[i].getEventsAtTick(tick)) results.push({ track: i, ...e });
    }
    return results;
  }
  quantizeTick(tick, gridSize) { return Math.round(tick / gridSize) * gridSize; }
  clearTrack(trackIndex) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].clear();
  }
  clear() { for (const track of this.tracks) track.clear(); }
}

// ---------------------------------------------------------------------------
// Song (from js/sequencer/song.js)
// 100 songs (0-99), each with up to 99 steps.
// Step types: segment, end, tempo-change, mix-change, sub-song,
//             repeat-start, repeat-end, trigger
// ---------------------------------------------------------------------------
class Song {
  constructor() {
    this.songs = Array.from({ length: 100 }, () => ({
      steps: [],
      tempo: 120,
    }));
    this.currentSong = 0;
    this.currentStep = 0;
    this.repeatStack = [];
  }

  addStep(songNum, stepIndex, stepData) {
    // stepData: { type: 'segment'|'end'|'tempo-change'|'mix-change'|'sub-song'|'repeat-start'|'repeat-end'|'trigger', value: ... }
    if (songNum < 0 || songNum >= 100) return;
    const song = this.songs[songNum];
    if (song.steps.length >= MAX_SONG_ENTRIES) return;
    if (stepIndex >= song.steps.length) {
      song.steps.push(stepData);
    } else {
      song.steps.splice(stepIndex, 0, stepData);
    }
  }

  deleteStep(songNum, stepIndex) {
    if (songNum < 0 || songNum >= 100) return;
    const song = this.songs[songNum];
    if (stepIndex >= 0 && stepIndex < song.steps.length) {
      song.steps.splice(stepIndex, 1);
    }
  }

  setTempo(songNum, bpm) {
    if (songNum < 0 || songNum >= 100) return;
    this.songs[songNum].tempo = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
  }

  start(songNum) {
    if (songNum >= 0 && songNum < 100) this.currentSong = songNum;
    this.currentStep = 0;
    this.repeatStack = [];
  }

  getNextSegment() {
    // Returns the next actionable item, or null if song ended
    const song = this.songs[this.currentSong];
    while (this.currentStep < song.steps.length) {
      const step = song.steps[this.currentStep];
      this.currentStep++;

      switch (step.type) {
        case 'segment':
          return { segment: step.value };
        case 'end':
          return null; // song ended
        case 'tempo-change':
          return { tempoChange: step.value }; // { accel: true/false, amount: bpm, beats: duration }
        case 'mix-change':
          return { mixChange: step.value }; // slot number
        case 'trigger':
          return { trigger: step.value }; // { pad, velocity }
        case 'sub-song':
          // Push current position, play sub-song inline
          this.repeatStack.push({ song: this.currentSong, step: this.currentStep });
          this.currentSong = step.value;
          this.currentStep = 0;
          return this.getNextSegment();
        case 'repeat-start':
          this.repeatStack.push({
            song: this.currentSong,
            step: this.currentStep,
            count: step.value || 1,
          });
          continue;
        case 'repeat-end': {
          if (this.repeatStack.length > 0) {
            const top = this.repeatStack[this.repeatStack.length - 1];
            if (top.count !== undefined && top.count > 0) {
              top.count--;
              this.currentStep = top.step;
            } else {
              this.repeatStack.pop();
            }
          }
          continue;
        }
        default:
          continue;
      }
    }

    // Check if we're in a sub-song and need to return to parent
    if (this.repeatStack.length > 0) {
      const parent = this.repeatStack.pop();
      this.currentSong = parent.song;
      this.currentStep = parent.step;
      return this.getNextSegment();
    }

    return null; // song ended
  }

  // Legacy compat: return current segment index or -1 if finished
  currentPattern() {
    const song = this.songs[this.currentSong];
    if (this.currentStep >= song.steps.length) return -1;
    // Peek at current step — if it's a segment, return its value
    const step = song.steps[this.currentStep];
    return step && step.type === 'segment' ? step.value : -1;
  }

  // Legacy compat: advance after a segment finishes playing
  advanceRepeat() {
    this.getNextSegment();
  }

  isFinished() {
    const song = this.songs[this.currentSong];
    return this.currentStep >= song.steps.length && this.repeatStack.length === 0;
  }

  getPosition() {
    return {
      songIndex: this.currentSong,
      stepIndex: this.currentStep,
      pattern: this.currentPattern(),
    };
  }

  reset() {
    this.currentStep = 0;
    this.repeatStack = [];
  }
}

// ---------------------------------------------------------------------------
// Nearest-neighbour pitch resampler ratio: SP rate → output rate
// The voice works at SP_SAMPLE_RATE internally; we need to step through it
// at a rate of SP_SAMPLE_RATE / OUTPUT_SAMPLE_RATE per output sample.
// A pitch of 1.0 means: playback at original pitch through the output DAC.
// ---------------------------------------------------------------------------
const BASE_PITCH_STEP = SP_SAMPLE_RATE / OUTPUT_SAMPLE_RATE;

// ---------------------------------------------------------------------------
// SP1200Processor
// ---------------------------------------------------------------------------
class SP1200Processor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    // Voices: 8 voices (one per pad)
    this.voices = Array.from({ length: NUM_PADS }, (_, i) => new Voice(i));

    // Filters: ch 0–1 → SSM2044 (wider cutoff for fuller bass), ch 2–5 → FixedFilter, ch 6–7 → none
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
    this.patternTick = 0;       // position within the active pattern
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

    // Pending events scheduled (tick → [{pad, velocity}])
    this._pendingEvents = new Map();

    // Setup module state
    this.mixSnapshots = Array.from({ length: 8 }, () => new Float32Array(8).fill(0.75));
    this.dynamicButtons = false;
    this.padModes = new Array(8).fill('tune'); // 'tune' or 'decay' per pad
    this._multiBackup = null; // backup before multi-pitch/multi-level
    this.channelAssign = new Uint8Array(8); // output routing per pad (0-7)
    for (let i = 0; i < 8; i++) this.channelAssign[i] = i;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------
  _handleMessage(msg) {
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
        // { pattern, track, tick, velocity, pitchOffset, remove }
        const p = this.patterns[msg.pattern ?? this.currentPatternIndex];
        if (msg.remove) {
          p.removeEvent(msg.track, msg.tick);
        } else {
          p.addEvent(msg.track, new PatternEvent(msg.tick, msg.velocity ?? 127, msg.pitchOffset ?? 0));
        }
        break;
      }

      case 'song-chain': {
        // Legacy: { entries: [{pattern, repeats}] } — converts to new step format
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

      case 'song-add-step': {
        // { song, step, stepType, value }
        this.song.addStep(msg.song, msg.step, { type: msg.stepType, value: msg.value });
        break;
      }

      case 'song-delete-step': {
        // { song, step }
        this.song.deleteStep(msg.song, msg.step);
        break;
      }

      case 'song-set-tempo': {
        // { song, bpm }
        this.song.setTempo(msg.song, msg.bpm);
        break;
      }

      case 'song-play': {
        // { song } — start playing a song from step 0
        this.mode = 'song';
        this.song.start(msg.song);
        this.clock.setBpm(this.song.songs[msg.song].tempo);
        this.isPlaying = true;
        this.isRecording = false;
        this.songPlaying = true;
        this.patternTick = 0;
        this.clock.start();
        // Advance to the first segment
        const first = this.song.getNextSegment();
        if (first && first.segment !== undefined) {
          this.currentPatternIndex = first.segment;
          this.port.postMessage({ type: 'song-position', ...this.song.getPosition() });
        } else {
          // Empty or immediate end
          this.isPlaying = false;
          this.songPlaying = false;
          this.clock.stop();
          this.port.postMessage({ type: 'song-end' });
        }
        break;
      }

      case 'set-mode':
        this.mode = msg.mode; // 'pattern' | 'song'
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

      // -------------------------------------------------------------------
      // Setup module messages (functions 11–25)
      // -------------------------------------------------------------------

      case 'multi-pitch': {
        // Copy sample from source pad to all 8 pads at different pitch offsets
        const src = msg.pad;
        if (src >= 0 && src < NUM_PADS && this.voices[src].sample) {
          // Backup current state before multi-mode
          this._multiBackup = this.voices.map(v => ({
            sample: v.sample,
            pitch: v.pitch,
            velocity: v.velocity,
          }));
          const sampleRef = this.voices[src].sample;
          for (let i = 0; i < NUM_PADS; i++) {
            this.voices[i].loadSample(sampleRef);
            // Spread across pads: pad0 = -8, pad1 = -6, ... pad7 = +6 semitones
            // (15 semitone range / 7 intervals ≈ 2 semitones per pad)
            const semitones = -8 + (i * 15 / 7); // linear spread -8 to +7
            this.voices[i].setPitch(BASE_PITCH_STEP * Math.pow(2, semitones / 12));
          }
          this.port.postMessage({ type: 'multi-pitch-active', sourcePad: src });
        }
        break;
      }

      case 'multi-level': {
        // Copy sample from source pad to all 8 pads at different volume levels
        const src = msg.pad;
        if (src >= 0 && src < NUM_PADS && this.voices[src].sample) {
          this._multiBackup = this.voices.map(v => ({
            sample: v.sample,
            pitch: v.pitch,
            velocity: v.velocity,
          }));
          const sampleRef = this.voices[src].sample;
          for (let i = 0; i < NUM_PADS; i++) {
            this.voices[i].loadSample(sampleRef);
            this.voices[i].setPitch(BASE_PITCH_STEP); // normal pitch
            // Volume levels: 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0
            this.mixer.setVolume(i, (i + 1) / NUM_PADS);
          }
          this.port.postMessage({ type: 'multi-level-active', sourcePad: src });
        }
        break;
      }

      case 'exit-multi': {
        // Restore original voice state from before multi-pitch/multi-level
        if (this._multiBackup) {
          for (let i = 0; i < NUM_PADS; i++) {
            const bk = this._multiBackup[i];
            if (bk.sample) {
              this.voices[i].loadSample(bk.sample);
            } else {
              this.voices[i].sample = null;
            }
            this.voices[i].pitch = bk.pitch;
          }
          this._multiBackup = null;
          this.port.postMessage({ type: 'multi-exit' });
        }
        break;
      }

      case 'dynamic-buttons':
        this.dynamicButtons = !!msg.enabled;
        this.port.postMessage({ type: 'dynamic-buttons', enabled: this.dynamicButtons });
        break;

      case 'define-mix': {
        // Save current mixer volumes to a snapshot slot (0-7)
        const slot = msg.slot;
        if (slot >= 0 && slot < 8) {
          for (let i = 0; i < NUM_PADS; i++) {
            this.mixSnapshots[slot][i] = this.mixer.channels[i].volume;
          }
          this.port.postMessage({ type: 'mix-defined', slot });
        }
        break;
      }

      case 'select-mix': {
        // Restore mixer volumes from a snapshot slot (0-7)
        const slot = msg.slot;
        if (slot >= 0 && slot < 8) {
          for (let i = 0; i < NUM_PADS; i++) {
            this.mixer.setVolume(i, this.mixSnapshots[slot][i]);
          }
          this.port.postMessage({ type: 'mix-selected', slot });
        }
        break;
      }

      case 'channel-assign': {
        // Set output routing for a pad (0-7)
        const pad = msg.pad;
        const ch = msg.channel;
        if (pad >= 0 && pad < NUM_PADS && ch >= 0 && ch < 8) {
          this.channelAssign[pad] = ch;
        }
        break;
      }

      case 'decay-tune-select': {
        // Toggle between 'tune' and 'decay' mode per pad
        const pad = msg.pad;
        if (pad >= 0 && pad < NUM_PADS) {
          this.padModes[pad] = msg.mode === 'decay' ? 'decay' : 'tune';
          this.port.postMessage({ type: 'pad-mode', pad, mode: this.padModes[pad] });
        }
        break;
      }

      case 'delete-sound': {
        // Clear voice sample for a pad
        const pad = msg.pad;
        if (pad >= 0 && pad < NUM_PADS) {
          this.voices[pad].sample = null;
          this.voices[pad].active = false;
          this.voices[pad].position = 0;
          this.port.postMessage({ type: 'sound-deleted', pad });
        }
        break;
      }

      case 'reverse-sound': {
        // Toggle reverse on a voice
        const pad = msg.pad;
        if (pad >= 0 && pad < NUM_PADS) {
          const voice = this.voices[pad];
          voice.reversed = !voice.reversed;
          this.port.postMessage({ type: 'reverse-toggled', pad, reversed: voice.reversed });
        }
        break;
      }

      case 'erase-segment': {
        // Clear pattern data for a segment (pattern index)
        const seg = msg.segment;
        if (seg >= 0 && seg < MAX_PATTERNS) {
          this.patterns[seg].clear();
          this.port.postMessage({ type: 'segment-erased', segment: seg });
        }
        break;
      }

      case 'copy-segment': {
        // Copy pattern data from one segment to another
        const from = msg.from;
        const to = msg.to;
        if (from >= 0 && from < MAX_PATTERNS && to >= 0 && to < MAX_PATTERNS && from !== to) {
          const srcPat = this.patterns[from];
          const dstPat = this.patterns[to];
          dstPat.clear();
          dstPat.setBars(srcPat.bars);
          for (let t = 0; t < NUM_PADS; t++) {
            for (const ev of srcPat.tracks[t].events) {
              dstPat.addEvent(t, new PatternEvent(ev.tick, ev.velocity, ev.pitchOffset));
            }
          }
          this.port.postMessage({ type: 'segment-copied', from, to });
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
        this.isRecording = false;
        this.patternTick = 0;
        this.clock.start();
        if (this.mode === 'song') {
          this.songPlaying = true;
          this.song.start(this.song.currentSong);
          // Set tempo from song
          this.clock.setBpm(this.song.songs[this.song.currentSong].tempo);
          // Advance to first segment
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
        // value is semitone offset; convert to rate
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
        // value: { start, end }
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
        // Input gain 0-1 maps to 0-2x amplification
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

    // Record into current pattern if recording (only user-triggered, not from sequencer playback)
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
    // Determine which pattern to play
    let patternIndex = this.currentPatternIndex;
    if (this.mode === 'song' && this.songPlaying) {
      patternIndex = this.song.currentPattern();
      if (patternIndex < 0) {
        // Song finished
        this.isPlaying = false;
        this.songPlaying = false;
        this.clock.stop();
        this.port.postMessage({ type: 'song-end' });
        return;
      }
    }

    const pattern = this.patterns[patternIndex];

    // Apply swing to pattern tick lookup
    const swungTick = applySwing(this.patternTick, this.swingPercent);

    // Fire events at this tick (from sequencer, not user)
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
        // Advance to next step in song
        let next = this.song.getNextSegment();
        // Process non-segment steps (tempo changes, mix changes, triggers) until we get a segment or end
        while (next !== null && next.segment === undefined) {
          if (next.tempoChange) {
            const tc = next.tempoChange;
            this.clock.setBpm(typeof tc === 'number' ? tc : (tc.amount || this.clock.bpm));
          } else if (next.mixChange !== undefined) {
            // Apply mix snapshot
            const slot = next.mixChange;
            if (slot >= 0 && slot < 8) {
              for (let ch = 0; ch < NUM_PADS; ch++) {
                this.mixer.setVolume(ch, this.mixSnapshots[slot][ch]);
              }
            }
          } else if (next.trigger) {
            // Fire a trigger event
            const t = next.trigger;
            this._triggerVoice(t.pad, t.velocity ?? 127);
          }
          next = this.song.getNextSegment();
        }

        if (next === null) {
          // Song finished
          this.isPlaying = false;
          this.songPlaying = false;
          this.clock.stop();
          this.port.postMessage({ type: 'song-end' });
          return;
        }
        // next.segment is the pattern index to play
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
      // Advance clock; fire sequencer on each new tick
      const newTick = this.clock.advance();
      if (newTick !== null && this.isPlaying) {
        this._processTick(newTick);
      }

      // Process voices through filters
      const voiceOutputs = new Array(NUM_PADS);
      for (let v = 0; v < NUM_PADS; v++) {
        let sample = this.voices[v].process();

        if (FILTER_DYNAMIC.includes(v)) {
          const fi = FILTER_DYNAMIC.indexOf(v);
          sample = this.dynamicFilters[fi].process(sample);
        } else if (v >= 2 && v <= 5) {
          const fi = v - 2; // channels 2–5 → fixed filter indices 0–3
          sample = this.fixedFilters[fi].process(sample);
        }
        // channels 6–7: no filter

        voiceOutputs[v] = sample;
      }

      // Mix to stereo
      const [left, right] = this.mixer.process(voiceOutputs);
      const metroSample = this.metronomeClick.process() * this.metronomeVolume;
      leftOut[i] = left * this.mixer.masterVolume + metroSample;
      rightOut[i] = right * this.mixer.masterVolume + metroSample;
    }

    return true; // keep processor alive
  }
}

registerProcessor('sp1200-processor', SP1200Processor);

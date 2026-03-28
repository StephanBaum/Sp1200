import { PPQN, BPM_DEFAULT, BPM_MIN, BPM_MAX } from '../constants.js';

export class Clock {
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

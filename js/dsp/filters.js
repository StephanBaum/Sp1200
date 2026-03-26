import { SP_SAMPLE_RATE } from '../constants.js';

export class SSM2044Filter {
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
  setCutoff(cutoff) {
    this.cutoff = cutoff;
    this._updateCoefficients();
  }
  setResonance(resonance) {
    this.resonance = Math.max(0, Math.min(resonance, 4));
  }
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

export class FixedFilter {
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

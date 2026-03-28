import { NUM_PADS } from '../constants.js';

export class Mixer {
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

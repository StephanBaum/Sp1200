export class Voice {
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
    // Per-note override: when a sequencer event has stored params,
    // lock pitch/decay so fader changes don't clobber playback
    this.perNoteLock = false;
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
    // amount: 0 = instant, 1 = no decay
    // Map to per-sample multiplier
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
    // Bounds check
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

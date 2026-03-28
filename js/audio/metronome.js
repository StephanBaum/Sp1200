export class MetronomeClick {
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

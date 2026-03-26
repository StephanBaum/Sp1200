export class KeyboardUI {
  constructor(engine) {
    this.engine = engine;
    this.stepEditActive = false;
    this.stepPosition = 0;
    this._bind();
  }
  _bind() {
    document.addEventListener('keydown', (e) => {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8) {
        this.engine.trigger(num - 1, 100);
        document.dispatchEvent(new CustomEvent('pad-trigger', { detail: { pad: num - 1 } }));
        return;
      }
      if (this.stepEditActive) {
        if (e.key === 'ArrowRight') {
          this.stepPosition++;
          document.dispatchEvent(new CustomEvent('step-navigate', { detail: { step: this.stepPosition } }));
        } else if (e.key === 'ArrowLeft') {
          this.stepPosition = Math.max(0, this.stepPosition - 1);
          document.dispatchEvent(new CustomEvent('step-navigate', { detail: { step: this.stepPosition } }));
        }
      }
    });
  }
  setStepEditActive(active) { this.stepEditActive = active; this.stepPosition = 0; }
}

import { PPQN } from '../constants.js';

export class StepEditUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.active = false;
    this.currentStep = 0;
    this.quantizeGrid = PPQN / 4;
    this._bind();
  }
  _bind() {
    document.getElementById('btn-step-edit').addEventListener('click', () => {
      this.active = !this.active;
      if (this.active) { this.currentStep = 0; this._updateDisplay(); }
    });
    document.addEventListener('step-navigate', (e) => {
      if (!this.active) return;
      this.currentStep = e.detail.step;
      this._updateDisplay();
    });
    document.querySelectorAll('.pad').forEach(el => {
      el.addEventListener('mousedown', () => {
        if (!this.active) return;
        const track = parseInt(el.dataset.pad, 10);
        const tick = this.currentStep * this.quantizeGrid;
        this.engine.send({ type: 'step-edit', step: tick, track, event: { velocity: 100, pitchOffset: 0 } });
      });
    });
    document.getElementById('quantize-select').addEventListener('change', (e) => {
      this.quantizeGrid = parseInt(e.target.value, 10);
    });
  }
  _updateDisplay() {
    const beat = Math.floor(this.currentStep / 4) + 1;
    const sub = (this.currentStep % 4) + 1;
    this.display.setMode('STEP ' + beat + '.' + sub);
  }
}

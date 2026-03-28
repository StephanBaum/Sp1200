import { PPQN } from '../constants.js';

export class StepEditUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.active = false;
    this.currentStep = 0;
    this.quantizeGrid = PPQN / 4; // default 1/16
    this.maxSteps = 32; // 2 bars * 16 steps at 1/16
    this.stepsPerBar = 16;
    this._bind();
  }

  activate() {
    this.active = true;
    this.currentStep = 0;
    this._updateDisplay();
  }

  deactivate() {
    this.active = false;
  }

  setQuantize(grid) {
    this.quantizeGrid = grid;
    // Recalculate steps per bar: PPQN * beatsPerBar / grid
    this.stepsPerBar = Math.floor(PPQN * 4 / grid); // assuming 4/4
    this.maxSteps = this.stepsPerBar * 2; // 2 bars default
  }

  setSegmentLength(bars) {
    this.maxSteps = this.stepsPerBar * bars;
  }

  _bind() {
    // Listen for step navigation events from keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.active) return;

      if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.currentStep = Math.min(this.maxSteps - 1, this.currentStep + 1);
        this._updateDisplay();
      } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.currentStep = Math.max(0, this.currentStep - 1);
        this._updateDisplay();
      }
    });

    // Pad clicks in step mode → insert note at current step
    document.querySelectorAll('.pad').forEach(el => {
      el.addEventListener('mousedown', () => {
        if (!this.active) return;
        const track = parseInt(el.dataset.pad, 10);
        const tick = this.currentStep * this.quantizeGrid;
        this.engine.send({
          type: 'step-edit',
          step: tick,
          track,
          event: { velocity: 100, pitchOffset: 0 }
        });
        this._updateDisplay();
        // Flash the pad
        el.classList.add('triggered');
        setTimeout(() => el.classList.remove('triggered'), 100);
      });
    });
  }

  _updateDisplay() {
    const stepsPerBeat = Math.floor(this.stepsPerBar / 4);
    const measure = Math.floor(this.currentStep / this.stepsPerBar) + 1;
    const stepInBar = this.currentStep % this.stepsPerBar;
    const beat = Math.floor(stepInBar / stepsPerBeat) + 1;
    const sub = (stepInBar % stepsPerBeat) + 1;

    const gridNames = { 96: '1/4', 48: '1/8', 32: '1/8T', 24: '1/16', 16: '1/16T', 12: '1/32', 1: 'HiR' };
    const grid = gridNames[this.quantizeGrid] || '1/16';

    this.display.setLine1('M:' + String(measure).padStart(2, '0') + ' B:' + String(beat).padStart(2, '0') + ' S:' + String(sub).padStart(2, '0'));
    this.display.setLine2('AC:' + grid);
  }
}

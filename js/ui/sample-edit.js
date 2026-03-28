export class SampleEditUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.active = false;
    this.selectedPad = 0;
    this._bind();
  }
  toggle() {
    this.active = !this.active;
    document.getElementById('btn-setup').classList.toggle('active', this.active);
    if (this.active) {
      this.display.setMode('SET UP');
    } else {
      this.display.setMode('PATTERN');
    }
  }
  _bind() {
    // Sync button acts as reverse in sample edit context
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        if (this.active) {
          this.engine.setParam('reverse', this.selectedPad, true);
          this.display.setMode('REVERSE');
          setTimeout(() => this.display.setMode('SET UP'), 600);
        }
      });
    }

    document.querySelectorAll('.pad').forEach(el => {
      el.addEventListener('mousedown', () => {
        if (this.active) {
          this.selectedPad = parseInt(el.dataset.pad, 10);
          this.display.setMode('PAD ' + (this.selectedPad + 1));
        }
      });
    });
  }
}

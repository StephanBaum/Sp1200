export class SampleEditUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.active = false;
    this.selectedPad = 0;
    this._bind();
  }
  _bind() {
    document.getElementById('btn-sample-edit').addEventListener('click', () => {
      this.active = !this.active;
      document.getElementById('btn-sample-edit').classList.toggle('active', this.active);
    });
    document.getElementById('btn-reverse').addEventListener('click', () => {
      this.engine.setParam('reverse', this.selectedPad, true);
    });
    document.getElementById('btn-loop').addEventListener('click', () => {
      this.engine.setParam('loop', this.selectedPad, { enabled: true, start: 0, end: 0 });
    });
    document.getElementById('btn-truncate').addEventListener('click', () => {
      this.display.setMode('TRUNCATE');
    });
    document.querySelectorAll('.pad').forEach(el => {
      el.addEventListener('mousedown', () => {
        if (this.active) this.selectedPad = parseInt(el.dataset.pad, 10);
      });
    });
  }
}

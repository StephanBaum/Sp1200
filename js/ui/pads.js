export class PadsUI {
  constructor(engine) {
    this.engine = engine;
    this.padElements = document.querySelectorAll('.pad');
    this.currentBank = 0;
    this._bindMouse();
  }
  _bindMouse() {
    this.padElements.forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        const pad = parseInt(el.dataset.pad, 10);
        const velocity = this._velocityFromClick(e, el);
        this.engine.trigger(pad, velocity);
        this._flash(pad);
      });
    });
  }
  _velocityFromClick(event, element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dx = event.clientX - rect.left - centerX;
    const dy = event.clientY - rect.top - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    const normalized = 1 - Math.min(dist / maxDist, 1);
    return Math.round(40 + normalized * 87);
  }
  _flash(padIndex) {
    const el = this.padElements[padIndex];
    if (!el) return;
    el.classList.add('triggered');
    setTimeout(() => el.classList.remove('triggered'), 100);
  }
  flashPad(padIndex) { this._flash(padIndex); }
  setBank(bank) { this.currentBank = bank; }
}

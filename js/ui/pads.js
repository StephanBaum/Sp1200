export class PadsUI {
  constructor(engine) {
    this.engine = engine;
    this.state = null; // set after SP1200State is created
    this.padElements = document.querySelectorAll('.pad');
    this.currentBank = 0;
    this._bindMouse();
  }
  _bindMouse() {
    this.padElements.forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        // Don't trigger sound when selecting a pad for a function or erasing
        if (this.state?.eraseMode && this.state?.playing) return;
        if (this.state?.editParam === 'select-pad') return;

        const pad = parseInt(el.dataset.pad, 10);
        const velocity = this._velocityFromClick(e, el);
        // Trigger with bank offset so correct sample plays
        const bank = this.state?.currentBank || 0;
        this.engine.trigger(pad, velocity, bank);
        this._flash(pad);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pad = parseInt(el.dataset.pad, 10);
        document.dispatchEvent(new CustomEvent('pad-right-click', { detail: { pad } }));
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

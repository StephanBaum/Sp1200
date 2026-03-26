export class FadersUI {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'volume';
    this.values = new Float32Array(8).fill(0.75);
    this.thumbs = document.querySelectorAll('.fader-thumb');
    this.tracks = document.querySelectorAll('.fader-track');
    this._bindModeSwitcher();
    this._bindDrag();
    this._updateAllPositions();
  }
  _bindModeSwitcher() {
    const buttons = document.querySelectorAll('.fader-mode-switch .mode-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
      });
    });
  }
  _bindDrag() {
    this.thumbs.forEach((thumb, index) => {
      let dragging = false;
      const track = this.tracks[index];
      thumb.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.values[index] = y;
        this._updatePosition(index);
        this._sendValue(index);
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    });
  }
  _updatePosition(index) {
    const thumb = this.thumbs[index];
    if (!thumb) return;
    thumb.style.top = `${(1 - this.values[index]) * 100}%`;
  }
  _updateAllPositions() { for (let i = 0; i < 8; i++) this._updatePosition(i); }
  _sendValue(index) {
    if (this.mode === 'volume') {
      this.engine.setParam('volume', index, this.values[index]);
    } else {
      this.engine.setParam('pitch', index, 0.5 + this.values[index] * 1.5);
    }
  }
}

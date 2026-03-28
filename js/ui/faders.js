export class FadersUI {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'volume';
    this.values = new Float32Array(8).fill(0.75);
    this.thumbs = document.querySelectorAll('.fader-thumb');
    this.tracks = document.querySelectorAll('.fader-track');
    this._bindDrag();
    this._updateAllPositions();
  }
  _bindDrag() {
    this.thumbs.forEach((thumb, index) => {
      let dragging = false;
      const track = this.tracks[index];
      thumb.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
      track.addEventListener('mousedown', (e) => {
        dragging = true;
        const rect = track.getBoundingClientRect();
        const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.values[index] = y;
        this._updatePosition(index);
        this._sendValue(index);
        this._notifyDisplay();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.values[index] = y;
        this._updatePosition(index);
        this._sendValue(index);
        this._notifyDisplay();
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
    } else if (this.mode === 'pitch') {
      this.engine.setParam('pitch', index, 0.5 + this.values[index] * 1.5);
    } else {
      this.engine.setParam('decay', index, this.values[index]);
    }
  }
  _notifyDisplay() {
    document.dispatchEvent(new CustomEvent('fader-update', { detail: { values: Array.from(this.values), mode: this.mode } }));
  }
  // Called by keyboard UI when faders change via keys
  setValueFromKeyboard(index, value) {
    this.values[index] = value;
    this._updatePosition(index);
    this._sendValue(index);
    this._notifyDisplay();
  }
}

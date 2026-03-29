export class FadersUI {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'volume';

    // Stored parameter values per mode (only updated when fader is touched)
    this.params = {
      volume: new Float32Array(8).fill(0.75),
      pitch: new Float32Array(8).fill(0.533), // center = 0 semitones
      decay: new Float32Array(8).fill(0.75),
    };

    // Physical fader positions (where the thumb sits)
    this.faderPos = new Float32Array(8).fill(0.75);

    this.thumbs = document.querySelectorAll('.fader-thumb');
    this.tracks = document.querySelectorAll('.fader-track');
    this._bindDrag();
    this._bindKeyboard();
    this._updateAllPositions();
  }

  _bindDrag() {
    this.thumbs.forEach((thumb, index) => {
      let dragging = false;
      const track = this.tracks[index];

      const onMove = (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const pos = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.faderPos[index] = pos;
        // Absolute: fader position IS the value, written on touch
        this.params[this.mode][index] = pos;
        this._updatePosition(index);
        this._sendValue(index);
        this._notifyDisplay();
      };

      thumb.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
      track.addEventListener('mousedown', (e) => {
        dragging = true;
        onMove(e);
      });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', () => { dragging = false; });
    });
  }

  _bindKeyboard() {
    document.addEventListener('fader-key', (e) => {
      const { index, delta } = e.detail;
      const val = Math.max(0, Math.min(1, this.params[this.mode][index] + delta));
      this.params[this.mode][index] = val;
      this.faderPos[index] = val;
      this._updatePosition(index);
      this._sendValue(index);
      this._notifyDisplay();
    });
  }

  _updatePosition(index) {
    const thumb = this.thumbs[index];
    if (!thumb) return;
    const minTop = 5;
    const maxTop = 95;
    const top = maxTop - this.faderPos[index] * (maxTop - minTop);
    thumb.style.top = `${top}%`;
  }

  _updateAllPositions() {
    for (let i = 0; i < 8; i++) this._updatePosition(i);
  }

  _sendValue(index) {
    if (this.mode === 'truncate') {
      document.dispatchEvent(new CustomEvent('truncate-fader', { detail: { index, value: this.faderPos[index] } }));
      return;
    }
    const val = this.params[this.mode][index];
    if (this.mode === 'volume') {
      this.engine.setParam('volume', index, val);
    } else if (this.mode === 'pitch') {
      const semitones = (val * 15) - 8; // -8 to +7
      this.engine.setParam('pitch', index, semitones);
    } else {
      this.engine.setParam('decay', index, val);
    }
  }

  _notifyDisplay() {
    const vals = Array.from(this.params[this.mode]);
    document.dispatchEvent(new CustomEvent('fader-update', { detail: { values: vals, mode: this.mode } }));
  }
}

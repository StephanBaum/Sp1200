export class FadersUI {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'volume';

    // Stored parameter values per mode (the "real" values shown on display)
    this.params = {
      volume: new Float32Array(8).fill(0.75),
      pitch: new Float32Array(8).fill(0.533), // center = 0 semitones
      decay: new Float32Array(8).fill(0.75),
    };

    // Physical fader positions (where the thumb sits visually)
    this.faderPos = new Float32Array(8).fill(0.5); // all start at center

    this.thumbs = document.querySelectorAll('.fader-thumb');
    this.tracks = document.querySelectorAll('.fader-track');
    this._bindDrag();
    this._bindKeyboard();
    this._updateAllPositions();
  }

  _bindKeyboard() {
    document.addEventListener('fader-key', (e) => {
      const { index, delta } = e.detail;
      this.setValueFromKeyboard(index, delta);
    });
  }

  _bindDrag() {
    this.thumbs.forEach((thumb, index) => {
      let dragging = false;
      let lastY = null;
      const track = this.tracks[index];

      const startDrag = (e) => {
        dragging = true;
        const rect = track.getBoundingClientRect();
        lastY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        e.preventDefault();
      };

      thumb.addEventListener('mousedown', startDrag);
      track.addEventListener('mousedown', (e) => {
        // Click on track — move thumb there, then start dragging
        const rect = track.getBoundingClientRect();
        const newPos = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.faderPos[index] = newPos;
        this._updatePosition(index);
        lastY = newPos;
        dragging = true;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const newPos = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        // Calculate delta from last position
        const delta = newPos - (lastY ?? newPos);
        lastY = newPos;

        // Apply delta to the stored parameter value
        const paramArr = this.params[this.mode];
        paramArr[index] = Math.max(0, Math.min(1, paramArr[index] + delta));

        // Update physical fader position
        this.faderPos[index] = newPos;
        this._updatePosition(index);

        // Send the actual parameter value to engine
        this._sendValue(index);
        this._notifyDisplay();
      });

      document.addEventListener('mouseup', () => {
        dragging = false;
        lastY = null;
      });
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
    // Send the actual stored values to the display, not fader positions
    const vals = Array.from(this.params[this.mode]);
    document.dispatchEvent(new CustomEvent('fader-update', { detail: { values: vals, mode: this.mode } }));
  }

  // Called by keyboard UI when faders change via keys
  setValueFromKeyboard(index, delta) {
    const paramArr = this.params[this.mode];
    paramArr[index] = Math.max(0, Math.min(1, paramArr[index] + delta));
    this._sendValue(index);
    this._notifyDisplay();
  }
}

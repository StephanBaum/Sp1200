export class KeyboardUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.faderValues = new Float32Array(8).fill(0.75);
    this.faderMode = 'volume';
    this._backtickHeld = false;
    this._repeatInterval = null;
    this._bind();
    this._bindKeyup();

    document.addEventListener('fader-mode-change', (e) => {
      this.faderMode = e.detail.mode;
    });
    window.addEventListener('blur', () => this._stopRepeat());
  }

  _bind() {
    const faderUpKeys = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i']; // z for German layout
    const faderDownKeys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
    const FADER_STEP = 0.03;

    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const code = e.code;

      // ── Pads: 1-8 (single hit, no repeat on hold) ──────────────
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8 && !e.ctrlKey && !e.shiftKey && !this._isNumpad(e)) {
        e.preventDefault();
        if (e.altKey) {
          // Alt+number → start repeating this pad at autocorrect rate
          if (!e.repeat) this._startRepeat(num - 1);
          return;
        }
        if (e.repeat) return; // Don't retrigger on held keys
        this._firePad(num - 1);
        return;
      }

      // ── Numpad 0-9 → SP-1200 keypad ────────────────────────────
      if (this._isNumpad(e) && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (e.repeat) return;
        const keyBtn = document.querySelector(`.key[data-key="${e.key}"]`);
        if (keyBtn) keyBtn.click();
        return;
      }

      // ── Numpad Enter → Enter button ────────────────────────────
      if (code === 'NumpadEnter') {
        e.preventDefault();
        document.getElementById('btn-enter')?.click();
        return;
      }

      // ── y → Performance mode cycling (Tune/Mix/Multi) ──────────
      if (key === 'y' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.repeat) return;
        e.preventDefault();
        document.getElementById('btn-mode')?.click();
        return;
      }

      // ── <> key → Bank cycling (IntlBackslash on German keyboards) ─
      if (code === 'IntlBackslash' || (key === '<' && !e.shiftKey) || (key === '>' && e.shiftKey)) {
        if (e.repeat) return;
        e.preventDefault();
        document.getElementById('btn-bank')?.click();
        return;
      }

      // ── [ ] also work for mode/bank ────────────────────────────
      if ((key === '[' || code === 'BracketLeft') && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-mode')?.click();
        return;
      }
      if ((key === ']' || code === 'BracketRight') && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-bank')?.click();
        return;
      }

      // ── Arrow keys → Nav buttons ───────────────────────────────
      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('btn-nav-left')?.click();
        return;
      }
      if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('btn-nav-right')?.click();
        return;
      }

      // ── Space → Run/Stop ───────────────────────────────────────
      if (code === 'Space' && !e.ctrlKey && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-run-stop')?.click();
        return;
      }

      // ── Ctrl+Space → Record + Play ─────────────────────────────
      if (code === 'Space' && e.ctrlKey && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-record')?.click();
        return;
      }

      // ── F1-F4 → Set up, Disk, Sync, Sample ────────────────────
      if (code === 'F1' && !e.repeat) { e.preventDefault(); document.getElementById('btn-setup')?.click(); return; }
      if (code === 'F2' && !e.repeat) { e.preventDefault(); document.getElementById('btn-disk')?.click(); return; }
      if (code === 'F3' && !e.repeat) { e.preventDefault(); document.getElementById('btn-sync')?.click(); return; }
      if (code === 'F4' && !e.repeat) { e.preventDefault(); document.getElementById('btn-sample')?.click(); return; }

      // ── Tab → Programming Song/Segment toggle ──────────────────
      if (code === 'Tab' && !e.repeat) {
        e.preventDefault();
        document.getElementById('prog-1')?.click();
        return;
      }

      // ── Tempo control: , (down) . (up) ─────────────────────────
      if (key === ',' || key === '<') {
        e.preventDefault();
        document.getElementById('btn-nav-left')?.click();
        return;
      }
      if (key === '.' || key === '>') {
        e.preventDefault();
        document.getElementById('btn-nav-right')?.click();
        return;
      }

      // ── Backtick → Tap tempo + hold for repeat ─────────────────
      if (code === 'Backquote' && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-tap-tempo')?.dispatchEvent(new MouseEvent('mousedown'));
        this._backtickHeld = true;
        return;
      }

      // ── Home → Tempo button ────────────────────────────────────
      if (code === 'Home' && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-tempo')?.click();
        return;
      }

      // ── End → Enter button ─────────────────────────────────────
      if (code === 'End') {
        e.preventDefault();
        document.getElementById('btn-enter')?.click();
        return;
      }

      // ── Enter → Enter button ───────────────────────────────────
      if (code === 'Enter' && !this._isNumpad(e) && !e.repeat) {
        e.preventDefault();
        document.getElementById('btn-enter')?.click();
        return;
      }

      // ── Faders up: Q W E R T Z U I ─────────────────────────────
      const upIdx = faderUpKeys.indexOf(key);
      if (upIdx !== -1 && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.faderValues[upIdx] = Math.min(1, this.faderValues[upIdx] + FADER_STEP);
        this._sendFader(upIdx);
        this._updateFaderThumb(upIdx);
        this._notifyDisplay();
        return;
      }

      // ── Faders down: A S D F G H J K ───────────────────────────
      const downIdx = faderDownKeys.indexOf(key);
      if (downIdx !== -1 && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.faderValues[downIdx] = Math.max(0, this.faderValues[downIdx] - FADER_STEP);
        this._sendFader(downIdx);
        this._updateFaderThumb(downIdx);
        this._notifyDisplay();
        return;
      }
    });
  }

  _bindKeyup() {
    document.addEventListener('keyup', (e) => {
      // Release backtick → stop repeat
      if (e.code === 'Backquote' && this._backtickHeld) {
        this._backtickHeld = false;
        document.getElementById('btn-tap-tempo')?.dispatchEvent(new MouseEvent('mouseup'));
      }
      // Release Alt → stop repeat
      if (e.key === 'Alt') {
        this._stopRepeat();
      }
      // Release number key → stop repeat for that pad
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8) {
        this._stopRepeat();
      }
    });
  }

  _firePad(pad) {
    this.engine.trigger(pad, 100);
    document.dispatchEvent(new CustomEvent('pad-trigger', { detail: { pad } }));
  }

  _startRepeat(pad) {
    this._stopRepeat();
    this._firePad(pad);
    const bpm = this.display.bpm || 90;
    const grid = 24; // 1/16 note
    const msPerStep = (60000 / bpm) * grid / 96;
    this._repeatInterval = setInterval(() => this._firePad(pad), Math.max(50, msPerStep));
  }

  _stopRepeat() {
    if (this._repeatInterval) {
      clearInterval(this._repeatInterval);
      this._repeatInterval = null;
    }
  }

  _isNumpad(e) {
    return e.code && e.code.startsWith('Numpad');
  }

  _sendFader(index) {
    const val = this.faderValues[index];
    if (this.faderMode === 'volume') {
      this.engine.setParam('volume', index, val);
    } else if (this.faderMode === 'pitch') {
      const semitones = (val * 15) - 8; // -8 to +7
      this.engine.setParam('pitch', index, semitones);
    } else {
      this.engine.setParam('decay', index, val);
    }
  }

  _updateFaderThumb(index) {
    const thumbs = document.querySelectorAll('.fader-thumb');
    if (thumbs[index]) {
      const minTop = 5, maxTop = 95;
      thumbs[index].style.top = `${maxTop - this.faderValues[index] * (maxTop - minTop)}%`;
    }
  }

  _notifyDisplay() {
    document.dispatchEvent(new CustomEvent('fader-update', { detail: { values: Array.from(this.faderValues), mode: this.faderMode } }));
  }
}

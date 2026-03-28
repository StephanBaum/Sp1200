export class KeyboardUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.faderValues = new Float32Array(8).fill(0.75);
    this.faderMode = 'volume';
    this._bind();

    // Listen for fader mode changes
    document.addEventListener('fader-mode-change', (e) => {
      this.faderMode = e.detail.mode;
    });
  }

  _bind() {
    // Fader up keys: Q W E R T Y U I → faders 1-8
    const faderUpKeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'];
    // Fader down keys: A S D F G H J K → faders 1-8
    const faderDownKeys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
    const FADER_STEP = 0.03;

    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const code = e.code;

      // ── Pads: 1-8 ──────────────────────────────────────────────
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8 && !e.ctrlKey && !e.altKey && !e.shiftKey && !this._isNumpad(e)) {
        e.preventDefault();
        this.engine.trigger(num - 1, 100);
        document.dispatchEvent(new CustomEvent('pad-trigger', { detail: { pad: num - 1 } }));
        return;
      }

      // ── Numpad 0-9 → SP-1200 keypad ────────────────────────────
      if (this._isNumpad(e) && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
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

      // ── Shift+Up → Performance mode cycling ────────────────────
      if ((e.key === 'ArrowUp' || code === 'ArrowUp') && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('btn-mode')?.click();
        return;
      }

      // ── Shift+Down → Bank cycling ──────────────────────────────
      if ((e.key === 'ArrowDown' || code === 'ArrowDown') && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
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
      if (code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        document.getElementById('btn-run-stop')?.click();
        return;
      }

      // ── Ctrl+Space → Record + Play ─────────────────────────────
      if (code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        document.getElementById('btn-record')?.click();
        return;
      }

      // ── F1-F4 → Set up, Disk, Sync, Sample ────────────────────
      if (code === 'F1') { e.preventDefault(); document.getElementById('btn-setup')?.click(); return; }
      if (code === 'F2') { e.preventDefault(); document.getElementById('btn-disk')?.click(); return; }
      if (code === 'F3') { e.preventDefault(); document.getElementById('btn-sync')?.click(); return; }
      if (code === 'F4') { e.preventDefault(); document.getElementById('btn-sample')?.click(); return; }

      // ── Tab → Programming Song/Segment toggle ──────────────────
      if (code === 'Tab') {
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

      // ── Backtick/Tilde → Tap tempo ─────────────────────────────
      if (code === 'Backquote') {
        e.preventDefault();
        document.getElementById('btn-tap-tempo')?.click();
        return;
      }

      // ── Home (Pos1) → Tempo button ─────────────────────────────
      if (code === 'Home') {
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

      // ── Alt → Tap/Repeat ───────────────────────────────────────
      if (code === 'AltLeft' || code === 'AltRight') {
        e.preventDefault();
        document.getElementById('btn-tap-tempo')?.click();
        return;
      }

      // ── Faders up: Q W E R T Y U I ─────────────────────────────
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

      // ── Enter key → Enter button ───────────────────────────────
      if (code === 'Enter' && !this._isNumpad(e)) {
        e.preventDefault();
        document.getElementById('btn-enter')?.click();
        return;
      }
    });
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
      thumbs[index].style.top = `${(1 - this.faderValues[index]) * 100}%`;
    }
  }

  _notifyDisplay() {
    document.dispatchEvent(new CustomEvent('fader-update', { detail: { values: Array.from(this.faderValues), mode: this.faderMode } }));
  }
}

import { BANK_NAMES, BPM_DEFAULT } from '../constants.js';

/**
 * SP-1200 LCD Display — 2 lines, 16 characters each.
 * Context-dependent: shows different info based on current mode.
 */
export class DisplayUI {
  constructor() {
    this.line1El = document.getElementById('lcd-line1');
    this.line2El = document.getElementById('lcd-line2');
    this.bpm = BPM_DEFAULT;
    this.pattern = 0;
    this.bank = 0;
    this.bar = 0;
    this.mode = 'segment'; // segment | song | step
    this._flashTimer = null;
    this._knobTimer = null;
    this.locked = false; // when true, fader/knob updates won't override
    this._refresh();
  }

  // ── Primary setters ────────────────────────────────────────────────────
  setBpm(bpm) { this.bpm = bpm; this._refresh(); }
  setPattern(num) { this.pattern = num; this._refresh(); }
  setBar(bar) { this.bar = bar; }
  setBank(bank) { this.bank = bank; this._refresh(); }
  setMemory(seconds) { this.memory = seconds; }

  setMode(mode) {
    // Known modes update the display state
    const modeMap = { 'PATTERN': 'segment', 'SONG': 'song', 'STEP': 'step', 'segment': 'segment', 'song': 'song', 'step-edit': 'step', 'step': 'step', 'pattern': 'segment' };
    if (modeMap[mode]) {
      this.mode = modeMap[mode];
      this._refresh();
    } else {
      // Custom text → show on line 1, clear line 2
      this.setLine1(mode);
      this.setLine2(' ');
    }
  }

  // ── Write directly to LCD lines ────────────────────────────────────────
  setLine1(text) { this.line1El.textContent = this._pad(text); }
  setLine2(text) { this.line2El.textContent = this._pad(text); }

  // ── Context-dependent refresh ──────────────────────────────────────────
  _refresh() {
    const seg = String(this.pattern + 1).padStart(2, '0');
    const bpm = this.bpm.toFixed ? this.bpm.toFixed(1) : this.bpm + '.0';
    const bpmStr = String(bpm).padStart(5, ' ');

    if (this.mode === 'segment' || this.mode === 'pattern') {
      this.setLine1('Seg:' + seg + '  ' + bpmStr);
      this.setLine2(' ');
    } else if (this.mode === 'song') {
      this.setLine1('Song:01  ' + bpmStr);
      this.setLine2(' ');
    } else if (this.mode === 'step') {
      this.setLine1('StepPgm  ' + bpmStr);
      this.setLine2(' ');
    } else {
      // Custom mode text (from module activation etc.)
      this.setLine1(this.mode);
    }
  }

  // ── Flash a message temporarily ────────────────────────────────────────
  flash(line1, line2, duration = 1200) {
    clearTimeout(this._flashTimer);
    this.setLine1(line1);
    if (line2 !== undefined) this.setLine2(line2);
    this._flashTimer = setTimeout(() => this._refresh(), duration);
  }

  // ── Module function display ────────────────────────────────────────────
  showModuleFunc(moduleName, funcName, detail) {
    this.setLine1(moduleName + ': ' + funcName);
    this.setLine2(detail || 'Use + and -');
  }

  // ── Mix bar graph (8 channels) — CSS bars + numeric values ─────────────
  showMixLevels(values) {
    if (this.locked) return;
    const barsEl = document.getElementById('lcd-bars');
    if (!barsEl) return;
    // Show bars overlay, hide text lines
    barsEl.style.display = 'flex';
    this.line1El.style.display = 'none';
    this.line2El.style.display = 'none';
    // Update bar heights
    for (let i = 0; i < 8; i++) {
      const bar = document.getElementById('bar-' + i);
      if (bar) bar.style.height = Math.round(values[i] * 100) + '%';
    }
    // Auto-hide bars after 2 seconds of no updates
    clearTimeout(this._barTimer);
    this._barTimer = setTimeout(() => this._hideBars(), 2000);
  }

  _hideBars() {
    const barsEl = document.getElementById('lcd-bars');
    if (barsEl) barsEl.style.display = 'none';
    this.line1El.style.display = '';
    this.line2El.style.display = '';
  }

  // ── Tune display — center-line bars: up=pitch up, down=pitch down ───────
  showTuneLevels(values) {
    if (this.locked) return;
    const barsEl = document.getElementById('lcd-bars');
    const barsRow = barsEl?.querySelector('.lcd-bars-row');
    if (!barsEl || !barsRow) return;
    barsEl.style.display = 'flex';
    this.line1El.style.display = 'none';
    this.line2El.style.display = 'none';
    // Switch to center-aligned mode
    barsRow.style.alignItems = 'center';
    for (let i = 0; i < 8; i++) {
      const bar = document.getElementById('bar-' + i);
      if (bar) {
        // value 0.533 = center (0 semitones)
        const offset = values[i] - 0.533; // -0.53 to +0.47
        const pct = Math.round(Math.abs(offset) * 2 * 100);
        bar.style.height = Math.max(2, pct) + '%';
        if (offset >= 0) {
          // Pitch up — bar grows upward from center
          bar.style.alignSelf = 'flex-end';
          bar.style.marginBottom = '50%';
          bar.style.marginTop = '0';
        } else {
          // Pitch down — bar grows downward from center
          bar.style.alignSelf = 'flex-start';
          bar.style.marginTop = '50%';
          bar.style.marginBottom = '0';
        }
      }
    }
    clearTimeout(this._barTimer);
    this._barTimer = setTimeout(() => {
      this._hideBars();
      // Reset bar alignment
      if (barsRow) barsRow.style.alignItems = 'flex-end';
      for (let i = 0; i < 8; i++) {
        const bar = document.getElementById('bar-' + i);
        if (bar) { bar.style.alignSelf = ''; bar.style.marginBottom = ''; bar.style.marginTop = ''; }
      }
    }, 2000);
  }

  // ── VU meter for sampling ──────────────────────────────────────────────
  showVU(level) {
    const n = Math.round(level * 16);
    this.setLine2('\u2588'.repeat(n) + '\u2591'.repeat(16 - n));
  }

  // ── Knob value (temporary) ─────────────────────────────────────────────
  showKnobValue(name, value) {
    if (this.locked) return;
    clearTimeout(this._knobTimer);
    this.setLine2(name + ': ' + Math.round(value * 100) + '%');
    this._knobTimer = setTimeout(() => this._refresh(), 1500);
  }

  // ── Lock/unlock (prevent fader/knob from overriding module display) ────
  lock() { this.locked = true; this._hideBars(); }
  unlock() { this.locked = false; }

  // ── Pad 16 chars ───────────────────────────────────────────────────────
  _pad(str) {
    return String(str).substring(0, 16).padEnd(16, ' ');
  }
}

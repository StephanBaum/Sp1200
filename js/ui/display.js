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
    this.song = 0;
    this.beat = 0;
    this.playing = false;
    this.mode = 'segment'; // segment | song | step
    this._flashTimer = null;
    this._knobTimer = null;
    this.locked = false; // when true, fader/knob updates won't override
    this._refresh();
  }

  // ── Primary setters ────────────────────────────────────────────────────
  setBpm(bpm) { this.bpm = bpm; this._refresh(); }
  setPattern(num) { this.pattern = num; this._refresh(); }
  setSong(num) { this.song = num; this._refresh(); }
  setBar(bar) { this.bar = bar; }
  setBeat(beat) {
    if (this.beat !== beat) {
      this.beat = beat;
      if (this.playing && !this.locked) this._refresh();
    }
  }
  setPlaying(playing) {
    this.playing = playing;
    if (!this.locked) this._refresh();
  }
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
    const bpm = String(Math.round(this.bpm)).padStart(3, ' ');

    if (this.mode === 'segment' || this.mode === 'pattern') {
      this.setLine1('Seg ' + seg + '   \u266A' + bpm);
      if (this.playing) {
        this.setLine2('Bar:' + (this.bar + 1) + ' Beat:' + (this.beat + 1));
      } else {
        this.setLine2(' ');
      }
    } else if (this.mode === 'song') {
      const song = String(this.song + 1).padStart(2, '0');
      this.setLine1('Song ' + song + '  \u266A' + bpm);
      this.setLine2(' ');
    } else if (this.mode === 'step') {
      this.setLine1('StepPgm     ' + bpm);
      this.setLine2(' ');
    } else {
      this.setLine1(this.mode);
    }
  }

  // ── Flash a message temporarily ────────────────────────────────────────
  flash(line1, line2, duration = 1200) {
    clearTimeout(this._flashTimer);
    this.setLine1(line1);
    if (line2 !== undefined) this.setLine2(line2);
    this._flashTimer = setTimeout(() => {
      // Don't revert to default screen if display is locked (module active)
      if (!this.locked) this._refresh();
    }, duration);
  }

  // ── Module function display ────────────────────────────────────────────
  showModuleFunc(moduleName, funcName, detail) {
    this.setLine1(moduleName + ': ' + funcName);
    this.setLine2(detail || 'Use < and >');
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
    // Reset bar styles (may have been set by showTuneLevels) and update heights
    const barsRow = barsEl.querySelector('.lcd-bars-row');
    const labels = barsEl.querySelector('.lcd-bars-labels');
    this._resetBarStyles(barsRow, labels);
    for (let i = 0; i < 8; i++) {
      const bar = document.getElementById('bar-' + i);
      if (bar) {
        bar.style.position = '';
        bar.style.width = '';
        bar.style.left = '';
        bar.style.bottom = '';
        bar.style.top = '';
        bar.style.height = Math.round(values[i] * 100) + '%';
      }
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

  // ── Tune display — numbers centered, bars extend up/down from center ────
  showTuneLevels(values) {
    if (this.locked) return;
    const barsEl = document.getElementById('lcd-bars');
    const barsRow = barsEl?.querySelector('.lcd-bars-row');
    const labels = barsEl?.querySelector('.lcd-bars-labels');
    if (!barsEl || !barsRow) return;
    barsEl.style.display = 'flex';
    this.line1El.style.display = 'none';
    this.line2El.style.display = 'none';
    // Position bars-row to fill full height, labels centered
    barsRow.style.position = 'relative';
    barsRow.style.height = '100%';
    barsRow.style.alignItems = 'stretch';
    if (labels) {
      labels.style.position = 'absolute';
      labels.style.top = '50%';
      labels.style.left = '0';
      labels.style.right = '0';
      labels.style.transform = 'translateY(-50%)';
      labels.style.zIndex = '1';
    }
    for (let i = 0; i < 8; i++) {
      const bar = document.getElementById('bar-' + i);
      if (bar) {
        const offset = values[i] - 0.533; // center = 0 semitones
        const pct = Math.round(Math.abs(offset) * 2 * 100);
        bar.style.position = 'absolute';
        bar.style.width = (100 / 8 - 1.5) + '%';
        bar.style.left = (i * 100 / 8 + 0.75) + '%';
        bar.style.height = Math.max(1, pct / 2) + '%';
        if (offset >= 0) {
          bar.style.bottom = '50%';
          bar.style.top = 'auto';
        } else {
          bar.style.top = '50%';
          bar.style.bottom = 'auto';
        }
      }
    }
    clearTimeout(this._barTimer);
    this._barTimer = setTimeout(() => {
      this._hideBars();
      this._resetBarStyles(barsRow, labels);
    }, 2000);
  }

  _resetBarStyles(barsRow, labels) {
    if (barsRow) {
      barsRow.style.position = '';
      barsRow.style.height = '55%';
      barsRow.style.alignItems = 'flex-end';
    }
    if (labels) {
      labels.style.position = '';
      labels.style.top = '';
      labels.style.left = '';
      labels.style.right = '';
      labels.style.transform = '';
      labels.style.zIndex = '';
    }
    for (let i = 0; i < 8; i++) {
      const bar = document.getElementById('bar-' + i);
      if (bar) {
        bar.style.position = '';
        bar.style.width = '';
        bar.style.left = '';
        bar.style.top = '';
        bar.style.bottom = '';
        bar.style.alignSelf = '';
        bar.style.marginBottom = '';
        bar.style.marginTop = '';
      }
    }
  }

  // ── VU meter for sampling ──────────────────────────────────────────────
  showVU(level, threshold) {
    const n = Math.round(level * 16);
    // Peak hold: track max level, hold then decay
    if (level > (this._vuPeak || 0)) {
      this._vuPeak = level;
      this._vuPeakHold = 30;
    }
    if (this._vuPeakHold > 0) {
      this._vuPeakHold--;
    } else if (this._vuPeak > 0) {
      this._vuPeak = Math.max(0, (this._vuPeak || 0) - 0.02);
    }
    const peakPos = Math.round((this._vuPeak || 0) * 15);
    let bar = '\u2588'.repeat(n) + '\u2591'.repeat(16 - n);
    // Place peak hold marker
    if ((this._vuPeak || 0) > 0 && peakPos >= n && peakPos < 16) {
      const chars = bar.split('');
      chars[peakPos] = '\u2758';
      bar = chars.join('');
    }
    // Place threshold marker if provided
    if (threshold != null && threshold > 0) {
      const threshPos = Math.round(threshold * 15);
      if (threshPos >= 0 && threshPos < 16) {
        const chars = bar.split('');
        chars[threshPos] = '\u2502'; // │ box drawing vertical line as threshold
        bar = chars.join('');
      }
    }
    this.setLine2(bar);
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

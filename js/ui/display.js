import { BANK_NAMES, BPM_DEFAULT } from '../constants.js';

export class DisplayUI {
  constructor() {
    this.modeEl = document.getElementById('display-mode');
    this.bpmEl = document.getElementById('display-bpm');
    this.patternEl = document.getElementById('display-pattern');
    this.barEl = document.getElementById('display-bar');
    this.bankEl = document.getElementById('display-bank');
    this.memoryEl = document.getElementById('display-memory');
    this.setBpm(BPM_DEFAULT);
  }
  setMode(mode) { this.modeEl.textContent = mode.toUpperCase(); }
  setBpm(bpm) { this.bpmEl.textContent = String(bpm).padStart(3, '0'); }
  setPattern(num) { this.patternEl.textContent = String(num + 1).padStart(2, '0'); }
  setBar(bar) { this.barEl.textContent = String(bar + 1); }
  setBank(bank) { this.bankEl.textContent = BANK_NAMES[bank] || 'A'; }
  setMemory(seconds) { this.memoryEl.textContent = seconds.toFixed(1) + 's'; }
}

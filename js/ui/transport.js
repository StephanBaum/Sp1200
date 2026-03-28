export class TransportUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.playing = false;
    this.recording = false;
    this.mode = 'segment'; // segment | song | step-edit
    this.faderMode = 'volume'; // volume | pitch | decay
    this.tapTimes = [];
    this.currentSegment = 0;
    this.segmentLength = 2; // bars, default 2, max 99
    this.timeSig = '4/4';
    this.bpm = 120;
    this.metronomeOn = false;
    this.stepProgramMode = false;
    this.swingAmount = 50;
    this.quantizeIndex = 3; // index into quantize arrays, default 1/16
    this.quantizeGrid = 24;
    this.eraseMode = false;
    this.editParam = null;
    this.numericBuffer = '';
    this.progStates = {};
    this.activeModule = null; // 'setup' | 'disk' | 'sync' | 'sample' | null
    this.currentBank = 0;
    this.dynamicButtons = false;
    this.pendingAction = null;

    this._bindTransport();
    this._bindModules();
    this._bindProgramming();
    this._bindModeButton();
    this._bindMasterControl();
    this._bindNumericKeypad();
    this._bindQuantize();
    this._bindSwing();
    this._bindBanks();
    this._bindPadActions();
  }

  // ── Transport: Run/Stop, Record, Tap Tempo ─────────────────────────────
  _bindTransport() {
    document.getElementById('btn-run-stop').addEventListener('click', () => {
      if (this.playing) { this._stop(); } else { this._play(); }
    });

    document.getElementById('btn-record').addEventListener('click', () => {
      this.recording = !this.recording;
      if (this.recording) {
        if (!this.playing) this._play();
        this.engine.record();
        document.getElementById('btn-record').classList.add('active');
        this._led('led-record', true);
      } else {
        document.getElementById('btn-record').classList.remove('active');
        this._led('led-record', false);
      }
    });

    document.getElementById('btn-tap-tempo').addEventListener('click', () => this._handleTapTempo());

    // Keyboard shortcuts handled in keyboard.js
  }

  _play() {
    this.playing = true;
    this.engine.play();
    document.getElementById('btn-run-stop').classList.add('active');
    this._led('led-run', true);
  }

  _stop() {
    this.playing = false;
    this.recording = false;
    this.engine.stop();
    document.getElementById('btn-run-stop').classList.remove('active');
    document.getElementById('btn-record').classList.remove('active');
    this._led('led-run', false);
    this._led('led-record', false);
  }

  _handleTapTempo() {
    const now = performance.now();
    this.tapTimes.push(now);
    if (this.tapTimes.length > 4) this.tapTimes.shift();
    if (this.tapTimes.length >= 2) {
      let total = 0;
      for (let i = 1; i < this.tapTimes.length; i++) total += this.tapTimes[i] - this.tapTimes[i - 1];
      const avg = total / (this.tapTimes.length - 1);
      this.bpm = Math.max(30, Math.min(250, Math.round(60000 / avg)));
      this.engine.setBpm(this.bpm);
      this.display.setBpm(this.bpm);
    }
  }

  // ── Module activation switches (Setup, Disk, Sync, Sample) ─────────────
  _bindModules() {
    const modules = {
      'btn-setup': { name: 'setup', led: 'led-setup', label: 'SET UP' },
      'btn-disk': { name: 'disk', led: 'led-disk', label: 'DISK' },
      'btn-sync': { name: 'sync', led: 'led-sync', label: 'SYNC' },
      'btn-sample': { name: 'sample', led: 'led-sample', label: 'SAMPLE' },
    };

    for (const [btnId, mod] of Object.entries(modules)) {
      this._bindBtn(btnId, () => {
        if (this.activeModule === mod.name) {
          // Deactivate module
          this.activeModule = null;
          this._led(mod.led, false);
          document.getElementById(btnId).classList.remove('active');
          this.editParam = null;
          this.numericBuffer = '';
          this.pendingAction = null;
          this.display.unlock();
          this.display.setMode('segment');
        } else {
          // Deactivate previous module
          if (this.activeModule) {
            for (const [id, m] of Object.entries(modules)) {
              this._led(m.led, false);
              document.getElementById(id)?.classList.remove('active');
            }
          }
          // Activate this module
          this.activeModule = mod.name;
          this._led(mod.led, true);
          document.getElementById(btnId).classList.add('active');
          this.editParam = 'module-func';
          this.numericBuffer = '';
          // Show module name persistently (lock display)
          this.display.lock();
          this.display.setLine1(mod.label);
          this.display.setLine2('Enter option #');

          // Sample module auto-enters VU mode (function 1)
          if (mod.name === 'sample') {
            this.display.setLine1('VU Mode');
            this.display.setLine2('A1     0dB');
          }
        }
      });
    }
  }

  _exitModule() {
    if (!this.activeModule) return;
    const moduleIds = { 'setup': 'btn-setup', 'disk': 'btn-disk', 'sync': 'btn-sync', 'sample': 'btn-sample' };
    const ledIds = { 'setup': 'led-setup', 'disk': 'led-disk', 'sync': 'led-sync', 'sample': 'led-sample' };
    this._led(ledIds[this.activeModule], false);
    const btnId = moduleIds[this.activeModule];
    if (btnId) document.getElementById(btnId)?.classList.remove('active');
    this.activeModule = null;
    this.editParam = null;
    this.numericBuffer = '';
    this.pendingAction = null;
    this.display.unlock();
    this.display.setMode('segment');
  }

  _handleModuleFunction(funcNum) {
    const mod = this.activeModule;
    if (!mod) return;

    // Setup module functions
    if (mod === 'setup') {
      switch (funcNum) {
        case 11: // Multi-pitch
          this.editParam = 'select-pad';
          this.pendingAction = 'multi-pitch';
          this.display.flash('Multi Pitch', 'Select a pad');
          break;
        case 12: // Multi-level
          this.editParam = 'select-pad';
          this.pendingAction = 'multi-level';
          this.display.flash('Multi Level', 'Select a pad');
          break;
        case 13: // Exit multi
          this.engine.send({ type: 'exit-multi' });
          this.display.flash('Exit Multi', 'Done');
          break;
        case 14: // Dynamic buttons
          this.dynamicButtons = !this.dynamicButtons;
          this.engine.send({ type: 'dynamic-buttons', enabled: this.dynamicButtons });
          this.display.flash('Dynamic Btns', this.dynamicButtons ? 'On' : 'Off');
          break;
        case 15: // Define mix
          this.editParam = 'define-mix';
          this.numericBuffer = '';
          this.display.flash('Define Mix', 'Enter slot 1-8');
          break;
        case 16: // Select mix
          this.editParam = 'select-mix';
          this.numericBuffer = '';
          this.display.flash('Select Mix', 'Enter slot 1-8');
          break;
        case 17: // Channel assign
          this.editParam = 'select-pad';
          this.pendingAction = 'channel-assign';
          this.display.flash('Channel Assign', 'Select a pad');
          break;
        case 18: // Decay/tune select
          this.editParam = 'select-pad';
          this.pendingAction = 'decay-tune';
          this.display.flash('Decay/Tune Sel', 'Select a pad');
          break;
        case 19: // Loop/Truncate
          this.editParam = 'select-pad';
          this.pendingAction = 'truncate';
          this.display.flash('Loop/Truncate', 'Select a pad');
          break;
        case 20: // Delete sound
          this.editParam = 'select-pad';
          this.pendingAction = 'delete-sound';
          this.display.flash('Delete Sound', 'Select a pad');
          break;
        case 23: // Special menu
          this.editParam = 'special-menu';
          this.numericBuffer = '';
          this.display.flash('Special Menu', 'Enter function #');
          break;
        default:
          this.display.flash('Setup ' + funcNum, 'Not available');
      }
    }
    // Sample module
    else if (mod === 'sample') {
      switch (funcNum) {
        case 1:
          this.display.flash('VU Mode', 'Monitor input');
          break;
        case 2:
          this.editParam = 'assign-voice';
          this.numericBuffer = '';
          this.display.flash('Assign Voice', 'Select Bank+Pad');
          break;
        case 3:
          this.editParam = 'sample-level';
          this.display.flash('Input Level', 'Use +/- keys');
          break;
        case 7:
          this.display.flash('Arm Sampling', 'Waiting...');
          break;
        case 9:
          this.display.flash('Force Sample', 'Recording...');
          break;
        default:
          this.display.flash('Sample ' + funcNum, 'Active');
      }
    }
    // Sync module
    else if (mod === 'sync') {
      const labels = { 1: 'Internal', 2: 'MIDI', 3: 'SMPTE', 4: 'Click' };
      const details = { 1: 'Int clock', 2: 'MIDI sync', 3: 'Use +/- rate', 4: 'Ext clock' };
      this.engine.send({ type: 'set-sync', mode: funcNum });
      this.display.flash('Sync: ' + (labels[funcNum] || funcNum), details[funcNum] || '');
    }
    // Disk module
    else if (mod === 'disk') {
      const labels = { 0: 'Load All', 1: 'Save Sequences', 2: 'Save Sounds', 3: 'Load Sequences', 4: 'Load Segment#', 5: 'Load Sounds', 6: 'Load Sound#', 7: 'Cat Sequences', 8: 'Cat Sounds', 9: 'Save All As' };
      this.display.flash('Disk: ' + (labels[funcNum] || funcNum), 'Processing...');
      // Disk operations would need IndexedDB integration
    }

    this.editParam = this.editParam || null;
    this.numericBuffer = '';
  }

  // ── Programming buttons (9 dual-function toggles) ──────────────────────
  _bindProgramming() {
    // Initialize Segment LED as active (segment mode is the default)
    this._led('led-segment', true);

    document.querySelectorAll('.prog').forEach(btn => {
      const upper = btn.dataset.upper;
      const lower = btn.dataset.lower;
      this.progStates[btn.id] = 'upper';

      btn.addEventListener('click', () => {
        const state = this.progStates[btn.id];
        const newState = state === 'upper' ? 'lower' : 'upper';
        this.progStates[btn.id] = newState;
        const func = newState === 'upper' ? upper : lower;

        btn.classList.toggle('active');

        // Toggle Song/Segment LEDs for prog-1
        if (btn.id === 'prog-1') {
          this._led('led-song', newState === 'upper');
          this._led('led-segment', newState === 'lower');
        }

        this._execProgFunction(func, btn);
      });
    });
  }

  _execProgFunction(func, btn) {
    const QUANT_GRIDS  = [96, 48, 32, 24, 16, 12, 1];
    const QUANT_LABELS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'HiRes'];

    switch (func) {
      case 'song':
        this.mode = 'song';
        this.engine.setMode('song');
        this.display.flash('Song Mode', 'Use + and -');
        break;

      case 'segment':
        this.mode = 'segment';
        this.engine.setMode('segment');
        this.editParam = 'segment';
        this.numericBuffer = '';
        this.display.flash('Segment Mode', 'Seg:' + String(this.currentSegment + 1).padStart(2, '0'));
        break;

      case 'trigger':
        btn.classList.toggle('active');
        break;

      case 'metronome':
        this.metronomeOn = !this.metronomeOn;
        this.engine.send({ type: 'set-metronome', enabled: this.metronomeOn });
        this.display.flash(
          this.metronomeOn ? 'Click On' : 'Click Off',
          this.metronomeOn ? 'Metronome on' : 'Metronome off'
        );
        break;

      case 'repeat':
        btn.classList.toggle('active');
        break;

      case 'swing': {
        // SP-1200 specific swing values: 50, 54, 58, 63, 67, 71
        const SW = [50, 54, 58, 63, 67, 71];
        let si = SW.indexOf(this.swingAmount);
        if (si === -1) si = 0;
        si = (si + 1) % SW.length;
        this.swingAmount = SW[si];
        this.engine.setSwing(this.swingAmount);
        this.display.flash('Swing: ' + this.swingAmount + '%', this.swingAmount === 50 ? 'No swing' : 'Swing active');
        break;
      }

      case 'tabsong':
        this.display.setMode('TABSONG');
        break;

      case 'copy':
        this.editParam = 'copy';
        this.numericBuffer = '';
        this.display.flash('Copy to?', 'Enter seg number');
        break;

      case 'end':
        this.engine.send({ type: 'song-end-mark' });
        this.display.flash('End Mark', 'Song end set');
        break;

      case 'time-sig':
        this.editParam = 'time-sig';
        this.numericBuffer = '';
        this.display.flash('Time Sig', this.timeSig);
        break;

      case 'insert':
        this.engine.send({ type: 'song-insert', segment: this.currentSegment });
        this.display.flash('Insert', 'Seg inserted');
        break;

      case 'seg-length':
        this.editParam = 'seg-length';
        this.numericBuffer = '';
        this.display.flash('Seg Length', this.segmentLength + ' Bars');
        break;

      case 'delete':
        this.engine.send({ type: 'song-delete' });
        this.display.flash('Delete', 'Step removed');
        break;

      case 'erase':
        if (this.playing) {
          // Real-time erase: hold erase + tap pad to remove that sound's events
          this.eraseMode = !this.eraseMode;
          this.display.flash(
            this.eraseMode ? 'Erase On' : 'Erase Off',
            this.eraseMode ? 'Tap pad to erase' : ''
          );
        } else {
          // Stopped: prompt for segment number to erase
          this.editParam = 'erase-seg';
          this.numericBuffer = '';
          this.display.flash('Erase Seg?', 'Enter seg number');
        }
        break;

      case 'tempo-change':
        this.editParam = 'bpm';
        this.numericBuffer = '';
        this.display.flash('Tempo: ' + this.bpm, 'Use +/- or keys');
        break;

      case 'auto-correct': {
        // Cycle through quantize values on each press
        this.quantizeIndex = (this.quantizeIndex + 1) % QUANT_GRIDS.length;
        this.quantizeGrid = QUANT_GRIDS[this.quantizeIndex];
        this.engine.setQuantize(this.quantizeGrid);
        this.display.flash('Auto-Correct', QUANT_LABELS[this.quantizeIndex]);
        break;
      }

      case 'mix-change':
        this.display.setMode('MIX CHG');
        break;

      case 'step-program':
        this.stepProgramMode = !this.stepProgramMode;
        if (this.stepProgramMode) {
          this.mode = 'step-edit';
          this.engine.setMode('step-edit');
          document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: true, quantize: this.quantizeGrid, bars: this.segmentLength } }));
        } else {
          this.mode = 'segment';
          this.engine.setMode('segment');
          document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: false } }));
          this.display.setMode('segment');
        }
        break;
    }
  }

  _flashDisplay() {
    setTimeout(() => {
      if (this.activeModule) return; // Don't override module display
      if (!this.editParam) {
        this.display.setMode(this.mode === 'song' ? 'song' : this.mode === 'step-edit' ? 'step' : 'segment');
      }
    }, 800);
  }

  // ── Mode button (cycles Tune/Decay → Mix/Volume → Multi Mode) ─────────
  _bindModeButton() {
    const modes = ['volume', 'pitch', 'decay'];
    const labels = ['MIX', 'TUNE', 'DECAY'];
    const ledIds = ['led-mix', 'led-tune', 'led-multi'];
    let modeIndex = 0;
    this._led('led-mix', true); // MIX active by default

    const btn = document.getElementById('btn-mode');
    if (!btn) return;

    btn.addEventListener('click', () => {
      modeIndex = (modeIndex + 1) % modes.length;
      this.faderMode = modes[modeIndex];
      document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: this.faderMode } }));
      this.display.flash(labels[modeIndex], 'Mode selected');
      // Update LEDs
      ledIds.forEach(id => this._led(id, false));
      this._led(ledIds[modeIndex], true);
    });
  }

  // ── Master Control (Tempo, Nav, Enter) ─────────────────────────────────
  _bindMasterControl() {
    this._bindBtn('btn-tempo', () => {
      this.editParam = 'bpm';
      this.numericBuffer = '';
      this.display.setMode('TEMPO');
      document.getElementById('btn-tempo').classList.add('active');
    });

    this._bindBtn('btn-nav-left', () => this._handleNav(-1));
    this._bindBtn('btn-nav-right', () => this._handleNav(1));

    this._bindBtn('btn-enter', () => this._confirmEntry());
  }

  _confirmEntry() {
    if (this.numericBuffer.length > 0) {
      const val = parseInt(this.numericBuffer, 10);

      switch (this.editParam) {
        case 'bpm':
          if (val >= 30 && val <= 250) {
            this.bpm = val;
            this.engine.setBpm(this.bpm);
            this.display.setBpm(this.bpm);
            this.display.flash('Tempo: ' + this.bpm, 'BPM set');
          } else {
            this.display.flash('Invalid BPM', '30-250 only');
          }
          break;

        case 'segment':
        case 'pattern':
          if (val >= 0 && val <= 99) {
            this.currentSegment = val;
            this.engine.selectPattern(this.currentSegment);
            this.display.setPattern(this.currentSegment);
            this.display.flash('Seg:' + String(val + 1).padStart(2, '0'), 'Selected');
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'seg-length':
          if (val >= 1 && val <= 99) {
            this.segmentLength = val;
            this.engine.send({ type: 'set-bars', bars: val });
            this.display.flash('Seg Length', val + ' Bars');
          } else {
            this.display.flash('Invalid', '1-99 bars');
          }
          break;

        case 'copy':
          if (val >= 0 && val <= 99) {
            this.engine.send({ type: 'copy-segment', from: this.currentSegment, to: val });
            this.display.flash('Copied', 'Seg ' + (this.currentSegment + 1) + ' > ' + (val + 1));
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'erase-seg':
          if (val >= 0 && val <= 99) {
            this.engine.send({ type: 'erase-segment', segment: val });
            this.display.flash('Erased', 'Seg ' + (val + 1));
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'swing':
          if (val >= 50 && val <= 75) {
            this.swingAmount = val;
            this.engine.setSwing(this.swingAmount);
            this.display.flash('Swing', val + '%');
          } else {
            this.display.flash('Invalid', '50-75% only');
          }
          break;

        case 'define-mix':
          if (val >= 1 && val <= 8) {
            this.engine.send({ type: 'define-mix', slot: val - 1 });
            this.display.flash('Mix ' + val, 'Saved');
          }
          break;
        case 'select-mix':
          if (val >= 1 && val <= 8) {
            this.engine.send({ type: 'select-mix', slot: val - 1 });
            this.display.flash('Mix ' + val, 'Recalled');
          }
          break;

        default:
          // No active edit param — treat as segment selection
          if (val >= 0 && val <= 99) {
            this.currentSegment = val;
            this.engine.selectPattern(this.currentSegment);
            this.display.setPattern(this.currentSegment);
          }
          break;
      }

      this.numericBuffer = '';
    }

    this.editParam = null;
    const tempoBtn = document.getElementById('btn-tempo');
    if (tempoBtn) tempoBtn.classList.remove('active');
    this._flashDisplay();
  }

  _handleNav(dir) {
    const QUANT_GRIDS  = [96, 48, 32, 24, 16, 12, 1];
    const QUANT_LABELS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'HiRes'];
    const TIME_SIGS = ['4/4', '3/4', '6/8', '5/4', '7/8'];

    switch (this.editParam) {
      case 'bpm':
        this.bpm = Math.max(30, Math.min(250, this.bpm + dir));
        this.engine.setBpm(this.bpm);
        this.display.flash('Tempo: ' + this.bpm, 'BPM');
        break;
      case 'swing': {
        const SW = [50, 54, 58, 63, 67, 71];
        let si = SW.indexOf(this.swingAmount);
        if (si === -1) si = 0;
        si = Math.max(0, Math.min(SW.length - 1, si + dir));
        this.swingAmount = SW[si];
        this.engine.setSwing(this.swingAmount);
        this.display.flash('Swing: ' + this.swingAmount + '%', this.swingAmount === 50 ? 'No swing' : 'Swing active');
        break;
      }
      case 'quantize':
        this.quantizeIndex = Math.max(0, Math.min(QUANT_GRIDS.length - 1, this.quantizeIndex + dir));
        this.quantizeGrid = QUANT_GRIDS[this.quantizeIndex];
        this.engine.setQuantize(this.quantizeGrid);
        this.display.flash('Auto-Correct', QUANT_LABELS[this.quantizeIndex]);
        break;
      case 'seg-length':
        this.segmentLength = Math.max(1, Math.min(99, this.segmentLength + dir));
        this.engine.send({ type: 'set-bars', bars: this.segmentLength });
        this.display.flash('Seg Length', this.segmentLength + ' Bars');
        break;
      case 'time-sig': {
        const curIdx = TIME_SIGS.indexOf(this.timeSig);
        const newIdx = Math.max(0, Math.min(TIME_SIGS.length - 1, (curIdx === -1 ? 0 : curIdx) + dir));
        this.timeSig = TIME_SIGS[newIdx];
        this.engine.send({ type: 'set-time-sig', timeSig: this.timeSig });
        this.display.flash('Time Sig', this.timeSig);
        break;
      }
      default:
        // Default: navigate segments
        this.currentSegment = Math.max(0, Math.min(99, this.currentSegment + dir));
        this.engine.selectPattern(this.currentSegment);
        this.display.setPattern(this.currentSegment);
        break;
    }
  }

  // ── Numeric Keypad ─────────────────────────────────────────────────────
  _bindNumericKeypad() {
    // Digits 0-9. Key 7 also = No, Key 9 also = Yes (dual function)
    document.querySelectorAll('.key').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;

        // If a module is active, route digit to module function
        if (this.editParam === 'module-func') {
          this.numericBuffer += key;
          this.display.setMode(this.activeModule.toUpperCase() + ' ' + this.numericBuffer);
          // Setup uses 2-digit numbers (11-23), others use 1 digit
          if (this.activeModule === 'setup' && this.numericBuffer.length >= 2) {
            this._handleModuleFunction(parseInt(this.numericBuffer, 10));
          } else if (this.activeModule !== 'setup') {
            this._handleModuleFunction(parseInt(this.numericBuffer, 10));
          }
          return;
        }

        // Normal numeric entry
        this.numericBuffer += key;
        if (this.editParam === 'bpm') {
          this.display.flash('Tempo: ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 3) this._confirmEntry();
        } else if (this.editParam === 'segment' || this.editParam === 'copy' || this.editParam === 'erase-seg') {
          this.display.flash('Seg: ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else if (this.editParam === 'seg-length') {
          this.display.flash('Bars: ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else if (this.editParam === 'swing') {
          this.display.flash('Swing: ' + this.numericBuffer + '%', 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else {
          // No active edit — treat as segment selection
          if (!this.editParam) this.editParam = 'segment';
          this.display.flash('Seg: ' + this.numericBuffer, '');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        }
      });
    });
  }

  _bindQuantize() {
    const sel = document.getElementById('quantize-select');
    if (sel) sel.addEventListener('change', (e) => {
      this.quantizeGrid = parseInt(e.target.value, 10);
      this.engine.setQuantize(this.quantizeGrid);
    });
  }

  _bindSwing() {
    const slider = document.getElementById('swing-slider');
    const label = document.getElementById('swing-value');
    if (slider) slider.addEventListener('input', () => {
      this.swingAmount = parseInt(slider.value, 10);
      if (label) label.textContent = this.swingAmount + '%';
      this.engine.setSwing(this.swingAmount);
    });
  }

  _bindBanks() {
    // Single cycling bank button (A → B → C → D → A)
    let currentBank = 0;
    const bankLeds = ['led-bank-a', 'led-bank-b', 'led-bank-c', 'led-bank-d'];
    this._led('led-bank-a', true); // Bank A active by default
    const bankBtn = document.getElementById('btn-bank');
    if (bankBtn) {
      bankBtn.addEventListener('click', () => {
        currentBank = (currentBank + 1) % 4;
        this.display.setBank(currentBank);
        document.dispatchEvent(new CustomEvent('bank-change', { detail: { bank: currentBank } }));
        bankLeds.forEach(id => this._led(id, false));
        this._led(bankLeds[currentBank], true);
      });
    }
  }

  _bindPadActions() {
    document.querySelectorAll('.pad').forEach(el => {
      el.addEventListener('mousedown', () => {
        const pad = parseInt(el.dataset.pad, 10);
        if (this.editParam === 'select-pad' && this.pendingAction) {
          switch (this.pendingAction) {
            case 'multi-pitch':
              this.engine.send({ type: 'multi-pitch', pad });
              this.display.flash('Multi Pitch', 'Pad ' + (pad + 1));
              break;
            case 'multi-level':
              this.engine.send({ type: 'multi-level', pad });
              this.display.flash('Multi Level', 'Pad ' + (pad + 1));
              break;
            case 'delete-sound':
              this.engine.send({ type: 'delete-sound', pad });
              this.display.flash('Deleted', 'Pad ' + (pad + 1));
              break;
            case 'decay-tune':
              // Toggle between tune and decay for this pad
              this.engine.send({ type: 'decay-tune-toggle', pad });
              this.display.flash('Pad ' + (pad + 1), 'Toggled');
              break;
            case 'truncate':
              this.display.flash('Truncate', 'Pad ' + (pad + 1) + ' Use faders');
              break;
            case 'channel-assign':
              this.display.flash('Ch Assign', 'Pad ' + (pad + 1) + ' Enter ch');
              break;
          }
          this.editParam = null;
          this.pendingAction = null;
        } else if (this.activeModule && !this.pendingAction) {
          // Pad clicked while module active but no pending action → exit module
          this._exitModule();
        }
      });
    });
  }

  _bindBtn(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  _led(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', on);
  }
}

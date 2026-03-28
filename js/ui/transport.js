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
    this._pendingPad = null;
    this.sampleGainIndex = 0;
    this.selectedSamplePad = 0;
    this.smpteIndex = 0;
    this.currentSong = 0;
    this.multiMode = null; // null | 'pitch' | 'level'

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
      if (this.playing) {
        // Already playing — toggle recording on/off (overdub)
        this.recording = !this.recording;
        if (this.recording) this.engine.record();
        document.getElementById('btn-record').classList.toggle('active', this.recording);
        this._led('led-record', this.recording);
      } else {
        // Not playing — arm recording, then start playback
        this.recording = true;
        this.engine.record();
        document.getElementById('btn-record').classList.add('active');
        this._led('led-record', true);
        this._play();
      }
    });

    // Tap/Repeat: click = tap tempo, hold + pad = retrigger at autocorrect rate
    const tapBtn = document.getElementById('btn-tap-tempo');
    this.tapRepeatHeld = false;
    this._repeatInterval = null;
    tapBtn.addEventListener('mousedown', () => {
      this.tapRepeatHeld = true;
      this._handleTapTempo();
    });
    tapBtn.addEventListener('mouseup', () => {
      this.tapRepeatHeld = false;
      if (this._repeatInterval) { clearInterval(this._repeatInterval); this._repeatInterval = null; }
    });
    tapBtn.addEventListener('mouseleave', () => {
      this.tapRepeatHeld = false;
      if (this._repeatInterval) { clearInterval(this._repeatInterval); this._repeatInterval = null; }
    });

    // Keyboard shortcuts handled in keyboard.js
  }

  _play() {
    this.playing = true;
    this.engine.play();
    this.display.setPlaying(true);
    document.getElementById('btn-run-stop').classList.add('active');
    this._led('led-run', true);
  }

  _stop() {
    this.playing = false;
    this.recording = false;
    this.engine.stop();
    this.display.setPlaying(false);
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
          if (mod.name === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
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
            if (this.activeModule === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
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

          // Sample module auto-enters VU mode with live VU meter
          if (mod.name === 'sample') {
            this.display.setLine1(this._vuPadLabel());
            document.dispatchEvent(new Event('sample-start-vu'));
          }
        }
      });
    }
  }

  _exitModule() {
    if (!this.activeModule) return;
    if (this.activeModule === 'sample') {
      document.dispatchEvent(new Event('sample-stop-vu'));
    }
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

  _moduleDisplay(line1, line2) {
    this.display.lock();
    this.display.setLine1(line1);
    this.display.setLine2(line2 || '');
  }

  _handleModuleFunction(funcNum) {
    const mod = this.activeModule;
    if (!mod) return;

    if (mod === 'setup') {
      switch (funcNum) {
        case 11:
          this.editParam = 'select-pad';
          this.pendingAction = 'multi-pitch';
          this._moduleDisplay('Multi Pitch', 'Select a pad');
          break;
        case 12:
          this.editParam = 'select-pad';
          this.pendingAction = 'multi-level';
          this._moduleDisplay('Multi Level', 'Select a pad');
          break;
        case 13:
          this.engine.send({ type: 'exit-multi' });
          this.multiMode = null;
          this._led('led-multi', false);
          this.display.flash('Exit Multi', 'Done');
          break;
        case 14:
          this.editParam = 'dynamic-confirm';
          this._moduleDisplay('Dynamic Btns', 'Yes=9 No=7');
          break;
        case 15:
          this.editParam = 'define-mix';
          this.numericBuffer = '';
          this._moduleDisplay('Define Mix', 'Enter slot 1-8');
          break;
        case 16:
          this.editParam = 'select-mix';
          this.numericBuffer = '';
          this._moduleDisplay('Select Mix', 'Enter slot 1-8');
          break;
        case 17:
          this.editParam = 'select-pad';
          this.pendingAction = 'channel-assign';
          this._moduleDisplay('Channel Assign', 'Select a pad');
          break;
        case 18:
          this.editParam = 'select-pad';
          this.pendingAction = 'decay-tune';
          this._moduleDisplay('Decay/Tune Sel', 'Select a pad');
          break;
        case 19:
          this.editParam = 'select-pad';
          this.pendingAction = 'truncate';
          this._moduleDisplay('Loop/Truncate', 'Select a pad');
          break;
        case 20:
          this.editParam = 'select-pad';
          this.pendingAction = 'delete-sound';
          this._moduleDisplay('Delete Sound', 'Select a pad');
          break;
        case 22:
          this.editParam = 'dynamic-alloc-confirm';
          this._moduleDisplay('Dyn Alloc', 'Yes=9 No=7');
          break;
        case 23:
          this.editParam = 'special-menu';
          this.numericBuffer = '';
          this._moduleDisplay('Special Menu', 'Enter function #');
          break;
        case 25:
          this.editParam = 'select-pad';
          this.pendingAction = 'reverse-sound';
          this._moduleDisplay('Reverse Sound', 'Select a pad');
          break;
        default:
          this.display.flash('Setup ' + funcNum, 'Not available');
      }
    }
    else if (mod === 'sample') {
      switch (funcNum) {
        case 1: // VU Mode — monitor input with live meter
          this.editParam = null;
          this.display.lock();
          this.display.setLine1(this._vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
          break;
        case 2: // Assign Voice — select pad for sampling
          this.editParam = 'select-pad';
          this.pendingAction = 'assign-voice';
          this._moduleDisplay('Assign Voice', 'Select a pad');
          break;
        case 3: // Input Level — cycle 0/+20/+40 dB with arrows
          this.editParam = 'sample-level';
          this._moduleDisplay('Input Level', this._gainLabel());
          break;
        case 4: // Threshold — arm with slider
          this.editParam = 'threshold';
          this._moduleDisplay('Arm Threshold', 'Use Slider #1');
          break;
        case 5: // Sample Length
          this.editParam = 'sample-length';
          this._moduleDisplay('Sample Length', '2.5s Slider #1');
          break;
        case 6: // Resample
          this.display.flash('Resample', 'Last pad');
          break;
        case 7: // Arm Sampling — waits for threshold breach
          this._moduleDisplay('Sample Armed', 'Waiting...');
          this._listenSampleDone();
          document.dispatchEvent(new Event('sample-arm'));
          document.dispatchEvent(new Event('sample-start-vu'));
          break;
        case 9: // Force Sample — record immediately
          this._moduleDisplay('Sampling...', '');
          this._listenSampleDone();
          document.dispatchEvent(new Event('sample-force'));
          break;
        default:
          this.display.flash('Sample ' + funcNum, 'Not available');
      }
    }
    else if (mod === 'sync') {
      switch (funcNum) {
        case 1:
          this.engine.send({ type: 'set-sync', mode: 1 });
          this._moduleDisplay('Select', 'Internal');
          break;
        case 2:
          this.engine.send({ type: 'set-sync', mode: 2 });
          this._moduleDisplay('Select', 'MIDI');
          break;
        case 3:
          this.editParam = 'smpte-rate';
          this._moduleDisplay('SMPTE Format is', this._smpteLabel());
          break;
        case 4:
          this.editParam = 'click-divisor';
          this.numericBuffer = '';
          this._moduleDisplay('Click Divisor', 'Enter value');
          break;
        default:
          this.display.flash('Sync ' + funcNum, 'Not available');
      }
    }
    else if (mod === 'disk') {
      switch (funcNum) {
        case 0:
          this._moduleDisplay('Load All', 'Select file +/-');
          this.editParam = 'disk-browse';
          break;
        case 1:
          this._moduleDisplay('Save Sequences', 'Processing...');
          break;
        case 2:
          this._moduleDisplay('Save Sounds', 'Processing...');
          break;
        case 3:
          this._moduleDisplay('Load Sequences', 'Select file +/-');
          this.editParam = 'disk-browse';
          break;
        case 4:
          this.editParam = 'disk-seg-num';
          this.numericBuffer = '';
          this._moduleDisplay('Load Segment #', 'Enter 2-digit #');
          break;
        case 5:
          this._moduleDisplay('Load Sounds', 'Select file +/-');
          this.editParam = 'disk-browse';
          break;
        case 6:
          this.editParam = 'select-pad';
          this.pendingAction = 'load-sound-pad';
          this._moduleDisplay('Load Sound #', 'Select a pad');
          break;
        case 7:
          this._moduleDisplay('Cat Sequences', 'Use +/- browse');
          this.editParam = 'disk-browse';
          break;
        case 8:
          this._moduleDisplay('Cat Sounds', 'Use +/- browse');
          this.editParam = 'disk-browse';
          break;
        case 9:
          this.editParam = 'disk-name';
          this._moduleDisplay('Save All As', 'Use slider name');
          break;
        default:
          this.display.flash('Disk ' + funcNum, 'Not available');
      }
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
        this.display.setSong(this.currentSong);
        this.display.setMode('song');
        break;

      case 'segment':
        this.mode = 'segment';
        this.engine.setMode('segment');
        this.editParam = 'segment';
        this.numericBuffer = '';
        this.display.setMode('segment'); // shows Seg XX + BPM
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

      case 'swing':
        this.editParam = 'swing';
        this._moduleDisplay('Swing ' + this.swingAmount + '%', 'Use +/- arrows');
        break;

      case 'tabsong':
        this.display.setMode('TABSONG');
        break;

      case 'copy':
        this.editParam = 'copy';
        this.numericBuffer = '';
        this._moduleDisplay('Copy to?', 'Enter seg number');
        break;

      case 'end':
        this.engine.send({ type: 'song-end-mark' });
        this.display.flash('End Mark', 'Song end set');
        break;

      case 'time-sig':
        this.editParam = 'time-sig';
        this.numericBuffer = '';
        this._moduleDisplay('Time Sig', this.timeSig);
        break;

      case 'insert':
        this.engine.send({ type: 'song-insert', segment: this.currentSegment });
        this.display.flash('Insert', 'Seg inserted');
        break;

      case 'seg-length':
        this.editParam = 'seg-length';
        this.numericBuffer = '';
        this._moduleDisplay('Seg Length', this.segmentLength + ' Bars');
        break;

      case 'delete':
        this.engine.send({ type: 'song-delete' });
        this.display.flash('Delete', 'Step removed');
        break;

      case 'erase':
        if (this.playing) {
          this.eraseMode = !this.eraseMode;
          this._moduleDisplay(
            this.eraseMode ? 'Erase On' : 'Erase Off',
            this.eraseMode ? 'Hold pad' : ''
          );
        } else {
          this.editParam = 'erase-seg';
          this.numericBuffer = '';
          this._moduleDisplay('Erase Seg?', 'Enter seg number');
        }
        break;

      case 'tempo-change':
        this.editParam = 'bpm';
        this.numericBuffer = '';
        this._moduleDisplay('Tempo ' + Math.round(this.bpm), 'Use +/- or keys');
        break;

      case 'auto-correct':
        this.editParam = 'quantize';
        this._moduleDisplay('Auto-Correct', QUANT_LABELS[this.quantizeIndex]);
        break;

      case 'mix-change':
        this.display.setMode('MIX CHG');
        break;

      case 'step-program':
        this.stepProgramMode = !this.stepProgramMode;
        if (this.stepProgramMode) {
          this.mode = 'step-edit';
          this.engine.setMode('step-edit');
          // Per manual: Record LED on, Run LED stays off
          this._led('led-record', true);
          this._led('led-run', false);
          document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: true, quantize: this.quantizeGrid, bars: this.segmentLength } }));
        } else {
          this.mode = 'segment';
          this.engine.setMode('segment');
          this._led('led-record', false);
          document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: false } }));
          this.display.setMode('segment');
        }
        break;
    }
  }

  _flashDisplay() {
    setTimeout(() => {
      if (this.activeModule) return;
      if (this.editParam) {
        // Still in an edit mode — don't override
        return;
      }
      this.display.unlock();
      this.display.setMode(this.mode === 'song' ? 'song' : this.mode === 'step-edit' ? 'step' : 'segment');
    }, 800);
  }

  // ── Mode button (toggles Mix ↔ Tune) ───────────────────────────────────
  // Multi LED is separate — controlled by Setup 11/12/13, not the mode button.
  _bindModeButton() {
    const modes = ['volume', 'pitch'];
    const labels = ['MIX', 'TUNE'];
    const ledIds = ['led-mix', 'led-tune'];
    let modeIndex = 0;
    this._led('led-mix', true); // MIX active by default

    const btn = document.getElementById('btn-mode');
    if (!btn) return;

    btn.addEventListener('click', () => {
      modeIndex = (modeIndex + 1) % modes.length;
      this.faderMode = modes[modeIndex];
      document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: this.faderMode } }));
      this.display.flash(labels[modeIndex], 'Mode selected');
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
          this.display.unlock();
          if (val >= 30 && val <= 250) {
            this.bpm = val;
            this.engine.setBpm(this.bpm);
            this.display.setBpm(this.bpm);
            this.display.flash('Tempo ' + Math.round(this.bpm), 'BPM set');
          } else {
            this.display.flash('Invalid BPM', '30-250 only');
          }
          break;

        case 'segment':
        case 'pattern':
          this.display.unlock();
          if (val >= 0 && val <= 99) {
            this.currentSegment = val;
            this.engine.selectPattern(this.currentSegment);
            this.display.setPattern(this.currentSegment);
            this.display.flash('Seg ' + String(val + 1).padStart(2, '0'), 'Selected');
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'seg-length':
          this.display.unlock();
          if (val >= 1 && val <= 99) {
            this.segmentLength = val;
            this.engine.send({ type: 'set-bars', bars: val });
            this.display.flash('Seg Length', val + ' Bars');
          } else {
            this.display.flash('Invalid', '1-99 bars');
          }
          break;

        case 'copy':
          this.display.unlock();
          if (val >= 0 && val <= 99) {
            this.engine.send({ type: 'copy-segment', from: this.currentSegment, to: val });
            this.display.flash('Copied', 'Seg ' + (this.currentSegment + 1) + ' > ' + (val + 1));
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'erase-seg':
          this.display.unlock();
          if (val >= 0 && val <= 99) {
            this.engine.send({ type: 'erase-segment', segment: val });
            this.display.flash('Erased', 'Seg ' + (val + 1));
          } else {
            this.display.flash('Invalid Seg', '0-99 only');
          }
          break;

        case 'swing':
          this.display.unlock();
          if (val >= 50 && val <= 75) {
            this.swingAmount = val;
            this.engine.setSwing(this.swingAmount);
            this.display.flash('Swing', val + '%');
          } else {
            this.display.flash('Invalid', '50-75% only');
          }
          break;

        case 'define-mix':
          this.display.unlock();
          if (val >= 1 && val <= 8) {
            this.engine.send({ type: 'define-mix', slot: val - 1 });
            this.display.flash('Mix ' + val, 'Saved');
          }
          break;
        case 'select-mix':
          this.display.unlock();
          if (val >= 1 && val <= 8) {
            this.engine.send({ type: 'select-mix', slot: val - 1 });
            this.display.flash('Mix ' + val, 'Recalled');
          }
          break;

        case 'channel-assign-num':
          if (this.numericBuffer.length > 0) {
            const ch = parseInt(this.numericBuffer, 10);
            if (ch >= 1 && ch <= 6) {
              this.engine.send({ type: 'channel-assign', pad: this._pendingPad, channel: ch });
              this.display.flash('Ch ' + ch, 'Pad ' + (this._pendingPad + 1));
            }
          }
          this._pendingPad = null;
          this.editParam = 'module-func';
          break;

        case 'click-divisor':
          if (this.numericBuffer.length > 0) {
            const div = parseInt(this.numericBuffer, 10);
            this.engine.send({ type: 'set-click-divisor', divisor: div });
            this.display.flash('Click Div', div.toString());
          }
          this.editParam = 'module-func';
          break;

        case 'disk-seg-num':
          if (this.numericBuffer.length > 0) {
            const segNum = parseInt(this.numericBuffer, 10);
            this.display.flash('Load Seg', String(segNum).padStart(2, '0'));
          }
          this.editParam = 'module-func';
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
    } else {
      // No numeric buffer — handle confirm for non-numeric editParam states
      switch (this.editParam) {
        case 'sample-level':
          this.editParam = 'module-func';
          this.display.setLine1(this._vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
          break;
        case 'smpte-rate':
          this.editParam = 'module-func';
          this.display.flash('SMPTE Set', this._smpteLabel());
          break;
      }
    }

    // Only clear editParam if not reassigned inside the switch (e.g., back to 'module-func')
    if (this.editParam !== 'module-func') this.editParam = null;
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
        this.display.setBpm(this.bpm);
        this._moduleDisplay('Tempo ' + Math.round(this.bpm), 'BPM');
        break;
      case 'swing': {
        const SW = [50, 54, 58, 63, 67, 71];
        let si = SW.indexOf(this.swingAmount);
        if (si === -1) si = 0;
        si = Math.max(0, Math.min(SW.length - 1, si + dir));
        this.swingAmount = SW[si];
        this.engine.setSwing(this.swingAmount);
        this._moduleDisplay('Swing ' + this.swingAmount + '%', this.swingAmount === 50 ? 'No swing' : 'Swing active');
        break;
      }
      case 'quantize':
        this.quantizeIndex = Math.max(0, Math.min(QUANT_GRIDS.length - 1, this.quantizeIndex + dir));
        this.quantizeGrid = QUANT_GRIDS[this.quantizeIndex];
        this.engine.setQuantize(this.quantizeGrid);
        this._moduleDisplay('Auto-Correct', QUANT_LABELS[this.quantizeIndex]);
        break;
      case 'seg-length':
        this.segmentLength = Math.max(1, Math.min(99, this.segmentLength + dir));
        this.engine.send({ type: 'set-bars', bars: this.segmentLength });
        this._moduleDisplay('Seg Length', this.segmentLength + ' Bars');
        break;
      case 'time-sig': {
        const curIdx = TIME_SIGS.indexOf(this.timeSig);
        const newIdx = Math.max(0, Math.min(TIME_SIGS.length - 1, (curIdx === -1 ? 0 : curIdx) + dir));
        this.timeSig = TIME_SIGS[newIdx];
        this.engine.send({ type: 'set-time-sig', timeSig: this.timeSig });
        this._moduleDisplay('Time Sig', this.timeSig);
        break;
      }
      case 'sample-level': {
        const gains = ['0dB', '+20dB', '+40dB'];
        this.sampleGainIndex = Math.max(0, Math.min(gains.length - 1, this.sampleGainIndex + dir));
        this._moduleDisplay('Input Level', 'Gain: ' + gains[this.sampleGainIndex]);
        break;
      }
      case 'smpte-rate': {
        const rates = ['24fps', '25fps', '30fps', '30-drop'];
        this.smpteIndex = Math.max(0, Math.min(rates.length - 1, this.smpteIndex + dir));
        this._moduleDisplay('SMPTE Format is', rates[this.smpteIndex]);
        break;
      }
      case 'threshold':
      case 'sample-length':
      case 'disk-browse':
      case 'disk-name':
        break;
      default:
        if (this.mode === 'song') {
          this.currentSong = Math.max(0, Math.min(99, this.currentSong + dir));
          this.display.setSong(this.currentSong);
        } else {
          this.currentSegment = Math.max(0, Math.min(99, this.currentSegment + dir));
          this.engine.selectPattern(this.currentSegment);
          this.display.setPattern(this.currentSegment);
        }
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

        // Yes/No confirmation flows (Key 9 = Yes, Key 7 = No)
        if (this.editParam === 'dynamic-confirm') {
          if (key === '9') {
            this.dynamicButtons = true;
            this.engine.send({ type: 'dynamic-buttons', enabled: true });
            this.display.flash('Dynamic Btns', 'On');
          } else if (key === '7') {
            this.dynamicButtons = false;
            this.engine.send({ type: 'dynamic-buttons', enabled: false });
            this.display.flash('Dynamic Btns', 'Off');
          }
          this.editParam = 'module-func';
          this.numericBuffer = '';
          return;
        }

        if (this.editParam === 'dynamic-alloc-confirm') {
          if (key === '9') {
            this.engine.send({ type: 'dynamic-alloc', enabled: true });
            this.display.flash('Dyn Alloc', 'On');
          } else if (key === '7') {
            this.engine.send({ type: 'dynamic-alloc', enabled: false });
            this.display.flash('Dyn Alloc', 'Off');
          }
          this.editParam = 'module-func';
          this.numericBuffer = '';
          return;
        }

        if (this.editParam === 'reverse-confirm') {
          if (key === '9') {
            this.engine.send({ type: 'reverse-sound', pad: this._pendingPad });
            this.display.flash('Reversed', 'Pad ' + (this._pendingPad + 1));
          } else if (key === '7') {
            this.display.flash('Cancelled', '');
          }
          this._pendingPad = null;
          this.editParam = 'module-func';
          this.numericBuffer = '';
          return;
        }

        if (this.editParam === 'decay-tune-select') {
          if (key === '1') {
            this.engine.send({ type: 'set-pad-mode', pad: this._pendingPad, mode: 'tune' });
            this.display.flash('Pad ' + (this._pendingPad + 1), 'Tune');
          } else if (key === '2') {
            this.engine.send({ type: 'set-pad-mode', pad: this._pendingPad, mode: 'decay' });
            this.display.flash('Pad ' + (this._pendingPad + 1), 'Decay');
          }
          this._pendingPad = null;
          this.editParam = 'module-func';
          this.numericBuffer = '';
          return;
        }

        if (this.editParam === 'channel-assign-num') {
          if (key >= '1' && key <= '6') {
            this.numericBuffer = key;
            this._moduleDisplay('Ch ' + key + ' assigned', 'Pad ' + (this._pendingPad + 1));
          }
          return;
        }

        if (this.editParam === 'sample-level' || this.editParam === 'smpte-rate' || this.editParam === 'threshold' || this.editParam === 'sample-length') {
          return;
        }

        if (this.editParam === 'click-divisor') {
          this.numericBuffer += key;
          this._moduleDisplay('Click Divisor', this.numericBuffer);
          return;
        }

        if (this.editParam === 'disk-browse' || this.editParam === 'disk-name') {
          return;
        }

        if (this.editParam === 'disk-seg-num') {
          this.numericBuffer += key;
          this._moduleDisplay('Load Segment #', this.numericBuffer);
          if (this.numericBuffer.length >= 2) this._confirmEntry();
          return;
        }

        // Normal numeric entry
        this.numericBuffer += key;
        if (this.editParam === 'bpm') {
          this._moduleDisplay('Tempo ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 3) this._confirmEntry();
        } else if (this.editParam === 'segment' || this.editParam === 'copy' || this.editParam === 'erase-seg') {
          this._moduleDisplay('Seg ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else if (this.editParam === 'seg-length') {
          this._moduleDisplay('Bars: ' + this.numericBuffer, 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else if (this.editParam === 'swing') {
          this._moduleDisplay('Swing ' + this.numericBuffer + '%', 'Enter to confirm');
          if (this.numericBuffer.length >= 2) this._confirmEntry();
        } else {
          // No active edit — treat as segment selection
          if (!this.editParam) this.editParam = 'segment';
          this._moduleDisplay('Seg ' + this.numericBuffer, '');
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
              this.multiMode = 'pitch';
              this._led('led-multi', true);
              this._led('led-tune', true);
              this._led('led-mix', false);
              this.faderMode = 'pitch';
              document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'pitch' } }));
              this.display.flash('Multi Pitch', 'Pad ' + (pad + 1));
              break;
            case 'multi-level':
              this.engine.send({ type: 'multi-level', pad });
              this.multiMode = 'level';
              this._led('led-multi', true);
              this._led('led-mix', true);
              this._led('led-tune', false);
              this.faderMode = 'volume';
              document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'volume' } }));
              this.display.flash('Multi Level', 'Pad ' + (pad + 1));
              break;
            case 'delete-sound':
              this.engine.send({ type: 'delete-sound', pad });
              this.display.flash('Deleted', 'Pad ' + (pad + 1));
              break;
            case 'decay-tune':
              this._pendingPad = pad;
              this.editParam = 'decay-tune-select';
              this.pendingAction = null;
              this._moduleDisplay('Pad ' + (pad + 1), '1=Tune 2=Decay');
              break;
            case 'truncate':
              this.display.flash('Truncate', 'Pad ' + (pad + 1) + ' Use faders');
              break;
            case 'channel-assign':
              this._pendingPad = pad;
              this.editParam = 'channel-assign-num';
              this.pendingAction = null;
              this._moduleDisplay('Pad ' + (pad + 1), 'Enter ch 1-6');
              break;
            case 'reverse-sound':
              this._pendingPad = pad;
              this.editParam = 'reverse-confirm';
              this.pendingAction = null;
              this._moduleDisplay('Reverse ' + ['A','B','C','D'][this.currentBank] + (pad + 1), 'Yes=9 No=7');
              break;
            case 'assign-voice':
              this.selectedSamplePad = pad;
              this.display.flash('Sampling', ['A','B','C','D'][this.currentBank] + (pad + 1));
              this.editParam = 'module-func';
              this.pendingAction = null;
              break;
            case 'load-sound-pad':
              this.display.flash('Load Sound', 'Pad ' + (pad + 1));
              this.editParam = 'module-func';
              this.pendingAction = null;
              break;
          }
          // Only clear if not reassigned inside the switch
          if (this.editParam === 'select-pad') this.editParam = null;
          if (this.pendingAction && !this.editParam) this.pendingAction = null;
        } else if (this.eraseMode && this.playing) {
          // Real-time erase: pad held while playing erases that pad's events
          this.engine.send({ type: 'erase-track', pad });
        } else if (this.tapRepeatHeld) {
          // Tap/Repeat held + pad → retrigger at autocorrect rate
          const repeatPad = pad;
          // Calculate interval: one autocorrect step duration in ms
          // quarterNote = 60000/bpm, step = quarterNote * (quantizeGrid / 96)
          const msPerQuarter = 60000 / this.bpm;
          const msPerStep = msPerQuarter * this.quantizeGrid / 96;
          // Don't re-trigger immediately (pad already plays from the click)
          if (this._repeatInterval) clearInterval(this._repeatInterval);
          this._repeatInterval = setInterval(() => {
            if (!this.tapRepeatHeld) { clearInterval(this._repeatInterval); this._repeatInterval = null; return; }
            this.engine.trigger(repeatPad, 100);
          }, Math.max(30, msPerStep)); // minimum 30ms to avoid audio overload
        } else if (this.activeModule && !this.pendingAction) {
          // Pad clicked while module active but no pending action → exit module
          this._exitModule();
        }
      });
    });
  }

  _vuPadLabel() {
    const bank = ['A', 'B', 'C', 'D'][this.currentBank];
    const pad = (this.selectedSamplePad || 0) + 1;
    const gains = ['0dB', '+20dB', '+40dB'];
    const gain = gains[this.sampleGainIndex || 0];
    return bank + pad + '     ' + gain;
  }

  _gainLabel() {
    const gains = ['0dB', '+20dB', '+40dB'];
    return 'Gain: ' + gains[this.sampleGainIndex || 0];
  }

  _smpteLabel() {
    const rates = ['24fps', '25fps', '30fps', '30-drop'];
    return rates[this.smpteIndex || 0];
  }

  _listenSampleDone() {
    const onStart = () => {
      this._moduleDisplay('Sampling...', '');
    };
    const onDone = (e) => {
      document.removeEventListener('sample-done', onDone);
      document.removeEventListener('sample-recording-started', onStart);
      if (e.detail.success) {
        this._moduleDisplay('Sample is Good', '');
      } else {
        this._moduleDisplay('Sample Overload', '');
      }
      setTimeout(() => {
        // Return to VU mode
        if (this.activeModule === 'sample') {
          this.editParam = 'module-func';
          this.display.setLine1(this._vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
        }
      }, 1500);
    };
    document.addEventListener('sample-recording-started', onStart);
    document.addEventListener('sample-done', onDone);
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

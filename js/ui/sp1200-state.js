export class SP1200State {
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
    this.sampleLength = 2.5;     // seconds, adjustable via Sample opt 5
    this.sampleThreshold = 0.05; // VU level 0-1, adjustable via Sample opt 4
    this.smpteIndex = 0;
    this.currentSong = 0;
    this.multiMode = null; // null | 'pitch' | 'level'
    this.padModes = new Array(8).fill('tune'); // 'tune' | 'decay' per pad
    this.channelAssign = new Uint8Array(8);
    for (let i = 0; i < 8; i++) this.channelAssign[i] = i;
    this.tapRepeatHeld = false;
    this._repeatInterval = null;
    // Disk module state
    this.storage = null; // set from main.js
    this.diskFiles = []; // list of saved disk names
    this.diskFileIndex = 0; // current browsing position
    this.diskCurrentFile = ''; // selected file name
    this.diskNameBuffer = ''; // for naming files (Save All As)
    this.diskNameCursor = 0; // cursor position in name
    this._diskOperation = null; // current disk operation
  }

  led(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', on);
  }

  bindBtn(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  moduleDisplay(line1, line2) {
    this.display.lock();
    this.display.setLine1(line1);
    this.display.setLine2(line2 || '');
  }

  exitModule() {
    if (!this.activeModule) return;
    if (this.activeModule === 'sample') {
      document.dispatchEvent(new Event('sample-stop-vu'));
    }
    const moduleIds = { 'setup': 'btn-setup', 'disk': 'btn-disk', 'sync': 'btn-sync', 'sample': 'btn-sample' };
    const ledIds = { 'setup': 'led-setup', 'disk': 'led-disk', 'sync': 'led-sync', 'sample': 'led-sample' };
    this.led(ledIds[this.activeModule], false);
    const btnId = moduleIds[this.activeModule];
    if (btnId) document.getElementById(btnId)?.classList.remove('active');
    this.activeModule = null;
    this.editParam = null;
    this.numericBuffer = '';
    this.pendingAction = null;
    this.display.unlock();
    this.display.setMode('segment');
  }

  flashDisplay() {
    setTimeout(() => {
      if (this.activeModule) return;
      if (this.editParam) return;
      this.display.unlock();
      this.display.setMode(this.mode === 'song' ? 'song' : this.mode === 'step-edit' ? 'step' : 'segment');
    }, 800);
  }

  vuPadLabel() {
    const bank = ['A', 'B', 'C', 'D'][this.currentBank];
    const pad = (this.selectedSamplePad || 0) + 1;
    const gains = ['+00dB', '+20dB', '+40dB'];
    const gain = gains[this.sampleGainIndex || 0];
    const left = bank + pad;
    // Right-align gain in 16-char field: "A1         +00dB"
    const spaces = 16 - left.length - gain.length;
    return left + ' '.repeat(Math.max(1, spaces)) + gain;
  }

  gainLabel() {
    const gains = ['+00dB', '+20dB', '+40dB'];
    return gains[this.sampleGainIndex || 0];
  }

  smpteLabel() {
    const rates = ['24fps', '25fps', '30fps', '30-drop'];
    return rates[this.smpteIndex || 0];
  }

  listenSampleDone() {
    const onStart = () => {
      this.moduleDisplay('Sampling...', '');
    };
    const onDone = (e) => {
      document.removeEventListener('sample-done', onDone);
      document.removeEventListener('sample-recording-started', onStart);
      if (e.detail.success) {
        this.moduleDisplay('Sample is Good', '');
      } else {
        this.moduleDisplay('Sample Overload', '');
      }
      setTimeout(() => {
        if (this.activeModule === 'sample') {
          this.editParam = 'module-func';
          this.display.setLine1(this.vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
        }
      }, 1500);
    };
    document.addEventListener('sample-recording-started', onStart);
    document.addEventListener('sample-done', onDone);
  }
}

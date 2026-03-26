export class TransportUI {
  constructor(engine, display) {
    this.engine = engine;
    this.display = display;
    this.playing = false;
    this.recording = false;
    this.mode = 'pattern';
    this.tapTimes = [];
    this._bindTransport();
    this._bindModes();
    this._bindQuantize();
    this._bindSwing();
    this._bindBanks();
  }
  _bindTransport() {
    document.getElementById('btn-play').addEventListener('click', () => {
      if (this.playing) return;
      this.playing = true;
      this.engine.play();
      document.getElementById('btn-play').classList.add('active');
    });
    document.getElementById('btn-stop').addEventListener('click', () => {
      this.playing = false;
      this.recording = false;
      this.engine.stop();
      document.getElementById('btn-play').classList.remove('active');
      document.getElementById('btn-record').classList.remove('active');
    });
    document.getElementById('btn-record').addEventListener('click', () => {
      this.recording = !this.recording;
      if (this.recording) {
        this.playing = true;
        this.engine.record();
        document.getElementById('btn-record').classList.add('active');
        document.getElementById('btn-play').classList.add('active');
      } else {
        document.getElementById('btn-record').classList.remove('active');
      }
    });
    document.getElementById('btn-tap-tempo').addEventListener('click', () => {
      const now = performance.now();
      this.tapTimes.push(now);
      if (this.tapTimes.length > 4) this.tapTimes.shift();
      if (this.tapTimes.length >= 2) {
        let total = 0;
        for (let i = 1; i < this.tapTimes.length; i++) total += this.tapTimes[i] - this.tapTimes[i - 1];
        const avg = total / (this.tapTimes.length - 1);
        const bpm = Math.round(60000 / avg);
        this.engine.setBpm(bpm);
        this.display.setBpm(bpm);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.playing) document.getElementById('btn-stop').click();
        else document.getElementById('btn-play').click();
      }
      if (e.key.toLowerCase() === 'r') document.getElementById('btn-record').click();
    });
  }
  _bindModes() {
    const modeButtons = { 'btn-pattern': 'pattern', 'btn-song': 'song', 'btn-step-edit': 'step-edit' };
    for (const [id, mode] of Object.entries(modeButtons)) {
      document.getElementById(id).addEventListener('click', () => {
        this.mode = mode;
        this.engine.setMode(mode);
        this.display.setMode(mode);
        Object.keys(modeButtons).forEach(btnId => document.getElementById(btnId).classList.remove('active'));
        document.getElementById(id).classList.add('active');
      });
    }
  }
  _bindQuantize() {
    document.getElementById('quantize-select').addEventListener('change', (e) => {
      this.engine.setQuantize(parseInt(e.target.value, 10));
    });
  }
  _bindSwing() {
    const slider = document.getElementById('swing-slider');
    const label = document.getElementById('swing-value');
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      label.textContent = val + '%';
      this.engine.setSwing(val);
    });
  }
  _bindBanks() {
    const bankBtns = document.querySelectorAll('.bank-btn');
    bankBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        bankBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const bank = parseInt(btn.dataset.bank, 10);
        this.display.setBank(bank);
        document.dispatchEvent(new CustomEvent('bank-change', { detail: { bank } }));
      });
    });
  }
}

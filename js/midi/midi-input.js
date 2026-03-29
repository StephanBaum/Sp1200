export class MIDIInput {
  constructor(engine) {
    this.engine = engine;
    this.state = null;
    this.midiAccess = null;
    this.channel = 0;
    this.mode = 'omni';
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI not supported');
      return false;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.inputs.forEach(input => {
        input.onmidimessage = (e) => this._onMessage(e);
      });
      this.midiAccess.onstatechange = () => {
        this.midiAccess.inputs.forEach(input => {
          input.onmidimessage = (e) => this._onMessage(e);
        });
      };
      console.log('Web MIDI initialized');
      return true;
    } catch (err) {
      console.warn('Web MIDI access denied:', err);
      return false;
    }
  }

  _onMessage(event) {
    const [status, note, velocity] = event.data;
    const msgType = status & 0xF0;
    const msgChannel = status & 0x0F;
    if (this.mode !== 'omni' && msgChannel !== this.channel) return;
    if (msgType === 0x90 && velocity > 0) {
      const pad = note - 36;
      if (pad >= 0 && pad < 8) {
        const bank = this.state?.currentBank || 0;
        this.engine.trigger(pad, velocity, bank);
      }
    }
  }

  setChannel(ch) { this.channel = Math.max(0, Math.min(15, ch)); }
  setMode(mode) { this.mode = mode; }
}

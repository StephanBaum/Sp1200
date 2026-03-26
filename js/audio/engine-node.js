export class SP1200Engine {
  constructor() { this.context = null; this.node = null; this.ready = false; }
  async init() {
    this.context = new AudioContext({ sampleRate: 44100 });
    await this.context.audioWorklet.addModule('/js/audio/sp1200-processor.js');
    this.node = new AudioWorkletNode(this.context, 'sp1200-processor', {
      numberOfOutputs: 1, outputChannelCount: [2],
    });
    this.node.connect(this.context.destination);
    this.ready = true;
  }
  send(message) { if (this.ready) this.node.port.postMessage(message); }
  onMessage(callback) { if (this.node) this.node.port.onmessage = (e) => callback(e.data); }
  loadSample(pad, buffer) { this.send({ type: 'load-sample', pad, buffer: buffer.buffer }); }
  trigger(pad, velocity = 127) { this.send({ type: 'trigger', pad, velocity }); }
  play() { this.send({ type: 'transport', action: 'play' }); }
  stop() { this.send({ type: 'transport', action: 'stop' }); }
  record() { this.send({ type: 'transport', action: 'record' }); }
  setBpm(bpm) { this.send({ type: 'set-bpm', bpm }); }
  setSwing(amount) { this.send({ type: 'set-swing', amount }); }
  setQuantize(grid) { this.send({ type: 'set-quantize', grid }); }
  selectPattern(number) { this.send({ type: 'pattern-select', number }); }
  setMode(mode) { this.send({ type: 'set-mode', mode }); }
  setParam(param, pad, value) { this.send({ type: 'set-param', param, pad, value }); }
  async resume() { if (this.context?.state === 'suspended') await this.context.resume(); }
}

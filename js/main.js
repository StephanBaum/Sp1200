import { SP1200Engine } from './audio/engine-node.js';
import { PadsUI } from './ui/pads.js';
import { FadersUI } from './ui/faders.js';
import { DisplayUI } from './ui/display.js';
import { TransportUI } from './ui/transport.js';
import { KeyboardUI } from './ui/keyboard.js';
import { SampleEditUI } from './ui/sample-edit.js';
import { StepEditUI } from './ui/step-edit.js';
import { loadSampleFromFile, SampleMemory } from './audio/sample-loader.js';
import { BANK_SAMPLE_TIME } from './constants.js';

const engine = new SP1200Engine();
const sampleMemory = new SampleMemory();
let display, pads, faders, transport, keyboard, sampleEdit, stepEdit;
let currentBank = 0;
let initialized = false;

async function init() {
  if (initialized) return;
  await engine.init();
  initialized = true;

  display = new DisplayUI();
  pads = new PadsUI(engine);
  faders = new FadersUI(engine);
  transport = new TransportUI(engine, display);
  keyboard = new KeyboardUI(engine);
  sampleEdit = new SampleEditUI(engine, display);
  stepEdit = new StepEditUI(engine, display);

  engine.onMessage((msg) => {
    switch (msg.type) {
      case 'tick': display.setBar(msg.bar); break;
      case 'trigger-visual': pads.flashPad(msg.pad); break;
      case 'song-end': document.getElementById('btn-stop').click(); break;
    }
  });

  document.addEventListener('bank-change', (e) => {
    currentBank = e.detail.bank;
    pads.setBank(currentBank);
    display.setMemory(sampleMemory.getRemainingSeconds(currentBank));
  });

  document.addEventListener('pad-trigger', (e) => pads.flashPad(e.detail.pad));

  // File upload
  document.getElementById('btn-load-sample').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadFileToSelectedPad(file);
    e.target.value = '';
  });

  // Drag and drop
  const sp = document.getElementById('sp1200');
  sp.addEventListener('dragover', (e) => { e.preventDefault(); sp.classList.add('dragover'); });
  sp.addEventListener('dragleave', () => sp.classList.remove('dragover'));
  sp.addEventListener('drop', async (e) => {
    e.preventDefault();
    sp.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) await loadFileToSelectedPad(file);
  });

  // Mic recording
  let micStream = null;
  let micRecorder = null;
  let micChunks = [];

  document.getElementById('btn-mic-record').addEventListener('click', async () => {
    if (micRecorder && micRecorder.state === 'recording') {
      micRecorder.stop();
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRecorder = new MediaRecorder(micStream);
      micChunks = [];
      micRecorder.ondataavailable = (e) => { if (e.data.size > 0) micChunks.push(e.data); };
      micRecorder.onstop = async () => {
        const blob = new Blob(micChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const processed = await loadSampleFromFile(engine.context, arrayBuffer);
        engine.loadSample(0, processed);
        const bank = sampleMemory.getBank(0);
        sampleMemory.allocate(bank, processed.length);
        display.setMemory(sampleMemory.getRemainingSeconds(bank));
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
        document.getElementById('btn-mic-record').classList.remove('active');
      };
      micRecorder.start();
      document.getElementById('btn-mic-record').classList.add('active');
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  });

  display.setMemory(BANK_SAMPLE_TIME);

  // Load default kit
  await loadDefaultKit();
  console.log('SP-1200 ready');
}

async function loadFileToSelectedPad(file) {
  const arrayBuffer = await file.arrayBuffer();
  const processed = await loadSampleFromFile(engine.context, arrayBuffer);
  engine.loadSample(0, processed);
  const bank = sampleMemory.getBank(0);
  sampleMemory.allocate(bank, processed.length);
  display.setMemory(sampleMemory.getRemainingSeconds(bank));
}

async function loadDefaultKit() {
  try {
    const resp = await fetch('/samples/manifest.json');
    const manifest = await resp.json();
    const allSamples = manifest.categories.flatMap(c => c.samples);
    const toLoad = allSamples.slice(0, 8);
    for (let i = 0; i < toLoad.length; i++) {
      const sampleResp = await fetch('/samples/' + toLoad[i].file);
      const arrayBuffer = await sampleResp.arrayBuffer();
      const processed = await loadSampleFromFile(engine.context, arrayBuffer);
      engine.loadSample(i, processed);
    }
    console.log('Default kit loaded');
  } catch (err) {
    console.warn('Could not load default kit:', err);
  }
}

document.addEventListener('click', () => init(), { once: true });
document.addEventListener('keydown', () => init(), { once: true });

import { SP1200Engine } from './audio/engine-node.js';
import { PadsUI } from './ui/pads.js';
import { FadersUI } from './ui/faders.js';
import { DisplayUI } from './ui/display.js';
import { TransportUI } from './ui/transport.js';
import { KeyboardUI } from './ui/keyboard.js';
import { StepEditUI } from './ui/step-edit.js';
import { loadSampleFromFile, SampleMemory } from './audio/sample-loader.js';
import { BANK_SAMPLE_TIME } from './constants.js';

const engine = new SP1200Engine();
const sampleMemory = new SampleMemory();
let display, pads, faders, transport, keyboard, stepEdit;
let currentBank = 0;
let selectedPad = 0;
let initialized = false;

async function init() {
  if (initialized) return;
  await engine.init();
  initialized = true;

  display = new DisplayUI();
  pads = new PadsUI(engine);
  faders = new FadersUI(engine);
  transport = new TransportUI(engine, display);
  keyboard = new KeyboardUI(engine, display);
  stepEdit = new StepEditUI(engine, display);

  engine.onMessage((msg) => {
    switch (msg.type) {
      case 'tick':
        display.setBar(msg.bar);
        // Show position on line 2 during playback
        if (msg.bar !== undefined && msg.beat !== undefined) {
          const barNum = (msg.bar || 0) + 1;
          const beatNum = (msg.beat || 0) + 1;
          if (!display.locked) display.setLine2('Bar:' + barNum + ' Beat:' + beatNum);
          // Flicker Run LED on segment loop (bar resets to 0)
          if (msg.bar === 0 && msg.beat === 0) {
            const runLed = document.getElementById('led-run');
            if (runLed) {
              runLed.classList.remove('on');
              setTimeout(() => runLed.classList.add('on'), 80);
            }
          }
        }
        break;
      case 'trigger-visual':
        pads.flashPad(msg.pad);
        break;
      case 'song-end':
        document.getElementById('btn-run-stop').click();
        break;
      case 'segment-erased':
        display.flash('Erased', 'Seg ' + (msg.segment + 1));
        break;
      case 'segment-copied':
        display.flash('Copied', 'Done');
        break;
      case 'sound-deleted':
        display.flash('Deleted', 'Pad ' + (msg.pad + 1));
        break;
      case 'reverse-toggled':
        display.flash('Pad ' + (msg.pad + 1), msg.reversed ? 'Reversed' : 'Normal');
        break;
      case 'multi-exit':
        display.flash('Multi Mode', 'Exited');
        break;
      case 'mix-defined':
        display.flash('Mix ' + (msg.slot + 1), 'Saved');
        break;
      case 'mix-selected':
        display.flash('Mix ' + (msg.slot + 1), 'Recalled');
        break;
      case 'pad-mode':
        display.flash('Pad ' + (msg.pad + 1), msg.mode === 'decay' ? 'Decay' : 'Tune');
        break;
    }
  });

  document.addEventListener('bank-change', (e) => {
    currentBank = e.detail.bank;
    pads.setBank(currentBank);
    display.setMemory(sampleMemory.getRemainingSeconds(currentBank));
  });

  document.addEventListener('pad-trigger', (e) => pads.flashPad(e.detail.pad));

  document.addEventListener('fader-mode-change', (e) => {
    faders.mode = e.detail.mode;
  });

  // Step edit activation
  document.addEventListener('step-edit-toggle', (e) => {
    if (e.detail.active) {
      stepEdit.setQuantize(e.detail.quantize);
      stepEdit.setSegmentLength(e.detail.bars);
      stepEdit.activate();
    } else {
      stepEdit.deactivate();
    }
  });

  // Track selected pad
  document.querySelectorAll('.pad').forEach(el => {
    el.addEventListener('mousedown', () => {
      selectedPad = parseInt(el.dataset.pad, 10);
    });
  });

  // Fader value → display bar graph or tune values
  document.addEventListener('fader-update', (e) => {
    if (e.detail.mode === 'pitch') {
      display.showTuneLevels(e.detail.values);
    } else {
      display.showMixLevels(e.detail.values);
    }
  });

  // Knobs — drag to rotate, show value on LCD. Default 75%
  document.querySelectorAll('.knob').forEach(knob => {
    let dragging = false, startY = 0, startAngle = 60;
    let angle = 60; // 75% = -120 + 240*0.75 = 60
    const pointer = knob.querySelector('.knob-indicator');
    if (pointer) pointer.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    // Set initial values
    const initVal = 0.75;
    if (knob.id === 'knob-gain') engine.setParam('gain', 0, initVal);
    if (knob.id === 'knob-mix-vol') engine.setParam('mix-volume', 0, initVal);
    if (knob.id === 'knob-metro-vol') engine.send({ type: 'set-metronome-vol', vol: initVal });
    const names = { 'knob-gain': 'GAIN', 'knob-mix-vol': 'MIX VOL', 'knob-metro-vol': 'METRO' };
    knob.addEventListener('mousedown', (e) => { dragging = true; startY = e.clientY; startAngle = angle; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta = (startY - e.clientY) * 1.5;
      angle = Math.max(-120, Math.min(120, startAngle + delta));
      pointer.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      const normalized = (angle + 120) / 240;
      if (knob.id === 'knob-gain') engine.setParam('gain', 0, normalized);
      if (knob.id === 'knob-mix-vol') engine.setParam('mix-volume', 0, normalized);
      if (knob.id === 'knob-metro-vol') engine.send({ type: 'set-metronome-vol', vol: normalized });
      display.showKnobValue(names[knob.id] || '', normalized);
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  });

  // Disk → file upload
  document.getElementById('btn-disk').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadFileToSelectedPad(file);
    e.target.value = '';
  });

  // Setup → sample edit mode
  let setupMode = false;
  document.getElementById('btn-setup').addEventListener('click', () => {
    setupMode = !setupMode;
    document.getElementById('btn-setup').classList.toggle('active', setupMode);
    display.setMode(setupMode ? 'SET UP' : 'PATTERN');
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

  // Sample → mic recording
  let micStream = null, micRecorder = null, micChunks = [];
  document.getElementById('btn-sample').addEventListener('click', async () => {
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
        const processed = await loadSampleFromFile(engine.context, await blob.arrayBuffer());
        engine.loadSample(selectedPad, processed);
        sampleMemory.allocate(sampleMemory.getBank(selectedPad), processed.length);
        display.setMemory(sampleMemory.getRemainingSeconds(sampleMemory.getBank(selectedPad)));
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
        document.getElementById('btn-sample').classList.remove('active');
        display.setMode('SAMPLED');
        setTimeout(() => display.setMode('PATTERN'), 800);
      };
      micRecorder.start();
      document.getElementById('btn-sample').classList.add('active');
      display.setMode('REC...');
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  });

  display.setMemory(BANK_SAMPLE_TIME);
  await loadDefaultKit();
  console.log('SP-1200 ready');
}

async function loadFileToSelectedPad(file) {
  const arrayBuffer = await file.arrayBuffer();
  const processed = await loadSampleFromFile(engine.context, arrayBuffer);
  engine.loadSample(selectedPad, processed);
  sampleMemory.allocate(sampleMemory.getBank(selectedPad), processed.length);
  display.setMemory(sampleMemory.getRemainingSeconds(sampleMemory.getBank(selectedPad)));
  display.setMode('PAD ' + (selectedPad + 1));
  setTimeout(() => display.setMode('PATTERN'), 800);
}

async function loadDefaultKit() {
  try {
    const resp = await fetch('/samples/manifest.json');
    const manifest = await resp.json();
    const toLoad = manifest.categories.flatMap(c => c.samples).slice(0, 8);
    for (let i = 0; i < toLoad.length; i++) {
      const buf = await (await fetch('/samples/' + toLoad[i].file)).arrayBuffer();
      engine.loadSample(i, await loadSampleFromFile(engine.context, buf));
    }
    console.log('Default kit loaded');
  } catch (err) {
    console.warn('Could not load default kit:', err);
  }
}

document.addEventListener('click', () => init(), { once: true });
document.addEventListener('keydown', () => init(), { once: true });

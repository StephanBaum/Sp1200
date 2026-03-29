import { SP1200Engine } from './audio/engine-node.js';
import { SP1200Storage } from './storage/indexeddb.js';
import { PadsUI } from './ui/pads.js';
import { FadersUI } from './ui/faders.js';
import { DisplayUI } from './ui/display.js';
import { SP1200State } from './ui/sp1200-state.js';
import { bindTransport } from './ui/transport.js';
import { bindModules } from './ui/modules.js';
import { bindProgramming } from './ui/programming.js';
import { bindMasterControl } from './ui/master-control.js';
import { bindKeypad } from './ui/keypad.js';
import { bindPadActions } from './ui/pad-actions.js';
import { bindBanks } from './ui/banks.js';
import { bindModeButton } from './ui/mode-button.js';
import { KeyboardUI } from './ui/keyboard.js';
import { StepEditUI } from './ui/step-edit.js';
import { loadSampleFromFile, SampleMemory } from './audio/sample-loader.js';
import { BANK_SAMPLE_TIME } from './constants.js';

const engine = new SP1200Engine();
const storage = new SP1200Storage();
const sampleMemory = new SampleMemory();
let display, pads, faders, state, keyboard, stepEdit;
let currentBank = 0;
let selectedPad = 0;
let initialized = false;

// Sampling state
let micStream = null;
let micRecorder = null;
let micChunks = [];
let micAnalyser = null;
let micSource = null;
let vuAnimFrame = null;
let sampleArmed = false;

async function init() {
  if (initialized) return;
  await engine.init();
  await storage.init();
  initialized = true;

  display = new DisplayUI();
  pads = new PadsUI(engine);
  faders = new FadersUI(engine);
  state = new SP1200State(engine, display);
  state.storage = storage;
  bindTransport(state);
  bindModules(state);
  bindProgramming(state);
  bindMasterControl(state);
  bindKeypad(state);
  bindPadActions(state);
  bindBanks(state);
  bindModeButton(state);
  keyboard = new KeyboardUI(engine, display);
  stepEdit = new StepEditUI(engine, display);

  engine.onMessage((msg) => {
    switch (msg.type) {
      case 'tick':
        display.setBar(msg.bar);
        if (msg.bar !== undefined && msg.beat !== undefined) {
          display.setBeat(msg.beat);
          // Flicker Run LED on segment loop
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

  // Fader value → display bar graph, tune values, or sample params
  document.addEventListener('fader-update', (e) => {
    const slider1 = e.detail.values[0];

    // Sample module: slider 1 controls threshold or sample length
    if (state.editParam === 'threshold') {
      state.sampleThreshold = slider1;
      display.setLine1('Arm Slider #1');
      display.showVU(slider1); // show threshold level as VU marker
      return;
    }
    if (state.editParam === 'sample-length') {
      // Map 0-1 to 0.1-2.5 seconds
      state.sampleLength = Math.round((0.1 + slider1 * 2.4) * 10) / 10;
      state.moduleDisplay('Length: ' + state.sampleLength.toFixed(1) + ' secs', 'Use Slider #1');
      return;
    }
    if (state.editParam === 'default-decay') {
      const decayVal = Math.round(slider1 * 31);
      state.moduleDisplay('Default Decay', 'Value: ' + decayVal);
      state.engine.send({ type: 'set-default-decay', value: decayVal });
      return;
    }
    if (state.editParam === 'disk-name') {
      // Slider 1 cycles through characters at cursor position
      const chars = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.';
      const charIdx = Math.floor(slider1 * (chars.length - 1));
      const ch = chars[charIdx];
      const buf = state.diskNameBuffer.split('');
      while (buf.length <= state.diskNameCursor) buf.push(' ');
      buf[state.diskNameCursor] = ch;
      state.diskNameBuffer = buf.join('');
      state.moduleDisplay('Save All As', state.diskNameBuffer.substring(0, 16));
      return;
    }

    // Normal display
    if (e.detail.mode === 'pitch') {
      display.showTuneLevels(e.detail.values);
    } else {
      display.showMixLevels(e.detail.values);
    }
  });

  // Knobs — drag to rotate, show value on LCD. Default 75%
  document.querySelectorAll('.knob').forEach(knob => {
    let dragging = false, startY = 0, startAngle = 60;
    let angle = 60;
    // Rotate the whole knob element (sprite has the indicator baked in)
    knob.style.transform = `rotate(${angle}deg)`;
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
      knob.style.transform = `rotate(${angle}deg)`;
      const normalized = (angle + 120) / 240;
      if (knob.id === 'knob-gain') engine.setParam('gain', 0, normalized);
      if (knob.id === 'knob-mix-vol') engine.setParam('mix-volume', 0, normalized);
      if (knob.id === 'knob-metro-vol') engine.send({ type: 'set-metronome-vol', vol: normalized });
      display.showKnobValue(names[knob.id] || '', normalized);
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  });

  // Disk file upload — triggered by transport via custom event
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadFileToSelectedPad(file);
    e.target.value = '';
  });

  // ── Sampling events from transport.js ──────────────────────────────────
  document.addEventListener('sample-start-vu', () => startVUMonitoring());
  document.addEventListener('sample-stop-vu', () => stopVUMonitoring());
  document.addEventListener('sample-force', () => startForceRecording());
  document.addEventListener('sample-arm', () => { sampleArmed = true; });
  document.addEventListener('sample-stop', () => stopRecording());

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

  display.setMemory(BANK_SAMPLE_TIME);
  await loadDefaultKit();
  console.log('SP-1200 ready');
}

// ── Audio Input ──────────────────────────────────────────────────────────
// Captures system audio via getDisplayMedia (select a tab/screen to sample from).
// The video track is kept alive (required by browser) but ignored.
async function getAudioInput() {
  if (micStream) return micStream;
  try {
    micStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true, // required by spec, but we ignore the video
    });
    // Don't stop the video track — some browsers kill audio if video is stopped
  } catch (err) {
    console.error('Audio capture denied:', err);
    return null;
  }
  return micStream;
}

// ── VU Monitoring (input level display) ──────────────────────────────────
async function startVUMonitoring() {
  try {
    if (!micStream) {
      const stream = await getAudioInput();
      if (!stream) {
        display.showVU(0);
        return;
      }
    }
    // Reconnect analyser (may have been disconnected by stopVUMonitoring)
    if (!micAnalyser) {
      const ctx = engine.context;
      micSource = ctx.createMediaStreamSource(micStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);
    }

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    function drawVU() {
      if (!micAnalyser) return;
      vuAnimFrame = requestAnimationFrame(drawVU);
      micAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 4);
      display.showVU(level);

      if (sampleArmed && level > (state?.sampleThreshold || 0.05)) {
        sampleArmed = false;
        startForceRecording();
      }
    }
    drawVU();
  } catch (err) {
    console.error('Mic access denied:', err);
  }
}

function stopVUMonitoring() {
  if (vuAnimFrame) { cancelAnimationFrame(vuAnimFrame); vuAnimFrame = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (micAnalyser) { micAnalyser = null; }
  // Keep micStream alive so we don't need to re-prompt for permission
  sampleArmed = false;
}

// ── Force Recording (Sample option 9) ────────────────────────────────────
async function startForceRecording() {
  try {
    if (!micStream) {
      const stream = await getAudioInput();
      if (!stream) {
        // No audio input — show error, don't dispatch sample-done failure
        if (state) state.moduleDisplay('No Audio Input', 'Grant permission');
        return;
      }
    }
    // Set up analyser for VU during recording
    if (!micAnalyser) {
      const ctx = engine.context;
      micSource = ctx.createMediaStreamSource(micStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);
    }

    micRecorder = new MediaRecorder(micStream);
    micChunks = [];
    micRecorder.ondataavailable = (e) => { if (e.data.size > 0) micChunks.push(e.data); };
    micRecorder.onstop = async () => {
      if (micChunks.length === 0) {
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false } }));
        return;
      }
      const blob = new Blob(micChunks, { type: 'audio/webm' });
      if (blob.size < 100) {
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false } }));
        return;
      }
      try {
        const arrayBuf = await blob.arrayBuffer();
        const processed = await loadSampleFromFile(engine.context, arrayBuf);
        if (!processed || processed.length === 0) {
          document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false } }));
          return;
        }
        engine.loadSample(selectedPad, processed);
        sampleMemory.allocate(sampleMemory.getBank(selectedPad), processed.length);
        display.setMemory(sampleMemory.getRemainingSeconds(sampleMemory.getBank(selectedPad)));
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: true } }));
      } catch (err) {
        console.error('Sample processing failed:', err);
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false } }));
      }
    };
    micRecorder.start();
    document.dispatchEvent(new CustomEvent('sample-recording-started'));

    // Show VU during recording
    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    function drawRecVU() {
      if (!micRecorder || micRecorder.state !== 'recording') return;
      vuAnimFrame = requestAnimationFrame(drawRecVU);
      micAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      display.showVU(Math.min(1, rms * 4));
    }
    drawRecVU();

    // Auto-stop after sample length
    setTimeout(() => {
      if (micRecorder && micRecorder.state === 'recording') {
        micRecorder.stop();
      }
    }, (state?.sampleLength || 2.5) * 1000);
  } catch (err) {
    console.error('Recording failed:', err);
    document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false } }));
  }
}

function stopRecording() {
  if (micRecorder && micRecorder.state === 'recording') {
    micRecorder.stop();
  }
  stopVUMonitoring();
}

async function loadFileToSelectedPad(file) {
  const arrayBuffer = await file.arrayBuffer();
  const processed = await loadSampleFromFile(engine.context, arrayBuffer);
  engine.loadSample(selectedPad, processed);
  sampleMemory.allocate(sampleMemory.getBank(selectedPad), processed.length);
  display.setMemory(sampleMemory.getRemainingSeconds(sampleMemory.getBank(selectedPad)));
  display.flash('Loaded', 'Pad ' + (selectedPad + 1));
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

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
import { MIDIInput } from './midi/midi-input.js';
import { FileSystemStorage } from './storage/filesystem.js';

const engine = new SP1200Engine();
const storage = new SP1200Storage();
const fsStorage = new FileSystemStorage();
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
let gainNode = null; // Web Audio GainNode for applying input gain

function getSampleGain() {
  // Combine knob position (0-2x) with preamp level (+0/+20/+40 dB)
  const knob = state?._gainKnob ?? 0.75;
  const dbIndex = state?.sampleGainIndex ?? 0;
  const dbGains = [1.0, 10.0, 100.0]; // +0dB, +20dB, +40dB as linear multipliers
  return knob * 2 * dbGains[dbIndex];
}

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
  state.fsStorage = fsStorage;
  pads.state = state;
  bindTransport(state);
  bindModules(state);
  bindProgramming(state);
  bindMasterControl(state);
  bindKeypad(state);
  bindPadActions(state);
  bindBanks(state);
  bindModeButton(state);
  keyboard = new KeyboardUI(engine, display);
  keyboard.state = state;
  stepEdit = new StepEditUI(engine, display);
  stepEdit.state = state;

  const midi = new MIDIInput(engine);
  midi.state = state;
  midi.init();

  // Try to acquire mic at startup (silent — permission may persist across refreshes)
  // If no mic or denied, user can use Sample option 8 for system audio
  if (!micStream) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => { micStream = stream; console.log('Mic stream acquired'); })
      .catch(() => console.log('No mic — use Sample opt 8 for system audio'));
  }

  // Listen for system audio switch request
  document.addEventListener('request-system-audio', async () => {
    try {
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      if (micSource) { micSource.disconnect(); micSource = null; }
      if (gainNode) { gainNode.disconnect(); gainNode = null; }
      micAnalyser = null;
      micStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      micStream.getVideoTracks().forEach(t => t.stop());
      console.log('System audio stream acquired');
      display.flash('System Audio', 'Connected');
      // Return to VU mode (Sample function 1) after brief flash
      setTimeout(() => {
        if (state?.activeModule === 'sample') {
          state.editParam = 'vu-mode';
          document.dispatchEvent(new Event('sample-start-vu'));
        }
      }, 800);
    } catch (err) {
      console.warn('System audio denied:', err.message);
      display.flash('Denied', 'Using mic');
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) {}
      setTimeout(() => {
        if (state?.activeModule === 'sample') {
          state.editParam = 'vu-mode';
          document.dispatchEvent(new Event('sample-start-vu'));
        }
      }, 800);
    }
  });

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
      case 'sample-info':
        if (state && state.editParam === 'truncate-edit') {
          state._truncSampleLen = msg.length;
          state._truncStart = msg.startPoint;
          state._truncEnd = Math.min(msg.endPoint, 65535);
          state._truncLoop = msg.loopEnabled ? msg.loopStart : -1;
          const loopStr = state._truncLoop < 0 ? ' NONE' : String(state._truncLoop).padStart(5, '0');
          const padLabel = ['A','B','C','D'][state._pendingBank] + ((state._pendingPad ?? 0) + 1);
          state.moduleDisplay(
            'S=' + String(state._truncStart).padStart(5, '0') + '  ' + padLabel,
            'E=' + String(state._truncEnd).padStart(5, '0') + '  L=' + loopStr
          );
        }
        break;
      case 'truncated':
        display.flash('Truncated', msg.length + ' samples');
        if (state) {
          display.setMemory(sampleMemory.getRemainingSeconds(state.currentBank));
        }
        break;
      case 'step-events':
        if (stepEdit?.active) {
          const banks = ['A','B','C','D'];
          const names = msg.events.slice(0, 4).map(e => {
            const pad = (e.track % 8) + 1;
            return banks[state?.currentBank || 0] + pad;
          });
          display.setLine2(names.join(' ') || 'AC:' + (state?.quantizeLabel || '1/16'));
        }
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
      display.setLine1('Threshold  #1');
      // Don't touch line 2 — live VU is updating it via the monitoring loop
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
    if (state.editParam === 'catalog-browse' && state._catalogEntries?.length) {
      const cat = state._catalogEntries;
      const idx = Math.min(cat.length - 1, Math.floor(slider1 * cat.length));
      state._catalogIdx = idx;
      const e = cat[idx];
      if (e.num !== undefined) {
        // Sequence catalog
        display.setLine1('Seg ' + String(e.num).padStart(2, '0') + ' ' + e.bars + 'bar');
      } else {
        // Sound catalog
        display.setLine1(e.label + ' ' + e.name);
      }
      return;
    }
    if (state.editParam === 'special-menu' && state._specialCatalog) {
      const cat = state._specialCatalog;
      const idx = Math.min(cat.length - 1, Math.floor(slider1 * cat.length));
      state._specialIdx = idx;
      const entry = cat[idx];
      state.moduleDisplay(entry.num + ' ' + entry.name, 'Use Slider or #');
      return;
    }
    if (state.editParam === 'disk-name' || state.editParam === 'name-sound-edit' || state.editParam === 'create-folder') {
      // Slider 1 cycles through characters at cursor position
      const chars = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.';
      const charIdx = Math.floor(slider1 * (chars.length - 1));
      const ch = chars[charIdx];
      const buf = state.diskNameBuffer.split('');
      while (buf.length <= state.diskNameCursor) buf.push(' ');
      buf[state.diskNameCursor] = ch;
      state.diskNameBuffer = buf.join('');
      const _faderLabel = state.editParam === 'name-sound-edit'
        ? 'Name ' + ['A','B','C','D'][state._pendingBank ?? state.currentBank] + ((state._pendingPad ?? 0) + 1)
        : state.editParam === 'create-folder' ? 'Create Folder' : 'Save All As';
      state.moduleDisplay(_faderLabel, state.diskNameBuffer.substring(0, 16));
      return;
    }

    // Normal display — unlock if no module/edit is using the display
    if (!state.activeModule && !state.editParam) {
      display.unlock();
    }
    if (e.detail.mode === 'pitch') {
      display.showTuneLevels(e.detail.values);
    } else if (e.detail.mode === 'volume' || e.detail.mode === 'decay') {
      display.showMixLevels(e.detail.values);
    }
  });

  // Truncate fader events — 6 faders map to start/end/loop coarse+fine
  document.addEventListener('truncate-fader', (e) => {
    if (!state || state.editParam !== 'truncate-edit') return;
    const { index, value } = e.detail;
    const maxLen = Math.max(state._truncSampleLen || 65535, 1);
    const coarseStep = Math.max(1, Math.floor(maxLen / 100));
    const fineStep = 1;

    if (index === 0) {
      // Start coarse
      state._truncStart = Math.floor(value * maxLen);
    } else if (index === 1) {
      // Start fine
      state._truncStart = Math.max(0, state._truncStart + Math.round((value - 0.5) * 2 * fineStep * 50));
    } else if (index === 2) {
      // End coarse
      state._truncEnd = Math.floor(value * maxLen);
    } else if (index === 3) {
      // End fine
      state._truncEnd = Math.max(0, state._truncEnd + Math.round((value - 0.5) * 2 * fineStep * 50));
    } else if (index === 4) {
      // Loop coarse (-1 = NONE when fader is at 0)
      if (value < 0.01) {
        state._truncLoop = -1;
      } else {
        state._truncLoop = Math.floor(value * maxLen);
      }
    } else if (index === 5) {
      // Loop fine
      if (state._truncLoop >= 0) {
        state._truncLoop = Math.max(0, state._truncLoop + Math.round((value - 0.5) * 2 * fineStep * 50));
      }
    }

    // Clamp values
    state._truncStart = Math.max(0, Math.min(maxLen - 1, state._truncStart));
    state._truncEnd = Math.max(state._truncStart, Math.min(maxLen - 1, state._truncEnd));
    if (state._truncLoop >= 0) {
      state._truncLoop = Math.max(state._truncStart, Math.min(state._truncEnd, state._truncLoop));
    }

    // Live preview
    engine.setParam('truncate', state._pendingPad, { start: state._truncStart, end: state._truncEnd });

    // Update display
    const loopStr = state._truncLoop < 0 ? ' NONE' : String(state._truncLoop).padStart(5, '0');
    const padLabel = ['A','B','C','D'][state._pendingBank ?? 0] + ((state._pendingPad ?? 0) + 1);
    state.moduleDisplay(
      'S=' + String(state._truncStart).padStart(5, '0') + '  ' + padLabel,
      'E=' + String(state._truncEnd).padStart(5, '0') + '  L=' + loopStr
    );
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
    if (knob.id === 'knob-metro-vol') engine.send({ type: 'set-metronome-vol', vol: 0.25 });
    const names = { 'knob-gain': 'GAIN', 'knob-mix-vol': 'MIX VOL', 'knob-metro-vol': 'METRO' };
    knob.addEventListener('mousedown', (e) => { dragging = true; startY = e.clientY; startAngle = angle; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta = (startY - e.clientY) * 1.5;
      angle = Math.max(-120, Math.min(120, startAngle + delta));
      knob.style.transform = `rotate(${angle}deg)`;
      const normalized = (angle + 120) / 240;
      if (knob.id === 'knob-gain') {
        engine.setParam('gain', 0, normalized);
        if (state) state._gainKnob = normalized;
      }
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

  document.addEventListener('pad-right-click', async (e) => {
    const pad = e.detail.pad;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      if (!input.files.length) return;
      const file = input.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const processed = await loadSampleFromFile(engine.context, arrayBuffer);
      const bank = state?.currentBank || 0;
      const bankPad = bank * 8 + pad;
      engine.loadSample(bankPad, processed);
      sampleMemory.allocate(bank, processed.length);
      display.setMemory(sampleMemory.getRemainingSeconds(bank));
      const bankName = ['A', 'B', 'C', 'D'][bank];
      display.flash('Loaded', bankName + (pad + 1));
    };
    input.click();
  });

  display.setMemory(BANK_SAMPLE_TIME);
  await loadDefaultKit();
  console.log('SP-1200 ready');
}

// ── VU Monitoring ────────────────────────────────────────────────────────
async function startVUMonitoring() {
  try {
    // Ensure AudioContext is running
    await engine.resume();

    if (!micStream) {
      // No stream yet — show hint, don't block
      display.setLine2('Press 8: Sys Aud');
      return;
    }
    const ctx = engine.context;
    if (ctx.state === 'suspended') await ctx.resume();

    micSource = ctx.createMediaStreamSource(micStream);
    gainNode = ctx.createGain();
    gainNode.gain.value = getSampleGain();
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micSource.connect(gainNode);
    gainNode.connect(micAnalyser);

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    function drawVU() {
      if (!micAnalyser) return;
      vuAnimFrame = requestAnimationFrame(drawVU);
      // Update gain in real-time as knob/level changes
      if (gainNode) gainNode.gain.value = getSampleGain();
      micAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 4);
      // Show threshold marker when in threshold mode or when armed
      const showThreshold = (state?.editParam === 'threshold' || sampleArmed)
        ? (state?.sampleThreshold || 0.05) : undefined;
      display.showVU(level, showThreshold);

      if (sampleArmed && level > (state?.sampleThreshold || 0.05)) {
        sampleArmed = false;
        startForceRecording();
      }
    }
    drawVU();
  } catch (err) {
    console.error('VU monitoring failed:', err);
    display.setLine2('VU Error');
  }
}

function stopVUMonitoring() {
  if (vuAnimFrame) { cancelAnimationFrame(vuAnimFrame); vuAnimFrame = null; }
  // Disconnect nodes but keep the stream alive for reuse
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
  if (micAnalyser) { micAnalyser = null; }
  // Do NOT stop micStream — keep it alive so we don't re-prompt
  sampleArmed = false;
}

// ── Force Recording (Sample option 9) ────────────────────────────────────
async function startForceRecording() {
  try {
    await engine.resume();

    if (!micStream) {
      display.flash('No Audio Src', 'Press 8: Sys Aud');
      document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false, error: 'No audio source' } }));
      return;
    }
    const ctx = engine.context;
    if (ctx.state === 'suspended') await ctx.resume();
    if (!micAnalyser) {
      micSource = ctx.createMediaStreamSource(micStream);
      gainNode = ctx.createGain();
      gainNode.gain.value = getSampleGain();
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(gainNode);
      gainNode.connect(micAnalyser);
    }

    // Record from gained signal, not raw stream
    const recDest = ctx.createMediaStreamDestination();
    gainNode.connect(recDest);
    micRecorder = new MediaRecorder(recDest.stream);
    micChunks = [];
    micRecorder.ondataavailable = (e) => { if (e.data.size > 0) micChunks.push(e.data); };
    micRecorder.onstop = async () => {
      const blob = new Blob(micChunks, { type: 'audio/webm' });
      console.log('Sample recorded:', blob.size, 'bytes');
      try {
        const processed = await loadSampleFromFile(engine.context, await blob.arrayBuffer());
        const targetPad = state?.selectedSamplePad ?? selectedPad;
        const bankPad = (state?.currentBank || 0) * 8 + targetPad;
        console.log('Sample processed:', processed.length, 'samples → pad', bankPad);
        engine.loadSample(bankPad, processed);
        if (storage) storage.cacheSample(bankPad, processed, { pitch: 1.0, decay: 1.0, reversed: false });
        sampleMemory.allocate(state?.currentBank || 0, processed.length);
        display.setMemory(sampleMemory.getRemainingSeconds(state?.currentBank || 0));
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: true } }));
      } catch (err) {
        console.error('Sample decode failed:', err);
        document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false, error: err.message } }));
      }
    };
    micRecorder.start();
    document.dispatchEvent(new CustomEvent('sample-recording-started'));

    // VU during recording
    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    function drawRecVU() {
      if (!micRecorder || micRecorder.state !== 'recording') {
        // Disconnect recording destination when done
        try { gainNode?.disconnect(recDest); } catch (_) {}
        return;
      }
      vuAnimFrame = requestAnimationFrame(drawRecVU);
      if (gainNode) gainNode.gain.value = getSampleGain();
      micAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      display.showVU(Math.min(1, Math.sqrt(sum / dataArray.length) * 4));
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
    document.dispatchEvent(new CustomEvent('sample-done', { detail: { success: false, error: err.message } }));
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
  const bank = state?.currentBank || 0;
  const bankPad = bank * 8 + selectedPad;
  engine.loadSample(bankPad, processed);
  if (storage) storage.cacheSample(bankPad, processed, { pitch: 1.0, decay: 1.0, reversed: false });
  sampleMemory.allocate(bank, processed.length);
  display.setMemory(sampleMemory.getRemainingSeconds(bank));
  const bankName = ['A', 'B', 'C', 'D'][bank];
  display.flash('Loaded', bankName + (selectedPad + 1));
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

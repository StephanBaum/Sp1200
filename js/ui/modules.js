export function bindModules(s) {
  const modules = {
    'btn-setup': { name: 'setup', led: 'led-setup', label: 'SET UP' },
    'btn-disk': { name: 'disk', led: 'led-disk', label: 'DISK' },
    'btn-sync': { name: 'sync', led: 'led-sync', label: 'SYNC' },
    'btn-sample': { name: 'sample', led: 'led-sample', label: 'SAMPLE' },
  };

  for (const [btnId, mod] of Object.entries(modules)) {
    s.bindBtn(btnId, () => {
      if (s.activeModule === mod.name) {
        // Deactivate module — return to segment screen
        _deactivateModule(s, modules);
      } else {
        // Deactivate previous module if any
        if (s.activeModule) {
          if (s.activeModule === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
          for (const [id] of Object.entries(modules)) {
            s.led(modules[id]?.led || '', false);
            document.getElementById(id)?.classList.remove('active');
          }
        }
        // Activate this module
        s.activeModule = mod.name;
        s.led(mod.led, true);
        document.getElementById(btnId).classList.add('active');
        s.editParam = 'module-func';
        s.numericBuffer = '';
        s.pendingAction = null;

        // While playing, Setup is restricted to 11-13
        if (mod.name === 'setup' && s.playing) {
          s.moduleDisplay('Set-up Function?', '[11-13]');
        } else if (mod.name === 'sample') {
          // Sample auto-enters VU mode (option 1)
          s.editParam = 'vu-mode';
          s.display.lock();
          s.display.setLine1(s.vuPadLabel());
          s.display.showVU(0); // show empty VU bar immediately
          document.dispatchEvent(new Event('sample-start-vu'));
        } else {
          s.display.lock();
          s.display.setLine1(mod.label);
          s.display.setLine2('Enter option #');
        }
      }
    });
  }
}

function _deactivateModule(s, modules) {
  if (!s.activeModule) return;
  if (s.activeModule === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
  const moduleIds = { 'setup': 'btn-setup', 'disk': 'btn-disk', 'sync': 'btn-sync', 'sample': 'btn-sample' };
  const ledIds = { 'setup': 'led-setup', 'disk': 'led-disk', 'sync': 'led-sync', 'sample': 'led-sample' };
  s.led(ledIds[s.activeModule], false);
  const btnId = moduleIds[s.activeModule];
  if (btnId) document.getElementById(btnId)?.classList.remove('active');
  s.activeModule = null;
  s.editParam = null;
  s.numericBuffer = '';
  s.pendingAction = null;
  s.display.unlock();
  s.display.setMode('segment');
}

// ── Pad label helper: "A1" format ─────────────────────────────────────────
function _padLabel(s, pad) {
  const bank = ['A', 'B', 'C', 'D'][s.currentBank];
  return bank + ((pad ?? 0) + 1);
}

// ── Module function dispatch ──────────────────────────────────────────────
export function handleModuleFunction(s, funcNum) {
  const mod = s.activeModule;
  if (!mod) return;

  // While playing, Setup restricted to 11-13
  if (mod === 'setup' && s.playing && (funcNum < 11 || funcNum > 13)) {
    s.moduleDisplay('Set-up Function?', '[11-13]');
    s.editParam = 'module-func';
    s.numericBuffer = '';
    return;
  }

  if (mod === 'setup') {
    switch (funcNum) {
      case 11:
        s.editParam = 'select-pad';
        s.pendingAction = 'multi-pitch';
        s.moduleDisplay('Multi Pitch', 'Select a pad');
        break;
      case 12:
        s.editParam = 'select-pad';
        s.pendingAction = 'multi-level';
        s.moduleDisplay('Multi Level', 'Select a pad');
        break;
      case 13:
        // Screenshot: "Exit Multi Mode?" / "YES/NO"
        s.editParam = 'exit-multi-confirm';
        s.moduleDisplay('Exit Multi Mode?', 'YES/NO');
        break;
      case 14:
        // Screenshot: "Dyn Buttons? YES" / "(yes/no)"
        s.editParam = 'dynamic-confirm';
        s.moduleDisplay('Dyn Buttons? ' + (s.dynamicButtons ? 'YES' : 'NO'), '(yes/no)');
        break;
      case 15:
        // Screenshot: "Save Current Mix" / "As Mix #"
        s.editParam = 'define-mix';
        s.numericBuffer = '';
        s.moduleDisplay('Save Current Mix', 'As Mix #');
        break;
      case 16:
        // Screenshot: "Select Mix #1" / ""
        s.editParam = 'select-mix';
        s.numericBuffer = '';
        s.moduleDisplay('Select Mix #1', '');
        break;
      case 17:
        // Screenshot: "Assign A6" / "Output Channel 7"
        s.editParam = 'select-pad';
        s.pendingAction = 'channel-assign';
        s.moduleDisplay('Assign', 'Select Sound');
        break;
      case 18:
        // Screenshot: "Decay/Tuning" / "Select Sound"
        s.editParam = 'select-pad';
        s.pendingAction = 'decay-tune';
        s.moduleDisplay('Decay/Tuning', 'Select Sound');
        break;
      case 19:
        // Screenshot: "Truncate A1" / pad info
        s.editParam = 'select-pad';
        s.pendingAction = 'truncate';
        s.moduleDisplay('Truncate', 'Select Sound');
        break;
      case 20:
        // Screenshot: "Delete:" / "Select Sound"
        s.editParam = 'select-pad';
        s.pendingAction = 'delete-sound';
        s.moduleDisplay('Delete:', 'Select Sound');
        break;
      case 21:
        // Screenshot: "Song 01" / "First Step: 01"
        s.editParam = 'first-song-step';
        s.numericBuffer = '';
        s.moduleDisplay('Song ' + String(s.currentSong + 1).padStart(2, '0'), 'First Step: 01');
        break;
      case 23:
        s.editParam = 'special-menu';
        s.numericBuffer = '';
        s.moduleDisplay('Special Menu', 'Enter function #');
        break;
      case 22:
        // Screenshot: "Midi Parameters" / "Basic Channel 01"
        s.editParam = 'midi-channel';
        s.numericBuffer = '';
        s.moduleDisplay('Midi Parameters', 'Basic Channel 01');
        break;
      case 25:
        s.editParam = 'select-pad';
        s.pendingAction = 'reverse-sound';
        s.moduleDisplay('Reverse Sound', 'Select a pad');
        break;
      default:
        s.moduleDisplay('Setup ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'sample') {
    switch (funcNum) {
      case 1: // VU Mode — "A1      +00dB" / live VU meter on line 2
        s.editParam = 'vu-mode';
        s.display.lock();
        s.display.setLine1(s.vuPadLabel());
        s.display.showVU(0);
        document.dispatchEvent(new Event('sample-start-vu'));
        break;

      case 2: // Assign Voice — "Sampling" / select pad → "Sampling A1" / "Output Channel 7"
        s.editParam = 'select-pad';
        s.pendingAction = 'assign-voice';
        s.moduleDisplay('Sampling', 'Select Sound');
        break;

      case 3: // Input Gain — "Input Gain +20dB" / "Use + and -"
        s.editParam = 'sample-level';
        s.moduleDisplay('Input Gain ' + s.gainLabel(), 'Use + and -');
        break;

      case 4: // Threshold — full VU display, slider 1 sets threshold level
        s.editParam = 'threshold';
        s.display.lock();
        s.display.setLine1('Arm Slider #1');
        document.dispatchEvent(new Event('sample-start-vu'));
        break;

      case 5: // Sample Length — "Length: X.X secs" / "Use Slider #1"
        s.editParam = 'sample-length';
        s.moduleDisplay('Length: ' + s.sampleLength.toFixed(1) + ' secs', 'Use Slider #1');
        break;

      case 6: // Resample — reuse last pad + settings, record immediately
        s.moduleDisplay(s.vuPadLabel(), 'Resample? Y/N');
        s.editParam = 'resample-confirm';
        break;

      case 7: // Arm Sampling — "Sample Armed" / VU, waits for threshold breach
        s.moduleDisplay('Sample Armed', 'Waiting...');
        s.listenSampleDone();
        document.dispatchEvent(new Event('sample-arm'));
        document.dispatchEvent(new Event('sample-start-vu'));
        break;

      case 9: // Force Sample — record immediately
        s.moduleDisplay('Sampling...', '');
        s.listenSampleDone();
        document.dispatchEvent(new Event('sample-force'));
        break;

      default:
        s.moduleDisplay('Sample ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'sync') {
    switch (funcNum) {
      case 1: // "Select Internal"
        s.engine.send({ type: 'set-sync', mode: 1 });
        s.moduleDisplay('Select Internal', '');
        break;
      case 2: // "Select MIDI"
        s.engine.send({ type: 'set-sync', mode: 2 });
        s.moduleDisplay('Select MIDI', '');
        break;
      case 3: // "SMPTE Format is:" / "24fps" — arrows select, Enter confirms
        s.editParam = 'smpte-rate';
        s.moduleDisplay('SMPTE Format is:', s.smpteLabel());
        break;
      case 4: // "Click Divisor:" / value — keypad enters, Enter confirms
        s.editParam = 'click-divisor';
        s.numericBuffer = '';
        s.moduleDisplay('Click Divisor:', 'Enter value');
        break;
      default:
        s.moduleDisplay('Sync ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'disk') {
    switch (funcNum) {
      case 0:
        s.editParam = 'disk-browse';
        s._diskOperation = 'load-all';
        _loadDiskList(s);
        break;
      case 1:
        s.editParam = 'disk-browse';
        s._diskOperation = 'save-sequences';
        _loadDiskList(s);
        break;
      case 2:
        s.editParam = 'disk-browse';
        s._diskOperation = 'save-sounds';
        _loadDiskList(s);
        break;
      case 3:
        s.editParam = 'disk-browse';
        s._diskOperation = 'load-sequences';
        _loadDiskList(s);
        break;
      case 4:
        s.editParam = 'disk-seg-num';
        s.numericBuffer = '';
        s.moduleDisplay('Load Segment #', 'Enter 2-digit #');
        break;
      case 5:
        s.editParam = 'disk-browse';
        s._diskOperation = 'load-sounds';
        _loadDiskList(s);
        break;
      case 6:
        s.editParam = 'select-pad';
        s.pendingAction = 'load-sound-pad';
        s.moduleDisplay('Load Sound #', 'Select a pad');
        break;
      case 7:
        s.editParam = 'disk-browse';
        s._diskOperation = 'cat-sequences';
        _loadDiskList(s);
        break;
      case 8:
        s.editParam = 'disk-browse';
        s._diskOperation = 'cat-sounds';
        _loadDiskList(s);
        break;
      case 9:
        s.editParam = 'disk-name';
        s.diskNameBuffer = 'UNTITLED';
        s.diskNameCursor = 0;
        s.moduleDisplay('Save All As', s.diskNameBuffer);
        break;
      case 27:
        s.editParam = 'create-folder';
        s.diskNameBuffer = '';
        s.diskNameCursor = 0;
        s.moduleDisplay('Create Folder', '________________');
        break;
      default:
        s.moduleDisplay('Disk ' + funcNum, 'Not available');
    }
  }

  // Keep module-func if nothing else was set
  if (!s.editParam) s.editParam = 'module-func';
  s.numericBuffer = '';
}

// ── Special Menu dispatch (Setup 23 sub-functions) ───────────────────────
export function handleSpecialFunction(s, funcNum) {
  switch (funcNum) {
    case 11: // Catalog — show menu list
      s.moduleDisplay('Special Funcs:', '11-22, 25');
      break;
    case 12: // Clear All Memory
      s.editParam = 'clear-all-confirm';
      s.moduleDisplay('Clear ALL mem?', 'YES/NO');
      break;
    case 13: { // Memory Remaining
      // Calculate sample memory usage
      const MAX_SAMPLE_SECS = 10; // SP-1200: 10 seconds total @ 26.04kHz
      const SP1200_SR = 26040;
      const MAX_SAMPLES = MAX_SAMPLE_SECS * SP1200_SR;
      let totalSamples = 0;
      if (s.engine && s.engine._sampleSlots) {
        for (const slot of s.engine._sampleSlots) {
          if (slot && slot.sample) totalSamples += slot.sample.length;
        }
      }
      const usedSecs = (totalSamples / SP1200_SR).toFixed(1);
      const remainSecs = Math.max(0, MAX_SAMPLE_SECS - totalSamples / SP1200_SR).toFixed(1);

      // Estimate sequence memory usage (% of patterns with events)
      let usedPatterns = 0;
      const totalPatterns = 99;
      if (s.engine && s.engine._patterns) {
        for (const pat of s.engine._patterns) {
          if (pat && pat.tracks) {
            const hasEvents = pat.tracks.some(t => t.events && t.events.length > 0);
            if (hasEvents) usedPatterns++;
          }
        }
      }
      const seqPct = Math.round((usedPatterns / totalPatterns) * 100);
      s.moduleDisplay('Snd:' + remainSecs + 's free', 'Seq:' + seqPct + '% used');
      break;
    }
    case 15: // Clear Sound Memory
      s.editParam = 'clear-sounds-confirm';
      s.moduleDisplay('Clear Sounds?', 'YES/NO');
      break;
    case 16: // Clear Sequence Memory
      s.editParam = 'clear-seqs-confirm';
      s.moduleDisplay('Clear Seqnces?', 'YES/NO');
      break;
    case 17: // Copy Sound
      s.editParam = 'select-pad';
      s.pendingAction = 'copy-sound-from';
      s.moduleDisplay('Copy Sound', 'Select Source');
      break;
    case 18: // Swap Sounds
      s.editParam = 'select-pad';
      s.pendingAction = 'swap-sound-from';
      s.moduleDisplay('Swap Sounds', 'Select First');
      break;
    case 19: // Default Decay
      s.editParam = 'default-decay';
      s.moduleDisplay('Default Decay', 'Use Slider #1');
      break;
    case 21: // Name Sound
      s.editParam = 'select-pad';
      s.pendingAction = 'name-sound';
      s.moduleDisplay('Name Sound', 'Select Pad');
      break;
    case 22: // Dynamic Allocation
      s.editParam = 'dynamic-alloc-confirm';
      s.moduleDisplay('Dyn Alloc', 'Yes=9 No=7');
      break;
    case 25: // Reverse Sound (same as Setup 25)
      s.editParam = 'select-pad';
      s.pendingAction = 'reverse-sound';
      s.moduleDisplay('Reverse Sound', 'Select a pad');
      break;
    default:
      s.moduleDisplay('Special ' + funcNum, 'Not available');
  }
}

// ── Disk helpers ─────────────────────────────────────────────────────────

async function _loadDiskList(s) {
  try {
    s.diskFiles = await s.storage.listDisks();
    s.diskFileIndex = 0;
    if (s.diskFiles.length > 0) {
      s.diskCurrentFile = s.diskFiles[0];
      s.moduleDisplay(s.diskCurrentFile, 'Use +/- Enter');
    } else {
      s.moduleDisplay('No files', 'Save first (9)');
    }
  } catch (e) {
    s.moduleDisplay('Disk Error', e.message?.substring(0, 16) || 'Unknown');
  }
}

export async function executeDiskOp(s, op, filename) {
  try {
    switch (op) {
      case 'load-all': {
        const disk = await s.storage.loadAll(filename);
        if (disk && disk.data) {
          if (disk.data.sounds) {
            for (const snd of disk.data.sounds) {
              if (snd.buffer) {
                s.engine.send({ type: 'load-sample', pad: snd.pad, buffer: snd.buffer });
              }
            }
          }
          s.moduleDisplay('Loaded', filename);
        } else {
          s.moduleDisplay('File Empty', filename);
        }
        break;
      }
      case 'save-all': {
        const data = { sounds: [], sequences: [], timestamp: Date.now() };
        await s.storage.saveAll(filename, data);
        s.moduleDisplay('Saved', filename);
        break;
      }
      case 'save-sequences': {
        await s.storage.saveSequences(filename, []);
        s.moduleDisplay('Seq Saved', filename);
        break;
      }
      case 'save-sounds': {
        await s.storage.saveSounds(filename, []);
        s.moduleDisplay('Snd Saved', filename);
        break;
      }
      case 'load-sequences': {
        const disk = await s.storage.loadAll(filename);
        if (disk?.data?.sequences) {
          s.moduleDisplay('Seq Loaded', filename);
        } else {
          s.moduleDisplay('No Sequences', filename);
        }
        break;
      }
      case 'load-sounds': {
        const disk = await s.storage.loadAll(filename);
        if (disk?.data?.sounds) {
          for (const snd of disk.data.sounds) {
            if (snd.buffer) {
              s.engine.send({ type: 'load-sample', pad: snd.pad, buffer: snd.buffer });
            }
          }
          s.moduleDisplay('Snd Loaded', filename);
        } else {
          s.moduleDisplay('No Sounds', filename);
        }
        break;
      }
      case 'cat-sequences':
      case 'cat-sounds': {
        // Catalog just displays file info, no loading
        const disk = await s.storage.loadAll(filename);
        if (disk?.data) {
          const sndCount = disk.data.sounds?.length || 0;
          const seqCount = disk.data.sequences?.length || 0;
          s.moduleDisplay(filename, sndCount + ' Snd ' + seqCount + ' Seq');
        } else {
          s.moduleDisplay(filename, 'Empty');
        }
        break;
      }
    }
  } catch (e) {
    s.moduleDisplay('Disk Error', e.message?.substring(0, 16) || 'Failed');
  }

  // Return to module-func after 1.5s
  setTimeout(() => {
    if (s.activeModule === 'disk') {
      s.editParam = 'module-func';
      s.numericBuffer = '';
      s.moduleDisplay('DISK', 'Enter option #');
    }
  }, 1500);
}

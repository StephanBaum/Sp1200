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
        // Deactivate module
        if (mod.name === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
        s.activeModule = null;
        s.led(mod.led, false);
        document.getElementById(btnId).classList.remove('active');
        s.editParam = null;
        s.numericBuffer = '';
        s.pendingAction = null;
        s.display.unlock();
        s.display.setMode('segment');
      } else {
        // Deactivate previous module
        if (s.activeModule) {
          if (s.activeModule === 'sample') document.dispatchEvent(new Event('sample-stop-vu'));
          for (const [id, m] of Object.entries(modules)) {
            s.led(m.led, false);
            document.getElementById(id)?.classList.remove('active');
          }
        }
        // Activate this module
        s.activeModule = mod.name;
        s.led(mod.led, true);
        document.getElementById(btnId).classList.add('active');
        s.editParam = 'module-func';
        s.numericBuffer = '';
        // Show module name persistently (lock display)
        s.display.lock();
        s.display.setLine1(mod.label);
        s.display.setLine2('Enter option #');

        // Sample module auto-enters VU mode with live VU meter
        if (mod.name === 'sample') {
          s.display.setLine1(s.vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
        }
      }
    });
  }
}

export function handleModuleFunction(s, funcNum) {
  const mod = s.activeModule;
  if (!mod) return;

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
        s.editParam = 'exit-multi-confirm';
        s.moduleDisplay('Exit Multi?', 'Yes=9 No=7');
        break;
      case 14:
        s.editParam = 'dynamic-confirm';
        s.moduleDisplay('Dynamic Btns', 'Yes=9 No=7');
        break;
      case 15:
        s.editParam = 'define-mix';
        s.numericBuffer = '';
        s.moduleDisplay('Define Mix', 'Enter slot 1-8');
        break;
      case 16:
        s.editParam = 'select-mix';
        s.numericBuffer = '';
        s.moduleDisplay('Select Mix', 'Enter slot 1-8');
        break;
      case 17:
        s.editParam = 'select-pad';
        s.pendingAction = 'channel-assign';
        s.moduleDisplay('Channel Assign', 'Select a pad');
        break;
      case 18:
        s.editParam = 'select-pad';
        s.pendingAction = 'decay-tune';
        s.moduleDisplay('Decay/Tune Sel', 'Select a pad');
        break;
      case 19:
        s.editParam = 'select-pad';
        s.pendingAction = 'truncate';
        s.moduleDisplay('Loop/Truncate', 'Select a pad');
        break;
      case 20:
        s.editParam = 'select-pad';
        s.pendingAction = 'delete-sound';
        s.moduleDisplay('Delete Sound', 'Select a pad');
        break;
      case 22:
        s.editParam = 'dynamic-alloc-confirm';
        s.moduleDisplay('Dyn Alloc', 'Yes=9 No=7');
        break;
      case 23:
        s.editParam = 'special-menu';
        s.numericBuffer = '';
        s.moduleDisplay('Special Menu', 'Enter function #');
        break;
      case 25:
        s.editParam = 'select-pad';
        s.pendingAction = 'reverse-sound';
        s.moduleDisplay('Reverse Sound', 'Select a pad');
        break;
      default:
        s.display.flash('Setup ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'sample') {
    switch (funcNum) {
      case 1: // VU Mode — monitor input with live meter
        s.editParam = null;
        s.display.lock();
        s.display.setLine1(s.vuPadLabel());
        document.dispatchEvent(new Event('sample-start-vu'));
        break;
      case 2: // Assign Voice — select pad for sampling
        s.editParam = 'select-pad';
        s.pendingAction = 'assign-voice';
        s.moduleDisplay('Assign Voice', 'Select a pad');
        break;
      case 3: // Input Level — cycle 0/+20/+40 dB with arrows
        s.editParam = 'sample-level';
        s.moduleDisplay('Input Level', s.gainLabel());
        break;
      case 4: // Threshold — arm with slider
        s.editParam = 'threshold';
        s.moduleDisplay('Arm Threshold', 'Use Slider #1');
        break;
      case 5: // Sample Length
        s.editParam = 'sample-length';
        s.moduleDisplay('Sample Length', '2.5s Slider #1');
        break;
      case 6: // Resample
        s.display.flash('Resample', 'Last pad');
        break;
      case 7: // Arm Sampling — waits for threshold breach
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
        s.display.flash('Sample ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'sync') {
    switch (funcNum) {
      case 1:
        s.engine.send({ type: 'set-sync', mode: 1 });
        s.moduleDisplay('Select', 'Internal');
        break;
      case 2:
        s.engine.send({ type: 'set-sync', mode: 2 });
        s.moduleDisplay('Select', 'MIDI');
        break;
      case 3:
        s.editParam = 'smpte-rate';
        s.moduleDisplay('SMPTE Format is', s.smpteLabel());
        break;
      case 4:
        s.editParam = 'click-divisor';
        s.numericBuffer = '';
        s.moduleDisplay('Click Divisor', 'Enter value');
        break;
      default:
        s.display.flash('Sync ' + funcNum, 'Not available');
    }
  }
  else if (mod === 'disk') {
    switch (funcNum) {
      case 0:
        s.moduleDisplay('Load All', 'Select file +/-');
        s.editParam = 'disk-browse';
        break;
      case 1:
        s.moduleDisplay('Save Sequences', 'Processing...');
        break;
      case 2:
        s.moduleDisplay('Save Sounds', 'Processing...');
        break;
      case 3:
        s.moduleDisplay('Load Sequences', 'Select file +/-');
        s.editParam = 'disk-browse';
        break;
      case 4:
        s.editParam = 'disk-seg-num';
        s.numericBuffer = '';
        s.moduleDisplay('Load Segment #', 'Enter 2-digit #');
        break;
      case 5:
        s.moduleDisplay('Load Sounds', 'Select file +/-');
        s.editParam = 'disk-browse';
        break;
      case 6:
        s.editParam = 'select-pad';
        s.pendingAction = 'load-sound-pad';
        s.moduleDisplay('Load Sound #', 'Select a pad');
        break;
      case 7:
        s.moduleDisplay('Cat Sequences', 'Use +/- browse');
        s.editParam = 'disk-browse';
        break;
      case 8:
        s.moduleDisplay('Cat Sounds', 'Use +/- browse');
        s.editParam = 'disk-browse';
        break;
      case 9:
        s.editParam = 'disk-name';
        s.moduleDisplay('Save All As', 'Use slider name');
        break;
      default:
        s.display.flash('Disk ' + funcNum, 'Not available');
    }
  }

  s.editParam = s.editParam || null;
  s.numericBuffer = '';
}

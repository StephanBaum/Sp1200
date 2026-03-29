function _padLabel(s, pad) {
  return ['A', 'B', 'C', 'D'][s.currentBank] + ((pad ?? 0) + 1);
}

export function bindPadActions(s) {
  document.querySelectorAll('.pad').forEach(el => {
    el.addEventListener('mousedown', () => {
      const pad = parseInt(el.dataset.pad, 10);
      if (s.editParam === 'select-pad' && s.pendingAction) {
        switch (s.pendingAction) {
          case 'multi-pitch':
            s.engine.send({ type: 'multi-pitch', pad });
            s.multiMode = 'pitch';
            s.led('led-multi', true);
            s.led('led-tune', true);
            s.led('led-mix', false);
            s.faderMode = 'pitch';
            document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'pitch' } }));
            s.display.flash('Multi Pitch', _padLabel(s, pad));
            s.editParam = s.activeModule ? 'module-func' : null;
            s.pendingAction = null;
            break;
          case 'multi-level':
            s.engine.send({ type: 'multi-level', pad });
            s.multiMode = 'level';
            s.led('led-multi', true);
            s.led('led-mix', true);
            s.led('led-tune', false);
            s.faderMode = 'volume';
            document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'volume' } }));
            s.display.flash('Multi Level', _padLabel(s, pad));
            s.editParam = s.activeModule ? 'module-func' : null;
            s.pendingAction = null;
            break;
          case 'delete-sound':
            // Screenshot: "Delete: A1" / "Confirm? Y/N"
            s._pendingPad = pad;
            s.editParam = 'delete-confirm';
            s.pendingAction = null;
            s.moduleDisplay('Delete: ' + _padLabel(s, pad), 'Confirm? Y/N');
            break;
          case 'decay-tune':
            // Screenshot: "A7     TUNED" / "1=Tune  2=Decay"
            s._pendingPad = pad;
            s.editParam = 'decay-tune-select';
            s.pendingAction = null;
            const mode = s.padModes?.[pad] || 'tune';
            s.moduleDisplay(
              _padLabel(s, pad) + (mode === 'tune' ? '      TUNED' : '    DECAYED'),
              '1=Tune  2=Decay'
            );
            break;
          case 'truncate':
            // Screenshot: "Truncate A1" then sample points
            s._pendingPad = pad;
            s._pendingBank = s.currentBank;
            s.editParam = 'truncate-edit';
            s.pendingAction = null;
            s._truncStart = 0;
            s._truncEnd = 65535;
            s._truncLoop = -1; // -1 = NONE
            s._truncSampleLen = 0;
            // Query engine for actual sample info
            s.engine.send({ type: 'query-sample-info', pad, bank: s.currentBank });
            // Switch faders to truncate mode
            document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'truncate' } }));
            s.moduleDisplay(
              'S=' + String(s._truncStart).padStart(5, '0') + '  ' + _padLabel(s, pad),
              'E=' + String(s._truncEnd).padStart(5, '0') + '  L= NONE'
            );
            break;
          case 'channel-assign':
            // Screenshot: "Assign A6" / "Output Channel 7"
            s._pendingPad = pad;
            s.editParam = 'channel-assign-num';
            s.pendingAction = null;
            const ch = (s.channelAssign?.[pad] ?? pad) + 1;
            s.moduleDisplay('Assign ' + _padLabel(s, pad), 'Output Channel ' + ch);
            break;
          case 'reverse-sound':
            s._pendingPad = pad;
            s.editParam = 'reverse-confirm';
            s.pendingAction = null;
            s.moduleDisplay('Reverse ' + _padLabel(s, pad), 'YES/NO');
            break;
          case 'assign-voice':
            // Screenshot: "Sampling A8" then "Output Channel 7"
            s.selectedSamplePad = pad;
            s._pendingPad = pad;
            s.editParam = 'assign-voice-channel';
            s.pendingAction = null;
            s.moduleDisplay('Sampling ' + _padLabel(s, pad), 'Output Channel ' + ((s.channelAssign?.[pad] ?? pad) + 1));
            break;
          case 'copy-sound-from':
            s._pendingPad = pad;
            s._pendingBank = s.currentBank;
            s.editParam = 'select-pad';
            s.pendingAction = 'copy-sound-to';
            s.moduleDisplay('Copy ' + _padLabel(s, pad), 'Select Dest');
            break;
          case 'copy-sound-to': {
            const fromSlot = (s._pendingBank ?? s.currentBank) * 8 + s._pendingPad;
            const toSlot = s.currentBank * 8 + pad;
            s.engine.send({ type: 'copy-sound', from: fromSlot, to: toSlot });
            s.display.flash('Copied', _padLabel(s, s._pendingPad) + ' > ' + _padLabel(s, pad));
            s._pendingPad = null;
            s._pendingBank = null;
            s.editParam = 'module-func';
            s.pendingAction = null;
            break;
          }
          case 'swap-sound-from':
            s._pendingPad = pad;
            s._pendingBank = s.currentBank;
            s.editParam = 'select-pad';
            s.pendingAction = 'swap-sound-to';
            s.moduleDisplay('Swap ' + _padLabel(s, pad), 'Select Second');
            break;
          case 'swap-sound-to': {
            const fromSlot = (s._pendingBank ?? s.currentBank) * 8 + s._pendingPad;
            const toSlot = s.currentBank * 8 + pad;
            s.engine.send({ type: 'swap-sounds', padA: fromSlot, padB: toSlot });
            s.display.flash('Swapped', _padLabel(s, s._pendingPad) + ' <> ' + _padLabel(s, pad));
            s._pendingPad = null;
            s.editParam = 'module-func';
            s.pendingAction = null;
            break;
          }
          case 'load-sound-pad':
            s.display.flash('Load Sound', _padLabel(s, pad));
            s.editParam = 'module-func';
            s.pendingAction = null;
            break;
          case 'name-sound':
            s._pendingPad = pad;
            s._pendingBank = s.currentBank;
            s.editParam = 'name-sound-edit';
            s.pendingAction = null;
            s.diskNameBuffer = '';
            s.diskNameCursor = 0;
            s.moduleDisplay('Name ' + _padLabel(s, pad), '________________');
            break;
        }
        // Return to module-func if select-pad wasn't re-set by the action
        // (e.g., copy-sound-from sets select-pad + copy-sound-to for the next step)
        if (s.editParam === 'select-pad' && !s.pendingAction) {
          s.editParam = s.activeModule ? 'module-func' : null;
        }
      } else if (s.eraseMode && s.playing) {
        // Start continuous erase — events removed as playhead passes
        s.engine.send({ type: 'erase-track-start', pad });
        const stopErase = () => {
          s.engine.send({ type: 'erase-track-stop', pad });
          document.removeEventListener('mouseup', stopErase);
        };
        document.addEventListener('mouseup', stopErase);
      } else if (s.tapRepeatHeld) {
        const repeatPad = pad;
        const msPerQuarter = 60000 / s.bpm;
        const msPerStep = msPerQuarter * s.quantizeGrid / 96;
        if (s._repeatInterval) clearInterval(s._repeatInterval);
        s._repeatInterval = setInterval(() => {
          if (!s.tapRepeatHeld) { clearInterval(s._repeatInterval); s._repeatInterval = null; return; }
          s.engine.trigger(repeatPad, 100, s.currentBank);
        }, Math.max(30, msPerStep));
      } else if (s.activeModule === 'sample' && !s.pendingAction) {
        // In sample module: tap pad to select it, then return to VU
        s.selectedSamplePad = pad;
        s.moduleDisplay('Sample \u2192 ' + _padLabel(s, pad), '');
        setTimeout(() => {
          if (s.activeModule === 'sample') {
            s.editParam = 'vu-mode';
            s.display.setLine1(s.vuPadLabel());
            document.dispatchEvent(new Event('sample-start-vu'));
          }
        }, 800);
      } else if (s.activeModule && !s.pendingAction) {
        // Pad clicked while module active but no pending action — stay in module, don't exit
      }
    });
  });
}

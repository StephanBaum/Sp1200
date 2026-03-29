import { handleModuleFunction, handleSpecialFunction, executeDiskOp } from './modules.js';
import { confirmEntry } from './master-control.js';

function _padLabel(s, pad) {
  return ['A', 'B', 'C', 'D'][s.currentBank] + ((pad ?? 0) + 1);
}

export function bindKeypad(s) {
  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;

      // If a module is active, route digits to module functions
      if (s.activeModule && (s.editParam === 'module-func' || !s.editParam)) {
        s.editParam = 'module-func';
        s.numericBuffer += key;
        s.moduleDisplay(s.activeModule.toUpperCase() + ' ' + s.numericBuffer, 'Enter option #');
        if (s.activeModule === 'setup' && s.numericBuffer.length >= 2) {
          handleModuleFunction(s, parseInt(s.numericBuffer, 10));
        } else if (s.activeModule !== 'setup') {
          handleModuleFunction(s, parseInt(s.numericBuffer, 10));
        }
        return;
      }

      // ── Special Menu (Setup 23) — capture 2-digit sub-function ────────

      if (s.editParam === 'special-menu') {
        s.numericBuffer += key;
        s.moduleDisplay('Special ' + s.numericBuffer, 'Enter function #');
        if (s.numericBuffer.length >= 2) {
          handleSpecialFunction(s, parseInt(s.numericBuffer, 10));
          s.numericBuffer = '';
        }
        return;
      }

      // ── First Song Step (Setup 21) ────────────────────────────────────

      if (s.editParam === 'first-song-step') {
        s.numericBuffer += key;
        s.moduleDisplay('Song ' + String(s.currentSong + 1).padStart(2, '0'),
          'First Step: ' + s.numericBuffer.padStart(2, '0'));
        if (s.numericBuffer.length >= 2) {
          const step = parseInt(s.numericBuffer, 10);
          s.engine.send({ type: 'song-set-start', song: s.currentSong, step });
          s.editParam = 'module-func';
          s.numericBuffer = '';
        }
        return;
      }

      // ── Yes/No confirmation flows (Key 9 = Yes, Key 7 = No) ──────────

      if (s.editParam === 'exit-multi-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'exit-multi' });
          s.multiMode = null;
          s.led('led-multi', false);
          s.display.flash('Exit Multi', 'Done');
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'dynamic-confirm') {
        if (key === '9') {
          s.dynamicButtons = true;
          s.engine.send({ type: 'dynamic-buttons', enabled: true });
          s.moduleDisplay('Dyn Buttons? YES', '(yes/no)');
        } else if (key === '7') {
          s.dynamicButtons = false;
          s.engine.send({ type: 'dynamic-buttons', enabled: false });
          s.moduleDisplay('Dyn Buttons? NO', '(yes/no)');
        }
        // Stay on screen — pressing module button or another function exits
        return;
      }

      if (s.editParam === 'delete-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'delete-sound', pad: s._pendingPad, bank: s.currentBank });
          s.moduleDisplay('Deleted', _padLabel(s, s._pendingPad) + '  Next pad?');
        } else if (key === '7') {
          s.moduleDisplay('Cancelled', 'Select next pad');
        }
        // Stay in delete mode for next pad
        s.editParam = 'select-pad';
        s.pendingAction = 'delete-sound';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'reverse-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'reverse-sound', pad: s._pendingPad, bank: s.currentBank });
          s.moduleDisplay('Reversed', _padLabel(s, s._pendingPad) + '  Next pad?');
        } else if (key === '7') {
          s.moduleDisplay('Cancelled', 'Select next pad');
        }
        // Stay in reverse mode for next pad
        s.editParam = 'select-pad';
        s.pendingAction = 'reverse-sound';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'decay-tune-select') {
        if (key === '1') {
          s.engine.send({ type: 'set-pad-mode', pad: s._pendingPad, mode: 'tune' });
          if (!s.padModes) s.padModes = new Array(8).fill('tune');
          s.padModes[s._pendingPad] = 'tune';
          s.moduleDisplay(_padLabel(s, s._pendingPad) + '      TUNED', 'Select next pad');
        } else if (key === '2') {
          s.engine.send({ type: 'set-pad-mode', pad: s._pendingPad, mode: 'decay' });
          if (!s.padModes) s.padModes = new Array(8).fill('tune');
          s.padModes[s._pendingPad] = 'decay';
          s.moduleDisplay(_padLabel(s, s._pendingPad) + '    DECAYED', 'Select next pad');
        }
        // Return to select-pad so user can pick another pad
        s.editParam = 'select-pad';
        s.pendingAction = 'decay-tune';
        return;
      }

      // ── Channel assign: type channel number 1-16, Enter confirms ──────

      if (s.editParam === 'channel-assign-num') {
        s.numericBuffer += key;
        const ch = parseInt(s.numericBuffer, 10);
        s.moduleDisplay('Assign ' + _padLabel(s, s._pendingPad), 'Output Channel ' + s.numericBuffer);
        if (s.numericBuffer.length >= 1 && ch >= 1 && ch <= 8) {
          s.engine.send({ type: 'channel-assign', pad: s._pendingPad, channel: ch });
          if (!s.channelAssign) s.channelAssign = new Uint8Array(8);
          s.channelAssign[s._pendingPad] = ch - 1;
          s.moduleDisplay('Assign ' + _padLabel(s, s._pendingPad), 'Channel ' + ch + ' Set');
          // Stay in channel-assign mode — ready for next pad
          s.editParam = 'select-pad';
          s.pendingAction = 'channel-assign';
          s.numericBuffer = '';
        } else if (s.numericBuffer.length >= 2) {
          s.numericBuffer = '';
        }
        return;
      }

      // ── Assign voice: after pad, enter channel ────────────────────────

      if (s.editParam === 'assign-voice-channel') {
        s.numericBuffer += key;
        s.moduleDisplay('Sampling ' + _padLabel(s, s._pendingPad), 'Output Channel ' + s.numericBuffer);
        // Single digit for channel 1-8, auto-confirm
        const ch = parseInt(s.numericBuffer, 10);
        if (ch >= 1 && ch <= 8) {
          s.engine.send({ type: 'channel-assign', pad: s._pendingPad, channel: ch });
          if (!s.channelAssign) s.channelAssign = new Uint8Array(8);
          s.channelAssign[s._pendingPad] = ch - 1;
          s._pendingPad = null;
          // Return to VU mode (per manual: "You are then returned to Option 1")
          s.editParam = 'vu-mode';
          s.numericBuffer = '';
          s.display.setLine1(s.vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
        }
        return;
      }

      // ── Resample confirm (Sample 6) ───────────────────────────────────
      if (s.editParam === 'resample-confirm') {
        if (key === '9') {
          // Start recording with existing pad/settings
          s.moduleDisplay('Sampling...', '');
          s.listenSampleDone();
          document.dispatchEvent(new Event('sample-force'));
        } else if (key === '7') {
          // Return to VU
          s.editParam = 'vu-mode';
          s.numericBuffer = '';
          s.display.setLine1(s.vuPadLabel());
          document.dispatchEvent(new Event('sample-start-vu'));
        }
        return;
      }

      // ── VU mode — keypad selects function number ──────────────────────
      if (s.editParam === 'vu-mode') {
        // In VU mode, pressing a number enters that sample function
        s.editParam = 'module-func';
        s.numericBuffer = key;
        handleModuleFunction(s, parseInt(key, 10));
        return;
      }

      // ── MIDI channel (Setup 22) ───────────────────────────────────────

      if (s.editParam === 'midi-channel') {
        s.numericBuffer += key;
        s.moduleDisplay('Midi Parameters', 'Basic Channel ' + s.numericBuffer.padStart(2, '0'));
        if (s.numericBuffer.length >= 2) {
          const ch = parseInt(s.numericBuffer, 10);
          if (ch >= 1 && ch <= 16) {
            s.engine.send({ type: 'set-midi-channel', channel: ch });
            // After channel, show MIDI mode selection
            s.editParam = 'midi-mode';
            s.numericBuffer = '';
            s.moduleDisplay('MIDI Mode: omni', '1=omni  2=poly');
          } else {
            s.editParam = 'module-func';
            s.numericBuffer = '';
          }
        }
        return;
      }

      if (s.editParam === 'midi-mode') {
        if (key === '1') {
          s.engine.send({ type: 'set-midi-mode', mode: 'omni' });
          s.moduleDisplay('MIDI Mode: omni', '1=omni  2=poly');
        } else if (key === '2') {
          s.engine.send({ type: 'set-midi-mode', mode: 'poly' });
          s.moduleDisplay('MIDI Mode: poly', '1=omni  2=poly');
        }
        return;
      }

      // ── Define/Select mix slot ────────────────────────────────────────

      if (s.editParam === 'define-mix') {
        if (key >= '1' && key <= '8') {
          s.engine.send({ type: 'define-mix', slot: parseInt(key, 10) - 1 });
          s.display.flash('Mix ' + key, 'Saved');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'select-mix') {
        if (key >= '1' && key <= '8') {
          s.engine.send({ type: 'select-mix', slot: parseInt(key, 10) - 1 });
          s.moduleDisplay('Select Mix #' + key, '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      // ── Truncate confirm ──────────────────────────────────────────────

      if (s.editParam === 'truncate-confirm') {
        if (key === '9') {
          s.engine.send({
            type: 'truncate-permanent',
            pad: s._pendingPad,
            bank: s._pendingBank ?? s.currentBank,
            start: s._truncStart ?? 0,
            end: s._truncEnd ?? 65535,
          });
          s.display.flash('Truncated', _padLabel(s, s._pendingPad));
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        // Restore fader mode
        document.dispatchEvent(new CustomEvent('fader-mode-change', { detail: { mode: 'volume' } }));
        s._pendingPad = null;
        s._pendingBank = null;
        s._truncStart = null;
        s._truncEnd = null;
        s._truncLoop = null;
        s._truncSampleLen = null;
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      // ── Segment truncate confirm ──────────────────────────────────────

      if (s.editParam === 'seg-truncate-confirm') {
        if (key === '9') {
          // Yes — permanently delete events beyond the new length
          s.engine.send({ type: 'truncate-pattern', bars: s._segTruncBars });
          s.display.flash('Truncated', s._segTruncBars + ' Bars');
        } else if (key === '7') {
          // No — keep hidden events (they won't play but remain stored)
          s.display.flash('Kept Hidden', 'Events saved');
        }
        s._segTruncBars = null;
        s.editParam = null;
        s.numericBuffer = '';
        return;
      }

      // ── Clear All Memory (Special 12) ─────────────────────────────────

      if (s.editParam === 'clear-all-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'clear-all' });
          s.display.flash('All Cleared', '');
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'clear-sounds-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'clear-sounds' });
          s.display.flash('Sounds Cleared', '');
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'clear-seqs-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'clear-sequences' });
          s.display.flash('Seqs Cleared', '');
        } else if (key === '7') {
          s.display.flash('Cancelled', '');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      if (s.editParam === 'dynamic-alloc-confirm') {
        if (key === '9') {
          s.engine.send({ type: 'dynamic-alloc', enabled: true });
          s.display.flash('Dyn Alloc', 'Enabled');
        } else if (key === '7') {
          s.engine.send({ type: 'dynamic-alloc', enabled: false });
          s.display.flash('Dyn Alloc', 'Disabled');
        }
        s.editParam = 'module-func';
        s.numericBuffer = '';
        return;
      }

      // ── Sub Song entry (song mode) ──────────────────────────────────
      if (s.editParam === 'tempo-change-dir') {
        if (key === '1' || key === '2') {
          s._tempoDir = key === '1' ? 'accel' : 'ritard';
          s.editParam = 'tempo-change-amount';
          s.numericBuffer = '';
          s.moduleDisplay('Change: __ BPM', 'Over: __ Beats');
        }
        return;
      }

      if (s.editParam === 'tempo-change-amount') {
        s.numericBuffer += key;
        s.display.setLine1('Change: ' + s.numericBuffer.padStart(2, '_') + ' BPM');
        if (s.numericBuffer.length >= 2) {
          s._tempoAmount = parseInt(s.numericBuffer, 10);
          s.editParam = 'tempo-change-beats';
          s.numericBuffer = '';
        }
        return;
      }

      if (s.editParam === 'tempo-change-beats') {
        s.numericBuffer += key;
        s.display.setLine2('Over: ' + s.numericBuffer.padStart(2, '_') + ' Beats');
        if (s.numericBuffer.length >= 2) {
          const beats = parseInt(s.numericBuffer, 10);
          s.engine.send({
            type: 'song-add-step',
            song: s.currentSong,
            step: 999,
            stepType: 'tempo-change',
            value: { amount: s._tempoAmount, beats, direction: s._tempoDir },
          });
          s.display.flash(
            'Tempo ' + (s._tempoDir === 'accel' ? '+' : '-') + s._tempoAmount,
            'Over ' + beats + ' beats'
          );
          s.numericBuffer = '';
          s.editParam = null;
        }
        return;
      }

      if (s.editParam === 'subsong-entry') {
        s.numericBuffer += key;
        s.display.setLine2('Song #: ' + s.numericBuffer.padStart(2, '_'));
        if (s.numericBuffer.length >= 2) {
          const songNum = parseInt(s.numericBuffer, 10);
          if (songNum >= 0 && songNum < 100) {
            s.engine.send({
              type: 'song-add-step',
              song: s.currentSong,
              step: 999,
              stepType: 'sub-song',
              value: songNum,
            });
            s.display.flash('Sub Song', 'Song ' + s.numericBuffer);
          }
          s.numericBuffer = '';
          s.editParam = null;
        }
        return;
      }

      // ── Trigger type (song mode) ──────────────────────────────────────
      if (s.editParam === 'trigger-type') {
        const types = { '1': '1/4', '2': '1/8', '3': '1/16', '4': '1/32', '5': '1/32T', '6': 'Click' };
        if (types[key]) {
          s.engine.send({ type: 'song-add-step', song: s.currentSong, step: 999, stepType: 'trigger', value: key });
          s.display.flash('Trigger', types[key]);
        }
        s.editParam = null;
        s.numericBuffer = '';
        return;
      }

      // ── Repeat count (song mode) ──────────────────────────────────────
      if (s.editParam === 'repeat-count') {
        s.numericBuffer += key;
        s.moduleDisplay('Repeat', 'Count: ' + s.numericBuffer.padStart(2, '0'));
        if (s.numericBuffer.length >= 2) {
          const count = parseInt(s.numericBuffer, 10);
          if (count >= 1 && count <= 99) {
            s.engine.send({ type: 'song-add-step', song: s.currentSong, step: 999, stepType: 'repeat-start', value: count });
            s.display.flash('Repeat', count + 'x');
          }
          s.editParam = null;
          s.numericBuffer = '';
        }
        return;
      }

      // ── Mix Change (song mode) ────────────────────────────────────────
      if (s.editParam === 'mix-change') {
        if (key >= '1' && key <= '8') {
          s.engine.send({ type: 'song-add-step', song: s.currentSong, step: 999, stepType: 'mix-change', value: parseInt(key, 10) });
          s.display.flash('Mix ' + key, 'Step added');
        }
        s.editParam = null;
        s.numericBuffer = '';
        return;
      }

      // ── Tab Song step entry (song mode) ───────────────────────────────
      if (s.editParam === 'tabsong-entry') {
        s.numericBuffer += key;
        s.moduleDisplay('Song Edit', 'Seg ' + s.numericBuffer.padStart(2, '0'));
        if (s.numericBuffer.length >= 2) {
          const segNum = parseInt(s.numericBuffer, 10);
          if (segNum >= 1 && segNum <= 99) {
            const segIdx = segNum - 1; // user types 1-indexed, internal 0-indexed
            s.engine.send({ type: 'song-add-step', song: s.currentSong, step: 999, stepType: 'segment', value: segIdx });
            s.moduleDisplay('Added Seg ' + String(segNum).padStart(2, '0'), 'Next seg #');
          }
          // Stay in song edit mode for next entry
          s.editParam = 'tabsong-entry';
          s.numericBuffer = '';
        }
        return;
      }

      // ── Passthrough: modes that use arrows only ───────────────────────

      if (s.editParam === 'sample-level' || s.editParam === 'smpte-rate' ||
          s.editParam === 'threshold' || s.editParam === 'sample-length' ||
          s.editParam === 'truncate-edit') {
        return;
      }

      if (s.editParam === 'click-divisor') {
        s.numericBuffer += key;
        s.moduleDisplay('Click Divisor', s.numericBuffer);
        return;
      }

      if (s.editParam === 'disk-browse') {
        return;
      }

      if (s.editParam === 'disk-name' || s.editParam === 'name-sound-edit' || s.editParam === 'create-folder') {
        if (key === '7') {
          // Backspace
          if (s.diskNameBuffer.length > 0) {
            s.diskNameBuffer = s.diskNameBuffer.slice(0, -1);
            if (s.diskNameCursor > s.diskNameBuffer.length) {
              s.diskNameCursor = s.diskNameBuffer.length;
            }
          }
        } else {
          s.diskNameBuffer += key;
          s.diskNameCursor = s.diskNameBuffer.length;
        }
        const _nameLabel = s.editParam === 'name-sound-edit'
          ? 'Name ' + _padLabel(s, s._pendingPad)
          : s.editParam === 'create-folder' ? 'Create Folder' : 'Save All As';
        s.moduleDisplay(_nameLabel, s.diskNameBuffer.substring(0, 16) || '_');
        return;
      }

      if (s.editParam === 'disk-seg-num') {
        s.numericBuffer += key;
        s.moduleDisplay('Load Segment #', s.numericBuffer);
        if (s.numericBuffer.length >= 2) confirmEntry(s);
        return;
      }

      // ── Normal numeric entry ──────────────────────────────────────────

      s.numericBuffer += key;
      if (s.editParam === 'bpm') {
        s.moduleDisplay('Tempo ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 3) confirmEntry(s);
      } else if (s.editParam === 'segment' || s.editParam === 'copy' || s.editParam === 'erase-seg') {
        s.moduleDisplay('Seg ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else if (s.editParam === 'seg-length') {
        s.moduleDisplay('Bars: ' + s.numericBuffer, 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else if (s.editParam === 'swing') {
        s.moduleDisplay('Swing ' + s.numericBuffer + '%', 'Enter to confirm');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      } else {
        if (!s.editParam) s.editParam = 'segment';
        s.moduleDisplay('Seg ' + s.numericBuffer, '');
        if (s.numericBuffer.length >= 2) confirmEntry(s);
      }
    });
  });
}

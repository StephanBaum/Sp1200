export function bindProgramming(s) {
  s.led('led-segment', true);

  document.querySelectorAll('.prog').forEach(btn => {
    const upper = btn.dataset.upper;
    const lower = btn.dataset.lower;

    btn.addEventListener('click', () => {
      // Clear previous edit state — but don't exit an active module
      if (s.editParam && s.editParam !== 'module-func' && !s.activeModule) {
        s.editParam = null;
        s.display.unlock();
      }

      // Clear all prog active states, set this one
      document.querySelectorAll('.prog').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Button 1 (Song/Segment) is the mode selector — it toggles mode
      if (btn.id === 'prog-1') {
        if (s.mode === 'song') {
          // Switch to segment mode
          s.mode = 'segment';
          s.engine.setMode('segment');
          s.led('led-song', false);
          s.led('led-segment', true);
          s.editParam = 'segment';
          s.numericBuffer = '';
          s.display.setMode('segment');
        } else {
          // Switch to song mode
          s.mode = 'song';
          s.engine.setMode('song');
          s.led('led-song', true);
          s.led('led-segment', false);
          s.display.setSong(s.currentSong);
          s.display.setMode('song');
        }
        return;
      }

      // All other buttons: upper function = song mode, lower = segment mode
      // Some functions work in both modes (tempo-change, auto-correct)
      const func = s.mode === 'song' ? upper : lower;
      execProgFunction(s, func, btn);
    });
  });
}

export function execProgFunction(s, func, btn) {
  const QUANT_GRIDS  = [96, 48, 32, 24, 16, 12, 1];
  const QUANT_LABELS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'HiRes'];

  switch (func) {
    // ── Song mode functions (upper labels) ────────────────────────────

    case 'trigger':
      // Song mode: insert trigger step (click type for external sync)
      s.editParam = 'trigger-type';
      s.moduleDisplay('Trigger Step', '1=1/4 2=1/8 3=16');
      break;

    case 'repeat':
      // Song mode: insert repeat start/end brackets
      s.editParam = 'repeat-count';
      s.numericBuffer = '';
      s.moduleDisplay('Repeat', 'Enter count 01-99');
      break;

    case 'tabsong':
      // Song mode: view/scroll song arrangement
      s.editParam = 'tabsong';
      s._tabSongStep = 0;
      s.moduleDisplay('Song ' + String(s.currentSong + 1).padStart(2, '0'),
        'Step 01: ---');
      break;

    case 'end':
      // Song mode: insert end marker
      s.engine.send({ type: 'song-end-mark', song: s.currentSong });
      s.display.flash('End Mark', 'Song end set');
      break;

    case 'insert':
      // Song mode: insert empty step
      s.engine.send({ type: 'song-insert', song: s.currentSong });
      s.display.flash('Insert', 'Step inserted');
      break;

    case 'delete':
      // Song mode: delete current step
      s.engine.send({ type: 'song-delete', song: s.currentSong });
      s.display.flash('Delete', 'Step removed');
      break;

    case 'mix-change':
      // Song mode: insert mix-change step
      s.editParam = 'mix-change';
      s.numericBuffer = '';
      s.moduleDisplay('Mix Change', 'Enter mix # 1-8');
      break;

    case 'subsong':
      if (s.mode === 'song') {
        s.editParam = 'subsong-entry';
        s.numericBuffer = '';
        s.moduleDisplay('Sub Song', 'Song #: __');
      }
      break;

    // ── Segment mode functions (lower labels) ─────────────────────────

    case 'metronome':
      s.metronomeOn = !s.metronomeOn;
      s.engine.send({ type: 'set-metronome', enabled: s.metronomeOn });
      s.display.flash(
        s.metronomeOn ? 'Click On' : 'Click Off',
        s.metronomeOn ? 'Metronome on' : 'Metronome off'
      );
      break;

    case 'swing':
      s.editParam = 'swing';
      s.moduleDisplay('Swing ' + s.swingAmount + '%', 'Use < and >');
      break;

    case 'copy':
      s.editParam = 'copy';
      s.numericBuffer = '';
      s.moduleDisplay('Copy Seg ' + String(s.currentSegment + 1).padStart(2, '0'), 'To seg #?');
      break;

    case 'time-sig':
      s.editParam = 'time-sig';
      s.numericBuffer = '';
      s.moduleDisplay('Time Sig', s.timeSig);
      break;

    case 'seg-length':
      s.editParam = 'seg-length';
      s.numericBuffer = '';
      s.moduleDisplay('Seg Length', s.segmentLength + ' Bars');
      break;

    case 'erase':
      if (s.playing) {
        // Real-time erase: hold pad while playing to delete hits
        s.eraseMode = !s.eraseMode;
        s.moduleDisplay(
          s.eraseMode ? 'Erase On' : 'Erase Off',
          s.eraseMode ? 'Hold pad' : ''
        );
      } else {
        // Stopped: erase segment by number
        s.editParam = 'erase-seg';
        s.numericBuffer = '';
        s.moduleDisplay('Erase Seg?', 'Enter seg number');
      }
      break;

    case 'step-program':
      s.stepProgramMode = !s.stepProgramMode;
      if (s.stepProgramMode) {
        s.mode = 'step-edit';
        s.engine.setMode('step-edit');
        s.led('led-record', true);
        s.led('led-run', false);
        document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: true, quantize: s.quantizeGrid, bars: s.segmentLength } }));
      } else {
        s.mode = 'segment';
        s.engine.setMode('segment');
        s.led('led-record', false);
        document.dispatchEvent(new CustomEvent('step-edit-toggle', { detail: { active: false } }));
        s.display.setMode('segment');
      }
      break;

    // ── Both modes ────────────────────────────────────────────────────

    case 'tempo-change':
      if (s.mode === 'song') {
        s.editParam = 'tempo-change-dir';
        s.numericBuffer = '';
        s.moduleDisplay('Tempo Change', '1=Accel 2=Ritard');
      } else {
        s.editParam = 'bpm';
        s.numericBuffer = '';
        s.moduleDisplay('Tempo: ' + Math.round(s.bpm), 'Use < > or keys');
      }
      break;

    case 'auto-correct':
      s.editParam = 'quantize';
      s.moduleDisplay('Auto-Correct', QUANT_LABELS[s.quantizeIndex]);
      break;
  }
}

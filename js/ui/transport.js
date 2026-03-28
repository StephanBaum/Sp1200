export function bindTransport(s) {
  document.getElementById('btn-run-stop').addEventListener('click', () => {
    if (s.playing) { stop(s); } else { play(s); }
  });

  document.getElementById('btn-record').addEventListener('click', () => {
    if (s.playing) {
      // Already playing — toggle recording on/off (overdub)
      s.recording = !s.recording;
      if (s.recording) s.engine.record();
      document.getElementById('btn-record').classList.toggle('active', s.recording);
      s.led('led-record', s.recording);
    } else {
      // Not playing — arm recording, then start playback
      s.recording = true;
      s.engine.record();
      document.getElementById('btn-record').classList.add('active');
      s.led('led-record', true);
      play(s);
    }
  });

  // Tap/Repeat: click = tap tempo, hold + pad = retrigger at autocorrect rate
  const tapBtn = document.getElementById('btn-tap-tempo');
  s.tapRepeatHeld = false;
  s._repeatInterval = null;
  tapBtn.addEventListener('mousedown', () => {
    s.tapRepeatHeld = true;
    handleTapTempo(s);
  });
  tapBtn.addEventListener('mouseup', () => {
    s.tapRepeatHeld = false;
    if (s._repeatInterval) { clearInterval(s._repeatInterval); s._repeatInterval = null; }
  });
  tapBtn.addEventListener('mouseleave', () => {
    s.tapRepeatHeld = false;
    if (s._repeatInterval) { clearInterval(s._repeatInterval); s._repeatInterval = null; }
  });
}

function play(s) {
  s.playing = true;
  s.engine.play();
  s.display.setPlaying(true);
  document.getElementById('btn-run-stop').classList.add('active');
  s.led('led-run', true);
}

function stop(s) {
  s.playing = false;
  s.recording = false;
  s.engine.stop();
  s.display.setPlaying(false);
  document.getElementById('btn-run-stop').classList.remove('active');
  document.getElementById('btn-record').classList.remove('active');
  s.led('led-run', false);
  s.led('led-record', false);
}

function handleTapTempo(s) {
  const now = performance.now();
  s.tapTimes.push(now);
  if (s.tapTimes.length > 4) s.tapTimes.shift();
  if (s.tapTimes.length >= 2) {
    let total = 0;
    for (let i = 1; i < s.tapTimes.length; i++) total += s.tapTimes[i] - s.tapTimes[i - 1];
    const avg = total / (s.tapTimes.length - 1);
    s.bpm = Math.max(30, Math.min(250, Math.round(60000 / avg)));
    s.engine.setBpm(s.bpm);
    s.display.setBpm(s.bpm);
  }
}

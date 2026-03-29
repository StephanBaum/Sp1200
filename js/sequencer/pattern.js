import { PPQN, NUM_PADS } from '../constants.js';

export class PatternEvent {
  constructor(tick, velocity = 127, pitchOffset = 0, params = null) {
    this.tick = tick;
    this.velocity = velocity;
    this.pitchOffset = pitchOffset;
    // Per-note parameters captured at record time
    this.slot = params?.slot ?? null;          // sample slot index (bank*8+pad, null = use voice's current sample)
    this.pitch = params?.pitch ?? null;        // pitch rate (null = use current setting)
    this.decay = params?.decay ?? null;        // decay rate (null = use current setting)
    this.mixVolume = params?.mixVolume ?? null; // channel volume (null = use current setting)
  }
}

export class Track {
  constructor() { this.events = []; }
  addEvent(event) { this.events.push(event); this.events.sort((a, b) => a.tick - b.tick); }
  removeEventAtTick(tick) {
    const idx = this.events.findIndex(e => e.tick === tick);
    if (idx !== -1) this.events.splice(idx, 1);
  }
  clear() { this.events = []; }
  getEventsAtTick(tick) { return this.events.filter(e => e.tick === tick); }
}

export class Pattern {
  constructor() {
    this.bars = 2; // SP-1200 default is 2 bars
    this.totalTicks = PPQN * 4 * 2;
    this.tracks = Array.from({ length: NUM_PADS }, () => new Track());
  }
  setBars(bars) {
    this.bars = Math.max(1, Math.min(99, bars));
    this.totalTicks = PPQN * 4 * this.bars;
  }
  addEvent(trackIndex, event) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].addEvent(event);
  }
  removeEvent(trackIndex, tick) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].removeEventAtTick(tick);
  }
  getEventsAtTick(tick) {
    const results = [];
    for (let i = 0; i < NUM_PADS; i++) {
      for (const e of this.tracks[i].getEventsAtTick(tick)) results.push({ track: i, ...e });
    }
    return results;
  }
  quantizeTick(tick, gridSize) { return Math.round(tick / gridSize) * gridSize; }
  clearTrack(trackIndex) {
    if (trackIndex >= 0 && trackIndex < NUM_PADS) this.tracks[trackIndex].clear();
  }
  clear() { for (const track of this.tracks) track.clear(); }
  serialize() {
    return { bars: this.bars, tracks: this.tracks.map(t => ({ events: t.events.map(e => {
      const obj = { tick: e.tick, velocity: e.velocity, pitchOffset: e.pitchOffset };
      if (e.slot !== null) obj.slot = e.slot;
      if (e.pitch !== null) obj.pitch = e.pitch;
      if (e.decay !== null) obj.decay = e.decay;
      if (e.mixVolume !== null) obj.mixVolume = e.mixVolume;
      return obj;
    }) })) };
  }
  static deserialize(data) {
    const p = new Pattern();
    p.setBars(data.bars);
    data.tracks.forEach((trackData, i) => {
      for (const e of trackData.events) {
        const params = (e.slot != null || e.pitch != null || e.decay != null || e.mixVolume != null)
          ? { slot: e.slot ?? null, pitch: e.pitch ?? null, decay: e.decay ?? null, mixVolume: e.mixVolume ?? null }
          : null;
        p.addEvent(i, new PatternEvent(e.tick, e.velocity, e.pitchOffset, params));
      }
    });
    return p;
  }
}

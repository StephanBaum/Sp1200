import { describe, it, expect } from 'vitest';
import { ProjectStore } from '../../js/storage/indexeddb.js';

describe('ProjectStore serialization', () => {
  it('serializes a project to JSON', () => {
    const project = { name: 'My Beat', bpm: 95, swing: 62, currentPattern: 0, patterns: [{ bars: 2, tracks: [] }], song: { entries: [] }, samples: { 0: { name: 'kick.wav', data: [0.1, 0.2, 0.3] } } };
    const json = ProjectStore.serialize(project);
    expect(json).toContain('My Beat');
    expect(json).toContain('95');
  });
  it('deserializes JSON back to project', () => {
    const project = { name: 'Test', bpm: 120, swing: 50, currentPattern: 0, patterns: [], song: { entries: [] }, samples: {} };
    const json = ProjectStore.serialize(project);
    const restored = ProjectStore.deserialize(json);
    expect(restored.name).toBe('Test');
    expect(restored.bpm).toBe(120);
  });
});

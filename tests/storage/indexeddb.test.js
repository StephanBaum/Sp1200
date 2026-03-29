import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ProjectStore, SP1200Storage } from '../../js/storage/indexeddb.js';

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

describe('Scratch Cache', () => {
  it('cacheSample stores and retrieves a sample by slot', async () => {
    const storage = new SP1200Storage();
    await storage.init();
    const buf = new Float32Array([1, 2, 3, 4]);
    await storage.cacheSample(0, buf, { pitch: 1.0, decay: 1.0 });
    const result = await storage.getCachedSample(0);
    expect(result).not.toBeNull();
    expect(result.buffer.length).toBe(4);
    expect(result.settings.pitch).toBe(1.0);
  });

  it('cacheSample overwrites existing slot', async () => {
    const storage = new SP1200Storage();
    await storage.init();
    await storage.cacheSample(0, new Float32Array([1, 2]), {});
    await storage.cacheSample(0, new Float32Array([3, 4, 5]), {});
    const result = await storage.getCachedSample(0);
    expect(result.buffer.length).toBe(3);
  });

  it('clearCache removes all cached samples', async () => {
    const storage = new SP1200Storage();
    await storage.init();
    await storage.cacheSample(0, new Float32Array([1]), {});
    await storage.clearCache();
    const result = await storage.getCachedSample(0);
    expect(result).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { exportProject, importProject } from '../../js/storage/export.js';

describe('export/import', () => {
  it('exports project as JSON string', () => {
    const project = { name: 'Beat 1', bpm: 90, swing: 55, patterns: [{ bars: 1, tracks: [] }], song: { entries: [] }, samples: {} };
    const json = exportProject(project);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Beat 1');
    expect(parsed.version).toBe(1);
  });
  it('imports project from JSON string', () => {
    const json = JSON.stringify({ version: 1, name: 'Imported', bpm: 100, swing: 60, patterns: [], song: { entries: [] }, samples: {} });
    const project = importProject(json);
    expect(project.name).toBe('Imported');
    expect(project.bpm).toBe(100);
  });
  it('rejects invalid version', () => {
    const json = JSON.stringify({ version: 999 });
    expect(() => importProject(json)).toThrow('Unsupported version');
  });
  it('encodes sample data', () => {
    const project = { name: 'Test', bpm: 90, swing: 50, patterns: [], song: { entries: [] }, samples: { 0: { name: 'kick', data: Array.from(new Float32Array([0.5, -0.5, 0.25])) } } };
    const json = exportProject(project);
    const parsed = JSON.parse(json);
    expect(parsed.samples['0'].data).toBeDefined();
  });
});

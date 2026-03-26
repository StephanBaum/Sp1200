const CURRENT_VERSION = 1;

export function exportProject(project) {
  const exportData = { version: CURRENT_VERSION, name: project.name, bpm: project.bpm, swing: project.swing, patterns: project.patterns, song: project.song, samples: {} };
  for (const [pad, sample] of Object.entries(project.samples || {})) {
    exportData.samples[pad] = { name: sample.name, data: Array.from(sample.data) };
  }
  return JSON.stringify(exportData, null, 2);
}

export function importProject(jsonString) {
  const data = JSON.parse(jsonString);
  if (data.version !== CURRENT_VERSION) throw new Error('Unsupported version: ' + data.version);
  return { name: data.name, bpm: data.bpm, swing: data.swing, patterns: data.patterns || [], song: data.song || { entries: [] }, samples: data.samples || {} };
}

export function downloadProject(project) {
  const json = exportProject(project);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.name || 'sp1200-project') + '.sp12.json';
  a.click();
  URL.revokeObjectURL(url);
}

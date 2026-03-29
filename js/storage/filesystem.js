/**
 * File System Access API storage for SP-1200 projects.
 * Saves samples as .wav files and settings as project.json in a user-selected folder.
 */

export class FileSystemStorage {
  constructor() {
    this.dirHandle = null;  // root directory handle
    this.files = [];        // cached file list [{name, kind}]
    this.currentPath = '';  // current subdirectory path
    this._currentDirHandle = null;
  }

  get hasFolder() { return !!this.dirHandle; }

  /** Prompt user to select a project folder */
  async selectFolder() {
    try {
      this.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this._currentDirHandle = this.dirHandle;
      this.currentPath = '';
      await this._refreshFiles();
      return true;
    } catch (err) {
      console.warn('Folder selection cancelled:', err.message);
      return false;
    }
  }

  /** List files and folders in current directory */
  async _refreshFiles() {
    this.files = [];
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) return;
    for await (const [name, handle] of dir.entries()) {
      this.files.push({ name, kind: handle.kind }); // 'file' or 'directory'
    }
    this.files.sort((a, b) => {
      // Directories first, then alphabetical
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Navigate into a subdirectory */
  async enterDirectory(name) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) return false;
    try {
      this._currentDirHandle = await dir.getDirectoryHandle(name);
      this.currentPath = this.currentPath ? this.currentPath + '/' + name : name;
      await this._refreshFiles();
      return true;
    } catch {
      return false;
    }
  }

  /** Go up one directory */
  async goUp() {
    if (!this.currentPath) return false;
    // Re-navigate from root
    const parts = this.currentPath.split('/');
    parts.pop();
    this._currentDirHandle = this.dirHandle;
    this.currentPath = '';
    for (const part of parts) {
      this._currentDirHandle = await this._currentDirHandle.getDirectoryHandle(part);
      this.currentPath = this.currentPath ? this.currentPath + '/' + part : part;
    }
    await this._refreshFiles();
    return true;
  }

  /** Create a subdirectory */
  async createDirectory(name) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) return false;
    try {
      await dir.getDirectoryHandle(name, { create: true });
      await this._refreshFiles();
      return true;
    } catch {
      return false;
    }
  }

  /** Get list of file/folder names for display */
  getFileList() {
    const items = [];
    if (this.currentPath) items.push({ name: '../', kind: 'directory' });
    for (const f of this.files) {
      items.push({
        name: f.kind === 'directory' ? f.name + '/' : f.name,
        kind: f.kind,
      });
    }
    return items;
  }

  /** Save a complete project (samples + sequences + settings) */
  async saveProject(name, projectData) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) throw new Error('No folder selected');

    // Create project folder
    const projDir = await dir.getDirectoryHandle(name, { create: true });

    // Save manifest (sequences, settings, sample metadata)
    const manifest = {
      version: 1,
      timestamp: Date.now(),
      bpm: projectData.bpm,
      swing: projectData.swing,
      patterns: projectData.patterns,
      songs: projectData.songs,
      slots: projectData.slots.map(s => ({
        slot: s.slot,
        hasSample: s.hasSample,
        name: s.name || '',
        pitch: s.pitch,
        decayRate: s.decayRate,
        reversed: s.reversed,
        loopEnabled: s.loopEnabled,
        loopStart: s.loopStart,
        loopEnd: s.loopEnd,
        startPoint: s.startPoint,
        endPoint: s.endPoint,
        // Sample stored as separate .wav file
        sampleFile: s.hasSample ? 'slot_' + s.slot + '.raw' : null,
      })),
    };

    const manifestFile = await projDir.getFileHandle('project.json', { create: true });
    const manifestWriter = await manifestFile.createWritable();
    await manifestWriter.write(JSON.stringify(manifest, null, 2));
    await manifestWriter.close();

    // Save sample buffers as raw float32 files
    for (const s of projectData.slots) {
      if (s.hasSample && s.buffer) {
        const sampleFile = await projDir.getFileHandle('slot_' + s.slot + '.raw', { create: true });
        const writer = await sampleFile.createWritable();
        const floatArray = s.buffer instanceof Float32Array ? s.buffer : new Float32Array(s.buffer);
        await writer.write(floatArray.buffer);
        await writer.close();
      }
    }

    await this._refreshFiles();
    return true;
  }

  /** Load a project from a folder */
  async loadProject(name) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) throw new Error('No folder selected');

    let projDir;
    try {
      projDir = await dir.getDirectoryHandle(name);
    } catch {
      throw new Error('Project not found: ' + name);
    }

    // Read manifest
    let manifest;
    try {
      const manifestFile = await projDir.getFileHandle('project.json');
      const file = await manifestFile.getFile();
      manifest = JSON.parse(await file.text());
    } catch {
      throw new Error('No project.json in ' + name);
    }

    // Load sample buffers
    for (const slotInfo of manifest.slots) {
      if (slotInfo.sampleFile) {
        try {
          const sampleFile = await projDir.getFileHandle(slotInfo.sampleFile);
          const file = await sampleFile.getFile();
          const arrayBuffer = await file.arrayBuffer();
          slotInfo.buffer = new Float32Array(arrayBuffer);
        } catch {
          slotInfo.buffer = null;
        }
      }
    }

    return manifest;
  }

  /** Load a single audio file (wav/mp3/etc) from the current directory */
  async loadAudioFile(name) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) return null;
    try {
      const fileHandle = await dir.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  /** Save sequences only to an existing project */
  async saveSequences(name, patterns, songs) {
    const dir = this._currentDirHandle || this.dirHandle;
    if (!dir) throw new Error('No folder selected');

    let projDir;
    try {
      projDir = await dir.getDirectoryHandle(name);
    } catch {
      projDir = await dir.getDirectoryHandle(name, { create: true });
    }

    // Read existing manifest or create new
    let manifest = { version: 1, timestamp: Date.now(), slots: [] };
    try {
      const mf = await projDir.getFileHandle('project.json');
      manifest = JSON.parse(await (await mf.getFile()).text());
    } catch { /* new project */ }

    manifest.patterns = patterns;
    if (songs) manifest.songs = songs;
    manifest.timestamp = Date.now();

    const manifestFile = await projDir.getFileHandle('project.json', { create: true });
    const writer = await manifestFile.createWritable();
    await writer.write(JSON.stringify(manifest, null, 2));
    await writer.close();
    return true;
  }
}

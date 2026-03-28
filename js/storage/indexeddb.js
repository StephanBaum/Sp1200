const DB_NAME = 'sp1200';
const DB_VERSION = 1;

export class SP1200Storage {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Store for complete disk images (sounds + sequences)
        if (!db.objectStoreNames.contains('disks')) {
          db.createObjectStore('disks', { keyPath: 'name' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Save everything (sounds + sequences) as a named disk image
  async saveAll(name, data) {
    // data: { sounds: [{pad, bank, buffer, settings}...], sequences: [{patterns, songs}] }
    return this._put('disks', { name, data, timestamp: Date.now() });
  }

  // Load everything from a named disk image
  async loadAll(name) {
    return this._get('disks', name);
  }

  // List all saved disk images
  async listDisks() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('disks', 'readonly');
      const store = tx.objectStore('disks');
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Delete a disk image
  async deleteDisk(name) {
    return this._delete('disks', name);
  }

  // Save just sequences
  async saveSequences(name, sequences) {
    const existing = await this.loadAll(name);
    if (existing) {
      existing.data.sequences = sequences;
      existing.timestamp = Date.now();
      return this._put('disks', existing);
    }
    return this.saveAll(name, { sounds: [], sequences });
  }

  // Save just sounds
  async saveSounds(name, sounds) {
    const existing = await this.loadAll(name);
    if (existing) {
      existing.data.sounds = sounds;
      existing.timestamp = Date.now();
      return this._put('disks', existing);
    }
    return this.saveAll(name, { sounds, sequences: [] });
  }

  async _put(store, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.put(data);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _get(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      const req = s.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _delete(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

export const ProjectStore = {
  serialize(project) {
    return JSON.stringify(project);
  },
  deserialize(json) {
    return JSON.parse(json);
  }
};

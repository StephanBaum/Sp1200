const DB_NAME = 'sp1200';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'name' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class ProjectStore {
  static serialize(project) { return JSON.stringify(project); }
  static deserialize(json) { return JSON.parse(json); }
  static async save(project) {
    const db = await openDB();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(project); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }
  static async load(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).get(name); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
  }
  static async list() {
    const db = await openDB();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).getAllKeys(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }
  static async remove(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(name); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }
}

const DB_NAME = "sharefast_cache";
const STORE_NAME = "files";

let memoryFile: File | null = null;
let memoryFiles: File[] = [];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheActiveFiles(files: File[] | null): Promise<void> {
  memoryFiles = files || [];
  memoryFile = memoryFiles.length > 0 ? memoryFiles[0] : null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (files && files.length > 0) {
      store.put(files, "active_files");
      store.put(files[0], "active_file");
    } else {
      store.delete("active_files");
      store.delete("active_file");
    }
  } catch (err) {
    console.warn("Could not cache files in IndexedDB:", err);
  }
}

export async function getCachedActiveFiles(): Promise<File[]> {
  if (memoryFiles && memoryFiles.length > 0) return memoryFiles;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get("active_files");
      req.onsuccess = () => {
        const files = (req.result as File[]) || [];
        if (files.length > 0) {
          memoryFiles = files;
          memoryFile = files[0];
          resolve(files);
        } else {
          // Fallback to active_file
          const singleReq = tx.objectStore(STORE_NAME).get("active_file");
          singleReq.onsuccess = () => {
            const single = (singleReq.result as File) || null;
            if (single) {
              memoryFile = single;
              memoryFiles = [single];
              resolve([single]);
            } else {
              resolve([]);
            }
          };
          singleReq.onerror = () => resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function cacheActiveFile(file: File | null): Promise<void> {
  return cacheActiveFiles(file ? [file] : null);
}

export async function getCachedActiveFile(): Promise<File | null> {
  const files = await getCachedActiveFiles();
  return files.length > 0 ? files[0] : null;
}

export function getActiveFileInMemory(): File | null {
  return memoryFile;
}

export function getActiveFilesInMemory(): File[] {
  return memoryFiles;
}

/* ─── LifeDrop file cache ─── */

const lifeDropMemory = new Map<string, File>();

export async function cacheLifeDropFiles(entries: { id: string; file: File }[]): Promise<void> {
  entries.forEach((e) => lifeDropMemory.set(e.id, e.file));
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    entries.forEach((e) => store.put(e.file, `lifedrop_${e.id}`));
  } catch (err) {
    console.warn("Could not cache LifeDrop files in IndexedDB:", err);
  }
}

export async function getLifeDropFile(id: string): Promise<File | null> {
  if (lifeDropMemory.has(id)) return lifeDropMemory.get(id)!;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(`lifedrop_${id}`);
      req.onsuccess = () => {
        const file = (req.result as File) || null;
        if (file) lifeDropMemory.set(id, file);
        resolve(file);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

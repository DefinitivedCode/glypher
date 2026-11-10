/** The last few images you used, kept in this browser's IndexedDB. They never leave your device. */
export interface RecentItem { id: number; name: string; type: string; size: number; blob: Blob }
const MAX_ITEMS = 5, MAX_BYTES = 12 * 1024 * 1024;

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('glypher', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('recent', { keyPath: 'id', autoIncrement: true });
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); });
const all = (db: IDBDatabase) => new Promise<RecentItem[]>((res, rej) => { const q = db.transaction('recent').objectStore('recent').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });

/** Newest first. Resolves to [] if storage is unavailable (private mode, blocked, etc). */
export async function listRecent(): Promise<RecentItem[]> {
  try { const db = await open(); const items = await all(db); db.close(); return items.sort((a, b) => b.id - a.id); } catch { return []; }
}

export async function addRecent(file: File) {
  if (file.size > MAX_BYTES) return;
  try {
    const db = await open(), items = (await all(db)).sort((a, b) => b.id - a.id);
    const tx = db.transaction('recent', 'readwrite'), st = tx.objectStore('recent');
    for (const it of items.filter(i => i.name === file.name && i.size === file.size)) st.delete(it.id);   // same image again: move to front
    st.add({ name: file.name || 'Pasted image', type: file.type, size: file.size, blob: file });
    const keep = items.filter(i => !(i.name === file.name && i.size === file.size)).slice(0, MAX_ITEMS - 1), drop = items.filter(i => !keep.includes(i) && !(i.name === file.name && i.size === file.size));
    for (const it of drop) st.delete(it.id);
    await done(tx); db.close();
  } catch { /* storage unavailable: recents are a convenience */ }
}

export async function clearRecent() {
  try { const db = await open(), tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').clear(); await done(tx); db.close(); } catch { /* ignore */ }
}

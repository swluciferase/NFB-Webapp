import type { SessionReport } from '../game/SessionConfig';

const DB_NAME = 'soramynd-game';
const DB_VERSION = 1;
const STORE = 'pendingSessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const gameSessionLog = {
  async enqueue(report: SessionReport): Promise<void> {
    await run('readwrite', (s) => s.put(report));
  },
  async dequeue(sessionId: string): Promise<void> {
    await run('readwrite', (s) => s.delete(sessionId));
  },
  async list(): Promise<SessionReport[]> {
    return run<SessionReport[]>(
      'readonly',
      (s) => s.getAll() as IDBRequest<SessionReport[]>,
    );
  },
  async clearAll(): Promise<void> {
    await run('readwrite', (s) => s.clear());
  },
};

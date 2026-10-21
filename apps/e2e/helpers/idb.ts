import type { Page } from '@playwright/test';

export interface QueuedItem {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  lastError?: string;
  attempts?: number;
}

/** Reads the Dexie `syncQueue` store straight from IndexedDB (no app code involved). */
export async function readSyncQueue(page: Page): Promise<QueuedItem[]> {
  return page.evaluate(
    () =>
      new Promise<QueuedItem[]>((resolve, reject) => {
        const open = indexedDB.open('DeepKhataOfflineDB');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          if (!idb.objectStoreNames.contains('syncQueue')) {
            idb.close();
            resolve([]);
            return;
          }
          const req = idb.transaction('syncQueue', 'readonly').objectStore('syncQueue').getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            idb.close();
            resolve(req.result as QueuedItem[]);
          };
        };
      }),
  );
}

/** Reads every record of a Dexie object store (e.g. `products`, `customers`) straight from IndexedDB. */
export async function readStore<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('DeepKhataOfflineDB');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          if (!idb.objectStoreNames.contains(name)) {
            idb.close();
            resolve([]);
            return;
          }
          const req = idb.transaction(name, 'readonly').objectStore(name).getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            idb.close();
            resolve(req.result as T[]);
          };
        };
      }),
    store,
  );
}

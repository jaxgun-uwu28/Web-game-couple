// Blobs stay on this device. Stable request IDs make retries idempotent on the server.
export type QueuedMedia = {
  id: string;
  user: string;
  couple: string;
  kind: "voice" | "postcard" | "draft";
  created: number;
  payload: unknown;
};
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("arcade-media-outbox", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("items", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", mode),
      request = action(tx.objectStore("items"));
    tx.oncomplete = () => {
      resolve(request.result);
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
    tx.onabort = () => {
      reject(tx.error);
      db.close();
    };
  });
}
export const queueMedia = (item: QueuedMedia) =>
  transact("readwrite", (s) => s.put(item));
export const removeMedia = (id: string) =>
  transact("readwrite", (s) => s.delete(id));
export async function queuedMedia() {
  const items = await transact<QueuedMedia[]>("readonly", (s) => s.getAll());
  const expired = items.filter(
    (i) => i.kind === "draft" && Date.now() - i.created > 7 * 86400000,
  );
  for (const item of expired) await removeMedia(item.id);
  return items.filter((i) => !expired.includes(i));
}
const flushing = new Set<string>();
export async function flushMedia(
  user: string,
  kind: QueuedMedia["kind"],
  send: (item: QueuedMedia) => Promise<void>,
) {
  const key = `${user}:${kind}`;
  if (flushing.has(key)) return;
  flushing.add(key);
  try {
    for (const item of await queuedMedia()) {
      if (item.user !== user || item.kind !== kind) continue;
      await send(item);
      await removeMedia(item.id);
    }
  } finally {
    flushing.delete(key);
  }
}

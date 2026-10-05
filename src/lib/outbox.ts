import type { SupabaseClient } from "@supabase/supabase-js";
type Pending = {
  id: string;
  user: string;
  couple: string;
  table: "wishlist_items";
  row: Record<string, unknown>;
  photo: Blob | null;
  path: string | null;
  created: number;
};
function store() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("arcade-private-outbox", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("writes", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await store();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction("writes", mode),
      r = fn(t.objectStore("writes"));
    let result: T;
    r.onsuccess = () => {
      result = r.result;
    };
    t.oncomplete = () => {
      db.close();
      resolve(result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}
export async function enqueueWish(
  user: string,
  couple: string,
  row: Record<string, unknown>,
  photo: Blob | null = null,
) {
  const id = String(row.id),
    path = photo ? `${couple}/${user}/${id}.webp` : null;
  await transaction("readwrite", (s) =>
    s.put({
      id,
      user,
      couple,
      table: "wishlist_items",
      row: { ...row, image_path: path || row.image_path },
      photo,
      path,
      created: Date.now(),
    } satisfies Pending),
  );
}
export async function pendingWishes(user: string) {
  return (await transaction<Pending[]>("readonly", (s) => s.getAll())).filter(
    (r) => r.user === user,
  );
}
export async function flushWishes(
  db: SupabaseClient,
  user: string,
  couple: string,
) {
  const { data } = await db.auth.getUser();
  if (data.user?.id !== user)
    throw new Error("Sign in again before syncing your queued wishes.");
  for (const job of await pendingWishes(user)) {
    if (job.couple !== couple) continue;
    if (job.photo && job.path) {
      const r = await db.storage
        .from("keepsakes")
        .upload(job.path, job.photo, { contentType: "image/webp" });
      if (r.error && Number(r.error.statusCode) !== 409)
        throw new Error(r.error.message);
    }
    const existing = await db
      .from("wishlist_items")
      .select("id")
      .eq("id", job.id)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) {
      const r = await db.from("wishlist_items").insert(job.row);
      if (r.error) throw new Error(r.error.message);
    }
    await transaction("readwrite", (s) => s.delete(job.id));
  }
}
export async function clearPending(user: string) {
  for (const job of await pendingWishes(user))
    await transaction("readwrite", (s) => s.delete(job.id));
}

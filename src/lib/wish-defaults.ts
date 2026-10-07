import type { SupabaseClient } from "@supabase/supabase-js";
import type { WishList } from "./keepsakes";

export function wishListLabel(list: WishList, user: string) {
  if (list.type === "personal" && list.owner_id !== user) {
    return list.title === "My wishes" || list.title === "My wishlist"
      ? "Partner’s wishes"
      : `${list.title} · Partner`;
  }
  return list.title;
}

export function writableLists(lists: WishList[], user: string) {
  return lists.filter(
    (l) => l.type === "shared" || l.type === "custom" || l.owner_id === user,
  );
}
export function temporaryDefaults(user: string): WishList[] {
  return [
    {
      id: "local:shared",
      owner_id: user,
      type: "shared",
      title: "Our wishlist",
      cover: "wish-jar",
    },
    {
      id: `local:personal:${user}`,
      owner_id: user,
      type: "personal",
      title: "My wishes",
      cover: "wish-jar",
    },
  ];
}
export async function ensureWishlists(db: SupabaseClient): Promise<WishList[]> {
  const r = await db.rpc("ensure_wishlists");
  if (r.error) throw new Error(r.error.message);
  return r.data || [];
}
export async function resolveWishList(
  db: SupabaseClient,
  user: string,
  id: string,
  draft?: WishList,
): Promise<string> {
  const lists = await ensureWishlists(db);
  const found = writableLists(lists, user).find((l) => l.id === id);
  if (found) return found.id;
  if (draft && !id.startsWith("local:")) {
    const r = await db.from("wishlists").insert(draft);
    if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
    const check = await db.from("wishlists").select("*").eq("id", id).single();
    if (check.error || !writableLists([check.data], user).length)
      throw new Error("This list cannot receive your wish.");
    return id;
  }
  const type = id.startsWith("local:personal") ? "personal" : "shared";
  const target = writableLists(lists, user).find((l) => l.type === type);
  if (!target)
    throw new Error(
      "Your default wishlist could not be created. Your wish is still saved on this device.",
    );
  return target.id;
}

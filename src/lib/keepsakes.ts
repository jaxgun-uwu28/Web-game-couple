export type WishList = {
  id: string;
  owner_id: string;
  type: "shared" | "personal" | "secret" | "custom";
  title: string;
  cover: string;
};
export type Wish = {
  id: string;
  list_id: string;
  created_by: string;
  title: string;
  note: string;
  url: string;
  price: number | null;
  currency: string;
  image_path: string | null;
  category: string;
  priority: number;
  status: "wished" | "planned" | "done";
  planned_date: string | null;
  done_at: string | null;
  position: number;
  created_at: string;
};
export type Memory = {
  id: string;
  author: string;
  caption: string;
  image_path: string | null;
  swap_day: string | null;
  archived_at?: string | null;
  created_at: string;
};
export type Letter = {
  id: string;
  author: string;
  title: string;
  unlock_at: string | null;
  open_when: string;
  opened_at: string | null;
  recipient_favorite?: boolean;
  created_at: string;
};
export type NoteBody = {
  body: string;
  media_path: string | null;
  media_kind: string | null;
};
export type Claim = { item_id: string; claimed_by: string; status: string };
export type Comment = {
  id: string;
  item_id: string;
  author: string;
  body: string;
  created_at: string;
};
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("This browser cannot process photos. Try another browser.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Photo could not be processed.")),
      "image/webp",
      0.82,
    ),
  );
}
export function safeLink(url: string) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

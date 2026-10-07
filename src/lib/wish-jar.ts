import type { Wish, WishList } from "./keepsakes";
export function wishSeed(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export const wishColors = [
  "#F8C9D8",
  "#F7E6A6",
  "#EAE1F5",
  "#F8DCC4",
  "#D6E9DB",
  "#DDE7F5",
];
export function jarWishes(
  wishes: Wish[],
  lists: WishList[],
  user: string,
  selected?: string[],
) {
  const allowed = new Set(
    lists
      .filter(
        (l) =>
          (l.type !== "secret" || l.owner_id === user) &&
          (!selected || selected.includes(l.id)),
      )
      .map((l) => l.id),
  );
  return wishes.filter((w) => allowed.has(w.list_id) && w.status !== "done");
}
// A bounded, staggered stack replaces continuous physics. Rotated note bounds
// fit within the glass; stable IDs produce identical positions on both devices.
export function jarLayout(wishes: Wish[]) {
  const sorted = [...wishes]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .slice(-40);
  return sorted.map((wish, i) => ({
    wish,
    x: 86 + (i % 5) * 37 + (wishSeed(wish.id) % 2),
    y: 300 - Math.floor(i / 5) * 25,
    angle: (wishSeed(wish.id) % 13) - 6,
    color: wishColors[wishSeed(wish.list_id) % wishColors.length],
  }));
}
export function jarFill(count: number) {
  return Math.min(0.9, (count / 100) * 0.9);
}

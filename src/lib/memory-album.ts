import type { Memory } from "./keepsakes";
export function memoryDay(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function groupMemories(memories: Memory[]) {
  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    const day = memoryDay(m.created_at);
    groups.set(day, [...(groups.get(day) || []), m]);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, photos]) => ({ day, photos }));
}

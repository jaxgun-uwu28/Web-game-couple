export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00");
  return !Number.isNaN(d.getTime()) && localDay(d) === value;
}
export function anniversaryStats(value: string, now = new Date()) {
  if (!validDate(value)) throw new Error("Choose a valid anniversary date.");
  const [year, month, day] = value.split("-").map(Number),
    dateForYear = (y: number) =>
      new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate())),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = dateForYear(now.getFullYear());
  const celebration =
    next.getTime() === today.getTime() && now.getFullYear() > year;
  if (next <= today) next = dateForYear(now.getFullYear() + 1);
  const previous = dateForYear(next.getFullYear() - 1),
    left = Math.max(0, next.getTime() - now.getTime()),
    utcDay = (d: Date) =>
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
    together = Math.max(
      0,
      utcDay(today) - utcDay(new Date(year, month - 1, day)),
    );
  return {
    together,
    days: Math.floor(left / 86400000),
    hours: Math.floor(left / 3600000) % 24,
    minutes: Math.floor(left / 60000) % 60,
    next,
    celebration,
    progress: Math.max(
      0,
      Math.min(
        1,
        (now.getTime() - previous.getTime()) /
          (next.getTime() - previous.getTime()),
      ),
    ),
    years: Math.max(
      0,
      now.getFullYear() -
        year -
        (today < dateForYear(now.getFullYear()) ? 1 : 0),
    ),
  };
}

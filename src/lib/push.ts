export function isQuietHour(
  now: Date,
  start: number,
  end: number,
  timezone: string,
) {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(now),
    );
  } catch {
    return true;
  }
  return start === end
    ? false
    : start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end;
}
export function permittedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.port &&
      !u.username &&
      !u.password &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname === "wns2-par02p.notify.windows.com")
    );
  } catch {
    return false;
  }
}
export function thinkingNotification(message: unknown, nickname: unknown) {
  const clean = (value: unknown, max: number) =>
    String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  const name = clean(nickname, 40);
  return {
    title: name ? `${name} · Thinking of you` : "Thinking of you",
    body:
      clean(message, 180) ||
      "Your person is thinking of you. Open Our Little Arcade to send a little love back.",
  };
}

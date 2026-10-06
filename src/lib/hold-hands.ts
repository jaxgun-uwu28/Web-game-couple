export type Hand = { inRoom: boolean; holding: boolean; holdingSince: number };
export const RELEASE_GRACE = 400,
  RECONNECT_GRACE = 5000;
export function handMerge(
  mine: Hand,
  partner: Hand | null,
  now: number,
  lostAt: number | null = null,
) {
  const reconnecting = lostAt !== null;
  const together =
    mine.inRoom &&
    mine.holding &&
    !!partner?.inRoom &&
    partner.holding &&
    (!reconnecting || now - lostAt! < RECONNECT_GRACE);
  const since = together
    ? Math.max(mine.holdingSince, partner!.holdingSince)
    : 0;
  return {
    together,
    reconnecting,
    seconds: since ? Math.max(0, Math.floor((now - since) / 1000)) : 0,
  };
}
export function releaseDue(releasedAt: number, now: number) {
  return now - releasedAt >= RELEASE_GRACE;
}

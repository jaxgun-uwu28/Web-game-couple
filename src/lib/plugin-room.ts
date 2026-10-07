// Background responses must never replace a newer room or newer revision.
export function acceptRoomSnapshot<
  T extends { match: { id: string; revision: number } },
>(current: T | null, incoming: T): T {
  if (
    current &&
    (current.match.id !== incoming.match.id ||
      current.match.revision > incoming.match.revision)
  )
    return current;
  return incoming;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve tokens at request time, rather than retaining a component's old session.
// A 401 is returned before the route runs any move, so one retry is safe.
export async function gameRequest(
  db: SupabaseClient | null,
  body: Record<string, unknown>,
  send: typeof fetch = fetch,
) {
  if (!db) throw new Error("The arcade connection is not configured.");
  let { data, error } = await db.auth.getSession();
  if (error || !data.session)
    throw new Error("Sign out, then sign in with your email and password.");
  if ((data.session.expires_at || 0) * 1000 <= Date.now() + 30000) {
    ({ data, error } = await db.auth.refreshSession());
    if (error || !data.session)
      throw new Error("Your session ended. Sign out, then sign in again.");
  }
  const post = (token: string) =>
    send("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  let response = await post(data.session.access_token);
  if (response.status === 401) {
    const refreshed = await db.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session)
      throw new Error("Your session ended. Sign out, then sign in again.");
    response = await post(refreshed.data.session.access_token);
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Your move could not save. Try again.");
  return result;
}

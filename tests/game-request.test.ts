import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gameRequest } from "../src/lib/game-request";
import { isPrivateEmail } from "../src/lib/private-auth";

function client(expired = false, refreshFails = false) {
  let refreshes = 0;
  const session = (token: string) => ({
    access_token: token,
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -100 : 3600),
  });
  return {
    db: {
      auth: {
        getSession: async () => ({
          data: { session: session("current") },
          error: null,
        }),
        refreshSession: async () => {
          refreshes++;
          return {
            data: { session: refreshFails ? null : session("refreshed") },
            error: refreshFails ? new Error("Expired") : null,
          };
        },
      },
    } as unknown as SupabaseClient,
    refreshes: () => refreshes,
  };
}

test("only the two provisioned emails are accepted", () => {
  assert.equal(isPrivateEmail(" Lancerobertmacorol8@gmail.com "), true);
  assert.equal(isPrivateEmail(" ElaineMaeEscosio49@gmail.com "), true);
  assert.equal(isPrivateEmail("lancerobertmacorol4@gmail.com"), false);
  assert.equal(isPrivateEmail("someone@gmail.com"), false);
  assert.equal(isPrivateEmail(), false);
});

test("expired session is refreshed before sending a game move", async () => {
  const c = client(true);
  await gameRequest(c.db, { kind: "block" }, async (_, options) => {
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer refreshed",
    );
    return Response.json({ ok: true });
  });
  assert.equal(c.refreshes(), 1);
});

test("401 refreshes and retries once using the new token", async () => {
  const c = client();
  const tokens: string[] = [];
  const result = await gameRequest(
    c.db,
    { kind: "tic" },
    async (_, options) => {
      tokens.push((options?.headers as Record<string, string>).Authorization);
      return tokens.length === 1
        ? Response.json({ error: "Invalid token" }, { status: 401 })
        : Response.json({ saved: true });
    },
  );
  assert.deepEqual(tokens, ["Bearer current", "Bearer refreshed"]);
  assert.equal(c.refreshes(), 1);
  assert.equal(result.saved, true);
});

test("failed refresh prevents moves and non-auth failures are not retried", async () => {
  const invalid = client(true, true);
  let sends = 0;
  const send = async () => {
    sends++;
    return Response.json({ error: "Choose an empty cell" }, { status: 400 });
  };
  await assert.rejects(gameRequest(invalid.db, {}, send), /session ended/);
  assert.equal(sends, 0);
  const valid = client();
  await assert.rejects(gameRequest(valid.db, {}, send), /empty cell/);
  assert.equal(sends, 1);
  assert.equal(valid.refreshes(), 0);
});

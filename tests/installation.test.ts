import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  enqueueWish,
  pendingWishes,
  flushWishes,
  clearPending,
} from "../src/lib/outbox";
import { isQuietHour, permittedPushEndpoint } from "../src/lib/push";
import type { SupabaseClient } from "@supabase/supabase-js";
test("quiet hours wrap midnight and invalid timezones fail quietly; push refuses private endpoints", () => {
  assert.equal(
    isQuietHour(new Date("2026-10-04T16:00:00Z"), 22, 8, "Asia/Manila"),
    true,
  );
  assert.equal(
    isQuietHour(new Date("2026-10-04T05:00:00Z"), 22, 8, "Asia/Manila"),
    false,
  );
  assert.equal(isQuietHour(new Date(), 22, 8, "not-a-timezone"), true);
  for (const endpoint of [
    "http://127.0.0.1/push",
    "https://169.254.169.254/",
    "https://fcm.googleapis.com.evil.test/push",
    "https://fcm.googleapis.com:8443/push",
  ])
    assert.equal(permittedPushEndpoint(endpoint), false);
  assert.equal(
    permittedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),
    true,
  );
});
test("offline wishes stay scoped to their author, survive failed sync and retry idempotently", async () => {
  await enqueueWish("one", "couple", {
    id: "wish-1",
    title: "Weekend away",
    list_id: "list",
  });
  await enqueueWish("two", "couple", {
    id: "wish-2",
    title: "A different private wish",
    list_id: "other",
  });
  assert.deepEqual(
    (await pendingWishes("one")).map((j) => j.id),
    ["wish-1"],
  );
  let fail = true,
    inserts = 0,
    exists = false;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "one" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: exists ? { id: "wish-1" } : null,
            error: null,
          }),
        }),
      }),
      insert: async () => {
        if (fail) return { error: { message: "Network unavailable" } };
        inserts++;
        exists = true;
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  await assert.rejects(flushWishes(db, "two", "couple"), /Sign in again/);
  await assert.rejects(flushWishes(db, "one", "couple"), /Network unavailable/);
  assert.equal((await pendingWishes("one")).length, 1);
  fail = false;
  await flushWishes(db, "one", "couple");
  assert.equal(inserts, 1);
  assert.equal((await pendingWishes("one")).length, 0);
  assert.equal((await pendingWishes("two")).length, 1);
  await enqueueWish("one", "couple", {
    id: "wish-1",
    title: "Weekend away",
    list_id: "list",
  });
  await flushWishes(db, "one", "couple");
  assert.equal(inserts, 1);
  await clearPending("two");
});

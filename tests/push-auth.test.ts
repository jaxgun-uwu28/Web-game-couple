import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as tap } from "../src/app/api/push/tap/route";
import { POST as hold } from "../src/app/api/push/hold/route";
test("tap and hand invitations reject logged-out requests before any mutation or delivery", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture-key";
  try {
    for (const route of [tap, hold]) {
      const response = await route(
        new Request("https://example.com/api/push", {
          method: "POST",
          body: "{}",
        }),
      );
      assert.equal(response.status, 401);
    }
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

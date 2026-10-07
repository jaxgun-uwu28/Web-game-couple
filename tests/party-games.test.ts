import { test } from "node:test";
import assert from "node:assert/strict";
import { drawingHistory, floodFill } from "../src/lib/drawing";
import { cleanPartyItems, startPartyGame } from "../src/lib/ai/party-games";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("drawing undo/redo replays edits; clear can be undone and a new mark discards redo", () => {
  const a = { points: [[0, 0]], color: "#000000" },
    b = { ...a, color: "#ffffff" },
    undo = { ...a, tool: "undo" as const },
    redo = { ...a, tool: "redo" as const },
    clear = { ...a, tool: "clear" as const };
  assert.deepEqual(drawingHistory([a, b, undo]).done, [a]);
  assert.deepEqual(drawingHistory([a, b, undo, redo]).done, [a, b]);
  assert.deepEqual(drawingHistory([a, clear, undo]).done, [a]);
  assert.equal(drawingHistory([a, b, undo, clear]).redo.length, 0);
});
test("paint bucket fills connected region only and blends opacity", () => {
  const d = new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  floodFill(d, 3, 1, 0, 0, "#ff0000", 0.5);
  assert.deepEqual(Array.from(d.slice(0, 4)), [255, 128, 128, 255]);
  assert.deepEqual(Array.from(d.slice(8)), [255, 255, 255, 255]);
});
test("generated content rejects repeats and invalid words/options", () => {
  assert.equal(
    cleanPartyItems(
      "draw",
      [{ word: "boat" }, { word: "Boat" }, { word: "<script>" }],
      [{ word: "cloud" }],
    ).length,
    1,
  );
  assert.equal(
    cleanPartyItems("know", [
      { q: "Choose a favorite snack?", options: ["a", "a", "b", "c"] },
    ]).length,
    0,
  );
  assert.equal(
    cleanPartyItems("draw", [{ word: "cloud" }], [{ word: "Cloud" }]).length,
    0,
  );
});
test("saved batches avoid Gemini calls until all questions are consumed", async () => {
  let calls = 0;
  let bank: any[] = [];
  const db: any = {
    from: (table: string) =>
      table === "games"
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        : {
            upsert: async (items: any[]) => {
              bank.push(...items.map((x) => ({ ...x, used: false })));
              return {};
            },
          },
    rpc: async (name: string) => ({
      data:
        name === "ai_claim"
          ? "lease"
          : name === "party_game_context"
            ? {
                available: bank.filter((x) => !x.used).length,
                history: bank.map((x) => x.item),
              }
            : name === "start_party_game"
              ? {
                  questions: bank
                    .filter((x) => !x.used)
                    .slice(0, 5)
                    .map((x) => {
                      x.used = true;
                      return x.item;
                    }),
                }
              : true,
    }),
  };
  const gen: any = async () => ({
    source: "mock",
    data: {
      items: Array.from({ length: 40 }, (_, i) => ({
        q: `Which adventure would you choose number ${calls * 40 + i}?`,
        options: ["A", "B", "C", "D"],
      })),
    },
    ...{ model: "mock", increment: ++calls },
  });
  for (let i = 0; i < 8; i++) await startPartyGame(db, "couple", "know", gen);
  assert.equal(calls, 1);
  assert.equal(bank.filter((x) => !x.used).length, 0);
  await startPartyGame(db, "couple", "know", gen);
  assert.equal(calls, 2);
});
test("party migration is repeatable, consumes without repeats, reuses active games, and keeps word bank private", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create table couples(id uuid primary key);create table profiles(id uuid primary key,couple_id uuid,slot int);create table games(id uuid primary key default gen_random_uuid(),couple_id uuid,kind text,state jsonb,created_at timestamptz default now());create table game_secrets(game_id uuid,word text);create function my_couple() returns uuid language sql as $$select '06092025-0000-4000-8000-000000000001'::uuid$$;create function new_game(text) returns games language sql as $$select null::games$$;insert into couples values('06092025-0000-4000-8000-000000000001');insert into profiles values(gen_random_uuid(),'06092025-0000-4000-8000-000000000001',0),(gen_random_uuid(),'06092025-0000-4000-8000-000000000001',1);`,
    );
    const sql = await readFile(
      "supabase/migrations/026_party_game_batches.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const c = "06092025-0000-4000-8000-000000000001";
    for (let i = 0; i < 10; i++)
      await db.query(
        "insert into party_game_bank(couple_id,kind,hash,item) values($1,'know',$2,$3)",
        [c, String(i), { q: "Question " + i, options: ["A", "B", "C", "D"] }],
      );
    const first: any = (
      await db.query("select (start_party_game($1,'know')).*", [c])
    ).rows[0];
    const again: any = (
      await db.query("select (start_party_game($1,'know')).*", [c])
    ).rows[0];
    assert.equal(first.id, again.id);
    await db.query(
      'update games set state=state||\'{"status":"won"}\' where id=$1',
      [first.id],
    );
    const second: any = (
      await db.query("select (start_party_game($1,'know')).*", [c])
    ).rows[0];
    assert.equal(
      new Set(
        [...first.state.questions, ...second.state.questions].map((x) => x.q),
      ).size,
      10,
    );
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from party_game_bank"));
    await assert.rejects(db.query("select new_game('draw')"), /Gemini/);
  } finally {
    await db.close();
  }
});

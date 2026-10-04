import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  blockHand,
  placeBlock,
  blockFits,
  previewBlockMatch,
  previewBlockPlace,
} from "../src/lib/block-battle";
test("block puzzle rejects edge wrapping and clears crossing lines simultaneously", () => {
  const board = Array(64).fill(0);
  for (let i = 1; i < 8; i++) {
    board[i] = 1;
    board[i * 8] = 1;
  }
  const result = placeBlock(board, 0, 0, 0);
  assert.equal(result.lines, 2);
  assert.equal(result.points, 260);
  assert.ok(result.board.every((v) => v === 0));
  assert.equal(blockFits(Array(64).fill(0), 1, 0, 7), false);
  assert.throws(() => placeBlock(Array(64).fill(0), 1, 0, 7));
  const m = previewBlockMatch(60, 12);
  const peer = [...m.state.boards[1]];
  const next = previewBlockPlace(m, 0, 0, 0, 0);
  assert.deepEqual(next.state.boards[1], peer);
  assert.equal(next.state.used[0][0], true);
  assert.throws(() => previewBlockPlace(next, 0, 0, 4, 4));
});
test("server battle validates both-ready start, authoritative scores, replay and expiry isolation", async () => {
  const db = new PGlite(),
    a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002",
    outside = "10000000-0000-4000-8000-000000000003",
    couple = "06092025-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
  grant usage on schema auth,public,realtime,storage to authenticated;`);
    await db.exec(await readFile("supabase/setup_fresh_project.sql", "utf8"));
    await db.exec(
      await readFile("supabase/migrations/004_block_battle.sql", "utf8"),
    );
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${outside}');insert into profiles(id,couple_id,slot,name) values('${a}','${couple}',0,'A'),('${b}','${couple}',1,'B');set role authenticated;`,
    );
    const as = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const call = async (id: string, action: Record<string, unknown>) =>
      (
        await db.query<{ value: any }>("select block_battle($1,$2) as value", [
          id,
          action,
        ])
      ).rows[0].value.match;
    await as(a);
    await assert.rejects(db.query("select start_block_battle(7)"), /Choose/);
    const created = (
        await db.query<{ value: any }>("select start_block_battle(60) as value")
      ).rows[0].value.match,
      id = created.id;
    assert.deepEqual(created.state.hands[0], blockHand(created.seed, 0));
    assert.deepEqual(created.state.hands[0], created.state.hands[1]);
    await as(b);
    assert.equal(
      (
        await db.query<{ value: any }>(
          "select start_block_battle(300) as value",
        )
      ).rows[0].value.match.id,
      id,
    );
    await as(a);
    let m = await call(id, { type: "ready" });
    assert.equal(m.status, "waiting");
    await call(id, { type: "finish" });
    await as(b);
    m = await call(id, { type: "ready" });
    assert.equal(m.status, "playing");
    await assert.rejects(
      call(id, {
        type: "place",
        piece: 0,
        row: 0,
        col: 0,
        move_id: crypto.randomUUID(),
      }),
      /countdown/,
    );
    await db.exec("reset role");
    const board = Array(64).fill(0);
    for (let i = 1; i < 8; i++) {
      board[i] = 1;
      board[i * 8] = 1;
    }
    await db.query(
      "update block_matches set starts_at=clock_timestamp()-interval '1 second',ends_at=clock_timestamp()+interval '60 seconds',state=jsonb_set(jsonb_set(state,'{boards,0}',$2),'{hands,0}','[0,0,0]') where id=$1",
      [id, JSON.stringify(board)],
    );
    await db.exec("set role authenticated");
    await as(a);
    const requestId = crypto.randomUUID();
    m = await call(id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: requestId,
      score: 999999,
    });
    assert.equal(m.state.scores[0], 260);
    assert.equal(m.state.scores[1], 0);
    assert.ok(m.state.boards[0].every((v: number) => v === 0));
    const replay = await call(id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: requestId,
    });
    assert.equal(replay.state.scores[0], 260);
    assert.equal(replay.revision, m.revision);
    assert.equal(
      (await call(id, { type: "get" })).revision,
      m.revision,
      "read refreshes must not trigger write/Realtime loops",
    );
    await assert.rejects(
      call(id, {
        type: "place",
        piece: 0,
        row: 2,
        col: 2,
        move_id: crypto.randomUUID(),
      }),
      /empty space/,
    );
    await assert.rejects(
      call(id, {
        type: "place",
        piece: 1,
        row: -1,
        col: 0,
        move_id: crypto.randomUUID(),
      }),
      /empty space/,
    );
    await assert.rejects(
      db.query("update block_matches set status='won' where id=$1", [id]),
      /permission denied/,
    );
    await as(outside);
    assert.equal(
      (await db.query("select * from block_matches")).rows.length,
      0,
    );
    await assert.rejects(call(id, { type: "get" }), /unavailable/);
    await db.exec("reset role");
    await db.query(
      "update block_matches set ends_at=clock_timestamp()-interval '1 second' where id=$1",
      [id],
    );
    await db.exec("set role authenticated");
    await as(a);
    m = await call(id, {
      type: "place",
      piece: 1,
      row: 0,
      col: 0,
      move_id: crypto.randomUUID(),
    });
    assert.equal(m.status, "won");
    assert.equal(m.winner, 0);
    assert.equal(m.state.scores[0], 260);
    assert.deepEqual(
      (await db.query<{ value: number[] }>("select scoreboard() as value"))
        .rows[0].value,
      [1, 0],
    );
  } finally {
    await db.close();
  }
});

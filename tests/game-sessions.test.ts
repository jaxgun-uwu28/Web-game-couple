import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { thinkingNotification } from "../src/lib/push";
test("All online games require their partner, dispatch moves correctly and cancel on exit", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;grant usage on schema auth,public,realtime to authenticated,service_role;`,
    );
    await db.exec(
      `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
    );
    for (const p of [
      "supabase/setup_fresh_project.sql",
      "supabase/migrations/004_block_battle.sql",
      "supabase/migrations/005_connections.sql",
      "supabase/migrations/008_together.sql",
      "supabase/migrations/009_ai_questions.sql",
      "supabase/migrations/010_brain_lobby.sql",
      "supabase/migrations/011_game_presence_and_taps.sql",
    ])
      await db.exec(await readFile(p, "utf8"));
    // Migration 011 is safe to re-run while finishing deployment.
    await db.exec(await readFile("supabase/migrations/011_game_presence_and_taps.sql", "utf8"));
    const c = "06092025-0000-4000-8000-000000000001",
      a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002",
      o = "10000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${o}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');`,
    );
    const scalar = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0].v;

    const login = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);

    const here = (id: string, kind: string, leaving = false) =>
      scalar<boolean>("select game_here($1,$2,$3) v", [id, kind, leaving]);
    await db.exec("set role authenticated");
    for (const kind of ["tic", "connect", "draw", "know"]) {
      await login(a);
      const game = await scalar<any>("select to_jsonb(new_game($1)) v", [kind]);
      assert.equal(await here(game.id, kind), false);
      const action =
        kind === "draw"
          ? { guess: "a-wrong-word" }
          : kind === "know"
            ? { self: "0", guess: "1" }
            : { cell: 0 };
      await assert.rejects(
        db.query("select play_game($1,$2)", [game.id, action]),
        /Waiting for your person/,
      );
      await login(b);
      assert.equal(await here(game.id, kind), true);
      await login(a);
      if (kind === "draw") {
        await db.query("select save_entry($1,$2)", [
          "stroke",
          { game: game.id, color: "#9d304f", points: [[0.2, 0.3]] },
        ]);
        await login(b);
      }
      const next = await scalar<any>("select to_jsonb(play_game($1,$2)) v", [
        game.id,
        action,
      ]);
      if (kind === "tic" || kind === "connect")
        assert.equal(next.state.turn, 1);
      if (kind === "know") assert.equal(next.state.round, 0); // One private submission is not a reveal.
      await here(game.id, kind, true);
      assert.equal(
        await scalar("select state->>'status' v from games where id=$1", [
          game.id,
        ]),
        "cancelled",
      );
      await login(a);
      await assert.rejects(
        db.query("select play_game($1,$2)", [game.id, action]),
        /Waiting|finished/,
      );
    }
    await login(a);
    const block = await scalar<any>("select start_block_battle(60) v");
    const bid = block.match.id;
    await here(bid, "block");
    await assert.rejects(
      db.query("select block_battle($1,$2)", [bid, { type: "ready" }]),
      /Waiting/,
    );
    await login(b);
    await here(bid, "block");
    await db.query("select block_battle($1,$2)", [bid, { type: "ready" }]);
    await login(a);
    const ready = await scalar<any>("select block_battle($1,$2) v", [
      bid,
      { type: "ready" },
    ]);
    assert.equal(ready.match.status, "playing");
    await here(bid, "block", true);
    assert.equal(
      await scalar("select status v from block_matches where id=$1", [bid]),
      "cancelled",
    );
    // Host/guest Brain Duel uses its own lobby, and exit cancels even while preparing.
    await scalar("select brain_lobby('create') v");
    await scalar("select brain_lobby('ready') v");
    await login(b);
    await scalar("select brain_lobby('join') v");
    await scalar("select brain_lobby('ready') v");
    await login(a);
    await scalar("select brain_lobby('begin') v");
    await scalar("select brain_lobby('leave') v");
    assert.equal(
      (await scalar<any>("select brain_lobby('inspect') v")).status,
      "cancelled",
    );
    await scalar("select brain_lobby('create') v");
    await scalar("select brain_lobby('ready') v");
    await login(b);
    await scalar("select brain_lobby('join') v");
    await scalar("select brain_lobby('ready') v");
    await login(a);
    await scalar("select brain_lobby('begin') v");
    await db.exec("reset role");
    for (let i = 0; i < 5; i++)
      await db.query(
        "insert into question_bank(topic,question,options,correct_index,fun_fact,hash,difficulty,source) values('Surprise Mix',$1,jsonb_build_array('a','b','c','d'),0,'Fixture fact',$1,'Medium','ai')",
        [`Fixture question ${i}`],
      );
    const lease = await scalar<string>(
      "select ai_claim($1,'trivia','Surprise Mix') v",
      [c],
    );
    const brain = await scalar<any>(
      "select to_jsonb(ai_start_duel($1,'Surprise Mix',5,'Medium',$2)) v",
      [c, lease],
    );
    await db.exec("set role authenticated");
    await db.query("select play_game($1,$2)", [brain.id, { answer: "0" }]);
    await login(b);
    await db.query("select play_game($1,$2)", [brain.id, { answer: "0" }]);
    assert.equal(
      await scalar("select (state->>'round')::int v from games where id=$1", [
        brain.id,
      ]),
      1,
    );
    await scalar("select brain_lobby('leave') v");
    assert.equal(
      await scalar("select state->>'status' v from games where id=$1", [
        brain.id,
      ]),
      "cancelled",
    );
    await login(a);
    await db.query("select send_thinking_of_you($1)", [
      "Miss you. Sushi tonight?",
    ]);
    await assert.rejects(
      db.query("select send_thinking_of_you($1)", ["again"]),
      /Wait a minute/,
    );
    const state = await scalar<any>("select connection_state() v");
    assert.equal(state.taps[0].message, "Miss you. Sushi tonight?");
    assert.equal((await scalar<any>("select arcade_progress() v")).played, 0);
    // Stale attendance cannot resurrect an abandoned board.
    const stale = await scalar<any>("select to_jsonb(new_game('tic')) v");
    await here(stale.id, "tic");
    await db.exec("reset role");
    await db.query(
      "update game_presence set seen_at=now()-interval '25 seconds' where game_id=$1",
      [stale.id],
    );
    await db.exec("set role authenticated");
    assert.equal(await here(stale.id, "tic"), false);
    assert.equal(
      await scalar("select state->>'status' v from games where id=$1", [
        stale.id,
      ]),
      "cancelled",
    );
    const path = `${c}/home-background.webp`;
    await db.query(
      "insert into art_slots(couple_id,slot,path) values($1,'home-background',$2)",
      [c, path],
    );
    await login(o);
    assert.equal(
      (await db.query("delete from art_slots returning slot")).rows.length,
      0,
    );
    await assert.rejects(here(bid, "block"), /unavailable/);
    await assert.rejects(
      db.query("select send_thinking_of_you('intrusion')"),
      /private account/,
    );
    await login(a);
    assert.equal(
      (await db.query("delete from art_slots returning slot")).rows.length,
      1,
    );
    // Storage deletion is also restricted to the couple's own artwork folder.
    await db.exec("reset role");
    await db.query(
      "insert into storage.objects values('app-art',$1),('app-art',$2)",
      [path, `${o}/home-background.webp`],
    );
    await db.exec(
      "grant usage on schema storage to authenticated; grant select,delete on storage.objects to authenticated; set role authenticated",
    );
    assert.equal(
      (await db.query("delete from storage.objects returning name")).rows
        .length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("Thinking notification uses the chosen message with bounded, clean sender context", () => {
  assert.deepEqual(thinkingNotification("Miss you. Sushi tonight?", "Lance"), {
    title: "Lance · Thinking of you",
    body: "Miss you. Sushi tonight?",
  });
  assert.equal(thinkingNotification("x".repeat(300), "").body.length, 180);
  assert.ok(thinkingNotification("", null).body.includes("Your person"));
  assert.equal(
    thinkingNotification("hello\nthere", "Elaine").body,
    "hello there",
  );
});

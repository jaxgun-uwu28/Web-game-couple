import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Brain lobby enforces host setup, two ready players, expiry and sealed-prompt promotion", async () => {
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
    ])
      await db.exec(await readFile(p, "utf8"));
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
    const lobby = (op: string, options: object = {}) =>
      scalar<any>("select brain_lobby($1,$2) v", [op, options]);
    await login(a);
    await lobby("create");
    await assert.rejects(lobby("begin"), /Both players/);
    await login(b);
    await lobby("join");
    await assert.rejects(
      lobby("configure", { topic: "Space", difficulty: "Hard", count: 3 }),
      /Only the lobby host/,
    );
    await lobby("ready");
    await login(a);
    await lobby("ready");
    assert.equal((await lobby("inspect")).bothReady, true);
    await lobby("configure", { topic: "Space", difficulty: "Hard", count: 3 });
    assert.equal((await lobby("inspect")).bothReady, false);
    await lobby("ready");
    await login(b);
    await lobby("ready");
    await login(a);
    await lobby("begin");
    for (let i = 0; i < 3; i++)
      await db.query(
        "insert into question_bank(topic,question,options,correct_index,fun_fact,hash,difficulty,source) values('Space',$1,jsonb_build_array('a','b','c','d'),0,'Fact about space',$1,'Hard','ai')",
        ["Unique space question " + i],
      );
    const lease = await scalar<string>(
      "select ai_claim($1,'trivia','Space') v",
      [c],
    );
    const game = await scalar<any>(
      "select to_jsonb(ai_start_duel($1,'Space',3,'Hard',$2)) v",
      [c, lease],
    );
    assert.equal(game.state.questions.length, 3);
    assert.equal(game.state.difficulty, "Hard");
    await lobby("leave");
    await login(b);
    await assert.rejects(
      db.query("select play_game($1,$2)", [game.id, { answer: "0" }]),
      /Waiting for both/,
    );
    await login(a);
    await lobby("join");
    await lobby("ready");
    await db.query("select play_game($1,$2)", [game.id, { answer: "0" }]);
    await login(b);
    const revealed = await scalar<any>("select to_jsonb(play_game($1,$2)) v", [
      game.id,
      { answer: "0" },
    ]);
    assert.equal(revealed.state.round, 1);
    await db.exec(
      "update brain_lobbies set members=jsonb_set(members,array['" +
        a +
        "','seen'],to_jsonb((now()-interval '25 seconds')::text))",
    );
    await assert.rejects(
      db.query("select play_game($1,$2)", [game.id, { answer: "0" }]),
      /Waiting for both/,
    );
    await assert.rejects(db.query("select new_game('trivia')"), /lobby first/);
    await login(o);
    await assert.rejects(lobby("join"), /Sign in/);
    await login(a);
    const today = await scalar<string>("select couple_day()::text v");
    const d = {
      date: today,
      text: "Original daily prompt",
      mood: "cozy",
      hash: "original",
      source: "fallback",
    };
    const w = {
      date: today,
      option_a: "First saved option",
      option_b: "Second saved option",
      hash: "pair",
      source: "fallback",
    };
    await db.query("select ai_promote_content($1,$2,$3)", [c, [d], [w]]);
    await db.query("select answer_today('daily','sealed reply')");
    await db.query("select ai_promote_content($1,$2,$3)", [
      c,
      [{ ...d, text: "Replacement Gemini prompt", source: "ai" }],
      [{ ...w, option_a: "Gemini option one", source: "ai" }],
    ]);
    assert.equal(
      await scalar("select text v from daily_questions where date=$1", [today]),
      d.text,
    );
    assert.equal(
      await scalar("select source v from would_you_rather where date=$1", [
        today,
      ]),
      "ai",
    );
    assert.ok(await scalar("select ai_content_claim($1) v", [c]));
    assert.equal(await scalar("select ai_content_claim($1) v", [c]), null);
  } finally {
    await db.close();
  }
});

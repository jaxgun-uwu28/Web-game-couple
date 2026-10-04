import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { connectionPrompts, sealedAnswers } from "../src/lib/connections";

test("preview hides a partner’s answer until both answer, with day-stable prompts", () => {
  assert.deepEqual(sealedAnswers([{ user_id: "a", answer: "secret" }], "b"), [
    { user_id: "a", answer: null },
  ]);
  assert.equal(
    sealedAnswers(
      [
        { user_id: "a", answer: "one" },
        { user_id: "b", answer: "two" },
      ],
      "b",
    )[0].answer,
    "one",
  );
  assert.deepEqual(
    connectionPrompts("2026-10-04"),
    connectionPrompts("2026-10-04"),
  );
  assert.notDeepEqual(
    connectionPrompts("2026-10-04"),
    connectionPrompts("2026-10-05"),
  );
});

test("Stage 3 seals answers, validates moods, isolates history and rate-limits private taps", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;
 create publication supabase_realtime;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema auth,public,realtime,storage to authenticated;
 grant select,insert,update on storage.objects to authenticated;`);
    await db.exec(await readFile("supabase/setup_fresh_project.sql", "utf8"));
    await db.exec(
      await readFile("supabase/migrations/005_connections.sql", "utf8"),
    );
    const c = "06092025-0000-4000-8000-000000000001",
      one = "10000000-0000-4000-8000-000000000001",
      two = "10000000-0000-4000-8000-000000000002",
      other = "10000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${one}'),('${two}'),('${other}');insert into profiles(id,couple_id,slot,name) values('${one}','${c}',0,'Player 1'),('${two}','${c}',1,'Player 2');set role authenticated;`,
    );
    const as = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const state = async () =>
      (
        await db.query<{
          state: {
            daily: { answer: string | null }[];
            choice: { answer: string | null }[];
            matches: number;
            total: number;
            moods: { user_id: string; mood: string; note: string }[];
            taps: { sender: string; recipient: string }[];
          };
        }>("select connection_state() as state")
      ).rows[0].state;
    await as(one);
    await db.query(
      "select seal_connection_answer('daily','A secret thought',(now() at time zone 'Asia/Manila')::date)",
    );
    await db.query(
      "select seal_connection_answer('choice','0',(now() at time zone 'Asia/Manila')::date)",
    );
    await assert.rejects(
      db.query(
        "select seal_connection_answer('choice','1',(now() at time zone 'Asia/Manila')::date-1)",
      ),
      /new day/,
    );
    await as(two);
    assert.equal((await state()).daily[0].answer, null);
    assert.equal((await state()).choice[0].answer, null);
    await assert.rejects(
      db.query("select * from answers"),
      /permission denied/,
    );
    await db.query(
      "select seal_connection_answer('daily','A second thought',(now() at time zone 'Asia/Manila')::date)",
    );
    await db.query(
      "select seal_connection_answer('choice','0',(now() at time zone 'Asia/Manila')::date)",
    );
    assert.equal((await state()).daily[0].answer, "A secret thought");
    assert.equal((await state()).matches, 1);
    assert.equal((await state()).total, 1);
    await db.query("select check_in_mood('tired',' A little rest ')");
    await db.query("select check_in_mood('calm','Feeling better')");
    assert.equal((await state()).moods.length, 1);
    assert.equal((await state()).moods[0].mood, "calm");
    await assert.rejects(
      db.query("select check_in_mood('unknown','')"),
      /Choose a mood/,
    );
    await assert.rejects(
      db.query("select check_in_mood('calm',repeat('x',161))"),
      /160/,
    );
    await assert.rejects(
      db.query(
        `insert into mood_checkins(couple_id,user_id,mood) values('${c}','${one}','happy')`,
      ),
      /permission denied/,
    );
    await db.query("select thinking_of_you()");
    await assert.rejects(db.query("select thinking_of_you()"), /Wait a minute/);
    await as(one);
    const received = await state();
    assert.equal(received.taps[0].recipient, one);
    assert.equal(received.taps[0].sender, two);
    await db.query("select thinking_of_you()");
    assert.equal((await state()).taps.length, 2);
    await as(other);
    assert.equal(
      (await db.query("select * from mood_checkins")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from connection_taps")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select connection_state()"),
      /private account/,
    );
    await assert.rejects(
      db.query("select thinking_of_you()"),
      /private account/,
    );
    await assert.rejects(
      db.query("select check_in_mood('happy','')"),
      /private account/,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(
      db.query("select connection_state()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

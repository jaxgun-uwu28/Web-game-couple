import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Hold Hands records only a paired server session, deduplicates exits, limits invites and isolates stats", async () => {
  const db = new PGlite(),
    a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002",
    c = "06092025-0000-4000-8000-000000000001",
    outsider = "10000000-0000-4000-8000-000000000003";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table couples(id uuid primary key);create table profiles(id uuid primary key,couple_id uuid references couples);create function my_couple() returns uuid language sql stable security definer as $$select couple_id from profiles where id=auth.uid()$$;create table notification_preferences(user_id uuid primary key);create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;grant usage on schema auth,public,realtime to authenticated;insert into couples values('${c}');insert into profiles values('${a}','${c}'),('${b}','${c}');`,
    );
    const sql = await readFile(
      "supabase/migrations/015_hold_hands.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const as = async (id: string) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    await as(a);
    await db.query("select hold_update(true)");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hold_sessions",
        )
      ).rows[0].n,
      0,
    );
    await as(b);
    await db.query("select hold_update(true)");
    await db.exec(
      "reset role;update hold_rooms set started_at=clock_timestamp()-interval '4 seconds'",
    );
    await as(a);
    await db.query("select hold_update(false)");
    const stats = (
      await db.query<{ s: { count: number; total: number } }>(
        "select hold_stats() s",
      )
    ).rows[0].s;
    assert.equal(stats.count, 1);
    assert.ok(stats.total >= 3);
    await db.query("select hold_update(false)");
    assert.equal(
      (await db.query<{ s: { count: number } }>("select hold_stats() s"))
        .rows[0].s.count,
      1,
    );
    await db.query("select invite_hold_hands()");
    await assert.rejects(db.query("select invite_hold_hands()"), /ten minutes/);
    await assert.rejects(
      db.query(
        "insert into hold_sessions(couple_id,started_at,duration_sec) values($1,now(),999)",
        [c],
      ),
      /permission denied/,
    );
    await as(outsider);
    assert.equal(
      (await db.query("select * from hold_sessions")).rows.length,
      0,
    );
    await assert.rejects(db.query("select hold_update(true)"), /Sign in/);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select hold_stats()"), /permission denied/);
  } finally {
    await db.close();
  }
});

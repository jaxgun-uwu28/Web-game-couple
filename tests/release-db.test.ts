import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createBlackjack,
  blackjackMove,
} from "../src/lib/plugin-games/blackjack";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  c = "06092025-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
async function apply(db: PGlite, file: string) {
  const sql = await readFile(`supabase/migrations/${file}.sql`, "utf8");
  await db.exec(sql);
  await db.exec(sql);
}
async function login(db: PGlite, uid: string) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
test("Blackjack transactions escrow different buy-ins, cash out exactly once, and block opponent hole/deck reads", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table couples(id uuid primary key);create table profiles(id uuid primary key,couple_id uuid,slot int);create function my_couple() returns uuid language sql stable security definer as $$select couple_id from profiles where id=auth.uid()$$;create function my_slot() returns int language sql stable security definer as $$select slot from profiles where id=auth.uid()$$;grant usage on schema auth,public to authenticated,anon;insert into couples values('${c}');insert into profiles values('${a}','${c}',0),('${b}','${c}',1);`,
    );
    await apply(db, "018_plugin_games");
    await apply(db, "023_blackjack");
    await apply(db, "024_cosmetic_unlocks");
    await db.exec("create table match_moves(match_id uuid,seq bigint,slot int,action jsonb);create table games(id uuid primary key,couple_id uuid,kind text,state jsonb,created_at timestamptz default now());create table block_matches(id uuid primary key,couple_id uuid,state jsonb,status text,winner int,seed int,created_at timestamptz default now());");await apply(db,"025_wallet_session_guards");
    const initial = createBlackjack({
      ante: 1,
      end: "out",
      notes: true,
      payout: "3:2",
    });
    await db.query("select create_plugin_match($1,$2,'blackjack',$3,7,$4)", [
      id,
      a,
      initial.config,
      initial,
    ]);
    await db.exec(
      `update ledger_wallets set balance=100;update arcade_matches set status='waiting' where id='${id}'`,
    );
    await db.query("select blackjack_buyin($1,$2,30)", [id, a]);
    await db.query("select blackjack_buyin($1,$2,20)", [id, b]);
    await db.query("select blackjack_buyin($1,$2,20)", [id, b]);
    await assert.rejects(db.query("select create_plugin_match($1,$2,'ledger','{}',7,'{}')",[crypto.randomUUID(),a]),/wallet game/);await login(db,a);await assert.rejects(db.query("select reset_ledger_wallets(10)"),/wallet game/);await db.exec("reset role");
    const total = async () =>
      +(
        await db.query<{ n: number }>(
          "select (select sum(balance) from ledger_wallets)+(select sum(chips) from blackjack_players) n",
        )
      ).rows[0].n;
    assert.equal(await total(), 200);
    await assert.rejects(db.query("select blackjack_buyin($1,$2,99)", [id, b]));
    let s = (
      await db.query<{ state: ReturnType<typeof createBlackjack> }>(
        "select state from arcade_private_states where match_id=$1",
        [id],
      )
    ).rows[0].state;
    s = blackjackMove(s, { type: "start", serverNow: 1000 }, 0);
    s = blackjackMove(s, { type: "resign", serverNow: 1100 }, 1);
    await db.query("update arcade_matches set status='playing' where id=$1", [
      id,
    ]);
    const rid = crypto.randomUUID();
    await db.query("select commit_plugin_move($1,$2,2,$3,$4,$5,'done',$2,$6)", [
      id,
      a,
      rid,
      { type: "resign" },
      s,
      s.chips,
    ]);
    await db.query("select commit_plugin_move($1,$2,2,$3,$4,$5,'done',$2,$6)", [
      id,
      a,
      rid,
      { type: "resign" },
      s,
      s.chips,
    ]);
    assert.equal(await total(), 200);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select sum(chips)::int n from blackjack_players",
        )
      ).rows[0].n,
      0,
    );
    await login(db, b);
    assert.equal(
      (await db.query("select * from blackjack_players where user_id=$1", [a]))
        .rows.length,
      0,
    );
    await assert.rejects(db.query("select deck_state from blackjack_rounds"));
    await assert.rejects(db.query("select state from arcade_private_states"));
    await assert.rejects(db.query("select blackjack_buyin($1,$2,20)", [id, a]));
    await db.exec("reset role");
    await db.query(
      "insert into game_rewards(user_id,couple_id,coins,xp) values($1,$2,100,200) on conflict(user_id) do update set coins=100,xp=200",
      [a, c],
    );
    await login(db, a);
    await db.query("select unlock_cosmetic('cassette-colors')");
    await db.query("select unlock_cosmetic('cassette-colors')");
    assert.equal(
      (
        await db.query<{ coins: number }>(
          "select coins from game_rewards where user_id=auth.uid()",
        )
      ).rows[0].coins,
      75,
    );
    await assert.rejects(db.query("select unlock_cosmetic('unknown')"));
  } finally {
    await db.close();
  }
});
test("Heart invites require partner acceptance, preserve sessions through 60-second grace, and claim a reconnect win", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;grant usage on schema auth,public,realtime to authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
    );
    await db.exec(await readFile("supabase/setup_fresh_project.sql", "utf8"));
    for (const f of [
      "004_block_battle",
      "005_connections",
      "008_together",
      "009_ai_questions",
      "010_brain_lobby",
      "011_game_presence_and_taps",
      "012_activities_heartblast",
    ])
      await db.exec(await readFile(`supabase/migrations/${f}.sql`, "utf8"));
    await apply(db, "021_heart_challenges");
    await apply(db, "018_plugin_games");
    await apply(db, "022_rivalry_stats");
    await db.exec(
      `insert into auth.users values('${a}'),('${b}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');`,
    );
    await login(db, a);
    const room = (
        await db.query<{ v: any }>(
          'select start_heartblast(\'{"mode":"timed","seconds":180}\') v',
        )
      ).rows[0].v,
      mid = room.match.id;
    assert.equal(room.challenge.host, a);
    await assert.rejects(
      db.query('select heartblast_battle($1,\'{"type":"ready"}\')', [mid]),
      /accept/,
    );
    await db.query("select game_here($1,'block')", [mid]);
    await login(db, b);
    await db.query('select heartblast_battle($1,\'{"type":"accept"}\')', [mid]);
    await db.query("select game_here($1,'block')", [mid]);
    await db.query('select heartblast_battle($1,\'{"type":"ready"}\')', [mid]);
    await login(db, a);
    await db.query('select heartblast_battle($1,\'{"type":"ready"}\')', [mid]);
    await assert.rejects(
      db.query('select heartblast_battle($1,\'{"type":"claim"}\')', [mid]),
      /grace/,
    );
    await db.exec("reset role");
    await db.query(
      "update game_presence set seen_at=now()-interval '61 seconds' where user_id=$1",
      [b],
    );
    await db.query(
      "update heart_challenges set last_seen=jsonb_set(last_seen,array[$1],to_jsonb(now()-interval '61 seconds'))",
      [b],
    );
    await login(db, a);
    await db.query("select game_here($1,'block')", [mid]);
    const result = (
      await db.query<{ v: any }>(
        'select heartblast_battle($1,\'{"type":"claim"}\') v',
        [mid],
      )
    ).rows[0].v;
    assert.equal(result.match.status, "won");
    assert.equal(result.match.winner, 0);
    const stats = (await db.query<{ v: any }>("select scoreboard_details() v"))
      .rows[0].v;
    assert.equal(stats[0].wins, 1);
    assert.equal(stats[1].losses, 1);
    assert.equal(stats[0].streak, 1);
    assert.equal(stats[0].comeback, 0);
  } finally {
    await db.close();
  }
});

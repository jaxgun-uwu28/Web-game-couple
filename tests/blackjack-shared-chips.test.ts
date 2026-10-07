import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createBlackjack,
  blackjackMove,
} from "../src/lib/plugin-games/blackjack";
import { seededDeck } from "../src/lib/cards";

test("equal custom starting chips remain conserved when play starts", () => {
  for (const amount of [10, 100, 275, 10000]) {
    let s = createBlackjack({ sessionChips: true, startingChips: amount });
    assert.deepEqual(s.chips, [amount, amount]);
    s = blackjackMove(
      s,
      { type: "start", serverNow: 1000, serverDeck: seededDeck(1) },
      0,
    );
    assert.equal(s.chips[0] + s.chips[1] + s.pot, amount * 2);
  }
  for (const amount of [0, 9, 10001, 10.5])
    assert.throws(() =>
      createBlackjack({ sessionChips: true, startingChips: amount }),
    );
});

test("migration refunds waiting buy-ins once and keeps match chips out of wallets", async () => {
  const db = new PGlite();
  const mid = "00000000-0000-4000-8000-000000000001",
    uid = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table arcade_matches(id uuid primary key,game_id text,status text,config jsonb,ready uuid[],revision int default 0);
      create table arcade_private_states(match_id uuid primary key,state jsonb);
      create table blackjack_players(session_id uuid,user_id uuid,buy_in int,chips int);
      create table blackjack_sessions(id uuid primary key,config jsonb,cashed_out boolean default false,ended_at timestamptz);
      create table ledger_wallets(user_id uuid primary key,balance int);
      create function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) returns uuid language sql as 'select $1';
      create function create_plugin_match_before_wallet_guard(mid uuid,uid uuid,gid text,cfg jsonb,seed bigint,engine jsonb) returns uuid language plpgsql as $$ begin
        insert into arcade_matches values(mid,gid,'waiting',cfg,'{}',0);
        insert into arcade_private_states values(mid,engine);
        insert into blackjack_players values(mid,uid,0,0);
        insert into blackjack_sessions(id,config) values(mid,cfg); return mid; end $$;
      create function sync_blackjack(mid uuid,s jsonb) returns void language plpgsql as $$ begin
        if not (select cashed_out from blackjack_sessions where id=mid) then update ledger_wallets set balance=balance+10; end if; end $$;
      insert into arcade_matches values('${mid}','blackjack','waiting','{}','{}',0);
      insert into arcade_private_states values('${mid}','{}');
      insert into blackjack_players values('${mid}','${uid}',10,10);
      insert into blackjack_sessions(id,config) values('${mid}','{}');
      insert into ledger_wallets values('${uid}',90);`);
    const sql = await readFile(
      "supabase/migrations/033_blackjack_shared_chips.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(
      (
        await db.query<{ balance: number }>(
          "select balance from ledger_wallets",
        )
      ).rows[0].balance,
      100,
    );
    assert.equal(
      (await db.query<{ chips: number }>("select chips from blackjack_players"))
        .rows[0].chips,
      100,
    );
    await db.exec(
      `update arcade_matches set status='done'; select sync_blackjack('${mid}','{}'); select sync_blackjack('${mid}','{}');`,
    );
    assert.equal(
      (
        await db.query<{ balance: number }>(
          "select balance from ledger_wallets",
        )
      ).rows[0].balance,
      100,
    );
    await db.exec(
      `select create_plugin_match('00000000-0000-4000-8000-000000000004','${uid}','blackjack','{"sessionChips":true,"startingChips":275}',1,'{}');`,
    );
    assert.equal(
      (
        await db.query<{ chips: number }>(
          "select chips from blackjack_players where session_id='00000000-0000-4000-8000-000000000004'",
        )
      ).rows[0].chips,
      275,
    );
  } finally {
    await db.close();
  }
});

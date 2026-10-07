import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createLedger,
  ledgerMove as applyLedgerMove,
} from "../src/lib/plugin-games/ledger";
import { createLost, lostMove } from "../src/lib/plugin-games/lostfound";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  o = "10000000-0000-4000-8000-000000000003",
  c = "06092025-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
async function fixture() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table couples(id uuid primary key);create table profiles(id uuid primary key,couple_id uuid,slot int);create function my_couple() returns uuid language sql stable security definer as $$select couple_id from profiles where id=auth.uid()$$;create table notification_preferences(user_id uuid);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema auth,storage,public to authenticated,anon;grant select,insert,delete on storage.objects to authenticated;grant select on storage.objects to anon;insert into couples values('${c}');insert into profiles values('${a}','${c}',0),('${b}','${c}',1);`,
  );
  return db;
}
async function as(db: PGlite, uid: string) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
test("Sealed postcards withhold columns, files and RPC content until unlock; envelopes carry no secret payload", async () => {
  const db = await fixture();
  try {
    for (const file of ["016_voice_cassettes.sql", "017_postcards.sql"]) {
      const sql = await readFile(`supabase/migrations/${file}`, "utf8");
      await db.exec(sql);
      await db.exec(sql);
    }
    await as(db, a);
    const base = `${c}/${a}/${id}`;
    for (const side of ["front", "back"])
      await db.query(
        "insert into storage.objects values('postcards',$1,'{\"size\":20000}')",
        [`${base}/${side}.webp`],
      );
    await db.query(
      "select send_postcard($1,'{\"stickers\":[]}', 'A secret', '#F8C9D8','heart',now()+interval '1 day')",
      [id],
    );
    await db.query(
      "select send_postcard($1,'{\"stickers\":[]}', 'A secret', '#F8C9D8','heart',now()+interval '1 day')",
      [id],
    );
    assert.equal((await db.query("select id from postcards")).rows.length, 1);
    await as(db, b);
    await assert.rejects(
      db.query("select message,front_path,layers from postcards"),
    );
    await assert.rejects(db.query("select open_postcard($1)", [id]));
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    const envelope = (await db.query("select * from postcard_envelopes"))
      .rows[0];
    assert.deepEqual(Object.keys(envelope as object).sort(), [
      "couple_id",
      "id",
      "updated_at",
    ]);
    await db.exec("reset role");
    await db.query(
      "update postcards set unlock_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await as(db, b);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query<{ open_postcard: { message: string } }>(
          "select open_postcard($1)",
          [id],
        )
      ).rows[0].open_postcard.message,
      "A secret",
    );
    await as(db, o);
    assert.equal((await db.query("select id from postcards")).rows.length, 0);
    await assert.rejects(db.query("select open_postcard($1)", [id]));
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("Plugin transactions conserve wallets, retry exactly once, refund cancellation and protect engine/move secrets", async () => {
  const db = await fixture();
  try {
    const sql = await readFile(
      "supabase/migrations/018_plugin_games.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(
      `create function my_slot() returns int language sql stable security definer as $$select slot from profiles where id=auth.uid()$$;create table games(couple_id uuid,kind text,state jsonb);create table block_matches(couple_id uuid,state jsonb,status text,winner int);create table hold_sessions(couple_id uuid,duration_sec int);`,
    );
    for (const file of [
      "016_voice_cassettes.sql",
      "017_postcards.sql",
      "019_expansion_integration.sql",
      "020_game_details.sql",
    ]) {
      const integration = await readFile(`supabase/migrations/${file}`, "utf8");
      await db.exec(integration);
      await db.exec(integration);
    }
    const initial = createLedger({ wallet: 10, rounds: 1, entry: 1 });
    await db.query("select create_plugin_match($1,$2,'ledger',$3,77,$4)", [
      id,
      a,
      initial.config,
      initial,
    ]);
    await db.query("update arcade_matches set status='playing' where id=$1", [
      id,
    ]);
    const next = ledgerMove(
        initial,
        { type: "lock", coins: 2, note: "A snack" },
        0,
      ),
      rid = "30000000-0000-4000-8000-000000000001";
    const commit = () =>
      db.query(
        "select commit_plugin_move($1,$2,0,$3,$4,$5,'playing',null,'[]')",
        [id, a, rid, { type: "lock", note: "A snack" }, next],
      );
    await commit();
    await commit();
    assert.equal(
      (await db.query("select * from arcade_match_moves")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ balance: number }>(
          "select balance from ledger_wallets where user_id=$1",
          [a],
        )
      ).rows[0].balance,
      8,
    );
    await as(db, b);
    await assert.rejects(db.query("select * from arcade_private_states"));
    await assert.rejects(db.query("select * from arcade_match_moves"));
    await assert.rejects(
      db.query("select commit_plugin_move($1,$2,1,$3,'{}','{}','done')", [
        id,
        b,
        rid,
      ]),
    );
    await db.exec("reset role");
    await db.query("select cancel_plugin_match($1,$2)", [id, b]);
    await db.query("select cancel_plugin_match($1,$2)", [id, b]);
    assert.equal(
      (
        await db.query<{ total: number }>(
          "select sum(balance)::int total from ledger_wallets",
        )
      ).rows[0].total,
      20,
    );
    const huntId = "20000000-0000-4000-8000-000000000002",
      powerId = "30000000-0000-4000-8000-000000000002";
    let hunt = createLost({ size: 5, mode: "race" }, 99);
    hunt = lostMove(hunt, { type: "hide", cell: 0 }, 0);
    hunt = lostMove(hunt, { type: "hide", cell: 24 }, 1);
    await db.query("select create_plugin_match($1,$2,'lostfound',$3,99,$4)", [
      huntId,
      a,
      hunt.config,
      hunt,
    ]);
    await db.query("update arcade_matches set status='playing' where id=$1", [
      huntId,
    ]);
    const powered = lostMove(
      hunt,
      { type: "powerup", kind: "sonar", axis: "row" },
      0,
    );
    const spend = () =>
      db.query(
        "select commit_plugin_move($1,$2,0,$3,$4,$5,'playing',null,'[]')",
        [huntId, a, powerId, { type: "powerup", kind: "sonar" }, powered],
      );
    await assert.rejects(spend());
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from arcade_matches where id=$1",
          [huntId],
        )
      ).rows[0].revision,
      0,
    );
    await db.query(
      "insert into game_rewards(user_id,couple_id,coins,xp) values($1,$2,10,0)",
      [a, c],
    );
    await spend();
    await spend();
    assert.equal(
      (
        await db.query<{ coins: number }>(
          "select coins from game_rewards where user_id=$1",
          [a],
        )
      ).rows[0].coins,
      5,
    );
    await as(db, o);
    assert.equal(
      (await db.query("select * from arcade_matches")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

function ledgerMove(
  s: ReturnType<typeof createLedger>,
  m: Parameters<typeof applyLedgerMove>[1],
  p: 0 | 1,
) {
  let next = applyLedgerMove(s, { ...m, serverNow: 1000 }, p);
  if (next.status === "flipping") {
    next = applyLedgerMove(next, { type: "flip", serverNow: 1100 }, 0);
    next = applyLedgerMove(next, { type: "flip", serverNow: 1200 }, 1);
    next = applyLedgerMove(next, { type: "reveal", serverNow: 2600 }, 0);
  }
  return next;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptRoomSnapshot } from "../src/lib/plugin-room";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("late lobby and old-room responses cannot replace the current room", () => {
  const playing = { match: { id: "same", revision: 3 }, status: "playing" };
  assert.equal(
    acceptRoomSnapshot(playing, {
      match: { id: "same", revision: 2 },
      status: "waiting",
    }),
    playing,
  );
  assert.equal(
    acceptRoomSnapshot(playing, {
      match: { id: "old", revision: 99 },
      status: "waiting",
    }),
    playing,
  );
  const next = { match: { id: "same", revision: 4 }, status: "playing" };
  assert.equal(acceptRoomSnapshot(playing, next), next);
  assert.equal(acceptRoomSnapshot(null, next), next);
});
test("100-chip reset is repeat-safe and blocked during an active wallet game", async () => {
  const db = new PGlite();
  const cid = "00000000-0000-4000-8000-000000000001";
  await db.exec(`create role anon; create role authenticated;
 create function my_couple() returns uuid language sql as $$select '${cid}'::uuid$$;
 create table profiles(id uuid,couple_id uuid);
 create table ledger_wallets(user_id uuid primary key,couple_id uuid,balance int,topped_up date);
 create table arcade_matches(couple_id uuid,game_id text,status text);
 insert into profiles values('00000000-0000-4000-8000-000000000002','${cid}'),('00000000-0000-4000-8000-000000000003','${cid}');`);
  const sql = await readFile("supabase/migrations/032_wallet_100.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(
    "set role authenticated; select reset_ledger_wallets(100); reset role;",
  );
  assert.deepEqual(
    (await db.query("select balance from ledger_wallets")).rows.map(
      (r: any) => r.balance,
    ),
    [100, 100],
  );
  await db.exec(
    `insert into arcade_matches values('${cid}','blackjack','waiting'); set role authenticated;`,
  );
  await assert.rejects(
    db.exec("select reset_ledger_wallets(100)"),
    /Finish your current/,
  );
  await db.close();
});

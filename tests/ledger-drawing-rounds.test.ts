import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createLedger, ledgerMove } from "../src/lib/plugin-games/ledger";
test("Ledger requires matching bets, caps opener by both wallets, and conserves coins", () => {
  let s = createLedger({ wallet: 10, entry: 1, rounds: 3 });
  s.wallets = [4, 16];
  s.initial = 20;
  assert.throws(
    () => ledgerMove(s, { type: "lock", coins: 5 }, 1),
    /both wallets/,
  );
  s = ledgerMove(s, { type: "lock", coins: 3 }, 1);
  assert.throws(
    () => ledgerMove(s, { type: "lock", coins: 2 }, 0),
    /Match Partner/,
  );
  s = ledgerMove(
    s,
    { type: "lock", coins: 3, serverValues: [2, 6], serverNow: 100 },
    0,
  );
  assert.equal(s.pot, 6);
  assert.deepEqual(s.stakes, [3, 3]);
  assert.equal(s.pot + s.wallets[0] + s.wallets[1], 20);
});
test("timed drawing rounds reserve private words, alternate artists, reject early timeout, and finish", async () => {
  const db = new PGlite();
  const c = "06092025-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create table couples(id uuid primary key);create table profiles(id uuid primary key,couple_id uuid,slot int);
 create table games(id uuid primary key default gen_random_uuid(),couple_id uuid,kind text,state jsonb,created_at timestamptz default now());
 create table game_secrets(game_id uuid primary key,word text);create table entries(couple_id uuid,kind text,body jsonb);
 create function my_couple() returns uuid language sql as $$select '${c}'::uuid$$;
 create function my_slot() returns int language sql as $$select current_setting('test.slot')::int$$;
 create function game_pair_present(uuid,text) returns boolean language sql as $$select true$$;
 create function new_game(text) returns games language sql as $$select null::games$$;
 create function play_game(uuid,jsonb) returns games language sql as $$select * from games where id=$1$$;
 insert into couples values('${c}');insert into profiles values(gen_random_uuid(),'${c}',0),(gen_random_uuid(),'${c}',1);set test.slot='1';`);
    await db.exec(
      await readFile("supabase/migrations/026_party_game_batches.sql", "utf8"),
    );
    const sql = await readFile(
      "supabase/migrations/030_drawing_rounds.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    for (let i = 0; i < 15; i++)
      await db.query(
        `insert into party_game_bank(couple_id,kind,hash,item) values($1,'draw',$2,$3)`,
        [c, String(i), { word: "word" + i }],
      );
    const g: any = (await db.query(`select (start_draw_game($1,5,60)).*`, [c]))
      .rows[0];
    assert.equal(g.state.count, 5);
    assert.equal(
      (await db.query("select * from drawing_round_words")).rows.length,
      5,
    );
    assert.equal(
      (await db.query("select * from party_game_bank where used")).rows.length,
      5,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select * from drawing_round_words"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query(`select play_game($1,'{"type":"ready"}')`, [g.id]);
    await assert.rejects(
      db.query(`select play_game($1,'{"type":"timeout"}')`, [g.id]),
      /not expired/,
    );
    for (let r = 0; r < 5; r++) {
      const state: any = (
        await db.query<{ state: any }>("select state from games where id=$1", [
          g.id,
        ])
      ).rows[0].state;
      await db.exec(`set test.slot='${1 - state.artist}'`);
      if (r === 1) {
        await db.query(
          `update games set state=state||jsonb_build_object('round_ends_at',now()-interval '1 second') where id=$1`,
          [g.id],
        );
        await db.query(`select play_game($1,'{"type":"timeout"}')`, [g.id]);
      } else {
        const word: any = (
          await db.query("select word from game_secrets where game_id=$1", [
            g.id,
          ])
        ).rows[0];
        await db.query("select play_game($1,$2)", [g.id, { guess: word.word }]);
      }
      const after: any = (
        await db.query<{ state: any }>("select state from games where id=$1", [
          g.id,
        ])
      ).rows[0].state;
      if (r < 4) {
        assert.equal(after.phase, "round_done");
        await db.query(`select play_game($1,'{"type":"next"}')`, [g.id]);
        const next: any = (
          await db.query<{ state: any }>(
            "select state from games where id=$1",
            [g.id],
          )
        ).rows[0].state;
        assert.equal(next.artist, 1 - state.artist);
        assert.equal(next.round, r + 1);
      } else assert.notEqual(after.status, "playing");
    }
  } finally {
    await db.close();
  }
});

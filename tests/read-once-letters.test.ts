import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("read-once letters: recipient only, favorites retained, deletes cascade, repeat-safe", async () => {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated;
 create function auth.uid() returns uuid language sql as $$ select current_setting('test.viewer')::uuid $$;
 create function public.my_couple() returns uuid language sql as $$ select current_setting('test.couple')::uuid $$;
 create table love_notes(id uuid primary key, couple_id uuid, author uuid, opened_at timestamptz, unlock_at timestamptz);
 create table note_contents(note_id uuid references love_notes on delete cascade,body text);
 set test.viewer='00000000-0000-0000-0000-000000000002';
 set test.couple='00000000-0000-0000-0000-000000000010';`);
  const migration = await readFile(
    "supabase/migrations/027_read_once_letters.sql",
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  const id = "00000000-0000-0000-0000-000000000020";
  await db.exec(
    `insert into love_notes(id,couple_id,author,opened_at) values('${id}',public.my_couple(),'00000000-0000-0000-0000-000000000001',now()); insert into note_contents values('${id}','hello');`,
  );
  await db.exec(`set test.viewer='00000000-0000-0000-0000-000000000001'`);
  await assert.rejects(
    db.exec(`select finish_love_note('${id}',false)`),
    /recipient/,
  );
  await db.exec(
    `set test.viewer='00000000-0000-0000-0000-000000000002'; set test.couple='00000000-0000-0000-0000-000000000011'; select finish_love_note('${id}',false);`,
  );
  assert.equal((await db.query("select * from love_notes")).rows.length, 1);
  await db.exec(
    `set test.couple='00000000-0000-0000-0000-000000000010'; select finish_love_note('${id}',true); select finish_love_note('${id}',false);`,
  );
  assert.equal((await db.query("select * from love_notes")).rows.length, 1);
  await db.exec(
    `update love_notes set recipient_favorite=false,opened_at=null;`,
  );
  await assert.rejects(
    db.exec(`select finish_love_note('${id}',true)`),
    /opened/,
  );
  await db.exec(
    `update love_notes set opened_at=now(),unlock_at=now()+interval '1 day'`,
  );
  await assert.rejects(
    db.exec(`select finish_love_note('${id}',false)`),
    /recipient/,
  );
  await db.exec(
    `update love_notes set unlock_at=null; select finish_love_note('${id}',false); select finish_love_note('${id}',false);`,
  );
  assert.equal((await db.query("select * from love_notes")).rows.length, 0);
  assert.equal((await db.query("select * from note_contents")).rows.length, 0);
  await db.close();
});

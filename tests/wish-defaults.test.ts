import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enqueueWish,
  flushWishes,
  pendingWishes,
  clearPending,
} from "../src/lib/outbox";
import { temporaryDefaults, writableLists } from "../src/lib/wish-defaults";

test("defaults seed new memberships, repeat safely, recover deletion and respect write permissions", async () => {
  const db = new PGlite();
  const cid = "00000000-0000-4000-8000-000000000001",
    a = "00000000-0000-4000-8000-000000000002",
    b = "00000000-0000-4000-8000-000000000003";
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create table couples(id uuid primary key); create table profiles(id uuid primary key,couple_id uuid references couples,slot int);
    create function my_couple() returns uuid language sql security definer as $$select couple_id from profiles where id=auth.uid()$$;
    create table wishlists(id uuid primary key default gen_random_uuid(),couple_id uuid references couples,owner_id uuid references profiles,type text,title text,cover text default 'wish-jar');
    create table wishlist_items(id uuid primary key default gen_random_uuid(),list_id uuid references wishlists on delete cascade,created_by uuid,title text);
    create table wishlist_claims(item_id uuid references wishlist_items on delete cascade);
    create function can_edit_list(lid uuid) returns boolean language sql security definer as $$select exists(select 1 from wishlists where id=lid and couple_id=my_couple() and (type in ('shared','custom') or owner_id=auth.uid()))$$;
    grant usage on schema auth to authenticated; grant select on wishlists to authenticated;
    grant insert,select on wishlist_items to authenticated;
    alter table wishlist_items enable row level security;
    create policy add_wish on wishlist_items for insert to authenticated with check(can_edit_list(list_id) and created_by=auth.uid());
    insert into couples values('${cid}'); insert into profiles values('${a}','${cid}',0),('${b}','${cid}',1);
    set test.actor='${a}';`);
  const migration = await readFile(
    "supabase/migrations/031_wish_defaults.sql",
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query("select * from wishlists")).rows.length, 3);
  await db.exec(
    "set role authenticated; select ensure_wishlists(); select ensure_wishlists();",
  );
  await db.exec(
    `insert into wishlist_items(list_id,created_by,title) select id,'${a}','A car' from wishlists where type='shared';`,
  );
  await assert.rejects(
    db.exec(
      `insert into wishlist_items(list_id,created_by,title) select id,'${a}','Not allowed' from wishlists where type='personal' and owner_id='${b}'`,
    ),
    /cannot add/,
  );
  await db.exec(
    `select manage_wishlist((select id from wishlists where type='shared'),(select id from wishlists where type='personal' and owner_id='${a}'));`,
  );
  assert.equal((await db.query("select * from wishlists")).rows.length, 3);
  await db.exec(
    `reset role; delete from wishlists; set role authenticated; select ensure_wishlists();`,
  );
  assert.equal((await db.query("select * from wishlists")).rows.length, 3);
  await db.exec(
    `reset role; insert into couples values('00000000-0000-4000-8000-000000000004'); insert into profiles values('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004',0);`,
  );
  assert.equal(
    (
      await db.query(
        "select * from wishlists where couple_id='00000000-0000-4000-8000-000000000004'",
      )
    ).rows.length,
    2,
  );
  await db.close();
});
test("offline no-list wish resolves to one default with an idempotent retry", async () => {
  const user = "fresh";
  await clearPending(user);
  const defaults = temporaryDefaults(user);
  assert.equal(
    writableLists(
      [
        ...defaults,
        { ...defaults[1], id: "partner", owner_id: "partner", type: "secret" },
      ],
      user,
    ).length,
    2,
  );
  await enqueueWish(
    user,
    "couple",
    { id: "one-car", title: "A car", list_id: "local:shared" },
    null,
    defaults[0],
  );
  let inserts = 0;
  const stored = new Set<string>();
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    rpc: async () => ({
      data: [{ ...defaults[0], id: "server-default" }],
      error: null,
    }),
    from: () => ({
      select: () => ({
        eq: (_key: string, id: string) => ({
          maybeSingle: async () => ({
            data: stored.has(id) ? { id } : null,
            error: null,
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        assert.equal(row.list_id, "server-default");
        stored.add(String(row.id));
        inserts++;
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  await flushWishes(db, user, "couple");
  await flushWishes(db, user, "couple");
  assert.equal(inserts, 1);
  assert.equal((await pendingWishes(user)).length, 0);
});
test("wish entry controls never depend on a list or loading state", async () => {
  const source = await readFile("src/components/Keepsakes.tsx", "utf8");
  assert.doesNotMatch(source, /Create a list first\./);
  assert.match(source, /<button onClick=\{\(\) => edit\(null\)\}>/);
  assert.match(source, /arcade-open-wish/);
});

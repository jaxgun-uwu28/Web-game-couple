import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("wishlist deletion checks edit permission, cascades children and is repeat-safe", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table wishlists(id uuid primary key, editable boolean);
    create function can_edit_list(lid uuid) returns boolean language sql as $$
      select coalesce((select editable from wishlists where id=lid),false) $$;
    create table wishlist_items(id int primary key, list_id uuid references wishlists on delete cascade);
    create table wishlist_comments(item_id int references wishlist_items on delete cascade);
    create table wishlist_claims(item_id int references wishlist_items on delete cascade);
    create table wishlist_reactions(item_id int references wishlist_items on delete cascade);`);
  const migration = await readFile("supabase/migrations/029_wishlist_delete.sql", "utf8");
  await db.exec(migration); await db.exec(migration);
  const id = "00000000-0000-0000-0000-000000000001";
  await db.exec(`insert into wishlists values('${id}',false);
    insert into wishlist_items values(1,'${id}');
    insert into wishlist_comments values(1); insert into wishlist_claims values(1); insert into wishlist_reactions values(1);
    set role authenticated;`);
  await assert.rejects(db.exec(`select delete_wishlist('${id}')`), /cannot be edited/);
  await db.exec(`reset role; update wishlists set editable=true; set role authenticated; select delete_wishlist('${id}'); reset role;`);
  for (const table of ["wishlists", "wishlist_items", "wishlist_comments", "wishlist_claims", "wishlist_reactions"])
    assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
  await db.exec("set role anon");
  await assert.rejects(db.exec(`select delete_wishlist('${id}')`), /permission denied/);
  await db.close();
});

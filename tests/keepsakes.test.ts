import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Stage 4 RLS hides secret lists, gift claims, sealed notes and unpaired photo swaps even through direct queries", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema auth,public,realtime,storage to authenticated;grant select,insert,update on storage.objects to authenticated;`,
    );
    await db.exec(await readFile("supabase/setup_fresh_project.sql", "utf8"));
    await db.exec(
      await readFile("supabase/migrations/006_keepsakes.sql", "utf8"),
    );
    const c = "06092025-0000-4000-8000-000000000001",
      a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002",
      outsider = "10000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${outsider}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');set role authenticated;`,
    );
    const as = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await as(a);
    const personal = (
      await db.query<{ id: string }>(
        "insert into wishlists(type,title) values('personal','My wishes') returning id",
      )
    ).rows[0].id;
    const secret = (
      await db.query<{ id: string }>(
        "insert into wishlists(type,title) values('secret','Surprises') returning id",
      )
    ).rows[0].id;
    const wish = (
      await db.query<{ id: string }>(
        "insert into wishlist_items(list_id,title) values($1,'A thoughtful gift') returning id",
        [personal],
      )
    ).rows[0].id;
    await db.query(
      "insert into wishlist_items(list_id,title) values($1,'Never send this to my partner')",
      [secret],
    );
    await assert.rejects(
      db.query(
        "insert into wishlist_claims(item_id,status) values($1,'getting')",
        [wish],
      ),
      /row-level security/,
    );
    await as(b);
    assert.equal(
      (await db.query("select * from wishlists where id=$1", [secret])).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query("select * from wishlist_items where list_id=$1", [
          secret,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into wishlist_items(list_id,title) values($1,'Injected')",
        [secret],
      ),
      /row-level security/,
    );
    await db.query(
      "insert into wishlist_claims(item_id,status) values($1,'getting')",
      [wish],
    );
    assert.equal(
      (await db.query("select * from wishlist_claims")).rows.length,
      1,
    );
    await as(a);
    assert.equal(
      (await db.query("select * from wishlist_claims")).rows.length,
      0,
    );
    await db.query("update wishlist_claims set status='bought' where item_id=$1",[wish]);
    assert.equal((await db.query('select * from wishlist_claims')).rows.length,0);
    const nid = "20000000-0000-4000-8000-000000000001";
    await db.query(
      "select save_love_note($1,'Tomorrow','Sealed content',now()+interval '1 day','',null,null)",
      [nid],
    );
    await as(b);
    assert.equal(
      (await db.query("select * from note_contents")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select open_love_note($1)", [nid]),
      /still sealed/,
    );
    const openId = "20000000-0000-4000-8000-000000000002";
    await as(a);
    await db.query(
      "select save_love_note($1,'Open when','Private letter',null,'sad',null,null)",
      [openId],
    );
    await as(b);
    assert.equal(
      (await db.query("select * from note_contents")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ body: string }>("select (open_love_note($1)).body", [
          openId,
        ])
      ).rows[0].body,
      "Private letter",
    );
    await as(a);
    const path = `${c}/${a}/swap.webp`;
    await db.query("insert into storage.objects values('keepsakes',$1)", [
      path,
    ]);
    await db.query(
      "insert into memories(caption,image_path,swap_day) values('First private swap',$1,(now() at time zone 'Asia/Manila')::date)",
      [path],
    );
    await as(b);
    assert.equal((await db.query("select * from memories")).rows.length, 0);
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      0,
    );
    await db.query(
      "insert into memories(caption,swap_day) values('Second swap',(now() at time zone 'Asia/Manila')::date)",
    );
    assert.equal((await db.query("select * from memories")).rows.length, 2);
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      1,
    );
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/013_memory_album.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/013_memory_album.sql", "utf8"));
    await db.exec("set role authenticated");
    await as(a);
    const memoryId=(await db.query<{id:string}>("select id from memories where author=$1",[a])).rows[0].id;
    await db.query("update memories set caption='Edited caption',archived_at=now() where id=$1",[memoryId]);
    assert.equal((await db.query("select * from memories where id=$1",[memoryId])).rows.length,1);
    await as(b);
    assert.equal((await db.query("select * from memories where id=$1",[memoryId])).rows.length,0);
    assert.equal((await db.query("select * from storage.objects where name=$1",[path])).rows.length,0);
    await db.query("update memories set caption='Partner edit' where id=$1",[memoryId]);
    await assert.rejects(db.query("update memories set image_path='forged'"),/permission denied/);
    await as(a);
    assert.equal((await db.query<{caption:string}>("select caption from memories where id=$1",[memoryId])).rows[0].caption,"Edited caption");
    await db.query("update memories set archived_at=null where id=$1",[memoryId]);
    await as(b);
    assert.equal((await db.query("select * from memories where id=$1",[memoryId])).rows.length,1);
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/014_memory_social.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/014_memory_social.sql", "utf8"));
    await db.exec("set role authenticated");
    await as(b);
    await db.query("insert into memory_comments(memory_id,body) values($1,'Love this moment')",[memoryId]);
    await db.query("insert into memory_reactions(memory_id,kind) values($1,'heart')",[memoryId]);
    await assert.rejects(db.query("insert into memory_comments(memory_id,author,body) values($1,$2,'Forged')",[memoryId,a]),/row-level security/);
    await as(a);
    assert.equal((await db.query("select * from memory_comments")).rows.length,1);
    await db.query("delete from memory_reactions where memory_id=$1",[memoryId]);
    assert.equal((await db.query("select * from memory_reactions")).rows.length,1);
    await as(b);
    await db.query("delete from memory_reactions where memory_id=$1",[memoryId]);
    assert.equal((await db.query("select * from memory_reactions")).rows.length,0);
    await as(outsider);
    for (const table of [
      "wishlists",
      "wishlist_items",
      "wishlist_claims",
      "memories",
      "love_notes",
      "note_contents",
      "memory_comments",
      "memory_reactions",
    ])
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(
      db.query("select open_love_note($1)", [openId]),
      /unavailable/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select open_love_note($1)", [openId]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Notification preferences and device tokens remain private through direct queries", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;`,
    );
    await db.exec(await readFile("supabase/setup_fresh_project.sql", "utf8"));
    await db.exec(
      await readFile("supabase/migrations/007_installation.sql", "utf8"),
    );
    const a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002",
      o = "10000000-0000-4000-8000-000000000003",
      c = "06092025-0000-4000-8000-000000000001";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${o}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');set role authenticated;`,
    );
    const as = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await as(a);
    await db.exec(
      `insert into notification_preferences(enabled) values(true);insert into push_devices(platform,token,device_key) values('android','private-device-token-123456','test-phone');`,
    );
    await as(b);
    assert.equal((await db.query("select * from push_devices")).rows.length, 0);
    assert.equal(
      (await db.query("select * from notification_preferences")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into notification_preferences(user_id) values($1)", [a]),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query("update push_devices set token=$1 returning id", [
          "replacement-private-token-123456",
        ])
      ).rows.length,
      0,
    );
    await as(o);
    await assert.rejects(
      db.exec("insert into notification_preferences default values"),
      /row-level security/,
    );
    await assert.rejects(
      db.exec("select * from push_deliveries"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('fresh setup installs all stages together with first-run date and private account gates',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;
   create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;
   create publication supabase_realtime;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
   grant usage on schema auth,public,realtime,storage to authenticated;
   grant select,insert,update on storage.objects to authenticated;`);
  await db.exec(await readFile('supabase/setup_fresh_project.sql','utf8'));
  const couple='06092025-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000001',partner='10000000-0000-4000-8000-000000000002',outsider='10000000-0000-4000-8000-000000000003';
  assert.equal((await db.query<{anniversary:null}>('select anniversary from couples')).rows[0].anniversary,null);
  await db.exec(`insert into auth.users values('${member}'),('${partner}'),('${outsider}');
   insert into profiles(id,couple_id,slot,name) values('${member}','${couple}',0,'Player 1');set role authenticated;`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
  await assert.rejects(db.query("select new_game('tic')"),/Both private accounts/);
  await db.exec(`reset role;insert into profiles(id,couple_id,slot,name) values('${partner}','${couple}',1,'Player 2');set role authenticated;`);
  await db.query("select set_anniversary('2025-09-06')");
  await db.query("select set_nickname('Chosen nickname')");
  const games=await db.query<{game:{id:string}}>("select to_jsonb(new_game('tic')) as game");
  assert.ok(games.rows[0].game.id);
  await db.query('insert into art_slots values($1,$2,$3,now())',[couple,'home-background',`${couple}/home-background.webp`]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
  assert.equal((await db.query('select * from games')).rows.length,0);
  assert.equal((await db.query('select * from art_slots')).rows.length,0);
  await assert.rejects(db.query("select set_nickname('Intruder')"),/invitation/);
 } finally {await db.close()}
});

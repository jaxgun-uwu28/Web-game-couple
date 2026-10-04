-- Fresh project only. Run this entire file ONCE in Supabase SQL Editor.
-- If a creation statement fails, the transaction rolls back. Do not run this on the old project.
-- Includes migrations 001, 002 and 003; do not run them separately afterward.
begin;
-- Run once in the Supabase SQL editor as project owner.
create table public.couples (id uuid primary key default gen_random_uuid(), anniversary date);
insert into public.couples(id) values ('06092025-0000-4000-8000-000000000001');
create table public.profiles (id uuid primary key references auth.users on delete cascade, couple_id uuid not null references public.couples, slot smallint not null check(slot in (0,1)), name text not null check(length(name) between 1 and 40), color text not null default '#344f3f' check(color ~ '^#[0-9a-fA-F]{6}$'), nickname text not null default '' check(length(nickname)<=60), unique(couple_id,slot));
create function public.my_couple() returns uuid language sql stable security definer set search_path=public as $$ select couple_id from profiles where id=auth.uid() $$;
create function public.my_slot() returns smallint language sql stable security definer set search_path=public as $$ select slot from profiles where id=auth.uid() $$;
create table public.games (id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples,kind text not null check(kind in ('tic','connect','draw','know','trivia')),state jsonb not null,created_at timestamptz not null default now());
create table public.game_answers (game_id uuid references public.games on delete cascade,round int not null,user_id uuid references public.profiles,answer jsonb not null, primary key(game_id,round,user_id));
create table public.game_secrets(game_id uuid primary key references public.games on delete cascade, word text not null);
create table public.entries (id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples,author uuid not null references public.profiles,kind text not null check(kind in ('bucket','movies','restaurants','dates','notes','doodle','stroke')),body jsonb not null,done boolean not null default false,created_at timestamptz not null default now());
create table public.answers (couple_id uuid references public.couples,day date not null,kind text not null check(kind in ('daily','choice')),user_id uuid references public.profiles,answer text not null check(length(answer) between 1 and 2000),primary key(couple_id,day,kind,user_id));
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_answers enable row level security;
alter table public.game_secrets enable row level security;
alter table public.entries enable row level security;
alter table public.answers enable row level security;
create policy couple_read on public.couples for select to authenticated using(id=public.my_couple());
create policy profile_read on public.profiles for select to authenticated using(couple_id=public.my_couple());
create policy game_read on public.games for select to authenticated using(couple_id=public.my_couple());
create policy entry_read on public.entries for select to authenticated using(couple_id=public.my_couple());
-- No direct write policies and no answer read policies. Only validated functions below.
create function public.new_game(k text) returns public.games language plpgsql security definer set search_path=public as $$
declare g games; s jsonb; c uuid:=my_couple();
begin
 if c is null then raise exception 'Your private couple invitation is required.'; end if;
 if k not in ('tic','connect','draw','know','trivia') then raise exception 'Unknown game'; end if;
 perform pg_advisory_xact_lock(hashtext(c::text||k));
 select * into g from games where couple_id=c and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g; end if;
 s:=jsonb_build_object('status','playing','turn',0,'round',0,'scores',jsonb_build_array(0,0),'winner',null);
 if k in ('tic','connect') then s:=s||jsonb_build_object('board',(select jsonb_agg(0) from generate_series(1,case when k='tic' then 9 else 42 end))); end if;
 if k='draw' then s:=s||jsonb_build_object('artist',(select count(*)%2 from games where couple_id=c and kind='draw'),'guesses','[]'::jsonb); end if;
 insert into games(couple_id,kind,state) values(c,k,s) returning * into g;
 if k='draw' then insert into game_secrets values(g.id,(array['cat','sushi','car','bread','moon','dog'])[floor(random()*6)::int+1]); end if;
 return g;
end $$;
create function public.play_game(gid uuid,action jsonb) returns public.games language plpgsql security definer set search_path=public as $$
declare g games; s jsonb; p int:=my_slot(); b jsonb; idx int; col int; rr int; cc int; dr int; dc int; n int; v int; won boolean:=false; fullboard boolean; a0 jsonb; a1 jsonb; r int; scores jsonb; correct text;
begin
 select * into g from games where id=gid and couple_id=my_couple() for update;
 if not found or p is null then raise exception 'Game unavailable'; end if;
 s:=g.state; if s->>'status'<>'playing' then raise exception 'This game has finished'; end if;
 if g.kind in ('tic','connect') then
  if (s->>'turn')::int<>p then raise exception 'Wait for your turn'; end if;
  b:=s->'board'; idx:=(action->>'cell')::int;
  if g.kind='connect' then
   col:=idx; if col<0 or col>6 or col is null then raise exception 'Choose a column'; end if; idx:=-1;
   for rr in reverse 5..0 loop if (b->>(rr*7+col))::int=0 then idx:=rr*7+col; exit; end if; end loop;
  end if;
  if idx is null or idx<0 or idx>=jsonb_array_length(b) or (b->>idx)::int<>0 then raise exception 'Choose an empty space'; end if;
  b:=jsonb_set(b,array[idx::text],to_jsonb(p+1));
  col:=case when g.kind='tic' then 3 else 7 end; n:=case when g.kind='tic' then 3 else 4 end;
  for rr in 0..(jsonb_array_length(b)/col-1) loop for cc in 0..(col-1) loop
   for dr in 0..1 loop for dc in -1..1 loop
    if (dr<>0 or dc=1) and rr+(n-1)*dr<jsonb_array_length(b)/col and cc+(n-1)*dc between 0 and col-1 then
     won:=true; for v in 0..(n-1) loop if (b->>((rr+v*dr)*col+cc+v*dc))::int<>p+1 then won:=false; exit; end if; end loop;
     if won then exit; end if;
    end if;
   end loop; if won then exit; end if; end loop; if won then exit; end if;
  end loop; if won then exit; end if; end loop;
  select not exists(select 1 from jsonb_array_elements_text(b) x where x='0') into fullboard;
  s:=s||jsonb_build_object('board',b,'turn',1-p,'status',case when won then 'won' when fullboard then 'draw' else 'playing' end,'winner',case when won then p else null end);
 elsif g.kind='draw' then
  if p=(s->>'artist')::int then raise exception 'The artist cannot guess'; end if;
  select word into correct from game_secrets where game_id=gid;
  if coalesce(length(action->>'guess'),0) not between 1 and 60 then raise exception 'Write a short guess'; end if;
  if jsonb_array_length(s->'guesses')>=30 then s:=jsonb_set(s,'{guesses}','[]'::jsonb); end if;
  s:=s||jsonb_build_object('guesses',(s->'guesses')||jsonb_build_array(left(action->>'guess',60)));
  if lower(trim(action->>'guess'))=correct then s:=s||jsonb_build_object('status','won','winner',p,'word',correct); end if;
 else
  r:=(s->>'round')::int;
  if g.kind='trivia' and coalesce(action->>'answer','') not in ('0','1','2','3') then raise exception 'Choose an answer'; end if;
  if g.kind='know' and (coalesce(action->>'self','') not in ('0','1','2','3') or coalesce(action->>'guess','') not in ('0','1','2','3')) then raise exception 'Answer both questions'; end if;
  if exists(select 1 from game_answers where game_id=gid and round=r and user_id=auth.uid()) then raise exception 'Your answer is already sealed'; end if;
  insert into game_answers values(gid,r,auth.uid(),action) on conflict do nothing;
  select a.answer into a0 from game_answers a join profiles p on p.id=a.user_id where a.game_id=gid and a.round=r and p.slot=0;
  select a.answer into a1 from game_answers a join profiles p on p.id=a.user_id where a.game_id=gid and a.round=r and p.slot=1;
  if a0 is not null and a1 is not null then
   scores:=s->'scores';
   if g.kind='trivia' then correct:=(array['1','2','0','3','1'])[r+1];
    scores:=jsonb_build_array((scores->>0)::int+case when a0->>'answer'=correct then 1 else 0 end,(scores->>1)::int+case when a1->>'answer'=correct then 1 else 0 end);
   else scores:=jsonb_build_array((scores->>0)::int+case when a0->>'guess'=a1->>'self' then 1 else 0 end,(scores->>1)::int+case when a1->>'guess'=a0->>'self' then 1 else 0 end); end if;
   s:=s||jsonb_build_object('scores',scores,'round',r+1,'last',jsonb_build_object('answers',jsonb_build_array(a0,a1),'correct',correct),'submitted','[]'::jsonb);
   if r=4 then s:=s||jsonb_build_object('status',case when scores->>0=scores->>1 then 'draw' else 'won' end,'winner',case when (scores->>0)::int>(scores->>1)::int then 0 when (scores->>1)::int>(scores->>0)::int then 1 else null end); end if;
  else s:=s||jsonb_build_object('submitted',coalesce(s->'submitted','[]'::jsonb)||to_jsonb(p)); end if;
 end if;
 update games set state=s where id=gid returning * into g; return g;
end $$;
create function public.drawing_word(gid uuid) returns text language plpgsql security definer set search_path=public as $$
declare g games;
begin select * into g from games where id=gid and couple_id=my_couple(); if g.kind<>'draw' or (g.state->>'artist')::int<>my_slot() then return null; end if; return (select word from game_secrets where game_id=gid); end $$;
create function public.save_entry(k text,content jsonb,eid uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple(); g games;
begin
 if c is null then raise exception 'Sign in to your invitation'; end if;
 if eid is not null then
  if k='delete' then delete from entries where id=eid and couple_id=c; else update entries set done=not done where id=eid and couple_id=c; end if; return;
 end if;
 if k not in ('bucket','movies','restaurants','dates','notes','doodle','stroke') or octet_length(content::text)>18000 then raise exception 'Invalid entry'; end if;
 if k in ('doodle','stroke') then
  if coalesce(jsonb_typeof(content->'points'),'')<>'array' or jsonb_array_length(content->'points') not between 1 and 500 or coalesce(content->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid stroke'; end if;
  if exists(select 1 from jsonb_array_elements(content->'points') p where jsonb_typeof(p)<>'array' or jsonb_array_length(p)<>2 or jsonb_typeof(p->0)<>'number' or jsonb_typeof(p->1)<>'number' or (p->>0)::numeric not between 0 and 1 or (p->>1)::numeric not between 0 and 1) then raise exception 'Invalid coordinates'; end if;
  if k='stroke' then select * into g from games where id=(content->>'game')::uuid and couple_id=c; if not found or g.kind<>'draw' or g.state->>'status'<>'playing' or (g.state->>'artist')::int<>my_slot() then raise exception 'Only the current artist can draw'; end if; end if;
 else if coalesce(length(trim(content->>'text')),0) not between 1 and 2000 then raise exception 'Write something first'; end if; end if;
 insert into entries(couple_id,author,kind,body) values(c,auth.uid(),k,content);
end $$;
create function public.answer_today(k text,content text) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_couple() is null or k is null or k not in ('daily','choice') or coalesce(length(trim(content)),0) not between 1 and 2000 then raise exception 'Invalid answer'; end if;
 if k='choice' and content not in ('0','1') then raise exception 'Choose one option'; end if;
 insert into answers values(my_couple(),(now() at time zone 'Asia/Manila')::date,k,auth.uid(),trim(content)) on conflict do nothing;
end $$;
create function public.today_answers() returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; d date:=(now() at time zone 'Asia/Manila')::date; streak int:=0; daycheck date; matches int; total int;
begin
 select jsonb_build_object('day',d,'daily',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'answer',case when a.user_id=auth.uid() or (select count(*) from answers b where b.couple_id=my_couple() and b.day=d and b.kind='daily')=2 then a.answer else null end)) from answers a where a.couple_id=my_couple() and a.day=d and a.kind='daily'),'[]'::jsonb),'choice',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'answer',case when a.user_id=auth.uid() or (select count(*) from answers b where b.couple_id=my_couple() and b.day=d and b.kind='choice')=2 then a.answer else null end)) from answers a where a.couple_id=my_couple() and a.day=d and a.kind='choice'),'[]'::jsonb)) into result;
 daycheck:=d; if (select count(*) from answers where couple_id=my_couple() and day=d and kind='daily')<2 then daycheck:=d-1; end if;
 while (select count(*) from answers where couple_id=my_couple() and day=daycheck and kind='daily')=2 loop streak:=streak+1; daycheck:=daycheck-1; end loop;
 select count(*),count(*) filter(where lo=hi) into total,matches from (select min(answer) lo,max(answer) hi from answers where couple_id=my_couple() and kind='choice' group by day having count(*)=2) t;
 return result||jsonb_build_object('streak',streak,'matches',matches,'total',total);
end $$;
create function public.update_profile(n text,c text,nick text) returns void language plpgsql security definer set search_path=public as $$ begin update profiles set name=trim(n),color=c,nickname=nick where id=auth.uid(); end $$;
create function public.scoreboard() returns jsonb language sql stable security definer set search_path=public as $$ select jsonb_build_array(count(*) filter(where state->>'winner'='0'),count(*) filter(where state->>'winner'='1')) from games where couple_id=my_couple() and state->>'status'='won' $$;
-- Private channel authorization. Public channels are disabled in project Realtime settings.
create policy arcade_realtime_read on realtime.messages for select to authenticated using(realtime.topic()='couple:'||public.my_couple()::text);
create policy arcade_realtime_write on realtime.messages for insert to authenticated with check(realtime.topic()='couple:'||public.my_couple()::text);
alter publication supabase_realtime add table public.games,public.entries,public.profiles;
-- SECURITY DEFINER functions have explicit grants; anonymous calls are denied.
revoke execute on function public.my_couple(),public.my_slot(),public.new_game(text),public.play_game(uuid,jsonb),public.drawing_word(uuid),public.save_entry(text,jsonb,uuid),public.answer_today(text,text),public.today_answers(),public.update_profile(text,text,text),public.scoreboard() from public,anon;
grant execute on function public.my_couple(),public.my_slot(),public.new_game(text),public.play_game(uuid,jsonb),public.drawing_word(uuid),public.save_entry(text,jsonb,uuid),public.answer_today(text,text),public.today_answers(),public.update_profile(text,text,text) to authenticated;
grant select on public.couples,public.profiles,public.games,public.entries to authenticated;
grant execute on function public.scoreboard() to authenticated;


-- After migration 001. Preserve existing date; new couples require setup.
alter table public.couples alter column anniversary drop default;
alter table public.couples alter column anniversary drop not null;
create function public.set_anniversary(value date) returns void language plpgsql security definer set search_path=public as $$ begin
 if my_couple() is null then raise exception 'Your private invitation is required'; end if;
 if value is null or value>current_date or value<'1900-01-01' then raise exception 'Choose a past or current anniversary date'; end if;
 update couples set anniversary=value where id=my_couple(); end $$;
revoke execute on function public.set_anniversary(date) from public,anon;
grant execute on function public.set_anniversary(date) to authenticated;
create table public.art_slots(couple_id uuid references public.couples on delete cascade,slot text not null check(slot ~ '^[a-z0-9-]{1,80}$'),path text not null,updated_at timestamptz not null default now(),primary key(couple_id,slot),check(path=couple_id::text||'/'||slot||'.webp'));
alter table public.art_slots enable row level security;
create policy art_read on public.art_slots for select to authenticated using(couple_id=my_couple());
create policy art_write on public.art_slots for insert to authenticated with check(couple_id=my_couple());
create policy art_update on public.art_slots for update to authenticated using(couple_id=my_couple()) with check(couple_id=my_couple());
grant select,insert,update on public.art_slots to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('app-art','app-art',false,10485760,array['image/webp']) on conflict(id) do nothing;
create policy app_art_read on storage.objects for select to authenticated using(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text);
create policy app_art_insert on storage.objects for insert to authenticated with check(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text and name ~ '^[0-9a-f-]+/[a-z0-9-]+\.webp$');
create policy app_art_update on storage.objects for update to authenticated using(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text) with check(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text);
alter publication supabase_realtime add table public.art_slots,public.couples;
create policy stage_one_channel_read on realtime.messages for select to authenticated
 using (realtime.topic() in ('art:'||my_couple()::text,'anniversary:'||my_couple()::text));


-- After 001 and 002. Keep existing account linkage and saved games.
alter table public.profiles alter column color set default '#9d304f';
create function public.set_nickname(value text) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_couple() is null then raise exception 'Your private couple invitation is required'; end if;
 if value is null or length(trim(value))>40 then raise exception 'Use a nickname of 40 characters or fewer'; end if;
 update profiles set nickname=trim(value) where id=auth.uid();
end $$;
revoke execute on function public.set_nickname(text) from public,anon;
grant execute on function public.set_nickname(text) to authenticated;

create or replace function public.new_game(k text) returns public.games language plpgsql security definer set search_path=public as $$
declare g games; s jsonb; c uuid:=my_couple();
begin
 if c is null then raise exception 'Your private couple invitation is required'; end if;
 if k not in ('tic','connect','draw','know','trivia') or k is null then raise exception 'Unknown game'; end if;
 if (select count(*) from profiles where couple_id=c)<>2 then raise exception 'Both private accounts must be linked before playing'; end if;
 perform pg_advisory_xact_lock(hashtext(c::text||k));
 select * into g from games where couple_id=c and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g; end if;
 s:=jsonb_build_object('status','playing','turn',0,'round',0,'scores',jsonb_build_array(0,0),'winner',null);
 if k in ('tic','connect') then s:=s||jsonb_build_object('board',(select jsonb_agg(0) from generate_series(1,case when k='tic' then 9 else 42 end))); end if;
 if k='draw' then s:=s||jsonb_build_object('artist',(select count(*)%2 from games where couple_id=c and kind='draw'),'guesses','[]'::jsonb); end if;
 insert into games(couple_id,kind,state) values(c,k,s) returning * into g;
 if k='draw' then insert into game_secrets values(g.id,(array['cloud','flower','boat','star','moon','bird'])[floor(random()*6)::int+1]); end if;
 return g;
end $$;

notify pgrst,'reload schema';
commit;

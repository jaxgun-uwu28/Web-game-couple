-- Run after 009. Only the two private members can join; all writes use RPCs.
begin;
create table brain_lobbies (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references couples,
 host_id uuid not null references profiles, topic text not null default 'Surprise Mix',
 difficulty text not null default 'Medium' check(difficulty in ('Easy','Medium','Hard')),
 count int not null default 5 check(count in(3,5,10)),
 status text not null default 'waiting', members jsonb not null default '{}', game_id uuid references games,
 updated_at timestamptz not null default now(), unique(couple_id)
);
alter table brain_lobbies enable row level security;
revoke all on brain_lobbies from anon,authenticated;
grant all on brain_lobbies to service_role;
create function brain_present(m jsonb) returns boolean language sql stable set search_path=public as $$
 select count(*)=2 and bool_and((value->>'seen')::timestamptz>now()-interval '20 seconds' and coalesce((value->>'ready')::boolean,false)) from jsonb_each(m)
$$;
create function brain_lobby(op text,options jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare l brain_lobbies; u uuid:=auth.uid(); c uuid:=my_couple(); v jsonb; g games;
begin
 if c is null or u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'brain-lobby'));
 select * into l from brain_lobbies where couple_id=c for update;
 if l.game_id is not null then
  select * into g from games where id=l.game_id;
  if g.state->>'status'<>'playing' then update brain_lobbies set status='finished' where id=l.id returning * into l;end if;
 end if;
 if op='create' and (l.id is null or l.status in('finished','cancelled')) then
  insert into brain_lobbies(couple_id,host_id) values(c,u) on conflict(couple_id) do update set id=gen_random_uuid(),host_id=u,topic='Surprise Mix',difficulty='Medium',count=5,status='waiting',members='{}',game_id=null returning * into l;
  -- Retire legacy and abandoned matches so they cannot bypass the lobby.
  update games set state=state||jsonb_build_object('status','cancelled') where couple_id=c and kind='trivia' and state->>'status'='playing';
 end if;
 if l.id is null then return null;end if;
 if op in('create','join','heartbeat') then
  if op='heartbeat' and not (l.members ? u::text) then raise exception 'Join the lobby first';end if;
  v:=coalesce(l.members->u::text,'{"ready":false}'::jsonb);
  if coalesce((v->>'seen')::timestamptz,'epoch')<now()-interval '20 seconds' then v:=v||'{"ready":false}'::jsonb;end if;
  l.members:=jsonb_set(l.members,array[u::text],v||jsonb_build_object('seen',now()),true);
 elsif op='configure' then
  if l.host_id<>u or l.status<>'waiting' then raise exception 'Only the lobby host can configure this duel';end if;
  if options->>'difficulty' not in('Easy','Medium','Hard') or (options->>'count')::int not in(3,5,10) or length(trim(options->>'topic')) not between 1 and 40 then raise exception 'Choose a topic, difficulty and question count';end if;
  l.topic:=trim(options->>'topic');l.difficulty:=options->>'difficulty';l.count:=(options->>'count')::int;
  select coalesce(jsonb_object_agg(key,value||'{"ready":false}'::jsonb),'{}') into l.members from jsonb_each(l.members);
 elsif op='ready' then
  if l.status not in('waiting','playing') or not(l.members ? u::text) then raise exception 'Join the waiting lobby first';end if;
  l.members:=jsonb_set(l.members,array[u::text],jsonb_build_object('seen',now(),'ready',coalesce((options->>'ready')::boolean,true)),true);
 elsif op='begin' then
  if l.host_id<>u or l.status<>'waiting' then raise exception 'Only the host can start a waiting duel';end if;
  if not brain_present(l.members) then raise exception 'Both players must be here and ready';end if;
  l.status:='preparing';
 elsif op='reset' then
  if l.host_id<>u then raise exception 'Only the host can retry';end if;
  if l.status='preparing' then l.status:='waiting';end if;
 elsif op='leave' then
  l.members:=l.members-u::text;
  if l.status='preparing' then l.status:='waiting';end if;
 elsif op<>'inspect' then raise exception 'Unknown lobby action';end if;
 if l.status='preparing' and l.updated_at<now()-interval '30 seconds' then l.status:='waiting';end if;
 update brain_lobbies set topic=l.topic,difficulty=l.difficulty,count=l.count,status=l.status,members=l.members,updated_at=case when op in('heartbeat','inspect') then updated_at else now() end where id=l.id returning * into l;
 return to_jsonb(l)||jsonb_build_object('bothReady',brain_present(l.members),'serverTime',now(),'game',case when l.status in('playing','finished') then to_jsonb(g) else null end);
end $$;
revoke execute on function brain_lobby(text,jsonb),brain_present(jsonb) from public,anon;
grant execute on function brain_lobby(text,jsonb) to authenticated;

-- The service may generate a pack only after host authorization, then must recheck presence.
alter function ai_start_duel(uuid,text,int,text,uuid) rename to ai_start_duel_pre_lobby;
revoke execute on function ai_start_duel_pre_lobby(uuid,text,int,text,uuid) from public,anon,authenticated,service_role;
-- Extend the old, private writer's difficulty validation and use AI banks only.
do $$ declare s text;begin
 select pg_get_functiondef('ai_start_duel_pre_lobby(uuid,text,int,text,uuid)'::regprocedure) into s;
 s:=replace(s,'''Easy'',''Easy-Medium''','''Easy'',''Medium'',''Hard''');
 s:=replace(s,'(b.difficulty=d or b.source=''fallback'')','b.difficulty=d and b.source in(''ai'',''mock'')');execute s;
end $$;
create function ai_start_duel(c uuid,t text,n int,d text,lease uuid) returns games language plpgsql security definer set search_path=public as $$
declare l brain_lobbies;g games;begin
 select * into l from brain_lobbies where couple_id=c for update;
 if l.status<>'preparing' or l.topic<>t or l.count<>n or l.difficulty<>d or not brain_present(l.members) then raise exception 'Both players must stay in the lobby and ready';end if;
 g:=ai_start_duel_pre_lobby(c,t,n,d,lease);
 update brain_lobbies set game_id=g.id,status='playing',updated_at=now() where id=l.id;return g;
end $$;
alter function play_game(uuid,jsonb) rename to play_game_pre_lobby;
revoke execute on function play_game_pre_lobby(uuid,jsonb) from public,anon,authenticated;
create function play_game(gid uuid,action jsonb) returns games language plpgsql security definer set search_path=public as $$
declare g games; l brain_lobbies;begin
 select * into g from games where id=gid and couple_id=my_couple();
 if g.kind='trivia' then
  select * into l from brain_lobbies where game_id=gid and couple_id=my_couple() for update;
  if l.id is null or l.status<>'playing' or not brain_present(l.members) then raise exception 'Waiting for both players to return to the duel';end if;
 end if;
 return play_game_pre_lobby(gid,action);
end $$;
create or replace function new_game(k text) returns games language plpgsql security definer set search_path=public as $$ begin
 if k='trivia' then raise exception 'Join the Brain Duel lobby first';end if;return new_game_pre_ai(k);end $$;
revoke execute on function ai_start_duel(uuid,text,int,text,uuid),play_game(uuid,jsonb),new_game(text) from public,anon;
revoke execute on function ai_start_duel(uuid,text,int,text,uuid) from authenticated;
grant execute on function ai_start_duel(uuid,text,int,text,uuid) to service_role;
grant execute on function play_game(uuid,jsonb),new_game(text) to authenticated;

-- Upgrade saved daily packs at most once an hour; never replace a sealed day's prompt.
create function ai_content_claim(c uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid;begin
 insert into generation_jobs(couple_id,kind,topic) values(c,'content','monthly') on conflict(couple_id,kind,topic) do update set token=gen_random_uuid(),status='running',lease_until=now()+interval '20 seconds',updated_at=now() where generation_jobs.updated_at<now()-interval '1 hour' returning token into result;return result;end $$;
alter function answer_today(text,text) rename to answer_today_pre_upgrade;
revoke execute on function answer_today_pre_upgrade(text,text) from public,anon,authenticated;
create function answer_today(k text,content text) returns void language plpgsql security definer set search_path=public as $$ begin
 perform 1 from couples where id=my_couple() for update;perform answer_today_pre_upgrade(k,content);end $$;
create function ai_promote_content(c uuid,ds jsonb,ws jsonb) returns void language plpgsql security definer set search_path=public as $$ begin
 perform 1 from couples where id=c for update;
 insert into daily_questions select c,x.date,x.text,x.mood,x.hash,x.source from jsonb_to_recordset(ds) x(date date,text text,mood text,hash text,source text)
 on conflict(couple_id,date) do update set text=excluded.text,mood=excluded.mood,hash=excluded.hash,source=excluded.source
 where daily_questions.source<>'ai' and excluded.source='ai' and not exists(select 1 from answers where couple_id=c and day=excluded.date and kind='daily');
 insert into would_you_rather select c,x.date,x.option_a,x.option_b,x.hash,x.source from jsonb_to_recordset(ws) x(date date,option_a text,option_b text,hash text,source text)
 on conflict(couple_id,date) do update set option_a=excluded.option_a,option_b=excluded.option_b,hash=excluded.hash,source=excluded.source
 where would_you_rather.source<>'ai' and excluded.source='ai' and not exists(select 1 from answers where couple_id=c and day=excluded.date and kind='choice');
end $$;
revoke execute on function ai_content_claim(uuid),ai_promote_content(uuid,jsonb,jsonb),answer_today(text,text) from public,anon;
revoke execute on function ai_content_claim(uuid),ai_promote_content(uuid,jsonb,jsonb) from authenticated;
grant execute on function ai_content_claim(uuid),ai_promote_content(uuid,jsonb,jsonb) to service_role;
grant execute on function answer_today(text,text) to authenticated;
notify pgrst,'reload schema';
commit;

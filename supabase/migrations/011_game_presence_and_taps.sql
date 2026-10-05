-- Apply after 010. Fix board dispatch, require game-specific presence, allow art removal.
begin;
drop policy if exists art_delete on art_slots;
create policy art_delete on art_slots for delete to authenticated using(couple_id=my_couple());
grant delete on art_slots to authenticated;
drop policy if exists app_art_delete on storage.objects;
create policy app_art_delete on storage.objects for delete to authenticated using(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text);
create table if not exists game_presence(game_id uuid not null,kind text not null,user_id uuid not null references profiles,seen_at timestamptz not null default now(),primary key(game_id,kind,user_id));
alter table game_presence enable row level security;
revoke all on game_presence from anon,authenticated;
grant all on game_presence to service_role;
create or replace function expire_game_sessions(c uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 update games g set state=state||jsonb_build_object('status','cancelled') where g.couple_id=c and g.state->>'status'='playing' and exists(select 1 from game_presence p where p.game_id=g.id and p.kind=g.kind and p.seen_at<now()-interval '20 seconds');
 update block_matches m set status='cancelled',revision=revision+1 where m.couple_id=c and m.status in('waiting','playing') and exists(select 1 from game_presence p where p.game_id=m.id and p.kind='block' and p.seen_at<now()-interval '20 seconds');
 delete from game_presence p where exists(select 1 from games g where g.id=p.game_id and g.couple_id=c and g.state->>'status'='cancelled') or exists(select 1 from block_matches m where m.id=p.game_id and m.couple_id=c and m.status='cancelled');
end $$;
revoke execute on function expire_game_sessions(uuid) from public,anon,authenticated;
create or replace function game_pair_present(gid uuid,k text) returns boolean language sql stable security definer set search_path=public as $$
 select count(*)=2 from game_presence where game_id=gid and kind=k and seen_at>now()-interval '20 seconds'
$$;
create or replace function game_here(gid uuid,k text,leaving boolean default false) returns boolean language plpgsql security definer set search_path=public as $$ begin
 if my_couple() is null or not(case when k='block' then exists(select 1 from block_matches where id=gid and couple_id=my_couple()) else exists(select 1 from games where id=gid and kind=k and couple_id=my_couple()) end) then raise exception 'Game unavailable';end if;
 perform expire_game_sessions(my_couple());
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'game-here'));
 if leaving then
  if k='block' then update block_matches set status='cancelled',revision=revision+1 where id=gid and couple_id=my_couple() and status in('waiting','playing');
  else update games set state=state||jsonb_build_object('status','cancelled','cancelled_by',auth.uid()) where id=gid and couple_id=my_couple() and state->>'status'='playing';end if;
  delete from game_presence where game_id=gid and kind=k;
 else
  if k='block' then
   if not exists(select 1 from block_matches where id=gid and status in('waiting','playing')) then return false;end if;
  elsif not exists(select 1 from games where id=gid and state->>'status'='playing') then return false;end if;
  delete from game_presence where user_id=auth.uid() and (game_id<>gid or kind<>k);
  insert into game_presence(game_id,kind,user_id) values(gid,k,auth.uid()) on conflict(game_id,kind,user_id) do update set seen_at=now();
 end if;
 return game_pair_present(gid,k);
end $$;
create or replace function new_game(k text) returns games language plpgsql security definer set search_path=public as $$ begin
 perform expire_game_sessions(my_couple());
 if k='trivia' then raise exception 'Join the Brain Duel lobby first';end if;
 return new_game_pre_ai(k);
end $$;
-- Preserve the Brain Duel attendance gate as well as its private Gemini answer snapshots.
do $$ begin if to_regprocedure('public.start_block_battle_pre_presence(int)') is null then alter function start_block_battle(int) rename to start_block_battle_pre_presence; end if;end $$;
revoke execute on function start_block_battle_pre_presence(int) from public,anon,authenticated;
create or replace function start_block_battle(seconds int) returns jsonb language plpgsql security definer set search_path=public as $$ begin
 perform expire_game_sessions(my_couple());
 return start_block_battle_pre_presence(seconds);
end $$;
revoke execute on function start_block_battle(int) from public,anon;
grant execute on function start_block_battle(int) to authenticated;
create or replace function play_game(gid uuid,action jsonb) returns games language plpgsql security definer set search_path=public as $$
declare g games;l brain_lobbies;begin
 select * into g from games where id=gid and couple_id=my_couple();
 if not found then raise exception 'Game unavailable';end if;
 if g.kind='trivia' then
  select * into l from brain_lobbies where game_id=gid and couple_id=my_couple() for update;
  if l.id is null or l.status<>'playing' or not brain_present(l.members) then raise exception 'Waiting for both players to return to the duel';end if;
  return play_game_pre_lobby(gid,action);
 end if;
 if not game_pair_present(gid,g.kind) then raise exception 'Waiting for your person to join this game';end if;
 return play_game_pre_ai(gid,action);
end $$;
do $$ begin if to_regprocedure('public.block_battle_pre_presence(uuid,jsonb)') is null then alter function block_battle(uuid,jsonb) rename to block_battle_pre_presence; end if;end $$;
revoke execute on function block_battle_pre_presence(uuid,jsonb) from public,anon,authenticated;
create or replace function block_battle(gid uuid,action jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if action->>'type' in('ready','place') and not game_pair_present(gid,'block') then raise exception 'Waiting for your person to join this block battle';end if;
 return block_battle_pre_presence(gid,action);
end $$;
-- Exiting a Brain lobby cancels its shared game, even while Gemini is preparing.
do $$ declare def text;begin
 select pg_get_functiondef('brain_lobby(text,jsonb)'::regprocedure) into def;
 def:=replace(def,'l.members:=l.members-u::text;', 'l.members:=''{}''::jsonb;if l.status in(''waiting'',''preparing'',''playing'') then l.status:=''cancelled'';update games set state=state||jsonb_build_object(''status'',''cancelled'') where id=l.game_id and state->>''status''=''playing'';end if;');
 if strpos(def,'l.status=''cancelled'' and op=''heartbeat''')=0 then
 def:=replace(def,'if op=''create'' and', 'if l.status in(''waiting'',''preparing'',''playing'') and exists(select 1 from jsonb_each(l.members) where (value->>''seen'')::timestamptz<now()-interval ''20 seconds'') then l.status:=''cancelled'';l.members:=''{}''::jsonb;update games set state=state||jsonb_build_object(''status'',''cancelled'') where id=l.game_id and state->>''status''=''playing'';update brain_lobbies set status=l.status,members=l.members where id=l.id;end if;if l.status=''cancelled'' and op=''heartbeat'' then return to_jsonb(l)||jsonb_build_object(''bothReady'',false,''game'',null,''serverTime'',now());end if;if op=''create'' and');
 end if;
 execute def;
end $$;
-- Drawing strokes use their own RPC, so protect that write too.
do $$ begin if to_regprocedure('public.save_entry_pre_presence(text,jsonb,uuid)') is null then alter function save_entry(text,jsonb,uuid) rename to save_entry_pre_presence; end if;end $$;
revoke execute on function save_entry_pre_presence(text,jsonb,uuid) from public,anon,authenticated;
create or replace function save_entry(k text,content jsonb,eid uuid default null) returns void language plpgsql security definer set search_path=public as $$ begin
 if k='stroke' and not game_pair_present((content->>'game')::uuid,'draw') then raise exception 'Waiting for your person to join this drawing game';end if;
 perform save_entry_pre_presence(k,content,eid);
end $$;
alter table connection_taps add column if not exists message text not null default '' check(length(message)<=180);
create or replace function send_thinking_of_you(content text default '') returns void language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();p uuid;msg text:=trim(regexp_replace(coalesce(content,''),'[[:cntrl:]]',' ','g'));begin
 if c is null then raise exception 'Your private account is required';end if;
 if length(msg)>180 then raise exception 'Keep your message within 180 characters';end if;
 select id into p from profiles where couple_id=c and id<>auth.uid();
 if p is null then raise exception 'Both private accounts must be linked';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'thinking'));
 if exists(select 1 from connection_taps where sender=auth.uid() and created_at>clock_timestamp()-interval '60 seconds') then raise exception 'Wait a minute before sending another little tap';end if;
 insert into connection_taps(couple_id,sender,recipient,created_at,message) values(c,auth.uid(),p,clock_timestamp(),msg);
end $$;
create or replace function thinking_of_you() returns void language sql security definer set search_path=public as $$ select send_thinking_of_you('') $$;
revoke execute on function game_here(uuid,text,boolean),game_pair_present(uuid,text),play_game(uuid,jsonb),block_battle(uuid,jsonb),save_entry(text,jsonb,uuid),send_thinking_of_you(text) from public,anon;
revoke execute on function game_pair_present(uuid,text) from authenticated;
grant execute on function game_here(uuid,text,boolean),play_game(uuid,jsonb),block_battle(uuid,jsonb),save_entry(text,jsonb,uuid),send_thinking_of_you(text) to authenticated;
-- Abandoned matches do not earn completed-game rewards.
do $$ declare def text;begin
 select pg_get_functiondef('arcade_progress()'::regprocedure) into def;
 def:=replace(def,'state->>''status''<>''playing''','state->>''status'' in (''won'',''draw'')');execute def;
end $$;
notify pgrst,'reload schema';
commit;

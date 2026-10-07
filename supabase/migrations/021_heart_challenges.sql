begin;
create table if not exists heart_challenges (
 id uuid primary key references block_matches(id) on delete cascade,
 couple_id uuid not null references couples(id), host uuid not null references profiles(id),
 status text not null default 'invited' check(status in('invited','accepted','declined','closed')),
 created_at timestamptz not null default now()
);
alter table heart_challenges add column if not exists last_seen jsonb not null default '{}';
alter table heart_challenges enable row level security;
drop policy if exists heart_invite_read on heart_challenges;
create policy heart_invite_read on heart_challenges for select to authenticated using(couple_id=my_couple());
grant select on heart_challenges to authenticated;
grant all on heart_challenges to service_role;
do $$ begin
 if to_regprocedure('public.start_heartblast_base(jsonb)') is null then alter function start_heartblast(jsonb) rename to start_heartblast_base;end if;
 if to_regprocedure('public.heartblast_battle_base(uuid,jsonb)') is null then alter function heartblast_battle(uuid,jsonb) rename to heartblast_battle_base;end if;
end $$;
revoke execute on function start_heartblast_base(jsonb),heartblast_battle_base(uuid,jsonb) from public,anon,authenticated;
create or replace function start_heartblast(config jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; m block_matches;begin
 r:=start_heartblast_base(config);select * into m from block_matches where id=(r->'match'->>'id')::uuid;
 if m.state->'options'->>'mode'<>'daily' and m.status='waiting' then
 insert into heart_challenges(id,couple_id,host) values(m.id,m.couple_id,auth.uid()) on conflict do nothing;end if;
 return r||jsonb_build_object('challenge',(select to_jsonb(h) from heart_challenges h where h.id=m.id));
end $$;
create or replace function heartblast_battle(gid uuid,action jsonb default '{"type":"get"}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m block_matches;h heart_challenges;r jsonb;peer_seen timestamptz; own_seen timestamptz; a text:=action->>'type';begin
 select * into m from block_matches where id=gid and couple_id=my_couple() for update;
 if not found then raise exception 'Game unavailable';end if;
 select * into h from heart_challenges where id=gid for update;
 select greatest((select max(seen_at) from game_presence where game_id=gid and kind='block' and user_id<>auth.uid()),(select max(value::timestamptz) from jsonb_each_text(coalesce(h.last_seen,'{}')) where key<>auth.uid()::text)) into peer_seen;
 select max(seen_at) into own_seen from game_presence where game_id=gid and kind='block' and user_id=auth.uid();
 if a in('accept','decline') then
  if h.id is null or h.host=auth.uid() or h.status<>'invited' then raise exception 'Challenge unavailable';end if;
  update heart_challenges set status=case when a='accept' then 'accepted' else 'declined' end where id=gid;
  if a='decline' then update block_matches set status='cancelled',revision=revision+1 where id=gid;delete from game_presence where game_id=gid;end if;
  action:='{"type":"get"}';
 elsif a in('ready','place','out') and h.id is not null and h.status<>'accepted' then raise exception 'Partner must accept the challenge first';
 elsif a='claim' then
  if m.status<>'playing' or m.state->'options'->>'mode' in('endless','daily') or own_seen is null or own_seen<clock_timestamp()-interval '20 seconds' or peer_seen is null or peer_seen>clock_timestamp()-interval '60 seconds' or (m.ends_at is not null and m.ends_at<clock_timestamp()) then raise exception 'Reconnect grace is still active';end if;
  update block_matches set status='won',winner=my_slot(),revision=revision+1 where id=gid;
  delete from game_presence where game_id=gid;action:='{"type":"get"}';
 end if;
 r:=heartblast_battle_base(gid,action);
 if r->'match'->>'status' in('won','draw','cancelled') then update heart_challenges set status='closed' where id=gid and status in('invited','accepted');end if;
 return r||jsonb_build_object('challenge',(select to_jsonb(x) from heart_challenges x where x.id=gid),'peer_seen_at',peer_seen);
end $$;
revoke execute on function start_heartblast(jsonb),heartblast_battle(uuid,jsonb) from public,anon;
grant execute on function start_heartblast(jsonb),heartblast_battle(uuid,jsonb) to authenticated;
create or replace function expire_game_sessions(c uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 update games g set state=state||jsonb_build_object('status','cancelled') where g.couple_id=c and g.state->>'status'='playing' and exists(select 1 from game_presence p where p.game_id=g.id and p.kind=g.kind and p.seen_at<now()-interval '20 seconds');
 update block_matches m set status='cancelled',revision=revision+1 where m.couple_id=c and m.status in('waiting','playing') and m.state->'options' is null and exists(select 1 from game_presence p where p.game_id=m.id and p.kind='block' and p.seen_at<now()-interval '20 seconds');
 delete from game_presence p where exists(select 1 from games g where g.id=p.game_id and g.couple_id=c and g.state->>'status'='cancelled') or exists(select 1 from block_matches m where m.id=p.game_id and m.couple_id=c and m.status='cancelled');
end $$;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='heart_challenges') then alter publication supabase_realtime add table heart_challenges;end if;end $$;
do $$ begin if to_regprocedure('public.game_here_pre_heart_grace(uuid,text,boolean)') is null then alter function game_here(uuid,text,boolean) rename to game_here_pre_heart_grace;end if;end $$;
revoke execute on function game_here_pre_heart_grace(uuid,text,boolean) from public,anon,authenticated;
create or replace function game_here(gid uuid,k text,leaving boolean default false) returns boolean language plpgsql security definer set search_path=public as $$declare paired boolean;begin
 paired:=game_here_pre_heart_grace(gid,k,leaving);
 if k='block' then update heart_challenges set last_seen=case when leaving then last_seen else jsonb_set(last_seen,array[auth.uid()::text],to_jsonb(clock_timestamp())) end,status=case when leaving then 'closed' else status end where id=gid and couple_id=my_couple();end if;return paired;
end $$;
revoke execute on function game_here(uuid,text,boolean) from public,anon;grant execute on function game_here(uuid,text,boolean) to authenticated;
commit;

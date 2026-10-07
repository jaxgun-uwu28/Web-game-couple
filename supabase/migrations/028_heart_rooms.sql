-- Room entry plus Ready replaces challenge acceptance. Preserve reconnect checks.
begin;
create or replace function start_heartblast(config jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; m block_matches;begin
 r:=start_heartblast_base(config);select * into m from block_matches where id=(r->'match'->>'id')::uuid;
 if m.state->'options'->>'mode'<>'daily' and m.status='waiting' then
 insert into heart_challenges(id,couple_id,host,status) values(m.id,m.couple_id,auth.uid(),'accepted') on conflict do nothing;end if;
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
 elsif a='ready' and h.status='invited' then update heart_challenges set status='accepted' where id=gid;
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

update heart_challenges set status='accepted' where status='invited';
commit;

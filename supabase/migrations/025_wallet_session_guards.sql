begin;
do $$ begin if to_regprocedure('public.create_plugin_match_before_wallet_guard(uuid,uuid,text,jsonb,bigint,jsonb)') is null then alter function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) rename to create_plugin_match_before_wallet_guard;end if;end $$;
create or replace function create_plugin_match(mid uuid,uid uuid,gid text,cfg jsonb,match_seed bigint,engine jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare cid uuid;begin
 if gid in('ledger','blackjack') then
 select couple_id into cid from profiles where id=uid;
 perform pg_advisory_xact_lock(hashtext(cid::text||'wallet-games'));
 if exists(select 1 from arcade_matches where couple_id=cid and game_id in('ledger','blackjack') and game_id<>gid and status in('invited','waiting','playing')) then raise exception 'Finish your current wallet game first';end if;
 end if;
 return create_plugin_match_before_wallet_guard(mid,uid,gid,cfg,match_seed,engine);
end $$;
revoke execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) to service_role;
create or replace function reset_ledger_wallets(amount int default 10) returns void language plpgsql security definer set search_path=public as $$begin
 if my_couple() is null or amount not in(10,20,50) then raise exception 'Choose a starting balance';end if;
 perform pg_advisory_xact_lock(hashtext(my_couple()::text||'wallet-games'));
 if exists(select 1 from arcade_matches where couple_id=my_couple() and game_id in('ledger','blackjack') and status in('invited','waiting','playing')) then raise exception 'Finish your current wallet game first';end if;
 insert into ledger_wallets(user_id,couple_id,balance) select id,couple_id,amount from profiles where couple_id=my_couple() on conflict(user_id) do update set balance=amount,topped_up=null;
end $$;
revoke execute on function reset_ledger_wallets(int) from public,anon;grant execute on function reset_ledger_wallets(int) to authenticated;
alter table games add column if not exists completed_at timestamptz;
alter table block_matches add column if not exists completed_at timestamptz;
alter table arcade_matches add column if not exists completed_at timestamptz;
create or replace function mark_game_completed() returns trigger language plpgsql set search_path=public as $$begin
 if tg_table_name='games' then
  if new.state->>'status' in('won','draw') and old.state->>'status' not in('won','draw') then new.completed_at:=clock_timestamp();end if;
 else
  if new.status in('won','draw','done') and old.status not in('won','draw','done') then new.completed_at:=clock_timestamp();end if;
 end if;return new;
end $$;
drop trigger if exists game_completed on games;create trigger game_completed before update on games for each row execute function mark_game_completed();
drop trigger if exists game_completed on block_matches;create trigger game_completed before update on block_matches for each row execute function mark_game_completed();
drop trigger if exists game_completed on arcade_matches;create trigger game_completed before update on arcade_matches for each row execute function mark_game_completed();
create or replace function mirror_blackjack_promise() returns trigger language plpgsql security definer set search_path=public as $$begin
 update blackjack_notes set status=case when new.status='done' then 'done' when new.status='waived' then 'voided' else status end where promise_id=new.id;return new;
end $$;
drop trigger if exists blackjack_promise_status on promise_ledger;create trigger blackjack_promise_status after update of status on promise_ledger for each row execute function mirror_blackjack_promise();
create or replace function scoreboard_details() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb:='[]'; seat int; e record;m block_matches;v match_moves; s jsonb;wins int;losses int;draws int;streak int;best int;gap int;comeback int;begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 for seat in 0..1 loop
 wins:=0;losses:=0;draws:=0;streak:=0;best:=0;comeback:=0;
 for e in select * from (
  select id,coalesce(completed_at,created_at) created_at,(state->>'winner')::int winner from games where couple_id=my_couple() and state->>'status' in('won','draw')
  union all select id,created_at,winner from block_matches where couple_id=my_couple() and status in('won','draw')
  union all select am.id,coalesce(am.completed_at,am.created_at) created_at,p.slot from arcade_matches am left join profiles p on p.id=am.winner_id where am.couple_id=my_couple() and am.status='done'
 ) x order by created_at,id loop
  if e.winner=seat then wins:=wins+1;streak:=streak+1;best:=greatest(best,streak);
  elsif e.winner is null then draws:=draws+1;streak:=0;else losses:=losses+1;streak:=0;end if;
 end loop;
 for m in select * from block_matches where couple_id=my_couple() and status='won' and winner=seat and state->'options' is not null and coalesce((state->'options'->>'coop')::boolean,false)=false loop
  s:=heart_initial(m.seed,m.state->'options');gap:=0;
  for v in select * from match_moves where match_id=m.id order by seq loop
   s:=heart_step(s,m.seed,v.slot,v.action);
   gap:=greatest(gap,(s->'scores'->>(1-seat))::int-(s->'scores'->>seat)::int);
  end loop;comeback:=greatest(comeback,gap);
 end loop;
 result:=result||jsonb_build_array(jsonb_build_object('wins',wins,'losses',losses,'draws',draws,'streak',streak,'best_streak',best,'comeback',comeback));
 end loop;return result;
end $$;
revoke execute on function scoreboard_details() from public,anon;
grant execute on function scoreboard_details() to authenticated;

commit;

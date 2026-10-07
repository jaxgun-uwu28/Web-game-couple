begin;
create or replace function public.commit_plugin_move(mid uuid,uid uuid,expected int,rid uuid,payload jsonb,next_state jsonb,next_status text,winner uuid default null,scores jsonb default '[]') returns boolean language plpgsql security definer set search_path=public as $$
declare r arcade_matches;oldstate jsonb;n int;seat_index int;note text;history jsonb;begin
 select * into r from arcade_matches where id=mid for update;if not found or not exists(select 1 from profiles where id=uid and couple_id=r.couple_id) then raise exception 'Match unavailable';end if;
 if exists(select 1 from arcade_match_moves where match_id=mid and request_id=rid) then return true;end if;
 if r.revision<>expected then return false;end if;if r.status<>'playing' then raise exception 'This game is not running';end if;
 if payload->>'type'='powerup' then
  if r.game_id<>'lostfound' then raise exception 'Power-up unavailable';end if;
  update game_rewards set coins=coins-5 where user_id=uid and coins>=5;
  if not found then raise exception 'You need 5 reward coins for this power-up';end if;
 end if;
 select state into oldstate from arcade_private_states where match_id=mid;
 if r.game_id='ledger' then
  for seat_index in 0..1 loop
   update ledger_wallets w set balance=(next_state->'wallets'->>seat_index)::int from arcade_match_players p where p.match_id=mid and p.seat=seat_index and w.user_id=p.user_id;
  end loop;
  if jsonb_array_length(next_state->'history')>jsonb_array_length(oldstate->'history') then
   history:=next_state->'history'->(jsonb_array_length(next_state->'history')-1);seat_index:=(history->>'winner')::int;
   for note in select jsonb_array_elements_text(history->'notes') loop
    insert into promise_ledger(couple_id,match_id,promisor,owed_to,note) select r.couple_id,mid,a.user_id,b.user_id,note from arcade_match_players a,arcade_match_players b where a.match_id=mid and b.match_id=mid and a.seat=1-seat_index and b.seat=seat_index;
   end loop;
  end if;
 end if;
 update arcade_private_states set state=next_state where match_id=mid;
 insert into arcade_match_moves(match_id,player_id,seq,request_id,move) values(mid,uid,expected+1,rid,payload);
 update arcade_matches set revision=revision+1,status=next_status,winner_id=winner where id=mid;
 if next_status='done' then
  for seat_index in 0..1 loop
   update arcade_match_players set score=coalesce((scores->>seat_index)::int,0) where match_id=mid and arcade_match_players.seat=seat_index;
  end loop;
  insert into game_rewards(user_id,couple_id,coins,xp,achievements) select user_id,r.couple_id,case when user_id=winner then 10 else 3 end,case when user_id=winner then 25 else 10 end,array[r.game_id||'-first'] from arcade_match_players where match_id=mid on conflict(user_id) do update set coins=game_rewards.coins+excluded.coins,xp=game_rewards.xp+excluded.xp,achievements=(select array_agg(distinct x) from unnest(game_rewards.achievements||excluded.achievements) x);
 end if;return true;
end $$;
revoke execute on function public.commit_plugin_move(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_plugin_move(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb) to service_role;

notify pgrst,'reload schema';commit;

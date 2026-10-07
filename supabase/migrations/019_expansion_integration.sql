begin;
create or replace function public.scoreboard() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_array(count(*) filter(where winner=0),count(*) filter(where winner=1)) from (
 select (state->>'winner')::int winner from games where couple_id=my_couple() and state->>'status'='won'
 union all select winner from block_matches where couple_id=my_couple() and status='won'
 union all select p.slot from arcade_matches m join profiles p on p.id=m.winner_id where m.couple_id=my_couple() and m.status='done') wins
$$;
create or replace function public.expansion_stats() returns jsonb language sql stable security definer set search_path=public as $$
 with v as(select count(*) n from voice_messages where couple_id=my_couple()),p as(select count(*) n,count(*) filter(where length(layers->>'place')>0) places from postcards where couple_id=my_couple()),h as(select count(*) n,coalesce(sum(duration_sec),0) total,coalesce(max(duration_sec),0) longest from hold_sessions where couple_id=my_couple()),l as(select count(*) n from promise_ledger where couple_id=my_couple() and status='done')
 select jsonb_build_object('voices',v.n,'postcards',p.n,'hold_count',h.n,'hold_seconds',h.total,'longest_hold',h.longest,'promises',l.n,'achievements',to_jsonb(array_remove(array[
 case when h.n>0 then 'First touch' end,case when h.longest>=60 then 'One minute together' end,case when h.total>=300 then 'Five minutes together' end,
 case when v.n>=10 then 'Chatterbox' end,case when v.n>=25 then 'Cassette collector' end,case when p.n>0 then 'First postcard' end,case when p.n>=10 then 'Postcard collector' end,case when p.places>0 then 'Wish you were here' end],null))) from v,p,h,l
$$;
create or replace function public.arcade_progress() returns jsonb language sql stable security definer set search_path=public as $$
 with completed as (select kind,state from games where couple_id=my_couple() and state->>'status' in ('won','draw') union all select 'block',state||jsonb_build_object('winner',winner) from block_matches where couple_id=my_couple() and status in ('won','draw') union all select game_id,jsonb_build_object('winner',p.slot) from arcade_matches m left join profiles p on p.id=m.winner_id where m.couple_id=my_couple() and m.status='done'), stats as(select count(*) played,count(*) filter(where (state->>'winner')::int=my_slot()) wins from completed),extra as(select coalesce(sum(coins),0) coins,coalesce(sum(xp),0) xp from game_rewards where user_id=auth.uid())
 select jsonb_build_object('played',played,'wins',wins,'xp',played*10+wins*5+extra.xp+(expansion_stats()->>'voices')::int*5+(expansion_stats()->>'postcards')::int*5,'coins',played*2+wins+extra.coins+(expansion_stats()->>'hold_count')::int,'by_kind',coalesce((select jsonb_object_agg(kind,n) from(select kind,count(*) n from completed group by kind)t),'{}'::jsonb)) from stats,extra
$$;
create or replace function public.can_add_media(bytes bigint) returns boolean language sql stable security definer set search_path=public as $$select my_couple() is not null and (media_usage()->>'used')::bigint+greatest(bytes,524288)<=(media_usage()->>'cap')::bigint$$;
drop policy if exists voice_file_add on storage.objects;
create policy voice_file_add on storage.objects for insert to authenticated with check(bucket_id='voice-notes' and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text and can_add_media(coalesce((metadata->>'size')::bigint,524288)));
drop policy if exists postcard_file_add on storage.objects;
create policy postcard_file_add on storage.objects for insert to authenticated with check(bucket_id='postcards' and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text and can_add_media(coalesce((metadata->>'size')::bigint,524288)));
create or replace function public.reset_ledger_wallets(amount int default 10) returns void language plpgsql security definer set search_path=public as $$begin
 if my_couple() is null or amount not in (10,20,50) then raise exception 'Choose a starting balance';end if;
 perform pg_advisory_xact_lock(hashtext(my_couple()::text||'ledger'));
 if exists(select 1 from arcade_matches where couple_id=my_couple() and game_id='ledger' and status in ('invited','waiting','playing')) then raise exception 'Finish your Ledger Duel first';end if;
 insert into ledger_wallets(user_id,couple_id,balance) select id,couple_id,amount from profiles where couple_id=my_couple() on conflict(user_id) do update set balance=amount,topped_up=null;
end $$;
revoke execute on function public.expansion_stats(),public.can_add_media(bigint),public.reset_ledger_wallets(int) from public,anon;
grant execute on function public.expansion_stats(),public.can_add_media(bigint),public.reset_ledger_wallets(int) to authenticated;
create or replace function public.claim_plugin_win(mid uuid,uid uuid) returns void language plpgsql security definer set search_path=public as $$declare r arcade_matches;begin
 select * into r from arcade_matches where id=mid for update;
 if not found or r.status<>'playing' or not exists(select 1 from arcade_match_players where match_id=mid and user_id=uid) then raise exception 'Match unavailable';end if;
 if not exists(select 1 from arcade_match_players where match_id=mid and user_id<>uid and seen_at<now()-interval '60 seconds') then raise exception 'Partner still has time to reconnect';end if;
 -- Refund unresolved stakes without revealing notes; the connected player receives the match win.
 perform cancel_plugin_match(mid,uid,false);
 update arcade_matches set status='done',winner_id=uid where id=mid;
 update arcade_match_players set score=case when user_id=uid then 1 else 0 end where match_id=mid;
 insert into game_rewards(user_id,couple_id,coins,xp,achievements) values(uid,r.couple_id,10,25,array[r.game_id||'-first']) on conflict(user_id) do update set coins=game_rewards.coins+10,xp=game_rewards.xp+25;
end $$;
revoke execute on function public.claim_plugin_win(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_plugin_win(uuid,uuid) to service_role;

notify pgrst,'reload schema';commit;


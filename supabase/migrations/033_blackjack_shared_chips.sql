begin;
-- New Blackjack sessions use equal match-only chips, independent of Ledger wallets.
do $$ begin
  if to_regprocedure('public.create_plugin_match_wallet_mode(uuid,uuid,text,jsonb,bigint,jsonb)') is null then
    alter function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) rename to create_plugin_match_wallet_mode;
  end if;
  if to_regprocedure('public.sync_blackjack_wallet_mode(uuid,jsonb)') is null then
    alter function sync_blackjack(uuid,jsonb) rename to sync_blackjack_wallet_mode;
  end if;
end $$;
create or replace function public.create_plugin_match(mid uuid,uid uuid,gid text,cfg jsonb,match_seed bigint,engine jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; amount int;
begin
  if gid='blackjack' and coalesce((cfg->>'sessionChips')::boolean,false) then
    amount:=(cfg->>'startingChips')::int;
    if amount is null or amount<10 or amount>10000 then raise exception 'Choose 10 to 10000 starting chips.'; end if;
    engine:=engine||jsonb_build_object('chips',jsonb_build_array(amount,amount),'buyIns',jsonb_build_array(amount,amount),'initial',amount*2,'config',cfg);
    -- Existing atomic per-couple/game lock and one-active-room index still apply.
    result:=create_plugin_match_before_wallet_guard(mid,uid,gid,cfg,match_seed,engine);
    update blackjack_players bp set buy_in=amount,chips=amount
      where session_id=result and exists(select 1 from arcade_matches m where m.id=result and m.config=cfg and m.revision=0);
    return result;
  end if;
  return create_plugin_match_wallet_mode(mid,uid,gid,cfg,match_seed,engine);
end $$;
create or replace function public.sync_blackjack(mid uuid,s jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r arcade_matches;
begin
  select * into r from arcade_matches where id=mid for update;
  if coalesce((r.config->>'sessionChips')::boolean,false) and r.status in('done','cancelled','declined') then
    -- Mark session settled before the legacy synchronizer: no session chips enter a wallet.
    update blackjack_sessions set cashed_out=true,ended_at=coalesce(ended_at,now()) where id=mid;
  end if;
  perform sync_blackjack_wallet_mode(mid,s);
end $$;
-- Convert unfunded/funded waiting rooms safely; restore previous wallet debits once.
do $$ declare r arcade_matches; p record; amount int:=100; s jsonb;
begin
  for r in select * from arcade_matches where game_id='blackjack' and status in('invited','waiting') and not coalesce((config->>'sessionChips')::boolean,false) for update loop
    for p in select * from blackjack_players where session_id=r.id order by user_id loop
      update ledger_wallets set balance=balance+p.buy_in where user_id=p.user_id;
    end loop;
    r.config:=r.config||jsonb_build_object('sessionChips',true,'startingChips',amount);
    update arcade_matches set config=r.config,ready='{}',status='waiting',revision=revision+1 where id=r.id;
    select state into s from arcade_private_states where match_id=r.id;
    s:=s||jsonb_build_object('chips',jsonb_build_array(amount,amount),'buyIns',jsonb_build_array(amount,amount),'initial',amount*2,'config',r.config);
    update arcade_private_states set state=s where match_id=r.id;
    update blackjack_players set buy_in=amount,chips=amount where session_id=r.id;
    update blackjack_sessions set config=r.config where id=r.id;
  end loop;
end $$;
revoke execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb),create_plugin_match_wallet_mode(uuid,uuid,text,jsonb,bigint,jsonb),sync_blackjack(uuid,jsonb),sync_blackjack_wallet_mode(uuid,jsonb) from public,anon,authenticated;
grant execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb),sync_blackjack(uuid,jsonb) to service_role;
commit;

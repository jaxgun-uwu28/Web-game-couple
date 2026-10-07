begin;
create table if not exists public.arcade_matches(id uuid primary key default gen_random_uuid(),couple_id uuid not null references couples,game_id text not null check(game_id in ('ledger','lostfound','syncsteps')),host uuid not null references profiles,config jsonb not null,status text not null default 'invited' check(status in ('invited','waiting','playing','done','cancelled','declined')),ready uuid[] not null default '{}',started_at timestamptz,ends_at timestamptz,winner_id uuid references profiles,revision int not null default 0,created_at timestamptz not null default now());
create unique index if not exists one_plugin_room on arcade_matches(couple_id,game_id) where status in ('invited','waiting','playing');
create table if not exists public.arcade_private_states(match_id uuid primary key references arcade_matches on delete cascade,seed bigint not null,state jsonb not null);
create table if not exists public.arcade_match_players(match_id uuid references arcade_matches on delete cascade,user_id uuid references profiles,seat int not null check(seat in (0,1)),seen_at timestamptz not null default now(),private_state jsonb not null default '{}',score int not null default 0,primary key(match_id,user_id));
create table if not exists public.arcade_match_moves(match_id uuid references arcade_matches on delete cascade,player_id uuid references profiles,seq int not null,request_id uuid not null,move jsonb not null,server_ts timestamptz not null default now(),primary key(match_id,seq),unique(match_id,request_id));
create table if not exists public.ledger_wallets(user_id uuid primary key references profiles,couple_id uuid not null references couples,balance int not null default 10 check(balance>=0),topped_up date);
create table if not exists public.promise_ledger(id uuid primary key default gen_random_uuid(),couple_id uuid not null references couples,match_id uuid references arcade_matches,promisor uuid not null references profiles,owed_to uuid not null references profiles,note text not null check(length(note)<=140),status text not null default 'pending' check(status in ('pending','done','waived')),nudged_at timestamptz,waiver_by uuid references profiles,expires_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.game_rewards(user_id uuid primary key references profiles,couple_id uuid not null references couples,coins int not null default 0,xp int not null default 0,achievements text[] not null default '{}');
alter table arcade_matches enable row level security;alter table arcade_private_states enable row level security;alter table arcade_match_players enable row level security;alter table arcade_match_moves enable row level security;alter table ledger_wallets enable row level security;alter table promise_ledger enable row level security;alter table game_rewards enable row level security;
drop policy if exists plugin_match_read on arcade_matches;create policy plugin_match_read on arcade_matches for select to authenticated using(couple_id=my_couple());
drop policy if exists plugin_player_read on arcade_match_players;create policy plugin_player_read on arcade_match_players for select to authenticated using(user_id=auth.uid());
drop policy if exists plugin_wallet_read on ledger_wallets;create policy plugin_wallet_read on ledger_wallets for select to authenticated using(couple_id=my_couple());
drop policy if exists promises_read on promise_ledger;create policy promises_read on promise_ledger for select to authenticated using(couple_id=my_couple());
drop policy if exists rewards_read on game_rewards;create policy rewards_read on game_rewards for select to authenticated using(couple_id=my_couple());
grant select on arcade_matches,arcade_match_players,ledger_wallets,promise_ledger,game_rewards to authenticated;
-- No authenticated access to the engine snapshot or raw moves: both can contain unrevealed secrets.
revoke all on arcade_private_states,arcade_match_moves from authenticated,anon;
create or replace function public.create_plugin_match(mid uuid,uid uuid,gid text,cfg jsonb,match_seed bigint,engine jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid;existing uuid;member record;balances jsonb:='[]';begin
 select couple_id into cid from profiles where id=uid;
 if cid is null or (select count(*) from profiles where couple_id=cid)<>2 then raise exception 'Both accounts must be linked';end if;
 perform pg_advisory_xact_lock(hashtext(cid::text||gid));
 select id into existing from arcade_matches where couple_id=cid and game_id=gid and status in ('invited','waiting','playing');
 if existing is not null then return existing;end if;
 insert into arcade_matches(id,couple_id,game_id,host,config) values(mid,cid,gid,uid,cfg);
 for member in select id,row_number() over(order by slot)-1 as position from profiles where couple_id=cid loop
  insert into arcade_match_players(match_id,user_id,seat) values(mid,member.id,member.position);
  if gid='ledger' then insert into ledger_wallets(user_id,couple_id,balance) values(member.id,cid,coalesce((cfg->>'wallet')::int,10)) on conflict(user_id) do nothing;end if;
 end loop;
 if gid='ledger' then
  select jsonb_agg(w.balance order by p.seat) into balances from arcade_match_players p join ledger_wallets w on w.user_id=p.user_id where p.match_id=mid;
  engine:=jsonb_set(jsonb_set(engine,'{wallets}',balances),'{initial}',to_jsonb((balances->>0)::int+(balances->>1)::int));
 end if;
 insert into arcade_private_states(match_id,seed,state) values(mid,match_seed,engine);return mid;
end $$;
revoke execute on function public.create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) to service_role;
create or replace function public.commit_plugin_move(mid uuid,uid uuid,expected int,rid uuid,payload jsonb,next_state jsonb,next_status text,winner uuid default null,scores jsonb default '[]') returns boolean language plpgsql security definer set search_path=public as $$
declare r arcade_matches;oldstate jsonb;n int;seat_index int;note text;history jsonb;begin
 select * into r from arcade_matches where id=mid for update;if not found or not exists(select 1 from profiles where id=uid and couple_id=r.couple_id) then raise exception 'Match unavailable';end if;
 if exists(select 1 from arcade_match_moves where match_id=mid and request_id=rid) then return true;end if;
 if r.revision<>expected then return false;end if;if r.status<>'playing' then raise exception 'This game is not running';end if;
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
create or replace function public.cancel_plugin_match(mid uuid,uid uuid,decline boolean default false) returns void language plpgsql security definer set search_path=public as $$declare r arcade_matches;s jsonb;p record;begin
 select * into r from arcade_matches where id=mid for update;
 if not found or not exists(select 1 from profiles where id=uid and couple_id=r.couple_id) then raise exception 'Match unavailable';end if;
 if r.status not in ('invited','waiting','playing') then return;end if;
 if r.game_id='ledger' then
  select state into s from arcade_private_states where match_id=mid;
  for p in select * from arcade_match_players where match_id=mid loop update ledger_wallets set balance=(s->'wallets'->>p.seat)::int+case when (s->>'pot')::int>0 then (s->'stakes'->>p.seat)::int else 0 end where user_id=p.user_id;end loop;
 end if;
 update arcade_matches set status=case when decline then 'declined' else 'cancelled' end,revision=revision+1 where id=mid;
end $$;
revoke execute on function public.cancel_plugin_match(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.cancel_plugin_match(uuid,uuid,boolean) to service_role;
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
create or replace function public.promise_action(i uuid,a text) returns void language plpgsql security definer set search_path=public as $$declare r promise_ledger;begin
 select * into r from promise_ledger where id=i and couple_id=my_couple() for update;if not found or r.status<>'pending' then raise exception 'Promise unavailable';end if;
 if a='done' and r.owed_to=auth.uid() then update promise_ledger set status='done' where id=i;
 elsif a='nudge' and r.promisor=auth.uid() then update promise_ledger set nudged_at=now() where id=i;
 elsif a='waive' then
  if r.waiver_by is not null and r.waiver_by<>auth.uid() then update promise_ledger set status='waived' where id=i;else update promise_ledger set waiver_by=auth.uid() where id=i;end if;
 else raise exception 'Only the person owed can confirm this promise';end if;
end $$;
create or replace function public.ledger_topup() returns void language plpgsql security definer set search_path=public as $$begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 if exists(select 1 from arcade_matches where couple_id=my_couple() and game_id='ledger' and status in ('invited','waiting','playing')) then raise exception 'Finish your current Ledger Duel first';end if;
 update ledger_wallets set balance=10,topped_up=current_date where user_id=auth.uid() and balance<3 and (topped_up is null or topped_up<current_date);
end $$;
revoke execute on function public.promise_action(uuid,text),public.ledger_topup() from public,anon;
grant execute on function public.promise_action(uuid,text),public.ledger_topup() to authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='arcade_matches') then alter publication supabase_realtime add table public.arcade_matches;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='promise_ledger') then alter publication supabase_realtime add table public.promise_ledger;end if;
end if;end $$;
notify pgrst,'reload schema';commit;



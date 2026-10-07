begin;
alter table arcade_matches drop constraint if exists arcade_matches_game_id_check;
alter table arcade_matches add constraint arcade_matches_game_id_check check(game_id in('ledger','lostfound','syncsteps','blackjack'));
create table if not exists blackjack_sessions(id uuid primary key references arcade_matches on delete cascade,couple_id uuid not null references couples,config jsonb not null,status text not null,started_at timestamptz,ended_at timestamptz,winner_id uuid references profiles,cashed_out boolean not null default false);
create table if not exists blackjack_players(session_id uuid references blackjack_sessions on delete cascade,user_id uuid references profiles,buy_in int not null default 0,chips int not null default 0 check(chips>=0),notes_used int not null default 0 check(notes_used between 0 and 3),hole_cards jsonb not null default '[]',primary key(session_id,user_id));
create table if not exists blackjack_rounds(session_id uuid references blackjack_sessions on delete cascade,round_no int not null,opener_id uuid references profiles,bet int not null,pot int not null,deck_state jsonb not null,result jsonb,primary key(session_id,round_no));
create table if not exists blackjack_notes(id uuid primary key,session_id uuid references blackjack_sessions on delete cascade,round_no int not null,author_id uuid references profiles,text text not null check(length(text)<=140),status text not null check(status in('proposed','accepted','declined','voided','owed','done')),shortfall int not null default 0,promise_id uuid references promise_ledger,created_at timestamptz not null default now());
alter table blackjack_sessions enable row level security;alter table blackjack_players enable row level security;alter table blackjack_rounds enable row level security;alter table blackjack_notes enable row level security;
drop policy if exists bj_session_read on blackjack_sessions;create policy bj_session_read on blackjack_sessions for select to authenticated using(couple_id=my_couple());
drop policy if exists bj_player_read on blackjack_players;create policy bj_player_read on blackjack_players for select to authenticated using(user_id=auth.uid());
drop policy if exists bj_note_read on blackjack_notes;create policy bj_note_read on blackjack_notes for select to authenticated using(exists(select 1 from blackjack_sessions s where s.id=session_id and s.couple_id=my_couple()) and (author_id=auth.uid() or status<>'voided'));
grant select on blackjack_sessions,blackjack_players,blackjack_notes to authenticated;
revoke all on blackjack_rounds from authenticated,anon;
grant all on blackjack_sessions,blackjack_players,blackjack_rounds,blackjack_notes to service_role;
do $$ begin
 if to_regprocedure('public.create_plugin_match_pre_blackjack(uuid,uuid,text,jsonb,bigint,jsonb)') is null then alter function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb) rename to create_plugin_match_pre_blackjack;end if;
 if to_regprocedure('public.commit_plugin_move_pre_blackjack(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb)') is null then alter function commit_plugin_move(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb) rename to commit_plugin_move_pre_blackjack;end if;
 if to_regprocedure('public.cancel_plugin_match_pre_blackjack(uuid,uuid,boolean)') is null then alter function cancel_plugin_match(uuid,uuid,boolean) rename to cancel_plugin_match_pre_blackjack;end if;
end $$;
create or replace function create_plugin_match(mid uuid,uid uuid,gid text,cfg jsonb,match_seed bigint,engine jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare result uuid;begin
 result:=create_plugin_match_pre_blackjack(mid,uid,gid,cfg,match_seed,engine);
 if gid='blackjack' then
 insert into blackjack_sessions(id,couple_id,config,status) select id,couple_id,config,status from arcade_matches where id=result on conflict do nothing;
 insert into blackjack_players(session_id,user_id) select result,user_id from arcade_match_players where match_id=result on conflict do nothing;
 insert into ledger_wallets(user_id,couple_id,balance) select p.user_id,m.couple_id,10 from arcade_match_players p join arcade_matches m on m.id=p.match_id where m.id=result on conflict do nothing;
 end if;return result;
end $$;
create or replace function blackjack_buyin(mid uuid,uid uuid,amount int) returns void language plpgsql security definer set search_path=public as $$declare r arcade_matches;s jsonb;seat int;balance int;begin
 select * into r from arcade_matches where id=mid and game_id='blackjack' for update;
 select p.seat into seat from arcade_match_players p where match_id=mid and user_id=uid;
 if r.id is null or seat is null or r.status<>'waiting' or amount<10 then raise exception 'Buy-in unavailable';end if;
 select state into s from arcade_private_states where match_id=mid;
 if (s->'buyIns'->>seat)::int>0 then
  if (s->'buyIns'->>seat)::int=amount then return;end if;raise exception 'Buy-in already locked';end if;
 select w.balance into balance from ledger_wallets w where user_id=uid for update;
 if amount>balance then raise exception 'Not enough wallet chips';end if;
 update ledger_wallets set balance=ledger_wallets.balance-amount where user_id=uid;
 s:=jsonb_set(jsonb_set(jsonb_set(s,array['buyIns',seat::text],to_jsonb(amount)),array['chips',seat::text],to_jsonb(amount)),'{initial}',to_jsonb((s->>'initial')::int+amount));
 update arcade_private_states set state=s where match_id=mid;
 update blackjack_players set buy_in=amount,chips=amount where session_id=mid and user_id=uid;
 update arcade_matches set revision=revision+1 where id=mid;
end $$;
create or replace function sync_blackjack(mid uuid,s jsonb) returns void language plpgsql security definer set search_path=public as $$declare r arcade_matches;p record;n jsonb;author uuid;owed uuid;existing uuid;promise uuid;begin
 select * into r from arcade_matches where id=mid for update;
 for p in select * from arcade_match_players where match_id=mid loop
 update blackjack_players set chips=case when (select cashed_out from blackjack_sessions where id=mid) then 0 else (s->'chips'->>p.seat)::int end,notes_used=(s->'notesUsed'->>p.seat)::int,hole_cards=coalesce(s->'hands'->p.seat->1,'null') where session_id=mid and user_id=p.user_id;
 end loop;
 insert into blackjack_rounds(session_id,round_no,opener_id,bet,pot,deck_state,result) select mid,(s->>'round')::int,mp.user_id,(s->>'bet')::int,(s->>'pot')::int,s->'deck',s->'history'->(jsonb_array_length(s->'history')-1) from arcade_match_players mp where mp.match_id=mid and mp.seat=(s->>'opener')::int on conflict(session_id,round_no) do update set bet=excluded.bet,pot=excluded.pot,deck_state=excluded.deck_state,result=excluded.result;
 for n in select jsonb_array_elements(s->'notes') loop
 select user_id into author from arcade_match_players where match_id=mid and seat=(n->>'author')::int;
 insert into blackjack_notes(id,session_id,round_no,author_id,text,status,shortfall) values((n->>'id')::uuid,mid,(n->>'round')::int,author,n->>'text',n->>'status',coalesce((n->>'shortfall')::int,0)) on conflict(id) do update set status=excluded.status;
 if n->>'status'='owed' then
 select promise_id into existing from blackjack_notes where id=(n->>'id')::uuid;
 if existing is null then
 select user_id into owed from arcade_match_players where match_id=mid and seat=(n->>'owedTo')::int;
 insert into promise_ledger(couple_id,match_id,promisor,owed_to,note) values(r.couple_id,mid,author,owed,n->>'text') returning id into promise;
 update blackjack_notes set promise_id=promise where id=(n->>'id')::uuid;end if;end if;
 end loop;
 update blackjack_sessions set status=r.status,started_at=coalesce(started_at,to_timestamp((s->>'startedAt')::double precision/1000)),winner_id=r.winner_id where id=mid;
 if r.status in('done','cancelled','declined') and exists(select 1 from blackjack_sessions where id=mid and not cashed_out) then
  for p in select * from blackjack_players where session_id=mid order by user_id loop update ledger_wallets set balance=balance+p.chips where user_id=p.user_id;end loop;
  update blackjack_players set chips=0 where session_id=mid;
  update blackjack_sessions set cashed_out=true,ended_at=now() where id=mid;
 end if;
end $$;
create or replace function commit_plugin_move(mid uuid,uid uuid,expected int,rid uuid,payload jsonb,next_state jsonb,next_status text,winner uuid default null,scores jsonb default '[]') returns boolean language plpgsql security definer set search_path=public as $$declare ok boolean;s jsonb;begin
 ok:=commit_plugin_move_pre_blackjack(mid,uid,expected,rid,payload,next_state,next_status,winner,scores);
 if ok and exists(select 1 from arcade_matches where id=mid and game_id='blackjack') then select state into s from arcade_private_states where match_id=mid;perform sync_blackjack(mid,s);end if;return ok;
end $$;
create or replace function cancel_plugin_match(mid uuid,uid uuid,decline boolean default false) returns void language plpgsql security definer set search_path=public as $$declare s jsonb;seat int;begin
 perform cancel_plugin_match_pre_blackjack(mid,uid,decline);
 if exists(select 1 from arcade_matches where id=mid and game_id='blackjack' and status in('cancelled','declined')) then
 select state into s from arcade_private_states where match_id=mid;
 for seat in 0..1 loop s:=jsonb_set(s,array['chips',seat::text],to_jsonb((s->'chips'->>seat)::int+(s->'stakes'->>seat)::int));end loop;
 s:=s||'{"pot":0,"stakes":[0,0]}'::jsonb;update arcade_private_states set state=s where match_id=mid;perform sync_blackjack(mid,s);
 end if;
end $$;
revoke execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb),commit_plugin_move(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb),cancel_plugin_match(uuid,uuid,boolean),blackjack_buyin(uuid,uuid,int),sync_blackjack(uuid,jsonb) from public,anon,authenticated;
grant execute on function create_plugin_match(uuid,uuid,text,jsonb,bigint,jsonb),commit_plugin_move(uuid,uuid,int,uuid,jsonb,jsonb,text,uuid,jsonb),cancel_plugin_match(uuid,uuid,boolean),blackjack_buyin(uuid,uuid,int),sync_blackjack(uuid,jsonb) to service_role;
commit;

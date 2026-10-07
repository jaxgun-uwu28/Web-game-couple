begin;
create table if not exists party_game_bank (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references couples,
 kind text not null check(kind in('know','draw')), hash text not null, item jsonb not null,
 used boolean not null default false, created_at timestamptz not null default now(),
 unique(couple_id,kind,hash)
);
alter table party_game_bank enable row level security;
revoke all on party_game_bank from anon,authenticated;
grant all on party_game_bank to service_role;
create or replace function party_game_context(c uuid,k text) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('available',(select count(*) from party_game_bank where couple_id=c and kind=k and not used),'history',coalesce((select jsonb_agg(item) from (select item from party_game_bank where couple_id=c and kind=k order by created_at desc limit 200) x),'[]'::jsonb))
$$;
create or replace function start_party_game(c uuid,k text) returns games language plpgsql security definer set search_path=public as $$
declare g games;s jsonb;ids uuid[];qs jsonb;w text;begin
 if k not in('know','draw') or (select count(*) from profiles where couple_id=c)<>2 then raise exception 'Both accounts must be linked';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||k));
 select * into g from games where couple_id=c and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g;end if;
 select array_agg(id),jsonb_agg(item) into ids,qs from (select id,item from party_game_bank where couple_id=c and kind=k and not used order by random() limit case when k='know' then 5 else 1 end for update) picked;
 if coalesce(array_length(ids,1),0)<(case when k='know' then 5 else 1 end) then raise exception 'Saved game content is empty';end if;
 s:=jsonb_build_object('status','playing','turn',0,'round',0,'scores',jsonb_build_array(0,0),'winner',null,'pack','party-ai');
 if k='know' then s:=s||jsonb_build_object('questions',qs);else s:=s||jsonb_build_object('artist',(select count(*)%2 from games where couple_id=c and kind='draw'),'guesses','[]'::jsonb);w:=qs->0->>'word';end if;
 insert into games(couple_id,kind,state) values(c,k,s) returning * into g;
 if k='draw' then insert into game_secrets values(g.id,w);end if;
 update party_game_bank set used=true where id=any(ids);
 return g;
end $$;
revoke execute on function party_game_context(uuid,text),start_party_game(uuid,text) from public,anon,authenticated;
grant execute on function party_game_context(uuid,text),start_party_game(uuid,text) to service_role;
do $$ begin
 if not exists(select 1 from pg_proc where proname='new_game_before_party') then alter function new_game(text) rename to new_game_before_party;end if;
end $$;
create or replace function new_game(k text) returns games language plpgsql security definer set search_path=public as $$ declare g games;begin
 if k in('know','draw') then
 select * into g from games where couple_id=my_couple() and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g;end if;raise exception 'Start this game through the arcade to load Gemini content';
 end if;return new_game_before_party(k);
end $$;
revoke execute on function new_game_before_party(text) from public,anon,authenticated;
revoke execute on function new_game(text) from public,anon;
grant execute on function new_game(text) to authenticated;
commit;

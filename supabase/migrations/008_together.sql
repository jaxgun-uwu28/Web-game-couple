begin;
-- Preserve already-playing matches. Only new games opt into the new question pack and five guesses.
alter function public.new_game(text) rename to new_game_legacy;
revoke execute on function public.new_game_legacy(text) from public,anon,authenticated;
create function public.new_game(k text) returns public.games language plpgsql security definer set search_path=public as $$
declare g games; existing uuid;c uuid:=my_couple();begin
 if c is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||k));
 select id into existing from games where couple_id=c and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 g:=new_game_legacy(k);
 if existing is null and k in ('draw','know','trivia') then update games set state=state||jsonb_build_object('pack','general-v2') where id=g.id returning * into g;end if;return g;end $$;
alter function public.play_game(uuid,jsonb) rename to play_game_legacy;
revoke execute on function public.play_game_legacy(uuid,jsonb) from public,anon,authenticated;
create function public.play_game(gid uuid,action jsonb) returns public.games language plpgsql security definer set search_path=public as $$
declare g games;begin
 g:=play_game_legacy(gid,action);
 if g.kind='draw' and g.state->>'pack'='general-v2' and g.state->>'status'='playing' and jsonb_array_length(g.state->'guesses')>=5 then
 update games set state=state||jsonb_build_object('status','won','winner',(state->>'artist')::int,'word',(select word from game_secrets where game_id=gid)) where id=gid returning * into g;end if;return g;end $$;
revoke execute on function public.new_game(text),public.play_game(uuid,jsonb) from public,anon;
grant execute on function public.new_game(text),public.play_game(uuid,jsonb) to authenticated;
create table public.together_activities(id uuid primary key default gen_random_uuid(),couple_id uuid not null references couples,author uuid not null references profiles,kind text not null check(kind in ('date','countdown','question','stake')),body jsonb not null,done boolean not null default false,created_at timestamptz not null default now());
alter table together_activities enable row level security;
create policy together_read on together_activities for select to authenticated using(couple_id=my_couple());
grant select on together_activities to authenticated;
create function public.save_activity(k text,content jsonb,eid uuid default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 if eid is not null then update together_activities set done=not done where id=eid and couple_id=my_couple();if not found then raise exception 'Activity unavailable';end if;return;end if;
 if k not in ('date','countdown','question','stake') or octet_length(content::text)>4000 then raise exception 'Invalid activity';end if;
 if k='question' then if content->>'index' is null or (content->>'index')::int not between 0 and 35 then raise exception 'Invalid question';end if;
 else if coalesce(length(trim(content->>'title')),0) not between 1 and 160 then raise exception 'Add a short title';end if;end if;
 if k='countdown' then perform (content->>'date')::date;if content->>'date' is null then raise exception 'Choose a date';end if;end if;
 insert into together_activities(couple_id,author,kind,body) values(my_couple(),auth.uid(),k,content);
end $$;
create function public.arcade_progress() returns jsonb language sql stable security definer set search_path=public as $$
 with completed as (select kind,state from games where couple_id=my_couple() and state->>'status'<>'playing' union all select 'block',state||jsonb_build_object('winner',winner) from block_matches where couple_id=my_couple() and status in ('won','draw'))
 select jsonb_build_object('played',count(*),'wins',count(*) filter(where (state->>'winner')::int=my_slot()),'xp',count(*)*10+count(*) filter(where (state->>'winner')::int=my_slot())*5,'coins',count(*)*2+count(*) filter(where (state->>'winner')::int=my_slot()),'by_kind',coalesce((select jsonb_object_agg(kind,n) from(select kind,count(*) n from completed group by kind)t),'{}'::jsonb)) from completed;
$$;
revoke execute on function public.save_activity(text,jsonb,uuid),public.arcade_progress() from public,anon;
grant execute on function public.save_activity(text,jsonb,uuid),public.arcade_progress() to authenticated;
alter publication supabase_realtime add table together_activities;
notify pgrst,'reload schema';commit;

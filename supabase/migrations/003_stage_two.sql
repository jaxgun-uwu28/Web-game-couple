-- After 001 and 002. Keep existing account linkage and saved games.
alter table public.profiles alter column color set default '#9d304f';
create function public.set_nickname(value text) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_couple() is null then raise exception 'Your private couple invitation is required'; end if;
 if value is null or length(trim(value))>40 then raise exception 'Use a nickname of 40 characters or fewer'; end if;
 update profiles set nickname=trim(value) where id=auth.uid();
end $$;
revoke execute on function public.set_nickname(text) from public,anon;
grant execute on function public.set_nickname(text) to authenticated;

create or replace function public.new_game(k text) returns public.games language plpgsql security definer set search_path=public as $$
declare g games; s jsonb; c uuid:=my_couple();
begin
 if c is null then raise exception 'Your private couple invitation is required'; end if;
 if k not in ('tic','connect','draw','know','trivia') or k is null then raise exception 'Unknown game'; end if;
 if (select count(*) from profiles where couple_id=c)<>2 then raise exception 'Both private accounts must be linked before playing'; end if;
 perform pg_advisory_xact_lock(hashtext(c::text||k));
 select * into g from games where couple_id=c and kind=k and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g; end if;
 s:=jsonb_build_object('status','playing','turn',0,'round',0,'scores',jsonb_build_array(0,0),'winner',null);
 if k in ('tic','connect') then s:=s||jsonb_build_object('board',(select jsonb_agg(0) from generate_series(1,case when k='tic' then 9 else 42 end))); end if;
 if k='draw' then s:=s||jsonb_build_object('artist',(select count(*)%2 from games where couple_id=c and kind='draw'),'guesses','[]'::jsonb); end if;
 insert into games(couple_id,kind,state) values(c,k,s) returning * into g;
 if k='draw' then insert into game_secrets values(g.id,(array['cloud','flower','boat','star','moon','bird'])[floor(random()*6)::int+1]); end if;
 return g;
end $$;

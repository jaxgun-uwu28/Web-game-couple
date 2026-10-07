begin;
create or replace function scoreboard_details() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb:='[]'; seat int; e record;m block_matches;v match_moves; s jsonb;wins int;losses int;draws int;streak int;best int;gap int;comeback int;begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 for seat in 0..1 loop
 wins:=0;losses:=0;draws:=0;streak:=0;best:=0;comeback:=0;
 for e in select * from (
  select id,created_at,(state->>'winner')::int winner from games where couple_id=my_couple() and state->>'status' in('won','draw')
  union all select id,created_at,winner from block_matches where couple_id=my_couple() and status in('won','draw')
  union all select am.id,am.created_at,p.slot from arcade_matches am left join profiles p on p.id=am.winner_id where am.couple_id=my_couple() and am.status='done'
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

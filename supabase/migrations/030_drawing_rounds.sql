begin;
create table if not exists public.drawing_round_words (
 game_id uuid references games on delete cascade, position int not null, word text not null,
 primary key(game_id,position)
);
alter table drawing_round_words enable row level security;
revoke all on drawing_round_words from public,anon,authenticated;
create or replace function start_draw_game(c uuid,rounds int,seconds int) returns games
language plpgsql security definer set search_path=public as $$
declare g games; picked record; pos int:=1;begin
 if rounds not in(5,10,15) or seconds not in(60,120,180) then raise exception 'Invalid drawing settings';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'draw'));
 select * into g from games where couple_id=c and kind='draw' and state->>'status'='playing' order by created_at desc limit 1;
 if found then return g;end if;
 if (select count(*) from party_game_bank where couple_id=c and kind='draw' and not used)<rounds then raise exception 'Saved drawing words are empty';end if;
 g:=start_party_game(c,'draw');
 insert into drawing_round_words select g.id,0,word from game_secrets where game_id=g.id;
 for picked in select id,item->>'word' as word from party_game_bank where couple_id=c and kind='draw' and not used order by created_at,id limit rounds-1 for update loop
  insert into drawing_round_words values(g.id,pos,picked.word);pos:=pos+1;
  update party_game_bank set used=true where id=picked.id;
 end loop;
 update games set state=state||jsonb_build_object('count',rounds,'round_seconds',seconds,'round_ends_at',null,'phase','drawing') where id=g.id returning * into g;
 return g;
end $$;
revoke execute on function start_draw_game(uuid,int,int) from public,anon,authenticated;
grant execute on function start_draw_game(uuid,int,int) to service_role;
do $$ begin if to_regprocedure('public.play_game_before_draw_rounds(uuid,jsonb)') is null then
 alter function play_game(uuid,jsonb) rename to play_game_before_draw_rounds;end if;end $$;
revoke execute on function play_game_before_draw_rounds(uuid,jsonb) from public,anon,authenticated;
create or replace function play_game(gid uuid,action jsonb) returns games
language plpgsql security definer set search_path=public as $$
declare g games;s jsonb;p int:=my_slot();r int;correct text;guess text;winner int;scores jsonb;deadline timestamptz;begin
 select * into g from games where id=gid and couple_id=my_couple() for update;
 if not found then raise exception 'Game unavailable';end if;
 if g.kind<>'draw' or not(g.state ? 'round_seconds') then return play_game_before_draw_rounds(gid,action);end if;
 s:=g.state;r:=(s->>'round')::int;
 if s->>'status'<>'playing' then return g;end if;
 if not game_pair_present(gid,'draw') then raise exception 'Waiting for your person to join this game';end if;
 if action->>'type'='next' then
  if s->>'phase'<>'round_done' then raise exception 'Finish this round first';end if;
  r:=r+1;
  select word into correct from drawing_round_words where game_id=gid and position=r;
  if correct is null then raise exception 'Next drawing word unavailable';end if;
  update game_secrets set word=correct where game_id=gid;
  delete from entries where couple_id=g.couple_id and kind='stroke' and body->>'game'=gid::text;
  s:=(s-'last_word')||jsonb_build_object('round',r,'artist',1-(s->>'artist')::int,'phase','drawing','guesses','[]'::jsonb,'round_ends_at',now()+make_interval(secs=>(s->>'round_seconds')::int));
 elsif s->>'phase'='drawing' then
  deadline:=(s->>'round_ends_at')::timestamptz;
  if deadline is null then
   if action->>'type'<>'ready' then raise exception 'Wait for the round timer';end if;
   s:=s||jsonb_build_object('round_ends_at',now()+make_interval(secs=>(s->>'round_seconds')::int));
  elsif action->>'type'='ready' then return g;
  else
   select word into correct from game_secrets where game_id=gid;
   if now()<deadline then
    if action->>'type'='timeout' then raise exception 'This round has not expired';end if;
    if p=(s->>'artist')::int then raise exception 'The artist cannot guess';end if;
    guess:=trim(action->>'guess');
    if coalesce(length(guess),0) not between 1 and 60 then raise exception 'Write a short guess';end if;
    s:=s||jsonb_build_object('guesses',(s->'guesses')||jsonb_build_array(guess));
   end if;
   if now()>=deadline or lower(guess)=correct or jsonb_array_length(s->'guesses')>=5 then
    winner:=case when now()<deadline and lower(guess)=correct then p else (s->>'artist')::int end;
    scores:=s->'scores';scores:=jsonb_set(scores,array[winner::text],to_jsonb((scores->>winner)::int+1));
    s:=s||jsonb_build_object('phase','round_done','last_word',correct,'scores',scores);
    if r+1>=(s->>'count')::int then
     s:=s||jsonb_build_object('status',case when scores->>0=scores->>1 then 'draw' else 'won' end,'winner',case when scores->>0=scores->>1 then null when (scores->>0)::int>(scores->>1)::int then 0 else 1 end,'word',correct);
    end if;
   end if;
  end if;
 else raise exception 'Start the next round';end if;
 update games set state=s where id=gid returning * into g;return g;
end $$;
revoke execute on function play_game(uuid,jsonb) from public,anon;
grant execute on function play_game(uuid,jsonb) to authenticated;
commit;

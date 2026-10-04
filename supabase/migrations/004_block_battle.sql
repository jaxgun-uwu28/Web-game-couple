-- Run once after the fresh setup (001–003). Existing profiles and games stay intact.
begin;
create table public.block_matches (
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples,
 duration int not null check(duration in(60,120,180,300)),seed int not null,
 status text not null default 'waiting' check(status in('waiting','playing','won','draw','cancelled')),
 starts_at timestamptz,ends_at timestamptz,winner int check(winner in(0,1)),state jsonb not null,
 revision bigint not null default 0,created_at timestamptz not null default now());
alter table public.block_matches enable row level security;
create policy block_match_read on public.block_matches for select to authenticated using(couple_id=public.my_couple());
grant select on public.block_matches to authenticated;
create function public.block_shape(i int) returns jsonb language sql immutable as $$ select
 '[[0],[0,1],[0,8],[0,1,2],[0,8,16],[0,1,8,9],[0,8,9],[0,1,9],[0,1,2,8,9,10],[0,1,2,9],[0,1,2,3],[0,8,16,17]]'::jsonb->i $$;
create function public.block_hand(seed int,r int) returns jsonb language sql immutable as $$
 select jsonb_agg((((seed::bigint+r::bigint*31+i*17)*48271)%2147483647)%12 order by i) from generate_series(0,2) i $$;
create function public.block_fits(b jsonb,shape int,rr int,cc int) returns boolean language sql immutable as $$
 select rr between 0 and 7 and cc between 0 and 7 and block_shape(shape) is not null and not exists(
 select 1 from jsonb_array_elements_text(block_shape(shape)) d where rr+d::int/8>7 or cc+d::int%8>7 or (b->>((rr+d::int/8)*8+cc+d::int%8))::int<>0) $$;
create function public.block_battle(gid uuid,action jsonb default '{"type":"get"}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m block_matches;old_status text;s jsonb;p int:=my_slot();b jsonb;u jsonb;h jsonb;piece int;shape int;rr int;cc int;off int;r int;c int;lines int:=0;points int;rows_done int[]:='{}';cols_done int[]:='{}';stuck boolean:=true;now_at timestamptz:=clock_timestamp();typ text:=action->>'type';move_id uuid;
begin
 select * into m from block_matches where id=gid and couple_id=my_couple() for update;
 if not found or p is null then raise exception 'This private match is unavailable';end if;
 now_at:=clock_timestamp();
 old_status:=m.status;
 s:=m.state;
 if m.status='playing' and now_at>=m.ends_at then
  m.status:=case when (s->'scores'->>0)::int=(s->'scores'->>1)::int then 'draw' else 'won' end;
  m.winner:=case when m.status='draw' then null when (s->'scores'->>0)::int>(s->'scores'->>1)::int then 0 else 1 end;
 elsif typ='ready' and m.status='waiting' then
  s:=jsonb_set(s,array['ready',p::text],'true');
  if s->'ready'='[true,true]'::jsonb then m.status:='playing';m.starts_at:=now_at+interval '3 seconds';m.ends_at:=m.starts_at+make_interval(secs=>m.duration);end if;
 elsif typ='cancel' and m.status='waiting' then m.status:='cancelled';
 elsif typ='place' and m.status='playing' then
  if now_at<m.starts_at then raise exception 'Wait for the shared countdown';end if;
  move_id:=(action->>'move_id')::uuid;
  if move_id is null then raise exception 'Move ID is required';end if;
  if s->'last_moves'->>p=move_id::text then return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());end if;
  piece:=(action->>'piece')::int;rr:=(action->>'row')::int;cc:=(action->>'col')::int;
  if piece is null or piece not between 0 and 2 or rr is null or cc is null then raise exception 'Choose a piece and a board position';end if;
  b:=s->'boards'->p;u:=s->'used'->p;h:=s->'hands'->p;shape:=(h->>piece)::int;
  if (u->>piece)::boolean or not block_fits(b,shape,rr,cc) then raise exception 'That piece needs an empty space';end if;
  for off in select value::int from jsonb_array_elements_text(block_shape(shape)) loop b:=jsonb_set(b,array[((rr+off/8)*8+cc+off%8)::text],'1');end loop;
  for r in 0..7 loop
   if not exists(select 1 from generate_series(0,7) j where (b->>(r*8+j))::int=0) then rows_done:=array_append(rows_done,r);end if;
   if not exists(select 1 from generate_series(0,7) j where (b->>(j*8+r))::int=0) then cols_done:=array_append(cols_done,r);end if;
  end loop;
  lines:=cardinality(rows_done)+cardinality(cols_done);
  foreach r in array rows_done loop for c in 0..7 loop b:=jsonb_set(b,array[(r*8+c)::text],'0');end loop;end loop;
  foreach c in array cols_done loop for r in 0..7 loop b:=jsonb_set(b,array[(r*8+c)::text],'0');end loop;end loop;
  points:=jsonb_array_length(block_shape(shape))*10+lines*100+greatest(0,lines-1)*50;
  s:=jsonb_set(s,array['scores',p::text],to_jsonb((s->'scores'->>p)::int+points));
  s:=jsonb_set(s,array['boards',p::text],b);u:=jsonb_set(u,array[piece::text],'true');
  if u='[true,true,true]'::jsonb then
   r:=(s->'rounds'->>p)::int+1;if r>5000 then raise exception 'Match move limit reached';end if;
   s:=jsonb_set(s,array['rounds',p::text],to_jsonb(r));h:=block_hand(m.seed,r);u:='[false,false,false]';
  end if;
  s:=jsonb_set(s,array['hands',p::text],h);s:=jsonb_set(s,array['used',p::text],u);
  for piece in 0..2 loop if not (u->>piece)::boolean then
   for r in 0..7 loop for c in 0..7 loop if block_fits(b,(h->>piece)::int,r,c) then stuck:=false;exit;end if;end loop;exit when not stuck;end loop;
  end if;exit when not stuck;end loop;
  s:=jsonb_set(s,array['stuck',p::text],to_jsonb(stuck));s:=jsonb_set(s,array['last_moves',p::text],to_jsonb(move_id::text));
  if s->'stuck'='[true,true]'::jsonb then
   m.status:=case when (s->'scores'->>0)::int=(s->'scores'->>1)::int then 'draw' else 'won' end;
   m.winner:=case when m.status='draw' then null when (s->'scores'->>0)::int>(s->'scores'->>1)::int then 0 else 1 end;
  end if;
 elsif typ not in('get','finish','ready','cancel') and m.status not in('won','draw','cancelled') then raise exception 'This action is unavailable';
 end if;
 if s is distinct from m.state or m.status is distinct from old_status then
  update block_matches set state=s,status=m.status,starts_at=m.starts_at,ends_at=m.ends_at,winner=m.winner,revision=revision+1 where id=m.id returning * into m;
 end if;
 return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());
end $$;
create function public.start_block_battle(seconds int) returns jsonb language plpgsql security definer set search_path=public as $$
declare m block_matches;c uuid:=my_couple();seed int;board jsonb;
begin
 if c is null then raise exception 'Your private invitation is required';end if;
 if seconds is null or seconds not in(60,120,180,300) then raise exception 'Choose 1, 2, 3 or 5 minutes';end if;
 if (select count(*) from profiles where couple_id=c)<>2 then raise exception 'Both accounts must be linked';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'block-battle'));
 select * into m from block_matches where couple_id=c and status in('waiting','playing') order by created_at desc limit 1;
 if found then
  if m.status='waiting' or clock_timestamp()<m.ends_at then return block_battle(m.id,'{"type":"get"}');end if;
  perform block_battle(m.id,'{"type":"finish"}');
 end if;
 seed:=floor(random()*1000000)::int;select jsonb_agg(0) into board from generate_series(1,64);
 insert into block_matches(couple_id,duration,seed,state) values(c,seconds,seed,jsonb_build_object(
 'boards',jsonb_build_array(board,board),'scores','[0,0]'::jsonb,'hands',jsonb_build_array(block_hand(seed,0),block_hand(seed,0)),
 'used','[[false,false,false],[false,false,false]]'::jsonb,'rounds','[0,0]'::jsonb,'ready','[false,false]'::jsonb,'stuck','[false,false]'::jsonb,'last_moves','[null,null]'::jsonb)) returning * into m;
 return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());
end $$;
revoke execute on function public.block_shape(int),public.block_hand(int,int),public.block_fits(jsonb,int,int,int),public.block_battle(uuid,jsonb),public.start_block_battle(int) from public,anon;
grant execute on function public.block_battle(uuid,jsonb),public.start_block_battle(int) to authenticated;
create or replace function public.scoreboard() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_array(count(*) filter(where winner='0'),count(*) filter(where winner='1')) from(
 select state->>'winner' as winner from games where couple_id=my_couple() and state->>'status'='won'
 union all select winner::text from block_matches where couple_id=my_couple() and status='won') wins $$;
alter publication supabase_realtime add table public.block_matches;
create policy block_realtime_read on realtime.messages for select to authenticated using(realtime.topic()='block:'||public.my_couple()::text);
notify pgrst,'reload schema';
commit;

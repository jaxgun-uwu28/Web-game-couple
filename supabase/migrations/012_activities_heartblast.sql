begin;
-- BEGIN CANONICAL RULES
create or replace function heartblast_rules() returns jsonb language sql immutable as $$ select '{"version":2,"shapes":[[0],[0,1],[0,8],[0,1,2],[0,8,16],[0,1,8,9],[0,8,9],[0,1,9],[0,1,2,8,9,10],[0,1,2,9],[0,1,2,3],[0,8,16,17],[0,8,16,24],[0,1,2,3,4],[0,8,16,24,32],[0,1,2,8,9,10,16,17,18],[0,1,8,9,16,17],[0,1,8],[1,8,9],[0,1,2,8,16],[0,1,2,10,18],[0,8,16,17,18],[2,10,16,17,18],[0,1,2,8],[0,1,2,10],[0,1,8,16],[0,1,9,17],[0,8,16,17],[1,9,16,17],[1,8,9,17],[0,8,9,16],[1,2,8,9],[0,1,9,10],[0,9],[1,8],[1,8,9,10],[2,8,9,10]],"smallShapes":[0,1,2,3,4,6,7,17,18,33,34],"scoring":{"cell":1,"line":10,"comboStep":0.5,"comboCap":3,"emptyBonus":100},"styles":["heart","strawberry","peach","cloud","sparkle"]}'::jsonb $$;
-- END CANONICAL RULES
create table if not exists activity_wheels(couple_id uuid primary key references couples,entries jsonb not null default '[]',revision int not null default 0);
alter table activity_wheels enable row level security;
drop policy if exists wheel_read on activity_wheels;
create policy wheel_read on activity_wheels for select to authenticated using(couple_id=my_couple());
grant select on activity_wheels to authenticated;
drop policy if exists heart_preview_write on realtime.messages;
create policy heart_preview_write on realtime.messages for insert to authenticated with check(realtime.topic()='block:'||my_couple()::text);
create or replace function save_wheel(content jsonb,expected_revision int) returns int language plpgsql security definer set search_path=public as $$ declare n int;c uuid:=my_couple();begin
 if c is null or jsonb_typeof(content)<>'array' or jsonb_array_length(content)>100 or exists(select 1 from jsonb_array_elements(content) e where length(trim(e->>'text')) not between 1 and 80 or length(e->>'id') not between 1 and 80 or e->>'id' is null or e->>'text' is null) then raise exception 'Add up to 100 short entries';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'wheel'));
 insert into activity_wheels(couple_id) values(c) on conflict do nothing;
 update activity_wheels set entries=content,revision=revision+1 where couple_id=c and revision=expected_revision returning revision into n;
 if n is null then raise exception 'The wheel changed. Reopen it and try again';end if;return n;
end $$;
create table if not exists match_moves(seq bigint generated always as identity primary key,match_id uuid not null references block_matches,move_id uuid not null unique,slot int not null check(slot in(0,1)),action jsonb not null,accepted_at timestamptz not null default clock_timestamp());
alter table match_moves enable row level security;
drop policy if exists heart_moves_read on match_moves;
create policy heart_moves_read on match_moves for select to authenticated using(exists(select 1 from block_matches where id=match_id and couple_id=my_couple()));
grant select on match_moves to authenticated;
alter table block_matches drop constraint if exists block_matches_duration_check;
alter table block_matches add constraint block_matches_duration_check check(duration between 30 and 1800);
create or replace function heart_fit(b jsonb,shape int,rr int,cc int) returns boolean language sql immutable as $$ select rr between 0 and 7 and cc between 0 and 7 and heartblast_rules()->'shapes'->shape is not null and not exists(select 1 from jsonb_array_elements_text(heartblast_rules()->'shapes'->shape) d where rr+d::int/8>7 or cc+d::int%8>7 or coalesce((b->>((rr+d::int/8)*8+cc+d::int%8))::int,1)<>0) $$;
create or replace function heart_has_move(b jsonb,h jsonb,u jsonb) returns boolean language sql immutable as $$ select exists(select 1 from generate_series(0,2) i,generate_series(0,63) j where not (u->>i)::boolean and heart_fit(b,(h->>i)::int,j/8,j%8)) $$;
create or replace function heart_hand(seed int,tray int,b jsonb default null) returns jsonb language plpgsql immutable as $$ declare h jsonb;small jsonb:=heartblast_rules()->'smallShapes';begin
 h:=jsonb_build_array(small->(((seed::bigint+tray::bigint*31)*48271%2147483647)%jsonb_array_length(small))::int,((seed::bigint+tray::bigint*31+17)*48271%2147483647)%jsonb_array_length(heartblast_rules()->'shapes'),((seed::bigint+tray::bigint*31+34)*48271%2147483647)%jsonb_array_length(heartblast_rules()->'shapes'));
 if b is not null and not heart_has_move(b,h,'[false,false,false]') then h:=jsonb_set(h,'{0}','0');end if;return h;
end $$;
create or replace function heart_initial(seed int,opts jsonb) returns jsonb language sql immutable as $$ select jsonb_build_object('options',opts,'boards',jsonb_build_array((select jsonb_agg(0) from generate_series(1,64)),(select jsonb_agg(0) from generate_series(1,64))),'scores','[0,0]'::jsonb,'hands',jsonb_build_array(heart_hand(seed,0),heart_hand(seed,0)),'used','[[false,false,false],[false,false,false]]'::jsonb,'rounds','[0,0]'::jsonb,'ready',case when opts->>'mode'='daily' then '[true,true]'::jsonb else '[false,false]'::jsonb end,'stuck','[false,false]'::jsonb,'combos','[0,0]'::jsonb,'pieces','[0,0]'::jsonb,'breakdown','[[0,0,0],[0,0,0]]'::jsonb,'turn',0) $$;
create or replace function heart_step(s jsonb,seed int,actor int,a jsonb) returns jsonb language plpgsql immutable as $$
declare p int:=case when (s->'options'->>'coop')::boolean then 0 else actor end;opts jsonb:=s->'options';b jsonb;h jsonb;u jsonb;piece int;shape int;rr int;cc int;o int;r int;c int;rows_done int[]:='{}';cols_done int[]:='{}';removed int[]:='{}';lines int;combo int;mult numeric;placement int;clearpoints int;bonus int;points int;tray int;idx int;other int:=1-actor;candidate jsonb;spec jsonb:=heartblast_rules()->'scoring';begin
 if a->>'type'='out' then return jsonb_set(s,array['stuck',p::text],'true');end if;
 if a->>'type'<>'place' or (s->'stuck'->>p)::boolean then raise exception 'This board is finished';end if;
 if (opts->>'coop')::boolean and actor<>(s->>'turn')::int then raise exception 'Wait for your turn';end if;
 piece:=(a->>'piece')::int;rr:=(a->>'row')::int;cc:=(a->>'col')::int;
 if piece is null or piece not between 0 and 2 or rr is null or cc is null then raise exception 'Choose a piece and position';end if;
 b:=s->'boards'->p;h:=s->'hands'->p;u:=s->'used'->p;shape:=(h->>piece)::int;
 if (u->>piece)::boolean or not heart_fit(b,shape,rr,cc) then raise exception 'That piece needs an empty space';end if;
 for o in select value::int from jsonb_array_elements_text(heartblast_rules()->'shapes'->shape) loop b:=jsonb_set(b,array[((rr+o/8)*8+cc+o%8)::text],to_jsonb(shape%5+1));end loop;
 for r in 0..7 loop
 if not exists(select 1 from generate_series(0,7) j where (b->>(r*8+j))::int=0) then rows_done:=array_append(rows_done,r);end if;
 if not exists(select 1 from generate_series(0,7) j where (b->>(j*8+r))::int=0) then cols_done:=array_append(cols_done,r);end if;end loop;
 lines:=cardinality(rows_done)+cardinality(cols_done);
 for idx in 0..63 loop r:=idx/8;c:=idx%8;if r=any(rows_done) or c=any(cols_done) or ((b->>idx)::int=-1 and (exists(select 1 from unnest(rows_done) x where abs(x-r)<=1) or exists(select 1 from unnest(cols_done) x where abs(x-c)<=1))) then b:=jsonb_set(b,array[idx::text],'0');removed:=array_append(removed,idx);end if;end loop;
 combo:=case when lines>0 then (s->'combos'->>p)::int+1 else 0 end;
 mult:=least((spec->>'comboCap')::numeric,1+greatest(0,combo-1)*(spec->>'comboStep')::numeric);
 placement:=jsonb_array_length(heartblast_rules()->'shapes'->shape)*(spec->>'cell')::int;clearpoints:=floor((spec->>'line')::int*lines*lines*mult);
 bonus:=case when not exists(select 1 from jsonb_array_elements_text(b) v where v::int<>0) then (spec->>'emptyBonus')::int else 0 end;points:=placement+clearpoints+bonus;
 s:=jsonb_set(s,array['boards',p::text],b);s:=jsonb_set(s,array['scores',p::text],to_jsonb((s->'scores'->>p)::int+points));s:=jsonb_set(s,array['combos',p::text],to_jsonb(combo));s:=jsonb_set(s,array['pieces',p::text],to_jsonb((s->'pieces'->>p)::int+1));
 s:=jsonb_set(s,array['breakdown',p::text],jsonb_build_array((s->'breakdown'->p->>0)::int+placement,(s->'breakdown'->p->>1)::int+clearpoints,(s->'breakdown'->p->>2)::int+bonus));
 u:=jsonb_set(u,array[piece::text],'true');if u='[true,true,true]'::jsonb then tray:=(s->'rounds'->>p)::int+1;s:=jsonb_set(s,array['rounds',p::text],to_jsonb(tray));h:=heart_hand(seed,tray,case when (opts->>'coop')::boolean or opts->>'mode'='daily' then b else null end);u:='[false,false,false]';end if;
 s:=jsonb_set(s,array['hands',p::text],h);s:=jsonb_set(s,array['used',p::text],u);s:=jsonb_set(s,array['stuck',p::text],to_jsonb(not heart_has_move(b,h,u)));s:=jsonb_set(s,'{turn}',to_jsonb(1-actor));
 -- Sleepy clouds are capped at four, and a cloud never removes the last legal move.
 if lines>=2 and (opts->>'junk')::boolean and not (opts->>'coop')::boolean and opts->>'mode'<>'daily' then
 b:=s->'boards'->other;
 for c in 1..least(lines,2) loop exit when (select count(*) from jsonb_array_elements_text(b) x where x::int=-1)>=4;
 for r in 0..63 loop idx:=(seed+(s->'pieces'->>p)::int*17+c*13+r)%64;if (b->>idx)::int=0 then candidate:=jsonb_set(b,array[idx::text],'-1');if heart_has_move(candidate,s->'hands'->other,s->'used'->other) then b:=candidate;exit;end if;end if;end loop;end loop;
 s:=jsonb_set(s,array['boards',other::text],b);end if;
 return s||jsonb_build_object('last',jsonb_build_object('seat',p,'points',points,'placement',placement,'clear',clearpoints,'bonus',bonus,'combo',combo,'multiplier',mult,'lines',lines,'cleared',to_jsonb(removed)));
end $$;
create or replace function heart_winner(s jsonb) returns int language sql immutable as $$ select case when (s->'options'->>'coop')::boolean then null when (s->'scores'->>0)::int>(s->'scores'->>1)::int then 0 when (s->'scores'->>1)::int>(s->'scores'->>0)::int then 1 when (s->'pieces'->>0)::int<(s->'pieces'->>1)::int then 0 when (s->'pieces'->>1)::int<(s->'pieces'->>0)::int then 1 else null end $$;
create or replace function start_heartblast(config jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare m block_matches;c uuid:=my_couple();opts jsonb;mode text:=coalesce(config->>'mode','timed');d int:=coalesce((config->>'seconds')::int,120);seed int;day date:=(clock_timestamp() at time zone 'Asia/Manila')::date;begin
 if c is null or mode not in('timed','endless','race','daily') or d not between 30 and 1800 or coalesce((config->>'target')::int,500) not in(500,1000,2000) then raise exception 'Choose a valid battle setup';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'heartblast'));
 perform expire_game_sessions(c);
 select * into m from block_matches where couple_id=c and state->'options'->>'mode'=mode and ((mode='daily' and state->'options'->>'day'=day::text) or (mode<>'daily' and status in('waiting','playing'))) order by created_at desc limit 1;
 if found then return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());end if;
 seed:=case when mode='daily' then (day-date '2025-09-06')+100000 else floor(random()*1000000)::int+1 end;
 opts:=jsonb_build_object('mode',mode,'seconds',d,'target',coalesce((config->>'target')::int,500),'coop',mode<>'daily' and coalesce((config->>'coop')::boolean,false),'junk',mode<>'daily' and not coalesce((config->>'coop')::boolean,false) and coalesce((config->>'junk')::boolean,false),'preview',coalesce((config->>'preview')::boolean,true),'day',day::text);
 insert into block_matches(couple_id,duration,seed,status,starts_at,ends_at,state) values(c,d,seed,case when mode='daily' then 'playing' else 'waiting' end,case when mode='daily' then clock_timestamp() else null end,case when mode='daily' then clock_timestamp()+interval '24 hours' else null end,heart_initial(seed,opts)) returning * into m;
 return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());
end $$;
create or replace function heartblast_battle(gid uuid,action jsonb default '{"type":"get"}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m block_matches;s jsonb;opts jsonb;typ text:=action->>'type';p int:=my_slot();mode text;v match_moves;at_time timestamptz;move uuid;over boolean:=false;previous jsonb;begin
 select * into m from block_matches where id=gid and couple_id=my_couple() for update;if not found or p is null then raise exception 'Battle unavailable';end if;
 if m.state->'options' is null then return block_battle(gid,action);end if;
 previous:=to_jsonb(m);
 at_time:=clock_timestamp();s:=m.state;opts:=s->'options';mode:=opts->>'mode';
 if typ='cancel' and m.status in('waiting','playing') then m.status:='cancelled';delete from game_presence where game_id=gid and kind='block';
 elsif m.status in('waiting','playing') then
 if mode in('endless','daily') and at_time>m.created_at+interval '24 hours' then over:=true;
 elsif mode='timed' and m.ends_at is not null and at_time>m.ends_at+interval '1 second' then over:=true;
 elsif typ='ready' and (m.status='waiting' or mode='endless') then
 if mode<>'endless' and not game_pair_present(gid,'block') then raise exception 'Waiting for your person';end if;
 s:=jsonb_set(s,array['ready',p::text],'true');
 if mode='endless' or s->'ready'='[true,true]'::jsonb then m.status:='playing';m.starts_at:=coalesce(m.starts_at,at_time+interval '3 seconds');m.ends_at:=case when mode='timed' then m.starts_at+make_interval(secs=>m.duration) when mode='endless' then m.created_at+interval '24 hours' else null end;end if;
 elsif typ in('place','out') and m.status='playing' then
 if at_time<m.starts_at then raise exception 'Wait for the countdown';end if;
 if mode not in('endless','daily') and not game_pair_present(gid,'block') then raise exception 'Waiting for your person';end if;
 if mode='endless' and not (s->'ready'->>p)::boolean then raise exception 'Tap Ready first';end if;
 move:=(action->>'move_id')::uuid;if move is null then raise exception 'Move ID required';end if;
 if exists(select 1 from match_moves where move_id=move and match_id=gid and slot=p) then return jsonb_build_object('match',to_jsonb(m),'server_now',at_time);end if;
 if (select count(*) from match_moves where match_id=gid)>=4096 then raise exception 'Move limit reached';end if;
 -- Replay the accepted log under the match lock; no client score or board is trusted.
 s:=heart_initial(m.seed,opts)||jsonb_build_object('ready',s->'ready');
 for v in select * from match_moves where match_id=gid order by seq loop s:=heart_step(s,m.seed,v.slot,v.action);end loop;
 s:=heart_step(s,m.seed,p,action);
 insert into match_moves(match_id,move_id,slot,action,accepted_at) values(gid,move,p,action,at_time);
 if mode='race' and (s->'scores'->case when (opts->>'coop')::boolean then 0 else p end)::int >=(opts->>'target')::int then m.winner:=case when (opts->>'coop')::boolean then null else p end;over:=true;
 elsif (opts->>'coop')::boolean and (s->'stuck'->>0)::boolean then over:=true;
 elsif mode<>'timed' and s->'stuck'='[true,true]'::jsonb then over:=true;end if;
 elsif typ not in('get','finish','ready') then raise exception 'Action unavailable';end if;
 if over then if mode<>'race' or m.winner is null then m.winner:=heart_winner(s);end if;m.status:=case when m.winner is null then 'draw' else 'won' end;delete from game_presence where game_id=gid and kind='block';end if;
 end if;
 if s is distinct from m.state or to_jsonb(m) is distinct from previous then update block_matches set state=s,status=m.status,starts_at=m.starts_at,ends_at=m.ends_at,winner=m.winner,revision=revision+1 where id=gid returning * into m;end if;
 return jsonb_build_object('match',to_jsonb(m),'server_now',clock_timestamp());
end $$;
-- Async runs survive navigation, but explicit Exit still cancels the whole match.
do $$ declare def text;begin select pg_get_functiondef('expire_game_sessions(uuid)'::regprocedure) into def;def:=replace(def,'status in(''waiting'',''playing'') and exists','status in(''waiting'',''playing'') and coalesce(state->''options''->>''mode'',''timed'') not in(''endless'',''daily'') and exists');execute def;end $$;
revoke all on function heartblast_rules(),heart_fit(jsonb,int,int,int),heart_has_move(jsonb,jsonb,jsonb),heart_hand(int,int,jsonb),heart_initial(int,jsonb),heart_step(jsonb,int,int,jsonb),heart_winner(jsonb) from public,anon,authenticated;
revoke all on function save_wheel(jsonb,int),start_heartblast(jsonb),heartblast_battle(uuid,jsonb) from public,anon;
grant execute on function save_wheel(jsonb,int),start_heartblast(jsonb),heartblast_battle(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

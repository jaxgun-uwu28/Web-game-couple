-- Run after 008. Gemini secrets and answer keys never have client SELECT grants.
begin;
alter table couples add column timezone text not null default 'Asia/Manila';
alter table couples add column use_ai_questions boolean not null default true;
create table question_bank (
 id uuid primary key default gen_random_uuid(), topic text not null, question text not null,
 options jsonb not null, correct_index int not null check(correct_index between 0 and 3),
 fun_fact text not null, hash text not null, difficulty text not null default 'Easy-Medium',
 source text not null default 'ai', times_used int not null default 0, flagged boolean not null default false,
 created_at timestamptz not null default now(), unique(topic,hash)
);
create table question_history(couple_id uuid references couples,hash text not null,topic text not null,question text not null,used_at timestamptz not null default now(),primary key(couple_id,hash));
create table brain_duel_questions(game_id uuid references games on delete cascade,position int not null,bank_id uuid references question_bank,question text not null,options jsonb not null,correct_index int not null,fun_fact text not null,primary key(game_id,position));
create table generation_jobs(couple_id uuid references couples,kind text not null,topic text not null,token uuid not null default gen_random_uuid(),status text not null default 'running',lease_until timestamptz not null default now()+interval '20 seconds',updated_at timestamptz not null default now(),primary key(couple_id,kind,topic));
create table ai_usage(id bigint generated always as identity primary key,model text not null,created_at timestamptz not null default now());
create index ai_usage_time on ai_usage(created_at);
create table ai_health(id int primary key check(id=1),failures int not null default 0,paused_until timestamptz,last_error text);
insert into ai_health(id) values(1);
create table daily_questions(couple_id uuid references couples,date date not null,text text not null,mood text not null,hash text not null,source text not null,primary key(couple_id,date));
create table would_you_rather(couple_id uuid references couples,date date not null,option_a text not null,option_b text not null,hash text not null,source text not null,primary key(couple_id,date));
do $$ declare t text;begin foreach t in array array['question_bank','question_history','brain_duel_questions','generation_jobs','ai_usage','ai_health','daily_questions','would_you_rather'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);execute format('grant all on %I to service_role',t);end loop;end $$;
grant usage,select on sequence ai_usage_id_seq to service_role;
grant select on generation_jobs,daily_questions,would_you_rather to authenticated;
create policy jobs_member on generation_jobs for select to authenticated using(couple_id=my_couple());
create policy daily_member on daily_questions for select to authenticated using(couple_id=my_couple());
create policy choice_member on would_you_rather for select to authenticated using(couple_id=my_couple());
alter publication supabase_realtime add table generation_jobs;

-- Atomic, global budgets cover every actual HTTP attempt, including fallback models.
create function ai_reserve(model_name text,rpm int,budget int) returns boolean language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(909001);
 if exists(select 1 from ai_health where paused_until>now()) then return false;end if;
 if (select count(*) from ai_usage where created_at>now()-interval '60 seconds')>=least(greatest(rpm,0),4) or (select count(*) from ai_usage where created_at>date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=least(greatest(budget,0),60) then return false;end if;
 insert into ai_usage(model) values(model_name);return true;end $$;
create function ai_outcome(message text default null) returns void language plpgsql security definer set search_path=public as $$ begin
 if message is null then update ai_health set failures=0,last_error=null where id=1;
 else update ai_health set failures=failures+1,last_error=left(message,120),paused_until=case when failures+1>=3 then now()+interval '10 minutes' else paused_until end where id=1;end if;end $$;
create function ai_claim(c uuid,k text,t text) returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid;begin
 insert into generation_jobs(couple_id,kind,topic) values(c,k,t) on conflict(couple_id,kind,topic) do update set token=gen_random_uuid(),status='running',lease_until=now()+interval '20 seconds',updated_at=now() where generation_jobs.status<>'running' or generation_jobs.lease_until<now() returning token into result;return result;end $$;
create function ai_finish(c uuid,k text,t text,lease uuid) returns void language sql security definer set search_path=public as $$ update generation_jobs set status='done',updated_at=now() where couple_id=c and kind=k and topic=t and token=lease $$;
-- A client timeout may take over with SAVED content only, never another AI call.
create function ai_claim_saved(c uuid,t text) returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid;begin
 insert into generation_jobs(couple_id,kind,topic) values(c,'trivia',t) on conflict(couple_id,kind,topic) do update set token=gen_random_uuid(),status='running',lease_until=now()+interval '20 seconds',updated_at=now() returning token into result;return result;end $$;
revoke execute on function ai_claim_saved(uuid,text) from public,anon,authenticated;
grant execute on function ai_claim_saved(uuid,text) to service_role;
create function ai_bank_context(c uuid,t text,d text) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('available',coalesce((select jsonb_agg(to_jsonb(b)) from (select b.* from question_bank b where topic=t and not flagged and (difficulty=d or source='fallback') and not exists(select 1 from question_history h where h.couple_id=c and h.hash=b.hash) order by times_used,created_at,id limit 3000)b),'[]'::jsonb),'history',coalesce((select jsonb_agg(question) from(select question from question_history where couple_id=c and topic=t order by used_at desc limit 40)h),'[]'::jsonb));
$$;
revoke execute on function ai_bank_context(uuid,text,text) from public,anon,authenticated;
grant execute on function ai_bank_context(uuid,text,text) to service_role;
create policy ai_live_read on realtime.messages for select to authenticated using(realtime.topic() in('ai-content:'||my_couple()::text,'ai-trivia:'||my_couple()::text));

-- The only new-duel writer; row lock serializes both phones and reserves unseen hashes.
create function ai_start_duel(c uuid,t text,n int,d text,lease uuid) returns games language plpgsql security definer set search_path=public as $$ declare g games;qs jsonb; picked uuid[];begin
 perform pg_advisory_xact_lock(hashtext(c::text||'trivia'));
 select * into g from games where couple_id=c and kind='trivia' and state->>'status'='playing' order by created_at desc limit 1;if found then return g;end if;
 if n not in(3,5,10) or d not in('Easy','Easy-Medium') or not exists(select 1 from generation_jobs where couple_id=c and kind='trivia' and topic=t and token=lease and lease_until>now()) then raise exception 'Question shuffle expired';end if;
 select array_agg(id) into picked from(select id from question_bank b where b.topic=t and not b.flagged and (b.difficulty=d or b.source='fallback') and not exists(select 1 from question_history h where h.couple_id=c and h.hash=b.hash) order by b.times_used,b.created_at,b.id limit n) p;
 if coalesce(cardinality(picked),0)<n then raise exception 'Not enough saved questions';end if;
 select jsonb_agg(jsonb_build_object('q',question,'options',options,'id',id) order by ord) into qs from unnest(picked) with ordinality p(id,ord) join question_bank b using(id);
 insert into games(couple_id,kind,state) values(c,'trivia',jsonb_build_object('pack','gemini-v1','status','playing','turn',0,'round',0,'scores',jsonb_build_array(0,0),'winner',null,'submitted','[]'::jsonb,'topic',t,'count',n,'difficulty',d,'questions',qs,'source',case when exists(select 1 from question_bank where id=any(picked) and source<>'ai') then 'saved' else 'ai' end,'results','[]'::jsonb)) returning * into g;
 insert into brain_duel_questions select g.id,ord::int,id,question,options,correct_index,fun_fact from unnest(picked) with ordinality p(id,ord) join question_bank b using(id);
 insert into question_history select c,hash,t,question,now() from question_bank where id=any(picked) on conflict do nothing;
 update question_bank set times_used=times_used+1 where id=any(picked);return g;end $$;
-- Block old RPC bypasses for NEW trivia, preserve existing in-flight packs.
alter function new_game(text) rename to new_game_pre_ai;
revoke execute on function new_game_pre_ai(text) from public,anon,authenticated;
create function new_game(k text) returns games language plpgsql security definer set search_path=public as $$ declare g games;begin
 if k='trivia' then select * into g from games where couple_id=my_couple() and kind=k and state->>'status'='playing' order by created_at desc limit 1;if found then return g;end if;raise exception 'Choose a topic in Brain Duel first';end if;return new_game_pre_ai(k);end $$;
alter function play_game(uuid,jsonb) rename to play_game_pre_ai;
revoke execute on function play_game_pre_ai(uuid,jsonb) from public,anon,authenticated;
create function play_game(gid uuid,action jsonb) returns games language plpgsql security definer set search_path=public as $$ declare g games;s jsonb;r int;p int:=my_slot();a0 jsonb;a1 jsonb;q brain_duel_questions;scores jsonb;result jsonb;begin
 select * into g from games where id=gid and couple_id=my_couple() for update;if not found or p is null then raise exception 'Game unavailable';end if;
 if g.state->>'pack'<>'gemini-v1' then return play_game_pre_ai(gid,action);end if;
 s:=g.state;if s->>'status'<>'playing' then raise exception 'This game has finished';end if;r:=(s->>'round')::int;
 if action->>'answer' is null or action->>'answer' not in('0','1','2','3') then raise exception 'Choose an answer';end if;
 if exists(select 1 from game_answers where game_id=gid and round=r and user_id=auth.uid()) then raise exception 'Your answer is already sealed';end if;
 insert into game_answers values(gid,r,auth.uid(),jsonb_build_object('answer',action->>'answer'));
 select a.answer into a0 from game_answers a join profiles p on p.id=a.user_id where a.game_id=gid and a.round=r and p.slot=0;
 select a.answer into a1 from game_answers a join profiles p on p.id=a.user_id where a.game_id=gid and a.round=r and p.slot=1;
 s:=s||jsonb_build_object('submitted',(select jsonb_agg(p.slot) from game_answers a join profiles p on p.id=a.user_id where a.game_id=gid and a.round=r));
 if a0 is not null and a1 is not null then
 select * into q from brain_duel_questions where game_id=gid and position=r+1;
 scores:=jsonb_build_array((s->'scores'->>0)::int+case when (a0->>'answer')::int=q.correct_index then 1 else 0 end,(s->'scores'->>1)::int+case when (a1->>'answer')::int=q.correct_index then 1 else 0 end);
 result:=jsonb_build_object('answers',jsonb_build_array(a0,a1),'correct',q.correct_index::text,'funFact',q.fun_fact,'position',r+1);
 s:=s||jsonb_build_object('scores',scores,'round',r+1,'last',result,'results',(s->'results')||jsonb_build_array(result),'submitted','[]'::jsonb);
 if r+1=(s->>'count')::int then s:=s||jsonb_build_object('status',case when scores->>0=scores->>1 then 'draw' else 'won' end,'winner',case when scores->>0=scores->>1 then null when (scores->>0)::int>(scores->>1)::int then 0 else 1 end);end if;end if;
 update games set state=s where id=gid returning * into g;return g;end $$;
create function report_question(gid uuid,pos int) returns void language plpgsql security definer set search_path=public as $$ begin
 if not exists(select 1 from games where id=gid and couple_id=my_couple()) then raise exception 'Game unavailable';end if;
 update question_bank set flagged=true where id=(select bank_id from brain_duel_questions where game_id=gid and position=pos);end $$;
create function set_ai_questions(enabled boolean,tz text default null) returns void language plpgsql security definer set search_path=public as $$ begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 if tz is not null and not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Choose a valid timezone';end if;
 update couples set use_ai_questions=enabled,timezone=coalesce(tz,timezone) where id=my_couple();end $$;

-- Carry the saved timezone through both answer writes and sealed-answer reads.
create function couple_day() returns date language sql stable security definer set search_path=public as $$ select (now() at time zone timezone)::date from couples where id=my_couple() $$;
create or replace function answer_today(k text,content text) returns void language plpgsql security definer set search_path=public as $$ begin
 if my_couple() is null or k not in('daily','choice') or length(trim(content)) not between 1 and 2000 then raise exception 'Invalid answer';end if;
 if k='choice' and content not in('0','1') then raise exception 'Choose an option';end if;
 insert into answers values(my_couple(),couple_day(),k,auth.uid(),trim(content)) on conflict do nothing;end $$;
create or replace function seal_connection_answer(kind text,value text,for_day date) returns void language plpgsql security definer set search_path=public as $$ begin
 if for_day is null or for_day<>couple_day() then raise exception 'A new day has begun. Refresh today’s question before answering';end if;perform answer_today(kind,value);end $$;
-- Existing today_answers has a local date declaration; retain its reveal/streak implementation.
do $$ declare definition text;begin select pg_get_functiondef('public.today_answers()'::regprocedure) into definition;definition:=replace(definition,'(now() at time zone ''Asia/Manila'')::date','couple_day()');execute definition;end $$;
revoke execute on function new_game(text),play_game(uuid,jsonb),report_question(uuid,int),set_ai_questions(boolean,text),couple_day() from public,anon;
grant execute on function new_game(text),play_game(uuid,jsonb),report_question(uuid,int),set_ai_questions(boolean,text),couple_day() to authenticated;
revoke execute on function ai_reserve(text,int,int),ai_outcome(text),ai_claim(uuid,text,text),ai_finish(uuid,text,text,uuid),ai_start_duel(uuid,text,int,text,uuid) from public,anon,authenticated;
grant execute on function ai_reserve(text,int,int),ai_outcome(text),ai_claim(uuid,text,text),ai_finish(uuid,text,text,uuid),ai_start_duel(uuid,text,int,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;

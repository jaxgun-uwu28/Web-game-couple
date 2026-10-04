begin;
create table public.mood_checkins (
 couple_id uuid not null references public.couples,
 day date not null default (now() at time zone 'Asia/Manila')::date,
 user_id uuid not null references public.profiles,
 mood text not null check(mood in('happy','calm','tired','stressed','low')),
 note text not null default '' check(length(note)<=160),
 updated_at timestamptz not null default now(),
 primary key(couple_id,day,user_id)
);
create table public.connection_taps (
 id uuid primary key default gen_random_uuid(),
 couple_id uuid not null references public.couples,
 sender uuid not null references public.profiles,
 recipient uuid not null references public.profiles,
 created_at timestamptz not null default now(),
 check(sender<>recipient)
);
create index connection_taps_recent on public.connection_taps(couple_id,created_at desc);
create function public.seal_connection_answer(kind text,value text,for_day date) returns void
language plpgsql security definer set search_path=public as $$
begin
 if my_couple() is null then raise exception 'Your private account is required';end if;
 if for_day is null or for_day<>(now() at time zone 'Asia/Manila')::date then raise exception 'A new day has begun. Refresh today’s question before answering';end if;
 perform answer_today(kind,value);
end $$;
alter table public.mood_checkins enable row level security;
alter table public.connection_taps enable row level security;
create policy mood_member_read on public.mood_checkins for select to authenticated using(couple_id=public.my_couple());
create policy tap_member_read on public.connection_taps for select to authenticated using(couple_id=public.my_couple());
revoke all on public.mood_checkins,public.connection_taps from anon,authenticated;
grant select on public.mood_checkins,public.connection_taps to authenticated;

create function public.check_in_mood(value text, message text default '') returns void
language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();
begin
 if c is null then raise exception 'Your private account is required';end if;
 if value is null or value not in('happy','calm','tired','stressed','low') or message is null or length(message)>160 then raise exception 'Choose a mood and a note up to 160 characters';end if;
 insert into mood_checkins(couple_id,user_id,mood,note) values(c,auth.uid(),value,trim(message))
 on conflict(couple_id,day,user_id) do update set mood=excluded.mood,note=excluded.note,updated_at=now();
end $$;
create function public.thinking_of_you() returns void
language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();p uuid;
begin
 if c is null then raise exception 'Your private account is required';end if;
 select id into p from profiles where couple_id=c and id<>auth.uid();
 if p is null then raise exception 'Both private accounts must be linked';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'thinking'));
 if exists(select 1 from connection_taps where sender=auth.uid() and created_at>clock_timestamp()-interval '60 seconds') then raise exception 'Wait a minute before sending another little tap';end if;
 insert into connection_taps(couple_id,sender,recipient,created_at) values(c,auth.uid(),p,clock_timestamp());
end $$;
create function public.connection_state() returns jsonb
language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();result jsonb;
begin
 if c is null then raise exception 'Your private account is required';end if;
 result:=today_answers();
 return result||jsonb_build_object('server_now',clock_timestamp(),
 'moods',coalesce((select jsonb_agg(to_jsonb(m) order by day desc,updated_at desc) from (select * from mood_checkins where couple_id=c order by day desc,updated_at desc limit 40) m),'[]'::jsonb),
 'taps',coalesce((select jsonb_agg(to_jsonb(t) order by created_at desc) from (select * from connection_taps where couple_id=c order by created_at desc limit 20) t),'[]'::jsonb));
end $$;
revoke execute on function public.check_in_mood(text,text),public.thinking_of_you(),public.connection_state(),public.seal_connection_answer(text,text,date) from public,anon;
grant execute on function public.check_in_mood(text,text),public.thinking_of_you(),public.connection_state(),public.seal_connection_answer(text,text,date) to authenticated;
create policy connection_live_read on realtime.messages for select to authenticated using(realtime.topic()='connection:'||public.my_couple()::text);
create policy connection_live_write on realtime.messages for insert to authenticated with check(realtime.topic()='connection:'||public.my_couple()::text);
alter publication supabase_realtime add table public.mood_checkins,public.connection_taps;
notify pgrst,'reload schema';
commit;

begin;
create table if not exists public.hold_sessions(id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples,started_at timestamptz not null,duration_sec int not null check(duration_sec>=3));
create table if not exists public.hold_presence(couple_id uuid not null references public.couples,user_id uuid primary key references public.profiles,holding boolean not null,seen_at timestamptz not null);
create table if not exists public.hold_rooms(couple_id uuid primary key references public.couples,id uuid not null default gen_random_uuid(),started_at timestamptz,last_confirmed_at timestamptz);
create table if not exists public.notifications_log(id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples,sender uuid not null references public.profiles,kind text not null check(kind='holdhands'),created_at timestamptz not null default now());
alter table public.hold_sessions enable row level security;
alter table public.hold_presence enable row level security;
alter table public.hold_rooms enable row level security;
alter table public.notifications_log enable row level security;
drop policy if exists hold_read on public.hold_sessions;
create policy hold_read on public.hold_sessions for select to authenticated using(couple_id=my_couple());
drop policy if exists hold_invite_read on public.notifications_log;
create policy hold_invite_read on public.notifications_log for select to authenticated using(couple_id=my_couple());
grant select on public.hold_sessions,public.notifications_log to authenticated;
alter table public.notification_preferences add column if not exists holdhands boolean not null default true;
create or replace function public.hold_stats() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',coalesce(sum(duration_sec),0),'longest',coalesce(max(duration_sec),0),'count',count(*)) from hold_sessions where couple_id=my_couple()
$$;
create or replace function public.hold_update(active boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();r hold_rooms; t timestamptz:=clock_timestamp(); n int; d int;begin
 if c is null then raise exception 'Sign in to hold hands';end if;
 perform pg_advisory_xact_lock(hashtext(c::text||'holdhands'));
 insert into hold_rooms(couple_id) values(c) on conflict do nothing;
 select * into r from hold_rooms where couple_id=c;
 -- Finalize a disconnected session before a new heartbeat can revive it.
 if r.started_at is not null and r.last_confirmed_at<t-interval '5 seconds' then
  d:=floor(extract(epoch from r.last_confirmed_at-r.started_at));
  if d>=3 then insert into hold_sessions(id,couple_id,started_at,duration_sec) values(r.id,c,r.started_at,d) on conflict do nothing;end if;
  update hold_rooms set started_at=null,last_confirmed_at=null,id=gen_random_uuid() where couple_id=c;
 end if;
 insert into hold_presence(couple_id,user_id,holding,seen_at) values(c,auth.uid(),active,t) on conflict(user_id) do update set holding=excluded.holding,seen_at=excluded.seen_at;
 select count(*) into n from hold_presence where couple_id=c and holding and seen_at>t-interval '5 seconds';
 select * into r from hold_rooms where couple_id=c;
 if n=2 then
  update hold_rooms set started_at=coalesce(started_at,t),last_confirmed_at=t where couple_id=c;
 elsif r.started_at is not null then
  d:=floor(extract(epoch from least(t,r.last_confirmed_at+interval '2 seconds')-r.started_at));
  if d>=3 then insert into hold_sessions(id,couple_id,started_at,duration_sec) values(r.id,c,r.started_at,d) on conflict do nothing;end if;
  update hold_rooms set started_at=null,last_confirmed_at=null,id=gen_random_uuid() where couple_id=c;
 end if;
 delete from hold_presence where couple_id=c and not holding and seen_at<t-interval '10 seconds';
 return hold_stats();
end $$;
create or replace function public.invite_hold_hands() returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid:=my_couple();i uuid;begin
 if c is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'holdinvite'));
 if exists(select 1 from notifications_log where sender=auth.uid() and kind='holdhands' and created_at>clock_timestamp()-interval '10 minutes') then raise exception 'Wait ten minutes before inviting again';end if;
 insert into notifications_log(couple_id,sender,kind) values(c,auth.uid(),'holdhands') returning id into i;return i;
end $$;
drop policy if exists hold_channel_read on realtime.messages;
drop policy if exists hold_channel_write on realtime.messages;
create policy hold_channel_read on realtime.messages for select to authenticated using(my_couple() is not null and realtime.topic()='holdhands:'||my_couple()::text);
create policy hold_channel_write on realtime.messages for insert to authenticated with check(my_couple() is not null and realtime.topic()='holdhands:'||my_couple()::text);
revoke execute on function public.hold_stats(),public.hold_update(boolean),public.invite_hold_hands() from public,anon;
grant execute on function public.hold_stats(),public.hold_update(boolean),public.invite_hold_hands() to authenticated;
notify pgrst,'reload schema';
commit;

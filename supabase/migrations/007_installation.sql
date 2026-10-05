begin;
create table public.notification_preferences(user_id uuid primary key default auth.uid() references public.profiles,enabled boolean not null default false,wishes boolean not null default true,memories boolean not null default true,notes boolean not null default true,taps boolean not null default true,turns boolean not null default true,quiet_start smallint not null default 22 check(quiet_start between 0 and 23),quiet_end smallint not null default 8 check(quiet_end between 0 and 23),timezone text not null default 'Asia/Manila' check(length(timezone)<=80));
create table public.push_devices(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles,platform text not null check(platform in ('web','android')),token text,json_subscription jsonb,device_key text not null check(length(device_key) between 1 and 100),unique(user_id,device_key),check((platform='android' and token is not null and length(token) between 20 and 4096 and json_subscription is null) or (platform='web' and token is null and json_subscription is not null and octet_length(json_subscription::text)<6000)));
create table public.push_deliveries(event_key text primary key,created_at timestamptz not null default now());
alter table notification_preferences enable row level security;alter table push_devices enable row level security;alter table push_deliveries enable row level security;
create policy preferences_read on notification_preferences for select to authenticated using(user_id=auth.uid());
create policy preferences_add on notification_preferences for insert to authenticated with check(user_id=auth.uid() and my_couple() is not null);
create policy preferences_edit on notification_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy device_read on push_devices for select to authenticated using(user_id=auth.uid());
create policy device_add on push_devices for insert to authenticated with check(user_id=auth.uid() and my_couple() is not null);
create policy device_edit on push_devices for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy device_delete on push_devices for delete to authenticated using(user_id=auth.uid());
grant select,insert,update on notification_preferences,push_devices to authenticated;grant delete on push_devices to authenticated;
-- Delivery ledger and recipient tokens are read only by the server service role.
grant all on notification_preferences,push_devices,push_deliveries to service_role;
notify pgrst,'reload schema';commit;

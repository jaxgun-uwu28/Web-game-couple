begin;
alter table public.push_devices add column if not exists notification_channel_version integer not null default 1;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='push_channel_version_valid' and conrelid='public.push_devices'::regclass) then
  alter table public.push_devices add constraint push_channel_version_valid check(notification_channel_version in (1,2));
 end if;
end $$;
notify pgrst,'reload schema';
commit;

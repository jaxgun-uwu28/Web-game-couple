begin;
alter table public.notification_preferences add column if not exists chime text not null default 'sweet_bell';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='notification_chime_valid' and conrelid='public.notification_preferences'::regclass) then
  alter table public.notification_preferences add constraint notification_chime_valid check(chime in('sweet_bell','little_sparkle','soft_hearts'));
 end if;
end $$;
notify pgrst,'reload schema';
commit;

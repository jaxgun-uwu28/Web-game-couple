-- After migration 001. Preserve existing date; new couples require setup.
alter table public.couples alter column anniversary drop default;
alter table public.couples alter column anniversary drop not null;
create function public.set_anniversary(value date) returns void language plpgsql security definer set search_path=public as $$ begin
 if my_couple() is null then raise exception 'Your private invitation is required'; end if;
 if value is null or value>current_date or value<'1900-01-01' then raise exception 'Choose a past or current anniversary date'; end if;
 update couples set anniversary=value where id=my_couple(); end $$;
revoke execute on function public.set_anniversary(date) from public,anon;
grant execute on function public.set_anniversary(date) to authenticated;
create table public.art_slots(couple_id uuid references public.couples on delete cascade,slot text not null check(slot ~ '^[a-z0-9-]{1,80}$'),path text not null,updated_at timestamptz not null default now(),primary key(couple_id,slot),check(path=couple_id::text||'/'||slot||'.webp'));
alter table public.art_slots enable row level security;
create policy art_read on public.art_slots for select to authenticated using(couple_id=my_couple());
create policy art_write on public.art_slots for insert to authenticated with check(couple_id=my_couple());
create policy art_update on public.art_slots for update to authenticated using(couple_id=my_couple()) with check(couple_id=my_couple());
grant select,insert,update on public.art_slots to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('app-art','app-art',false,10485760,array['image/webp']) on conflict(id) do nothing;
create policy app_art_read on storage.objects for select to authenticated using(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text);
create policy app_art_insert on storage.objects for insert to authenticated with check(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text and name ~ '^[0-9a-f-]+/[a-z0-9-]+\.webp$');
create policy app_art_update on storage.objects for update to authenticated using(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text) with check(bucket_id='app-art' and (storage.foldername(name))[1]=my_couple()::text);
alter publication supabase_realtime add table public.art_slots,public.couples;
create policy stage_one_channel_read on realtime.messages for select to authenticated
 using (realtime.topic() in ('art:'||my_couple()::text,'anniversary:'||my_couple()::text));

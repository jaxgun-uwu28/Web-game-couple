begin;
create table if not exists public.postcards(
 id uuid primary key,couple_id uuid not null references public.couples,sender_id uuid not null references public.profiles,
 front_path text not null,back_path text not null,layers jsonb not null,message text not null check(length(message)<=280),
 envelope_color text not null,stamp_id text not null,unlock_at timestamptz,created_at timestamptz not null default now(),opened_at timestamptz,
 favorite_by uuid[] not null default '{}',reactions jsonb not null default '{}'
);
alter table public.postcards enable row level security;
-- Realtime publishes only envelopes, never sealed paths/layers/message from WAL.
create table if not exists public.postcard_envelopes(id uuid primary key references postcards on delete cascade,couple_id uuid not null references couples,updated_at timestamptz not null default now());
alter table public.postcard_envelopes enable row level security;
drop policy if exists envelope_read on public.postcard_envelopes;
create policy envelope_read on public.postcard_envelopes for select to authenticated using(couple_id=my_couple());
grant select on public.postcard_envelopes to authenticated;
create or replace function public.sync_postcard_envelope() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into postcard_envelopes(id,couple_id) values(new.id,new.couple_id) on conflict(id) do update set updated_at=clock_timestamp();return new;end $$;
drop trigger if exists postcard_envelope_changed on public.postcards;
create trigger postcard_envelope_changed after insert or update on public.postcards for each row execute function sync_postcard_envelope();
insert into postcard_envelopes(id,couple_id) select id,couple_id from postcards on conflict do nothing;
drop policy if exists postcard_envelope_read on public.postcards;
create policy postcard_envelope_read on public.postcards for select to authenticated using(couple_id=my_couple());
-- Only envelope columns are selectable directly. Message, paths and layers require the unlock-checking RPC.
revoke all on public.postcards from anon,authenticated;
grant select(id,couple_id,sender_id,envelope_color,stamp_id,unlock_at,created_at,opened_at,favorite_by,reactions) on public.postcards to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('postcards','postcards',false,524288,array['image/webp']) on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.can_open_postcard_file(path text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from postcards where couple_id=my_couple() and (sender_id=auth.uid() or unlock_at is null or unlock_at<=now()) and (front_path=path or back_path=path or layers->>'photoPath'=path))
$$;
drop policy if exists postcard_file_read on storage.objects;
create policy postcard_file_read on storage.objects for select to authenticated using(bucket_id='postcards' and can_open_postcard_file(name));
drop policy if exists postcard_file_add on storage.objects;
create policy postcard_file_add on storage.objects for insert to authenticated with check(bucket_id='postcards' and my_couple() is not null and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text);
drop policy if exists postcard_file_delete on storage.objects;
create policy postcard_file_delete on storage.objects for delete to authenticated using(bucket_id='postcards' and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text);
create or replace function public.send_postcard(i uuid,doc jsonb,msg text,color text,stamp text,unlock timestamptz default null) returns uuid language plpgsql security definer set search_path=public as $$
declare base text:=my_couple()::text||'/'||auth.uid()::text||'/'||i::text;u jsonb;begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtext(my_couple()::text||'media'));
 if exists(select 1 from postcards where id=i and sender_id=auth.uid()) then return i;end if;
 if length(doc::text)>200000 or jsonb_array_length(coalesce(doc->'stickers','[]'))>60 then raise exception 'Too many postcard details';end if;
 if not exists(select 1 from storage.objects where bucket_id='postcards' and name=base||'/front.webp') or not exists(select 1 from storage.objects where bucket_id='postcards' and name=base||'/back.webp') then raise exception 'Postcard upload missing';end if;
 if doc ? 'photoPath' and doc->>'photoPath'<>base||'/photo.webp' then raise exception 'Invalid postcard photo';end if;
 u:=media_usage();if (u->>'used')::bigint>(u->>'cap')::bigint then raise exception 'Your shared storage is full. Download or remove older media.';end if;
 insert into postcards(id,couple_id,sender_id,front_path,back_path,layers,message,envelope_color,stamp_id,unlock_at) values(i,my_couple(),auth.uid(),base||'/front.webp',base||'/back.webp',doc,msg,color,stamp,unlock);
 return i;
end $$;
create or replace function public.open_postcard(i uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare r postcards;begin
 select * into r from postcards where id=i and couple_id=my_couple() for update;
 if not found then raise exception 'Postcard unavailable';end if;
 if r.sender_id<>auth.uid() and r.unlock_at>now() then raise exception 'This postcard opens on its chosen date';end if;
 if r.sender_id<>auth.uid() then update postcards set opened_at=coalesce(opened_at,now()) where id=i returning * into r;end if;
 return to_jsonb(r);
end $$;
create or replace function public.postcard_action(i uuid,a text,v text default '') returns void language plpgsql security definer set search_path=public as $$declare r postcards;begin
 select * into r from postcards where id=i and couple_id=my_couple() for update;
 if not found or (r.sender_id<>auth.uid() and r.unlock_at>now()) then raise exception 'Open this postcard first';end if;
 if a='favorite' then update postcards set favorite_by=case when auth.uid()=any(favorite_by) then array_remove(favorite_by,auth.uid()) else array_append(favorite_by,auth.uid()) end where id=i;
 elsif a='react' and v in ('heart','sparkle','kiss') then update postcards set reactions=jsonb_set(reactions,array[auth.uid()::text],to_jsonb(v)) where id=i;
 elsif a='delete' then delete from postcards where id=i;
 else raise exception 'Action unavailable';end if;
end $$;
revoke execute on function public.can_open_postcard_file(text),public.send_postcard(uuid,jsonb,text,text,text,timestamptz),public.open_postcard(uuid),public.postcard_action(uuid,text,text) from public,anon;
grant execute on function public.can_open_postcard_file(text),public.send_postcard(uuid,jsonb,text,text,text,timestamptz),public.open_postcard(uuid),public.postcard_action(uuid,text,text) to authenticated;
alter table public.notification_preferences add column if not exists postcards boolean not null default true;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='postcards') then alter publication supabase_realtime drop table public.postcards;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='postcard_envelopes') then alter publication supabase_realtime add table public.postcard_envelopes;end if;
 end if;
end $$;
notify pgrst,'reload schema';commit;

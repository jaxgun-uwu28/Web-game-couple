begin;
create table if not exists public.voice_messages (
 id uuid primary key, couple_id uuid not null references public.couples,
 sender_id uuid not null references public.profiles, storage_path text not null unique,
 mime text not null, duration_ms int not null check(duration_ms between 1000 and 120000),
 peaks real[] not null check(cardinality(peaks)=64), label text not null default '' check(length(label)<=30),
 color text not null default '#F8C9D8', sticker text not null default 'heart',
 created_at timestamptz not null default now(), delivered_at timestamptz, listened_at timestamptz,
 favorite_by uuid[] not null default '{}', reactions jsonb not null default '{}'
);
create table if not exists public.media_limits(couple_id uuid primary key references public.couples,soft_cap_bytes bigint not null default 314572800 check(soft_cap_bytes between 10485760 and 1073741824));
alter table public.voice_messages enable row level security;
alter table public.media_limits enable row level security;
drop policy if exists voice_read on public.voice_messages;
create policy voice_read on public.voice_messages for select to authenticated using(couple_id=my_couple());
drop policy if exists voice_delete on public.voice_messages;
create policy voice_delete on public.voice_messages for delete to authenticated using(couple_id=my_couple() and sender_id=auth.uid());
drop policy if exists media_limits_read on public.media_limits;
create policy media_limits_read on public.media_limits for select to authenticated using(couple_id=my_couple());
grant select,delete on public.voice_messages to authenticated;
grant select on public.media_limits to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('voice-notes','voice-notes',false,524288,array['audio/webm','audio/mp4','audio/ogg']) on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists voice_file_read on storage.objects;
create policy voice_file_read on storage.objects for select to authenticated using(bucket_id='voice-notes' and exists(select 1 from voice_messages v where v.storage_path=name and v.couple_id=my_couple()));
drop policy if exists voice_file_add on storage.objects;
create policy voice_file_add on storage.objects for insert to authenticated with check(bucket_id='voice-notes' and my_couple() is not null and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text);
drop policy if exists voice_file_delete on storage.objects;
create policy voice_file_delete on storage.objects for delete to authenticated using(bucket_id='voice-notes' and split_part(name,'/',1)=my_couple()::text and split_part(name,'/',2)=auth.uid()::text);
create or replace function public.media_usage() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('used',coalesce((select sum(coalesce((metadata->>'size')::bigint,0)) from storage.objects where bucket_id in ('voice-notes','postcards','keepsakes','app-art') and split_part(name,'/',1)=my_couple()::text),0),'cap',coalesce((select soft_cap_bytes from media_limits where couple_id=my_couple()),314572800))
$$;
create or replace function public.set_media_cap(cap bigint) returns void language plpgsql security definer set search_path=public as $$begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 insert into media_limits values(my_couple(),cap) on conflict(couple_id) do update set soft_cap_bytes=excluded.soft_cap_bytes;
end $$;
create or replace function public.send_voice(i uuid,m text,d int,p real[],l text,c text,s text) returns uuid language plpgsql security definer set search_path=public as $$
declare path text:=my_couple()::text||'/'||auth.uid()::text||'/'||i::text;u jsonb;begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtext(my_couple()::text||'media'));
 if exists(select 1 from voice_messages where id=i and sender_id=auth.uid()) then return i;end if;
 if m not in ('audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg') or exists(select 1 from unnest(p) x where x<0 or x>1 or x='NaN'::real) then raise exception 'Invalid recording';end if;
 if not exists(select 1 from storage.objects where bucket_id='voice-notes' and name=path) then raise exception 'Recording upload missing';end if;
 u:=media_usage(); if (u->>'used')::bigint>(u->>'cap')::bigint then raise exception 'Your shared storage is full. Download or remove older recordings.';end if;
 insert into voice_messages(id,couple_id,sender_id,storage_path,mime,duration_ms,peaks,label,color,sticker) values(i,my_couple(),auth.uid(),path,m,d,p,l,c,s);
 return i;
end $$;
create or replace function public.voice_action(i uuid,a text,v text default '') returns void language plpgsql security definer set search_path=public as $$
declare r voice_messages;begin
 select * into r from voice_messages where id=i and couple_id=my_couple() for update;
 if not found then raise exception 'Recording unavailable';end if;
 if a in ('delivered','listened') then
  if r.sender_id=auth.uid() then return;end if;
  update voice_messages set delivered_at=coalesce(delivered_at,now()),listened_at=case when a='listened' then coalesce(listened_at,now()) else listened_at end where id=i;
 elsif a='favorite' then
  update voice_messages set favorite_by=case when auth.uid()=any(favorite_by) then array_remove(favorite_by,auth.uid()) else array_append(favorite_by,auth.uid()) end where id=i;
 elsif a='react' and v in ('heart','sparkle','laugh') then
  update voice_messages set reactions=jsonb_set(reactions,array[auth.uid()::text],to_jsonb(v)) where id=i;
 else raise exception 'Unknown action';end if;
end $$;
revoke execute on function public.send_voice(uuid,text,int,real[],text,text,text),public.voice_action(uuid,text,text),public.media_usage(),public.set_media_cap(bigint) from public,anon;
grant execute on function public.send_voice(uuid,text,int,real[],text,text,text),public.voice_action(uuid,text,text),public.media_usage(),public.set_media_cap(bigint) to authenticated;
alter table public.notification_preferences add column if not exists voice boolean not null default true;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='voice_messages') then alter publication supabase_realtime add table public.voice_messages;end if;end $$;
notify pgrst,'reload schema';
commit;

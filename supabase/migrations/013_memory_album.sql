begin;
alter table public.memories add column if not exists archived_at timestamptz;
create or replace function public.can_read_memory(mid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from memories m where m.id=mid and m.couple_id=my_couple() and (m.archived_at is null or m.author=auth.uid()) and (m.swap_day is null or m.author=auth.uid() or (select count(*) from memories b where b.couple_id=m.couple_id and b.swap_day=m.swap_day)=2))
$$;
drop policy if exists memory_edit on public.memories;
create policy memory_edit on public.memories for update to authenticated using(couple_id=my_couple() and author=auth.uid()) with check(couple_id=my_couple() and author=auth.uid());
grant update(caption,archived_at) on public.memories to authenticated;
notify pgrst,'reload schema';
commit;

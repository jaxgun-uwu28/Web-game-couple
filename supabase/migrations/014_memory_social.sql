begin;
create table if not exists public.memory_comments (
 id uuid primary key default gen_random_uuid(), memory_id uuid not null references public.memories on delete cascade,
 author uuid not null default auth.uid() references public.profiles, body text not null check(length(trim(body)) between 1 and 1000), created_at timestamptz not null default now()
);
alter table public.memory_comments enable row level security;
drop policy if exists memory_comment_read on public.memory_comments;
create policy memory_comment_read on public.memory_comments for select to authenticated using(public.can_read_memory(memory_id));
drop policy if exists memory_comment_add on public.memory_comments;
create policy memory_comment_add on public.memory_comments for insert to authenticated with check(author=auth.uid() and public.can_read_memory(memory_id));
drop policy if exists memory_reaction_remove on public.memory_reactions;
create policy memory_reaction_remove on public.memory_reactions for delete to authenticated using(user_id=auth.uid() and public.can_read_memory(memory_id));
grant select,insert on public.memory_comments to authenticated;
grant delete on public.memory_reactions to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='memory_comments') then alter publication supabase_realtime add table public.memory_comments;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='memory_reactions') then alter publication supabase_realtime add table public.memory_reactions;end if;
end $$;
notify pgrst,'reload schema';
commit;

-- Read-once letters: recipients can keep a favorite before closing.
begin;
alter table public.love_notes add column if not exists recipient_favorite boolean not null default false;
create or replace function public.finish_love_note(nid uuid, keep boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare n love_notes;
begin
 select * into n from love_notes where id=nid and couple_id=my_couple() for update;
 if not found then return; end if;
 if n.author=auth.uid() or n.opened_at is null or n.unlock_at>now() then
  raise exception 'Only the recipient can finish an opened letter.';
 end if;
 if keep then
  update love_notes set recipient_favorite=true where id=nid;
 elsif not n.recipient_favorite then
  delete from love_notes where id=nid;
 end if;
end $$;
revoke all on function public.finish_love_note(uuid,boolean) from public,anon;
grant execute on function public.finish_love_note(uuid,boolean) to authenticated;
commit;

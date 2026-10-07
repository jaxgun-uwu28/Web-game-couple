-- Defaults are created after profile membership exists, and repaired on demand.
alter table public.wishlists add column if not exists color text not null default '#F8C9D8';
create or replace function public.seed_wishlists(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p record; first_owner uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(cid::text,31));
  select id into first_owner from profiles where couple_id=cid order by slot limit 1;
  if first_owner is null then return; end if;
  if not exists(select 1 from wishlists where couple_id=cid and type='shared') then
    insert into wishlists(couple_id,owner_id,type,title) values(cid,first_owner,'shared','Our wishlist');
  end if;
  for p in select id from profiles where couple_id=cid loop
    if not exists(select 1 from wishlists where couple_id=cid and owner_id=p.id and type='personal') then
      insert into wishlists(couple_id,owner_id,type,title) values(cid,p.id,'personal','My wishes');
    end if;
  end loop;
end $$;
revoke all on function public.seed_wishlists(uuid) from public,anon,authenticated;
create or replace function public.ensure_wishlists() returns setof public.wishlists
language plpgsql security definer set search_path=public as $$
declare cid uuid := public.my_couple();
begin
  if auth.uid() is null or cid is null then raise exception 'Sign in to save your wish.'; end if;
  perform public.seed_wishlists(cid);
  return query select * from wishlists where couple_id=cid and (type<>'secret' or owner_id=auth.uid());
end $$;
revoke all on function public.ensure_wishlists() from public,anon;
grant execute on function public.ensure_wishlists() to authenticated;
create or replace function public.profile_wish_defaults() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.seed_wishlists(new.couple_id); return new; end $$;
revoke all on function public.profile_wish_defaults() from public,anon,authenticated;
drop trigger if exists profile_wish_defaults on public.profiles;
create trigger profile_wish_defaults after insert or update of couple_id on public.profiles
for each row execute function public.profile_wish_defaults();
do $$ declare c record; begin
  for c in select id from public.couples loop perform public.seed_wishlists(c.id); end loop;
end $$;
-- Reject inaccessible lists clearly, before RLS; no privilege elevation for inserts.
create or replace function public.check_wish_destination() returns trigger
language plpgsql set search_path=public as $$
begin
  if not public.can_edit_list(new.list_id) then
    if not exists(select 1 from wishlists where id=new.list_id) then
      raise exception 'Wishlist missing. Create your default list and retry.' using errcode='23503';
    end if;
    raise exception 'You cannot add wishes to this list.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists wish_destination on public.wishlist_items;
create trigger wish_destination before insert on public.wishlist_items
for each row execute function public.check_wish_destination();
-- Transactional move-or-delete. Keep the last Secret/Custom list; recreate Our/My.
create or replace function public.manage_wishlist(lid uuid, destination uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare l wishlists; target wishlists;
begin
  if not public.can_edit_list(lid) then raise exception 'This wishlist cannot be edited.'; end if;
  select * into l from wishlists where id=lid for update;
  perform pg_advisory_xact_lock(hashtextextended(l.couple_id::text,31));
  if l.type in ('secret','custom') and not exists(select 1 from wishlists where couple_id=l.couple_id and type=l.type and owner_id=l.owner_id and id<>lid) then
    raise exception 'Keep at least one list.';
  end if;
  if destination is not null then
    if destination=lid or not public.can_edit_list(destination) then raise exception 'Choose another editable list.'; end if;
    select * into target from wishlists where id=destination;
    if l.type='secret' and (target.type<>'secret' or target.owner_id<>l.owner_id) then raise exception 'Move secret wishes only to another secret list.'; end if;
    if l.type<>target.type or l.owner_id<>target.owner_id then
      if exists(select 1 from wishlist_claims where item_id in (select id from wishlist_items where list_id=lid)) then
        raise exception 'Wishes with surprise claims can only move to a list with the same owner and type.';
      end if;
    end if;
    update wishlist_items set list_id=destination where list_id=lid;
  end if;
  delete from wishlists where id=lid;
  perform public.seed_wishlists(l.couple_id);
end $$;
revoke all on function public.manage_wishlist(uuid,uuid) from public,anon;
grant execute on function public.manage_wishlist(uuid,uuid) to authenticated;
create or replace function public.delete_wishlist(lid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin perform public.manage_wishlist(lid,null); end $$;

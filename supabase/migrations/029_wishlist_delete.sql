-- Shared/custom lists are editable by either partner; personal/secret lists by their owner.
create or replace function public.delete_wishlist(lid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_edit_list(lid) then
    raise exception 'This wishlist is unavailable or cannot be edited.';
  end if;
  delete from public.wishlists where id=lid;
end;
$$;
revoke all on function public.delete_wishlist(uuid) from public, anon;
grant execute on function public.delete_wishlist(uuid) to authenticated;

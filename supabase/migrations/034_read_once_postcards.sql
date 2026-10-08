begin;
create or replace function public.finish_postcard(i uuid,keep boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare r postcards;
begin
 select * into r from postcards where id=i and couple_id=my_couple() for update;
 if not found then return true; end if;
 if auth.uid() is null or r.sender_id=auth.uid() or r.opened_at is null or r.unlock_at>now() then
  raise exception 'Only the recipient can finish an opened postcard.';
 end if;
 if keep then
  if not auth.uid()=any(r.favorite_by) then update postcards set favorite_by=array_append(favorite_by,auth.uid()) where id=i; end if;
 elsif not auth.uid()=any(r.favorite_by) then
  delete from postcards where id=i;
  return true;
 end if;
 return false;
end $$;
revoke all on function public.finish_postcard(uuid,boolean) from public,anon;
grant execute on function public.finish_postcard(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;

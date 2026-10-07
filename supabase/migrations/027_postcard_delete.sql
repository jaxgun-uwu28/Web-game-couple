-- Allow either member of the couple to delete a postcard from their couple's box
create or replace function public.postcard_action(i uuid,a text,v text default '') returns void language plpgsql security definer set search_path=public as $$declare r postcards;begin
 select * into r from postcards where id=i and couple_id=my_couple() for update;
 if not found or (r.sender_id<>auth.uid() and r.unlock_at>now()) then raise exception 'Open this postcard first';end if;
 if a='favorite' then update postcards set favorite_by=case when auth.uid()=any(favorite_by) then array_remove(favorite_by,auth.uid()) else array_append(favorite_by,auth.uid()) end where id=i;
 elsif a='react' and v in ('heart','sparkle','kiss') then update postcards set reactions=jsonb_set(reactions,array[auth.uid()::text],to_jsonb(v)) where id=i;
 elsif a='delete' then delete from postcards where id=i;
 else raise exception 'Action unavailable';end if;
end $$;

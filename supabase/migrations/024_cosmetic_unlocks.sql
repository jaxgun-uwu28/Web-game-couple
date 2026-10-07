begin;
create table if not exists cosmetic_unlocks(user_id uuid references profiles,cosmetic text not null check(cosmetic in('cassette-colors','envelope-colors','postcard-stamps','sticker-sparkles')),created_at timestamptz not null default now(),primary key(user_id,cosmetic));
alter table cosmetic_unlocks enable row level security;
drop policy if exists cosmetics_read on cosmetic_unlocks;create policy cosmetics_read on cosmetic_unlocks for select to authenticated using(user_id=auth.uid());
grant select on cosmetic_unlocks to authenticated;grant all on cosmetic_unlocks to service_role;
create or replace function unlock_cosmetic(item text) returns void language plpgsql security definer set search_path=public as $$declare price int;minimum_xp int;r game_rewards;begin
 if my_couple() is null then raise exception 'Sign in first';end if;
 if item not in('cassette-colors','envelope-colors','postcard-stamps','sticker-sparkles') then raise exception 'Unknown cosmetic';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'cosmetics'));
 if exists(select 1 from cosmetic_unlocks where user_id=auth.uid() and cosmetic=item) then return;end if;
 price:=case when item in('postcard-stamps','sticker-sparkles') then 50 else 25 end;
 minimum_xp:=case when price=50 then 100 else 50 end;
 select * into r from game_rewards where user_id=auth.uid() for update;
 if r.user_id is null or r.coins<price or r.xp<minimum_xp then raise exception 'Earn more game coins and XP to unlock this';end if;
 update game_rewards set coins=coins-price where user_id=auth.uid();
 insert into cosmetic_unlocks(user_id,cosmetic) values(auth.uid(),item);
end $$;
revoke execute on function unlock_cosmetic(text) from public,anon;grant execute on function unlock_cosmetic(text) to authenticated;
commit;

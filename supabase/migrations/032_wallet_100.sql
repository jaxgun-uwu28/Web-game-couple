create or replace function public.reset_ledger_wallets(amount int default 10) returns void
language plpgsql security definer set search_path=public as $$
begin
  if my_couple() is null or amount not in(10,20,50,100) then raise exception 'Choose a starting balance'; end if;
  perform pg_advisory_xact_lock(hashtext(my_couple()::text||'wallet-games'));
  if exists(select 1 from arcade_matches where couple_id=my_couple() and game_id in('ledger','blackjack') and status in('invited','waiting','playing')) then raise exception 'Finish your current wallet game first'; end if;
  insert into ledger_wallets(user_id,couple_id,balance) select id,couple_id,amount from profiles where couple_id=my_couple()
    on conflict(user_id) do update set balance=amount,topped_up=null;
end $$;
revoke execute on function public.reset_ledger_wallets(int) from public,anon;
grant execute on function public.reset_ledger_wallets(int) to authenticated;

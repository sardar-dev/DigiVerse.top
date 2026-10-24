-- 022: withdrawal payout methods (USDT BEP20, PKR bank IBAN, Binance ID)
-- and no minimum amount. Safe to re-run.
alter table public.withdrawal_requests
  add column if not exists method text not null default 'usdt_bep20',
  add column if not exists details jsonb not null default '{}'::jsonb;

drop function if exists public.request_withdrawal(uuid, numeric, text, numeric, integer);

create or replace function public.request_withdrawal(
  p_user uuid, p_amount numeric, p_address text, p_min numeric, p_max_pending integer,
  p_method text, p_details jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal numeric;
  v_pending integer;
  v_id uuid;
  v_num bigint;
begin
  select balance into v_bal from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;

  select count(*) into v_pending from public.withdrawal_requests
   where user_id = p_user and status = 'pending';
  if v_pending >= p_max_pending then return jsonb_build_object('ok', false, 'error', 'too_many_pending'); end if;
  if p_amount < p_min then return jsonb_build_object('ok', false, 'error', 'below_minimum'); end if;
  if v_bal < p_amount then return jsonb_build_object('ok', false, 'error', 'insufficient_balance'); end if;

  update public.profiles set balance = balance - p_amount where id = p_user;
  insert into public.withdrawal_requests (user_id, amount, address, method, details, network)
    values (p_user, p_amount, p_address, p_method, coalesce(p_details, '{}'::jsonb),
            case p_method when 'pkr_iban' then 'PKR bank (IBAN)' when 'binance' then 'Binance ID' else 'USDT BEP20' end)
    returning id, request_number into v_id, v_num;
  insert into public.wallet_adjustments (user_id, amount, reason, created_by)
    values (p_user, -p_amount, 'Withdrawal request #' || v_num, p_user);

  return jsonb_build_object('ok', true, 'id', v_id, 'request_number', v_num, 'balance', v_bal - p_amount);
end;
$$;

revoke all on function public.request_withdrawal(uuid, numeric, text, numeric, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.request_withdrawal(uuid, numeric, text, numeric, integer, text, jsonb) to service_role;

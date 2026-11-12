-- ============================================================================
-- Migration 045: Finalize Gift Redemptions & Sync Cost Ledger
-- DigiVerse - Safe, Idempotent, Fast
-- ============================================================================

-- 1. Improved finalize_gift_redemption RPC
create or replace function public.finalize_gift_redemption(
  p_order_id uuid,
  p_actual_cost numeric default null,
  p_wallet_before numeric default null,
  p_wallet_after numeric default null,
  p_is_estimated boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings record;
  v_order record;
  v_gifts_count int;
  v_cost_per_gift numeric;
  v_total_cost numeric;
  v_now timestamptz := now();
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  select * into v_settings from public.referral_settings where id = 1;

  -- 1. Try finding gifts marked reserved for this order or owned by user
  select count(*) into v_gifts_count
  from public.referral_gifts
  where order_id = p_order_id or (owner_user_id = v_order.user_id and status = 'reserved');

  if v_gifts_count = 0 then
    -- Check if order itself has gifts_redeemed recorded
    v_gifts_count := coalesce(v_order.gifts_redeemed, 0);
  end if;

  if v_gifts_count = 0 then
    return jsonb_build_object('success', true, 'message', 'no_reserved_gifts');
  end if;

  v_cost_per_gift := coalesce(p_actual_cost, v_settings.supplier_cost_per_gift, 0.06);
  v_total_cost := v_cost_per_gift * v_gifts_count;

  -- Update gifts to redeemed
  update public.referral_gifts
  set status = 'redeemed',
      redeemed_at = coalesce(redeemed_at, v_now),
      order_id = p_order_id
  where order_id = p_order_id or (owner_user_id = v_order.user_id and status = 'reserved');

  -- Update redemption records to fulfilled
  update public.referral_gift_redemptions
  set status = 'fulfilled',
      fulfilled_at = coalesce(fulfilled_at, v_now),
      supplier_cost_snapshot = v_cost_per_gift,
      order_id = p_order_id
  where order_id = p_order_id or (user_id = v_order.user_id and status = 'reserved');

  -- Insert into cost ledger if not already recorded for this order
  if not exists (select 1 from public.referral_cost_ledger where order_id = p_order_id) then
    insert into public.referral_cost_ledger (
      order_id,
      user_id,
      gifts_count,
      tokens_fulfilled,
      supplier_cost_per_gift,
      total_supplier_cost,
      supplier_wallet_before,
      supplier_wallet_after,
      actual_deducted,
      is_estimated,
      created_at
    )
    values (
      p_order_id,
      v_order.user_id,
      v_gifts_count,
      v_gifts_count * coalesce(v_settings.tokens_per_gift, 1000000000),
      v_cost_per_gift,
      v_total_cost,
      p_wallet_before,
      p_wallet_after,
      case when p_wallet_before is not null and p_wallet_after is not null then p_wallet_before - p_wallet_after else null end,
      p_is_estimated,
      coalesce(v_order.created_at, v_now)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'gifts_redeemed', v_gifts_count,
    'total_cost', v_total_cost
  );
end;
$$;

-- 2. Retroactively reconcile all existing orders that redeemed gifts
do $$
declare
  r record;
  v_cost numeric := 0.06;
begin
  select coalesce(supplier_cost_per_gift, 0.06) into v_cost
  from public.referral_settings where id = 1;

  for r in
    select id, user_id, gifts_redeemed, product_id, created_at, status, total
    from public.orders
    where gifts_redeemed > 0 and status != 'cancelled'
  loop
    -- If free order was in pending_payment, advance to paid
    if r.status = 'pending_payment' and coalesce(r.total, 0) <= 0 then
      update public.orders
      set status = 'paid', paid_with = 'gift_box', updated_at = now()
      where id = r.id;
    end if;

    -- Update gifts to redeemed
    update public.referral_gifts
    set status = 'redeemed', redeemed_at = coalesce(redeemed_at, now()), order_id = r.id
    where (order_id = r.id or (owner_user_id = r.user_id and status in ('reserved', 'available')))
      and id in (
        select id from public.referral_gifts
        where (order_id = r.id or (owner_user_id = r.user_id and status in ('reserved', 'available')))
        limit coalesce(r.gifts_redeemed, 1)
      );

    -- Update redemptions to fulfilled
    update public.referral_gift_redemptions
    set status = 'fulfilled', fulfilled_at = coalesce(fulfilled_at, now()), order_id = r.id
    where (order_id = r.id or (user_id = r.user_id and status = 'reserved'));

    -- Insert into cost ledger if not exists
    if not exists (select 1 from public.referral_cost_ledger where order_id = r.id) then
      insert into public.referral_cost_ledger (
        order_id,
        user_id,
        gifts_count,
        tokens_fulfilled,
        supplier_cost_per_gift,
        total_supplier_cost,
        is_estimated,
        created_at
      )
      values (
        r.id,
        r.user_id,
        coalesce(r.gifts_redeemed, 1),
        coalesce(r.gifts_redeemed, 1) * 1000000000,
        v_cost,
        coalesce(r.gifts_redeemed, 1) * v_cost,
        false,
        coalesce(r.created_at, now())
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';


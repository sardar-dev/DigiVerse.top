-- 054: Add multi-provider Muse AI Boost selector (`buff_provider`) for TunVN & Ppure Store.
-- 100% idempotent and safe to re-run multiple times.

alter table public.products
  add column if not exists buff_provider text;

-- Preserve existing TunVN products automatically without overwriting custom settings
update public.products
  set buff_provider = 'tunvn'
  where tunvn_buff = true
    and (buff_provider is null or buff_provider = '');

-- Update gift reservation eligibility check so both TunVN and Ppure Store Muse Boost products qualify
create or replace function public.reserve_gifts_for_order(
  p_user_id uuid,
  p_order_id uuid,
  p_product_id bigint,
  p_gift_count int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings record;
  v_prod record;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
  v_today_redeemed int;
  v_gift_ids uuid[];
begin
  if p_gift_count <= 0 then
    return jsonb_build_object('success', true, 'reserved_count', 0, 'gift_ids', array[]::uuid[]);
  end if;

  -- 1. Check referral settings & master redemption switch
  select * into v_settings from public.referral_settings where id = 1;
  if not found or not coalesce(v_settings.redemption_enabled, true) then
    raise exception 'Gift redemption is currently disabled by administrator';
  end if;

  -- 2. Check product eligibility: Muse AI tokens only (TunVN or Ppure Store)
  select * into v_prod from public.products where id = p_product_id;
  if not found or not (
    coalesce(v_prod.tunvn_buff, false)
    or coalesce(v_prod.buff_provider, '') in ('tunvn', 'ppure')
  ) then
    raise exception 'Referral gift boxes can only be redeemed for Muse AI Token products';
  end if;

  -- 3. Check daily redemption limit
  select count(*) into v_today_redeemed
  from public.referral_gift_redemptions
  where user_id = p_user_id
    and status in ('fulfilled', 'reserved')
    and created_at >= v_today_start;

  if (v_today_redeemed + p_gift_count) > coalesce(v_settings.daily_redemption_limit, 3) then
    raise exception 'Daily gift redemption limit exceeded (maximum % gifts per day)', coalesce(v_settings.daily_redemption_limit, 3);
  end if;

  -- 4. Atomically lock and fetch available gifts
  select array_agg(id) into v_gift_ids
  from (
    select id
    from public.referral_gifts
    where owner_user_id = p_user_id
      and (status = 'available' or (status = 'locked' and available_at <= v_now))
    order by available_at asc
    limit p_gift_count
    for update skip locked
  ) sub;

  if coalesce(array_length(v_gift_ids, 1), 0) < p_gift_count then
    raise exception 'Not enough unlocked gifts available to redeem';
  end if;

  -- 5. Mark gifts as reserved
  update public.referral_gifts
  set status = 'reserved',
      order_id = p_order_id
  where id = any(v_gift_ids);

  -- 6. Insert reservation records
  insert into public.referral_gift_redemptions (
    user_id,
    gift_id,
    order_id,
    tokens_redeemed,
    supplier_cost_snapshot,
    currency,
    status
  )
  select
    p_user_id,
    g_id,
    p_order_id,
    coalesce(v_settings.tokens_per_gift, 1000000000),
    coalesce(v_settings.supplier_cost_per_gift, 0.06),
    coalesce(v_settings.currency, 'USD'),
    'reserved'
  from unnest(v_gift_ids) as g_id;

  return jsonb_build_object(
    'success', true,
    'reserved_count', p_gift_count,
    'gift_ids', v_gift_ids,
    'cost_per_gift', coalesce(v_settings.supplier_cost_per_gift, 0.06)
  );
end;
$$;

grant execute on function public.reserve_gifts_for_order(uuid, uuid, bigint, int) to service_role, authenticated;


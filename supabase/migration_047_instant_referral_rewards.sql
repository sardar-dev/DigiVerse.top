-- ============================================================================
-- Migration 047: Instant Referral Rewards (Remove 30s Lock Completely)
-- DigiVerse - Safe, Idempotent, High Performance
-- ============================================================================

-- 1. Set lock delay to 0 in referral settings
update public.referral_settings
set lock_delay_seconds = 0
where id = 1;

-- 2. Unlock all existing locked gifts immediately
update public.referral_gifts
set status = 'available',
    available_at = now()
where status = 'locked';

-- 3. Update get_user_gift_wallet_stats RPC to count all non-redeemed/non-revoked gifts as available
create or replace function public.get_user_gift_wallet_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings record;
  v_total_earned int;
  v_available_count int;
  v_redeemed_count int;
  v_revoked_count int;
  v_today_redeemed int;
  v_daily_limit int;
  v_max_lifetime int;
begin
  select * into v_settings from public.referral_settings where id = 1;
  v_daily_limit := coalesce(v_settings.daily_redemption_limit, 3);
  v_max_lifetime := coalesce(v_settings.max_lifetime_gifts, 15);

  -- 1. Total Earned (all non-revoked gifts)
  select count(*) into v_total_earned
  from public.referral_gifts
  where owner_user_id = p_user_id and status <> 'revoked';

  -- 2. Available gifts (instantly ready for checkout)
  select count(*) into v_available_count
  from public.referral_gifts
  where owner_user_id = p_user_id
    and status in ('available', 'locked');

  -- 3. Redeemed gifts
  select count(*) into v_redeemed_count
  from public.referral_gifts
  where owner_user_id = p_user_id and status = 'redeemed';

  -- 4. Revoked gifts
  select count(*) into v_revoked_count
  from public.referral_gifts
  where owner_user_id = p_user_id and status = 'revoked';

  -- 5. Redemptions today
  select count(*) into v_today_redeemed
  from public.referral_gift_redemptions
  where user_id = p_user_id
    and status in ('fulfilled', 'reserved')
    and created_at >= (date_trunc('day', now() at time zone 'UTC'));

  return jsonb_build_object(
    'total_earned', v_total_earned,
    'max_lifetime_gifts', v_max_lifetime,
    'available_count', v_available_count,
    'locked_count', 0,
    'redeemed_count', v_redeemed_count,
    'revoked_count', v_revoked_count,
    'daily_limit', v_daily_limit,
    'today_redeemed', v_today_redeemed,
    'remaining_today', greatest(0, v_daily_limit - v_today_redeemed),
    'next_unlock_seconds', 0
  );
end;
$$;

notify pgrst, 'reload schema';

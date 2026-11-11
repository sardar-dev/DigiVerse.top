-- ============================================================================
-- Migration 036: Referral Rewards, Gift Wallet & Cost Management System
-- DigiVerse - Safe to re-run, fully idempotent
-- ============================================================================

-- 1. Extend public.profiles with username, referral, device & IP tracking
alter table public.profiles
  add column if not exists username text,
  add column if not exists referred_by uuid references auth.users(id),
  add column if not exists registration_ip text,
  add column if not exists device_id text;

-- Case-insensitive unique index on username
create unique index if not exists profiles_lower_username_idx
  on public.profiles (lower(trim(username)))
  where username is not null;

-- Index on referred_by
create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by);

-- 2. Referral system settings (single row with id=1)
create table if not exists public.referral_settings (
  id int primary key default 1 check (id = 1),
  referral_enabled boolean not null default true,
  redemption_enabled boolean not null default true,
  max_lifetime_gifts int not null default 15,
  daily_redemption_limit int not null default 3,
  lock_delay_seconds int not null default 30,
  tokens_per_gift bigint not null default 1000000000,
  supplier_cost_per_gift numeric not null default 0.06,
  currency text not null default 'USD',
  fraud_max_accounts_per_ip int not null default 3,
  fraud_max_accounts_per_device int not null default 2,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.referral_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.referral_settings enable row level security;

-- Public can read basic settings (to know if referral/redemption is on)
drop policy if exists "referral_settings: public read" on public.referral_settings;
create policy "referral_settings: public read"
  on public.referral_settings for select
  using (true);

-- 3. Supplier cost history
create table if not exists public.supplier_cost_history (
  id uuid primary key default gen_random_uuid(),
  cost_per_billion numeric not null,
  currency text not null default 'USD',
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.supplier_cost_history enable row level security;

drop policy if exists "supplier_cost_history: admin read" on public.supplier_cost_history;
create policy "supplier_cost_history: admin read"
  on public.supplier_cost_history for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 4. Device registrations (anti-fraud)
create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  user_id uuid not null references auth.users(id),
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.device_registrations enable row level security;
create index if not exists device_registrations_device_idx on public.device_registrations (device_id);
create index if not exists device_registrations_user_idx on public.device_registrations (user_id);
create index if not exists device_registrations_ip_idx on public.device_registrations (ip_address);

-- 5. Referrals table (tracks the invite relationship)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id),
  referred_id uuid not null references auth.users(id) unique,
  referrer_username text,
  status text not null default 'pending_verification',
  -- pending_verification | qualified | qualified_cap_reached | flagged_suspicious | rejected
  device_id text,
  registration_ip text,
  suspicious_reason text,
  reward_issued boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.referrals enable row level security;

drop policy if exists "referrals: user can read own referrals" on public.referrals;
create policy "referrals: user can read own referrals"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_status_idx on public.referrals (status);

-- 6. Referral gifts (The Gift Wallet)
create table if not exists public.referral_gifts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  referrer_user_id uuid not null references auth.users(id),
  referred_user_id uuid not null references auth.users(id),
  referral_record_id uuid references public.referrals(id),
  reward_type text not null default 'muse_ai_tokens',
  reward_quantity bigint not null default 1000000000, -- 1 billion tokens
  status text not null default 'locked',
  -- locked | available | reserved | redeemed | revoked
  created_at timestamptz not null default now(),
  available_at timestamptz not null,
  redeemed_at timestamptz,
  order_id uuid references public.orders(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_reason text
);

alter table public.referral_gifts enable row level security;

drop policy if exists "referral_gifts: user can read own gifts" on public.referral_gifts;
create policy "referral_gifts: user can read own gifts"
  on public.referral_gifts for select
  using (auth.uid() = owner_user_id);

create index if not exists referral_gifts_owner_status_idx on public.referral_gifts (owner_user_id, status);
create index if not exists referral_gifts_available_at_idx on public.referral_gifts (available_at);
create index if not exists referral_gifts_order_id_idx on public.referral_gifts (order_id);

-- 7. Referral gift redemptions
create table if not exists public.referral_gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  gift_id uuid not null references public.referral_gifts(id),
  order_id uuid not null references public.orders(id),
  tokens_redeemed bigint not null default 1000000000,
  supplier_cost_snapshot numeric not null default 0.06,
  currency text not null default 'USD',
  status text not null default 'reserved', -- reserved | fulfilled | released
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table public.referral_gift_redemptions enable row level security;

drop policy if exists "referral_gift_redemptions: user can read own" on public.referral_gift_redemptions;
create policy "referral_gift_redemptions: user can read own"
  on public.referral_gift_redemptions for select
  using (auth.uid() = user_id);

create index if not exists redemptions_user_created_idx on public.referral_gift_redemptions (user_id, created_at);
create index if not exists redemptions_order_idx on public.referral_gift_redemptions (order_id);

-- 8. Referral cost ledger (Cost tracking & accounting)
create table if not exists public.referral_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null references auth.users(id),
  gifts_count int not null default 1,
  tokens_fulfilled bigint not null default 1000000000,
  supplier_cost_per_gift numeric not null,
  total_supplier_cost numeric not null,
  supplier_wallet_before numeric,
  supplier_wallet_after numeric,
  actual_deducted numeric,
  is_estimated boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.referral_cost_ledger enable row level security;

drop policy if exists "referral_cost_ledger: admin read" on public.referral_cost_ledger;
create policy "referral_cost_ledger: admin read"
  on public.referral_cost_ledger for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create index if not exists cost_ledger_user_idx on public.referral_cost_ledger (user_id);
create index if not exists cost_ledger_created_idx on public.referral_cost_ledger (created_at);

-- 9. Extend orders table with referral gifts redeemed fields
alter table public.orders
  add column if not exists gifts_redeemed int not null default 0,
  add column if not exists gift_discount numeric not null default 0;

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: Enhanced handle_new_user()
-- Populates username, referred_by, device_id, registration_ip
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_raw_username text;
  v_clean_username text;
  v_ref_code text;
  v_inviter_id uuid;
  v_device_id text;
  v_reg_ip text;
  v_email_domain text;
begin
  -- Validate email domain: Only 5 allowed domains for new signups
  v_email_domain := lower(split_part(new.email, '@', 2));
  if v_email_domain not in ('gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com') then
    raise exception 'Registration is only allowed with gmail.com, outlook.com, yahoo.com, hotmail.com, or icloud.com';
  end if;

  v_raw_username := trim(new.raw_user_meta_data->>'username');
  if v_raw_username is not null and v_raw_username <> '' then
    -- Validate username format: letters, numbers, underscores, 3-24 chars
    if not (v_raw_username ~* '^[a-zA-Z0-9_]{3,24}$') then
      raise exception 'Username must be 3-24 characters and contain only letters, numbers, and underscores';
    end if;
    v_clean_username := lower(v_raw_username);
  end if;

  v_ref_code := trim(new.raw_user_meta_data->>'ref');
  v_device_id := trim(new.raw_user_meta_data->>'device_id');
  v_reg_ip := trim(new.raw_user_meta_data->>'registration_ip');

  -- Resolve inviter if referral code was provided
  if v_ref_code is not null and v_ref_code <> '' then
    select id into v_inviter_id
    from public.profiles
    where lower(trim(username)) = lower(v_ref_code)
    limit 1;

    -- Self-referral prevention
    if v_inviter_id = new.id then
      v_inviter_id := null;
    end if;
  end if;

  insert into public.profiles (
    id,
    email,
    username,
    referred_by,
    device_id,
    registration_ip
  )
  values (
    new.id,
    new.email,
    v_clean_username,
    v_inviter_id,
    v_device_id,
    v_reg_ip
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username),
    referred_by = coalesce(public.profiles.referred_by, excluded.referred_by),
    device_id = coalesce(public.profiles.device_id, excluded.device_id),
    registration_ip = coalesce(public.profiles.registration_ip, excluded.registration_ip);

  -- Track device registration
  if v_device_id is not null and v_device_id <> '' then
    insert into public.device_registrations (device_id, user_id, ip_address)
    values (v_device_id, new.id, v_reg_ip);
  end if;

  -- Create pending referral record if an inviter was found
  if v_inviter_id is not null then
    insert into public.referrals (
      referrer_id,
      referred_id,
      referrer_username,
      device_id,
      registration_ip,
      status
    )
    values (
      v_inviter_id,
      new.id,
      v_ref_code,
      v_device_id,
      v_reg_ip,
      'pending_verification'
    )
    on conflict (referred_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Rebind trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- RPC: qualify_referral(p_referred_user_id uuid)
-- Validates email confirmation, anti-fraud rules, lifetime cap,
-- and issues 1 locked gift box with exact 30-second delay.
-- ─────────────────────────────────────────────────────────────
create or replace function public.qualify_referral(p_referred_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_ref record;
  v_settings record;
  v_confirmed_at timestamptz;
  v_referrer_device text;
  v_referrer_ip text;
  v_device_count int;
  v_ip_count int;
  v_earned_gifts int;
  v_gift_id uuid;
  v_available_at timestamptz;
  v_now timestamptz := now();
begin
  -- 1. Load referral record
  select * into v_ref
  from public.referrals
  where referred_id = p_referred_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_referral_found');
  end if;

  -- If already qualified, return existing status
  if v_ref.status = 'qualified' or v_ref.reward_issued then
    return jsonb_build_object('success', true, 'status', 'already_qualified', 'reward_issued', v_ref.reward_issued);
  end if;

  -- 2. Verify email is truly confirmed in auth.users
  select email_confirmed_at into v_confirmed_at
  from auth.users
  where id = p_referred_user_id;

  if v_confirmed_at is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  -- 3. Load referral settings
  select * into v_settings from public.referral_settings where id = 1;
  if not found or not v_settings.referral_enabled then
    return jsonb_build_object('success', false, 'reason', 'referral_system_disabled');
  end if;

  -- 4. Anti-Fraud Checks
  -- Get referrer's device and IP
  select device_id, registration_ip into v_referrer_device, v_referrer_ip
  from public.profiles
  where id = v_ref.referrer_id;

  -- Check A: Same device as referrer
  if v_ref.device_id is not null and v_referrer_device is not null and v_ref.device_id = v_referrer_device then
    update public.referrals
    set status = 'flagged_suspicious', suspicious_reason = 'same_device_as_referrer', updated_at = v_now
    where id = v_ref.id;
    return jsonb_build_object('success', false, 'reason', 'flagged_same_device');
  end if;

  -- Check B: Device registration burst
  if v_ref.device_id is not null then
    select count(distinct user_id) into v_device_count
    from public.device_registrations
    where device_id = v_ref.device_id;

    if v_device_count > v_settings.fraud_max_accounts_per_device then
      update public.referrals
      set status = 'flagged_suspicious', suspicious_reason = 'device_registration_cap_exceeded', updated_at = v_now
      where id = v_ref.id;
      return jsonb_build_object('success', false, 'reason', 'flagged_device_burst');
    end if;
  end if;

  -- 5. Check Referrer Lifetime Cap (default 15)
  select count(*) into v_earned_gifts
  from public.referral_gifts
  where owner_user_id = v_ref.referrer_id
    and status <> 'revoked';

  if v_earned_gifts >= v_settings.max_lifetime_gifts then
    -- Cap reached: Mark referral qualified but issue no gift
    update public.referrals
    set status = 'qualified_cap_reached', verified_at = v_confirmed_at, updated_at = v_now
    where id = v_ref.id;

    return jsonb_build_object(
      'success', true,
      'status', 'qualified_cap_reached',
      'reward_issued', false,
      'message', 'Referral verified but inviter has reached the lifetime gift cap.'
    );
  end if;

  -- 6. Issue Gift Box with 30-Second Reward Lock
  v_available_at := v_now + (v_settings.lock_delay_seconds || ' seconds')::interval;

  insert into public.referral_gifts (
    owner_user_id,
    referrer_user_id,
    referred_user_id,
    referral_record_id,
    reward_type,
    reward_quantity,
    status,
    created_at,
    available_at
  )
  values (
    v_ref.referrer_id,
    v_ref.referrer_id,
    p_referred_user_id,
    v_ref.id,
    'muse_ai_tokens',
    v_settings.tokens_per_gift,
    'locked',
    v_now,
    v_available_at
  )
  returning id into v_gift_id;

  -- Update referral record to qualified
  update public.referrals
  set status = 'qualified',
      reward_issued = true,
      verified_at = v_confirmed_at,
      updated_at = v_now
  where id = v_ref.id;

  return jsonb_build_object(
    'success', true,
    'status', 'qualified',
    'reward_issued', true,
    'gift_id', v_gift_id,
    'available_at', v_available_at,
    'lock_seconds', v_settings.lock_delay_seconds
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: On email verification in auth.users
-- Automatically runs qualify_referral when email_confirmed_at is set
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_user_email_verified()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null or old.email_confirmed_at <> new.email_confirmed_at) then
    perform public.qualify_referral(new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_user_email_verified();

-- ─────────────────────────────────────────────────────────────
-- RPC: get_user_gift_wallet_stats(p_user_id uuid)
-- Lazy evaluation of gifts (locked gifts whose time has passed
-- are counted as available without requiring any background cron)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_user_gift_wallet_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings record;
  v_total_earned int;
  v_locked_count int;
  v_available_count int;
  v_redeemed_count int;
  v_revoked_count int;
  v_today_redeemed int;
  v_next_unlock_sec int;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
begin
  select * into v_settings from public.referral_settings where id = 1;

  -- Total gifts earned (excluding revoked)
  select count(*) into v_total_earned
  from public.referral_gifts
  where owner_user_id = p_user_id and status <> 'revoked';

  -- Locked gifts (status = 'locked' AND available_at > now)
  select count(*) into v_locked_count
  from public.referral_gifts
  where owner_user_id = p_user_id
    and status = 'locked'
    and available_at > v_now;

  -- Available gifts (status = 'available' OR (status = 'locked' AND available_at <= now))
  select count(*) into v_available_count
  from public.referral_gifts
  where owner_user_id = p_user_id
    and (status = 'available' or (status = 'locked' and available_at <= v_now));

  -- Redeemed gifts
  select count(*) into v_redeemed_count
  from public.referral_gifts
  where owner_user_id = p_user_id and status = 'redeemed';

  -- Revoked gifts
  select count(*) into v_revoked_count
  from public.referral_gifts
  where owner_user_id = p_user_id and status = 'revoked';

  -- Today's successful redemptions for daily limit
  select count(*) into v_today_redeemed
  from public.referral_gift_redemptions
  where user_id = p_user_id
    and status in ('fulfilled', 'reserved')
    and created_at >= v_today_start;

  -- Next unlock countdown in seconds (for closest locked gift)
  select coalesce(extract(epoch from (min(available_at) - v_now))::int, 0) into v_next_unlock_sec
  from public.referral_gifts
  where owner_user_id = p_user_id
    and status = 'locked'
    and available_at > v_now;

  if v_next_unlock_sec < 0 then
    v_next_unlock_sec := 0;
  end if;

  return jsonb_build_object(
    'total_earned', v_total_earned,
    'locked_count', v_locked_count,
    'available_count', v_available_count,
    'redeemed_count', v_redeemed_count,
    'revoked_count', v_revoked_count,
    'max_lifetime_gifts', v_settings.max_lifetime_gifts,
    'remaining_capacity', greatest(0, v_settings.max_lifetime_gifts - v_total_earned),
    'daily_limit', v_settings.daily_redemption_limit,
    'today_redeemed', v_today_redeemed,
    'remaining_today', greatest(0, v_settings.daily_redemption_limit - v_today_redeemed),
    'redemption_enabled', v_settings.redemption_enabled,
    'next_unlock_seconds', v_next_unlock_sec
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: reserve_gifts_for_order(...)
-- Atomically locks and reserves N available gifts for an order.
-- Prevents double-spending under concurrent requests.
-- ─────────────────────────────────────────────────────────────
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
  if not found or not v_settings.redemption_enabled then
    raise exception 'Gift redemption is currently disabled by administrator';
  end if;

  -- 2. Check product eligibility: Muse AI tokens only (tunvn_buff = true)
  select * into v_prod from public.products where id = p_product_id;
  if not found or not coalesce(v_prod.tunvn_buff, false) then
    raise exception 'Referral gift boxes can only be redeemed for Muse AI Token products';
  end if;

  -- 3. Check daily redemption limit (atomic check)
  select count(*) into v_today_redeemed
  from public.referral_gift_redemptions
  where user_id = p_user_id
    and status in ('fulfilled', 'reserved')
    and created_at >= v_today_start;

  if (v_today_redeemed + p_gift_count) > v_settings.daily_redemption_limit then
    raise exception 'Daily gift redemption limit exceeded (maximum % gifts per day)', v_settings.daily_redemption_limit;
  end if;

  -- 4. Atomically lock and fetch available gifts (lazy check: status available OR locked whose time has passed)
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
    v_settings.tokens_per_gift,
    v_settings.supplier_cost_per_gift,
    v_settings.currency,
    'reserved'
  from unnest(v_gift_ids) as g_id;

  return jsonb_build_object(
    'success', true,
    'reserved_count', p_gift_count,
    'gift_ids', v_gift_ids,
    'cost_per_gift', v_settings.supplier_cost_per_gift
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: finalize_gift_redemption(...)
-- Marks reserved gifts as redeemed and logs cost in ledger.
-- ─────────────────────────────────────────────────────────────
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

  -- Count reserved gifts for this order
  select count(*) into v_gifts_count
  from public.referral_gifts
  where order_id = p_order_id and status = 'reserved';

  if v_gifts_count = 0 then
    return jsonb_build_object('success', true, 'message', 'no_reserved_gifts');
  end if;

  v_cost_per_gift := coalesce(p_actual_cost, v_settings.supplier_cost_per_gift);
  v_total_cost := v_cost_per_gift * v_gifts_count;

  -- Update gifts to redeemed
  update public.referral_gifts
  set status = 'redeemed',
      redeemed_at = v_now
  where order_id = p_order_id and status = 'reserved';

  -- Update redemption records to fulfilled
  update public.referral_gift_redemptions
  set status = 'fulfilled',
      fulfilled_at = v_now,
      supplier_cost_snapshot = v_cost_per_gift
  where order_id = p_order_id and status = 'reserved';

  -- Record in cost ledger
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
    is_estimated
  )
  values (
    p_order_id,
    v_order.user_id,
    v_gifts_count,
    v_gifts_count * v_settings.tokens_per_gift,
    v_cost_per_gift,
    v_total_cost,
    p_wallet_before,
    p_wallet_after,
    case when p_wallet_before is not null and p_wallet_after is not null then p_wallet_before - p_wallet_after else null end,
    p_is_estimated
  );

  return jsonb_build_object(
    'success', true,
    'gifts_redeemed', v_gifts_count,
    'total_cost', v_total_cost
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: release_reserved_gifts(p_order_id uuid)
-- If order fails or is cancelled, returns reserved gifts to available
-- ─────────────────────────────────────────────────────────────
create or replace function public.release_reserved_gifts(p_order_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  -- Revert gifts to available
  update public.referral_gifts
  set status = 'available',
      order_id = null
  where order_id = p_order_id and status = 'reserved';

  get diagnostics v_count = row_count;

  -- Mark redemption records as released
  update public.referral_gift_redemptions
  set status = 'released'
  where order_id = p_order_id and status = 'reserved';

  return jsonb_build_object('success', true, 'released_count', v_count);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: revoke_referral_gift(...)
-- Admin manual revocation of fraudulent/unused gifts
-- ─────────────────────────────────────────────────────────────
create or replace function public.revoke_referral_gift(
  p_gift_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_gift record;
begin
  select * into v_gift
  from public.referral_gifts
  where id = p_gift_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'gift_not_found');
  end if;

  if v_gift.status = 'redeemed' then
    return jsonb_build_object('success', false, 'error', 'cannot_revoke_already_redeemed');
  end if;

  update public.referral_gifts
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = p_admin_id,
      revoked_reason = p_reason
  where id = p_gift_id;

  return jsonb_build_object('success', true, 'gift_id', p_gift_id, 'status', 'revoked');
end;
$$;


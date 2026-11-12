-- ============================================================================
-- Migration 041: Complete Referral, Gift Redemption & Signup System
-- DigiVerse - 100% Self-Contained, Idempotent, Crash-Proof
-- ============================================================================

-- 1. Ensure public.profiles has all necessary columns & indexes
alter table public.profiles
  add column if not exists username text,
  add column if not exists referred_by uuid references auth.users(id) on delete set null,
  add column if not exists registration_ip text,
  add column if not exists device_id text,
  add column if not exists balance numeric not null default 0,
  add column if not exists is_admin boolean not null default false;

create unique index if not exists profiles_lower_username_idx
  on public.profiles (lower(trim(username)))
  where username is not null;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by);

-- 2. Ensure public.orders has referral gifts redeemed columns
alter table public.orders
  add column if not exists gifts_redeemed int not null default 0,
  add column if not exists gift_discount numeric not null default 0;

-- 3. App metadata (for admin whitelist of IPs and devices)
create table if not exists public.app_meta (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_meta enable row level security;

drop policy if exists "app_meta: public read" on public.app_meta;
create policy "app_meta: public read" on public.app_meta for select using (true);

drop policy if exists "app_meta: admin full access" on public.app_meta;
create policy "app_meta: admin full access" on public.app_meta for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 4. Banned entities (anti-fraud table for blocked IPs and Devices)
create table if not exists public.banned_entities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ip', 'device')),
  value text not null,
  reason text,
  banned_by text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.banned_entities enable row level security;

create unique index if not exists banned_entities_type_value_idx
  on public.banned_entities (type, lower(trim(value)));

drop policy if exists "banned_entities: admin read" on public.banned_entities;
create policy "banned_entities: admin read" on public.banned_entities for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "banned_entities: admin manage" on public.banned_entities;
create policy "banned_entities: admin manage" on public.banned_entities for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 5. Device registrations table
create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.device_registrations enable row level security;
create index if not exists device_registrations_device_idx on public.device_registrations (device_id);
create index if not exists device_registrations_user_idx on public.device_registrations (user_id);
create index if not exists device_registrations_ip_idx on public.device_registrations (ip_address);

-- 6. Referral system settings
create table if not exists public.referral_settings (
  id int primary key default 1 check (id = 1),
  referral_enabled boolean not null default true,
  redemption_enabled boolean not null default true,
  require_email_verification boolean not null default true,
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
drop policy if exists "referral_settings: public read" on public.referral_settings;
create policy "referral_settings: public read" on public.referral_settings for select using (true);

-- 7. Supplier cost history
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
create policy "supplier_cost_history: admin read" on public.supplier_cost_history for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 8. Referrals table
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade unique,
  referrer_username text,
  status text not null default 'pending_verification',
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
create policy "referrals: user can read own referrals" on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_status_idx on public.referrals (status);

-- 9. Referral gifts (Gift Wallet)
create table if not exists public.referral_gifts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referral_record_id uuid references public.referrals(id) on delete set null,
  reward_type text not null default 'muse_ai_tokens',
  reward_quantity bigint not null default 1000000000,
  status text not null default 'locked',
  created_at timestamptz not null default now(),
  available_at timestamptz not null,
  redeemed_at timestamptz,
  order_id uuid,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_reason text
);

-- Drop restrictive order_id foreign key if it already exists from earlier migrations
alter table public.referral_gifts drop constraint if exists referral_gifts_order_id_fkey;

alter table public.referral_gifts enable row level security;
drop policy if exists "referral_gifts: user can read own gifts" on public.referral_gifts;
create policy "referral_gifts: user can read own gifts" on public.referral_gifts for select
  using (auth.uid() = owner_user_id);

create index if not exists referral_gifts_owner_status_idx on public.referral_gifts (owner_user_id, status);
create index if not exists referral_gifts_available_at_idx on public.referral_gifts (available_at);
create index if not exists referral_gifts_order_id_idx on public.referral_gifts (order_id);

-- 10. Referral gift redemptions
create table if not exists public.referral_gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_id uuid not null references public.referral_gifts(id) on delete cascade,
  order_id uuid not null,
  tokens_redeemed bigint not null default 1000000000,
  supplier_cost_snapshot numeric not null default 0.06,
  currency text not null default 'USD',
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- Drop restrictive order_id foreign key if it already exists
alter table public.referral_gift_redemptions drop constraint if exists referral_gift_redemptions_order_id_fkey;

alter table public.referral_gift_redemptions enable row level security;
drop policy if exists "referral_gift_redemptions: user can read own" on public.referral_gift_redemptions;
create policy "referral_gift_redemptions: user can read own" on public.referral_gift_redemptions for select
  using (auth.uid() = user_id);

create index if not exists redemptions_user_created_idx on public.referral_gift_redemptions (user_id, created_at);
create index if not exists redemptions_order_idx on public.referral_gift_redemptions (order_id);

-- 11. Referral cost ledger
create table if not exists public.referral_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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
create policy "referral_cost_ledger: admin read" on public.referral_cost_ledger for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create index if not exists cost_ledger_user_idx on public.referral_cost_ledger (user_id);
create index if not exists cost_ledger_created_idx on public.referral_cost_ledger (created_at);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER FUNCTION: handle_new_user()
-- 100% crash-proof: Any error inside is caught so new signups
-- NEVER fail with "Database error saving new user".
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
  v_is_oauth boolean := false;
  v_req_email boolean := true;
  v_is_whitelisted boolean := false;
  v_base_user text;
  v_candidate text;
  v_suffix text;
  v_try_count integer := 0;
begin
  -- 1. Check if user signed up via OAuth provider (e.g. Google)
  if (new.raw_app_meta_data->>'provider' is not null and new.raw_app_meta_data->>'provider' <> 'email')
     or (new.app_metadata->>'provider' is not null and new.app_metadata->>'provider' <> 'email') then
    v_is_oauth := true;
  end if;

  -- 2. Domain check
  v_email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));
  if not v_is_oauth and v_email_domain <> '' then
    if v_email_domain not in ('gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'googlemail.com') then
      raise warning 'Non-standard domain: %', v_email_domain;
    end if;
  end if;

  -- 3. Username resolution
  v_raw_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_raw_username <> '' then
    v_clean_username := lower(v_raw_username);
    -- If already taken by another user, append random 4-digit suffix so unique constraint never trips
    if exists (select 1 from public.profiles where lower(trim(username)) = v_clean_username and id <> new.id) then
      v_clean_username := substring(v_clean_username from 1 for 18) || '_' || floor(random() * 9000 + 1000)::text;
    end if;
  else
    -- Generate from email prefix
    v_base_user := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9_]', '', 'g'));
    if length(v_base_user) < 3 then
      v_base_user := 'user_' || v_base_user;
    end if;
    if length(v_base_user) > 18 then
      v_base_user := substring(v_base_user from 1 for 18);
    end if;

    v_candidate := v_base_user;
    while exists (select 1 from public.profiles where lower(trim(username)) = v_candidate and id <> new.id) and v_try_count < 15 loop
      v_suffix := floor(random() * 9000 + 1000)::text;
      v_candidate := substring(v_base_user from 1 for 18) || '_' || v_suffix;
      v_try_count := v_try_count + 1;
    end loop;
    v_clean_username := v_candidate;
  end if;

  -- Strip leading '@' from referral code (e.g. '@sardar' -> 'sardar')
  v_ref_code := ltrim(trim(coalesce(new.raw_user_meta_data->>'ref', '')), '@');
  v_device_id := trim(coalesce(new.raw_user_meta_data->>'device_id', ''));
  v_reg_ip := trim(coalesce(new.raw_user_meta_data->>'registration_ip', ''));

  -- 4. Resolve inviter if referral code was provided
  if v_ref_code <> '' then
    begin
      select id into v_inviter_id
      from public.profiles
      where lower(trim(username)) = lower(v_ref_code)
      limit 1;

      -- Prevent self-referral
      if v_inviter_id = new.id then
        v_inviter_id := null;
      end if;
    exception when others then
      v_inviter_id := null;
    end;
  end if;

  -- 5. Safe upsert into public.profiles
  begin
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
      nullif(v_device_id, ''),
      nullif(v_reg_ip, '')
    )
    on conflict (id) do update set
      email = excluded.email,
      username = coalesce(public.profiles.username, excluded.username),
      referred_by = coalesce(public.profiles.referred_by, excluded.referred_by),
      device_id = coalesce(public.profiles.device_id, excluded.device_id),
      registration_ip = coalesce(public.profiles.registration_ip, excluded.registration_ip);
  exception when others then
    begin
      insert into public.profiles (id, email)
      values (new.id, new.email)
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end;

  -- 6. Safe device tracking & referral record tracking
  begin
    if v_device_id <> '' and to_regclass('public.device_registrations') is not null then
      begin
        insert into public.device_registrations (device_id, user_id, ip_address)
        values (v_device_id, new.id, nullif(v_reg_ip, ''));
      exception when others then
        null;
      end;
    end if;

    if v_inviter_id is not null and to_regclass('public.referrals') is not null then
      begin
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
          nullif(v_device_id, ''),
          nullif(v_reg_ip, ''),
          'pending_verification'
        )
        on conflict (referred_id) do update set
          referrer_id = excluded.referrer_id,
          referrer_username = excluded.referrer_username;
      exception when others then
        null;
      end;

      -- Check if email verification is required
      if to_regclass('public.referral_settings') is not null then
        begin
          select coalesce(require_email_verification, true) into v_req_email
          from public.referral_settings
          where id = 1;
        exception when others then
          v_req_email := true;
        end;
      end if;

      -- Check Admin Whitelist
      begin
        select exists (
          select 1 from public.app_meta
          where key = 'admin_whitelist_ips'
            and nullif(v_reg_ip, '') is not null
            and position(lower(trim(v_reg_ip)) in lower(value)) > 0
        ) or exists (
          select 1 from public.app_meta
          where key = 'admin_whitelist_devices'
            and nullif(v_device_id, '') is not null
            and position(lower(trim(v_device_id)) in lower(value)) > 0
        ) into v_is_whitelisted;
      exception when others then
        v_is_whitelisted := false;
      end;

      -- If email verification is OFF or user is OAuth or whitelisted, qualify immediately!
      if v_req_email is false or v_is_oauth or v_is_whitelisted then
        begin
          perform public.qualify_referral(new.id);
        exception when others then
          null;
        end;
      end if;
    end if;
  exception when others then
    null;
  end;

  return new;
exception when others then
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger on email verification in auth.users
create or replace function public.handle_user_email_verified()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null or old.email_confirmed_at <> new.email_confirmed_at) then
    begin
      perform public.qualify_referral(new.id);
    exception when others then
      null;
    end;
  end if;
  return new;
exception when others then
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_user_email_verified();

-- ─────────────────────────────────────────────────────────────
-- RPC: qualify_referral(p_referred_user_id uuid)
-- Dual Rewards: Grants 1B tokens (1 Gift Box) to BOTH:
--   1. Referrer (Inviter)
--   2. Referred User (New Signup)
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
  v_earned_gifts int;
  v_referrer_gift_id uuid;
  v_referred_gift_id uuid;
  v_available_at timestamptz;
  v_now timestamptz := now();
  v_req_email boolean := true;
  v_is_whitelisted boolean := false;
  v_lock_seconds int := 30;
  v_tokens bigint := 1000000000;
  v_gift_status text := 'locked';
begin
  -- 1. Load referral record
  select * into v_ref
  from public.referrals
  where referred_id = p_referred_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_referral_found');
  end if;

  -- If already qualified AND reward was already issued
  if v_ref.reward_issued is true and (v_ref.status = 'qualified' or v_ref.status = 'qualified_cap_reached') then
    return jsonb_build_object('success', true, 'status', 'already_qualified', 'reward_issued', true);
  end if;

  -- 2. Load referral settings
  select * into v_settings from public.referral_settings where id = 1;
  if found then
    v_req_email := coalesce(v_settings.require_email_verification, true);
    v_lock_seconds := coalesce(v_settings.lock_delay_seconds, 30);
    v_tokens := coalesce(v_settings.tokens_per_gift, 1000000000);
    if not coalesce(v_settings.referral_enabled, true) then
      return jsonb_build_object('success', false, 'reason', 'referral_system_disabled');
    end if;
  end if;

  -- 3. Check Admin Whitelist (bypasses email check and anti-fraud checks for testing)
  select exists (
    select 1 from public.app_meta
    where key = 'admin_whitelist_ips'
      and v_ref.registration_ip is not null
      and position(lower(trim(v_ref.registration_ip)) in lower(value)) > 0
  ) or exists (
    select 1 from public.app_meta
    where key = 'admin_whitelist_devices'
      and v_ref.device_id is not null
      and position(lower(trim(v_ref.device_id)) in lower(value)) > 0
  ) into v_is_whitelisted;

  -- 4. Check email verification (bypassed if require_email_verification is false OR if whitelisted)
  select email_confirmed_at into v_confirmed_at
  from auth.users
  where id = p_referred_user_id;

  if v_req_email and not v_is_whitelisted and v_confirmed_at is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  v_confirmed_at := coalesce(v_confirmed_at, v_now);

  -- 5. Anti-Fraud Checks (bypassed if whitelisted)
  if not v_is_whitelisted then
    -- Check A: Same device as referrer
    select device_id into v_referrer_device from public.profiles where id = v_ref.referrer_id;
    if v_ref.device_id is not null and v_referrer_device is not null and v_ref.device_id = v_referrer_device then
      update public.referrals
      set status = 'flagged_suspicious', suspicious_reason = 'same_device_as_referrer', updated_at = v_now
      where id = v_ref.id;
      return jsonb_build_object('success', false, 'reason', 'flagged_same_device');
    end if;

    -- Check B: Device registration cap in referrals
    if v_ref.device_id is not null and v_ref.device_id <> '' then
      select count(*) into v_device_count
      from public.referrals
      where device_id is not null
        and lower(trim(device_id)) = lower(trim(v_ref.device_id))
        and id <> v_ref.id;

      if v_device_count >= coalesce(v_settings.fraud_max_accounts_per_device, 1) then
        update public.referrals
        set status = 'flagged_suspicious', suspicious_reason = 'device_registration_cap_exceeded', updated_at = v_now
        where id = v_ref.id;
        return jsonb_build_object('success', false, 'reason', 'flagged_device_burst');
      end if;
    end if;

    -- Check C: IP registration cap in referrals
    if v_ref.registration_ip is not null and v_ref.registration_ip <> '' then
      declare
        v_ip_count int := 0;
      begin
        select count(*) into v_ip_count
        from public.referrals
        where registration_ip is not null
          and trim(registration_ip) = trim(v_ref.registration_ip)
          and id <> v_ref.id;

        if v_ip_count >= coalesce(v_settings.fraud_max_accounts_per_ip, 2) then
          update public.referrals
          set status = 'flagged_suspicious', suspicious_reason = 'ip_registration_cap_exceeded', updated_at = v_now
          where id = v_ref.id;
          return jsonb_build_object('success', false, 'reason', 'flagged_ip_burst');
        end if;
      end;
    end if;
  end if;

  -- 6. Check Referrer Lifetime Cap
  select count(*) into v_earned_gifts
  from public.referral_gifts
  where owner_user_id = v_ref.referrer_id
    and status <> 'revoked';

  -- Calculate unlock timing
  if v_lock_seconds > 0 then
    v_available_at := v_now + (v_lock_seconds || ' seconds')::interval;
    v_gift_status := 'locked';
  else
    v_available_at := v_now;
    v_gift_status := 'available';
  end if;

  -- 7. REWARD 1: Issue Gift Box to Referrer (Inviter)
  if v_earned_gifts < coalesce(v_settings.max_lifetime_gifts, 15) then
    select id into v_referrer_gift_id
    from public.referral_gifts
    where referral_record_id = v_ref.id
      and owner_user_id = v_ref.referrer_id
    limit 1;

    if v_referrer_gift_id is null then
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
        v_tokens,
        v_gift_status,
        v_now,
        v_available_at
      )
      returning id into v_referrer_gift_id;
    end if;
  end if;

  -- 8. REWARD 2: Issue Welcome Gift Box to Referred User (New Signup)
  select id into v_referred_gift_id
  from public.referral_gifts
  where referral_record_id = v_ref.id
    and owner_user_id = p_referred_user_id
  limit 1;

  if v_referred_gift_id is null then
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
      p_referred_user_id,
      v_ref.referrer_id,
      p_referred_user_id,
      v_ref.id,
      'muse_ai_tokens',
      v_tokens,
      v_gift_status,
      v_now,
      v_available_at
    )
    returning id into v_referred_gift_id;
  end if;

  -- 9. Update Referral Record
  update public.referrals
  set status = case when v_earned_gifts >= coalesce(v_settings.max_lifetime_gifts, 15) then 'qualified_cap_reached' else 'qualified' end,
      reward_issued = true,
      suspicious_reason = null,
      verified_at = v_confirmed_at,
      updated_at = v_now
  where id = v_ref.id;

  return jsonb_build_object(
    'success', true,
    'status', 'qualified',
    'reward_issued', true,
    'referrer_gift_id', v_referrer_gift_id,
    'referred_gift_id', v_referred_gift_id,
    'tokens_each', v_tokens,
    'available_at', v_available_at,
    'lock_seconds', v_lock_seconds
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: get_user_gift_wallet_stats(p_user_id uuid)
-- Returns live, atomic counts for user gift wallet dashboard
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
    'max_lifetime_gifts', coalesce(v_settings.max_lifetime_gifts, 15),
    'remaining_capacity', greatest(0, coalesce(v_settings.max_lifetime_gifts, 15) - v_total_earned),
    'daily_limit', coalesce(v_settings.daily_redemption_limit, 3),
    'today_redeemed', v_today_redeemed,
    'remaining_today', greatest(0, coalesce(v_settings.daily_redemption_limit, 3) - v_today_redeemed),
    'redemption_enabled', coalesce(v_settings.redemption_enabled, true),
    'next_unlock_seconds', v_next_unlock_sec
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: reserve_gifts_for_order(...)
-- Atomically reserves available gift boxes for checkout.
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
  if not found or not coalesce(v_settings.redemption_enabled, true) then
    raise exception 'Gift redemption is currently disabled by administrator';
  end if;

  -- 2. Check product eligibility: Muse AI tokens only (tunvn_buff = true)
  select * into v_prod from public.products where id = p_product_id;
  if not found or not coalesce(v_prod.tunvn_buff, false) then
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

  v_cost_per_gift := coalesce(p_actual_cost, v_settings.supplier_cost_per_gift, 0.06);
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
    v_gifts_count * coalesce(v_settings.tokens_per_gift, 1000000000),
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
-- Admin revoke action
-- ─────────────────────────────────────────────────────────────
create or replace function public.revoke_referral_gift(
  p_gift_id uuid,
  p_admin_id uuid,
  p_reason text default 'Revoked by admin'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_gift record;
  v_now timestamptz := now();
begin
  select * into v_gift from public.referral_gifts where id = p_gift_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'gift_not_found');
  end if;

  if v_gift.status = 'redeemed' then
    return jsonb_build_object('success', false, 'error', 'cannot_revoke_already_redeemed');
  end if;

  update public.referral_gifts
  set status = 'revoked',
      revoked_at = v_now,
      revoked_by = p_admin_id,
      revoked_reason = p_reason
  where id = p_gift_id;

  return jsonb_build_object('success', true, 'gift_id', p_gift_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- GRANTS & SCHEMA CACHE RELOAD
-- ─────────────────────────────────────────────────────────────
grant execute on function public.handle_new_user() to service_role, anon, authenticated;
grant execute on function public.handle_user_email_verified() to service_role, anon, authenticated;
grant execute on function public.qualify_referral(uuid) to service_role, authenticated, anon;
grant execute on function public.get_user_gift_wallet_stats(uuid) to service_role, authenticated, anon;
grant execute on function public.reserve_gifts_for_order(uuid, uuid, bigint, int) to service_role, authenticated;
grant execute on function public.finalize_gift_redemption(uuid, numeric, numeric, numeric, boolean) to service_role;
grant execute on function public.release_reserved_gifts(uuid) to service_role, authenticated;
grant execute on function public.revoke_referral_gift(uuid, uuid, text) to service_role, authenticated;

-- Refresh PostgREST schema cache so all RPC functions are immediately discoverable
notify pgrst, 'reload schema';


-- ============================================================================
-- Migration 040: Dual Referral Rewards (Both Inviter & New User get 1B Tokens)
-- DigiVerse - Safe to re-run, fully idempotent, 100% self-contained
-- ============================================================================

-- 0. Ensure required prerequisite tables exist
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

-- 1. Ensure public.referral_settings has require_email_verification
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

-- 2. Ensure public.device_registrations table exists
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

-- 3. Ensure public.referrals and public.referral_gifts exist
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id),
  referred_id uuid not null references auth.users(id) unique,
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
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_status_idx on public.referrals (status);

create table if not exists public.referral_gifts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  referrer_user_id uuid not null references auth.users(id),
  referred_user_id uuid not null references auth.users(id),
  referral_record_id uuid references public.referrals(id),
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

alter table public.referral_gifts enable row level security;
drop policy if exists "referral_gifts: user can read own gifts" on public.referral_gifts;
create policy "referral_gifts: user can read own gifts"
  on public.referral_gifts for select
  using (auth.uid() = owner_user_id);

create index if not exists referral_gifts_owner_status_idx on public.referral_gifts (owner_user_id, status);

-- 4. DUAL REWARDS qualify_referral RPC function
-- Grants 1 Billion tokens gift box to BOTH:
--   1. Referrer (Inviter)
--   2. Referred User (New Signup)
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

  -- If already qualified AND reward was already issued, return existing status
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

  -- 3. Check Admin Whitelist (bypasses email check and same-device/anti-fraud check for testing)
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

  -- 4. Check email verification (bypassed if v_req_email is false OR if whitelisted)
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

    -- Check B: Device registration burst
    if v_ref.device_id is not null and to_regclass('public.device_registrations') is not null then
      select count(distinct user_id) into v_device_count
      from public.device_registrations
      where device_id = v_ref.device_id;

      if v_device_count > coalesce(v_settings.fraud_max_accounts_per_device, 2) then
        update public.referrals
        set status = 'flagged_suspicious', suspicious_reason = 'device_registration_cap_exceeded', updated_at = v_now
        where id = v_ref.id;
        return jsonb_build_object('success', false, 'reason', 'flagged_device_burst');
      end if;
    end if;
  end if;

  -- 6. Check Referrer Lifetime Cap (default 15)
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

  -- 7. REWARD 1: Issue Gift Box to Referrer (Inviter) - only if under lifetime cap
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
  -- The friend who joined ALWAYS gets their 1B tokens welcome gift box!
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

-- 5. Update handle_new_user() trigger with clean username & referral resolution
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

  -- 2. Domain check for email signups (safe fallback)
  v_email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));
  if not v_is_oauth and v_email_domain <> '' then
    if v_email_domain not in ('gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'googlemail.com') then
      raise warning 'Non-whitelisted domain registration: %', v_email_domain;
    end if;
  end if;

  -- 3. Username resolution
  v_raw_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_raw_username <> '' then
    v_clean_username := lower(v_raw_username);
  else
    -- Auto-generate clean unique username from email prefix (for Google OAuth or users without explicit username)
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

  -- Strip any leading '@' from referral code
  v_ref_code := ltrim(trim(coalesce(new.raw_user_meta_data->>'ref', '')), '@');
  v_device_id := trim(coalesce(new.raw_user_meta_data->>'device_id', ''));
  v_reg_ip := trim(coalesce(new.raw_user_meta_data->>'registration_ip', ''));

  -- 4. Resolve inviter if referral code was provided in metadata
  if v_ref_code <> '' then
    begin
      select id into v_inviter_id
      from public.profiles
      where lower(trim(username)) = lower(v_ref_code)
      limit 1;

      -- Self-referral prevention
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
      execute 'insert into public.device_registrations (device_id, user_id, ip_address)
               values ($1, $2, $3)
               on conflict do nothing'
      using v_device_id, new.id, nullif(v_reg_ip, '');
    end if;

    if v_inviter_id is not null and to_regclass('public.referrals') is not null then
      execute 'insert into public.referrals (
        referrer_id,
        referred_id,
        referrer_username,
        device_id,
        registration_ip,
        status
      )
      values ($1, $2, $3, $4, $5, ''pending_verification'')
      on conflict (referred_id) do update set
        referrer_id = excluded.referrer_id,
        referrer_username = excluded.referrer_username'
      using v_inviter_id, new.id, v_ref_code, nullif(v_device_id, ''), nullif(v_reg_ip, '');

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

-- 6. Trigger on email verification in auth.users
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
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_user_email_verified();

-- 7. Retroactive qualification: qualify all existing referrals and issue dual gifts right now!
do $$
declare
  r record;
begin
  if to_regclass('public.referrals') is not null then
    for r in select referred_id from public.referrals where reward_issued is not true or status in ('flagged_suspicious', 'pending_verification') loop
      begin
        perform public.qualify_referral(r.referred_id);
      exception when others then
        null;
      end;
    end loop;
  end if;
end $$;


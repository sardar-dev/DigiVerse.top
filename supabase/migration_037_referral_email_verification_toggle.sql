-- ============================================================================
-- Migration 037: Referral Email Verification Requirement Toggle
-- DigiVerse - Safe to re-run, fully idempotent
--
-- Adds require_email_verification to referral_settings:
--  - When TRUE (ON / Default): Only users with verified emails qualify as valid referrals.
--  - When FALSE (OFF): All accounts created with referral qualify immediately (even without email verification).
-- ============================================================================

-- 1. Add column to referral_settings if not exists
alter table public.referral_settings
  add column if not exists require_email_verification boolean not null default true;

-- 2. Update qualify_referral RPC function to check require_email_verification
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
  v_req_email boolean := true;
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

  -- 2. Load referral settings
  select * into v_settings from public.referral_settings where id = 1;
  if not found or not v_settings.referral_enabled then
    return jsonb_build_object('success', false, 'reason', 'referral_system_disabled');
  end if;

  v_req_email := coalesce(v_settings.require_email_verification, true);

  -- 3. Verify email confirmation (only enforced if v_req_email is TRUE)
  select email_confirmed_at into v_confirmed_at
  from auth.users
  where id = p_referred_user_id;

  if v_req_email and v_confirmed_at is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  v_confirmed_at := coalesce(v_confirmed_at, v_now);

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

  -- Check C: IP registration burst
  if v_ref.registration_ip is not null then
    select count(distinct id) into v_ip_count
    from public.profiles
    where registration_ip = v_ref.registration_ip;

    if v_ip_count > v_settings.fraud_max_accounts_per_ip then
      update public.referrals
      set status = 'flagged_suspicious', suspicious_reason = 'ip_registration_cap_exceeded', updated_at = v_now
      where id = v_ref.id;
      return jsonb_build_object('success', false, 'reason', 'flagged_ip_burst');
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

  -- 6. Issue Gift Box with Reward Lock (default 30 seconds)
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

-- 3. Update handle_new_user() trigger to automatically qualify if require_email_verification is OFF
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
  v_req_email boolean := true;
begin
  -- Validate email domain: Only allowed domains for new signups
  v_email_domain := lower(split_part(new.email, '@', 2));
  if v_email_domain not in ('gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com') then
    raise exception 'Registration is only allowed with gmail.com, outlook.com, yahoo.com, hotmail.com, or icloud.com';
  end if;

  v_raw_username := trim(new.raw_user_meta_data->>'username');
  if v_raw_username is not null and v_raw_username <> '' then
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

  -- Create referral record if an inviter was found
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

    -- Check if email verification is required
    select coalesce(require_email_verification, true) into v_req_email
    from public.referral_settings
    where id = 1;

    -- If email verification is OFF, qualify immediately upon signup!
    if v_req_email is false then
      perform public.qualify_referral(new.id);
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;


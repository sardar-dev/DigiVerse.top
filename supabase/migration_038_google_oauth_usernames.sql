-- Migration 038: Support Google OAuth sign-in and unified automatic user profile creation
-- - Auto-generates clean, unique username if raw_user_meta_data->>'username' is absent (e.g. Google OAuth sign-in)
-- - Allows all Google OAuth verified emails while keeping strict domain restrictions for email/password signups
-- - Seamlessly supports referral attribution during Google OAuth sign-up

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
  v_base_user text;
  v_candidate text;
  v_suffix text;
  v_try_count integer := 0;
begin
  -- Check if user signed up via OAuth provider (e.g. Google)
  if (new.raw_app_meta_data->>'provider' is not null and new.raw_app_meta_data->>'provider' <> 'email')
     or (new.app_metadata->>'provider' is not null and new.app_metadata->>'provider' <> 'email') then
    v_is_oauth := true;
  end if;

  -- Domain check: Allow all OAuth users (already verified by provider like Google);
  -- For direct email signups, enforce allowed domains.
  v_email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));
  if not v_is_oauth then
    if v_email_domain not in ('gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'googlemail.com') then
      raise exception 'Registration is only allowed with gmail.com, outlook.com, yahoo.com, hotmail.com, or icloud.com';
    end if;
  end if;

  -- Username resolution
  v_raw_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_raw_username <> '' then
    if not (v_raw_username ~* '^[a-zA-Z0-9_]{3,24}$') then
      raise exception 'Username must be 3-24 characters and contain only letters, numbers, and underscores';
    end if;
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

  v_ref_code := trim(coalesce(new.raw_user_meta_data->>'ref', ''));
  v_device_id := trim(coalesce(new.raw_user_meta_data->>'device_id', ''));
  v_reg_ip := trim(coalesce(new.raw_user_meta_data->>'registration_ip', ''));

  -- Resolve inviter if referral code was provided in metadata
  if v_ref_code <> '' then
    select id into v_inviter_id
    from public.profiles
    where lower(trim(username)) = lower(v_ref_code)
    limit 1;

    -- Self-referral prevention
    if v_inviter_id = new.id then
      v_inviter_id := null;
    end if;
  end if;

  -- Upsert into public.profiles
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

  -- Track device registration
  if v_device_id <> '' then
    insert into public.device_registrations (device_id, user_id, ip_address)
    values (v_device_id, new.id, nullif(v_reg_ip, ''))
    on conflict do nothing;
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
      nullif(v_device_id, ''),
      nullif(v_reg_ip, ''),
      'pending_verification'
    )
    on conflict (referred_id) do nothing;

    -- Check if email verification is required
    select coalesce(require_email_verification, true) into v_req_email
    from public.referral_settings
    where id = 1;

    -- If email verification is OFF or user is already verified via OAuth, qualify immediately
    if v_req_email is false or v_is_oauth then
      perform public.qualify_referral(new.id);
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;


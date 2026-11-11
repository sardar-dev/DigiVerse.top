-- ============================================================================
-- Migration 039: Banned Devices & IP Addresses Management & Fresh Start Reset
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

-- 1. Ensure public.device_registrations table exists
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

drop policy if exists "device_registrations: admin read" on public.device_registrations;
create policy "device_registrations: admin read"
  on public.device_registrations for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 2. Create table public.banned_entities (for database-level persistence)
create table if not exists public.banned_entities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ip', 'device')),
  value text not null,
  reason text,
  banned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint banned_entities_type_value_unique unique (type, value)
);

create index if not exists banned_entities_type_idx on public.banned_entities(type);
create index if not exists banned_entities_value_idx on public.banned_entities(value);

alter table public.banned_entities enable row level security;

-- Admin-only full access policy
drop policy if exists "banned_entities: admin full access" on public.banned_entities;
create policy "banned_entities: admin full access"
  on public.banned_entities for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Public read policy (for signup validation check)
drop policy if exists "banned_entities: public read" on public.banned_entities;
create policy "banned_entities: public read"
  on public.banned_entities for select
  using (true);

-- 3. Resilient, crash-proof handle_new_user() trigger function
-- Never aborts auth.users insert so signup never produces HTTP 500 error
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

  v_ref_code := trim(coalesce(new.raw_user_meta_data->>'ref', ''));
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
    -- Fallback insert so auth.users is never aborted
    begin
      insert into public.profiles (id, email)
      values (new.id, new.email)
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end;

  -- 6. Safe device tracking & referral record tracking (Dynamic SQL so missing tables never crash signup)
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
      on conflict (referred_id) do nothing'
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

      -- If email verification is OFF or user is already verified via OAuth, qualify
      if v_req_email is false or v_is_oauth then
        begin
          perform public.qualify_referral(new.id);
        exception when others then
          null;
        end;
      end if;
    end if;
  exception when others then
    -- Never let referral tracking crash user signup
    null;
  end;

  return new;
exception when others then
  -- Global safeguard: auth.users MUST ALWAYS SUCCEED
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Clean Slate Reset: Unflag any referrals flagged during previous testing (if table exists)
do $$
begin
  if to_regclass('public.referrals') is not null then
    update public.referrals
    set status = 'qualified',
        suspicious_reason = null,
        updated_at = now()
    where status = 'flagged_suspicious';
  end if;
end $$;

-- 5. Reset old test device registrations so devices start fresh
delete from public.device_registrations;

-- 6. Set fresh start timestamp in app_meta
insert into public.app_meta (key, value, updated_at)
values ('banned_system_started_at', now()::text, now())
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

-- 7. Helper function for admin to reset bans on demand
create or replace function public.admin_clear_past_bans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared_refs int := 0;
  v_deleted_devs int := 0;
  v_deleted_bans int := 0;
begin
  -- Check admin permission
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Unauthorized: Admin access required';
  end if;

  -- 1. Unflag referrals if table exists
  if to_regclass('public.referrals') is not null then
    execute 'with updated as (
      update public.referrals
      set status = ''qualified'', suspicious_reason = null, updated_at = now()
      where status = ''flagged_suspicious''
      returning id
    ) select coalesce(count(*), 0) from updated' into v_cleared_refs;
  end if;

  -- 2. Clear device registrations if table exists
  if to_regclass('public.device_registrations') is not null then
    execute 'with deleted_dev as (
      delete from public.device_registrations
      returning id
    ) select coalesce(count(*), 0) from deleted_dev' into v_deleted_devs;
  end if;

  -- 3. Clear banned entities
  with deleted_b as (
    delete from public.banned_entities
    returning id
  )
  select coalesce(count(*), 0) into v_deleted_bans from deleted_b;

  -- 4. Update app_meta
  insert into public.app_meta (key, value, updated_at)
  values ('banned_system_started_at', now()::text, now())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.app_meta (key, value, updated_at)
  values ('banned_entities_json', '[]', now())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  return jsonb_build_object(
    'success', true,
    'cleared_referrals', v_cleared_refs,
    'deleted_devices', v_deleted_devs,
    'deleted_bans', v_deleted_bans,
    'started_at', now()
  );
end;
$$;

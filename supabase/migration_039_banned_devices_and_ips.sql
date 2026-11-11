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

-- 3. Clean Slate Reset: Unflag any referrals flagged during previous testing (if table exists)
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

-- 4. Reset old test device registrations so devices start fresh
delete from public.device_registrations;

-- 5. Set fresh start timestamp in app_meta
insert into public.app_meta (key, value, updated_at)
values ('banned_system_started_at', now()::text, now())
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

-- 6. Helper function for admin to reset bans on demand
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

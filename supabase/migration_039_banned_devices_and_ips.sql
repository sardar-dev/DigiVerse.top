-- ============================================================================
-- Migration 039: Banned Devices & IP Addresses Management & Fresh Start Reset
-- DigiVerse - Safe to re-run, fully idempotent
-- ============================================================================

-- 1. Create table public.banned_entities (for database-level persistence)
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

-- 2. Clean Slate Reset: Unflag any referrals flagged during previous testing
update public.referrals
set status = 'qualified',
    suspicious_reason = null,
    updated_at = now()
where status = 'flagged_suspicious';

-- 3. Reset old test device registrations so devices start fresh
delete from public.device_registrations
where device_id is not null;

-- 4. Set fresh start timestamp in app_meta
insert into public.app_meta (key, value, updated_at)
values ('banned_system_started_at', now()::text, now())
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

-- 5. Helper function for admin to reset bans on demand
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

  -- 1. Unflag referrals
  with updated as (
    update public.referrals
    set status = 'qualified', suspicious_reason = null, updated_at = now()
    where status = 'flagged_suspicious'
    returning id
  )
  select count(*) into v_cleared_refs from updated;

  -- 2. Clear device registrations
  with deleted_dev as (
    delete from public.device_registrations
    returning id
  )
  select count(*) into v_deleted_devs from deleted_dev;

  -- 3. Clear banned entities
  with deleted_b as (
    delete from public.banned_entities
    returning id
  )
  select count(*) into v_deleted_bans from deleted_b;

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


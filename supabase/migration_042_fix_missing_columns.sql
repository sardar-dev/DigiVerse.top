-- ============================================================================
-- Migration 042: Fix Missing Columns on Referral & Redemptions Tables
-- DigiVerse - Safe, Idempotent, Fast
-- ============================================================================

-- 1. Ensure referral_gift_redemptions has currency and all required columns
alter table if exists public.referral_gift_redemptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists gift_id uuid references public.referral_gifts(id) on delete cascade,
  add column if not exists order_id uuid,
  add column if not exists tokens_redeemed bigint not null default 1000000000,
  add column if not exists supplier_cost_snapshot numeric not null default 0.06,
  add column if not exists currency text not null default 'USD',
  add column if not exists status text not null default 'reserved',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists fulfilled_at timestamptz;

-- Drop foreign key on order_id to prevent constraint errors
alter table if exists public.referral_gift_redemptions
  drop constraint if exists referral_gift_redemptions_order_id_fkey;

-- 2. Ensure referral_gifts has all required columns
alter table if exists public.referral_gifts
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists referrer_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists referred_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists referral_record_id uuid references public.referrals(id) on delete set null,
  add column if not exists reward_type text not null default 'muse_ai_tokens',
  add column if not exists reward_quantity bigint not null default 1000000000,
  add column if not exists status text not null default 'locked',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists redeemed_at timestamptz,
  add column if not exists order_id uuid,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id),
  add column if not exists revoked_reason text;

-- Drop foreign key on order_id
alter table if exists public.referral_gifts
  drop constraint if exists referral_gifts_order_id_fkey;

-- 3. Ensure referral_cost_ledger has all required columns
alter table if exists public.referral_cost_ledger
  add column if not exists gifts_count int not null default 1,
  add column if not exists tokens_fulfilled bigint not null default 1000000000,
  add column if not exists supplier_cost_per_gift numeric not null default 0.06,
  add column if not exists total_supplier_cost numeric not null default 0.06,
  add column if not exists supplier_wallet_before numeric,
  add column if not exists supplier_wallet_after numeric,
  add column if not exists actual_deducted numeric,
  add column if not exists is_estimated boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

-- Drop foreign key on order_id
alter table if exists public.referral_cost_ledger
  drop constraint if exists referral_cost_ledger_order_id_fkey;

-- 4. Ensure referral_settings has all required columns
alter table if exists public.referral_settings
  add column if not exists referral_enabled boolean not null default true,
  add column if not exists redemption_enabled boolean not null default true,
  add column if not exists require_email_verification boolean not null default false,
  add column if not exists max_lifetime_gifts int not null default 15,
  add column if not exists daily_redemption_limit int not null default 3,
  add column if not exists lock_delay_seconds int not null default 30,
  add column if not exists tokens_per_gift bigint not null default 1000000000,
  add column if not exists supplier_cost_per_gift numeric not null default 0.06,
  add column if not exists currency text not null default 'USD',
  add column if not exists fraud_max_accounts_per_ip int not null default 2,
  add column if not exists fraud_max_accounts_per_device int not null default 1,
  add column if not exists whitelisted_ips text default '',
  add column if not exists whitelisted_device_ids text default '';

-- 5. Backfill any missing profiles from auth.users and fix null created_at
alter table if exists public.profiles
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists balance numeric not null default 0,
  add column if not exists is_admin boolean not null default false;

insert into public.profiles (id, email, username, created_at, balance)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1)
  ),
  coalesce(u.created_at, now()),
  0
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

update public.profiles p
set created_at = coalesce(u.created_at, now())
from auth.users u
where p.id = u.id and p.created_at is null;

-- 6. Notify PostgREST schema cache to reload
notify pgrst, 'reload schema';


-- 018: AI-rewritten product descriptions + wrong-tx-hash rate limit.
-- Safe to re-run.

-- ── 1. Rewritten description (admin reviews, then saves) ───────
-- The supplier's original `description` is never touched; the storefront
-- shows ai_description when it is set. Clearing it restores the original.
alter table public.products
  add column if not exists ai_description text;

-- ── 2. Wrong tx hash → 2 minute freeze ─────────────────────────
-- 3 wrong hashes within 10 minutes locks that user's payment checks for
-- 2 minutes. One tiny row per user; old rows are purged daily.
create table if not exists public.hash_failures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fails integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.hash_failures enable row level security; -- server-only

create or replace function public.record_hash_failure(p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
  v_locked timestamptz;
begin
  insert into public.hash_failures as h (user_id, fails, window_start, updated_at)
  values (p_user, 1, now(), now())
  on conflict (user_id) do update set
    fails = case when h.window_start < now() - interval '10 minutes' then 1 else h.fails + 1 end,
    window_start = case when h.window_start < now() - interval '10 minutes' then now() else h.window_start end,
    updated_at = now()
  returning h.fails into v_fails;

  if v_fails >= 3 then
    update public.hash_failures
       set fails = 0, window_start = now(), locked_until = now() + interval '2 minutes'
     where user_id = p_user
    returning locked_until into v_locked;
    return v_locked;
  end if;
  return null;
end;
$$;

revoke all on function public.record_hash_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_hash_failure(uuid) to service_role;

-- ── 3. Housekeeping: also drop old hash_failures rows ──────────
create or replace function public.purge_stale_pending()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_orders integer;
  n_invoices integer;
begin
  delete from public.orders
   where status = 'pending_payment'
     and tx_hash is null
     and created_at < now() - interval '3 hours';
  get diagnostics n_orders = row_count;

  delete from public.wallet_deposit_invoices
   where status = 'expired'
      or (status = 'pending' and created_at < now() - interval '3 hours');
  get diagnostics n_invoices = row_count;

  delete from public.hash_failures where updated_at < now() - interval '1 day';

  return jsonb_build_object('orders', n_orders, 'invoices', n_invoices);
end;
$$;

revoke all on function public.purge_stale_pending() from public, anon, authenticated;
grant execute on function public.purge_stale_pending() to service_role;

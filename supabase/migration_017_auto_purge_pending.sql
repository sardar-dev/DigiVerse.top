-- 017: auto-delete stale unpaid records to keep the database small.
--  * orders still "pending_payment" (Awaiting payment) after 3 hours
--  * deposit invoices that are expired, or still pending after 3 hours
-- Paid / submitted / delivered / failed records are never touched.
-- Safe to re-run.

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
  -- Unpaid orders: no payment attached (tx_hash null) and older than 3h.
  delete from public.orders
   where status = 'pending_payment'
     and tx_hash is null
     and created_at < now() - interval '3 hours';
  get diagnostics n_orders = row_count;

  -- Deposit invoices: expired, or "awaiting payment" for over 3h.
  -- Matched invoices (credited deposits) are kept.
  delete from public.wallet_deposit_invoices
   where status = 'expired'
      or (status = 'pending' and created_at < now() - interval '3 hours');
  get diagnostics n_invoices = row_count;

  return jsonb_build_object('orders', n_orders, 'invoices', n_invoices);
end;
$$;

revoke all on function public.purge_stale_pending() from public, anon, authenticated;
grant execute on function public.purge_stale_pending() to service_role;

-- Optional: run it hourly inside Supabase itself (pg_cron). If the
-- extension isn't available on your plan this block is skipped; the
-- app also runs the purge every time the sync job runs.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('purge-stale-pending')
    where exists (select 1 from cron.job where jobname = 'purge-stale-pending');
  perform cron.schedule('purge-stale-pending', '0 * * * *', 'select public.purge_stale_pending()');
exception when others then
  raise notice 'pg_cron not enabled, skipping schedule: %', sqlerrm;
end $$;

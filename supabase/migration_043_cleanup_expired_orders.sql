-- ============================================================================
-- Migration 043: Auto-Delete Expired Pending Orders After 30 Minutes
-- DigiVerse - Safe, Idempotent, Fast
-- ============================================================================

create or replace function public.delete_expired_pending_orders()
returns int
language plpgsql
security definer
as $$
declare
  v_order record;
  v_count int := 0;
begin
  for v_order in
    select id
    from public.orders
    where status = 'pending_payment'
      and created_at < (now() - interval '30 minutes')
  loop
    -- 1. Release any reserved referral gifts
    begin
      perform public.release_reserved_gifts(v_order.id);
    exception when others then
      null;
    end;

    -- 2. Delete referral gift redemptions tied to this order
    delete from public.referral_gift_redemptions
    where order_id = v_order.id;

    -- 3. Permanently delete the order row
    delete from public.orders
    where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Allow authenticated, anon and service_role to call the cleanup function
grant execute on function public.delete_expired_pending_orders() to authenticated, anon, service_role;

-- Execute once immediately to purge any currently existing pending orders older than 30 minutes
select public.delete_expired_pending_orders();

-- Try scheduling with pg_cron if extension exists on Supabase (runs every 5 minutes)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('cleanup-expired-orders');
    exception when others then
      null;
    end;
    perform cron.schedule('cleanup-expired-orders', '*/5 * * * *', 'select public.delete_expired_pending_orders()');
  end if;
exception when others then
  null;
end;
$$;

notify pgrst, 'reload schema';


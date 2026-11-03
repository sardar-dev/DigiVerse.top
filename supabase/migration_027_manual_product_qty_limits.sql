-- migration_027: min/max order quantity per manual product
-- Run this in Supabase SQL Editor before deploying the qty-limits feature.

alter table public.products
  add column if not exists min_order_qty integer default null,
  add column if not exists max_order_qty integer default null;

-- Constraints: if set, must be >= 1
alter table public.products
  add constraint if not exists products_min_order_qty_check
    check (min_order_qty is null or min_order_qty >= 1),
  add constraint if not exists products_max_order_qty_check
    check (max_order_qty is null or max_order_qty >= 1);

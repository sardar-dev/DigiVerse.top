-- migration_027: min/max order quantity per manual product
-- Run this in Supabase SQL Editor before deploying the qty-limits feature.

alter table public.products
  add column if not exists min_order_qty integer default null,
  add column if not exists max_order_qty integer default null;

-- Constraints: if set, must be >= 1
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_min_order_qty_check'
  ) then
    alter table public.products
      add constraint products_min_order_qty_check
        check (min_order_qty is null or min_order_qty >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_max_order_qty_check'
  ) then
    alter table public.products
      add constraint products_max_order_qty_check
        check (max_order_qty is null or max_order_qty >= 1);
  end if;
end $$;

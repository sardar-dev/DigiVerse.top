-- Migration 027: min/max order quantity limits for manual products
--
-- Adds two optional columns to products:
--   min_order_qty  — minimum quantity a customer must buy per order (default 1)
--   max_order_qty  — maximum quantity a customer can buy per order (null = unlimited)
--
-- Both are only enforced by the storefront for manual products.
-- DigiTrust/custom supplier products already have stock-based limits.

alter table public.products
  add column if not exists min_order_qty integer default 1,
  add column if not exists max_order_qty integer default null;

-- Sensible constraints
alter table public.products
  drop constraint if exists products_min_order_qty_check,
  drop constraint if exists products_max_order_qty_check;

alter table public.products
  add constraint products_min_order_qty_check
    check (min_order_qty is null or min_order_qty >= 1),
  add constraint products_max_order_qty_check
    check (max_order_qty is null or max_order_qty >= 1);

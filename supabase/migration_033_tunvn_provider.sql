-- 033: allow 'tunvn' as a valid provider value for the TunVN supplier.
-- Safe to re-run. (Only the products.provider check needs updating;
-- product_sources.supplier and orders.supplier are plain text.)

alter table public.products
  drop constraint if exists products_provider_check;

alter table public.products
  add constraint products_provider_check
  check (provider in ('digitrust', 'xpro', 'emstore', 'shotix', 'tunvn', 'manual', 'custom'));

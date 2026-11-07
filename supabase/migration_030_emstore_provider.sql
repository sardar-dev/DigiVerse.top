-- 030: allow 'emstore' as a valid provider value for EM Store supplier
-- Safe to re-run.

alter table public.products
  drop constraint if exists products_provider_check;

alter table public.products
  add constraint products_provider_check
  check (provider in ('digitrust', 'xpro', 'emstore', 'manual', 'custom'));

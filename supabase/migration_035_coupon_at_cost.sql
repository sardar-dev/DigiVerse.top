-- 035: allow 'cost_plus' discount type in coupons for Supplier Cost + Margin pricing.
-- Safe to re-run.

alter table public.coupons
  drop constraint if exists coupons_type_check;

alter table public.coupons
  add constraint coupons_type_check
  check (discount_type in ('percent', 'fixed', 'cost_plus'));


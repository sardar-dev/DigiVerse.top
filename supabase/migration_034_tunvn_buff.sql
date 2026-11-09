-- 034: flag for manual products that are fulfilled through TunVN's
-- Buff Token (Muse AI invite-code) API. Safe to re-run.

alter table public.products
  add column if not exists tunvn_buff boolean not null default false;

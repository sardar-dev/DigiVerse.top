-- 020: track supplier stock movement so Statistics can show which supplier
-- products sell fastest. Safe to re-run.
alter table public.product_sources
  add column if not exists stock_drops integer not null default 0,   -- total units the supplier stock went DOWN between syncs
  add column if not exists stock_ups integer not null default 0,     -- total units it went UP (restocks)
  add column if not exists drops_since timestamptz not null default now(); -- when tracking started / was last reset

-- Multi-supplier support (DigiTrust + XPro Seller, and room for more).
--
-- One storefront product can now be sourced from several suppliers.
-- The sync picks the cheapest in-stock source whose cost is <= your
-- sell price (or one you approved by hand) and mirrors it into the
-- existing products columns, so the storefront query is unchanged.
-- Safe to run more than once. Deletes nothing.

-- 1) products: which supplier is active + why a product is hidden
alter table public.products
  add column if not exists active_supplier text,
  add column if not exists supplier_status text not null default 'ok';

alter table public.products drop constraint if exists products_provider_check;
alter table public.products
  add constraint products_provider_check check (provider in ('digitrust', 'xpro', 'manual'));

alter table public.products drop constraint if exists products_supplier_status_check;
alter table public.products
  add constraint products_supplier_status_check
  check (supplier_status in ('ok', 'out_of_stock', 'price_too_high'));

update public.products
   set active_supplier = 'digitrust'
 where provider = 'digitrust' and active_supplier is null;

-- 2) product_sources: one row per (supplier product) linked to a store product
create table if not exists public.product_sources (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  supplier text not null,                 -- 'digitrust' | 'xpro' | ...
  supplier_product_id text not null,      -- the id on the supplier's side
  supplier_title text,
  cost numeric not null default 0,        -- what the supplier charges us
  stock integer not null default 0,       -- raw supplier stock
  available_stock integer not null default 0, -- after our safety buffer
  approved boolean not null default false,    -- admin allows it even if cost > sell price
  updated_at timestamptz not null default now(),
  unique (supplier, supplier_product_id),
  unique (product_id, supplier)
);

create index if not exists product_sources_product_idx on public.product_sources (product_id);

-- Server-only: RLS on, no policies (service role only).
alter table public.product_sources enable row level security;

-- 3) Backfill: every existing DigiTrust product gets its source row
insert into public.product_sources
  (product_id, supplier, supplier_product_id, supplier_title, cost, stock, available_stock)
select id, 'digitrust', id::text, title, cost_price, real_stock, available_stock
  from public.products
 where provider = 'digitrust'
on conflict do nothing;

-- 4) orders: remember which supplier fulfilled the order
alter table public.orders
  add column if not exists supplier text,
  add column if not exists supplier_order_id text;

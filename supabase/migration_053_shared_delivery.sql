-- Auto-delivery, second mode: "shared". Instead of a unique box per order,
-- every buyer of the product receives the same stored text (a link,
-- instructions, a download page, a shared code ...). Stock is unlimited.
--
-- products.delivery_mode is not secret, so it can live on the products table.
-- The shared text itself goes in its OWN server-only table: the products
-- table is publicly readable (RLS), so a text column there would leak.

alter table public.products
  add column if not exists delivery_mode text not null default 'unique';

alter table public.products
  drop constraint if exists products_delivery_mode_check;
alter table public.products
  add constraint products_delivery_mode_check check (delivery_mode in ('unique', 'shared'));

create table if not exists public.product_shared_delivery (
  product_id bigint primary key references public.products(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now()
);

-- Server-only (service role): RLS on, NO policies.
alter table public.product_shared_delivery enable row level security;

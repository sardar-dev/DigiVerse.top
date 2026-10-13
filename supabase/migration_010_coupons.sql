-- Coupon / discount codes. Admin creates them; customers apply one
-- at checkout. Usage is derived from orders (no counters to drift).

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,                       -- stored UPPERCASE
  discount_type text not null,              -- 'percent' | 'fixed'
  discount_value numeric not null,
  product_id bigint references public.products(id) on delete cascade, -- null = all products
  max_uses integer,                         -- null = unlimited
  per_user_limit integer,                   -- null = unlimited
  min_order numeric,                        -- null = no minimum
  expires_at timestamptz,                   -- null = never
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coupons_type_check check (discount_type in ('percent', 'fixed')),
  constraint coupons_value_check check (
    discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100)
  ),
  constraint coupons_max_uses_check check (max_uses is null or max_uses > 0),
  constraint coupons_per_user_check check (per_user_limit is null or per_user_limit > 0),
  constraint coupons_min_order_check check (min_order is null or min_order >= 0)
);

create unique index if not exists coupons_code_idx on public.coupons (code);

-- Server-only table: RLS on, no policies (service role bypasses RLS).
alter table public.coupons enable row level security;

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric not null default 0;

create index if not exists orders_coupon_id_idx on public.orders (coupon_id);

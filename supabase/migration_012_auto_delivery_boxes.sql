-- Auto-delivery for manual products: the admin stores "boxes" of text
-- (e.g. account credentials); each paying customer is handed their own
-- unique box(es) the moment payment is confirmed.

alter table public.products
  add column if not exists auto_delivery boolean not null default false;

create table if not exists public.product_stock_items (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,       -- stable Box 1, Box 2 ... order
  product_id bigint not null references public.products(id) on delete cascade,
  content text not null,
  status text not null default 'available',   -- available | sold
  order_id uuid references public.orders(id) on delete set null,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_stock_items_status_check check (status in ('available', 'sold'))
);

create index if not exists product_stock_items_product_status_idx
  on public.product_stock_items (product_id, status, seq);
create index if not exists product_stock_items_order_idx
  on public.product_stock_items (order_id);

-- Server-only table (contains credentials): RLS on, NO policies, so
-- only the service role can ever read it.
alter table public.product_stock_items enable row level security;

-- Keeps products.available_stock equal to the number of unsold boxes.
create or replace function public.sync_auto_stock(p_product_id bigint)
returns integer
language plpgsql
security definer
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stock:' || p_product_id::text, 0));
  select count(*) into v_count
    from public.product_stock_items
    where product_id = p_product_id and status = 'available';
  update public.products
    set available_stock = v_count, real_stock = v_count, updated_at = now()
    where id = p_product_id and auto_delivery = true;
  return v_count;
end;
$$;

-- Hands out p_quantity unsold boxes to an order, all-or-nothing.
-- Returns the contents, or NULL if there aren't enough boxes.
-- A per-product advisory lock makes concurrent buyers take turns, so
-- two customers can never receive the same box. Calling it again for
-- the same order returns the same boxes (safe to retry).
create or replace function public.claim_stock_items(
  p_product_id bigint, p_order_id uuid, p_quantity integer
)
returns text[]
language plpgsql
security definer
as $$
declare
  v_ids uuid[];
  v_contents text[];
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be a positive integer';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock:' || p_product_id::text, 0));

  select array_agg(content order by seq) into v_contents
    from public.product_stock_items where order_id = p_order_id;
  if v_contents is not null then
    return v_contents;
  end if;

  select array_agg(id) into v_ids from (
    select id from public.product_stock_items
    where product_id = p_product_id and status = 'available'
    order by seq
    limit p_quantity
  ) s;

  if v_ids is null or array_length(v_ids, 1) < p_quantity then
    return null;
  end if;

  update public.product_stock_items
    set status = 'sold', order_id = p_order_id, sold_at = now()
    where id = any(v_ids);

  update public.products
    set available_stock = (
          select count(*) from public.product_stock_items
          where product_id = p_product_id and status = 'available'),
        real_stock = (
          select count(*) from public.product_stock_items
          where product_id = p_product_id and status = 'available'),
        updated_at = now()
    where id = p_product_id;

  select array_agg(content order by seq) into v_contents
    from public.product_stock_items where order_id = p_order_id;
  return v_contents;
end;
$$;

revoke all on function public.sync_auto_stock(bigint) from public, anon, authenticated;
revoke all on function public.claim_stock_items(bigint, uuid, integer) from public, anon, authenticated;
grant execute on function public.sync_auto_stock(bigint) to service_role;
grant execute on function public.claim_stock_items(bigint, uuid, integer) to service_role;

-- Remember what each order's product cost us AT THE TIME OF SALE, so
-- profit stats no longer change when a supplier's price changes later.
-- Safe to run more than once. Deletes nothing.

alter table public.orders
  add column if not exists unit_cost numeric;

-- Old orders: the best we have is the product's current cost. Fill it in
-- once now so it is frozen from today on (new orders record the real one).
update public.orders o
   set unit_cost = p.cost_price
  from public.products p
 where o.product_id = p.id
   and o.unit_cost is null;

-- 016: multi-product coupons + public "recent orders" feed.
-- Safe to re-run.

-- ── 1. Coupons can apply to several selected products ──────────
-- product_ids: null or empty = all products (old single product_id
-- coupons keep working untouched).
alter table public.coupons
  add column if not exists product_ids bigint[];

-- ── 2. Recent orders feed (kept to the newest 15 rows only) ────
create table if not exists public.recent_orders (
  id bigserial primary key,
  product_title text not null,
  quantity integer not null default 1,
  email_masked text not null,          -- e.g. Sa****6g@gmail.com (never the full email)
  created_at timestamptz not null default now()
);
alter table public.recent_orders enable row level security; -- server-only, no policies

-- Masks an email: first 2 + last 2 chars of the part before @.
create or replace function public.mask_email(e text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when e is null or position('@' in e) = 0 then 'Customer'
    else
      case
        when length(split_part(e, '@', 1)) <= 4
          then left(split_part(e, '@', 1), 1) || '***'
        else left(split_part(e, '@', 1), 2)
             || repeat('*', greatest(length(split_part(e, '@', 1)) - 4, 3))
             || right(split_part(e, '@', 1), 2)
      end || '@' || split_part(e, '@', 2)
  end
$$;

-- When an order becomes 'delivered', add it to the feed and trim the
-- feed to the newest 15 rows. Runs inside the same transaction, so no
-- app code path can forget it and there are no extra requests.
create or replace function public.log_recent_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_email text;
begin
  if new.status = 'delivered' and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then
    select title into v_title from public.products where id = new.product_id;
    select email into v_email from auth.users where id = new.user_id;
    insert into public.recent_orders (product_title, quantity, email_masked)
    values (coalesce(v_title, 'a product'), coalesce(new.quantity, 1), public.mask_email(v_email));
    delete from public.recent_orders
     where id not in (select id from public.recent_orders order by id desc limit 15);
  end if;
  return new;
end;
$$;

revoke all on function public.log_recent_order() from public, anon, authenticated;

drop trigger if exists orders_recent_feed on public.orders;
create trigger orders_recent_feed
  after insert or update of status on public.orders
  for each row execute function public.log_recent_order();

-- Fill the feed once with the last 15 delivered orders.
insert into public.recent_orders (product_title, quantity, email_masked, created_at)
select coalesce(p.title, 'a product'), o.quantity, public.mask_email(u.email), o.updated_at
  from (
    select * from public.orders where status = 'delivered'
    order by updated_at desc limit 15
  ) o
  left join public.products p on p.id = o.product_id
  left join auth.users u on u.id = o.user_id
 where not exists (select 1 from public.recent_orders)
 order by o.updated_at asc;

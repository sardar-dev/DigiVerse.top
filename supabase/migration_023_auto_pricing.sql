-- 023: automatic pricing (keep your profit margin when supplier prices move).
-- auto_price = true means the store price follows the supplier cost using the
-- rule saved in Admin -> Pricing. Editing a price by hand turns it off for
-- that product. Safe to re-run.
alter table public.products
  add column if not exists auto_price boolean not null default true;

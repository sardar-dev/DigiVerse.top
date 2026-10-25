-- 024: auto-pricing is OPT-IN per product. Nothing follows the rule unless
-- you tick "Auto" on that product. One-time reset of the old default (true)
-- so existing products are not repriced. Safe to re-run (it runs once).
alter table public.products alter column auto_price set default false;

do $$
begin
  if not exists (select 1 from public.app_meta where key = 'auto_price_opt_in_v1') then
    update public.products set auto_price = false where auto_price is distinct from false;
    insert into public.app_meta (key, value) values ('auto_price_opt_in_v1', now()::text);
  end if;
end $$;

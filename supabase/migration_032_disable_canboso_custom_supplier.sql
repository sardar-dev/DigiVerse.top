-- 032: Canboso and Shotix are the same store.
-- Disable the custom_suppliers row for Canboso and re-point its
-- product_sources rows to the built-in 'shotix' supplier id.
-- Safe to re-run.

-- 1. Disable the Canboso custom supplier entry
UPDATE public.custom_suppliers
SET enabled = false
WHERE id ILIKE '%canboso%'
   OR label ILIKE '%canboso%';

-- 2. Re-point any product_sources that reference the old Canboso custom id
--    to the built-in 'shotix' id so orders and sync keep working.
UPDATE public.product_sources
SET supplier = 'shotix'
WHERE supplier ILIKE '%canboso%';

-- 3. Re-point any products whose provider is a Canboso custom id
UPDATE public.products
SET provider = 'shotix'
WHERE provider ILIKE '%canboso%';

-- 4. Re-point any orders that referenced Canboso
UPDATE public.orders
SET supplier = 'shotix'
WHERE supplier ILIKE '%canboso%';

-- 025: per-product margin for auto-pricing. If set (and Auto is ticked),
-- sell = supplier cost + this margin, rounded up to 0.05. Empty = global rule.
alter table public.products add column if not exists auto_margin numeric;

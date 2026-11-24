-- Migration 052: Create Demo / Test Product (ID: -99)
-- Allows visitors to experience the full ordering and instant delivery flow at zero cost.
-- Can be toggled on/off anytime from the Admin Panel via `selected` flag.
-- Safe to re-run multiple times (100% Idempotent).

insert into public.products (
  id,
  title,
  description,
  short_description,
  cost_price,
  sell_price,
  real_stock,
  available_stock,
  requires_email,
  delivery,
  delivery_badge,
  warranty,
  selected,
  provider,
  category,
  featured,
  auto_delivery,
  min_order_qty,
  max_order_qty,
  slug,
  updated_at
) values (
  -99,
  '🧪 DigiVerse Demo Order – For Test',
  'Experience our automated ordering and instant delivery process at zero cost. This is a verified demo product designed for testing how orders, crypto verification, and instant deliveries work on DigiVerse.',
  'Free interactive demo to experience our 0-second instant automated delivery.',
  0.00,
  0.00,
  999999,
  999999,
  false,
  'Instant 0-Second Delivery',
  '⚡ 0-Cost Test Order',
  'Instant Demo Experience',
  true,
  'manual',
  'Demo / Testing 🧪',
  true,
  true,
  1,
  5,
  'demo-order-test',
  now()
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  short_description = excluded.short_description,
  sell_price = 0.00,
  cost_price = 0.00,
  real_stock = 999999,
  available_stock = 999999,
  delivery_badge = excluded.delivery_badge,
  provider = 'manual',
  category = excluded.category,
  auto_delivery = true,
  slug = excluded.slug,
  updated_at = now();

-- Canboso Reseller API — custom supplier seed
-- Run this in the Supabase SQL editor.
-- After inserting, go to Admin → API Connections → Test to verify.
--
-- API docs: https://canboso.com/api/swagger
-- Auth: query param "key" (not Bearer header)
-- Products:  GET  /api/v2/telegram-buyer/products?key=API_KEY
-- Balance:   GET  /api/v2/telegram-buyer/balance?key=API_KEY
-- Purchase:  POST /api/v2/telegram-buyer/purchase  (Idempotency-Key header required)

insert into public.custom_suppliers (
  id,
  label,
  base_url,
  auth_type,
  auth_header,
  auth_prefix,
  api_key,
  extra_headers,
  config,
  docs,
  enabled
) values (
  'c_canboso',
  'Canboso',
  'https://canboso.com',
  'query',          -- API key goes in ?key= query param, NOT Authorization header
  'key',            -- query param name
  '',               -- no prefix
  'tgb_106435331588fe782a5dd6c6cc4a30c385e4b59321d07dd5',
  '{}',
  jsonb_build_object(
    'list', jsonb_build_object(
      'path',       '/api/v2/telegram-buyer/products',
      'items_path', 'products',
      'map', jsonb_build_object(
        'id',    'productId',
        'title', 'name',
        'price', 'price.amount',   -- nested: { "price": { "amount": 50000 } }
        'stock', 'availability.available'
      )
    ),
    'balance', jsonb_build_object(
      'path',       '/api/v2/telegram-buyer/balance',
      'value_path', 'balance'      -- top-level "balance" field
    ),
    'purchase', jsonb_build_object(
      'method',          'POST',
      'path',            '/api/v2/telegram-buyer/purchase',
      -- key must be in the body too (API requirement)
      'body',            jsonb_build_object(
                           'key',        '{{api_key}}',
                           'product_id', '{{product_id}}',
                           'quantity',   '{{quantity|number}}'
                         ),
      'idempotency_key', true,                -- auto-sends Idempotency-Key header
      'items_path',      'delivery.accounts', -- array of {user, password, verifyEmail}
      'items_format',    '{{user}}:{{password}}',  -- format each account as "email:pass"
      'order_id_path',   'order.orderCode',
      'success_path',    'success',
      'success_value',   'true'
    )
  ),
  E'Canboso Buyer API v2.2.0\n\nAuth: query param key=API_KEY\n\nGET /api/v2/telegram-buyer/products\n  Response: { success, products: [{ productId, name, price.amount, availability.available }] }\n\nGET /api/v2/telegram-buyer/balance\n  Response: { success, balance, balanceText, walletCurrency }\n\nPOST /api/v2/telegram-buyer/purchase\n  Headers: Idempotency-Key (required, unique per request)\n  Body: { key, product_id, quantity }\n  Response: { success, order: { orderCode, status }, delivery: { accounts: [{ user, password }] } }',
  true
)
on conflict (id) do update set
  label         = excluded.label,
  base_url      = excluded.base_url,
  auth_type     = excluded.auth_type,
  auth_header   = excluded.auth_header,
  api_key       = excluded.api_key,
  config        = excluded.config,
  docs          = excluded.docs,
  enabled       = excluded.enabled,
  updated_at    = now();

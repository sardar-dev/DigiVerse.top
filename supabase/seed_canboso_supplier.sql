-- Canboso Reseller API — custom supplier seed
-- Run this in the Supabase SQL editor (or paste in Table Editor → custom_suppliers).
-- After inserting, go to Admin → API Connections → Test to verify field mappings.

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
  'bearer',
  '',
  '',
  'tgb_106435331588fe782a5dd6c6cc4a30c385e4b59321d07dd5',  -- ← API key
  '{}',
  '{
    "list": {
      "path": "/api/v2/telegram-buyer/products",
      "items_path": "",
      "map": {
        "id":    "id",
        "title": "name",
        "price": "price",
        "stock": "stock"
      }
    },
    "balance": {
      "path":       "/api/v2/telegram-buyer/products",
      "value_path": "balance"
    },
    "purchase": {
      "method":        "POST",
      "path":          "/api/v2/telegram-buyer/purchase",
      "body":          { "product_id": "{{product_id|number}}", "quantity": "{{quantity|number}}" },
      "items_path":    "items",
      "order_id_path": "order_id"
    }
  }'::jsonb,
  'GET /api/v2/telegram-buyer/products — List available products.
POST /api/v2/telegram-buyer/purchase — Purchase products using wallet balance.
Auth: Bearer tgb_106435331588fe782a5dd6c6cc4a30c385e4b59321d07dd5',
  true
)
on conflict (id) do update set
  label      = excluded.label,
  base_url   = excluded.base_url,
  auth_type  = excluded.auth_type,
  api_key    = excluded.api_key,
  config     = excluded.config,
  docs       = excluded.docs,
  enabled    = excluded.enabled,
  updated_at = now();

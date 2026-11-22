-- Migration 049: Add slug column to public.products and populate clean SEO slugs
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug text;

WITH gen AS (
  SELECT id, title,
    CASE 
      WHEN id = -12 THEN 'buy-muse-ai-tokens'
      WHEN title ILIKE '%𝕏%6%month%' THEN 'x-premium-6-months'
      WHEN title ILIKE '%𝕏%3%month%' THEN 'x-premium-3-months'
      ELSE lower(trim(both '-' from regexp_replace(regexp_replace(regexp_replace(replace(replace(title, '𝕏', 'x'), 'X', 'x'), '[\x80-\xFF\u2000-\u3300\uD800-\uDFFF]', '', 'g'), '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g')))
    END AS base_slug
  FROM public.products
),
numbered AS (
  SELECT id,
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) = 1 
      THEN base_slug 
      ELSE base_slug || '-' || ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) 
    END AS final_slug
  FROM gen
)
UPDATE public.products p
SET slug = n.final_slug
FROM numbered n
WHERE p.id = n.id AND (p.slug IS NULL OR p.slug = '');

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON public.products(slug);


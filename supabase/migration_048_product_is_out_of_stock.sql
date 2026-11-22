-- Migration 048: Add is_out_of_stock column to products table
-- Allows store admins to mark products as Out of Stock while keeping them visible on the storefront.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_out_of_stock boolean DEFAULT false;

COMMENT ON COLUMN public.products.is_out_of_stock IS 'When true, product is displayed as Sold Out on the storefront and purchases are blocked, even if supplier or manual stock > 0.';


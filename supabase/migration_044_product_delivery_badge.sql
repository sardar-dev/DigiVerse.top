-- ============================================================================
-- Migration 044: Add delivery_badge to products table
-- DigiVerse - Safe, Idempotent, Fast
-- ============================================================================

alter table if exists public.products
  add column if not exists delivery_badge text default null;

notify pgrst, 'reload schema';


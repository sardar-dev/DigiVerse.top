-- migration_028: free-text activation_field label + activation_placeholder
-- activation_field is now a free-text label (e.g. "Game ID") instead of
-- an enum. The old values 'email' and 'username' still work as-is.
-- activation_placeholder is the hint shown inside the input box.
-- Run in Supabase SQL Editor.

alter table public.products
  add column if not exists activation_placeholder text default null;

-- Drop the old enum constraint if it exists (safe to ignore if absent)
alter table public.products
  drop constraint if exists products_activation_field_check;

-- 1) Product warranty text synced from DigiTrust
alter table public.products
  add column if not exists warranty text;

-- 2) Customer feedback from the site footer
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  message text not null,
  ip_hash text,                              -- hashed, only used for spam limiting
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Server-only table: RLS on, no policies (service role bypasses RLS).
alter table public.feedback enable row level security;

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

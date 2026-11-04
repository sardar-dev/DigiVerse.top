-- migration_029: admin-initiated direct messages to users
-- Admin sends a message to a specific user (or broadcast to all).
-- User sees a notification banner on the homepage.
-- User can reply once; reply is visible in admin panel.

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  -- null = broadcast to all users; set = direct to one user
  user_id uuid references auth.users(id) on delete cascade,
  subject text not null,
  body text not null,
  -- reply from the user (single reply per message)
  reply_body text,
  reply_at timestamptz,
  -- has the user dismissed/read the banner?
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_messages_subject_check check (char_length(subject) between 1 and 120),
  constraint admin_messages_body_check check (char_length(body) between 1 and 2000),
  constraint admin_messages_reply_check check (reply_body is null or char_length(reply_body) between 1 and 2000)
);

create index if not exists admin_messages_user_idx on public.admin_messages (user_id, created_at desc);
create index if not exists admin_messages_broadcast_idx on public.admin_messages (created_at desc) where user_id is null;

-- RLS on; service role (supabaseAdmin) bypasses it.
alter table public.admin_messages enable row level security;

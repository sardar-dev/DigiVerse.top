-- 019: support tickets (customer <-> admin conversation).
-- Safe to re-run.

create sequence if not exists public.support_ticket_seq start with 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null default nextval('public.support_ticket_seq'),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  order_number bigint,                       -- optional: the order the question is about
  status text not null default 'open',       -- open | answered | closed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_status_check check (status in ('open', 'answered', 'closed'))
);
create unique index if not exists support_tickets_number_idx on public.support_tickets (ticket_number);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table if not exists public.support_messages (
  id bigserial primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null,                      -- user | admin
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_messages_sender_check check (sender in ('user', 'admin')),
  constraint support_messages_body_check check (char_length(body) between 1 and 2000)
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, id);

-- Server-only tables: RLS on, no policies (service role bypasses RLS).
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Housekeeping: closed tickets older than 60 days are deleted (their
-- messages go with them) so support never fills the free-tier database.
create or replace function public.purge_stale_pending()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_orders integer;
  n_invoices integer;
  n_tickets integer;
begin
  delete from public.orders
   where status = 'pending_payment'
     and tx_hash is null
     and created_at < now() - interval '3 hours';
  get diagnostics n_orders = row_count;

  delete from public.wallet_deposit_invoices
   where status = 'expired'
      or (status = 'pending' and created_at < now() - interval '3 hours');
  get diagnostics n_invoices = row_count;

  delete from public.hash_failures where updated_at < now() - interval '1 day';

  delete from public.support_tickets
   where status = 'closed' and updated_at < now() - interval '60 days';
  get diagnostics n_tickets = row_count;

  return jsonb_build_object('orders', n_orders, 'invoices', n_invoices, 'tickets', n_tickets);
end;
$$;

revoke all on function public.purge_stale_pending() from public, anon, authenticated;
grant execute on function public.purge_stale_pending() to service_role;

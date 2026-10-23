-- 021: (1) admin-added API connections, (2) user withdrawal requests,
-- (3) cheap SQL summaries for the admin dashboard / statistics.
-- Safe to re-run.

-- ── 1. API connections added from the admin panel ─────────────────
create table if not exists public.custom_suppliers (
  id text primary key,                       -- "c_<slug>"
  label text not null,
  base_url text not null,
  auth_type text not null default 'bearer',  -- bearer | header | query | basic | none
  auth_header text,                          -- header / query-param name
  auth_prefix text,                          -- e.g. "Token " for a header value
  api_key text,                              -- secret: server-only, never sent to the browser
  extra_headers jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb, -- endpoints + field mapping
  docs text,                                 -- pasted documentation / quick start (kept for later edits)
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.custom_suppliers enable row level security; -- no policies: service role only

-- ── 2. Withdrawal requests ────────────────────────────────────────
create sequence if not exists public.withdrawal_seq start with 1001;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint not null default nextval('public.withdrawal_seq'),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  address text not null,
  network text not null default 'USDT BEP20',
  status text not null default 'pending',    -- pending | approved | rejected
  admin_note text,
  payout_tx text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint withdrawal_status_check check (status in ('pending', 'approved', 'rejected'))
);
create unique index if not exists withdrawal_number_idx on public.withdrawal_requests (request_number);
create index if not exists withdrawal_status_idx on public.withdrawal_requests (status, created_at desc);
create index if not exists withdrawal_user_idx on public.withdrawal_requests (user_id, created_at desc);
alter table public.withdrawal_requests enable row level security; -- service role only

-- The amount is taken out of the balance the moment the request is made
-- (so it can't be spent twice) and given back if you reject it.
create or replace function public.request_withdrawal(
  p_user uuid, p_amount numeric, p_address text, p_min numeric, p_max_pending integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal numeric;
  v_pending integer;
  v_id uuid;
  v_num bigint;
begin
  select balance into v_bal from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;

  select count(*) into v_pending from public.withdrawal_requests
   where user_id = p_user and status = 'pending';
  if v_pending >= p_max_pending then return jsonb_build_object('ok', false, 'error', 'too_many_pending'); end if;
  if p_amount < p_min then return jsonb_build_object('ok', false, 'error', 'below_minimum'); end if;
  if v_bal < p_amount then return jsonb_build_object('ok', false, 'error', 'insufficient_balance'); end if;

  update public.profiles set balance = balance - p_amount where id = p_user;
  insert into public.withdrawal_requests (user_id, amount, address)
    values (p_user, p_amount, p_address)
    returning id, request_number into v_id, v_num;
  insert into public.wallet_adjustments (user_id, amount, reason, created_by)
    values (p_user, -p_amount, 'Withdrawal request #' || v_num, p_user);

  return jsonb_build_object('ok', true, 'id', v_id, 'request_number', v_num, 'balance', v_bal - p_amount);
end;
$$;

create or replace function public.resolve_withdrawal(
  p_id uuid, p_status text, p_note text, p_tx text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.withdrawal_requests%rowtype;
begin
  if p_status not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  select * into r from public.withdrawal_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already_resolved'); end if;

  update public.withdrawal_requests
     set status = p_status, admin_note = nullif(p_note, ''), payout_tx = nullif(p_tx, ''), resolved_at = now()
   where id = p_id;

  if p_status = 'rejected' then
    update public.profiles set balance = balance + r.amount where id = r.user_id;
    insert into public.wallet_adjustments (user_id, amount, reason)
      values (r.user_id, r.amount, 'Withdrawal #' || r.request_number || ' rejected, refunded');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_withdrawal(uuid, numeric, text, numeric, integer) from public, anon, authenticated;
revoke all on function public.resolve_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.request_withdrawal(uuid, numeric, text, numeric, integer) to service_role;
grant execute on function public.resolve_withdrawal(uuid, text, text, text) to service_role;

-- ── 3. Cheap summaries: the database adds things up instead of the
-- app downloading every order row on each admin page load. ───────────
create or replace function public.admin_dashboard_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'delivered', count(*) filter (where o.status = 'delivered'),
    'sales', coalesce(sum(o.total) filter (where o.status = 'delivered'), 0),
    'cost', coalesce(sum(coalesce(o.unit_cost, p.cost_price, 0) * o.quantity) filter (where o.status = 'delivered'), 0),
    'open_tickets', (select count(*) from public.support_tickets where status = 'open'),
    'pending_withdrawals', (select count(*) from public.withdrawal_requests where status = 'pending')
  )
  from public.orders o left join public.products p on p.id = o.product_id;
$$;

create or replace function public.admin_order_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with x as (
    select o.status, o.total, o.quantity, coalesce(o.paid_with, 'onchain') as paid_with, o.created_at, o.user_id, o.product_id,
           coalesce(o.unit_cost, p.cost_price, 0) * o.quantity as cost, p.title
      from public.orders o left join public.products p on p.id = o.product_id
  )
  select jsonb_build_object(
    'total', (select count(*) from x),
    'last7', (select count(*) from x where created_at >= now() - interval '7 days'),
    'last30', (select count(*) from x where created_at >= now() - interval '30 days'),
    'delivered', (select count(*) from x where status = 'delivered'),
    'buyers', (select count(distinct user_id) from x where status = 'delivered'),
    'by_status', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from x group by 1) s), '{}'::jsonb),
    'by_method', coalesce((select jsonb_object_agg(paid_with, c) from (select paid_with, count(*) c from x where status = 'delivered' group by 1) s), '{}'::jsonb),
    'sales', (select coalesce(sum(total), 0) from x where status = 'delivered'),
    'profit', (select coalesce(sum(total - cost), 0) from x where status = 'delivered'),
    'sales7', (select coalesce(sum(total), 0) from x where status = 'delivered' and created_at >= now() - interval '7 days'),
    'profit7', (select coalesce(sum(total - cost), 0) from x where status = 'delivered' and created_at >= now() - interval '7 days'),
    'sales30', (select coalesce(sum(total), 0) from x where status = 'delivered' and created_at >= now() - interval '30 days'),
    'profit30', (select coalesce(sum(total - cost), 0) from x where status = 'delivered' and created_at >= now() - interval '30 days'),
    'daily', coalesce((
      select jsonb_agg(d order by d.date) from (
        select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as date, count(*) as orders,
               coalesce(sum(total) filter (where status = 'delivered'), 0) as revenue
          from x where created_at >= now() - interval '14 days' group by 1
      ) d), '[]'::jsonb),
    'topups', (select count(*) from public.wallet_topups where status = 'credited'),
    'topup_total', (select coalesce(sum(amount), 0) from public.wallet_topups where status = 'credited'),
    'held', (select coalesce(sum(balance), 0) from public.profiles where balance > 0),
    'top', coalesce((
      select jsonb_agg(t) from (
        select product_id, coalesce(max(title), '#' || product_id) as title, sum(quantity) as units,
               sum(total) as revenue, sum(total - cost) as profit
          from x where status = 'delivered' group by product_id order by sum(quantity) desc limit 8
      ) t), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
revoke all on function public.admin_order_stats() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to service_role;
grant execute on function public.admin_order_stats() to service_role;

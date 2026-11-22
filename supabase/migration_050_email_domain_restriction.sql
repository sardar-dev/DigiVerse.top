-- Migration 050: Email domain restriction setting for user registrations
-- Safe to re-run multiple times (idempotent)

insert into public.app_meta (key, value, updated_at)
values ('restrict_email_domains', 'true', now())
on conflict (key) do nothing;

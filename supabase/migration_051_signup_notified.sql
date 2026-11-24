-- Migration 051: Add signup_notified flag to public.profiles
-- Ensures that every new user signup triggers a Telegram notification reliably,
-- resolving race conditions where the handle_new_user() trigger creates the profile
-- milliseconds before the backend API verifies isNewUser.
-- Safe to re-run multiple times (100% Idempotent).

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'signup_notified'
  ) then
    alter table public.profiles add column signup_notified boolean default false;
  end if;
end $$;

-- Mark pre-existing registered users as notified so past accounts do not fire alerts on login
update public.profiles
set signup_notified = true
where signup_notified is null;


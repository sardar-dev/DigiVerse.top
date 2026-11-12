-- ============================================================================
-- Migration 046: Telegram Admin Notifications Configuration
-- DigiVerse - Safe, Idempotent
-- ============================================================================

insert into public.app_meta (key, value, updated_at)
values 
  ('telegram_bot_token', '8959158776:AAGUUjnLeg_hE29j9pNMZ--VQoDnR-_Mnac', now()),
  ('telegram_chat_id', '1162040243', now()),
  ('telegram_notifications_enabled', 'true', now())
on conflict (key) do update 
set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';


-- Editable product titles + cleanup of supplier emoji tags like {pe:123...}.
-- Safe to run more than once. Deletes nothing.

-- 1) A hand-edited title is "locked" so syncs never overwrite it.
alter table public.products
  add column if not exists title_locked boolean not null default false;

-- 2) Strip {pe:<digits>} tags from text that is already stored.
update public.products
   set title = btrim(regexp_replace(regexp_replace(title, '\{[a-zA-Z]{1,6}:[0-9]{5,}\}', '', 'g'), '\s+', ' ', 'g'))
 where title ~ '\{[a-zA-Z]{1,6}:[0-9]{5,}\}';

update public.products
   set description = regexp_replace(regexp_replace(description, '\{[a-zA-Z]{1,6}:[0-9]{5,}\}', '', 'g'), '[ \t]{2,}', ' ', 'g')
 where description ~ '\{[a-zA-Z]{1,6}:[0-9]{5,}\}';

update public.products
   set short_description = regexp_replace(regexp_replace(short_description, '\{[a-zA-Z]{1,6}:[0-9]{5,}\}', '', 'g'), '[ \t]{2,}', ' ', 'g')
 where short_description ~ '\{[a-zA-Z]{1,6}:[0-9]{5,}\}';

update public.product_sources
   set supplier_title = btrim(regexp_replace(regexp_replace(supplier_title, '\{[a-zA-Z]{1,6}:[0-9]{5,}\}', '', 'g'), '\s+', ' ', 'g'))
 where supplier_title ~ '\{[a-zA-Z]{1,6}:[0-9]{5,}\}';

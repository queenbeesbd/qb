-- The support rail's second channel becomes Messenger (2026-11-19).
--
-- The Facebook button opened a page to read. The owner replaced it with Messenger, which opens a chat
-- with the shop, and the stored address moves with it: the setting key is `support.messenger_url`.
--
-- **A Facebook page URL is not carried over**, and that is deliberate. `https://www.facebook.com/<page>`
-- opens a page; the Messenger link that opens a conversation is `https://m.me/<page>`. Copying the old
-- value would put a Messenger-blue disc on a link that lands somewhere else - a button that lies about
-- where it goes, which is worse than the button the shop had. Only a value that is *already* a Messenger
-- address survives the rename; the owner pastes their `m.me` link once at Settings -> Support links,
-- and the admin field says exactly that. The WhatsApp link is untouched.
--
-- A deploy does not run the seed and nothing else can reach an existing environment's rows, which is why
-- this is a migration rather than a change to a default.

INSERT INTO "store_setting" ("key", "value", "value_type", "updated_at", "updated_by_staff_id")
SELECT
  'support.messenger_url',
  s."value",
  s."value_type",
  now(),
  s."updated_by_staff_id"
FROM "store_setting" s
WHERE s."key" = 'support.facebook_url'
  AND s."value_type" = 'text'
  AND (s."value" #>> '{}') ~ '^https://(m\.me|(www\.)?messenger\.com)/'
  AND NOT EXISTS (SELECT 1 FROM "store_setting" WHERE "key" = 'support.messenger_url');--> statement-breakpoint

-- The old key is removed rather than left behind: it names a channel the shop no longer offers, and a
-- row nothing reads is a claim that it still means something.
DELETE FROM "store_setting" WHERE "key" = 'support.facebook_url';

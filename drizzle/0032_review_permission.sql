-- Review moderation reached the code but not every environment (2026-11-12).
--
-- The permission catalogue is **seeded**, not migrated, and a deploy does not run the seed - so a
-- permission added after an environment was first seeded exists in `src/server/authz/permissions.ts`
-- and nowhere else. That is exactly what happened here: `review.moderate` shipped with the review
-- feature, the owner role in production never received it, and `/qbpanel/reviews` and its sidebar
-- entry stayed hidden while a customer's review sat in the queue waiting.
--
-- The fix belongs in a migration because a migration is the only thing a deploy is guaranteed to run
-- against an existing database. It inserts the missing catalogue row and grants it to **every
-- owner-level role**, which is the documented policy rather than a one-off grant: administration is
-- owner-only, every owner account has full access, and there is no per-permission management surface
-- to contradict it (D10, ADR 0009).
--
-- Both statements are idempotent, so applying this to an environment that was already seeded with the
-- permission is a no-op. Adding a permission to the catalogue in future needs its own migration for
-- the same reason - do not rely on the seed having been run.

INSERT INTO "permission" ("code", "description", "is_privileged")
SELECT 'review.moderate', 'Publish or refuse a product review', false
WHERE NOT EXISTS (SELECT 1 FROM "permission" WHERE "code" = 'review.moderate');--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."is_owner_level" AND p."code" = 'review.moderate'
ON CONFLICT DO NOTHING;

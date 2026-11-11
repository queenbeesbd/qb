-- Owner and moderator: a second role, and the overview as its own permission (owner direction,
-- 2026-11-12).
--
-- ADR 0009 settled administration as owner-only; the owner has now asked for a moderator account that
-- runs the shop floor without the owner's own screens. Two things are needed in data:
--
-- 1. `dashboard.read`, so the overview can be a **page the owner decides about** rather than something
--    every signed-in principal sees. Its rail entry and its route are gated on the same code.
-- 2. The `moderator` role (not owner-level) with its default permission set: orders (read, dispatch,
--    cancel), catalog editing, review moderation and stock adjustment. Everything else - money facts,
--    settings, customers, the overview, staff and the audit trail - stays with the owner.
--
-- The database trigger `role_permission_privileged_guard` refuses a privileged permission on a non-owner
-- role, so the default set deliberately contains none: `cod.approve`, `cod.confirm_collection`,
-- `order.cost_record`, `settings.write`, `staff.manage` and the refund permissions are owner-only by
-- construction, not by this list.
--
-- Every statement is idempotent: a fresh database seeded by `npm run db:seed` already has both, and
-- re-running this migration must not reset a moderator set the owner has since edited.

INSERT INTO "permission" ("code", "description", "is_privileged")
SELECT 'dashboard.read', 'Open the admin overview', false
WHERE NOT EXISTS (SELECT 1 FROM "permission" WHERE "code" = 'dashboard.read');--> statement-breakpoint

-- Every owner keeps full access, including the new page (the documented policy, ADR 0009).
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."is_owner_level" AND p."code" = 'dashboard.read'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "role" ("code", "name", "description", "is_owner_level")
SELECT 'moderator', 'Moderator', 'Runs the shop floor: orders, catalog and reviews, without money facts or settings.', false
WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'moderator');--> statement-breakpoint

-- The defaults, granted only while the role is still empty: an owner who has already edited the set must
-- not have it rewritten by a deploy.
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."code" = 'moderator'
  AND p."code" IN ('order.read', 'order.dispatch', 'order.cancel', 'catalog.write', 'review.moderate', 'inventory.adjust')
  AND NOT EXISTS (SELECT 1 FROM "role_permission" rp WHERE rp."role_id" = r."id")
ON CONFLICT DO NOTHING;

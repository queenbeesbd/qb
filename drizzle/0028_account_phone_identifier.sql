-- A phone number becomes a sign-in identifier (ADR 0036), so one number must name exactly one account.
-- `phone` was optional contact information until now, and imported rows legitimately repeat a number
-- (the same person placed orders under more than one account, or the vendor's export duplicated it).
-- Those rows cannot all keep the identifier: sign-in by phone would be ambiguous. The oldest account -
-- `created_at`, then `id` as the deterministic tie-breaker - keeps the number; a duplicate is cleared and
-- keeps its email address, which every account has and which still signs it in.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "phone" ORDER BY "created_at", "id") AS "rank"
  FROM "customer"
  WHERE "phone" IS NOT NULL
)
UPDATE "customer"
SET "phone" = NULL,
    "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM ranked WHERE "rank" > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_phone_unique" ON "customer" USING btree ("phone") WHERE "customer"."phone" is not null;

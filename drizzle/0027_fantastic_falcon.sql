ALTER TABLE "product" DROP CONSTRAINT "product_rating_halves_valid";--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "rating_halves" SET DEFAULT 8;--> statement-breakpoint
--> statement-breakpoint
-- Every product carries the shop's rating (owner direction, 2026-11-11): a product the owner never
-- rated shows four out of five. The backfill runs before the column is made required, so the migration
-- is safe on a database that already holds products - which is every database this runs against.
UPDATE "product" SET "rating_halves" = 8 WHERE "rating_halves" IS NULL;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "rating_halves" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_rating_halves_valid" CHECK ("product"."rating_halves" between 2 and 10);
-- ---------------------------------------------------------------------------
-- 0006 - a product's short description
-- ---------------------------------------------------------------------------
-- The owner's short shelf line, shown under the price on the product page. Purely additive: one
-- nullable column and its length CHECK, so every existing row is valid without a backfill and nothing
-- already stored is rewritten.
--
-- Deliberately NOT bilingual. The long description keeps its `_bn` / `_en` pair because it is owner
-- content in both scripts; this is one short English line, and the interface is English only
-- (Phase 28). Nullable, and null means "no summary" rather than an empty paragraph.
--
-- No grant changes: `product` is already writable by the application role, and this column carries no
-- new authorization meaning. No index: nothing filters or sorts on it.

ALTER TABLE "product" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_short_description_len" CHECK ("short_description" is null or char_length("short_description") between 1 and 500);

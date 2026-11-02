-- ---------------------------------------------------------------------------
-- 0012 - discovery imagery: a category photograph and a brand logo
-- ---------------------------------------------------------------------------
-- The storefront's category index is a picture grid and its homepage gains a brand rail, so a
-- category needs an image of its own and a brand needs its logo. Purely additive: three nullable
-- columns, each with its own CHECK, so every existing row is valid without a backfill and nothing
-- already stored is rewritten.
--
-- Both image columns hold an **asset key**, never a URL and never a hotlink (ADR 0006). The admin
-- resolves a key against the server's own asset inventory before it is stored, and
-- `src/lib/images.ts` derives every rendered path from it - the same contract `product_image`
-- already keeps. Null means "no image chosen": the storefront then draws the category's icon glyph
-- or the brand's initials, which is honest, rather than a stock photograph pretending to be theirs.
--
-- `category.tagline` is one short English line for the tile - the same shape as a product's
-- `short_description`, and deliberately not bilingual: it is a shelf caption, not catalog copy.
--
-- No grant changes: `category` and `brand` are already writable by the application role. No index:
-- nothing filters or sorts on any of these columns.

ALTER TABLE "brand" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_logo_key_format" CHECK ("brand"."logo_key" is null or ("brand"."logo_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("brand"."logo_key") <= 120));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_image_key_format" CHECK ("category"."image_key" is null or ("category"."image_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("category"."image_key") <= 120));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_tagline_len" CHECK ("category"."tagline" is null or char_length("category"."tagline") between 1 and 120);
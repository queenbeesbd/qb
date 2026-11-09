ALTER TABLE "hero_image" DROP CONSTRAINT "hero_image_alt_len";--> statement-breakpoint
ALTER TABLE "hero_image" ALTER COLUMN "alt_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hero_image" ADD CONSTRAINT "hero_image_alt_len" CHECK ("hero_image"."alt_text" is null or char_length("hero_image"."alt_text") between 1 and 200);
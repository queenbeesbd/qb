ALTER TABLE "offer_popup" DROP CONSTRAINT "offer_popup_alt_len";--> statement-breakpoint
ALTER TABLE "offer_popup" ALTER COLUMN "alt_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_popup" ADD CONSTRAINT "offer_popup_alt_len" CHECK ("offer_popup"."alt_text" is null or char_length("offer_popup"."alt_text") between 1 and 200);
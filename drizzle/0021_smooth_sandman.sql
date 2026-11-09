ALTER TABLE "product" ADD COLUMN "delivery_chattogram_minor" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "delivery_dhaka_minor" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "delivery_others_minor" integer;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_delivery_chattogram_non_negative" CHECK ("product"."delivery_chattogram_minor" is null or "product"."delivery_chattogram_minor" >= 0);--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_delivery_dhaka_non_negative" CHECK ("product"."delivery_dhaka_minor" is null or "product"."delivery_dhaka_minor" >= 0);--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_delivery_others_non_negative" CHECK ("product"."delivery_others_minor" is null or "product"."delivery_others_minor" >= 0);
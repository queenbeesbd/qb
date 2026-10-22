ALTER TABLE "product" DROP CONSTRAINT "product_name_bn_len";--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "name_bn" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item" ALTER COLUMN "product_name_bn" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_name_bn_len" CHECK ("product"."name_bn" is null or char_length("product"."name_bn") between 1 and 200);
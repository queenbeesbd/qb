ALTER TABLE "delivery_setting" ADD COLUMN "conditional_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "conditional_min_subtotal_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "conditional_dhaka_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "conditional_chattogram_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "conditional_others_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_delivery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_chattogram_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_others_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_discount_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_discount_percent" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD COLUMN "repeat_discount_min_subtotal_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD CONSTRAINT "delivery_setting_conditional_amounts_range" CHECK (("delivery_setting"."conditional_min_subtotal_minor" is null or ("delivery_setting"."conditional_min_subtotal_minor" >= 0 and "delivery_setting"."conditional_min_subtotal_minor" <= 100000000))
        and ("delivery_setting"."conditional_dhaka_minor" is null or ("delivery_setting"."conditional_dhaka_minor" >= 0 and "delivery_setting"."conditional_dhaka_minor" <= 100000000))
        and ("delivery_setting"."conditional_chattogram_minor" is null or ("delivery_setting"."conditional_chattogram_minor" >= 0 and "delivery_setting"."conditional_chattogram_minor" <= 100000000))
        and ("delivery_setting"."conditional_others_minor" is null or ("delivery_setting"."conditional_others_minor" >= 0 and "delivery_setting"."conditional_others_minor" <= 100000000)));--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD CONSTRAINT "delivery_setting_repeat_amounts_range" CHECK (("delivery_setting"."repeat_chattogram_minor" is null or ("delivery_setting"."repeat_chattogram_minor" >= 0 and "delivery_setting"."repeat_chattogram_minor" <= 100000000))
        and ("delivery_setting"."repeat_others_minor" is null or ("delivery_setting"."repeat_others_minor" >= 0 and "delivery_setting"."repeat_others_minor" <= 100000000)));--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD CONSTRAINT "delivery_setting_repeat_discount_range" CHECK (("delivery_setting"."repeat_discount_percent" is null or ("delivery_setting"."repeat_discount_percent" >= 1 and "delivery_setting"."repeat_discount_percent" <= 100))
        and ("delivery_setting"."repeat_discount_min_subtotal_minor" is null or ("delivery_setting"."repeat_discount_min_subtotal_minor" >= 0 and "delivery_setting"."repeat_discount_min_subtotal_minor" <= 100000000)));
CREATE TABLE "delivery_district_charge" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_district_charge_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"district_code" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" bigint NOT NULL,
	CONSTRAINT "delivery_district_charge_code_format" CHECK ("delivery_district_charge"."district_code" ~ '^[a-z][a-z0-9-]{1,40}$'),
	CONSTRAINT "delivery_district_charge_amount_range" CHECK ("delivery_district_charge"."amount_minor" >= 0 and "delivery_district_charge"."amount_minor" <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "delivery_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_minor" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" bigint NOT NULL,
	CONSTRAINT "delivery_setting_singleton" CHECK ("delivery_setting"."id" = 1),
	CONSTRAINT "delivery_setting_default_range" CHECK ("delivery_setting"."default_minor" is null or ("delivery_setting"."default_minor" >= 0 and "delivery_setting"."default_minor" <= 100000000))
);
--> statement-breakpoint
ALTER TABLE "order_contact" ADD COLUMN "district_code" text;--> statement-breakpoint
ALTER TABLE "delivery_district_charge" ADD CONSTRAINT "delivery_district_charge_updated_by_staff_id_staff_user_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_setting" ADD CONSTRAINT "delivery_setting_updated_by_staff_id_staff_user_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_district_charge_district_unique" ON "delivery_district_charge" USING btree ("district_code");--> statement-breakpoint
CREATE INDEX "delivery_district_charge_active_idx" ON "delivery_district_charge" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "order_contact" ADD CONSTRAINT "order_contact_district_format" CHECK ("order_contact"."district_code" is null or "order_contact"."district_code" ~ '^[a-z][a-z0-9-]{1,40}$');
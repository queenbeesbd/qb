CREATE TABLE "storefront_pick" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "storefront_pick_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"section" text NOT NULL,
	"position" integer NOT NULL,
	"category_id" bigint,
	"brand_id" bigint,
	"product_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_pick_section_valid" CHECK ("section" in ('categories', 'brands', 'offers')),
	CONSTRAINT "storefront_pick_position_non_negative" CHECK ("storefront_pick"."position" >= 0),
	CONSTRAINT "storefront_pick_target_matches_section" CHECK (("storefront_pick"."section" = 'categories' and "storefront_pick"."category_id" is not null and "storefront_pick"."brand_id" is null and "storefront_pick"."product_id" is null)
          or ("storefront_pick"."section" = 'brands' and "storefront_pick"."brand_id" is not null and "storefront_pick"."category_id" is null and "storefront_pick"."product_id" is null)
          or ("storefront_pick"."section" = 'offers' and "storefront_pick"."product_id" is not null and "storefront_pick"."category_id" is null and "storefront_pick"."brand_id" is null))
);
--> statement-breakpoint
ALTER TABLE "storefront_pick" ADD CONSTRAINT "storefront_pick_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_pick" ADD CONSTRAINT "storefront_pick_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_pick" ADD CONSTRAINT "storefront_pick_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_pick_position_unique" ON "storefront_pick" USING btree ("section","position");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_pick_category_unique" ON "storefront_pick" USING btree ("section","category_id") WHERE "storefront_pick"."category_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_pick_brand_unique" ON "storefront_pick" USING btree ("section","brand_id") WHERE "storefront_pick"."brand_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_pick_product_unique" ON "storefront_pick" USING btree ("section","product_id") WHERE "storefront_pick"."product_id" is not null;
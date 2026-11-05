CREATE TABLE "hero_image" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hero_image_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"image_key" text NOT NULL,
	"alt_text" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_image_key_format" CHECK ("hero_image"."image_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "hero_image_alt_len" CHECK (char_length("hero_image"."alt_text") between 1 and 200),
	CONSTRAINT "hero_image_sort_order_range" CHECK ("hero_image"."sort_order" >= 0 and "hero_image"."sort_order" < 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hero_image_key_unique" ON "hero_image" USING btree ("image_key");--> statement-breakpoint
CREATE INDEX "hero_image_sort_idx" ON "hero_image" USING btree ("sort_order");
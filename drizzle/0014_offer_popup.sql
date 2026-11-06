CREATE TABLE "offer_popup" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"image_key" text NOT NULL,
	"aspect" text NOT NULL,
	"alt_text" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_popup_singleton" CHECK ("offer_popup"."id" = 1),
	CONSTRAINT "offer_popup_image_key_format" CHECK ("offer_popup"."image_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("offer_popup"."image_key") <= 120),
	CONSTRAINT "offer_popup_alt_len" CHECK (char_length("offer_popup"."alt_text") between 1 and 200),
	CONSTRAINT "offer_popup_aspect_valid" CHECK ("aspect" in ('square', 'wide'))
);

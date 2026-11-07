CREATE TABLE "visit_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "visit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_event_kind_valid" CHECK ("kind" in ('page_view', 'cart_add', 'checkout_start', 'order_placed')),
	CONSTRAINT "visit_event_path_len" CHECK ("visit_event"."path" is null or char_length("visit_event"."path") <= 200)
);
--> statement-breakpoint
CREATE TABLE "visit_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"has_cart" boolean DEFAULT false NOT NULL,
	"placed_order" boolean DEFAULT false NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"entry_path" text,
	CONSTRAINT "visit_session_device_valid" CHECK ("device" in ('phone', 'tablet', 'desktop')),
	CONSTRAINT "visit_session_page_views_non_negative" CHECK ("visit_session"."page_views" >= 0),
	CONSTRAINT "visit_session_entry_path_len" CHECK ("visit_session"."entry_path" is null or char_length("visit_session"."entry_path") <= 200)
);
--> statement-breakpoint
ALTER TABLE "visit_event" ADD CONSTRAINT "visit_event_session_id_visit_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visit_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_event_occurred_idx" ON "visit_event" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visit_event_session_idx" ON "visit_event" USING btree ("session_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visit_session_first_seen_idx" ON "visit_session" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visit_session_last_seen_idx" ON "visit_session" USING btree ("last_seen_at" DESC NULLS LAST);
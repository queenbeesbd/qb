CREATE TABLE "steadfast_consignment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "steadfast_consignment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"invoice" text NOT NULL,
	"consignment_id" bigint NOT NULL,
	"tracking_code" text NOT NULL,
	"status" text DEFAULT 'in_review' NOT NULL,
	"cod_amount_minor" integer NOT NULL,
	"booked_by_staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "steadfast_consignment_cid_positive" CHECK ("steadfast_consignment"."consignment_id" > 0),
	CONSTRAINT "steadfast_consignment_tracking_len" CHECK (char_length("steadfast_consignment"."tracking_code") between 1 and 64),
	CONSTRAINT "steadfast_consignment_invoice_len" CHECK (char_length("steadfast_consignment"."invoice") between 1 and 100),
	CONSTRAINT "steadfast_consignment_status_len" CHECK (char_length("steadfast_consignment"."status") between 1 and 40),
	CONSTRAINT "steadfast_consignment_cod_non_negative" CHECK ("steadfast_consignment"."cod_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "steadfast_consignment" ADD CONSTRAINT "steadfast_consignment_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steadfast_consignment" ADD CONSTRAINT "steadfast_consignment_booked_by_staff_id_staff_user_id_fk" FOREIGN KEY ("booked_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "steadfast_consignment_order_unique" ON "steadfast_consignment" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "steadfast_consignment_invoice_unique" ON "steadfast_consignment" USING btree ("invoice");--> statement-breakpoint
CREATE UNIQUE INDEX "steadfast_consignment_cid_unique" ON "steadfast_consignment" USING btree ("consignment_id");
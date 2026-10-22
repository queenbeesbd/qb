CREATE TABLE "promo_code" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promo_code_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"percent_off" integer,
	"amount_off_minor" integer,
	"min_order_minor" integer DEFAULT 0 NOT NULL,
	"max_discount_minor" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_staff_id" bigint NOT NULL,
	"updated_by_staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_kind_valid" CHECK ("kind" in ('percent', 'fixed')),
	CONSTRAINT "promo_code_shape_matches_kind" CHECK (("promo_code"."kind" = 'percent') = ("promo_code"."percent_off" is not null)
        and ("promo_code"."kind" = 'fixed') = ("promo_code"."amount_off_minor" is not null)),
	CONSTRAINT "promo_code_percent_range" CHECK ("promo_code"."percent_off" is null or "promo_code"."percent_off" between 1 and 100),
	CONSTRAINT "promo_code_amount_range" CHECK ("promo_code"."amount_off_minor" is null or ("promo_code"."amount_off_minor" > 0 and "promo_code"."amount_off_minor" <= 100000000)),
	CONSTRAINT "promo_code_min_order_range" CHECK ("promo_code"."min_order_minor" >= 0 and "promo_code"."min_order_minor" <= 100000000),
	CONSTRAINT "promo_code_max_discount_applies_to_percent" CHECK (("promo_code"."max_discount_minor" is null or ("promo_code"."kind" = 'percent' and "promo_code"."max_discount_minor" > 0))
        and ("promo_code"."max_discount_minor" is null or "promo_code"."max_discount_minor" <= 100000000)),
	CONSTRAINT "promo_code_max_redemptions_positive" CHECK ("promo_code"."max_redemptions" is null or "promo_code"."max_redemptions" > 0),
	CONSTRAINT "promo_code_window_ordered" CHECK ("promo_code"."starts_at" is null or "promo_code"."ends_at" is null or "promo_code"."ends_at" > "promo_code"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemption" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promo_code_redemption_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"promo_code_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"discount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_redemption_discount_positive" CHECK ("promo_code_redemption"."discount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "order" DROP CONSTRAINT "order_amounts_non_negative";--> statement-breakpoint
ALTER TABLE "order" DROP CONSTRAINT "order_total_is_sum";--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "discount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_created_by_staff_id_staff_user_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_updated_by_staff_id_staff_user_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_code_unique" ON "promo_code" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_code_active_idx" ON "promo_code" USING btree ("is_active","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_redemption_order_unique" ON "promo_code_redemption" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "promo_code_redemption_code_idx" ON "promo_code_redemption" USING btree ("promo_code_id","created_at");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_discount_within_subtotal" CHECK ("order"."discount_minor" <= "order"."items_subtotal_minor");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_amounts_non_negative" CHECK ("order"."items_subtotal_minor" >= 0 and "order"."shipping_minor" >= 0 and "order"."discount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_total_is_sum" CHECK ("order"."total_minor" = "order"."items_subtotal_minor" - "order"."discount_minor" + "order"."shipping_minor");

-- ---------------------------------------------------------------------------
-- The promotion discount joins the frozen charged amount
-- ---------------------------------------------------------------------------
-- `discount_minor` is part of what the customer was charged, so it is as immutable as `total_minor`.
-- Without widening the guard, editing a code could rewrite the amount on an order that already used it.

CREATE OR REPLACE FUNCTION queenbees_guard_order_immutable_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.items_subtotal_minor IS DISTINCT FROM OLD.items_subtotal_minor
     OR NEW.discount_minor IS DISTINCT FROM OLD.discount_minor
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
     OR NEW.placed_at IS DISTINCT FROM OLD.placed_at THEN
    RAISE EXCEPTION 'order identity and charged amount are immutable after insert'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A redemption is a fact, not a counter
-- ---------------------------------------------------------------------------
-- How often a code was used is `count(*)` over this table, so a row must never be edited or removed:
-- deleting one would silently refund a use, and editing one would break the agreement with the order's
-- own frozen discount. The grant layer does not distinguish this table, so the trigger is the guard.

CREATE TRIGGER promo_code_redemption_no_update
  BEFORE UPDATE ON "promo_code_redemption"
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

CREATE TRIGGER promo_code_redemption_no_delete
  BEFORE DELETE ON "promo_code_redemption"
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();

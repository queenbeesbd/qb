CREATE TABLE "product_review" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_review_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"rating_halves" integer NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decided_by" bigint,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_review_state_valid" CHECK ("state" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "product_review_rating_valid" CHECK ("product_review"."rating_halves" between 2 and 10 and "product_review"."rating_halves" % 2 = 0),
	CONSTRAINT "product_review_body_len" CHECK (char_length("product_review"."body") between 10 and 1000),
	CONSTRAINT "product_review_decision_complete" CHECK (("product_review"."state" = 'pending' and "product_review"."decided_by" is null and "product_review"."decided_at" is null)
          or ("product_review"."state" in ('approved', 'rejected') and "product_review"."decided_by" is not null and "product_review"."decided_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "rating_halves" integer;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_decided_by_staff_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_review_customer_product_unique" ON "product_review" USING btree ("customer_id","product_id");--> statement-breakpoint
CREATE INDEX "product_review_published_idx" ON "product_review" USING btree ("product_id","created_at" DESC NULLS LAST) WHERE "product_review"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "product_review_queue_idx" ON "product_review" USING btree ("state","created_at");--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_rating_halves_valid" CHECK ("product"."rating_halves" is null or ("product"."rating_halves" between 2 and 10 and "product"."rating_halves" % 2 = 0));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A review's words and stars are frozen once written (ADR 0035)
-- ---------------------------------------------------------------------------
-- The owner publishes or refuses a review; nobody edits one. A customer cannot rewrite the words
-- under an approved review (which would change a page the owner already read), and an owner cannot
-- quietly alter what a customer said while leaving the decision in place. Only the decision columns
-- and `updated_at` may change, and only from `pending` - a decided review is final, so approving a
-- refused review is a refusal rather than a second chance.

CREATE OR REPLACE FUNCTION queenbees_guard_review_immutable_body() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.rating_halves IS DISTINCT FROM OLD.rating_halves
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a review''s author, purchase, stars and words are immutable after insert'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state AND OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'illegal product_review transition: % -> %', OLD.state, NEW.state
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER product_review_immutable_body
  BEFORE UPDATE ON "product_review"
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_review_immutable_body();--> statement-breakpoint

-- A review is never deleted: a refused one is the record of what was refused, and the customer's own
-- copy of their words would otherwise be the only one left.
CREATE TRIGGER product_review_no_delete
  BEFORE DELETE ON "product_review"
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();

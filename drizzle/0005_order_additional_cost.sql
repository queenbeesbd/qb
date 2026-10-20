CREATE TABLE "order_additional_cost" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_additional_cost_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"amount_minor" integer NOT NULL,
	"description" text NOT NULL,
	"recorded_by_staff_id" bigint NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_staff_id" bigint,
	"void_reason" text,
	CONSTRAINT "order_additional_cost_amount_positive" CHECK ("order_additional_cost"."amount_minor" > 0),
	CONSTRAINT "order_additional_cost_amount_max" CHECK ("order_additional_cost"."amount_minor" <= 100000000),
	CONSTRAINT "order_additional_cost_description_len" CHECK (char_length(btrim("order_additional_cost"."description")) between 3 and 200),
	CONSTRAINT "order_additional_cost_void_complete" CHECK (("order_additional_cost"."voided_at" is null and "order_additional_cost"."voided_by_staff_id" is null and "order_additional_cost"."void_reason" is null)
          or ("order_additional_cost"."voided_at" is not null and "order_additional_cost"."voided_by_staff_id" is not null and "order_additional_cost"."void_reason" is not null and char_length(btrim("order_additional_cost"."void_reason")) >= 3))
);
--> statement-breakpoint
ALTER TABLE "order_additional_cost" ADD CONSTRAINT "order_additional_cost_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_additional_cost" ADD CONSTRAINT "order_additional_cost_recorded_by_staff_id_staff_user_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_additional_cost" ADD CONSTRAINT "order_additional_cost_voided_by_staff_id_staff_user_id_fk" FOREIGN KEY ("voided_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_additional_cost_order_idx" ON "order_additional_cost" USING btree ("order_id","recorded_at");--> statement-breakpoint
CREATE INDEX "order_additional_cost_active_idx" ON "order_additional_cost" USING btree ("order_id") WHERE "order_additional_cost"."voided_at" is null;
-- ---------------------------------------------------------------------------
-- A recorded additional cost is never rewritten, only voided
-- ---------------------------------------------------------------------------
-- The owner corrects a mistake through the void columns. Everything that says what the cost *was* -
-- which order, how much, what for, who recorded it and when - is frozen after insert, so a later edit
-- cannot make the stored history disagree with the audit trail. The row is never deleted, so a voided
-- cost keeps its place in the history while leaving the active total.

CREATE OR REPLACE FUNCTION queenbees_guard_additional_cost_immutable_columns() RETURNS trigger
LANGUAGE plpgsql AS $qb$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.recorded_by_staff_id IS DISTINCT FROM OLD.recorded_by_staff_id
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'a recorded additional cost is immutable; void it and record the correct one'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'a voided additional cost cannot be un-voided'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$qb$;--> statement-breakpoint

CREATE TRIGGER order_additional_cost_immutable_columns
  BEFORE UPDATE ON "order_additional_cost"
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_additional_cost_immutable_columns();--> statement-breakpoint

CREATE TRIGGER order_additional_cost_no_delete
  BEFORE DELETE ON "order_additional_cost"
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

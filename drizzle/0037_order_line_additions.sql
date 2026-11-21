ALTER TABLE "order_event" DROP CONSTRAINT "order_event_type_valid";--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_type_valid" CHECK ("event_type" in ('order_placed', 'claim_submitted', 'claim_withdrawn', 'payment_verified', 'payment_rejected', 'payment_falsely_claimed', 'order_confirmed', 'order_processing', 'order_shipped', 'order_delivered', 'order_completed', 'order_cancelled', 'order_expired', 'reservation_held', 'reservation_released', 'reservation_consumed', 'cod_approved', 'cod_collected', 'cod_failed', 'cod_reconciled', 'cancellation_requested', 'cancellation_decided', 'return_requested', 'return_received', 'return_inspected', 'refund_requested', 'refund_processing', 'refund_completed', 'refund_failed', 'order_claimed', 'order_line_added'));--> statement-breakpoint

-- ADR 0046. The identity columns stay frozen unconditionally. The two amount columns may move only
-- inside the one guarded service: the transaction-scoped flag must be on, the delta must be a positive
-- addition, and the subtotal and the total must move by exactly the same amount with the discount and
-- delivery snapshots untouched. A generic UPDATE still refuses, so "immutable by default" holds.
CREATE OR REPLACE FUNCTION queenbees_guard_order_immutable_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  added_minor integer;
BEGIN
  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.placed_at IS DISTINCT FROM OLD.placed_at THEN
    RAISE EXCEPTION 'order identity is immutable after insert'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.items_subtotal_minor IS DISTINCT FROM OLD.items_subtotal_minor
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor THEN
    added_minor := NEW.items_subtotal_minor - OLD.items_subtotal_minor;
    IF coalesce(nullif(current_setting('qb.order_amendment', true), ''), 'off') <> 'on'
       OR added_minor <= 0
       OR NEW.total_minor - OLD.total_minor <> added_minor
       OR NEW.discount_minor IS DISTINCT FROM OLD.discount_minor
       OR NEW.shipping_minor IS DISTINCT FROM OLD.shipping_minor THEN
      RAISE EXCEPTION 'order amounts are immutable except through a guarded line addition'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Changing what a customer will be asked to pay is an owner decision. A moderator role cannot hold a
-- privileged permission, and the service re-checks the code; a deploy does not run the seed, so the
-- catalogue row and its owner grants belong in the migration as well (see 0032).
INSERT INTO "permission" ("code", "description", "is_privileged")
SELECT 'order.amend', 'Add a product to an order before dispatch', true
WHERE NOT EXISTS (SELECT 1 FROM "permission" WHERE "code" = 'order.amend');--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."is_owner_level" AND p."code" = 'order.amend'
ON CONFLICT DO NOTHING;
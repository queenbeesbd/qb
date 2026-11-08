ALTER TABLE "order_event" DROP CONSTRAINT "order_event_type_valid";--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_type_valid" CHECK ("event_type" in ('order_placed', 'claim_submitted', 'claim_withdrawn', 'payment_verified', 'payment_rejected', 'payment_falsely_claimed', 'order_confirmed', 'order_processing', 'order_shipped', 'order_delivered', 'order_completed', 'order_cancelled', 'order_expired', 'reservation_held', 'reservation_released', 'reservation_consumed', 'cod_approved', 'cod_collected', 'cod_failed', 'cod_reconciled', 'cancellation_requested', 'cancellation_decided', 'return_requested', 'return_received', 'return_inspected', 'refund_requested', 'refund_processing', 'refund_completed', 'refund_failed', 'order_claimed'));
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- A guest order may be linked to a customer account, exactly once (ADR 0032).
--
-- `order.customer_id` was in the immutable set, which is what made "this order belongs to that
-- account, forever" true. Claiming a guest order is the one transition the owner asked for, so the
-- guard now permits **precisely** that: `null` -> a customer, once. It still refuses a link that
-- moves to a different customer and a link that is cleared, so an order claimed by one account can
-- never be taken by another and a claim can never be undone by a later write.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION queenbees_guard_order_immutable_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.items_subtotal_minor IS DISTINCT FROM OLD.items_subtotal_minor
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
     OR NEW.placed_at IS DISTINCT FROM OLD.placed_at THEN
    RAISE EXCEPTION 'order identity and charged amount are immutable after insert'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     AND NOT (OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL) THEN
    RAISE EXCEPTION 'an order owner may only be set once, from guest to customer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

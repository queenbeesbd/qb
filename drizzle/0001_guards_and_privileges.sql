-- Migration 0001: guards and privileges.
--
-- Hand-written, registered as a custom Drizzle migration. Everything here is an invariant that the
-- approved design requires but that a schema DSL cannot express: guard triggers, append-only
-- enforcement, and least-privilege grants.
--
-- Basis in docs/data-model.md:
--   * order immutable columns        -> section 7.1 ("Enforced by a guard trigger ... part of the migration")
--   * order_item immutable after insert -> section 7.3
--   * append-only ledger tables      -> convention C5 and section 16.4
--   * privileged permission guard    -> section 4.8
--   * reservation/claim state guards -> sections 11.3 and 11.4 (forbidden transitions)
--
-- All of it is forward-fix only. There are no down-migrations; see docs/database.md.

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
-- C5 documents append-only as a *privilege*. A privilege does not restrain the table owner, and in
-- local development and tests the application connects as the owner - so the grant alone would make
-- the invariant untestable and unenforced exactly where it is exercised. This trigger holds
-- regardless of role, and the grants below add defence in depth for a deployed least-privilege role.

CREATE OR REPLACE FUNCTION queenbees_forbid_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only; % is forbidden', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint

CREATE TRIGGER inventory_movement_append_only
  BEFORE UPDATE OR DELETE ON inventory_movement
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

CREATE TRIGGER order_event_append_only
  BEFORE UPDATE OR DELETE ON order_event
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

-- An order line is a frozen snapshot: prices change and products are renamed, so the record of what
-- was bought must not move (section 7.3).
CREATE TRIGGER order_item_immutable
  BEFORE UPDATE OR DELETE ON order_item
  FOR EACH ROW EXECUTE FUNCTION queenbees_forbid_write();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Immutable columns on "order"
-- ---------------------------------------------------------------------------
-- PostgreSQL has no declarative column-level immutability, so the design requires a guard trigger.
-- Only the columns that identify the order and fix its charged amount are frozen. State columns,
-- fulfilment timestamps and the reservation expiry remain updatable, because the state machines
-- depend on them.

CREATE OR REPLACE FUNCTION queenbees_guard_order_immutable_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.items_subtotal_minor IS DISTINCT FROM OLD.items_subtotal_minor
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
     OR NEW.placed_at IS DISTINCT FROM OLD.placed_at THEN
    RAISE EXCEPTION 'order identity and charged amount are immutable after insert'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER order_immutable_columns
  BEFORE UPDATE ON "order"
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_order_immutable_columns();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- State transition guards
-- ---------------------------------------------------------------------------
-- The design specifies these transitions are enforced by state-guarded statements in the server
-- layer. These triggers make the same rule hold at the database, so a future code path that forgets
-- the guard cannot resurrect a released reservation or reopen a resolved payment claim.

CREATE OR REPLACE FUNCTION queenbees_guard_reservation_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT (OLD.state = 'held' AND NEW.state IN ('consumed', 'released')) THEN
      RAISE EXCEPTION 'illegal stock_reservation transition: % -> %', OLD.state, NEW.state
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER stock_reservation_transition_guard
  BEFORE UPDATE ON stock_reservation
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_reservation_transition();--> statement-breakpoint

CREATE OR REPLACE FUNCTION queenbees_guard_claim_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT (OLD.state = 'submitted'
            AND NEW.state IN ('verified', 'rejected', 'falsely_claimed', 'withdrawn')) THEN
      RAISE EXCEPTION 'illegal payment_claim transition: % -> %', OLD.state, NEW.state
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER payment_claim_transition_guard
  BEFORE UPDATE ON payment_claim
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_claim_transition();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Privileged permissions may only belong to an owner-level role
-- ---------------------------------------------------------------------------
-- Section 4.8: "a non-owner role cannot hold one, enforced by a CHECK-backed trigger and re-checked
-- in the server layer". This is the database half of that pair.

CREATE OR REPLACE FUNCTION queenbees_guard_privileged_permission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_is_owner_level boolean;
  target_is_privileged boolean;
BEGIN
  SELECT is_owner_level INTO target_is_owner_level FROM role WHERE id = NEW.role_id;
  SELECT is_privileged INTO target_is_privileged FROM permission WHERE id = NEW.permission_id;

  IF COALESCE(target_is_privileged, false) AND NOT COALESCE(target_is_owner_level, false) THEN
    RAISE EXCEPTION 'privileged permission may only be granted to an owner-level role'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER role_permission_privileged_guard
  BEFORE INSERT OR UPDATE ON role_permission
  FOR EACH ROW EXECUTE FUNCTION queenbees_guard_privileged_permission();--> statement-breakpoint

-- Least-privilege grants are deliberately NOT in this migration. They live in exactly one place,
-- src/db/grants.ts, and are applied by `npm run db:grants`, because they depend on a role that may
-- not exist in a given environment and must be re-applied when a migration adds a table. See
-- docs/database.md.

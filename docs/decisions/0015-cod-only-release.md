# ADR 0015 - Cash on Delivery only: the manual prepaid subsystem is removed

Status: **accepted 2026-10-17** (owner directive: this release supports **Cash on Delivery only**; no
online gateway is selected or authorized). Supersedes in effect the *implementation* of D7, D8 and D11
for this release, and narrows ADR 0014 to the COD flow. D7's COD decision, D9's COD lifecycle and D12
(account-required checkout) remain in force.

## Context

Phases 15 and 16 built a complete manual prepaid flow: bKash/Nagad selection at checkout, owner-configured
recipient accounts, a customer-submitted payment claim (sender number, transaction reference, claimed
amount), a verification queue with verify/hold/reject/false-claim actions, a mismatch exception, duplicate
reference flagging, and a payment-claim table with its own state machine.

The owner has now decided that **the current release will accept Cash on Delivery only**. Online payment
may return later as an **automated gateway** once an affordable, reliable Bangladeshi provider is chosen
and approved; that is a **future roadmap item**, not a current feature. No provider, SDK, credential or
endpoint is selected or authorized.

Two things follow, and they pull in opposite directions:

1. **The manual prepaid subsystem must go.** Keeping an unreachable screen with a stored sender number
   and transaction reference is a liability: it implies a promise the store is not making, and it holds
   customer financial references that no one is operating.
2. **The data that already exists must not be destroyed.** A payment claim is a record of an alleged
   transfer, and `audit_event` is append-only. Deleting the tables would delete evidence and history,
   which the project's own rules forbid.

## Decision

### 1. Cash on Delivery is the only active payment method

- `createOrder` **does not accept a payment method**. It writes `payment_method = 'cod'`,
  `payment_state = 'not_applicable'`, `cod_state = 'cod_pending_approval'` and `expires_at = NULL`.
- Checkout submits **no method field**. There is no radio group and no claim field, so a client cannot
  choose or invent a method, and no page can imply that a manual transfer is supported.
- The COD owner flow is **preserved as implemented**: the order waits for the owner's call, the owner
  approves (→ `cod_approved` + `confirmed`) or rejects (→ `cancelled`, guarded to `pending`), each
  transition is guarded on prior state, idempotent by conflict, and audited with actor, reason and
  before/after in the same transaction. A rejected order leaves the worklist.
- **No** reservation, allocation, deduction or movement is written (ADR 0013). Availability remains a
  binary owner-controlled state and **overselling stays accepted**.

### 2. The manual prepaid code is removed, not hidden

Removed from the active application: the bKash/Nagad checkout branch; the payment-recipient configuration
screen, its navigation entry, its API route, its service, its validation module, its permission
(`payment.recipient_manage`) and its audit codes; the verification queue and its API route; claim parsing,
the claim write inside order creation, `decideVerification`, the verification/duplicate-reference reads;
the `payment.verify`, `payment.reject` and `payment.flag_false` permissions and their audit codes; and
every prepaid translation key.

The retired paths **404** rather than redirect: `/admin/payments`, `/admin/payments/recipients`,
`/api/admin/payments` and `/api/admin/payment-recipients`.

### 3. The schema stays as designed; no destructive migration

`payment_recipient`, `payment_claim`, `order.payment_state`, the `payment_method` value list and the
claim/reservation tables **remain in the schema**, exactly like the inventory ledger and reservation
(ADR 0013). Reasons, in order of weight:

1. **History and accountability.** `payment_claim` rows record alleged transfers, and `audit_event` rows
   reference them by entity id. A `DROP TABLE` would destroy both the evidence and the trail's meaning.
2. **Nothing is gained.** The tables are unreachable from the application, so an unused table is not an
   attack surface in the way an unused endpoint is.
3. **A narrowing `CHECK` would rewrite history.** Removing `bkash`/`nagad` from
   `order_payment_method_valid` would require rewriting existing order rows, which is a retention decision
   the owner has not made.

**No migration is created by this phase.** A future cleanup that drops these tables is a **data-retention
decision** requiring explicit owner approval, and must state exactly what history is lost.

### 4. Delivery charges remain unconfigured

Nothing in this phase invents a delivery charge. `order.shipping_minor` stays `0`, the checkout states that
delivery is arranged on confirmation, and the required owner inputs (prices, supported areas, matching and
fallback rules) are unchanged.

### 5. No gateway work is done now

No provider is selected, no SDK is added, no credential exists, and **no speculative gateway abstraction is
built**. When a gateway is approved, it must write a payment record and audit trail of its own design -
reusing the retired manual claim shape would be a guess dressed as an interface.

## Consequences

- **Positive:** the shipped product matches what the store actually does; no customer is shown instructions
  for an account that does not exist; the owner's worklist is one queue instead of two; the customer's
  order page cannot describe a verification step that no longer happens; and there is no stored
  customer-submitted payment reference for a method the store does not operate.
- **Negative / accepted:** the store cannot take prepaid orders at all, so a customer who cannot pay cash on
  delivery cannot order. There is no advance payment, no online refund path, and no way to reserve goods
  for a transfer. COD refusal at the door is now the only failure mode, and it is handled operationally
  (return-to-store, no automatic re-listing).
- **Recorded cost:** the manual flow's tests, screens and permission codes are deleted, so restoring manual
  prepaid would be new work, not a flag flip. That is intentional.
- **Unchanged:** the customer ban (D20) still revokes sessions and refuses orders inside the order
  transaction; the COD decision still never bans anyone; availability is still the only ordering gate.

## What this ADR does not decide

- Whether a gateway is ever adopted, which provider, its fees, settlement timing, refund/dispute handling,
  or the implementation scope. All of that is a future owner decision.
- Whether the unused payment tables are eventually dropped, and what retention period applies to their
  rows.
- Delivery charges, courier arrangements, cancellation/refund policy beyond what is already recorded.

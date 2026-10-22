# ADR 0023 - A ban is reversible

- Status: accepted (owner decision, 2026-10-23)
- Phase: 41
- Amends: the D20 ban rule in ADR 0009. It changes **who may undo a ban**, not what a ban is.

## Context

D20 (ADR 0009) settled that a customer is banned only after a **confirmed fake order**, that the ban
carries an audited reason and actor, that it revokes every live session, that new orders are refused
inside the order transaction, and that it never cancels, refunds or deletes an order.

What it did not settle is the way back. The transition was implemented as `active -> suspended` and
nothing else, so a mistaken ban - a reasonable thing to get wrong once, with a phone number and an
order number that do not match - could only be undone by editing the database. The owner decided a ban
**can be restored**, with the same discipline as the ban itself.

## Decision

1. **A restore is an explicit, reasoned, audited action.** `restoreCustomer` is the mirror image of
   `suspendCustomer`: a guarded `suspended -> active` transition, a required reason of 10-500
   characters, and one audit record (`customer.ban_reversed`) with actor and reason. Restoring an
   account that is not suspended is a **conflict**, not a silent success, so a double click cannot read
   as a second decision.
2. **It is not an undo of history.** The order that led to the ban is untouched, still counted, still
   visible; no refund, reservation, payment or order state changes. A ban never rewrote commerce state,
   so lifting one must not either.
3. **It does not resurrect a session.** Every session was revoked at the ban and stays revoked; the
   customer signs in again with their own password. Restoring access is not restoring a login, and an
   old leaked cookie stays dead.
4. **It does not clear the review flag.** The flag is a separate concept (D20), cleared by its own
   reasoned action. A restore says "this customer may shop again", not "the concern was unfounded".
5. **The operation is named, never implied.** The route requires `operation` to be `ban` or `restore`; a
   missing or misspelled value is refused. A form that cannot say what it is asking for does not get to
   ban somebody by default.
6. **Both actions live behind `customer.suspend`**, on the customer list and the customer profile, and
   both open a confirmation dialog that requires a reason and states the consequence - the restore copy
   says plainly that sessions were revoked and that the customer must sign in again.

## Consequences

- A mistaken ban is now recoverable by the owner in two clicks and one sentence, instead of a database
  edit. The audit trail keeps both decisions, so the reversal is as visible as the ban.
- Neither action is available to a principal without `customer.suspend`, and neither is reachable from
  the storefront.
- **Not built:** bulk restore, an "unban on appeal" workflow, a timer that expires a ban (there must
  never be one - a ban is a person's decision, not a schedule), and any customer-facing notice that an
  account was banned or restored. Customer communications remain out of scope (ADR 0012).

## Verification

- `tests/db/customer-auth.test.ts`: 12/12, including two new tests - a ban then restore (status active,
  both audit rows in order, each with its own reason, the revoked session still dead, the customer able
  to sign in again) and a restore of an account that is not suspended (conflict).
- HTTP against the running app: restore a suspended customer -> `?notice=restored`, profile shows
  active, the customer signs in again; a second restore -> `conflict`; a short reason -> `invalid`; a
  request with no `operation` -> `invalid`; the audit trail shows `customer.ban_reversed` with the reason
  and the actor.
- **Not verified:** the confirmation dialog's own opening and typing, because this dev server serves a
  stale production `.next` and no page hydrates (documented in Phase 36). The dialog is the same shared
  component the ban already uses, and the route it posts to is what was exercised.

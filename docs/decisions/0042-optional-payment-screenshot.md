# ADR 0042 - The optional payment screenshot, and what it is not

Status: accepted (owner direction, 2026-11-18); **amended 2026-11-19** - the receipt no longer carries the field. **Amends ADR 0015**, which withdrew customer-submitted
payment artefacts together with the manual prepaid flow. It does **not** restore that flow: Cash on
Delivery remains the only payment method an order records, there is still no prepaid payment state, no
verification queue, no claim allocation and no gateway.

## Context

The checkout notice tells a customer who pays any part of an order in advance to send a screenshot of the
payment on WhatsApp (owner decision, 2026-11-10). That money moves outside the site, so nothing in the
database knows about it. The owner asked for the obvious gap to be closed in one place rather than in a
phone gallery: an optional screenshot field at payment time, switchable from the back office, and a
section on the order screen where the image can actually be checked.

ADR 0015 and `AGENTS.md` said the opposite in plain words - *"a screenshot, sender number, transaction
reference or confirmation message is not evidence, and the COD release collects none of them"* - so this is
a deliberate reversal of the **collection** rule by its owner. It is not a reversal of the rule that made
the words true: a customer-supplied image still proves nothing on its own.

## Decision

1. **Optional, one image, on by default and switchable off.** `payment.proof_enabled` is a
   `store_setting` switch. It starts **on** (owner direction, 2026-11-18) because the owner asked for the
   field to sit under the bKash number at checkout without a trip to Settings first; the switch turns it
   off. With it off, no field is drawn and an uploaded file that arrives anyway is ignored rather than
   stored.
2. **Two places, because the money moves around the order.** The checkout payment card carries the field
   directly under the bKash/WhatsApp block (owner direction: on a phone that reads number → screenshot →
   order summary), and the order receipt carries the same field, so a customer who paid after ordering can
   still attach it. The receipt is reachable by its order number for a guest and by session for a customer;
   attaching uses exactly that rule and grants nothing else.
3. **It is not a payment state, and it moves nothing.** `payment_proof` holds the image's key, size and
   dimensions and the owner's reading of it. Approving a screenshot changes no `order.status`,
   `payment_state`, `cod_state`, total, event, stock or refund. There is no automatic transition anywhere:
   the owner still marks cash received with `markPaymentReceived`, on their own evidence.
4. **The owner's reading is checked or rejected, and a rejection states why.** `payment.proof_review` is a
   new **privileged** permission, so the database trigger refuses it on a non-owner role and a moderator
   cannot be granted it. The decision writes `reviewed_by`, `reviewed_at` and an audit row
   `order.payment_proof_reviewed`; a rejection requires a typed reason of at least three characters.
5. **A replacement is a new claim.** One row per order (a unique index, not a convention). Uploading again
   replaces the file columns and returns the row to `pending`, clearing the earlier decision and note.
6. **The bytes are private.** The image goes to the object-storage bucket under a `payment-proof/` prefix,
   or to `.data/payment-proof/` locally - **never** `public/`, and never a path `/catalog/[...path]` can
   address. It is served only by `GET /api/qbpanel/orders/[orderNumber]/proof`, which requires
   `order.read` and answers `no-store, private` with `nosniff`. A screenshot carries a transaction id and a
   phone number; the public catalog contract is the wrong contract for it.
7. **The bytes are re-encoded, not trusted.** `saveProof` decodes with `sharp` (40 MP ceiling, EXIF
   rotated away), re-encodes to WebP at a 1600px long edge, and records the type, size and dimensions from
   the decoded image. The request supplies bytes and nothing else.

## Amendment (2026-11-19) - the receipt no longer carries the field

Owner report: the **Payment screenshot** card on the order receipt is a defect. It was added as part of
this ADR (decision 2 above), and the owner asked for it to go - the receipt confirms an order, and a
second upload form on it is not what a confirmation page is for.

Consequences of the narrowing, all applied:

- The receipt (`/orders/[orderNumber]`) draws no field, no notice and no screenshot state.
- `POST /api/orders/[orderNumber]/proof` is **deleted**, so nothing can attach or replace an image after
  placement. `proofTarget`, `attachProof` and `loadProofSummary` went with it rather than being left
  unreferenced. `tests/db/payment-proof.test.ts` was rewritten around the surviving rules and seeds its
  row the way checkout writes it.
- `saveProof` and `payment_proof` are unchanged; **checkout** still writes the one optional image at
  placement (`order/create.ts`). `payment.proof_enabled` now switches only the checkout field.
- The owner's review is untouched: `payment.proof_review` at `/qbpanel/orders/[orderNumber]` still reads
  the image and records checked or rejected, and still moves no order column.
- The permission, the table, the private storage prefix and the admin `GET` route all stay. Decision 3, 4,
  6 and 7 above continue to bind.

Nothing about this amendment restores ADR 0015's withdrawn prepaid flow, and no screenshot still proves
anything on its own.

## Consequences

- `AGENTS.md` now reads: a customer-submitted artefact is **never proof of payment**; this one is an
  attachment the owner checks against the shop's own bKash statement, and it appears in the panel
  labelled as exactly that.
- A customer can attach to a guest order by holding its number, which is the same handle the receipt
  already relies on. It grants no state change, no claim and no visibility beyond the receipt the browser
  could already read.
- The schema gains one table (55 tables, migration `0034`), which also inserts and grants
  `payment.proof_review` - a deploy does not run the seed, so a permission that exists only in
  `permissions.ts` would be invisible to every owner role in production (the `review.moderate` lesson).
- Nothing expires, sweeps or deletes a screenshot: it is kept with its order, like the order's own
  contact row. The switch stops new uploads; it does not erase what was already sent.
- The storefront still states no delivery promise, no refund rule and no payment guarantee. The receipt
  says the shop checks the image; it never says the order is paid.
- **The standing explanation is gone (owner feedback, 2026-11-18).** Both surfaces once carried a
  paragraph - *"Optional. If you paid in advance, attach a screenshot... the shop checks it against its
  own statement; it does not mark the order paid"* - and the owner read it as the kind of note that makes
  a shop look unprofessional. The label is now the whole instruction, **Add your payment screenshot**,
  with a bracketed **(optional)** in smaller italic muted type beside it, so the one qualifier that
  matters sits in the label rather than as a sentence under the control. The only text beneath the field
  is the chosen file's name and size, drawn after a file is selected. Nothing is lost: the field is not
  required, `checkout.payment.proofHint` and `account.order.proofHint` were deleted rather than left
  unreferenced, and no sentence anywhere claims an order is paid.

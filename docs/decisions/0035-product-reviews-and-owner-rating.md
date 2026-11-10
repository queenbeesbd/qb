# ADR 0035 - Product reviews, the owner's rating, and a review photograph

**Status:** approved by the owner, 2026-11-10. Implemented locally; nothing is deployed by this record.
**Supersedes:** nothing. **Amends:** the honesty rule in `AGENTS.md` that forbids invented ratings, for
one narrow and named case.

## Context

The owner asked for two related things:

1. **A customer who has ordered a product can review it** on the product page. The review carries the
   customer's words, their star rating and, added the same day, an optional photograph. A review is
   visible **to its author immediately** and to everybody else **only after the owner publishes it** in
   the admin panel.
2. **A product carries a rating the owner sets** in the product editor - one to five stars, halves
   included (the owner named 4.5) - and that rating shows on product cards.

The second request touches a rule the project has held since Phase 0: *never invent a rating*. That
rule exists to stop a storefront printing "4.8 from 126 reviews" it cannot substantiate. A rating the
owner deliberately types is a different thing: it is owner-authored metadata, like a curated selection
or a category tagline, not a measurement of customers. The owner asked for it explicitly, so it is
recorded here rather than left as an undocumented exception.

## Decision

### 1. A review is earned by an order

`product_review.order_id` records the order that entitled the customer to speak. Before the row is
written, `reviewEligibility` looks for a real `order_item` on an order of theirs that is **not
cancelled**. A cancelled or refused order is not a purchase, so it buys no right to speak. A claimed
guest order qualifies, because claiming is what makes it theirs.

**One review per customer per product**, enforced by `product_review_customer_product_unique`. A second
submission is a refusal, not a second opinion. Editing is unsupported: the owner decides what is
published, so a customer rewriting the words under an approved review would change a page the owner had
already read.

### 2. A review is born pending, and only the owner publishes it

`state` is `pending` / `approved` / `rejected`, and only `approved` rows are returned by the public
read. The author sees their own row in any state, with that state named - which is the only way they
know the words they wrote were received.

The decision is a state-guarded update (`where state = 'pending'`), so two clicks cannot both decide,
and a decided review is final: approving a refused review is refused rather than offered as a second
chance. Publishing is audited as `review.published`, refusing as `review.refused`, and the audit
payload records the words, stars and product as they were at that moment.

**A refused review is kept.** `product_review_no_delete` refuses every `DELETE`; a refusal is the record
of what was refused, and the customer's own copy of their words would otherwise be the only one left.

### 3. The words, the stars, the purchase and the photo are frozen

`queenbees_guard_review_immutable_body` refuses any update to `product_id`, `customer_id`, `order_id`,
`rating_halves`, `body`, the three photo columns or `created_at`. Only the decision columns and
`updated_at` may change. A customer cannot swap the picture under an approved review, and the owner
cannot quietly alter what a customer said while leaving the decision in place.

### 4. Customer stars are never aggregated

The reviews block shows each review with its own stars and **no average, no count of stars, no
distribution**. There is no function in `src/server/reviews` that returns a mean, and none may be added.

### 5. The displayed rating is the owner's own field

`product.rating_halves` is an integer count of **half stars** (2 = one star, 9 = four and a half, 10 =
five), for the same reason money is integer poisha: `4.5` has no exact binary representation and a
stored rating must never drift by a rounding step. The check allows any half step from 2 to 10.

- It is **not** derived from reviews, and no code may derive it from them. An owner who publishes a
  one-star review does not change the stars on the card.
- It is **null by default**: a product with no rating draws no stars at all. Never a zero, never an
  empty row, never a placeholder.
- The editor offers every half step, because the owner asked for 4.5 by name. A customer's review is
  the whole-star choice instead: five stars, no halves, because the point of a review is the sentence.
- The storefront says only what is true: the stars, the figure, "out of 5", and an accessible label
  "Rated 4.5 out of 5". It never says "customers rated this", and never prints a review count beside
  the stars.

### 6. A review may carry one photograph

One optional image per review, attached at submission and covered by the immutability trigger.

- The upload goes through the **same** pipeline as product photography (`saveUpload`, kind `square`):
  decoded with `sharp` under a 40 MP ceiling, EXIF-rotated, re-encoded to WebP at 320/600/1050,
  metadata stripped, and the key, dimensions and content type produced **from the bytes**. A browser
  supplies bytes and nothing else. The browser downscales first (`src/lib/image-prep.ts`) so a 5-12 MB
  phone photo fits under the request cap.
- The bytes are stored **before** the transaction opens, so a file that cannot be read refuses the
  whole submission rather than leaving a review whose photo silently never arrived.
- The photograph is served by the existing `/catalog/<key>-<width>.webp` route, which names immutable
  bytes. **Accepted, bounded exposure:** the object exists before the review is published, and a party
  holding its key could fetch it. Keys are unguessable (`photo-upload-<timestamp36>-<8 hex>`), and the
  key is linked from nowhere until the review is published; the review's **text remains gated by the
  database** in every case. A dedicated gated image route is therefore not built.
- It renders with `alt=""` because the customer supplied no description, and the review's words are
  what a screen reader should hear rather than an invented caption.

### 7. One new permission, and it is not `catalog.write`

`review.moderate` gates the queue and its mutation. Publishing a customer's words on the shop's own page
is a different act from editing the catalog, and a permission with no check behind it is a name, not an
ability. It is not privileged: it asserts no money fact and changes who may act.

## What this does not do

- No review editing by the customer, no reply from the shop, no helpfulness votes, no sorting control,
  no pagination beyond "the ten most recent, and a sentence saying so when there are more".
- No average rating, no rating filter, no "rating" facet on the listing.
- No email or notification when a review is published or refused. The customer sees the state on the
  product page when they return.
- No reviewer name or avatar. A published review is labelled **Verified buyer**, which is the only thing
  verifiably true about it; publishing a customer's name is a privacy decision the owner has not made.

## Consequences

- A product can carry a rating that no customer review supports. That is intended and is why the
  storefront never presents the stars as customers' opinion.
- Reviews are a moderation queue, so an unpublishable review is a decision the owner has to make. The
  queue is oldest-first, like the COD list.
- The review photo is customer-supplied content. It is re-encoded, metadata-stripped and bounded, but
  nothing here inspects what it depicts: the owner's approval of the review is the only editorial check,
  which is why the queue shows the photograph beside the words.

## Verification

Recorded in `docs/project-status.md` under the 2026-11-10 entry: unit tests for the rating arithmetic,
database tests for the purchase gate, the unique index, the transition guard, immutability, deletion
refusal and the decision-completeness check, and a browser walk-through from a customer's submission to
the owner's publish to the public page at 390px and 1440px.

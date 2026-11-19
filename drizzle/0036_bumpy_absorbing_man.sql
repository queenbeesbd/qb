-- A review the owner writes, for words the shop's customers left somewhere else (2026-11-19).
--
-- Reviews arrive on the shop's own product pages only from a buyer with a real order - that rule does
-- not change. But most of this shop's reviews happen on Facebook and WhatsApp, and the owner asked to
-- be able to put those on the product page themselves, because a shop with no visible reviews reads as
-- a shop nobody bought from.
--
-- So a review now has a **source**, and the two sources have different provenance:
--
--   * `customer` - written on the product page by a buyer. `customer_id` and `order_id` are both set,
--     and they are the proof the review was earned. This is every row that existed before this
--     migration, which is why the column defaults to it.
--   * `owner` - typed into `/qbpanel/reviews` by the owner from words a customer left on social media.
--     Neither `customer_id` nor `order_id` is set, because there is no account and no order behind it,
--     and writing a made-up one would be the exact dishonesty the rule exists to prevent.
--
-- `product_review_provenance` makes the pair enforceable in both directions: a customer review without
-- its purchase is impossible, and an owner review that claims a purchase is impossible too. That is
-- why the two columns became nullable rather than being filled with a sentinel - a NULL says "there is
-- no purchase", which is the truth about an imported review.
--
-- **An owner-written review is never labelled "Verified buyer".** The storefront draws that label from
-- `source`, not from the fact that the row is published: the claim belongs to the customer's purchase,
-- and a row without one cannot make it.
--
-- An owner-typed row is inserted already `approved` with the owner as `decided_by`, so the existing
-- `product_review_decision_complete` check holds for both sources without a special case, and the
-- immutability trigger freezes its words from the moment it is written.

ALTER TABLE "product_review" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_review" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_review" ADD COLUMN "source" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
CREATE INDEX "product_review_source_idx" ON "product_review" USING btree ("source");--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_source_valid" CHECK ("source" in ('customer', 'owner'));--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_provenance" CHECK (("product_review"."source" = 'customer' and "product_review"."customer_id" is not null and "product_review"."order_id" is not null)
          or ("product_review"."source" = 'owner' and "product_review"."customer_id" is null and "product_review"."order_id" is null));
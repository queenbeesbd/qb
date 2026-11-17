CREATE TABLE "payment_proof" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_proof_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text DEFAULT 'customer' NOT NULL,
	"review_state" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	CONSTRAINT "payment_proof_uploaded_by_valid" CHECK ("uploaded_by" in ('customer', 'staff')),
	CONSTRAINT "payment_proof_review_state_valid" CHECK ("review_state" in ('pending', 'checked', 'rejected')),
	CONSTRAINT "payment_proof_decision_complete" CHECK (("payment_proof"."review_state" = 'pending' and "payment_proof"."reviewed_by" is null and "payment_proof"."reviewed_at" is null)
          or ("payment_proof"."review_state" in ('checked', 'rejected') and "payment_proof"."reviewed_by" is not null and "payment_proof"."reviewed_at" is not null)),
	CONSTRAINT "payment_proof_rejection_reason" CHECK ("payment_proof"."review_state" <> 'rejected'
          or ("payment_proof"."review_note" is not null and char_length(btrim("payment_proof"."review_note")) between 3 and 500)),
	CONSTRAINT "payment_proof_byte_size_positive" CHECK ("payment_proof"."byte_size" > 0),
	CONSTRAINT "payment_proof_dimensions_positive" CHECK ("payment_proof"."width" > 0 and "payment_proof"."height" > 0),
	CONSTRAINT "payment_proof_storage_key_format" CHECK ("payment_proof"."storage_key" ~ '^payment-proof/[a-z0-9]+(-[a-z0-9]+)*\.webp$'
          and char_length("payment_proof"."storage_key") <= 160)
);
--> statement-breakpoint
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_reviewed_by_staff_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proof_order_unique" ON "payment_proof" USING btree ("order_id");
--> statement-breakpoint
-- `payment.proof_review`: deciding whether a customer's payment screenshot agrees with the shop's own
-- bKash statement (ADR 0042).
--
-- It is **privileged**, so `role_permission_privileged_guard` refuses it on a non-owner role and a
-- moderator can never be granted it. Judging a money claim is the owner's own act, exactly like
-- `cod.confirm_collection`; the difference is that this one changes no order state at all.
--
-- A deploy does not run the seed, so a permission added to `src/server/authz/permissions.ts` exists in
-- the catalogue and nowhere else until a migration inserts it (the `review.moderate` lesson, 0032).
INSERT INTO "permission" ("code", "description", "is_privileged")
SELECT 'payment.proof_review', 'Read and decide a customer''s payment screenshot', true
WHERE NOT EXISTS (SELECT 1 FROM "permission" WHERE "code" = 'payment.proof_review');--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."is_owner_level" AND p."code" = 'payment.proof_review'
ON CONFLICT DO NOTHING;

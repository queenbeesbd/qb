-- Phone or email is enough to open an account (owner decision, 2026-11-12).
--
-- 1. `customer.email` becomes nullable: a phone-first registration no longer needs an address, and an
--    email-first registration still needs no number. `customer_contact_required` keeps the one thing
--    that must hold - an account with neither identifier could never be signed in to or recovered.
-- 2. `phone_verified_at` records that the six-digit SMS code sent at registration was entered. It is
--    informational, exactly like `email_verified_at`: the account is usable before it is set.
-- 3. `account_recovery_token.attempts` bounds wrong guesses against a six-digit code. A mailed link
--    never reads it (the token space is 256 bits); a code expires in ten minutes and dies after five.
-- 4. `password_reset` and `phone_verify`/`phone_reset` are the new purposes.
-- 5. `customer_email_change` is dropped: a change of email address is applied directly from the
--    account page and no longer needs a mailed confirmation (owner decision, 2026-11-12).

ALTER TABLE "customer_email_change" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customer_email_change" CASCADE;--> statement-breakpoint
ALTER TABLE "account_recovery_token" DROP CONSTRAINT "account_recovery_token_purpose_valid";--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_recovery_token" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_recovery_token" ADD CONSTRAINT "account_recovery_token_purpose_valid" CHECK ("purpose" in ('password_reset', 'email_verify', 'phone_verify', 'phone_reset'));--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_contact_required" CHECK ("customer"."email" is not null or "customer"."phone" is not null);
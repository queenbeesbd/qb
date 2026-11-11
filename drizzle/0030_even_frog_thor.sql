-- Verification happens before an account exists (owner decision, 2026-11-12; ADR 0038).
--
-- `customer_registration` holds a registration that has proved the number or address it was started
-- with but has not created the account yet: the canonical identifier, an scrypt digest of the
-- six-digit code, the attempts spent on it, the ticket issued once the code is entered, and the moment
-- the row was consumed. Exactly one live row per identifier, so a new request supersedes the last.

CREATE TABLE "customer_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"identifier" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"ticket_hash" text,
	"consumed_at" timestamp with time zone,
	"requested_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_registration_channel_valid" CHECK ("customer_registration"."channel" in ('phone', 'email')),
	CONSTRAINT "customer_registration_identifier_len" CHECK (char_length("customer_registration"."identifier") between 5 and 254),
	CONSTRAINT "customer_registration_attempts_non_negative" CHECK ("customer_registration"."attempts" >= 0),
	CONSTRAINT "customer_registration_expiry_after_created" CHECK ("customer_registration"."expires_at" > "customer_registration"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_registration_ticket_unique" ON "customer_registration" USING btree ("ticket_hash") WHERE "customer_registration"."ticket_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_registration_live_unique" ON "customer_registration" USING btree ("identifier") WHERE "customer_registration"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "customer_registration_expiry_idx" ON "customer_registration" USING btree ("expires_at") WHERE "customer_registration"."consumed_at" is null;
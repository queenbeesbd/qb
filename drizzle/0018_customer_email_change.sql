CREATE TABLE "customer_email_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" bigint NOT NULL,
	"new_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip_hash" text,
	CONSTRAINT "customer_email_change_email_len" CHECK (char_length("customer_email_change"."new_email") between 3 and 254),
	CONSTRAINT "customer_email_change_expiry_after_created" CHECK ("customer_email_change"."expires_at" > "customer_email_change"."created_at")
);
--> statement-breakpoint
ALTER TABLE "customer_session" DROP CONSTRAINT "customer_session_revoked_reason_valid";--> statement-breakpoint
ALTER TABLE "customer_email_change" ADD CONSTRAINT "customer_email_change_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_change_token_unique" ON "customer_email_change" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_change_live_unique" ON "customer_email_change" USING btree ("customer_id") WHERE "customer_email_change"."used_at" is null;--> statement-breakpoint
CREATE INDEX "customer_email_change_customer_idx" ON "customer_email_change" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "customer_session" ADD CONSTRAINT "customer_session_revoked_reason_valid" CHECK ("customer_session"."revoked_reason" is null or "customer_session"."revoked_reason" in ('logout', 'password_change', 'admin_revoke', 'reuse_detected', 'email_change'));
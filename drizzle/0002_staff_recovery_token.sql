CREATE TABLE "staff_recovery_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" bigint NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by_staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "staff_recovery_token_purpose_valid" CHECK ("purpose" in ('initial_credential', 'password_reset')),
	CONSTRAINT "staff_recovery_token_expires_after_created" CHECK ("staff_recovery_token"."expires_at" > "staff_recovery_token"."created_at")
);
--> statement-breakpoint
ALTER TABLE "staff_recovery_token" ADD CONSTRAINT "staff_recovery_token_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_recovery_token" ADD CONSTRAINT "staff_recovery_token_issued_by_staff_id_staff_user_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_recovery_token_hash_unique" ON "staff_recovery_token" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_recovery_token_live_unique" ON "staff_recovery_token" USING btree ("staff_user_id","purpose") WHERE "staff_recovery_token"."used_at" is null;--> statement-breakpoint
CREATE INDEX "staff_recovery_token_staff_idx" ON "staff_recovery_token" USING btree ("staff_user_id","created_at" DESC NULLS LAST);
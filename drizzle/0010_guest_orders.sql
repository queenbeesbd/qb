ALTER TABLE "idempotency_key" DROP CONSTRAINT "idempotency_key_principal_valid";--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_principal_valid" CHECK ("principal_kind" in ('customer', 'staff', 'guest'));
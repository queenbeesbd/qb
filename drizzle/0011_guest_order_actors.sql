ALTER TABLE "order_event" DROP CONSTRAINT "order_event_actor_valid";--> statement-breakpoint
ALTER TABLE "order_event" DROP CONSTRAINT "order_event_system_actor_has_no_actor";--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_actor_valid" CHECK ("actor_type" in ('customer', 'guest', 'staff', 'system'));--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_system_actor_has_no_actor" CHECK ("order_event"."actor_type" not in ('system', 'guest') or ("order_event"."actor_customer_id" is null and "order_event"."actor_staff_id" is null));
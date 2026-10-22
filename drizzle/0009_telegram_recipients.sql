CREATE TABLE "telegram_recipient" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "telegram_recipient_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"chat_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_recipient_chat_format" CHECK ("telegram_recipient"."chat_id" ~ '^-?[0-9]{5,20}$'),
	CONSTRAINT "telegram_recipient_label_len" CHECK (char_length(btrim("telegram_recipient"."label")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "telegram_recipient" ADD CONSTRAINT "telegram_recipient_created_by_staff_id_staff_user_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_recipient" ADD CONSTRAINT "telegram_recipient_updated_by_staff_id_staff_user_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_recipient_chat_unique" ON "telegram_recipient" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "telegram_recipient_active_idx" ON "telegram_recipient" USING btree ("is_active");
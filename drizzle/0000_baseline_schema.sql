CREATE TABLE "account_recovery_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" bigint NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip_hash" text,
	CONSTRAINT "account_recovery_token_purpose_valid" CHECK ("purpose" in ('password_reset', 'email_verify'))
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"scope" text NOT NULL,
	"subject_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	"blocked_until" timestamp with time zone,
	CONSTRAINT "auth_throttle_scope_subject_hash_window_start_pk" PRIMARY KEY("scope","subject_hash","window_start"),
	CONSTRAINT "auth_throttle_scope_valid" CHECK ("scope" in ('login', 'register', 'recovery', 'claim_submit')),
	CONSTRAINT "auth_throttle_attempts_non_negative" CHECK ("auth_throttle"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"phone" text,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customer_email_len" CHECK (char_length("email") <= 254),
	CONSTRAINT "customer_display_name_len" CHECK ("customer"."display_name" is null or char_length("customer"."display_name") <= 80),
	CONSTRAINT "customer_phone_format" CHECK ("customer"."phone" is null or "customer"."phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "customer_status_valid" CHECK ("status" in ('active', 'suspended', 'deleted')),
	CONSTRAINT "customer_deleted_implies_status" CHECK ("customer"."deleted_at" is null or "customer"."status" = 'deleted')
);
--> statement-breakpoint
CREATE TABLE "customer_credential" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_credential_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"secret_hash" text NOT NULL,
	"hash_algorithm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "customer_credential_kind_valid" CHECK ("kind" in ('password', 'passkey', 'oauth'))
);
--> statement-breakpoint
CREATE TABLE "customer_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"user_agent_hash" text,
	"ip_hash" text,
	CONSTRAINT "customer_session_absolute_after_created" CHECK ("customer_session"."absolute_expires_at" > "customer_session"."created_at"),
	CONSTRAINT "customer_session_idle_within_absolute" CHECK ("customer_session"."idle_expires_at" <= "customer_session"."absolute_expires_at"),
	CONSTRAINT "customer_session_revoked_reason_valid" CHECK ("customer_session"."revoked_reason" is null or "customer_session"."revoked_reason" in ('logout', 'password_change', 'admin_revoke', 'reuse_detected'))
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "permission_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"description" text,
	"is_privileged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "permission_code_format" CHECK ("permission"."code" ~ '^[a-z][a-z0-9_.]*$')
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_owner_level" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_code_format" CHECK ("role"."code" ~ '^[a-z][a-z0-9_.]*$')
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "staff_credential" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_credential_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"staff_user_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"secret_hash" text NOT NULL,
	"hash_algorithm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_credential_kind_valid" CHECK ("kind" in ('password', 'passkey', 'oauth'))
);
--> statement-breakpoint
CREATE TABLE "staff_role" (
	"staff_user_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"granted_by" bigint NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_role_staff_user_id_role_id_pk" PRIMARY KEY("staff_user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "staff_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"user_agent_hash" text,
	"ip_hash" text,
	CONSTRAINT "staff_session_absolute_after_created" CHECK ("staff_session"."absolute_expires_at" > "staff_session"."created_at"),
	CONSTRAINT "staff_session_idle_within_absolute" CHECK ("staff_session"."idle_expires_at" <= "staff_session"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "staff_user_status_valid" CHECK ("status" in ('active', 'disabled')),
	CONSTRAINT "staff_user_disabled_consistent" CHECK ("staff_user"."disabled_at" is null or "staff_user"."status" = 'disabled')
);
--> statement-breakpoint
CREATE TABLE "brand" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brand_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "brand_slug_format" CHECK ("brand"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "brand_name_bn_len" CHECK (char_length("brand"."name_bn") between 1 and 80),
	CONSTRAINT "brand_name_en_len" CHECK (char_length("brand"."name_en") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"parent_id" bigint,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"description_bn" text,
	"description_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "category_slug_format" CHECK ("category"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "category_name_bn_len" CHECK (char_length("category"."name_bn") between 1 and 80),
	CONSTRAINT "category_name_en_len" CHECK (char_length("category"."name_en") between 1 and 80),
	CONSTRAINT "category_not_own_parent" CHECK ("category"."parent_id" is null or "category"."parent_id" <> "category"."id"),
	CONSTRAINT "category_sort_order_non_negative" CHECK ("category"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"title_bn" text NOT NULL,
	"title_en" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_code_format" CHECK ("collection"."code" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "collection_item" (
	"collection_id" bigint NOT NULL,
	"product_variant_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_item_collection_id_product_variant_id_pk" PRIMARY KEY("collection_id","product_variant_id"),
	CONSTRAINT "collection_item_position_non_negative" CHECK ("collection_item"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "import_record" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_record_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"source_system" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text,
	"source_asset_url" text,
	"retrieved_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_run_id" uuid,
	CONSTRAINT "import_record_entity_type_valid" CHECK ("entity_type" in ('product', 'brand', 'category', 'product_image'))
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"brand_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"description_bn" text,
	"description_en" text,
	"pack_size" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "product_slug_format" CHECK ("product"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "product_name_bn_len" CHECK (char_length("product"."name_bn") between 1 and 200),
	CONSTRAINT "product_name_en_len" CHECK (char_length("product"."name_en") between 1 and 200),
	CONSTRAINT "product_published_needs_timestamp" CHECK ("product"."is_published" = false or "product"."published_at" is not null),
	CONSTRAINT "product_deleted_not_published" CHECK ("product"."deleted_at" is null or "product"."is_published" = false)
);
--> statement-breakpoint
CREATE TABLE "product_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" bigint NOT NULL,
	"base_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"alt_bn" text,
	"alt_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"rights_status" text DEFAULT 'unknown' NOT NULL,
	"rights_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" bigint,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "product_image_rights_status_valid" CHECK ("rights_status" in ('unknown', 'pending_confirmation', 'cleared', 'restricted')),
	CONSTRAINT "product_image_byte_size_positive" CHECK ("product_image"."byte_size" > 0),
	CONSTRAINT "product_image_dimensions_positive" CHECK ("product_image"."width" > 0 and "product_image"."height" > 0),
	CONSTRAINT "product_image_sort_order_non_negative" CHECK ("product_image"."sort_order" >= 0),
	CONSTRAINT "product_image_cleared_needs_note" CHECK ("product_image"."rights_status" <> 'cleared' or "product_image"."rights_note" is not null)
);
--> statement-breakpoint
CREATE TABLE "product_image_derivative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_image_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"format" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_image_derivative_format_valid" CHECK ("format" in ('webp', 'jpeg')),
	CONSTRAINT "product_image_derivative_byte_size_positive" CHECK ("product_image_derivative"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_variant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"sku" text NOT NULL,
	"option_values" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"label_bn" text,
	"label_en" text,
	"price_minor" integer NOT NULL,
	"compare_at_price_minor" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variant_sku_len" CHECK (char_length("sku") <= 64),
	CONSTRAINT "product_variant_price_non_negative" CHECK ("product_variant"."price_minor" >= 0),
	CONSTRAINT "product_variant_compare_at_strictly_greater" CHECK ("product_variant"."compare_at_price_minor" is null or "product_variant"."compare_at_price_minor" > "product_variant"."price_minor")
);
--> statement-breakpoint
CREATE TABLE "inventory_balance" (
	"variant_id" bigint PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balance_on_hand_non_negative" CHECK ("inventory_balance"."on_hand" >= 0),
	CONSTRAINT "inventory_balance_reserved_non_negative" CHECK ("inventory_balance"."reserved" >= 0),
	CONSTRAINT "inventory_balance_reserved_within_on_hand" CHECK ("inventory_balance"."reserved" <= "inventory_balance"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_movement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"movement_key" text NOT NULL,
	"variant_id" bigint NOT NULL,
	"delta_on_hand" integer DEFAULT 0 NOT NULL,
	"delta_reserved" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"order_id" bigint,
	"order_item_id" bigint,
	"reservation_id" bigint,
	"customer_return_id" bigint,
	"actor_staff_id" bigint,
	"note" text,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movement_reason_valid" CHECK ("reason" in ('stock_received', 'stock_adjustment', 'order_reserved', 'reservation_released', 'order_consumed', 'return_restocked', 'return_written_off')),
	CONSTRAINT "inventory_movement_changes_something" CHECK ("inventory_movement"."delta_on_hand" <> 0 or "inventory_movement"."delta_reserved" <> 0),
	CONSTRAINT "inventory_movement_adjustment_needs_actor_and_note" CHECK ("inventory_movement"."reason" <> 'stock_adjustment' or ("inventory_movement"."actor_staff_id" is not null and "inventory_movement"."note" is not null)),
	CONSTRAINT "inventory_movement_on_hand_after_non_negative" CHECK ("inventory_movement"."on_hand_after" >= 0),
	CONSTRAINT "inventory_movement_reserved_after_non_negative" CHECK ("inventory_movement"."reserved_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_reservation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"order_item_id" bigint NOT NULL,
	"variant_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"release_reason" text,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "stock_reservation_state_valid" CHECK ("state" in ('held', 'consumed', 'released')),
	CONSTRAINT "stock_reservation_quantity_positive" CHECK ("stock_reservation"."quantity" > 0),
	CONSTRAINT "stock_reservation_resolved_matches_state" CHECK (("stock_reservation"."state" = 'held') = ("stock_reservation"."resolved_at" is null)),
	CONSTRAINT "stock_reservation_released_has_reason" CHECK ("stock_reservation"."state" <> 'released' or "stock_reservation"."release_reason" is not null),
	CONSTRAINT "stock_reservation_consumed_has_timestamp" CHECK ("stock_reservation"."state" <> 'consumed' or "stock_reservation"."consumed_at" is not null),
	CONSTRAINT "stock_reservation_held_only_live_expiry" CHECK ("stock_reservation"."state" = 'held' or "stock_reservation"."expires_at" is null),
	CONSTRAINT "stock_reservation_release_reason_valid" CHECK ("stock_reservation"."release_reason" is null or "stock_reservation"."release_reason" in ('expired_unpaid', 'cancelled_by_support', 'preempted_by_claim', 'confirmed_false_claim', 'order_abandoned'))
);
--> statement-breakpoint
CREATE TABLE "cancellation_request" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cancellation_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"requested_by_customer_id" bigint,
	"recorded_by_staff_id" bigint,
	"reason" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_staff_id" bigint,
	"decision_reason" text,
	"converted_return_id" bigint,
	CONSTRAINT "cancellation_request_state_valid" CHECK ("state" in ('open', 'approved', 'rejected', 'withdrawn', 'converted_to_return')),
	CONSTRAINT "cancellation_request_reason_len" CHECK (char_length("cancellation_request"."reason") between 3 and 300),
	CONSTRAINT "cancellation_request_has_origin" CHECK ("cancellation_request"."requested_by_customer_id" is not null or "cancellation_request"."recorded_by_staff_id" is not null),
	CONSTRAINT "cancellation_request_decided_consistent" CHECK ("cancellation_request"."state" in ('open', 'withdrawn') or ("cancellation_request"."decided_at" is not null and "cancellation_request"."decided_by_staff_id" is not null)),
	CONSTRAINT "cancellation_request_rejection_has_reason" CHECK ("cancellation_request"."state" <> 'rejected' or "cancellation_request"."decision_reason" is not null),
	CONSTRAINT "cancellation_request_conversion_links_return" CHECK ("cancellation_request"."state" <> 'converted_to_return' or "cancellation_request"."converted_return_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "customer_return" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_return_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"order_item_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"inspected_by_staff_id" bigint,
	"inspection_note" text,
	"restock_movement_id" bigint,
	CONSTRAINT "customer_return_state_valid" CHECK ("state" in ('requested', 'approved', 'in_transit', 'received', 'inspected_accepted', 'inspected_rejected', 'closed')),
	CONSTRAINT "customer_return_reason_valid" CHECK ("reason" in ('refused_on_delivery', 'failed_delivery', 'customer_return', 'damaged_in_transit', 'wrong_item')),
	CONSTRAINT "customer_return_quantity_positive" CHECK ("customer_return"."quantity" > 0),
	CONSTRAINT "customer_return_inspection_has_actor" CHECK ("customer_return"."state" not in ('inspected_accepted', 'inspected_rejected', 'closed') or ("customer_return"."inspected_at" is not null and "customer_return"."inspected_by_staff_id" is not null)),
	CONSTRAINT "customer_return_rejection_has_note" CHECK ("customer_return"."state" <> 'inspected_rejected' or "customer_return"."inspection_note" is not null),
	CONSTRAINT "customer_return_restock_requires_acceptance" CHECK ("customer_return"."restock_movement_id" is null or "customer_return"."state" = 'inspected_accepted')
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_number" text NOT NULL,
	"customer_id" bigint NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_state" text NOT NULL,
	"cod_state" text DEFAULT 'not_applicable' NOT NULL,
	"items_subtotal_minor" integer NOT NULL,
	"shipping_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"expired_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_currency_bdt" CHECK ("order"."currency" = 'BDT'),
	CONSTRAINT "order_payment_method_valid" CHECK ("payment_method" in ('bkash', 'nagad', 'cod')),
	CONSTRAINT "order_status_valid" CHECK ("status" in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned')),
	CONSTRAINT "order_payment_state_valid" CHECK ("payment_state" in ('awaiting_payment', 'awaiting_verification', 'verified', 'rejected', 'falsely_claimed', 'expired', 'not_applicable')),
	CONSTRAINT "order_cod_state_valid" CHECK ("cod_state" in ('not_applicable', 'cod_pending_approval', 'cod_approved', 'cod_collected', 'cod_failed', 'cod_reconciled')),
	CONSTRAINT "order_amounts_non_negative" CHECK ("order"."items_subtotal_minor" >= 0 and "order"."shipping_minor" >= 0),
	CONSTRAINT "order_total_is_sum" CHECK ("order"."total_minor" = "order"."items_subtotal_minor" + "order"."shipping_minor"),
	CONSTRAINT "order_cod_payment_state_consistent" CHECK (("order"."payment_method" = 'cod') = ("order"."payment_state" = 'not_applicable')),
	CONSTRAINT "order_cod_state_only_for_cod" CHECK (("order"."payment_method" = 'cod') = ("order"."cod_state" <> 'not_applicable')),
	CONSTRAINT "order_cancelled_has_reason" CHECK ("order"."cancelled_at" is null or "order"."cancelled_reason" is not null),
	CONSTRAINT "order_expiry_is_24_hours" CHECK ("order"."expires_at" is null or "order"."expires_at" = "order"."placed_at" + interval '24 hours'),
	CONSTRAINT "order_expired_has_timestamp" CHECK ("order"."payment_state" <> 'expired' or "order"."expired_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_contact" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_line" text NOT NULL,
	"area" text NOT NULL,
	"city" text NOT NULL,
	"postcode" text,
	"delivery_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_contact_name_len" CHECK (char_length("order_contact"."recipient_name") between 2 and 120),
	CONSTRAINT "order_contact_phone_format" CHECK ("order_contact"."recipient_phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "order_contact_address_len" CHECK (char_length("order_contact"."address_line") between 5 and 300),
	CONSTRAINT "order_contact_area_len" CHECK (char_length("order_contact"."area") <= 80),
	CONSTRAINT "order_contact_city_len" CHECK (char_length("order_contact"."city") <= 80),
	CONSTRAINT "order_contact_note_len" CHECK ("order_contact"."delivery_note" is null or char_length("order_contact"."delivery_note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "order_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_key" text,
	"order_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_type" text NOT NULL,
	"actor_customer_id" bigint,
	"actor_staff_id" bigint,
	"reason" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_event_type_valid" CHECK ("event_type" in ('order_placed', 'claim_submitted', 'claim_withdrawn', 'payment_verified', 'payment_rejected', 'payment_falsely_claimed', 'order_confirmed', 'order_processing', 'order_shipped', 'order_delivered', 'order_completed', 'order_cancelled', 'order_expired', 'reservation_held', 'reservation_released', 'reservation_consumed', 'cod_approved', 'cod_collected', 'cod_failed', 'cod_reconciled', 'cancellation_requested', 'cancellation_decided', 'return_requested', 'return_received', 'return_inspected', 'refund_requested', 'refund_processing', 'refund_completed', 'refund_failed')),
	CONSTRAINT "order_event_actor_valid" CHECK ("actor_type" in ('customer', 'staff', 'system')),
	CONSTRAINT "order_event_customer_actor_consistent" CHECK (("order_event"."actor_type" = 'customer') = ("order_event"."actor_customer_id" is not null)),
	CONSTRAINT "order_event_staff_actor_consistent" CHECK (("order_event"."actor_type" = 'staff') = ("order_event"."actor_staff_id" is not null)),
	CONSTRAINT "order_event_system_actor_has_no_actor" CHECK ("order_event"."actor_type" <> 'system' or ("order_event"."actor_customer_id" is null and "order_event"."actor_staff_id" is null))
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"variant_id" bigint NOT NULL,
	"product_name_bn" text NOT NULL,
	"product_name_en" text NOT NULL,
	"variant_label" text,
	"sku" text NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"compare_at_price_minor" integer,
	"quantity" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"image_key_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_unit_price_non_negative" CHECK ("order_item"."unit_price_minor" >= 0),
	CONSTRAINT "order_item_quantity_positive" CHECK ("order_item"."quantity" > 0),
	CONSTRAINT "order_item_line_total_matches" CHECK ("order_item"."line_total_minor" = "order_item"."unit_price_minor" * "order_item"."quantity"),
	CONSTRAINT "order_item_compare_at_strictly_greater" CHECK ("order_item"."compare_at_price_minor" is null or "order_item"."compare_at_price_minor" > "order_item"."unit_price_minor")
);
--> statement-breakpoint
CREATE TABLE "payment_claim" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_claim_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"payment_recipient_id" bigint NOT NULL,
	"sender_msisdn" text NOT NULL,
	"transaction_reference" text NOT NULL,
	"claimed_amount_minor" integer NOT NULL,
	"state" text DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_customer_id" bigint,
	"recorded_by_staff_id" bigint,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" bigint,
	"resolution_reason" text,
	"verified_amount_minor" integer,
	"mismatch_acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_claim_state_valid" CHECK ("state" in ('submitted', 'verified', 'rejected', 'falsely_claimed', 'withdrawn')),
	CONSTRAINT "payment_claim_sender_format" CHECK ("payment_claim"."sender_msisdn" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "payment_claim_reference_len" CHECK (char_length("payment_claim"."transaction_reference") between 6 and 64),
	CONSTRAINT "payment_claim_amount_positive" CHECK ("payment_claim"."claimed_amount_minor" > 0),
	CONSTRAINT "payment_claim_verified_needs_actor_and_amount" CHECK ("payment_claim"."state" <> 'verified' or ("payment_claim"."resolved_at" is not null and "payment_claim"."resolved_by_staff_id" is not null and "payment_claim"."verified_amount_minor" is not null)),
	CONSTRAINT "payment_claim_adverse_decision_needs_actor_and_reason" CHECK ("payment_claim"."state" not in ('rejected', 'falsely_claimed') or ("payment_claim"."resolved_at" is not null and "payment_claim"."resolved_by_staff_id" is not null and "payment_claim"."resolution_reason" is not null and char_length("payment_claim"."resolution_reason") >= 10)),
	CONSTRAINT "payment_claim_withdrawn_is_not_resolved" CHECK ("payment_claim"."state" <> 'withdrawn' or "payment_claim"."resolved_at" is null),
	CONSTRAINT "payment_claim_has_origin" CHECK ("payment_claim"."submitted_by_customer_id" is not null or "payment_claim"."recorded_by_staff_id" is not null),
	CONSTRAINT "payment_claim_mismatch_ack_requires_verified_amount" CHECK ("payment_claim"."mismatch_acknowledged" = false or "payment_claim"."verified_amount_minor" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_recipient" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_recipient_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"method" text NOT NULL,
	"account_number" text NOT NULL,
	"account_label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "payment_recipient_method_is_mfs" CHECK ("payment_recipient"."method" in ('bkash', 'nagad')),
	CONSTRAINT "payment_recipient_account_format" CHECK ("payment_recipient"."account_number" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "payment_recipient_deactivated_consistent" CHECK ("payment_recipient"."deactivated_at" is null or "payment_recipient"."is_active" = false)
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refund_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"amount_minor" integer NOT NULL,
	"method" text NOT NULL,
	"destination_note" text,
	"state" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"requested_by_customer_id" bigint,
	"recorded_by_staff_id" bigint,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" bigint,
	"evidence_note" text,
	"external_reference" text,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "refund_state_valid" CHECK ("state" in ('requested', 'processing', 'completed', 'failed')),
	CONSTRAINT "refund_method_valid" CHECK ("method" in ('bkash', 'nagad', 'cash', 'other')),
	CONSTRAINT "refund_amount_positive" CHECK ("refund"."amount_minor" > 0),
	CONSTRAINT "refund_reason_len" CHECK (char_length("refund"."reason") >= 3),
	CONSTRAINT "refund_has_origin" CHECK ("refund"."requested_by_customer_id" is not null or "refund"."recorded_by_staff_id" is not null),
	CONSTRAINT "refund_completed_requires_evidence" CHECK ("refund"."state" <> 'completed' or ("refund"."completed_at" is not null and "refund"."completed_by_staff_id" is not null and "refund"."evidence_note" is not null and char_length("refund"."evidence_note") >= 5)),
	CONSTRAINT "refund_failed_requires_reason" CHECK ("refund"."state" <> 'failed' or ("refund"."failed_at" is not null and "refund"."failure_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_staff_id" bigint,
	"actor_role_codes" text[] NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"request_id" text,
	"ip_hash" text,
	CONSTRAINT "audit_event_actor_type_valid" CHECK ("actor_type" in ('staff', 'system')),
	CONSTRAINT "audit_event_staff_actor_consistent" CHECK (("audit_event"."actor_type" = 'staff') = ("audit_event"."actor_staff_id" is not null)),
	CONSTRAINT "audit_event_action_not_empty" CHECK ("audit_event"."action" <> '')
);
--> statement-breakpoint
CREATE TABLE "customer_flag" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_flag_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"order_id" bigint,
	"payment_claim_id" bigint,
	"type" text DEFAULT 'review' NOT NULL,
	"state" text DEFAULT 'raised' NOT NULL,
	"reason" text NOT NULL,
	"raised_by_staff_id" bigint NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_by_staff_id" bigint,
	"cleared_at" timestamp with time zone,
	"clear_reason" text,
	CONSTRAINT "customer_flag_type_valid" CHECK ("type" in ('review')),
	CONSTRAINT "customer_flag_state_valid" CHECK ("state" in ('raised', 'cleared')),
	CONSTRAINT "customer_flag_reason_len" CHECK (char_length("customer_flag"."reason") >= 10),
	CONSTRAINT "customer_flag_cleared_consistent" CHECK ("customer_flag"."state" <> 'cleared' or ("customer_flag"."cleared_by_staff_id" is not null and "customer_flag"."cleared_at" is not null and "customer_flag"."clear_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "customer_notification" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_notification_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"order_id" bigint,
	"event_key" text NOT NULL,
	"title_key" text NOT NULL,
	"params" jsonb,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "customer_notification_channel_valid" CHECK ("channel" in ('in_app', 'email', 'sms')),
	CONSTRAINT "customer_notification_state_valid" CHECK ("state" in ('pending', 'sent', 'failed', 'not_attempted'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"principal_kind" text NOT NULL,
	"principal_id" bigint NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_key_scope_key_pk" PRIMARY KEY("scope","key"),
	CONSTRAINT "idempotency_key_scope_valid" CHECK ("scope" in ('order_create', 'claim_submit', 'refund_request', 'cod_approve')),
	CONSTRAINT "idempotency_key_principal_valid" CHECK ("principal_kind" in ('customer', 'staff')),
	CONSTRAINT "idempotency_key_key_len" CHECK (char_length("idempotency_key"."key") between 16 and 128),
	CONSTRAINT "idempotency_key_expires_after_created" CHECK ("idempotency_key"."expires_at" > "idempotency_key"."created_at")
);
--> statement-breakpoint
CREATE TABLE "operational_exception" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operational_exception_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"order_id" bigint,
	"subject_key" text NOT NULL,
	"severity" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by_staff_id" bigint,
	"acknowledged_at" timestamp with time zone,
	"resolved_by_staff_id" bigint,
	"resolved_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "operational_exception_type_valid" CHECK ("type" in ('verification_overdue', 'payment_mismatch', 'duplicate_reference', 'reservation_conflict', 'unreconciled_collection', 'storage_orphan', 'expired_unpaid', 'refund_stalled')),
	CONSTRAINT "operational_exception_severity_valid" CHECK ("severity" in ('info', 'warning', 'critical')),
	CONSTRAINT "operational_exception_state_valid" CHECK ("state" in ('open', 'acknowledged', 'resolved', 'dismissed')),
	CONSTRAINT "operational_exception_closed_needs_actor_and_note" CHECK ("operational_exception"."state" not in ('resolved', 'dismissed') or ("operational_exception"."resolved_at" is not null and "operational_exception"."note" is not null))
);
--> statement-breakpoint
CREATE TABLE "store_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" bigint NOT NULL,
	CONSTRAINT "store_setting_key_format" CHECK ("store_setting"."key" ~ '^[a-z][a-z0-9_.]*$'),
	CONSTRAINT "store_setting_value_type_valid" CHECK ("value_type" in ('money_minor', 'integer', 'text', 'boolean'))
);
--> statement-breakpoint
ALTER TABLE "account_recovery_token" ADD CONSTRAINT "account_recovery_token_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credential" ADD CONSTRAINT "customer_credential_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_session" ADD CONSTRAINT "customer_session_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_credential" ADD CONSTRAINT "staff_credential_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_granted_by_staff_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_uploaded_by_staff_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image_derivative" ADD CONSTRAINT "product_image_derivative_product_image_id_product_image_id_fk" FOREIGN KEY ("product_image_id") REFERENCES "public"."product_image"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_reservation_id_stock_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_customer_return_id_customer_return_id_fk" FOREIGN KEY ("customer_return_id") REFERENCES "public"."customer_return"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_actor_staff_id_staff_user_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_request" ADD CONSTRAINT "cancellation_request_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_request" ADD CONSTRAINT "cancellation_request_requested_by_customer_id_customer_id_fk" FOREIGN KEY ("requested_by_customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_request" ADD CONSTRAINT "cancellation_request_recorded_by_staff_id_staff_user_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_request" ADD CONSTRAINT "cancellation_request_decided_by_staff_id_staff_user_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_request" ADD CONSTRAINT "cancellation_request_converted_return_id_customer_return_id_fk" FOREIGN KEY ("converted_return_id") REFERENCES "public"."customer_return"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_inspected_by_staff_id_staff_user_id_fk" FOREIGN KEY ("inspected_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_restock_movement_id_inventory_movement_id_fk" FOREIGN KEY ("restock_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_contact" ADD CONSTRAINT "order_contact_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_actor_customer_id_customer_id_fk" FOREIGN KEY ("actor_customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_actor_staff_id_staff_user_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_payment_recipient_id_payment_recipient_id_fk" FOREIGN KEY ("payment_recipient_id") REFERENCES "public"."payment_recipient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_submitted_by_customer_id_customer_id_fk" FOREIGN KEY ("submitted_by_customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_recorded_by_staff_id_staff_user_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_resolved_by_staff_id_staff_user_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_recipient" ADD CONSTRAINT "payment_recipient_created_by_staff_id_staff_user_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_requested_by_customer_id_customer_id_fk" FOREIGN KEY ("requested_by_customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_recorded_by_staff_id_staff_user_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_completed_by_staff_id_staff_user_id_fk" FOREIGN KEY ("completed_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_staff_id_staff_user_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flag" ADD CONSTRAINT "customer_flag_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flag" ADD CONSTRAINT "customer_flag_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flag" ADD CONSTRAINT "customer_flag_payment_claim_id_payment_claim_id_fk" FOREIGN KEY ("payment_claim_id") REFERENCES "public"."payment_claim"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flag" ADD CONSTRAINT "customer_flag_raised_by_staff_id_staff_user_id_fk" FOREIGN KEY ("raised_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flag" ADD CONSTRAINT "customer_flag_cleared_by_staff_id_staff_user_id_fk" FOREIGN KEY ("cleared_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_exception" ADD CONSTRAINT "operational_exception_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_exception" ADD CONSTRAINT "operational_exception_acknowledged_by_staff_id_staff_user_id_fk" FOREIGN KEY ("acknowledged_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_exception" ADD CONSTRAINT "operational_exception_resolved_by_staff_id_staff_user_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_setting" ADD CONSTRAINT "store_setting_updated_by_staff_id_staff_user_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_recovery_token_hash_unique" ON "account_recovery_token" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "account_recovery_token_live_unique" ON "account_recovery_token" USING btree ("customer_id","purpose") WHERE "account_recovery_token"."used_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_lower_unique" ON "customer" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "customer_status_created_idx" ON "customer" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customer_not_deleted_idx" ON "customer" USING btree ("id") WHERE "customer"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_credential_active_unique" ON "customer_credential" USING btree ("customer_id","kind") WHERE "customer_credential"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_session_token_unique" ON "customer_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_session_customer_idx" ON "customer_session" USING btree ("customer_id","absolute_expires_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customer_session_live_idx" ON "customer_session" USING btree ("idle_expires_at") WHERE "customer_session"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_code_unique" ON "permission" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_code_unique" ON "role" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_credential_active_unique" ON "staff_credential" USING btree ("staff_user_id","kind") WHERE "staff_credential"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_session_token_unique" ON "staff_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_session_staff_idx" ON "staff_session" USING btree ("staff_user_id","absolute_expires_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_email_lower_unique" ON "staff_user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "brand_slug_unique" ON "brand" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "brand_active_name_idx" ON "brand" USING btree ("is_active","name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "category_slug_unique" ON "category" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_visible_sort_idx" ON "category" USING btree ("is_visible","sort_order");--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_code_unique" ON "collection" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_item_position_unique" ON "collection_item" USING btree ("collection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "import_record_idempotency_unique" ON "import_record" USING btree ("entity_type","source_system","source_id");--> statement-breakpoint
CREATE INDEX "import_record_entity_idx" ON "import_record" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "import_record_run_idx" ON "import_record" USING btree ("import_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_slug_unique" ON "product" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_category_published_idx" ON "product" USING btree ("category_id","is_published","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "product_brand_published_idx" ON "product" USING btree ("brand_id","is_published");--> statement-breakpoint
CREATE INDEX "product_live_idx" ON "product" USING btree ("is_published","updated_at" DESC NULLS LAST) WHERE "product"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_image_base_key_unique" ON "product_image" USING btree ("base_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_image_primary_unique" ON "product_image" USING btree ("product_id") WHERE "product_image"."is_primary" and "product_image"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "product_image_product_sort_idx" ON "product_image" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_image_derivative_storage_key_unique" ON "product_image_derivative" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_image_derivative_variant_unique" ON "product_image_derivative" USING btree ("product_image_id","width","format");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_sku_unique" ON "product_variant" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_default_unique" ON "product_variant" USING btree ("product_id") WHERE "product_variant"."is_default";--> statement-breakpoint
CREATE INDEX "product_variant_product_active_idx" ON "product_variant" USING btree ("product_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movement_key_unique" ON "inventory_movement" USING btree ("movement_key");--> statement-breakpoint
CREATE INDEX "inventory_movement_variant_idx" ON "inventory_movement" USING btree ("variant_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movement_order_idx" ON "inventory_movement" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_movement_reservation_idx" ON "inventory_movement" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_reservation_live_unique" ON "stock_reservation" USING btree ("order_item_id") WHERE "stock_reservation"."state" = 'held';--> statement-breakpoint
CREATE INDEX "stock_reservation_held_variant_idx" ON "stock_reservation" USING btree ("variant_id") WHERE "stock_reservation"."state" = 'held';--> statement-breakpoint
CREATE INDEX "stock_reservation_expiry_idx" ON "stock_reservation" USING btree ("expires_at") WHERE "stock_reservation"."state" = 'held' and "stock_reservation"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "stock_reservation_order_idx" ON "stock_reservation" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_request_open_unique" ON "cancellation_request" USING btree ("order_id") WHERE "cancellation_request"."state" = 'open';--> statement-breakpoint
CREATE INDEX "cancellation_request_order_idx" ON "cancellation_request" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_return_live_unique" ON "customer_return" USING btree ("order_item_id") WHERE "customer_return"."state" not in ('closed', 'inspected_rejected');--> statement-breakpoint
CREATE INDEX "customer_return_order_idx" ON "customer_return" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_number_unique" ON "order" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "order" USING btree ("customer_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_verification_queue_idx" ON "order" USING btree ("payment_state","placed_at") WHERE "order"."payment_state" = 'awaiting_verification';--> statement-breakpoint
CREATE INDEX "order_cod_queue_idx" ON "order" USING btree ("cod_state","placed_at") WHERE "order"."cod_state" = 'cod_pending_approval';--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "order" USING btree ("status","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_expiry_sweep_idx" ON "order" USING btree ("expires_at") WHERE "order"."expires_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_event_key_unique" ON "order_event" USING btree ("event_key") WHERE "order_event"."event_key" is not null;--> statement-breakpoint
CREATE INDEX "order_event_order_idx" ON "order_event" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "order_event_type_idx" ON "order_event" USING btree ("event_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_variant_idx" ON "order_item" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_claim_active_unique" ON "payment_claim" USING btree ("order_id") WHERE "payment_claim"."state" = 'submitted';--> statement-breakpoint
CREATE INDEX "payment_claim_queue_idx" ON "payment_claim" USING btree ("state","submitted_at");--> statement-breakpoint
CREATE INDEX "payment_claim_reference_idx" ON "payment_claim" USING btree ("transaction_reference");--> statement-breakpoint
CREATE INDEX "payment_claim_sender_idx" ON "payment_claim" USING btree ("sender_msisdn");--> statement-breakpoint
CREATE INDEX "payment_claim_recipient_idx" ON "payment_claim" USING btree ("payment_recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_recipient_active_unique" ON "payment_recipient" USING btree ("method") WHERE "payment_recipient"."is_active";--> statement-breakpoint
CREATE INDEX "refund_order_idx" ON "refund" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_queue_idx" ON "refund" USING btree ("state","requested_at") WHERE "refund"."state" in ('requested', 'processing');--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" USING btree ("actor_staff_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_action_idx" ON "audit_event" USING btree ("action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_occurred_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_flag_live_unique" ON "customer_flag" USING btree ("customer_id") WHERE "customer_flag"."state" = 'raised';--> statement-breakpoint
CREATE INDEX "customer_flag_customer_idx" ON "customer_flag" USING btree ("customer_id","raised_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_notification_event_unique" ON "customer_notification" USING btree ("customer_id","event_key","order_id");--> statement-breakpoint
CREATE INDEX "customer_notification_unread_idx" ON "customer_notification" USING btree ("customer_id","created_at" DESC NULLS LAST) WHERE "customer_notification"."read_at" is null;--> statement-breakpoint
CREATE INDEX "idempotency_key_expiry_idx" ON "idempotency_key" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_exception_live_unique" ON "operational_exception" USING btree ("type","subject_key") WHERE "operational_exception"."state" in ('open', 'acknowledged');--> statement-breakpoint
CREATE INDEX "operational_exception_queue_idx" ON "operational_exception" USING btree ("state","severity","opened_at");
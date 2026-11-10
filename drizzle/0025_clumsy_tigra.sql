ALTER TABLE "product_review" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "product_review" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "product_review" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_image_complete" CHECK (("product_review"."image_key" is null and "product_review"."image_width" is null and "product_review"."image_height" is null)
          or ("product_review"."image_key" is not null and "product_review"."image_width" is not null and "product_review"."image_height" is not null));--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_image_key_format" CHECK ("product_review"."image_key" is null or ("product_review"."image_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("product_review"."image_key") <= 120));--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_image_dimensions_positive" CHECK ("product_review"."image_width" is null or ("product_review"."image_width" > 0 and "product_review"."image_height" > 0));--> statement-breakpoint

-- The photograph is part of what was written, so it is frozen with the words (ADR 0035): a customer
-- cannot swap the picture under an approved review, and the owner cannot. Replaces the 0024 function.
CREATE OR REPLACE FUNCTION queenbees_guard_review_immutable_body() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.rating_halves IS DISTINCT FROM OLD.rating_halves
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.image_key IS DISTINCT FROM OLD.image_key
     OR NEW.image_width IS DISTINCT FROM OLD.image_width
     OR NEW.image_height IS DISTINCT FROM OLD.image_height
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a review''s author, purchase, stars, words and photo are immutable after insert'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state AND OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'illegal product_review transition: % -> %', OLD.state, NEW.state
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

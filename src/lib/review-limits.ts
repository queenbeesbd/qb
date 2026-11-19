/**
 * The review bounds, in one place.
 *
 * The customer's form, the admin composer and `src/server/reviews/service.ts` all enforce the same two
 * numbers, and the two forms share them from here so a counter cannot promise room the save refuses.
 * The service re-exports `REVIEW_BODY_MIN`/`REVIEW_BODY_MAX` from this module, which is what keeps the
 * database check (`product_review_body_len`) and the interface in step.
 */

/** Shortest review the shop stores. Bounded in the table as well (`product_review_body_len`). */
export const REVIEW_BODY_MIN = 10;

/** Longest review the shop stores: a paragraph, not an essay. */
export const REVIEW_BODY_MAX = 1000;

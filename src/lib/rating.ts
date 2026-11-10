/**
 * Ratings, as the shop stores and draws them (ADR 0035).
 *
 * A rating is an **integer count of half stars**: 2 is one star, 9 is four and a half, 10 is five.
 * Integers for the same reason money is integer poisha - `4.5` has no exact binary representation, and
 * a stored rating that drifts by a rounding step is a wrong figure on a product card.
 *
 * Nothing here computes an average. The stars a product draws are the owner's own field
 * (`product.rating_halves`); a customer's stars travel with their review and are never summed.
 *
 * This module is client-safe: no database, no environment, no Node built-ins.
 */

/** The most a rating can be: five stars. */
export const MAX_RATING_HALVES = 10;

/** The least a rating can be: one star. */
export const MIN_RATING_HALVES = 2;

/**
 * Every rating the product editor offers, in halves, lowest first: 1, 1.5, 2, ... 5.
 *
 * Every half step, because the owner asked for 4.5 by name. A customer's review is the whole-star
 * choice instead: five stars, no halves, because the point of a review is the sentence.
 */
export const RATING_CHOICES: readonly number[] = Array.from(
  { length: MAX_RATING_HALVES - MIN_RATING_HALVES + 1 },
  (_, index) => MIN_RATING_HALVES + index,
);

/**
 * Parses what the owner typed or picked into halves.
 *
 * Accepts `4`, `4.5`, `"4"`, `"4.5"` and `"4.0"`, and refuses anything off the half-step grid, out of
 * range, formatted (`4,5`), or not a number - the same rule `parsePoisha` applies to money: a value
 * that is not exactly what the form offers is a refusal, never a rounded guess.
 */
export function parseRatingHalves(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return halfStepOrNull(input);
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!/^\d(\.\d)?$/.test(text)) return null;
  return halfStepOrNull(Number(text));
}

function halfStepOrNull(stars: number): number | null {
  const halves = stars * 2;
  if (!Number.isInteger(halves)) return null;
  if (halves < MIN_RATING_HALVES || halves > MAX_RATING_HALVES) return null;
  return halves;
}

/**
 * The rating as it is printed: `"4.5"`, `"5"`, `"1"`.
 *
 * Whole stars print without a trailing `.0` because the value is exact, and `"5"` reads as five stars
 * while `"5.0"` reads as a measured average - which this is not.
 */
export function formatRating(halves: number): string {
  const stars = halves / 2;
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

/** A star in the drawn row: `full`, `half`, or empty. */
export type StarFill = 'full' | 'half' | 'empty';

/**
 * The five slots a rating fills, for the drawing component.
 *
 * `9` halves draws four full stars and one half; `2` draws one full star and four empty. The empty
 * slots are why a card can show a four-star product honestly instead of drawing four stars and
 * leaving the reader to assume the scale.
 */
export function starFills(halves: number): readonly StarFill[] {
  return Array.from({ length: MAX_RATING_HALVES / 2 }, (_, index) => {
    const filled = halves - index * 2;
    if (filled >= 2) return 'full';
    if (filled === 1) return 'half';
    return 'empty';
  });
}

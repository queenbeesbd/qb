/**
 * The shape the header's suggestion route answers with (ADR 0041).
 *
 * It lives in a plain module because both sides need it: the route handler builds these rows and the
 * `'use client'` header consumes them. Nothing here is a server import, so the type can cross the
 * boundary without dragging a database module into the browser bundle.
 *
 * A row carries **only what it draws**. No quantity, discount, review, expiry or sold count is part of
 * it: the popup states the product's name, price, any genuine saving and its stock state, and the
 * product page it opens is the place that states everything else.
 */

import type { Availability, CatalogImage } from './types';

/**
 * How many rows the popup shows: one screenful on a phone without scrolling, and never a second page.
 *
 * Kept here rather than in the route so the field and the route cannot disagree about when the list is
 * worth opening.
 */
export const MAX_SUGGESTIONS = 6;

/** A single letter matches half the catalog, so nothing is asked for or shown below two letters. */
export const MIN_SUGGESTION_LETTERS = 2;

export type SearchSuggestion = {
  readonly id: string;
  readonly slug: string;
  /** The name a shopper reads: the English one, then the Bangla one, then the slug. */
  readonly name: string;
  readonly brand: string | null;
  readonly pack: string | null;
  readonly priceMinor: number;
  /** Only set when the stored comparison price is genuinely higher than the price. */
  readonly compareAtPriceMinor: number | null;
  readonly availability: Availability;
  /** The first photograph, or null so the row draws the catalog's own fallback. */
  readonly image: CatalogImage | null;
};

export type SearchSuggestions = {
  /** The term these rows answer for, so a late response can be told apart from a newer one. */
  readonly query: string;
  readonly results: readonly SearchSuggestion[];
};

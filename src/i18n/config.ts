import type { Locale } from '@/lib/types';

/**
 * The interface language.
 *
 * QueenBee's is **English only** (owner decision, Phase 28). There is no toggle, no stored
 * preference and no second dictionary: the product has one interface language until the owner
 * changes that decision. The type is narrowed to `'en'` so a Bangla interface cannot be
 * reintroduced by passing a value - it would have to change this type, which is the point.
 *
 * `LocalizedText` in `src/lib/types.ts` still has a `bn` field: product names, category names and
 * customer-entered text are **records**, not interface copy, and the catalog columns are left
 * untouched.
 */
export const INTERFACE_LOCALE: Locale = 'en';

/** BCP-47 tag used for `Intl` formatting (dates and numbers). */
export const INTL_LOCALE = 'en-US';

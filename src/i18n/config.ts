import { dictionary, type TranslationKey } from './dictionaries';
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

/**
 * The server-side translator.
 *
 * `useTranslation` is a React hook and cannot be called from an async Server Component, but a server
 * page still needs the same dictionary and the same `{param}` substitution. This is that lookup without
 * the hook - one dictionary, one interpolation rule - so server and client copy cannot drift.
 *
 * Components keep using `useTranslation`; this exists for pages that resolve their own copy before
 * rendering.
 */
export function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  const template: string = dictionary[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

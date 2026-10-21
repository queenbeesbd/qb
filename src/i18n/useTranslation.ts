import { INTERFACE_LOCALE } from './config';
import { dictionary, type TranslationKey } from './dictionaries';
import { formatMoney } from '@/lib/money';
import type { LocalizedText, Money } from '@/lib/types';

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/**
 * The interface translator.
 *
 * There is no locale context any more (Phase 28): the interface is English only, so this is a plain
 * lookup instead of a subscription to a switching store. Components keep calling `t`/`pick`/`price`,
 * which is why the removal of the language toggle did not require rewriting every view - but the
 * value they receive can no longer be anything except English.
 */
export function useTranslation() {
  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template: string = dictionary[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  }

  /**
   * Resolves a catalog record's text.
   *
   * English first, then the record's other language. This fallback exists only for **owner data**:
   * if a product is entered with a Bangla name and no English one, showing the name it was given is
   * more honest than showing nothing. It is not interface copy and it is not a Bangla interface.
   */
  function pick(value: LocalizedText | null | undefined): string | null {
    if (!value) return null;
    return value.en ?? value.bn ?? null;
  }

  function price(amount: Money): string {
    return formatMoney(amount);
  }

  return { locale: INTERFACE_LOCALE, dict: dictionary, t, pick, price };
}

import { useContext } from 'react';
import { LocaleContext } from './LocaleProvider';
import type { TranslationKey } from './dictionaries';
import { formatMoney } from '@/lib/money';
import type { LocalizedText, Money } from '@/lib/types';

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/**
 * Returns the translator, active locale and a localized money formatter.
 * Components never branch on locale directly; they call `t` and `pick`.
 */
export function useTranslation() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useTranslation must be used inside LocaleProvider');
  }
  const { locale, dict } = context;

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template: string = dict[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  }

  /**
   * Resolves localized product/category content with a documented fallback:
   * requested locale first, then the other locale. Untranslated content is
   * shown in its source language rather than replaced with an invented claim.
   */
  function pick(value: LocalizedText | null | undefined): string | null {
    if (!value) return null;
    const primary = value[locale];
    if (primary) return primary;
    const fallback = locale === 'bn' ? value.en : value.bn;
    return fallback ?? null;
  }

  function price(amount: Money): string {
    return formatMoney(amount, locale);
  }

  return { ...context, t, pick, price };
}

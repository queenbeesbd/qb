import type { Locale } from '@/lib/types';

/** Bangla is the approved default locale. */
export const DEFAULT_LOCALE: Locale = 'bn';
export const LOCALES: readonly Locale[] = ['bn', 'en'];

/** Storage key for the saved locale preference. Versioned for safe migration. */
export const LOCALE_STORAGE_KEY = 'queenbees.locale.v1';

export const LOCALE_LABELS: Record<Locale, string> = {
  bn: 'বাংলা',
  en: 'English',
};

/** BCP-47 tags used for Intl formatting and the document lang attribute. */
export const INTL_LOCALES: Record<Locale, string> = {
  bn: 'bn-BD',
  en: 'en-US',
};

export function isLocale(value: unknown): value is Locale {
  return value === 'bn' || value === 'en';
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'bn' ? 'en' : 'bn';
}

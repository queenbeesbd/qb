'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { getDictionary, type DictionaryShape } from './dictionaries';
import { getServerSnapshot, getSnapshot, setStoredLocale, subscribe } from './locale-store';
import { DEFAULT_LOCALE } from './config';
import type { Locale } from '@/lib/types';

type LocaleContextValue = {
  locale: Locale;
  dict: DictionaryShape;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active locale. Bangla is the approved default; a saved preference
 * is restored from the locale store. Every failure path degrades to the default
 * locale rather than leaving the interface without copy.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // DOM write only - the effect does not set React state.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setStoredLocale(next), []);

  const toggleLocale = useCallback(() => {
    setStoredLocale(locale === 'bn' ? 'en' : 'bn');
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dict: getDictionary(locale), setLocale, toggleLocale }),
    [locale, setLocale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export { DEFAULT_LOCALE };

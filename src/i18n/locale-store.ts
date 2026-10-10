import type { Locale } from '@/lib/types';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale } from './config';

/**
 * Locale external store. Mirrors the cart store: the server snapshot is always
 * the approved default (Bangla) and the client snapshot is the saved
 * preference, so no effect has to write state on mount and hydration stays
 * predictable.
 */

let locale: Locale = DEFAULT_LOCALE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (isLocale(stored) && stored !== locale) {
    locale = stored;
    emit();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  hydrate();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Locale {
  return locale;
}

export function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function setStoredLocale(next: Locale): void {
  locale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* storage may be unavailable (private mode, quota); in-memory value wins */
  }
  emit();
}

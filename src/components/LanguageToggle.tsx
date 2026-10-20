'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { LOCALE_LABELS, otherLocale } from '@/i18n/config';
import { GlobeIcon } from './icons';

type Props = {
  /** `compact` renders the short label used inside the mobile header. */
  variant?: 'full' | 'compact';
  className?: string;
};

/**
 * Visible, keyboard-operable language toggle. Displays the language the control
 * switches *to*, matching how bilingual Bangladeshi storefronts conventionally
 * label this control, and exposes the current language to assistive tech.
 */
export function LanguageToggle({ variant = 'full', className }: Props) {
  const { locale, setLocale, t } = useTranslation();
  const target = otherLocale(locale);
  const label =
    target === 'en' ? t('nav.switchToEnglish') : t('nav.switchToBangla');

  return (
    /*
     * One accessible name, not three fragments. The previous markup concatenated the
     * sr-only "Current language:" with the visible target-language label, so a screen
     * reader heard "Current language: Englishবাংলা" with no separator (Phase 24 X-05).
     * The control now announces its action in the reader's own language, and the visible
     * text is hidden from it so it is never read twice.
     */
    <button
      type="button"
      className={className}
      onClick={() => setLocale(target)}
      lang={target}
      title={label}
      aria-label={label}
    >
      <GlobeIcon width={18} height={18} />
      <span aria-hidden="true">
        {variant === 'compact' ? LOCALE_LABELS[target] : label}
      </span>
    </button>
  );
}

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
    <button
      type="button"
      className={className}
      onClick={() => setLocale(target)}
      lang={target}
      title={label}
    >
      <GlobeIcon width={18} height={18} />
      <span className="sr-only">{t('nav.currentLanguage')}</span>
      <span aria-hidden={false}>
        {variant === 'compact' ? LOCALE_LABELS[target] : label}
      </span>
    </button>
  );
}

'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';

/**
 * A link to `/contact`, for the copy that used to say "contact the store" and offer no way to do it.
 *
 * The sentence around it keeps its fact; this is the route. It is a client component because the
 * sentences it accompanies are rendered by client views (checkout, the account pages, the receipt).
 */
export function ContactLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link className={className} href="/contact">
      {t('common.contactStore')}
    </Link>
  );
}

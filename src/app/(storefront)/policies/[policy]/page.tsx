import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import type { TranslationKey } from '@/i18n/dictionaries';
import { translate } from '@/i18n/config';
import { isPolicySlug, loadStoreContact, type PolicySlug } from '@/server/settings/contact';
import styles from '../../help.module.css';

export const dynamic = 'force-dynamic';

const POLICY_TITLES: Record<PolicySlug, TranslationKey> = {
  delivery: 'help.policy.delivery',
  returns: 'help.policy.returns',
  privacy: 'help.policy.privacy',
  terms: 'help.policy.terms',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ policy: string }>;
}): Promise<Metadata> {
  const { policy } = await params;
  return { title: isPolicySlug(policy) ? translate(POLICY_TITLES[policy]) : 'Policies' };
}

/**
 * One policy page: delivery, returns, privacy or terms.
 *
 * **The owner's text, verbatim.** Nothing here states a deadline, a return window, a refund condition or
 * a privacy practice of its own - that would be publishing a policy the owner never approved. An empty
 * field renders a stated gap and a way to ask, and the footer does not link a page the shop has not
 * written.
 */
export default async function PolicyPage({ params }: { params: Promise<{ policy: string }> }) {
  const { policy } = await params;
  if (!isPolicySlug(policy)) notFound();

  const contact = await withTransaction((tx) => loadStoreContact(tx));
  const text = {
    delivery: contact.delivery,
    returns: contact.returns,
    privacy: contact.privacy,
    terms: contact.terms,
  }[policy];
  const paragraphs =
    text === null
      ? []
      : text
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.trim())
          .filter((paragraph) => paragraph.length > 0);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{translate(POLICY_TITLES[policy])}</h1>
        <p className={styles.lead}>{translate('help.policy.lead')}</p>
      </header>

      {paragraphs.length === 0 ? (
        <p className={styles.gap} role="status">
          {translate('help.policy.empty')}{' '}
          <Link href="/contact">{translate('common.contactStore')}</Link>
        </p>
      ) : (
        <div className={styles.prose}>
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  );
}

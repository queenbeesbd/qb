import type { Metadata } from 'next';

import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { isEmptyContact, loadStoreContact, telHref } from '@/server/settings/contact';
import { loadSupportLinks } from '@/server/settings/support';
import styles from '../help.module.css';

export const metadata: Metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

/**
 * How to reach the shop.
 *
 * **Every fact on this page is the owner's own.** A field the owner has not filled in is not rendered
 * and is never replaced by a placeholder number, a made-up hour or a "typically responds" promise; when
 * nothing public is configured the page says exactly that. The two support links are the same
 * owner-configured addresses the floating buttons use, so this page cannot drift from them.
 */
export default async function ContactPage() {
  const { contact, links } = await withTransaction(async (tx) => ({
    contact: await loadStoreContact(tx),
    links: await loadSupportLinks(tx),
  }));

  const hasFacts = !isEmptyContact(contact);
  const hasLinks = links.facebookUrl !== null || links.whatsappUrl !== null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{translate('help.contact.title')}</h1>
        <p className={styles.lead}>{translate('help.contact.lead')}</p>
      </header>

      {hasFacts ? (
        <dl className={styles.facts}>
          {contact.phone !== null && (
            <div>
              <dt>{translate('help.contact.phone')}</dt>
              <dd>
                <a href={telHref(contact.phone)}>{contact.phone}</a>
              </dd>
            </div>
          )}
          {contact.hours !== null && (
            <div>
              <dt>{translate('help.contact.hours')}</dt>
              <dd className={styles.preLine}>{contact.hours}</dd>
            </div>
          )}
          {contact.address !== null && (
            <div>
              <dt>{translate('help.contact.address')}</dt>
              <dd className={styles.preLine}>{contact.address}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className={styles.gap} role="status">
          {translate('help.contact.noFacts')}
        </p>
      )}

      {hasLinks && (
        <section className={styles.section} aria-labelledby="contact-links">
          <h2 id="contact-links" className={styles.sectionTitle}>
            {translate('help.contact.links')}
          </h2>
          <p className={styles.body}>{translate('help.contact.linksBody')}</p>
          <ul className={styles.linkList}>
            {links.facebookUrl !== null && (
              <li>
                <a href={links.facebookUrl} target="_blank" rel="noopener noreferrer">
                  {translate('help.contact.facebook')}
                </a>
              </li>
            )}
            {links.whatsappUrl !== null && (
              <li>
                <a href={links.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  {translate('help.contact.whatsapp')}
                </a>
              </li>
            )}
          </ul>
        </section>
      )}

      {!hasFacts && !hasLinks && (
        <p className={styles.body}>{translate('help.contact.noLinks')}</p>
      )}
    </div>
  );
}

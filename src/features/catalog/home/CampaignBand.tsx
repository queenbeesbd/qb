import Link from 'next/link';

import styles from './CampaignBand.module.css';

/**
 * The homepage campaign band: the shop's one seasonal statement.
 *
 * Content is the owner's, stored in `store_setting` (`campaign.*` keys) and composed on the server
 * — the band renders exactly what it is given, and the section is absent from the page entirely
 * when nothing is saved and switched on. There is no placeholder, no invented campaign, no timer:
 * switching a campaign off is the owner's explicit action, and a dormant band renders nothing
 * rather than a stub.
 *
 * Presentation: a typographic card on the brand's pink field (`--color-accent-soft`), breaking the
 * page's run of white product rows. On a phone it stacks; from 720px the headline and body sit
 * beside the call to action on one line. The link is validated to an internal path at read time
 * (`asInternalPath` in `src/server/settings/campaign.ts`), so the band can never become an open
 * redirect.
 */
export function CampaignBand({
  headline,
  body,
  link,
  linkLabel,
}: {
  headline: string;
  body: string | null;
  /** An internal path, already validated server-side. `null` renders no call to action. */
  link: string | null;
  linkLabel: string;
}) {
  return (
    <section className={styles.band} aria-labelledby="campaign-title">
      <div className={styles.copy}>
        <p className={styles.kicker} id="campaign-title">
          {headline}
        </p>
        {body !== null && <p className={styles.text}>{body}</p>}
      </div>
      {link !== null && (
        <Link className={styles.cta} href={link}>
          {linkLabel}
        </Link>
      )}
    </section>
  );
}

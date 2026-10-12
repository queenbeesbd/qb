'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../admin.module.css';

export type Fact = { labelKey: TranslationKey; value: number };

/**
 * The overview.
 *
 * Every number is a count of rows that exist. There is deliberately no revenue, order, sales or
 * growth figure: no order can be created yet, and a placeholder would be an invented metric. Where a
 * figure does not exist, the panel says so instead of showing zero-with-a-label.
 */
export function OverviewView({
  facts,
  session,
}: {
  facts: readonly Fact[];
  session: { absoluteExpiresAt: string; idleExpiresAt: string; email: string };
}) {
  const { t, locale } = useTranslation();
  const format = (iso: string): string =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.overview.title')}</h1>
          <p>{t('admin.overview.body')}</p>
        </div>
        <div className={styles.panel}>
          <div className={styles.facts}>
            {facts.map((fact) => (
              <div className={styles.fact} key={fact.labelKey}>
                <span className={styles.factLabel}>{t(fact.labelKey)}</span>
                <span className={styles.factValue}>{new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US').format(fact.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.overview.sessionTitle')}</h2>
          <p>{t('admin.overview.sessionBody')}</p>
        </div>
        <div className={styles.panel}>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>{t('admin.session.signedInAs')}</dt>
              <dd className={styles.sessionName}>{session.email}</dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>{t('admin.session.expiresAt')}</dt>
              <dd>{format(session.absoluteExpiresAt)}</dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>{t('admin.session.idleUntil')}</dt>
              <dd>{format(session.idleExpiresAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.overview.scopeTitle')}</h2>
          <p>{t('admin.overview.scopeBody')}</p>
          <p className={styles.note}>{t('admin.overview.roadmapNote')}</p>
        </div>
      </section>
    </>
  );
}

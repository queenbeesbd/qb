'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { INTL_LOCALE } from '@/i18n/config';
import { imageVariantPath } from '@/lib/images';
import { formatRating } from '@/lib/rating';
import type { TranslationKey } from '@/i18n/dictionaries';
import { RatingStars } from '@/components/RatingStars';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import styles from '../../qbpanel.module.css';

export type ReviewTab = 'pending' | 'approved' | 'rejected';

export type ReviewRow = {
  id: number;
  productName: string;
  productSlug: string;
  customerEmail: string;
  ratingHalves: number;
  body: string;
  imageKey: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type ReviewNotice = 'published' | 'refused' | 'conflict' | 'invalid' | 'denied';

const NOTICE_KEYS: Record<ReviewNotice, TranslationKey> = {
  published: 'admin.reviews.notice.published',
  refused: 'admin.reviews.notice.refused',
  conflict: 'admin.reviews.notice.conflict',
  invalid: 'admin.reviews.notice.invalid',
  denied: 'admin.reviews.notice.denied',
};

const ERROR_NOTICES: readonly ReviewNotice[] = ['conflict', 'invalid', 'denied'];

/**
 * Review moderation.
 *
 * A worklist, not a catalog screen: the pending tab is the oldest review first, because the queue is
 * worked in the order customers wrote to the shop. Each row states the three facts a decision needs -
 * which product, what the customer said, and how many stars they gave - and nothing else: no
 * influence over the words, and no way to edit them.
 *
 * Approving publishes the review on the product page. Refusing keeps the row: the customer still sees
 * their own review marked "Not published", and the shop keeps a record of what it refused.
 */
export function ReviewsView({
  tab,
  reviews,
  counts,
  notice,
  csrfToken,
}: {
  tab: ReviewTab;
  reviews: readonly ReviewRow[];
  counts: Record<ReviewTab, number>;
  notice: ReviewNotice | null;
  csrfToken: string;
}) {
  const { t } = useTranslation();

  const tabs: readonly { key: ReviewTab; labelKey: TranslationKey }[] = [
    { key: 'pending', labelKey: 'admin.reviews.tab.pending' },
    { key: 'approved', labelKey: 'admin.reviews.tab.approved' },
    { key: 'rejected', labelKey: 'admin.reviews.tab.rejected' },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.reviews.title')}
        description={t('admin.reviews.subtitle')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      {/*
        The same segmented filter the order queue uses, with the count on each tab so the owner can
        see the size of the queue without opening it.
      */}
      <nav className={styles.filterTabs} aria-label={t('admin.reviews.filterLabel')}>
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            href={`/qbpanel/reviews?state=${entry.key}`}
            className={`${styles.filterTab} ${entry.key === tab ? styles.filterTabActive : ''}`}
            aria-current={entry.key === tab ? 'page' : undefined}
          >
            {t(entry.labelKey)}
            <span className={styles.filterCount}>{counts[entry.key]}</span>
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <EmptyState
          title={t(tab === 'pending' ? 'admin.reviews.empty.pending' : 'admin.reviews.empty.other')}
          body={t(tab === 'pending' ? 'admin.reviews.empty.pendingBody' : 'admin.reviews.empty.otherBody')}
        />
      ) : (
        <ul className={styles.reviewList}>
          {reviews.map((review) => (
            <li key={review.id} className={styles.reviewCard}>
              <div className={styles.reviewHead}>
                <div>
                  <p className={styles.reviewProduct}>
                    <Link href={`/products/${review.productSlug}`} target="_blank" rel="noopener noreferrer">
                      {review.productName}
                    </Link>
                  </p>
                  <p className={styles.reviewMeta}>
                    {review.customerEmail} · {formatDate(review.createdAt)}
                    {review.decidedAt !== null && ` · ${t('admin.reviews.decided')} ${formatDate(review.decidedAt)}`}
                  </p>
                </div>
                <p className={styles.reviewRating}>
                  <RatingStars
                    halves={review.ratingHalves}
                    label={t('product.ratingAria', { rating: formatRating(review.ratingHalves) })}
                  />
                  <span>{formatRating(review.ratingHalves)}</span>
                </p>
              </div>

              <p className={styles.reviewBody}>{review.body}</p>

              {/*
                The customer's photograph, at the 320 variant: the owner is deciding what would be
                published, so the picture is part of the decision, not an attachment to open later.
              */}
              {review.imageKey !== null && (
                <p>
                  <img
                    className={styles.reviewImage}
                    src={imageVariantPath(review.imageKey, 320)}
                    width={320}
                    height={320}
                    alt=""
                    loading="lazy"
                  />
                </p>
              )}

              {tab === 'pending' && (
                <div className={styles.reviewActions}>
                  <form method="post" action="/api/qbpanel/reviews">
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="state" value={tab} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" className={styles.button}>
                      {t('admin.reviews.publish')}
                    </button>
                  </form>
                  <form method="post" action="/api/qbpanel/reviews">
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="state" value={tab} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button type="submit" className={styles.buttonDangerOutline}>
                      {t('admin.reviews.refuse')}
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(INTL_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

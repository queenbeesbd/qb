'use client';

import { Fragment, useId, useState } from 'react';

import { imageVariantPath } from '@/lib/images';
import { prepareImageFile } from '@/lib/image-prep';
import { formatRating } from '@/lib/rating';
import { useTranslation, type Translate } from '@/i18n/useTranslation';
import { RatingStars } from '@/components/RatingStars';
import styles from './ProductReviews.module.css';

export type ReviewListItem = {
  readonly ratingHalves: number;
  readonly body: string;
  /** ISO instant, formatted here so the page and the form cannot disagree about the date. */
  readonly createdAt: string;
  /** The photograph the customer attached, as our own asset key, or null. */
  readonly imageKey: string | null;
};

export type OwnReviewView = ReviewListItem & {
  readonly state: 'pending' | 'approved' | 'rejected';
};

/**
 * The reviews block on a product page (ADR 0035).
 *
 * Three things it deliberately is not:
 *
 * - **not an average.** There is no "4.3 from 12 reviews" figure. The stars above the buy button come
 *   from the owner's own field, and a customer's stars are shown with the review they belong to.
 * - **not a wall.** A product with published reviews lists the ten most recent and says so.
 * - **not anonymous.** Every review is a real purchase: the form is only offered to a customer whose
 *   order contains this product, and each published review is labelled for what it verifiably is.
 *
 * The customer's own review is shown to them whatever its state, with that state named - which is the
 * only way they know the words they wrote were received.
 */
export function ProductReviews({
  reviews,
  totalPublished,
  ownReview,
  canReview,
  signedIn,
  csrfToken,
  action,
  notice,
}: {
  reviews: readonly ReviewListItem[];
  /** Every published review, not just the ones drawn - so a partial list can say so. */
  totalPublished: number;
  ownReview: OwnReviewView | null;
  /** True only when this signed-in customer bought the product and has not reviewed it yet. */
  canReview: boolean;
  signedIn: boolean;
  csrfToken: string | null;
  /** The route the form posts to, so the component never builds a URL from a slug itself. */
  action: string;
  /** A notice code carried back by the POST's redirect, never free text. */
  notice: string | null;
}) {
  const { t } = useTranslation();
  const ratingGroupsId = useId();
  const photoId = useId();
  const [photoState, setPhotoState] = useState<{ name: string; error: boolean } | null>(null);

  const noticeText = reviewNoticeText(notice, t);
  const headingId = 'product-reviews-title';

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId}>
          {t('product.reviews.title')}
          {totalPublished > 0 && <span className={styles.count}>{totalPublished}</span>}
        </h2>
      </div>

      {noticeText !== null && (
        <p className={styles.notice} role="status">
          {noticeText}
        </p>
      )}

      {/* The customer's own review comes first, whatever state it is in: it is their words. */}
      {ownReview !== null && (
        <article className={styles.review} data-own="true">
          <div className={styles.reviewHead}>
            <RatingStars
              halves={ownReview.ratingHalves}
              size="md"
              label={t('product.ratingAria', { rating: formatRating(ownReview.ratingHalves) })}
            />
            <span className={styles.state} data-state={ownReview.state}>
              {t(`product.reviews.state.${ownReview.state}`)}
            </span>
          </div>
          <p className={styles.body}>{ownReview.body}</p>
          {ownReview.imageKey !== null && <ReviewPhoto imageKey={ownReview.imageKey} />}
          <p className={styles.meta}>
            {t('product.reviews.yourReview')} · {formatDate(ownReview.createdAt)}
          </p>
        </article>
      )}

      {reviews.map((review, index) => (
        <article key={`${review.createdAt}-${index}`} className={styles.review}>
          <div className={styles.reviewHead}>
            <RatingStars
              halves={review.ratingHalves}
              size="md"
              label={t('product.ratingAria', { rating: formatRating(review.ratingHalves) })}
            />
            <span className={styles.verified}>{t('product.reviews.verifiedBuyer')}</span>
          </div>
          <p className={styles.body}>{review.body}</p>
          {review.imageKey !== null && <ReviewPhoto imageKey={review.imageKey} />}
          <p className={styles.meta}>{formatDate(review.createdAt)}</p>
        </article>
      ))}

      {totalPublished === 0 && ownReview === null && (
        <p className={styles.empty}>{t('product.reviews.empty')}</p>
      )}

      {totalPublished > reviews.length && (
        <p className={styles.meta}>
          {t('product.reviews.showingSome', { shown: reviews.length, total: totalPublished })}
        </p>
      )}

      {/*
        The form is offered only to a buyer. A visitor who did not buy this product is told nothing
        about why - an unavailable form is quieter than a sentence explaining a rule they cannot
        satisfy, and the review still has to be earned by an order.
      */}
      {canReview && signedIn && csrfToken !== null ? (
        <form className={styles.form} method="post" action={action} encType="multipart/form-data">
          <input type="hidden" name="csrf" value={csrfToken} />
          <h3 className={styles.formTitle}>{t('product.reviews.formTitle')}</h3>

          <fieldset className={styles.ratingField}>
            <legend className={styles.ratingLegend}>{t('product.reviews.formRating')}</legend>
            {/*
              Five real radios, in reverse DOM order and laid out right to left, so `:checked ~ label`
              fills the chosen star and every star below it. The stars are drawn, the words are in the
              label: this works without JavaScript and is operable by arrow keys.
            */}
            <div className={styles.ratingRow} role="radiogroup" aria-labelledby={`${ratingGroupsId}-legend`}>
              <span id={`${ratingGroupsId}-legend`} className="sr-only">
                {t('product.reviews.formRating')}
              </span>
              {[5, 4, 3, 2, 1].map((stars) => (
                <Fragment key={stars}>
                  <input
                    id={`${ratingGroupsId}-${stars}`}
                    type="radio"
                    name="rating"
                    value={String(stars)}
                    required
                    className={styles.ratingInput}
                  />
                  <label htmlFor={`${ratingGroupsId}-${stars}`} className={styles.ratingLabel}>
                    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
                      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
                    </svg>
                    <span className="sr-only">{t('product.reviews.starsOf', { count: stars })}</span>
                  </label>
                </Fragment>
              ))}
            </div>
          </fieldset>

          <div className={styles.field}>
            <label htmlFor="review-body" className={styles.label}>
              {t('product.reviews.formBody')}
            </label>
            <textarea
              id="review-body"
              name="body"
              className={styles.textarea}
              rows={5}
              minLength={10}
              maxLength={1000}
              required
            />
            <p className={styles.hint}>{t('product.reviews.formBodyHint')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor={`${photoId}-photo`} className={styles.label}>
              {t('product.reviews.formPhoto')}
            </label>
            {/*
              A phone photograph is routinely over the request cap, so the browser downscales and
              re-encodes it before it is posted (the same helper the admin editors use). The server
              still decodes, re-encodes and refuses anything it cannot read - the client only makes
              the request fit.
            */}
            <input
              id={`${photoId}-photo`}
              name="photo"
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file === undefined) {
                  setPhotoState(null);
                  return;
                }
                const prepared = await prepareImageFile(file);
                if (prepared !== file) {
                  const transfer = new DataTransfer();
                  transfer.items.add(prepared);
                  event.target.files = transfer.files;
                }
                setPhotoState({ name: prepared.name, error: false });
              }}
            />
            <p className={styles.hint}>
              {photoState === null ? t('product.reviews.formPhotoHint') : photoState.name}
            </p>
          </div>

          <button type="submit" className={styles.submit}>
            {t('product.reviews.submit')}
          </button>
          <p className={styles.hint}>{t('product.reviews.moderationHint')}</p>
        </form>
      ) : null}
    </section>
  );
}

/**
 * One customer's photograph.
 *
 * It goes through `imageVariantPath` like every other catalog asset - the key names immutable bytes,
 * so the 320 variant is what a list downloads and the browser never fetches the 1050 master. The
 * image is decorative in the accessibility tree (`alt=""`): the customer supplied no description,
 * and the review's words are what a screen reader should hear rather than an invented caption.
 */
function ReviewPhoto({ imageKey }: { imageKey: string }) {
  return (
    <img
      className={styles.photo}
      src={imageVariantPath(imageKey, 320)}
      srcSet={`${imageVariantPath(imageKey, 320)} 320w, ${imageVariantPath(imageKey, 600)} 600w`}
      sizes="160px"
      width={320}
      height={320}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

/** A fixed code to copy, so a notice can never echo text from a query string. */
function reviewNoticeText(
  notice: string | null,
  t: Translate,
): string | null {
  switch (notice) {
    case 'submitted':
      return t('product.reviews.notice.submitted');
    case 'already':
      return t('product.reviews.notice.already');
    case 'notPurchased':
      return t('product.reviews.notice.notPurchased');
    case 'invalid':
      return t('product.reviews.notice.invalid');
    case 'invalidPhoto':
      return t('product.reviews.notice.invalidPhoto');
    default:
      return null;
  }
}

/**
 * The date a review was written, in the shop's own locale, from the ISO instant the server sent.
 *
 * Formatted in the browser so the reader sees their own time zone; `undefined` would silently fall
 * back to a locale the interface does not use, so the day is stated explicitly.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

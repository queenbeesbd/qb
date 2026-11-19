'use client';

import { useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { RATING_CHOICES, formatRating } from '@/lib/rating';
import { REVIEW_BODY_MAX, REVIEW_BODY_MIN } from '@/lib/review-limits';
import { AdminIcon } from './icons';
import { AdminImageInput } from './AdminImageInput';
import { ReviewProductPicker, type ReviewProductOption } from './ReviewProductPicker';
import { SubmitButton } from './SubmitButton';
import styles from '../qbpanel.module.css';

export type { ReviewProductOption };

/**
 * The owner writes a review in, from words a customer left somewhere else (owner direction,
 * 2026-11-19).
 *
 * **It is a disclosure, below the queue, closed by default** (owner direction, 2026-11-19). It used to
 * be an open form above the worklist, which put the rarer task first and pushed the queue the owner came
 * for below the fold - the same mistake as putting a "create" form above a list. The screen's job is to
 * decide reviews; writing one is the occasional addition to that job. So it is a summary the owner opens
 * when they have one, and the queue is what the page shows on arrival.
 *
 * Three rules the form itself is built to:
 *
 * 1. **It never claims a purchase.** The copy says where the words came from, and the product page draws
 *    no "Verified buyer" label on these rows. Nothing here offers to attach an order, because an imported
 *    review has none and inventing one is the dishonesty the review rule exists to stop.
 * 2. **The bounds are the customer's bounds.** Rating and body limits come from the same modules
 *    `/api/products/[slug]/reviews` enforces, so the counter cannot promise room the save refuses.
 * 3. **It is published, and says so.** There is no pending step: the owner is the deciding account, so
 *    the review appears on the product page the moment this saves.
 */
export function ReviewComposer({
  products,
  csrfToken,
}: {
  products: readonly ReviewProductOption[];
  csrfToken: string;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState('');
  const [blocked, setBlocked] = useState<string[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <details className={styles.reviewComposer}>
      <summary className={styles.reviewComposerSummary}>
        <span className={styles.reviewComposerSummaryText}>
          <span className={styles.reviewComposerSummaryTitle}>{t('admin.reviews.write.title')}</span>
          <span className={styles.reviewComposerSummaryBody}>{t('admin.reviews.write.summary')}</span>
        </span>
        <span className={styles.reviewComposerChevron}>
          <AdminIcon name="arrowDown" width={18} height={18} />
        </span>
      </summary>

      <div className={styles.reviewComposerPanel}>
        <p className={styles.reviewComposerIntro}>{t('admin.reviews.write.body')}</p>

        <form
          ref={formRef}
          className={styles.reviewComposerForm}
          action="/api/qbpanel/reviews/compose"
          method="post"
          encType="multipart/form-data"
          noValidate
          onSubmit={(event) => {
          const form = event.currentTarget;
          /*
           * The product is checked here rather than by `required`, because its control is a button and
           * a hidden input is barred from constraint validation. Everything else is a real field and
           * the browser's own validity is read.
           */
          const missingProduct = productId === null;
          const fields = [
            ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
              'input:not([type="file"]), select, textarea',
            ),
          ].filter((field) => field.getAttribute('name') !== 'productId');
          const invalid = fields.filter((field) => !field.checkValidity());

          for (const field of fields) {
            if (invalid.includes(field)) field.setAttribute('aria-invalid', 'true');
            else field.removeAttribute('aria-invalid');
          }

          if (!missingProduct && invalid.length === 0) {
            setBlocked([]);
            return;
          }

          event.preventDefault();
          const names: string[] = [];
          if (missingProduct) names.push(t('admin.reviews.write.product'));
          for (const field of invalid) {
            const id = field.getAttribute('id');
            const label = id === null ? null : form.querySelector(`label[for="${id}"]`);
            names.push(
              label?.textContent?.replace(/Required/g, '').replace(/\*/g, '').trim() ||
                field.getAttribute('name') ||
                'a field',
            );
          }
          setBlocked(names);

          // A missing product opens the panel, because that is where the missing choice lives.
          if (missingProduct) {
            setPickerOpen(true);
            return;
          }
          invalid[0]?.focus();
        }}
        >
          <input type="hidden" name="csrf" value={csrfToken} />

          {blocked.length > 0 && (
            <div className={styles.formBlocked} role="alert">
              <AdminIcon name="alert" width={18} height={18} />
              <span>{t('admin.catalog.formBlocked', { fields: blocked.join(', ') })}</span>
            </div>
          )}

          <div className={styles.reviewComposerGrid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel} id="review-product-label">
                {t('admin.reviews.write.product')}
              </span>
              <ReviewProductPicker
                products={products}
                value={productId}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onChange={(id) => {
                  setProductId(id);
                  setBlocked((current) =>
                    current.filter((name) => name !== t('admin.reviews.write.product')),
                  );
                }}
                label={t('admin.reviews.write.product')}
                placeholder={t('admin.reviews.write.productPlaceholder')}
                searchLabel={t('admin.reviews.write.productSearch')}
                emptyLabel={t('admin.reviews.write.productEmpty')}
                closeLabel={t('common.close')}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="review-rating">{t('admin.reviews.write.rating')}</label>
              <select className={styles.select} id="review-rating" name="rating" required defaultValue="5">
                {[...RATING_CHOICES].reverse().map((halves) => (
                  <option key={halves} value={String(halves / 2)}>
                    {t('admin.catalog.field.ratingOption', { rating: formatRating(halves) })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor="review-body">{t('admin.reviews.write.body.label')}</label>
              <span className={styles.counter} aria-live="polite">
                {t('admin.reviews.write.counter', { used: body.length, max: REVIEW_BODY_MAX })}
              </span>
            </div>
            <textarea
              className={styles.textarea}
              id="review-body"
              name="body"
              rows={4}
              required
              minLength={REVIEW_BODY_MIN}
              maxLength={REVIEW_BODY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('admin.reviews.write.bodyPlaceholder')}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('admin.reviews.write.photo')}</span>
            {/*
              The same prepared-upload control every other admin form uses. The raw `<input type="file">`
              this replaced drew the browser's own unstyled "Browse..." button, which was the only
              control on the screen that did not belong to the panel.
            */}
            <AdminImageInput id="review-photo" name="photo" />
            <p className={styles.hint}>{t('admin.reviews.write.photoHelp')}</p>
          </div>

          <div className={styles.formHeaderActions}>
            <SubmitButton
              label={t('admin.reviews.write.submit')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </div>
    </details>
  );
}

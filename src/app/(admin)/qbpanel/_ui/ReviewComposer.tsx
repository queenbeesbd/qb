'use client';

import { useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { RATING_CHOICES, formatRating } from '@/lib/rating';
import { REVIEW_BODY_MAX, REVIEW_BODY_MIN } from '@/lib/review-limits';
import { AdminIcon } from './icons';
import { SubmitButton } from './SubmitButton';
import styles from '../qbpanel.module.css';

/** The product the owner can review: anything published and not archived. */
export type ReviewProductOption = { id: number; nameEn: string };

/**
 * The owner writes a review in, from words a customer left somewhere else (owner direction,
 * 2026-11-19).
 *
 * It sits above the queue rather than behind a separate route because it is the same job as deciding a
 * review - putting words on a product page - and the owner should not have to leave the screen to do
 * the other half of it.
 *
 * Three rules this form is built to:
 *
 * 1. **It never claims a purchase.** The copy says where the words came from, and the product page draws
 *    no "Verified buyer" label on these rows. Nothing on this screen offers to attach an order, because
 *    an imported review has none and inventing one is the dishonesty the review rule exists to stop.
 * 2. **The bounds are the customer's bounds.** Rating and body limits are the same ones `/api/products/
 *    [slug]/reviews` enforces, read from one module, so the counter cannot promise room the save
 *    refuses.
 * 3. **It is published, and says so.** There is no pending step here: the owner is the deciding account,
 *    so the review appears on the product page the moment this saves.
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

  return (
    <section className={styles.reviewComposer} aria-labelledby="review-composer-title">
      <div className={styles.formCardHead}>
        <h2 id="review-composer-title">{t('admin.reviews.write.title')}</h2>
        <p>{t('admin.reviews.write.body')}</p>
      </div>

      <form
        ref={formRef}
        className={styles.reviewComposerForm}
        action="/api/qbpanel/reviews/compose"
        method="post"
        encType="multipart/form-data"
        noValidate
        onSubmit={(event) => {
          const form = event.currentTarget;
          const fields = [...form.querySelectorAll<HTMLElement>('input, select, textarea')];
          const invalid = fields.filter(
            (field) => 'checkValidity' in field && !(field as HTMLInputElement).checkValidity(),
          );

          for (const field of fields) {
            if (
              !(
                field instanceof HTMLInputElement ||
                field instanceof HTMLSelectElement ||
                field instanceof HTMLTextAreaElement
              )
            ) {
              continue;
            }
            if (invalid.includes(field)) field.setAttribute('aria-invalid', 'true');
            else field.removeAttribute('aria-invalid');
          }

          if (invalid.length === 0) {
            setBlocked([]);
            return;
          }

          event.preventDefault();
          setBlocked(
            invalid.map((field) => {
              const id = field.getAttribute('id');
              const label = id === null ? null : form.querySelector(`label[for="${id}"]`);
              return (
                label?.textContent?.replace(/Required/g, '').replace(/\*/g, '').trim() ||
                field.getAttribute('name') ||
                'a field'
              );
            }),
          );
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
            <label htmlFor="review-product">{t('admin.reviews.write.product')}</label>
            <select className={styles.select} id="review-product" name="productId" required defaultValue="">
              <option value="" disabled>
                {t('admin.reviews.write.productPlaceholder')}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.nameEn}
                </option>
              ))}
            </select>
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
          <label htmlFor="review-photo">{t('admin.reviews.write.photo')}</label>
          <input
            className={styles.input}
            id="review-photo"
            name="photo"
            type="file"
            accept="image/*"
          />
          <p className={styles.hint}>{t('admin.reviews.write.photoHelp')}</p>
        </div>

        <div className={styles.formHeaderActions}>
          <SubmitButton
            label={t('admin.reviews.write.submit')}
            pendingLabel={t('admin.common.working')}
          />
        </div>
      </form>
    </section>
  );
}

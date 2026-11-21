'use client';

import { useEffect, useState } from 'react';

import { heroImagePath } from '@/lib/images';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { AdminIcon } from '../../../_ui/icons';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { AdminImageInput } from '../../../_ui/AdminImageInput';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

export type HeroNotice = 'added' | 'updated' | 'removed' | 'reordered' | 'denied' | 'invalid' | 'conflict';

export type HeroImageRow = {
  id: number;
  imageKey: string;
  /** Optional since 2026-11-10; `null` means the banner is decorative. */
  altText: string | null;
  sortOrder: number;
};

const NOTICE_KEYS: Record<HeroNotice, TranslationKey> = {
  added: 'admin.hero.notice.added',
  updated: 'admin.hero.notice.updated',
  removed: 'admin.hero.notice.removed',
  reordered: 'admin.hero.notice.reordered',
  denied: 'admin.hero.notice.denied',
  invalid: 'admin.hero.notice.invalid',
  conflict: 'admin.hero.notice.conflict',
};

const ERROR_NOTICES: readonly HeroNotice[] = ['denied', 'invalid', 'conflict'];

/**
 * Storefront -> Homepage hero.
 *
 * The storefront's first screen, owned here: which banners the carousel shows, and in what order. Two
 * facts stay deliberately separate, as they do on the product gallery:
 *
 * - **Order** is the sequence, 1..n. Movement is done with buttons rather than drag alone, because a
 *   drag-only control cannot be operated with a keyboard or reliably on the phone the owner uses.
 * - **The image** is uploaded from the owner's computer. The server-inventory picker that preceded the
 *   upload was removed on 2026-11-07: two ways to add the same banner made the screen ask a question
 *   the owner should not have to answer.
 *
 * **Rebuilt for the phone on 2026-11-21.** Measured at 390px before the change: each of ten banners was
 * a 448px block, so the list ran to 4,500px, and the commit for a reorder rendered *after* the whole
 * list - a banner moved near the top had its Save control four and a half screens away, which read as
 * "the move saved itself". Now each banner is one dense row (the thumbnail carries the recognition, the
 * row states its description, the description input is folded into the row), and the pending-order bar
 * is **sticky at the top**: it is in view the moment anything is moved, wherever the owner is. Nothing
 * about the 1..10 bounds, the audit trail or the write paths changed - this is presentation only.
 *
 * The 1..10 bounds are enforced by the service. This view states them and disables the control that
 * would break one, so the owner sees the limit before submitting; the server still refuses it.
 */
export function HeroSettingsView({
  images,
  notice,
  csrfToken,
  minImages,
  maxImages,
  altMax,
}: {
  images: readonly HeroImageRow[];
  notice: HeroNotice | null;
  csrfToken: string;
  minImages: number;
  maxImages: number;
  altMax: number;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[]>(images.map((image) => String(image.id)));
  const byId = new Map(images.map((image) => [String(image.id), image]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((image): image is HeroImageRow => image !== undefined);
  const savedOrder = images.map((image) => String(image.id)).join(',');
  const dirty = order.join(',') !== savedOrder;

  const atMaximum = images.length >= maxImages;
  const atMinimum = images.length <= minImages;

  /*
   * An arranged order survives a reload only if it was committed.
   *
   * Every other control on this page - a description save, a removal, Add image - is a full
   * navigation, and the reorder draft is client state. So before the change, moving a banner and then
   * tapping any "Save description" silently threw the arrangement away, which on a phone is the normal
   * stray tap. The sticky bar makes the commit visible; this makes an accidental loss impossible to
   * miss. There is nothing to save, so nothing is guarded.
   */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = t('admin.hero.orderUnsavedWarning');
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, t]);

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    setOrder(next);
  };

  return (
    <>
      <PageHeader
        title={t('admin.hero.title')}
        actions={
          <a className={`${styles.button} ${styles.buttonSecondary}`} href="#hero-add">
            <AdminIcon name="plus" width={16} height={16} />
            {t('admin.hero.addShortcut')}
          </a>
        }
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-labelledby="hero-carousel-editor">
        <div className={styles.sectionHead}>
          <h2 id="hero-carousel-editor">{t('admin.hero.editorTitle')}</h2>
          <p>{t('admin.hero.count', { count: images.length, max: maxImages })}</p>
        </div>

        {/*
          The commit for a reorder, and the reason it moved.

          It used to render after the whole list, so with ten banners the Save control sat ~4,500px
          below the arrows that made the change. It is now the list's own leading block and sticky, so
          it is on screen from the first move to the last - and it only exists while the order is
          actually unsaved, so a settled carousel has no bar at all.
        */}
        {dirty && (
          <form className={styles.heroOrderBar} action="/api/qbpanel/hero" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="reorder" />
            {order.map((id) => (
              <input key={id} type="hidden" name="imageId" value={id} />
            ))}
            <p className={styles.heroOrderNote}>{t('admin.hero.orderPending')}</p>
            <div className={styles.heroOrderActions}>
              <SubmitButton label={t('admin.hero.saveOrder')} pendingLabel={t('admin.common.working')} />
              <button
                type="button"
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => setOrder(images.map((image) => String(image.id)))}
              >
                {t('admin.common.cancel')}
              </button>
            </div>
          </form>
        )}

        {ordered.length === 0 ? (
          <p className={styles.note}>{t('admin.hero.empty')}</p>
        ) : (
          <>
            <ol className={styles.heroList} data-admin-hero-list="">
              {ordered.map((image, index) => (
                <li className={styles.heroRow} key={image.id}>
                  {/*
                    The list already announces "1 of 10", so the drawn number is decoration for the eye
                    and is hidden from the reader rather than read twice.
                  */}
                  <span className={styles.heroRowIndex} aria-hidden="true">
                    {index + 1}
                  </span>

                  <span className={styles.heroRowThumb}>
                    {/*
                      Association-only imagery: the key was validated against `public/hero` before it
                      was stored, so it cannot name a path outside the generated library.
                    */}
                    <img
                      src={heroImagePath(image.imageKey, 800)}
                      alt=""
                      width={88}
                      height={50}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>

                  {/*
                    The description is the row's label, not a second block under it: the summary states
                    the saved words (or that there are none), so folding the input hides the field and
                    never the fact. A folded optional field is allowed; a folded *required* one is not.
                  */}
                  <details className={styles.heroRowAlt}>
                    <summary>
                      <span className={styles.heroRowAltLabel}>{t('admin.hero.altLabel')}</span>
                      <span className={styles.heroRowAltValue} data-empty={image.altText === null ? 'true' : undefined}>
                        {image.altText ?? t('admin.hero.altNone')}
                      </span>
                    </summary>
                    <form className={styles.heroRowAltForm} action="/api/qbpanel/hero" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="update" />
                      <input type="hidden" name="imageId" value={image.id} />
                      <input
                        className={styles.input}
                        id={`hero-alt-${image.id}`}
                        name="alt"
                        defaultValue={image.altText ?? ''}
                        maxLength={altMax}
                        placeholder={t('admin.hero.altPlaceholder')}
                        aria-label={t('admin.hero.altLabel')}
                        aria-describedby={`hero-alt-help-${image.id}`}
                      />
                      <p className={styles.hint} id={`hero-alt-help-${image.id}`}>
                        {t('admin.hero.altHelp')}
                      </p>
                      <SubmitButton
                        label={t('admin.hero.saveAlt')}
                        pendingLabel={t('admin.common.working')}
                        variant="secondary"
                        small
                      />
                    </form>
                  </details>

                  <div className={styles.heroRowActions}>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t('admin.hero.moveUp', { name: image.altText ?? image.imageKey })}
                    >
                      <AdminIcon name="arrowUp" width={14} height={14} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1}
                      aria-label={t('admin.hero.moveDown', { name: image.altText ?? image.imageKey })}
                    >
                      <AdminIcon name="arrowDown" width={14} height={14} />
                    </button>
                    <ConfirmSubmit
                      action="/api/qbpanel/hero"
                      csrfToken={csrfToken}
                      fields={{ operation: 'remove', imageId: image.id }}
                      triggerLabel={t('admin.hero.remove')}
                      triggerVariant="ghost"
                      disabled={atMinimum}
                      title={t('admin.hero.removeTitle')}
                      body={t('admin.hero.removeBody', { min: minImages })}
                      confirmLabel={t('admin.hero.remove')}
                      cancelLabel={t('admin.common.cancel')}
                      pendingLabel={t('admin.common.working')}
                    />
                  </div>
                </li>
              ))}
            </ol>

            {/*
              The reason a Remove is disabled, said where the disabled control is.

              It used to render as one trailing sentence after the whole list, so with ten banners the
              explanation sat ~4,500px below the greyed-out button it explained. One line under the list
              the owner just read is the same sentence in the place it is needed.
            */}
            {atMinimum && <p className={styles.note}>{t('admin.hero.minimum', { min: minImages })}</p>}
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="hero-add-title" id="hero-add">
        <div className={styles.sectionHead}>
          <h2 id="hero-add-title">{t('admin.hero.addTitle')}</h2>
        </div>

        {atMaximum ? (
          <p className={styles.note}>{t('admin.hero.maximum', { max: maxImages })}</p>
        ) : (
          <form className={styles.formCard} action="/api/qbpanel/hero" method="post" encType="multipart/form-data">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="upload" />
            <div className={styles.field}>
              <label htmlFor="hero-upload-file">{t('admin.hero.uploadTitle')}</label>
              <AdminImageInput id="hero-upload-file" accept="image/jpeg,image/png,image/webp" required />
              <p className={styles.hint}>{t('admin.hero.uploadBody')}</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="hero-upload-alt">
                {t('admin.hero.altLabel')} <em>{t('common.optional')}</em>
              </label>
              <input
                className={styles.input}
                id="hero-upload-alt"
                name="alt"
                maxLength={altMax}
                placeholder={t('admin.hero.altPlaceholder')}
                aria-describedby="hero-upload-alt-help"
              />
              <p className={styles.hint} id="hero-upload-alt-help">
                {t('admin.hero.altHelp')}
              </p>
            </div>
            <div className={styles.formActions}>
              <SubmitButton label={t('admin.hero.uploadSubmit')} pendingLabel={t('admin.common.working')} />
            </div>
          </form>
        )}
      </section>
    </>
  );
}

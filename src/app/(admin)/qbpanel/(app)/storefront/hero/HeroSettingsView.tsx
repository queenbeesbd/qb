'use client';

import { useState } from 'react';

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
 * Settings -> Homepage hero.
 *
 * The storefront's first screen, owned here: which images the carousel shows, and in what order. Two
 * facts stay deliberately separate, as they do on the product gallery:
 *
 * - **Order** is the sequence, 1..n. Movement is done with buttons rather than drag alone, because a
 *   drag-only control cannot be operated with a keyboard or reliably on the phone the owner uses.
 * - **The image** is uploaded from the owner's computer. The server-inventory picker that preceded the
 *   upload was removed on 2026-11-07: two ways to add the same banner made the screen ask a question
 *   the owner should not have to answer.
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
  const dirty = order.join(',') !== images.map((image) => String(image.id)).join(',');

  const atMaximum = images.length >= maxImages;
  const atMinimum = images.length <= minImages;

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    setOrder(next);
  };

  // A move/remove control still needs a name; the key is the one fact every banner always has.
  const nameOf = (image: HeroImageRow): string => image.altText ?? image.imageKey;

  return (
    <>
      <PageHeader title={t('admin.hero.title')} description={t('admin.hero.body')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-labelledby="hero-carousel-editor">
        <div className={styles.sectionHead}>
          <h2 id="hero-carousel-editor">{t('admin.hero.editorTitle')}</h2>
          <p>{t('admin.hero.count', { count: images.length, max: maxImages })}</p>
        </div>

        {ordered.length === 0 ? (
          <p className={styles.note}>{t('admin.hero.empty')}</p>
        ) : (
          <>
            <ol className={styles.galleryList} data-admin-hero-list="">
              {ordered.map((image, index) => (
                <li className={styles.galleryItem} key={image.id}>
                  <span className={styles.heroThumb}>
                    {/*
                      Association-only imagery: the key was validated against `public/hero` before it
                      was stored, so it cannot name a path outside the generated library.
                    */}
                    <img src={heroImagePath(image.imageKey, 800)} alt="" width={160} height={90} loading="lazy" decoding="async" />
                  </span>

                  <div className={styles.galleryBody}>
                    <p className={styles.galleryName}>
                      <span className={styles.heroOrder}>{t('admin.hero.position', { position: index + 1 })}</span>{' '}
                      {image.altText ?? t('admin.hero.altNone')}
                    </p>
                    <p className={styles.galleryMeta}>
                      <span className={styles.mono}>{image.imageKey}</span>
                    </p>

                    <form className={styles.galleryForm} action="/api/qbpanel/hero" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="update" />
                      <input type="hidden" name="imageId" value={image.id} />
                      <div className={styles.field}>
                        <label className={styles.galleryAltLabel} htmlFor={`hero-alt-${image.id}`}>
                          {t('admin.hero.altLabel')} <em>{t('common.optional')}</em>
                        </label>
                        <input
                          className={styles.input}
                          id={`hero-alt-${image.id}`}
                          name="alt"
                          defaultValue={image.altText ?? ''}
                          maxLength={altMax}
                          placeholder={t('admin.hero.altPlaceholder')}
                        />
                      </div>
                      <div className={styles.galleryActions}>
                        <SubmitButton
                          label={t('admin.hero.saveAlt')}
                          pendingLabel={t('admin.common.working')}
                          variant="secondary"
                          small
                        />
                      </div>
                    </form>
                  </div>

                  <div className={styles.galleryControls}>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t('admin.hero.moveUp', { name: nameOf(image) })}
                    >
                      <AdminIcon name="arrowUp" width={14} height={14} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1}
                      aria-label={t('admin.hero.moveDown', { name: nameOf(image) })}
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

            {atMinimum && <p className={styles.note}>{t('admin.hero.minimum', { min: minImages })}</p>}

            {/*
              The order is posted as one repeated field in the arranged sequence, and only appears when
              the owner has actually moved something. Saving it rewrites every dense position in one
              transaction; the carousel reads that order, so no code change is involved.
            */}
            {dirty && (
              <form className={styles.galleryOrderForm} action="/api/qbpanel/hero" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="operation" value="reorder" />
                {order.map((id) => (
                  <input key={id} type="hidden" name="imageId" value={id} />
                ))}
                <p className={styles.galleryOrderNote}>{t('admin.hero.orderPending')}</p>
                <div className={styles.formActions}>
                  <SubmitButton label={t('admin.hero.saveOrder')} pendingLabel={t('admin.common.working')} />
                  <button
                    type="button"
                    className={styles.recordLink}
                    onClick={() => setOrder(images.map((image) => String(image.id)))}
                  >
                    {t('admin.common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="hero-add-title">
        <div className={styles.sectionHead}>
          <h2 id="hero-add-title">{t('admin.hero.addTitle')}</h2>
          <p>{t('admin.hero.addBody')}</p>
        </div>

        {atMaximum ? (
          <p className={styles.note}>{t('admin.hero.maximum', { max: maxImages })}</p>
        ) : (
          <>
            <form
              className={styles.formCard}
              action="/api/qbpanel/hero"
              method="post"
              encType="multipart/form-data"
            >
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="upload" />
              <div className={styles.field}>
                <label htmlFor="hero-upload-file">{t('admin.hero.uploadTitle')}</label>
                <AdminImageInput
                  id="hero-upload-file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
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
                />
                <p className={styles.hint}>{t('admin.hero.altHelp')}</p>
              </div>
              <div className={styles.formActions}>
                <SubmitButton label={t('admin.hero.uploadSubmit')} pendingLabel={t('admin.common.working')} />
              </div>
            </form>

          </>
        )}
      </section>
    </>
  );
}

'use client';

import { useState } from 'react';

import { imageVariantPath } from '@/lib/images';
import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import { ConfirmSubmit } from './ConfirmSubmit';
import { AdminImageInput } from './AdminImageInput';
import { SubmitButton } from './SubmitButton';
import styles from '../admin.module.css';

export type ProductImageRow = {
  id: string;
  key: string;
  altBn: string | null;
  altEn: string | null;
  sortOrder: number;
  isPrimary: boolean;
  rightsStatus: string;
};

/**
 * The product's gallery, with real ordering.
 *
 * The reference lets an owner drag images into order. QueenBee's cannot upload (no object storage is
 * provisioned, and association-only imagery is an approved rule), but **ordering** needs nothing new:
 * `product_image.sort_order` already exists. So this panel does the part that is expressible, and says
 * plainly what it cannot do rather than offering a drop zone that would silently discard a file.
 *
 * Two facts are kept deliberately separate:
 *
 * - **Order** is which photo comes first in the gallery. It is dense (0..n-1) and written in one post.
 * - **Primary** is the image the product *card* uses. Changing one never changes the other, because a
 *   reorder that silently repointed the card would be a storefront change the owner did not ask for.
 *
 * Movement is done with buttons, not drag alone: a drag-only control is unusable with a keyboard and
 * on the phone the owner actually approves orders from. Every button states which image it moves and
 * in which direction, so its accessible name is the action rather than "up".
 */
export function ProductMediaPanel({
  productId,
  images,
  assets,
  csrfToken,
  canManage,
}: {
  productId: number;
  images: readonly ProductImageRow[];
  assets: readonly string[];
  csrfToken: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[]>(images.map((image) => image.id));
  const byId = new Map(images.map((image) => [image.id, image]));

  const ordered = order.map((id) => byId.get(id)).filter((image): image is ProductImageRow => image !== undefined);
  const dirty = order.join(',') !== images.map((image) => image.id).join(',');

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    setOrder(next);
  };

  const nameOf = (image: ProductImageRow): string =>
    image.altEn ?? image.altBn ?? t('admin.catalog.imageUnnamed', { key: image.key });

  return (
    <section className={styles.formCard} aria-labelledby="media-gallery">
      <div className={styles.formCardHead}>
        <h2 id="media-gallery">{t('admin.catalog.imagesTitle')}</h2>
        <p>{t('admin.catalog.imagesBody')}</p>
      </div>

      {canManage && (
        <form
          className={styles.attachForm}
          action="/api/admin/catalog/image"
          method="post"
          encType="multipart/form-data"
        >
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="upload" />
          <input type="hidden" name="productId" value={productId} />
          <div className={styles.field}>
            <label htmlFor="productImageUpload">{t('admin.upload.file')}</label>
            <AdminImageInput
              id="productImageUpload"
              accept="image/jpeg,image/png,image/webp"
              required
            />
            <p className={styles.hint}>{t('admin.catalog.uploadHelp')}</p>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="altEnUpload">{t('admin.catalog.altEn')}</label>
              <input className={styles.input} id="altEnUpload" name="altEn" maxLength={300} />
            </div>
            <div className={styles.field}>
              <label htmlFor="altBnUpload">{t('admin.catalog.altBn')}</label>
              <input className={styles.input} id="altBnUpload" name="altBn" maxLength={300} lang="bn" />
            </div>
          </div>
          <div className={styles.formActions}>
            <SubmitButton
              label={t('admin.catalog.uploadImage')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      )}

      {ordered.length === 0 ? (
        <p className={styles.note}>{t('admin.catalog.noImages')}</p>
      ) : (
        <>
          <ol className={styles.galleryList} data-admin-gallery="">
            {ordered.map((image, index) => (
              <li className={styles.galleryItem} key={image.id}>
                <span className={styles.galleryThumb}>
                  {/*
                    Association-only imagery: the key was validated against the server's own asset
                    inventory before it was stored, so it cannot name a path outside `public/catalog`.
                  */}
                  <img
                    src={imageVariantPath(image.key)}
                    alt=""
                    width={56}
                    height={70}
                    loading="lazy"
                    decoding="async"
                  />
                </span>

                <div className={styles.galleryBody}>
                  <p className={styles.galleryName}>{nameOf(image)}</p>
                  <p className={styles.galleryMeta}>
                    <span className={styles.mono}>{image.key}</span>
                    <span>{t('admin.catalog.galleryPosition', { position: index + 1 })}</span>
                    {image.isPrimary && (
                      <span className={styles.galleryPrimary}>{t('admin.catalog.primaryBadge')}</span>
                    )}
                  </p>

                  <form className={styles.galleryForm} action="/api/admin/catalog/image" method="post">
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="operation" value="update" />
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <input type="hidden" name="sortOrder" value={index} />
                    <div className={styles.galleryAltRow}>
                      <div className={styles.field}>
                        <label className={styles.galleryAltLabel} htmlFor={`altEn-${image.id}`}>
                          {t('admin.catalog.altEn')}
                        </label>
                        <input
                          className={styles.input}
                          id={`altEn-${image.id}`}
                          name="altEn"
                          defaultValue={image.altEn ?? ''}
                          maxLength={300}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.galleryAltLabel} htmlFor={`altBn-${image.id}`}>
                          {t('admin.catalog.altBn')}
                        </label>
                        <input
                          className={styles.input}
                          id={`altBn-${image.id}`}
                          name="altBn"
                          defaultValue={image.altBn ?? ''}
                          maxLength={300}
                          lang="bn"
                        />
                      </div>
                    </div>
                    <div className={styles.galleryActions}>
                      <SubmitButton
                        label={t('admin.catalog.saveAlt')}
                        pendingLabel={t('admin.common.working')}
                        variant="secondary"
                        small
                      />
                      {!image.isPrimary && (
                        <button
                          type="submit"
                          name="isPrimary"
                          value="on"
                          className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}
                        >
                          {t('admin.catalog.makePrimary')}
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                <div className={styles.galleryControls}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t('admin.catalog.moveUp', { name: nameOf(image) })}
                  >
                    <AdminIcon name="arrowUp" width={14} height={14} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                    onClick={() => move(index, 1)}
                    disabled={index === ordered.length - 1}
                    aria-label={t('admin.catalog.moveDown', { name: nameOf(image) })}
                  >
                    <AdminIcon name="arrowDown" width={14} height={14} />
                  </button>
                  {canManage && (
                    <ConfirmSubmit
                      action="/api/admin/catalog/image"
                      csrfToken={csrfToken}
                      fields={{ operation: 'remove', productId, imageId: image.id }}
                      triggerLabel={t('admin.catalog.removeImage')}
                      triggerVariant="ghost"
                      title={t('admin.catalog.removeImage')}
                      body={t('admin.catalog.removeImageConfirm')}
                      confirmLabel={t('admin.catalog.removeImage')}
                      cancelLabel={t('admin.common.cancel')}
                      pendingLabel={t('admin.common.working')}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/*
            The order is posted as one repeated field in the arranged sequence. It only appears when
            the owner has actually moved something, so the panel does not offer a no-op save.
          */}
          {dirty && (
            <form className={styles.galleryOrderForm} action="/api/admin/catalog/image" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="reorder" />
              <input type="hidden" name="productId" value={productId} />
              {order.map((id) => (
                <input key={id} type="hidden" name="imageId" value={id} />
              ))}
              <p className={styles.galleryOrderNote}>{t('admin.catalog.orderPending')}</p>
              <div className={styles.formActions}>
                <SubmitButton label={t('admin.catalog.saveOrder')} pendingLabel={t('admin.common.working')} />
                <button
                  type="button"
                  className={styles.recordLink}
                  onClick={() => setOrder(images.map((image) => image.id))}
                >
                  {t('admin.common.cancel')}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {canManage && (
        <p className={styles.hint}>{t('admin.catalog.attachedLibrary')}</p>
      )}

      {assets.length === 0 ? (
        <p className={styles.note}>{t('admin.catalog.assetsEmpty')}</p>
      ) : (
        <details className={styles.attachDetails}>
          <summary>{t('admin.catalog.attachExisting')}</summary>
          <form className={styles.attachForm} action="/api/admin/catalog/image" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="attach" />
            <input type="hidden" name="productId" value={productId} />
            <div className={styles.field}>
              <label htmlFor="key">{t('admin.catalog.imageKey')}</label>
              <select className={styles.select} id="key" name="key" required defaultValue="">
                <option value="" disabled>
                  {t('admin.catalog.field.choose')}
                </option>
                {assets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>{t('admin.catalog.imageKeyHelp')}</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="altEnNew">{t('admin.catalog.altEn')}</label>
                <input className={styles.input} id="altEnNew" name="altEn" maxLength={300} />
              </div>
              <div className={styles.field}>
                <label htmlFor="altBnNew">{t('admin.catalog.altBn')}</label>
                <input className={styles.input} id="altBnNew" name="altBn" maxLength={300} lang="bn" />
              </div>
            </div>
            <div className={styles.formActions}>
              <SubmitButton
                label={t('admin.catalog.attachImage')}
                pendingLabel={t('admin.common.working')}
                variant="secondary"
              />
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

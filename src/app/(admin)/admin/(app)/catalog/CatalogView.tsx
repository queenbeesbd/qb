'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { formatMoney } from '@/lib/money';
import styles from '../../admin.module.css';

export type CatalogProductRow = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  categoryNameEn: string;
  brandNameEn: string;
  availability: string;
  isPublished: boolean;
  priceMinor: number | null;
  imageCount: number;
  primaryImageKey: string | null;
};

export type CatalogCategoryOption = { id: number; nameEn: string };
export type CatalogBrandOption = { id: number; nameEn: string };

export type CatalogImageRow = {
  id: string;
  key: string;
  altBn: string | null;
  altEn: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

export type CatalogEditing = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  packSize: string | null;
  categoryId: number;
  brandId: number;
  availability: string;
  isPublished: boolean;
  priceMinor: number | null;
  compareAtPriceMinor: number | null;
  sku: string | null;
  images: CatalogImageRow[];
};

export type CatalogNotice =
  | 'created'
  | 'updated'
  | 'availability'
  | 'archived'
  | 'brandCreated'
  | 'imageAttached'
  | 'imageUpdated'
  | 'imageRemoved'
  | 'denied'
  | 'conflict'
  | 'invalid';

const NOTICE_KEYS: Record<CatalogNotice, TranslationKey> = {
  created: 'admin.catalog.notice.created',
  updated: 'admin.catalog.notice.updated',
  availability: 'admin.catalog.notice.availability',
  archived: 'admin.catalog.notice.archived',
  brandCreated: 'admin.catalog.notice.brandCreated',
  imageAttached: 'admin.catalog.notice.imageAttached',
  imageUpdated: 'admin.catalog.notice.imageUpdated',
  imageRemoved: 'admin.catalog.notice.imageRemoved',
  denied: 'admin.catalog.notice.denied',
  conflict: 'admin.catalog.notice.conflict',
  invalid: 'admin.catalog.notice.invalid',
};

const ERROR_NOTICES: readonly CatalogNotice[] = ['denied', 'conflict', 'invalid'];

/** Integer poisha to an editable BDT string. No float arithmetic: the fraction is the remainder. */
function toBdtInput(minor: number | null): string {
  if (minor === null) return '';
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Products.
 *
 * The availability control is the point of this screen: one button per product that flips In Stock to
 * Out of Stock and back. It is a plain form post to a route that re-checks the permission, validates the
 * value against the two documented states and audits the change - so the control is a convenience and
 * the server is the authority.
 *
 * Every destructive action asks for confirmation before submitting, because archiving a product or
 * removing an image cannot be undone from this screen.
 */
export function CatalogView({
  products,
  categories,
  brands,
  assets,
  editing,
  notice,
  canManage,
  csrfToken,
}: {
  products: readonly CatalogProductRow[];
  categories: readonly CatalogCategoryOption[];
  brands: readonly CatalogBrandOption[];
  assets: readonly string[];
  editing: CatalogEditing | null;
  notice: CatalogNotice | null;
  canManage: boolean;
  csrfToken: string;
}) {
  const { t, locale } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);

  const formFields = (values: {
    slug?: string;
    nameBn?: string;
    nameEn?: string;
    descriptionBn?: string | null;
    descriptionEn?: string | null;
    packSize?: string | null;
    categoryId?: number;
    brandId?: number;
    priceMinor?: number | null;
    compareAtPriceMinor?: number | null;
    sku?: string | null;
    availability?: string;
    isPublished?: boolean;
  }) => (
    <>
      <div className={styles.field}>
        <label htmlFor="nameBn">{t('admin.catalog.field.nameBn')}</label>
        <input id="nameBn" name="nameBn" required maxLength={200} defaultValue={values.nameBn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="nameEn">{t('admin.catalog.field.nameEn')}</label>
        <input id="nameEn" name="nameEn" required maxLength={200} defaultValue={values.nameEn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="slug">{t('admin.catalog.field.slug')}</label>
        <input id="slug" name="slug" defaultValue={values.slug ?? ''} />
        <p className={styles.hint}>{t('admin.catalog.field.slugHelp')}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="descriptionBn">{t('admin.catalog.field.descriptionBn')}</label>
        <textarea id="descriptionBn" name="descriptionBn" rows={3} defaultValue={values.descriptionBn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="descriptionEn">{t('admin.catalog.field.descriptionEn')}</label>
        <textarea id="descriptionEn" name="descriptionEn" rows={3} defaultValue={values.descriptionEn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryId">{t('admin.catalog.field.category')}</label>
        <select id="categoryId" name="categoryId" required defaultValue={values.categoryId ?? ''}>
          <option value="" disabled>
            —
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameEn}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="brandId">{t('admin.catalog.field.brand')}</label>
        <select id="brandId" name="brandId" required defaultValue={values.brandId ?? ''}>
          <option value="" disabled>
            —
          </option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.nameEn}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="packSize">{t('admin.catalog.field.packSize')}</label>
        <input id="packSize" name="packSize" maxLength={80} defaultValue={values.packSize ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="price">{t('admin.catalog.field.price')}</label>
        <input
          id="price"
          name="price"
          required
          inputMode="decimal"
          defaultValue={toBdtInput(values.priceMinor ?? null)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="compareAtPrice">{t('admin.catalog.field.compareAtPrice')}</label>
        <input
          id="compareAtPrice"
          name="compareAtPrice"
          inputMode="decimal"
          defaultValue={toBdtInput(values.compareAtPriceMinor ?? null)}
        />
        <p className={styles.hint}>{t('admin.catalog.field.compareAtPriceHelp')}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="sku">{t('admin.catalog.field.sku')}</label>
        <input id="sku" name="sku" maxLength={64} defaultValue={values.sku ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="availability">{t('admin.catalog.field.availability')}</label>
        <select id="availability" name="availability" defaultValue={values.availability ?? 'out_of_stock'}>
          <option value="in_stock">{t('admin.catalog.inStock')}</option>
          <option value="out_of_stock">{t('admin.catalog.outOfStock')}</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="isPublished">
          <input id="isPublished" name="isPublished" type="checkbox" defaultChecked={values.isPublished ?? false} />{' '}
          {t('admin.catalog.field.isPublished')}
        </label>
      </div>
    </>
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.catalog.title')}</h1>
          <p>{t('admin.catalog.body')}</p>
        </div>

        {notice !== null && (
          <p className={noticeIsError ? `${styles.alert} ${styles.alertError}` : `${styles.alert} ${styles.alertSuccess}`}>
            {t(NOTICE_KEYS[notice])}
          </p>
        )}

        <div className={styles.panel}>
          <h2>{t('admin.catalog.availabilityTitle')}</h2>
          <p className={styles.note}>{t('admin.catalog.availabilityBody')}</p>
        </div>
      </section>

      {canManage && editing === null && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.catalog.createTitle')}</h2>
          </div>
          {categories.length === 0 || brands.length === 0 ? (
            <p className={styles.note}>{t('admin.catalog.notice.conflict')}</p>
          ) : (
            <form className={styles.form} action="/api/admin/catalog/product" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="create" />
              {formFields({})}
              <button type="submit" className={styles.button}>
                {t('admin.catalog.create')}
              </button>
            </form>
          )}
        </section>
      )}

      {canManage && editing !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.catalog.editTitle')}</h2>
            <p className={styles.note}>
              <Link href="/admin/catalog">{t('admin.catalog.editCancel')}</Link>
            </p>
          </div>
          <form className={styles.form} action="/api/admin/catalog/product" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="productId" value={editing.id} />
            {formFields({
              slug: editing.slug,
              nameBn: editing.nameBn,
              nameEn: editing.nameEn,
              descriptionBn: editing.descriptionBn,
              descriptionEn: editing.descriptionEn,
              packSize: editing.packSize,
              categoryId: editing.categoryId,
              brandId: editing.brandId,
              priceMinor: editing.priceMinor,
              compareAtPriceMinor: editing.compareAtPriceMinor,
              sku: editing.sku,
              availability: editing.availability,
              isPublished: editing.isPublished,
            })}
            <button type="submit" className={styles.button}>
              {t('admin.catalog.save')}
            </button>
          </form>

          <div className={styles.sectionHead}>
            <h2>{t('admin.catalog.imagesTitle')}</h2>
            <p>{t('admin.catalog.imagesBody')}</p>
          </div>

          {editing.images.length === 0 ? (
            <p className={styles.note}>{t('admin.catalog.noImages')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('admin.catalog.imageKey')}</th>
                    <th>{t('admin.catalog.altBn')}</th>
                    <th>{t('admin.catalog.altEn')}</th>
                    <th>{t('admin.catalog.imageOrder')}</th>
                    <th>{t('admin.catalog.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {editing.images.map((image) => (
                    <tr key={image.id}>
                      <td>
                        <span className={styles.mono}>{image.key}</span>
                        {image.isPrimary && (
                          <>
                            {' '}
                            <span className={styles.tag}>{t('admin.catalog.primaryBadge')}</span>
                          </>
                        )}
                      </td>
                      <td colSpan={4}>
                        <form className={styles.inlineForm} action="/api/admin/catalog/image" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="operation" value="update" />
                          <input type="hidden" name="productId" value={editing.id} />
                          <input type="hidden" name="imageId" value={image.id} />
                          <input name="altBn" defaultValue={image.altBn ?? ''} aria-label={t('admin.catalog.altBn')} />
                          <input name="altEn" defaultValue={image.altEn ?? ''} aria-label={t('admin.catalog.altEn')} />
                          <input
                            name="sortOrder"
                            defaultValue={image.sortOrder}
                            inputMode="numeric"
                            size={3}
                            aria-label={t('admin.catalog.imageOrder')}
                          />
                          <label className={styles.hint}>
                            <input type="checkbox" name="isPrimary" defaultChecked={image.isPrimary} />{' '}
                            {t('admin.catalog.imagePrimary')}
                          </label>
                          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
                            {t('admin.catalog.updateImage')}
                          </button>
                        </form>
                        <form
                          className={styles.inlineForm}
                          action="/api/admin/catalog/image"
                          method="post"
                          onSubmit={(event) => {
                            if (!window.confirm(t('admin.catalog.removeImageConfirm'))) event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="operation" value="remove" />
                          <input type="hidden" name="productId" value={editing.id} />
                          <input type="hidden" name="imageId" value={image.id} />
                          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
                            {t('admin.catalog.removeImage')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {assets.length === 0 ? (
            <p className={styles.note}>{t('admin.catalog.assetsEmpty')}</p>
          ) : (
            <form className={styles.form} action="/api/admin/catalog/image" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="attach" />
              <input type="hidden" name="productId" value={editing.id} />
              <div className={styles.field}>
                <label htmlFor="key">{t('admin.catalog.imageKey')}</label>
                <select id="key" name="key" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {assets.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="altBnNew">{t('admin.catalog.altBn')}</label>
                <input id="altBnNew" name="altBn" />
              </div>
              <div className={styles.field}>
                <label htmlFor="altEnNew">{t('admin.catalog.altEn')}</label>
                <input id="altEnNew" name="altEn" />
              </div>
              <button type="submit" className={styles.button}>
                {t('admin.catalog.attachImage')}
              </button>
            </form>
          )}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.catalog.listTitle')}</h2>
        </div>

        {products.length === 0 ? (
          <p className={styles.empty}>{t('admin.catalog.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin.catalog.field.nameEn')}</th>
                  <th>{t('admin.catalog.field.category')}</th>
                  <th>{t('admin.catalog.field.brand')}</th>
                  <th>{t('admin.catalog.field.price')}</th>
                  <th>{t('admin.catalog.field.availability')}</th>
                  <th>{t('admin.catalog.published')}</th>
                  <th>{t('admin.catalog.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const inStock = product.availability === 'in_stock';
                  return (
                    <tr key={product.id}>
                      <td>
                        {product.nameEn}
                        <br />
                        <span className={styles.mono}>{product.slug}</span>
                      </td>
                      <td>{product.categoryNameEn}</td>
                      <td>{product.brandNameEn}</td>
                      <td>{product.priceMinor === null ? '—' : formatMoney(product.priceMinor, locale)}</td>
                      <td>
                        {inStock ? (
                          <span className={styles.tag}>{t('admin.catalog.inStock')}</span>
                        ) : (
                          <span className={`${styles.tag} ${styles.tagWarn}`}>{t('admin.catalog.outOfStock')}</span>
                        )}
                      </td>
                      <td>
                        {product.isPublished ? (
                          t('admin.catalog.published')
                        ) : (
                          <span className={styles.tagMuted}>{t('admin.catalog.unpublished')}</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.inlineForm}>
                          <Link href={`/admin/catalog?edit=${product.id}`}>{t('admin.catalog.edit')}</Link>
                          {canManage && (
                            <>
                              <form className={styles.inlineForm} action="/api/admin/catalog/availability" method="post">
                                <input type="hidden" name="csrf" value={csrfToken} />
                                <input type="hidden" name="productId" value={product.id} />
                                <input type="hidden" name="availability" value={inStock ? 'out_of_stock' : 'in_stock'} />
                                <button
                                  type="submit"
                                  className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                                >
                                  {inStock ? t('admin.catalog.markOutOfStock') : t('admin.catalog.markInStock')}
                                </button>
                              </form>
                              <form
                                className={styles.inlineForm}
                                action="/api/admin/catalog/product"
                                method="post"
                                onSubmit={(event) => {
                                  if (!window.confirm(t('admin.catalog.archiveConfirm'))) event.preventDefault();
                                }}
                              >
                                <input type="hidden" name="csrf" value={csrfToken} />
                                <input type="hidden" name="operation" value="archive" />
                                <input type="hidden" name="productId" value={product.id} />
                                <button
                                  type="submit"
                                  className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                                >
                                  {t('admin.catalog.archive')}
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.catalog.brandTitle')}</h2>
            <p>{t('admin.catalog.brandBody')}</p>
          </div>
          <form className={styles.form} action="/api/admin/catalog/brand" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <div className={styles.field}>
              <label htmlFor="brandNameBn">{t('admin.catalog.field.nameBn')}</label>
              <input id="brandNameBn" name="nameBn" required maxLength={80} />
            </div>
            <div className={styles.field}>
              <label htmlFor="brandNameEn">{t('admin.catalog.field.nameEn')}</label>
              <input id="brandNameEn" name="nameEn" required maxLength={80} />
            </div>
            <button type="submit" className={styles.button}>
              {t('admin.catalog.brandSubmit')}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

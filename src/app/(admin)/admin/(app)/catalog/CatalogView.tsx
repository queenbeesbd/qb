'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { buildQueryHref } from '@/lib/admin-query';
import { formatMoney } from '@/lib/money';
import { AdminIcon } from '../../_ui/icons';
import { AvailabilitySwitch } from '../../_ui/AvailabilitySwitch';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill } from '../../_ui/StatusPill';
import { SubmitButton } from '../../_ui/SubmitButton';
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
 * One surface for browsing, filtering and editing: the list stays visible while one product opens in
 * the form above it, so the owner never loses their place. Availability is a switch on each row - the
 * single most-changed field - and it posts the same guarded endpoint. Archiving is deliberate and
 * confirmed; nothing here is bulk.
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
  search,
  stock,
  creating,
  total,
  page,
  pageCount,
  size,
  defaultSize,
  clearHref,
}: {
  products: readonly CatalogProductRow[];
  categories: readonly CatalogCategoryOption[];
  brands: readonly CatalogBrandOption[];
  assets: readonly string[];
  editing: CatalogEditing | null;
  notice: CatalogNotice | null;
  canManage: boolean;
  csrfToken: string;
  search: string;
  stock: 'all' | 'in_stock' | 'out_of_stock';
  creating: boolean;
  /** Total matching the current filters, so the footer can state what the page is not showing. */
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  clearHref: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);
  const filtering = search !== '' || stock !== 'all';

  /*
   * Every list link is built from the same state, and none of them carries `page`: changing what is
   * shown returns to page 1 instead of landing on an empty later page.
   */
  const withQuery = (next: { stock?: string; q?: string }): string =>
    buildQueryHref('/admin/catalog', {
      q: next.q ?? search,
      stock: (next.stock ?? stock) === 'all' ? '' : (next.stock ?? stock),
      size: size === defaultSize ? '' : size,
    });

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
    <div className={styles.form}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('admin.catalog.sectionNames')}</legend>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="nameEn">{t('admin.catalog.field.nameEn')}</label>
            <input className={styles.input} id="nameEn" name="nameEn" required maxLength={200} defaultValue={values.nameEn ?? ''} />
          </div>
          <div className={styles.field}>
            <label htmlFor="nameBn">{t('admin.catalog.field.nameBn')}</label>
            <input className={styles.input} id="nameBn" name="nameBn" required maxLength={200} defaultValue={values.nameBn ?? ''} />
          </div>
          <div className={styles.field}>
            <label htmlFor="slug">{t('admin.catalog.field.slug')}</label>
            <input className={styles.input} id="slug" name="slug" defaultValue={values.slug ?? ''} />
            <p className={styles.hint}>{t('admin.catalog.field.slugHelp')}</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="packSize">{t('admin.catalog.field.packSize')}</label>
            <input className={styles.input} id="packSize" name="packSize" maxLength={80} defaultValue={values.packSize ?? ''} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="descriptionEn">{t('admin.catalog.field.descriptionEn')}</label>
          <textarea className={styles.textarea} id="descriptionEn" name="descriptionEn" rows={3} defaultValue={values.descriptionEn ?? ''} />
        </div>
        <div className={styles.field}>
          <label htmlFor="descriptionBn">{t('admin.catalog.field.descriptionBn')}</label>
          <textarea className={styles.textarea} id="descriptionBn" name="descriptionBn" rows={3} defaultValue={values.descriptionBn ?? ''} />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('admin.catalog.sectionClassification')}</legend>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="categoryId">{t('admin.catalog.field.category')}</label>
            <select className={styles.select} id="categoryId" name="categoryId" required defaultValue={values.categoryId ?? ''}>
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
            <select className={styles.select} id="brandId" name="brandId" required defaultValue={values.brandId ?? ''}>
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
            <label htmlFor="sku">{t('admin.catalog.field.sku')}</label>
            <input className={styles.input} id="sku" name="sku" maxLength={64} defaultValue={values.sku ?? ''} />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('admin.catalog.sectionPricing')}</legend>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="price">{t('admin.catalog.field.price')}</label>
            <input className={styles.input} id="price" name="price" required inputMode="decimal" defaultValue={toBdtInput(values.priceMinor ?? null)} />
            <p className={styles.hint}>{t('admin.catalog.field.priceHelp')}</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="compareAtPrice">{t('admin.catalog.field.compareAtPrice')}</label>
            <input className={styles.input} id="compareAtPrice" name="compareAtPrice" inputMode="decimal" defaultValue={toBdtInput(values.compareAtPriceMinor ?? null)} />
            <p className={styles.hint}>{t('admin.catalog.field.compareAtPriceHelp')}</p>
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('admin.catalog.sectionStatus')}</legend>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="availability">{t('admin.catalog.field.availability')}</label>
            <select className={styles.select} id="availability" name="availability" defaultValue={values.availability ?? 'out_of_stock'}>
              <option value="in_stock">{t('admin.catalog.inStock')}</option>
              <option value="out_of_stock">{t('admin.catalog.outOfStock')}</option>
            </select>
          </div>
          <label className={styles.checkboxRow} htmlFor="isPublished">
            <input id="isPublished" name="isPublished" type="checkbox" defaultChecked={values.isPublished ?? false} />
            {t('admin.catalog.field.isPublished')}
          </label>
        </div>
      </fieldset>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.commerce')}
        title={editing === null ? t('admin.catalog.title') : t('admin.catalog.editTitle')}
        description={editing === null ? t('admin.catalog.body') : t('admin.catalog.editBody')}
        actions={
          editing === null ? (
            <Link className={styles.button} href="/admin/catalog?new=1">
              <AdminIcon name="plus" width={15} height={15} />
              {t('admin.catalog.newProduct')}
            </Link>
          ) : (
            <Link className={styles.buttonSecondary} href={withQuery({})}>
              {t('admin.catalog.editCancel')}
            </Link>
          )
        }
      />

      {notice !== null && (
        <Notice tone={noticeIsError ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      {canManage && editing !== null && (
        <section className={styles.section} aria-labelledby="edit-heading">
          <div className={styles.sectionHead}>
            <h2 id="edit-heading">{t('admin.catalog.editTitle')}</h2>
            <p className={styles.mono}>{editing.slug}</p>
          </div>
          <form className={styles.panel} action="/api/admin/catalog/product" method="post">
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
            <div className={styles.formActions}>
              <SubmitButton label={t('admin.catalog.save')} pendingLabel={t('admin.common.working')} />
              <Link className={styles.recordLink} href={withQuery({})}>
                {t('admin.common.cancel')}
              </Link>
            </div>
          </form>

          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.catalog.imagesTitle')}</h2>
              <p>{t('admin.catalog.imagesBody')}</p>
            </div>
          </div>

          {editing.images.length === 0 ? (
            <p className={styles.note}>{t('admin.catalog.noImages')}</p>
          ) : (
            <ul className={styles.recordList}>
              {editing.images.map((image) => (
                <li className={styles.record} key={image.id}>
                  <span className={styles.recordThumb} aria-hidden="true">
                    {image.sortOrder + 1}
                  </span>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>
                      <span className={styles.mono}>{image.key}</span>{' '}
                      {image.isPrimary && <StatusPill tone="info">{t('admin.catalog.primaryBadge')}</StatusPill>}
                    </span>
                    <form className={styles.inlineForm} action="/api/admin/catalog/image" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="update" />
                      <input type="hidden" name="productId" value={editing.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <input
                        className={styles.input}
                        name="altBn"
                        defaultValue={image.altBn ?? ''}
                        aria-label={t('admin.catalog.altBn')}
                        placeholder={t('admin.catalog.altBn')}
                      />
                      <input
                        className={styles.input}
                        name="altEn"
                        defaultValue={image.altEn ?? ''}
                        aria-label={t('admin.catalog.altEn')}
                        placeholder={t('admin.catalog.altEn')}
                      />
                      <input
                        className={styles.input}
                        name="sortOrder"
                        defaultValue={image.sortOrder}
                        inputMode="numeric"
                        size={3}
                        aria-label={t('admin.catalog.imageOrder')}
                      />
                      <label className={styles.checkboxRow}>
                        <input type="checkbox" name="isPrimary" defaultChecked={image.isPrimary} />{' '}
                        {t('admin.catalog.imagePrimary')}
                      </label>
                      <SubmitButton
                        label={t('admin.catalog.updateImage')}
                        pendingLabel={t('admin.common.working')}
                        variant="secondary"
                        small
                      />
                    </form>
                  </div>
                  <div className={styles.recordSide}>
                    <ConfirmSubmit
                      action="/api/admin/catalog/image"
                      csrfToken={csrfToken}
                      fields={{ operation: 'remove', productId: editing.id, imageId: image.id }}
                      triggerLabel={t('admin.catalog.removeImage')}
                      title={t('admin.catalog.removeImage')}
                      body={t('admin.catalog.removeImageConfirm')}
                      confirmLabel={t('admin.catalog.removeImage')}
                      cancelLabel={t('admin.common.cancel')}
                      pendingLabel={t('admin.common.working')}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {assets.length === 0 ? (
            <p className={styles.note}>{t('admin.catalog.assetsEmpty')}</p>
          ) : (
            <form className={styles.panel} action="/api/admin/catalog/image" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="attach" />
              <input type="hidden" name="productId" value={editing.id} />
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="key">{t('admin.catalog.imageKey')}</label>
                  <select className={styles.select} id="key" name="key" required defaultValue="">
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
                  <input className={styles.input} id="altBnNew" name="altBn" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="altEnNew">{t('admin.catalog.altEn')}</label>
                  <input className={styles.input} id="altEnNew" name="altEn" />
                </div>
              </div>
              <div className={styles.formActions} style={{ marginTop: 'var(--space-4)' }}>
                <SubmitButton label={t('admin.catalog.attachImage')} pendingLabel={t('admin.common.working')} variant="secondary" />
              </div>
            </form>
          )}
        </section>
      )}

      {canManage && editing === null && (categories.length === 0 || brands.length === 0) && (
        <Notice tone="warning">{t('admin.catalog.notice.conflict')}</Notice>
      )}

      {canManage && editing === null && creating && categories.length > 0 && brands.length > 0 && (
        <section className={styles.section} aria-labelledby="create-heading">
          <div className={styles.sectionHead}>
            <h2 id="create-heading">{t('admin.catalog.createTitle')}</h2>
            <Link className={styles.recordLink} href="/admin/catalog">
              {t('admin.common.cancel')}
            </Link>
          </div>
          <form className={styles.panel} action="/api/admin/catalog/product" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="create" />
            {formFields({})}
            <div className={styles.formActions}>
              <SubmitButton label={t('admin.catalog.create')} pendingLabel={t('admin.common.working')} />
            </div>
          </form>
        </section>
      )}

      {editing === null && (
        <section className={styles.section} aria-labelledby="list-heading">
          <div className={styles.sectionHead}>
            <h2 id="list-heading">{t('admin.catalog.listTitle')}</h2>
            <p>{t('admin.catalog.listBody')}</p>
          </div>

          <ListToolbar>
            <FilterTabs
              label={t('admin.catalog.filterLabel')}
              active={stock}
              options={[
                { value: 'all', label: t('admin.common.all'), href: withQuery({ stock: 'all' }) },
                { value: 'in_stock', label: t('admin.catalog.inStock'), href: withQuery({ stock: 'in_stock' }) },
                {
                  value: 'out_of_stock',
                  label: t('admin.catalog.outOfStock'),
                  href: withQuery({ stock: 'out_of_stock' }),
                },
              ]}
            />

            <ListSearch
              action="/admin/catalog"
              id="catalog-search"
              label={t('admin.catalog.searchLabel')}
              placeholder={t('admin.catalog.searchPlaceholder')}
              value={search}
              hidden={{ stock: stock === 'all' ? '' : stock, size: size === defaultSize ? '' : String(size) }}
              clearHref={clearHref}
              dirty={filtering}
            />
          </ListToolbar>

          {products.length === 0 ? (
            <EmptyState
              icon="package"
              title={filtering ? t('admin.catalog.emptyFilteredTitle') : t('admin.catalog.emptyTitle')}
              body={filtering ? t('admin.catalog.emptyFilteredBody') : t('admin.catalog.emptyBody')}
              action={
                filtering ? (
                  <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                    {t('admin.common.clear')}
                  </Link>
                ) : null
              }
            />
          ) : (
            <ul className={styles.recordList} data-admin-list="">
              {products.map((product) => {
                return (
                  <li className={styles.record} key={product.id}>
                    <span className={styles.recordThumb} aria-hidden="true">
                      {product.nameEn.slice(0, 1).toUpperCase()}
                    </span>
                    <div className={styles.recordMain}>
                      <span className={styles.recordTitle}>{product.nameEn}</span>
                      <span className={styles.recordMeta}>
                        <span>{product.categoryNameEn}</span>
                        <span>{product.brandNameEn}</span>
                        <span className={styles.mono}>{product.slug}</span>
                        {!product.isPublished && <span className={styles.tagMuted}>{t('admin.catalog.unpublished')}</span>}
                        {product.imageCount === 0 && <span className={styles.tagWarn}>{t('admin.catalog.noImagesBadge')}</span>}
                      </span>
                    </div>
                    <div className={styles.recordSide}>
                      <span className={styles.recordPrice}>
                        {product.priceMinor === null ? '—' : formatMoney(product.priceMinor)}
                      </span>
                      <AvailabilitySwitch
                        productId={product.id}
                        productName={product.nameEn}
                        availability={product.availability}
                        csrfToken={csrfToken}
                        canManage={canManage}
                      />
                      <div className={styles.recordActions}>
                        <Link className={styles.recordLink} href={`/admin/catalog?edit=${product.id}`}>
                          {t('admin.catalog.edit')}
                        </Link>
                        {canManage && (
                          <ConfirmSubmit
                            action="/api/admin/catalog/product"
                            csrfToken={csrfToken}
                            fields={{ operation: 'archive', productId: product.id }}
                            triggerLabel={t('admin.catalog.archive')}
                            triggerVariant="ghost"
                            title={t('admin.catalog.archive')}
                            body={t('admin.catalog.archiveConfirm')}
                            confirmLabel={t('admin.catalog.archive')}
                            cancelLabel={t('admin.common.cancel')}
                            pendingLabel={t('admin.common.working')}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {products.length > 0 && (
            <Pagination
              basePath="/admin/catalog"
              query={{
                q: search,
                stock: stock === 'all' ? '' : stock,
                size: size === defaultSize ? '' : String(size),
              }}
              page={page}
              pageCount={pageCount}
              shown={products.length}
              total={total}
              size={size}
              defaultSize={defaultSize}
            />
          )}
        </section>
      )}

      {canManage && editing === null && (
        <section className={styles.section} aria-label={t('admin.catalog.brandTitle')}>
          <details className={`${styles.panel} ${styles.detailsPanel}`}>
            <summary>{t('admin.catalog.brandTitle')}</summary>
            <p className={styles.note} style={{ marginBottom: 'var(--space-4)' }}>
              {t('admin.catalog.brandBody')}
            </p>
            <form className={`${styles.form} ${styles.formNarrow}`} action="/api/admin/catalog/brand" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="brandNameEn">{t('admin.catalog.field.nameEn')}</label>
                  <input className={styles.input} id="brandNameEn" name="nameEn" required maxLength={80} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="brandNameBn">{t('admin.catalog.field.nameBn')}</label>
                  <input className={styles.input} id="brandNameBn" name="nameBn" required maxLength={80} />
                </div>
              </div>
              <div className={styles.formActions}>
                <SubmitButton label={t('admin.catalog.brandSubmit')} pendingLabel={t('admin.common.working')} variant="secondary" />
              </div>
            </form>
          </details>
        </section>
      )}
    </>
  );
}

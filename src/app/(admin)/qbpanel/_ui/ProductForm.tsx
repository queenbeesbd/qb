'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { slugPreview } from '@/lib/slug-preview';
import { parseBdtInput } from '@/lib/money';
import { discountAmount, discountPercent, formatMoney } from '@/lib/money';
import { MAX_PRODUCT_IMAGES } from '@/lib/upload-limits';
import { AdminIcon } from './icons';
import { ProductMediaUploader, type PreparedProductImage, type ProductUploadImage } from './ProductMediaUploader';
import { RequiredMark } from './RequiredMark';
import { SubmitButton } from './SubmitButton';
import styles from '../qbpanel.module.css';

export type ProductFormValues = {
  slug?: string;
  /** Optional owner content; null means the product has no Bangla name. */
  nameBn?: string | null;
  nameEn?: string;
  shortDescription?: string | null;
  descriptionBn?: string | null;
  descriptionEn?: string | null;
  packSize?: string | null;
  /** Optional per-area delivery charges in poisha; null/absent means the store's charge applies. */
  deliveryChattogramMinor?: number | null;
  deliveryDhakaMinor?: number | null;
  deliveryOthersMinor?: number | null;
  categoryId?: number;
  brandId?: number;
  priceMinor?: number | null;
  compareAtPriceMinor?: number | null;
  sku?: string | null;
  availability?: string;
  isPublished?: boolean;
  /** The photograph a saved product already puts on its card, if it has one. */
  primaryImageKey?: string | null;
};

export type ProductFormCategory = { id: number; nameEn: string; productCount: number };
export type ProductFormBrand = { id: number; nameEn: string };

/** Integer poisha to an editable BDT string. No float arithmetic: the fraction is the remainder. */
function toBdtInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}


/**
 * The product editor.
 *
 * One page, two columns, in the shape the reference uses and the owner asked to match: the copy and
 * media on the left, the commercial facts on the right, a live preview of the storefront card, and a
 * sticky action bar so Save is never scrolled away from.
 *
 * Four rules this form is built to, each of which the reference gets wrong and this project cannot:
 *
 * 1. **A required field is never hidden.** Nothing is behind a collapsed disclosure, and the required
 *    set is stated once at the top rather than inferred from asterisks.
 * 2. **The live preview never invents.** It shows only what the owner has typed: no placeholder price,
 *    no "New" badge, no stock count. An empty price renders as "no price yet".
 * 3. **Prices are typed, never computed.** The saving is *derived* from the two typed amounts and
 *    disappears when the comparison price is not genuinely higher - the same rule the storefront uses.
 * 4. **Every counter is real.** The character counts are `maxLength` values from the same bounds the
 *    server enforces, so the counter cannot promise room the save will refuse.
 *
 * The form posts to the same guarded route it always did: this is a presentation and information-
 * architecture change, not a new write path.
 */
export function ProductForm({
  mode,
  values,
  categories,
  brands,
  csrfToken,
  productId,
  cancelHref,
  notice,
}: {
  mode: 'create' | 'edit';
  values: ProductFormValues;
  categories: readonly ProductFormCategory[];
  brands: readonly ProductFormBrand[];
  csrfToken: string;
  productId?: number;
  cancelHref: string;
  notice?: React.ReactNode;
}) {
  const { t } = useTranslation();

  const [nameEn, setNameEn] = useState(values.nameEn ?? '');
  const [nameBn, setNameBn] = useState(values.nameBn ?? '');
  const [shortDescription, setShortDescription] = useState(values.shortDescription ?? '');
  const [packSize, setPackSize] = useState(values.packSize ?? '');
  const [slug, setSlug] = useState(values.slug ?? '');
  const [price, setPrice] = useState(toBdtInput(values.priceMinor));
  const [compareAt, setCompareAt] = useState(toBdtInput(values.compareAtPriceMinor));
  const [categoryId, setCategoryId] = useState(String(values.categoryId ?? ''));
  const [brandId, setBrandId] = useState(String(values.brandId ?? ''));
  const [availability, setAvailability] = useState(values.availability ?? 'out_of_stock');
  const [isPublished, setIsPublished] = useState(values.isPublished ?? false);

  const formRef = useRef<HTMLFormElement>(null);
  /*
   * A submit that the browser refuses is otherwise invisible: the page does not move, nothing is
   * announced, and the owner is left guessing. `blocked` names the fields the browser rejected so the
   * form can say what is missing in the same words the summary uses.
   */
  const [blocked, setBlocked] = useState<string[]>([]);

  /*
   * Photographs chosen with the product, before it exists.
   *
   * The files post as part of this form; the server creates the product and attaches them in one
   * request. The object URLs are the browser's preview of the chosen bytes - nothing has been
   * uploaded yet, which is why they are revoked when a photograph is removed.
   */
  const [uploads, setUploads] = useState<ProductUploadImage[]>([]);
  const uploadsRef = useRef<ProductUploadImage[]>([]);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  useEffect(
    () => () => {
      for (const image of uploadsRef.current) URL.revokeObjectURL(image.url);
    },
    [],
  );

  const addUploads = (files: readonly PreparedProductImage[]): void => {
    setUploads((current) => [
      ...current,
      ...files.map(({ file, name }) => ({
        id: crypto.randomUUID(),
        file,
        name,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeUpload = (id: string): void => {
    setUploads((current) =>
      current.flatMap((image) => {
        if (image.id !== id) return [image];
        URL.revokeObjectURL(image.url);
        return [];
      }),
    );
  };

  const moveUpload = (id: string, direction: -1 | 1): void => {
    setUploads((current) => {
      const index = current.findIndex((image) => image.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) return current;
      next.splice(target, 0, moved);
      return next;
    });
  };

  /*
   * The preview is derived, never stored. `parseBdtInput` is the same strictness as the server's
   * `parsePoisha`, so a number the preview accepts is one the save accepts too.
   */
  const priceMinor = parseBdtInput(price);
  const compareAtMinor = parseBdtInput(compareAt);
  const saving = priceMinor !== null ? discountAmount(priceMinor, compareAtMinor) : null;
  const percent = priceMinor !== null ? discountPercent(priceMinor, compareAtMinor) : null;
  const effectiveSlug = slug.trim() === '' ? slugPreview(nameEn) : slug.trim();
  // A chosen photograph previews before it is saved; otherwise the saved card image does.
  const previewSrc =
    uploads[0]?.url ??
    (values.primaryImageKey === null || values.primaryImageKey === undefined
      ? null
      : imageVariantPath(values.primaryImageKey));

  const shortRemaining = 500 - shortDescription.length;

  /*
   * Which required fields are still empty, so the summary at the top can be specific instead of a
   * generic "check the form". This mirrors the server's own required set exactly.
   */
  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (nameEn.trim() === '') gaps.push(t('admin.catalog.field.nameEn'));
    if (categoryId === '') gaps.push(t('admin.catalog.field.category'));
    // A brand is required by the schema and by the service, so leaving it out of this list would let
    // the summary claim the form is ready while the save is still going to be refused.
    if (brandId === '') gaps.push(t('admin.catalog.field.brand'));
    if (price.trim() === '') gaps.push(t('admin.catalog.field.price'));
    return gaps;
  }, [nameEn, categoryId, brandId, price, t]);

  return (
    <form
      ref={formRef}
      className={styles.productForm}
      action="/api/qbpanel/catalog/product"
      method="post"
      encType="multipart/form-data"
      /*
       * Validation is taken over deliberately. With native validation on, the browser refuses the
       * submit *before* `onSubmit` runs, so a blocked submission is silent: nothing is announced and
       * the owner gets a transient bubble with no list. `noValidate` hands the same DOM constraints
       * (required / maxLength / minLength) to this handler, which states the set in text, marks the
       * offenders and focuses the first one. The rules are unchanged - only who reports them.
       */
      noValidate
      onSubmit={(event) => {
        const form = event.currentTarget;
        const fields = [...form.querySelectorAll<HTMLElement>('input, select, textarea')];
        const invalid = fields.filter((field) => 'checkValidity' in field && !(field as HTMLInputElement).checkValidity());

        for (const field of fields) {
          if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
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
            /*
             * The required marker is a symbol plus a visually hidden word, so the label's text still
             * contains both. Stripping them leaves the field's human name, which is what the summary
             * sentence lists.
             */
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
      <input type="hidden" name="operation" value={mode === 'create' ? 'create' : 'update'} />
      {productId !== undefined && <input type="hidden" name="productId" value={productId} />}

      {notice}

      {blocked.length > 0 && (
        <div className={styles.formBlocked} role="alert">
          <AdminIcon name="alert" width={18} height={18} />
          <span>{t('admin.catalog.formBlocked', { fields: blocked.join(', ') })}</span>
        </div>
      )}

      {/*
        The action bar: the readiness summary and Save, sticky so Save is always reachable. It carries
        no heading of its own - the page header above already names the page, and a second "New product"
        on the same screen is the same content twice.
      */}
      <header className={styles.formHeader}>
        <div className={styles.formHeaderText}>
          <p className={styles.formSubtitle} aria-live="polite">
            {missing.length === 0
              ? t('admin.catalog.formReady')
              : t('admin.catalog.formMissing', { fields: missing.join(', ') })}
          </p>
        </div>
        <div className={styles.formHeaderActions}>
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href={cancelHref}>
            {t('admin.common.cancel')}
          </Link>
          <SubmitButton
            label={mode === 'create' ? t('admin.catalog.create') : t('admin.catalog.save')}
            pendingLabel={t('admin.common.working')}
          />
        </div>
      </header>

      <div className={styles.productFormColumns}>
        {/* ================= Left: what the customer reads ================= */}
        <div className={styles.productFormMain}>
          <section className={styles.formCard} aria-labelledby="pf-general">
            <div className={styles.formCardHead}>
              <h2 id="pf-general">{t('admin.catalog.sectionGeneral')}</h2>
              <p>{t('admin.catalog.sectionGeneralBody')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="nameEn">
                {t('admin.catalog.field.nameEn')} <RequiredMark />
              </label>
              <input
                className={styles.input}
                id="nameEn"
                name="nameEn"
                required
                maxLength={200}
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t('admin.catalog.field.nameEnPlaceholder')}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="nameBn">{t('admin.catalog.field.nameBn')}</label>
              <input
                className={styles.input}
                id="nameBn"
                name="nameBn"
                maxLength={200}
                value={nameBn}
                onChange={(event) => setNameBn(event.target.value)}
                placeholder={t('admin.catalog.field.nameBnPlaceholder')}
                lang="bn"
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor="shortDescription">{t('admin.catalog.field.shortDescription')}</label>
                <span
                  className={shortRemaining < 50 ? styles.counterWarn : styles.counter}
                  aria-live="polite"
                >
                  {t('admin.catalog.counter', { used: shortDescription.length, max: 500 })}
                </span>
              </div>
              <textarea
                className={styles.textarea}
                id="shortDescription"
                name="shortDescription"
                rows={2}
                maxLength={500}
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                placeholder={t('admin.catalog.field.shortDescriptionPlaceholder')}
              />
              <p className={styles.hint}>{t('admin.catalog.field.shortDescriptionHelp')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="descriptionEn">{t('admin.catalog.field.descriptionEn')}</label>
              <textarea
                className={styles.textarea}
                id="descriptionEn"
                name="descriptionEn"
                rows={5}
                maxLength={4000}
                defaultValue={values.descriptionEn ?? ''}
              />
              <p className={styles.hint}>{t('admin.catalog.field.descriptionHelp')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="descriptionBn">{t('admin.catalog.field.descriptionBn')}</label>
              <textarea
                className={styles.textarea}
                id="descriptionBn"
                name="descriptionBn"
                rows={5}
                maxLength={4000}
                defaultValue={values.descriptionBn ?? ''}
                lang="bn"
              />
            </div>
          </section>

          <section className={styles.formCard} aria-labelledby="pf-media">
            <div className={styles.formCardHead}>
              <h2 id="pf-media">{t('admin.catalog.sectionMedia')}</h2>
              <p>{t('admin.catalog.sectionMediaBody')}</p>
            </div>

            <ProductMediaUploader
              id="productImages"
              images={uploads}
              onAdd={addUploads}
              onRemove={removeUpload}
              onMove={moveUpload}
              maxImages={MAX_PRODUCT_IMAGES}
            />

            {mode === 'edit' ? (
              <p className={styles.hint}>{t('admin.catalog.mediaEditHint')}</p>
            ) : (
              <p className={styles.hint}>{t('admin.catalog.mediaAltNote')}</p>
            )}
          </section>

          {/* ---- Pricing ---- */}
          <section className={styles.formCard} aria-labelledby="pf-pricing">
            <div className={styles.formCardHead}>
              <h2 id="pf-pricing">{t('admin.catalog.sectionPricing')}</h2>
              <p>{t('admin.catalog.sectionPricingBody')}</p>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="price">
                  {t('admin.catalog.field.price')} <RequiredMark />
                </label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="price"
                    name="price"
                    required
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <p className={styles.hint}>{t('admin.catalog.field.priceHelp')}</p>
              </div>

              <div className={styles.field}>
                <label htmlFor="compareAtPrice">{t('admin.catalog.field.compareAtPrice')}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="compareAtPrice"
                    name="compareAtPrice"
                    inputMode="decimal"
                    value={compareAt}
                    onChange={(event) => setCompareAt(event.target.value)}
                  />
                </div>
                <p className={styles.hint}>{t('admin.catalog.field.compareAtPriceHelp')}</p>
                {/*
                  A comparison price that is not higher is refused by the server and would render no
                  saving, so it is called out here rather than discovered on save.
                */}
                {compareAtMinor !== null && priceMinor !== null && saving === null && (
                  <p className={styles.hintWarn}>{t('admin.catalog.field.compareAtPriceWarn')}</p>
                )}
              </div>
            </div>
          </section>

          {/* ---- Inventory ---- */}
          <section className={styles.formCard} aria-labelledby="pf-inventory">
            <div className={styles.formCardHead}>
              <h2 id="pf-inventory">{t('admin.catalog.sectionInventory')}</h2>
              <p>{t('admin.catalog.sectionInventoryBody')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="sku">{t('admin.catalog.field.sku')}</label>
              <input
                className={styles.input}
                id="sku"
                name="sku"
                maxLength={64}
                defaultValue={values.sku ?? ''}
                placeholder={t('admin.catalog.field.skuPlaceholder')}
              />
              <p className={styles.hint}>{t('admin.catalog.field.skuHelp')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="availability">{t('admin.catalog.field.availability')}</label>
              <select
                className={styles.select}
                id="availability"
                name="availability"
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              >
                <option value="in_stock">{t('admin.catalog.inStock')}</option>
                <option value="out_of_stock">{t('admin.catalog.outOfStock')}</option>
              </select>
              <p className={styles.hint}>{t('admin.catalog.field.availabilityHelp')}</p>
            </div>
          </section>

          {/* ---- Delivery charge (optional, per area) ---- */}
          <section className={styles.formCard} aria-labelledby="pf-delivery">
            <div className={styles.formCardHead}>
              <h2 id="pf-delivery">{t('admin.catalog.sectionDelivery')}</h2>
              <p>{t('admin.catalog.sectionDeliveryBody')}</p>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="deliveryChattogram">{t('admin.catalog.field.deliveryChattogram')}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="deliveryChattogram"
                    name="deliveryChattogram"
                    inputMode="decimal"
                    defaultValue={toBdtInput(values.deliveryChattogramMinor)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="deliveryDhaka">{t('admin.catalog.field.deliveryDhaka')}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="deliveryDhaka"
                    name="deliveryDhaka"
                    inputMode="decimal"
                    defaultValue={toBdtInput(values.deliveryDhakaMinor)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="deliveryOthers">{t('admin.catalog.field.deliveryOthers')}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="deliveryOthers"
                    name="deliveryOthers"
                    inputMode="decimal"
                    defaultValue={toBdtInput(values.deliveryOthersMinor)}
                  />
                </div>
              </div>
            </div>

            <p className={styles.hint}>{t('admin.catalog.deliveryHelp')}</p>
            <p className={styles.hint}>
              <Link className={styles.recordLink} href="/qbpanel/settings/delivery">
                {t('admin.catalog.deliveryLink')}
              </Link>
            </p>
          </section>
        </div>

        {/* ================= Right: the commercial facts ================= */}
        <aside className={styles.productFormSide}>
          {/* ---- Preview ---- */}
          <section className={styles.formCard} aria-labelledby="pf-preview">
            <div className={styles.formCardHead}>
              <h2 id="pf-preview">{t('admin.catalog.previewTitle')}</h2>
              <p>{t('admin.catalog.previewBody')}</p>
            </div>

            <div className={styles.previewCard}>
              {previewSrc === null ? (
                <div className={styles.previewFrame} aria-hidden="true">
                  <span className={styles.previewFrameLabel}>{t('admin.catalog.previewNoImage')}</span>
                </div>
              ) : (
                <div className={styles.previewPhoto} aria-hidden="true">
                  <img src={previewSrc} alt="" />
                </div>
              )}
              <div className={styles.previewBody}>
                {nameEn.trim() === '' ? (
                  <p className={styles.previewPlaceholder}>{t('admin.catalog.previewNoName')}</p>
                ) : (
                  <p className={styles.previewName}>{nameEn}</p>
                )}
                {packSize.trim() !== '' && <p className={styles.previewPack}>{packSize}</p>}
                <p className={styles.previewPriceRow}>
                  {priceMinor === null ? (
                    <span className={styles.previewPlaceholder}>{t('admin.catalog.previewNoPrice')}</span>
                  ) : (
                    <>
                      <span className={styles.previewPrice}>{formatMoney(priceMinor)}</span>
                      {saving !== null && compareAtMinor !== null && (
                        <span className={styles.previewCompare}>{formatMoney(compareAtMinor)}</span>
                      )}
                    </>
                  )}
                </p>
                {saving !== null && percent !== null && (
                  <p className={styles.previewSaving}>
                    {t('product.save', { amount: formatMoney(saving) })} · -{percent}%
                  </p>
                )}
                {shortDescription.trim() !== '' && (
                  <p className={styles.previewShort}>{shortDescription}</p>
                )}
              </div>
            </div>
            <p className={styles.hint}>{t('admin.catalog.previewCaveat')}</p>
          </section>

          {/* ---- Organisation ---- */}
          <section className={styles.formCard} aria-labelledby="pf-organisation">
            <div className={styles.formCardHead}>
              <h2 id="pf-organisation">{t('admin.catalog.sectionOrganisation')}</h2>
              <p>{t('admin.catalog.sectionOrganisationBody')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="categoryId">
                {t('admin.catalog.field.category')} <RequiredMark />
              </label>
              <select
                className={styles.select}
                id="categoryId"
                name="categoryId"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="" disabled>
                  {t('admin.catalog.field.choose')}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="brandId">
                {t('admin.catalog.field.brand')} <RequiredMark />
              </label>
              <select
                className={styles.select}
                id="brandId"
                name="brandId"
                required
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
              >
                <option value="" disabled>
                  {t('admin.catalog.field.choose')}
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
              <input
                className={styles.input}
                id="packSize"
                name="packSize"
                maxLength={80}
                value={packSize}
                onChange={(event) => setPackSize(event.target.value)}
                placeholder={t('admin.catalog.field.packSizePlaceholder')}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="slug">{t('admin.catalog.field.slug')}</label>
              <input
                className={styles.input}
                id="slug"
                name="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder={slugPreview(nameEn) || 'product-slug'}
              />
              <p className={styles.hint}>
                {effectiveSlug === '' ? t('admin.catalog.field.slugHelp') : `/products/${effectiveSlug}`}
              </p>
            </div>
          </section>

          {/* ---- Publication ---- */}
          <section className={styles.formCard} aria-labelledby="pf-publication">
            <div className={styles.formCardHead}>
              <h2 id="pf-publication">{t('admin.catalog.sectionPublication')}</h2>
              <p>{t('admin.catalog.sectionPublicationBody')}</p>
            </div>

            <label className={styles.switchRow} htmlFor="isPublished">
              <input
                id="isPublished"
                name="isPublished"
                type="checkbox"
                checked={isPublished}
                onChange={(event) => setIsPublished(event.target.checked)}
              />
              <span className={styles.switchRowText}>
                <span className={styles.switchRowLabel}>{t('admin.catalog.field.isPublished')}</span>
                <span className={styles.hint}>{t('admin.catalog.field.isPublishedHelp')}</span>
              </span>
            </label>

            {/*
              The two states are independent and both gate the storefront, which is easy to get wrong:
              a published out-of-stock product shows but cannot be ordered. Stating the resulting
              outcome beats making the owner reason about two toggles.
            */}
            <p className={styles.outcome} data-tone={isPublished && availability === 'in_stock' ? 'ok' : 'warn'}>
              {isPublished
                ? availability === 'in_stock'
                  ? t('admin.catalog.outcomeLiveOrderable')
                  : t('admin.catalog.outcomeLiveNotOrderable')
                : t('admin.catalog.outcomeHidden')}
            </p>
          </section>
        </aside>
      </div>

    </form>
  );
}

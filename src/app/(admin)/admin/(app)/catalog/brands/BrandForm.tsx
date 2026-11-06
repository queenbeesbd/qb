'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { slugPreview } from '@/lib/slug-preview';
import { LetterMark } from '@/components/LetterMark';
import { AdminIcon } from '../../../_ui/icons';
import { CatalogImageField } from '../../../_ui/CatalogImageField';
import { RequiredMark } from '../../../_ui/RequiredMark';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../admin.module.css';

export type BrandFormValues = {
  nameEn?: string;
  nameBn?: string;
  slug?: string;
  logoKey?: string | null;
};

/**
 * The brand editor.
 *
 * The same shell as the category and product editors (one sticky action bar, a required summary,
 * explicit validation) and the same media control: the logo is chosen with the brand and saved in one
 * request, locally uploaded or picked from the shop's own inventory. A brand has no description,
 * visibility or order column, so the form stays two decisions - its name/address and its mark.
 */
export function BrandForm({
  mode,
  values,
  brandId,
  productCount,
  assetKeys,
  csrfToken,
  cancelHref,
}: {
  mode: 'create' | 'edit';
  values: BrandFormValues;
  brandId?: number;
  productCount?: number;
  assetKeys: readonly string[];
  csrfToken: string;
  cancelHref: string;
}) {
  const { t } = useTranslation();
  const [nameEn, setNameEn] = useState(values.nameEn ?? '');
  const [nameBn, setNameBn] = useState(values.nameBn ?? '');
  const [slug, setSlug] = useState(values.slug ?? '');
  const [blocked, setBlocked] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (nameEn.trim() === '') gaps.push(t('admin.brands.field.nameEn'));
    if (nameBn.trim() === '') gaps.push(t('admin.brands.field.nameBn'));
    return gaps;
  }, [nameEn, nameBn, t]);

  const effectiveSlug = slug.trim() === '' ? slugPreview(nameEn) : slug.trim();
  const selfHref =
    mode === 'create' ? '/admin/catalog/brands/new' : `/admin/catalog/brands/${brandId ?? ''}`;
  const displayName = nameEn.trim();

  return (
    <form
        ref={formRef}
        className={styles.categoryEditor}
        action="/api/admin/catalog/brand"
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
        <input type="hidden" name="operation" value={mode === 'create' ? 'create' : 'update'} />
        {brandId !== undefined && <input type="hidden" name="brandId" value={brandId} />}
        <input type="hidden" name="returnTo" value={selfHref} />

        {blocked.length > 0 && (
          <div className={styles.formBlocked} role="alert">
            <AdminIcon name="alert" width={18} height={18} />
            <span>{t('admin.brands.formBlocked', { fields: blocked.join(', ') })}</span>
          </div>
        )}

        <header className={styles.formHeader}>
          <div className={styles.formHeaderText}>
            <p className={styles.formSubtitle} aria-live="polite">
              {missing.length === 0
                ? t('admin.brands.formReady')
                : t('admin.brands.formMissing', { fields: missing.join(', ') })}
            </p>
          </div>
          <div className={styles.formHeaderActions}>
            <Link className={`${styles.button} ${styles.buttonSecondary}`} href={cancelHref}>
              {t('admin.common.cancel')}
            </Link>
            <SubmitButton
              label={mode === 'create' ? t('admin.brands.create') : t('admin.brands.save')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </header>

        <div className={styles.categoryEditorColumns}>
          <div className={styles.categoryEditorMain}>
            <section className={styles.formCard} aria-labelledby="bf-logo">
              <div className={styles.formCardHead}>
                <h2 id="bf-logo">{t('admin.brands.sectionLogo')}</h2>
                <p>{t('admin.brands.sectionLogoBody')}</p>
              </div>
              <CatalogImageField
                id="brandLogo"
                currentKey={values.logoKey ?? null}
                assetKeys={assetKeys}
                shape="circle"
              />
            </section>

            <section className={styles.formCard} aria-labelledby="bf-names">
              <div className={styles.formCardHead}>
                <h2 id="bf-names">{t('admin.brands.sectionNames')}</h2>
                <p>{t('admin.brands.sectionNamesBody')}</p>
              </div>

              <div className={styles.field}>
                <label htmlFor="brandNameEn">
                  {t('admin.brands.field.nameEn')} <RequiredMark />
                </label>
                <input
                  className={styles.input}
                  id="brandNameEn"
                  name="nameEn"
                  required
                  maxLength={80}
                  value={nameEn}
                  onChange={(event) => setNameEn(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="brandNameBn">
                  {t('admin.brands.field.nameBn')} <RequiredMark />
                </label>
                <input
                  className={styles.input}
                  id="brandNameBn"
                  name="nameBn"
                  required
                  maxLength={80}
                  value={nameBn}
                  onChange={(event) => setNameBn(event.target.value)}
                  lang="bn"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="brandSlug">{t('admin.brands.field.slug')}</label>
                <input
                  className={styles.input}
                  id="brandSlug"
                  name="slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder={slugPreview(nameEn) || 'brand-slug'}
                />
                <p className={styles.hint}>
                  {effectiveSlug === ''
                    ? t('admin.brands.field.slugHelp')
                    : `/brands/${effectiveSlug}`}
                </p>
              </div>
            </section>
          </div>

          <aside className={styles.categoryEditorAside}>
            <section className={styles.formCard} aria-labelledby="bf-preview">
              <div className={styles.formCardHead}>
                <h2 id="bf-preview">{t('admin.brands.previewTitle')}</h2>
                <p>{t('admin.brands.previewBody')}</p>
              </div>
              <div className={styles.brandPreview}>
                <span className={styles.brandPreviewCircle}>
                  {values.logoKey === null || values.logoKey === undefined ? (
                    displayName === '' ? (
                      <span className={styles.catalogImageEmpty}>{t('admin.imageField.none')}</span>
                    ) : (
                      <LetterMark name={displayName} />
                    )
                  ) : (
                    <img src={imageVariantPath(values.logoKey)} alt="" />
                  )}
                </span>
                <span className={styles.brandPreviewName}>
                  {displayName === '' ? t('admin.brands.previewNoName') : displayName}
                </span>
              </div>
              <p className={styles.hint}>{t('admin.brands.previewCaveat')}</p>
            </section>

            {mode === 'edit' && (
              <section className={styles.formCard} aria-labelledby="bf-usage">
                <div className={styles.formCardHead}>
                  <h2 id="bf-usage">{t('admin.brands.sectionUsage')}</h2>
                  <p>{t('admin.brands.sectionUsageBody')}</p>
                </div>
                <p className={styles.note}>
                  {t('admin.brands.productCountValue', { count: productCount ?? 0 })}
                </p>
              </section>
            )}
          </aside>
        </div>
    </form>
  );
}

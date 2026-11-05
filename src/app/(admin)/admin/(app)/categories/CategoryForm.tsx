'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { slugPreview } from '@/lib/slug-preview';
import { AdminIcon } from '../../_ui/icons';
import { RequiredMark } from '../../_ui/RequiredMark';
import { AdminImageInput } from '../../_ui/AdminImageInput';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../admin.module.css';

export type CategoryFormValues = {
  slug?: string;
  nameEn?: string;
  nameBn?: string;
  descriptionEn?: string | null;
  descriptionBn?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
  /** The one-line label under the category's name on the storefront index. */
  tagline?: string | null;
  /** The category's square photograph, as an asset key. */
  imageKey?: string | null;
};

/** The two derived counts an archive is refused on. Absent until the category exists. */
export type CategoryUsage = { productCount: number; subcategoryCount: number };

/**
 * The category editor.
 *
 * Same shell as the product and promo editors (sticky action bar, two columns, a readiness sentence
 * that names the missing fields, explicit validation instead of native bubbles) because the owner
 * should not have to learn a second form. What it deliberately does **not** do:
 *
 * 1. **No parent picker.** Creating a child category is a decision about depth that the owner has not
 *    taken, and the schema's `parent_id` is read here only to count what an archive would hit.
 *    Offering the picker would publish a taxonomy policy the shop has not agreed to.
 * 2. **No invented counts.** The usage card shows what the database returns; in create mode it says the
 *    counts appear after saving rather than showing a tidy zero.
 * 3. **No delete.** Archiving stays on the list, where the refusal it can produce is explained next to
 *    the button. The editor only states what is in the way.
 *
 * The form posts to the same guarded route it always did - this is a route split and an editor shell,
 * not a new write path.
 */
export function CategoryForm({
  mode,
  values,
  categoryId,
  usage,
  csrfToken,
  cancelHref,
  assetKeys,
}: {
  mode: 'create' | 'edit';
  values: CategoryFormValues;
  categoryId?: number;
  usage?: CategoryUsage;
  csrfToken: string;
  cancelHref: string;
  /**
   * Every image the shop owns, as asset keys.
   *
   * Only meaningful on the edit route: a category has to exist before an image can be associated with
   * it. A create form therefore saves first and offers the photograph on the record it just created,
   * which is also where the storefront preview lives.
   */
  assetKeys?: readonly string[];
}) {
  const { t } = useTranslation();
  const assets = assetKeys ?? [];

  const [nameEn, setNameEn] = useState(values.nameEn ?? '');
  const [nameBn, setNameBn] = useState(values.nameBn ?? '');
  const [slug, setSlug] = useState(values.slug ?? '');
  const [isVisible, setIsVisible] = useState(values.isVisible ?? true);

  const formRef = useRef<HTMLFormElement>(null);

  /** A submit the browser refused is otherwise silent: nothing moves and nothing is announced. */
  const [blocked, setBlocked] = useState<string[]>([]);

  const effectiveSlug = slug.trim() === '' ? slugPreview(nameEn) : slug.trim();

  /*
   * The required set, mirroring the service exactly: both names are required (unlike a product's
   * Bangla name, which is optional). A summary that omitted the Bangla name would claim the form is
   * ready while the save is still going to be refused.
   */
  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (nameEn.trim() === '') gaps.push(t('admin.categories.field.nameEn'));
    if (nameBn.trim() === '') gaps.push(t('admin.categories.field.nameBn'));
    return gaps;
  }, [nameEn, nameBn, t]);

  const inUse = usage !== undefined && (usage.productCount > 0 || usage.subcategoryCount > 0);

  /** This editor's own address: where a refusal returns, and what the route allowlist accepts. */
  const selfHref =
    mode === 'create' ? '/admin/categories/new' : `/admin/categories/${categoryId ?? ''}`;

  return (
    <form
      ref={formRef}
      className={styles.categoryEditor}
      action="/api/admin/catalog/category"
      method="post"
      /* The rules are the DOM constraints below; this only changes who reports them. */
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
      {categoryId !== undefined && <input type="hidden" name="categoryId" value={categoryId} />}
      {/* Where a refusal goes back to, so a rejected save does not throw away what was typed. */}
      <input type="hidden" name="returnTo" value={selfHref} />

      {blocked.length > 0 && (
        <div className={styles.formBlocked} role="alert">
          <AdminIcon name="alert" width={18} height={18} />
          <span>{t('admin.categories.formBlocked', { fields: blocked.join(', ') })}</span>
        </div>
      )}

      {/* The only action bar on the page: readiness on the left, Cancel and Save on the right. */}
      <header className={styles.formHeader}>
        <div className={styles.formHeaderText}>
          <p className={styles.formSubtitle} aria-live="polite">
            {missing.length === 0
              ? t('admin.categories.formReady')
              : t('admin.categories.formMissing', { fields: missing.join(', ') })}
          </p>
        </div>
        <div className={styles.formHeaderActions}>
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href={cancelHref}>
            {t('admin.common.cancel')}
          </Link>
          <SubmitButton
            label={mode === 'create' ? t('admin.categories.create') : t('admin.categories.save')}
            pendingLabel={t('admin.common.working')}
          />
        </div>
      </header>

      <div className={styles.categoryEditorColumns}>
        {/* ================= Left: what the customer reads ================= */}
        <div className={styles.categoryEditorMain}>
          <section className={styles.formCard} aria-labelledby="cf-names">
            <div className={styles.formCardHead}>
              <h2 id="cf-names">{t('admin.categories.sectionNames')}</h2>
              <p>{t('admin.categories.sectionNamesBody')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="nameEn">
                {t('admin.categories.field.nameEn')} <RequiredMark />
              </label>
              <input
                className={styles.input}
                id="nameEn"
                name="nameEn"
                required
                maxLength={80}
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="nameBn">
                {t('admin.categories.field.nameBn')} <RequiredMark />
              </label>
              <input
                className={styles.input}
                id="nameBn"
                name="nameBn"
                required
                maxLength={80}
                value={nameBn}
                onChange={(event) => setNameBn(event.target.value)}
                lang="bn"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tagline">{t('admin.categories.field.tagline')}</label>
              <input
                className={styles.input}
                id="tagline"
                name="tagline"
                maxLength={120}
                defaultValue={values.tagline ?? ''}
              />
              <p className={styles.hint}>{t('admin.categories.field.taglineHelp')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="descriptionEn">{t('admin.categories.field.descriptionEn')}</label>
              <textarea
                className={styles.textarea}
                id="descriptionEn"
                name="descriptionEn"
                rows={3}
                maxLength={4000}
                defaultValue={values.descriptionEn ?? ''}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="descriptionBn">{t('admin.categories.field.descriptionBn')}</label>
              <textarea
                className={styles.textarea}
                id="descriptionBn"
                name="descriptionBn"
                rows={3}
                maxLength={4000}
                defaultValue={values.descriptionBn ?? ''}
                lang="bn"
              />
            </div>
          </section>

          {/*
            The storefront storefront tile: the square photograph and the one line under its name.
            Edit-only, because an image association needs a saved category to point at - and this is
            the *only* place the owner decides what the category looks like in the index.
          */}
          {mode === 'edit' && categoryId !== undefined && (
            <section className={styles.formCard} aria-labelledby="cf-image">
              <div className={styles.formCardHead}>
                <h2 id="cf-image">{t('admin.categories.sectionImage')}</h2>
                <p>{t('admin.categories.sectionImageBody')}</p>
              </div>

              <div className={styles.categoryImageRow}>
                <span className={styles.categoryImagePreview} data-empty={values.imageKey ? undefined : 'true'}>
                  {values.imageKey ? (
                    // Association-only imagery: the key was validated against the server's inventory,
                    // so it cannot name a path outside `public/catalog`.
                    <img src={imageVariantPath(values.imageKey)} alt="" width={96} height={96} />
                  ) : (
                    <span className={styles.categoryImageEmpty}>{t('admin.categories.imageNone')}</span>
                  )}
                </span>

                <div className={styles.categoryImageControls}>
                  <form
                    className={styles.categoryImageForm}
                    action="/api/admin/catalog/category-image"
                    method="post"
                    encType="multipart/form-data"
                  >
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="operation" value="upload" />
                    <input type="hidden" name="categoryId" value={categoryId} />
                    <input type="hidden" name="returnTo" value={selfHref} />
                    <div className={styles.field}>
                      <label htmlFor="categoryImageUpload">{t('admin.categories.imageUploadTitle')}</label>
                      <AdminImageInput
                        className={styles.input}
                        id="categoryImageUpload"
                        accept="image/jpeg,image/png,image/webp"
                        required
                      />
                      <p className={styles.hint}>{t('admin.upload.help')}</p>
                    </div>
                    <SubmitButton
                      label={t('admin.categories.imageUploadSubmit')}
                      pendingLabel={t('admin.common.working')}
                    />
                  </form>

                  <form className={styles.categoryImageForm} action="/api/admin/catalog/category-image" method="post">
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="operation" value="choose" />
                    <input type="hidden" name="categoryId" value={categoryId} />
                    <input type="hidden" name="returnTo" value={selfHref} />
                    <div className={styles.field}>
                      <label htmlFor="categoryImageKey">{t('admin.categories.imagePick')}</label>
                      <select
                        className={styles.select}
                        id="categoryImageKey"
                        name="imageKey"
                        defaultValue={values.imageKey ?? ''}
                      >
                        <option value="">{t('admin.categories.imageNone')}</option>
                        {assets.map((key) => (
                          <option value={key} key={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                      <p className={styles.hint}>{t('admin.categories.field.imageHelp')}</p>
                    </div>
                    <SubmitButton label={t('admin.categories.imageChoose')} pendingLabel={t('admin.common.working')} />
                  </form>

                  {values.imageKey !== null && values.imageKey !== undefined && (
                    <form action="/api/admin/catalog/category-image" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="clear" />
                      <input type="hidden" name="categoryId" value={categoryId} />
                      <input type="hidden" name="returnTo" value={selfHref} />
                      <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} type="submit">
                        {t('admin.categories.imageRemove')}
                      </button>
                    </form>
                  )}
                  <p className={styles.hint}>{t('admin.categories.imageRemoveHint')}</p>
                </div>
              </div>
            </section>
          )}

          <section className={styles.formCard} aria-labelledby="cf-placement">
            <div className={styles.formCardHead}>
              <h2 id="cf-placement">{t('admin.categories.sectionPlacement')}</h2>
              <p>{t('admin.categories.sectionPlacementBody')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="slug">{t('admin.categories.field.slug')}</label>
              <input
                className={styles.input}
                id="slug"
                name="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder={slugPreview(nameEn) || 'category-slug'}
              />
              <p className={styles.hint}>
                {effectiveSlug === ''
                  ? t('admin.categories.field.slugHelp')
                  : `/categories/${effectiveSlug}`}
              </p>
            </div>

            <div className={styles.field}>
              <label htmlFor="sortOrder">{t('admin.categories.field.sortOrder')}</label>
              <input
                className={styles.input}
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={values.sortOrder ?? 0}
              />
              <p className={styles.hint}>{t('admin.categories.field.sortOrderHelp')}</p>
            </div>
          </section>
        </div>

        {/* ================= Right: what it is and what it holds ================= */}
        <aside className={styles.categoryEditorAside}>
          <section className={styles.formCard} aria-labelledby="cf-preview">
            <div className={styles.formCardHead}>
              <h2 id="cf-preview">{t('admin.categories.previewTitle')}</h2>
              <p>{t('admin.categories.previewBody')}</p>
            </div>

            <div className={styles.categoryPreview}>
              {nameEn.trim() === '' ? (
                <p className={styles.previewPlaceholder}>{t('admin.categories.previewNoName')}</p>
              ) : (
                <p className={styles.categoryPreviewName}>{nameEn}</p>
              )}
              <p className={styles.mono}>
                {effectiveSlug === '' ? '/categories/…' : `/categories/${effectiveSlug}`}
              </p>
            </div>
            <p className={styles.hint}>{t('admin.categories.previewCaveat')}</p>
          </section>

          <section className={styles.formCard} aria-labelledby="cf-visibility">
            <div className={styles.formCardHead}>
              <h2 id="cf-visibility">{t('admin.categories.sectionVisibility')}</h2>
              <p>{t('admin.categories.sectionVisibilityBody')}</p>
            </div>

            {/*
              An unticked checkbox sends nothing, and the service reads "nothing" as "visible" - so
              without this hidden field, unticking would save as ticked. The pair makes the two states
              explicit: the hidden input posts false, and a ticked box overrides it with true. (Before
              Phase 36 this form could not hide a category at all.)
            */}
            <input type="hidden" name="isVisible" value="false" />
            <label className={styles.switchRow} htmlFor="isVisible">
              <input
                id="isVisible"
                name="isVisible"
                type="checkbox"
                value="true"
                checked={isVisible}
                onChange={(event) => setIsVisible(event.target.checked)}
              />
              <span className={styles.switchRowText}>
                <span className={styles.switchRowLabel}>{t('admin.categories.field.isVisible')}</span>
                <span className={styles.hint}>{t('admin.categories.field.isVisibleHelp')}</span>
              </span>
            </label>

            <p className={styles.outcome} data-tone={isVisible ? 'ok' : 'warn'}>
              {isVisible ? t('admin.categories.outcomeVisible') : t('admin.categories.outcomeHidden')}
            </p>
          </section>

          <section className={styles.formCard} aria-labelledby="cf-usage">
            <div className={styles.formCardHead}>
              <h2 id="cf-usage">{t('admin.categories.sectionUsage')}</h2>
              <p>{t('admin.categories.sectionUsageBody')}</p>
            </div>

            {usage === undefined ? (
              <p className={styles.note}>{t('admin.categories.usageCreate')}</p>
            ) : (
              <>
                <dl className={styles.categoryUsage}>
                  <div>
                    <dt>{t('admin.categories.usageProducts')}</dt>
                    <dd>{usage.productCount}</dd>
                  </div>
                  <div>
                    <dt>{t('admin.categories.usageSubcategories')}</dt>
                    <dd>{usage.subcategoryCount}</dd>
                  </div>
                </dl>
                <p className={inUse ? styles.hintWarn : styles.note}>
                  {inUse ? t('admin.categories.archiveBlocked') : t('admin.categories.archiveAllowed')}
                </p>
              </>
            )}
          </section>
        </aside>
      </div>
    </form>
  );
}

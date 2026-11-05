'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { AdminImageInput } from '../../../../_ui/AdminImageInput';
import { SubmitButton } from '../../../../_ui/SubmitButton';
import styles from '../../../../admin.module.css';

/**
 * The brand-logo editor.
 *
 * One decision, so the page is one form: which image the shop owns is this brand's mark. The photo is
 * an **association**, not an upload - the picker lists the server's own inventory, the write route
 * re-validates the chosen key against that inventory, and the storefront derives every rendered path
 * from the key. Nothing about the image is taken from the browser but the choice.
 *
 * Removing is its own submission rather than an empty select that the owner might save by accident, and
 * both operations return to this same route so a refusal lands where the mistake was made. The hint
 * states the gap out loud: images are generated into the catalog library first; an upload that writes a
 * new file is not built.
 */
export function BrandLogoForm({
  brandId,
  brandName,
  logoKey,
  csrfToken,
  assetKeys,
}: {
  brandId: number;
  brandName: string;
  logoKey: string | null;
  csrfToken: string;
  /** Every image the shop owns, as asset keys - brand logos first. */
  assetKeys: readonly string[];
}) {
  const { t } = useTranslation();
  const selfHref = `/admin/catalog/brands/${brandId}`;

  return (
    <section className={styles.formCard} aria-labelledby="brand-logo-heading">
      <div className={styles.formCardHead}>
        <h2 id="brand-logo-heading">{t('admin.brandLogo.sectionTitle')}</h2>
        <p>{t('admin.brandLogo.sectionBody')}</p>
      </div>

      <div className={styles.categoryImageRow}>
        <span className={styles.categoryImagePreview} data-empty={logoKey === null ? 'true' : undefined}>
          {logoKey === null ? (
            <span className={styles.categoryImageEmpty}>{t('admin.brandLogo.none')}</span>
          ) : (
            <img src={imageVariantPath(logoKey)} alt="" width={96} height={96} />
          )}
        </span>

        <div className={styles.categoryImageControls}>
          <form
            className={styles.categoryImageForm}
            action="/api/admin/catalog/brand-image"
            method="post"
            encType="multipart/form-data"
          >
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="upload" />
            <input type="hidden" name="brandId" value={brandId} />
            <input type="hidden" name="returnTo" value={selfHref} />
            <div className={styles.field}>
              <label htmlFor="brandLogoUpload">{t('admin.brandLogo.uploadTitle')}</label>
              <AdminImageInput
                className={styles.input}
                id="brandLogoUpload"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              <p className={styles.hint}>{t('admin.upload.help')}</p>
            </div>
            <SubmitButton
              label={t('admin.brandLogo.uploadSubmit')}
              pendingLabel={t('admin.common.working')}
            />
          </form>

          <form className={styles.categoryImageForm} action="/api/admin/catalog/brand-image" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="choose" />
            <input type="hidden" name="brandId" value={brandId} />
            <input type="hidden" name="returnTo" value={selfHref} />
            <div className={styles.field}>
              <label htmlFor="brandLogoKey">{t('admin.brandLogo.pick')}</label>
              <select className={styles.select} id="brandLogoKey" name="imageKey" defaultValue={logoKey ?? ''}>
                <option value="">{t('admin.brandLogo.none')}</option>
                {assetKeys.map((key) => (
                  <option value={key} key={key}>
                    {key}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>{t('admin.brandLogo.hint')}</p>
            </div>
            <SubmitButton
              label={t('admin.brandLogo.choose', { brand: brandName })}
              pendingLabel={t('admin.common.working')}
            />
          </form>

          {logoKey !== null && (
            <form action="/api/admin/catalog/brand-image" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="clear" />
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="returnTo" value={selfHref} />
              <button
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                type="submit"
              >
                {t('admin.brandLogo.remove')}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

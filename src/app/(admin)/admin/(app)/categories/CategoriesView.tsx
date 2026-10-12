'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../admin.module.css';

export type CategoryRow = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isVisible: boolean;
  productCount: number;
};

export type CategoriesNotice = 'created' | 'updated' | 'archived' | 'denied' | 'conflict' | 'invalid';

const NOTICE_KEYS: Record<CategoriesNotice, TranslationKey> = {
  created: 'admin.categories.notice.created',
  updated: 'admin.categories.notice.updated',
  archived: 'admin.categories.notice.archived',
  denied: 'admin.categories.notice.denied',
  conflict: 'admin.categories.notice.conflict',
  invalid: 'admin.categories.notice.invalid',
};

const ERROR_NOTICES: readonly CategoriesNotice[] = ['denied', 'conflict', 'invalid'];

/**
 * Categories.
 *
 * Archiving is refused while a category still has live products or subcategories, so the product count is
 * shown in the list: the owner can see what is in the way before trying. The refusal itself happens on the
 * server, in the same transaction as the read that decides it.
 */
export function CategoriesView({
  categories,
  editing,
  notice,
  canManage,
  csrfToken,
}: {
  categories: readonly CategoryRow[];
  editing: { id: number; slug: string; nameBn: string; nameEn: string; descriptionBn: string | null; descriptionEn: string | null; sortOrder: number; isVisible: boolean } | null;
  notice: CategoriesNotice | null;
  canManage: boolean;
  csrfToken: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);

  const fields = (values: {
    slug?: string;
    nameBn?: string;
    nameEn?: string;
    descriptionBn?: string | null;
    descriptionEn?: string | null;
    sortOrder?: number;
    isVisible?: boolean;
  }) => (
    <>
      <div className={styles.field}>
        <label htmlFor="categoryNameBn">{t('admin.categories.field.nameBn')}</label>
        <input id="categoryNameBn" name="nameBn" required maxLength={80} defaultValue={values.nameBn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryNameEn">{t('admin.categories.field.nameEn')}</label>
        <input id="categoryNameEn" name="nameEn" required maxLength={80} defaultValue={values.nameEn ?? ''} />
      </div>
      <div className={styles.field}>
        <label htmlFor="categorySlug">{t('admin.categories.field.slug')}</label>
        <input id="categorySlug" name="slug" defaultValue={values.slug ?? ''} />
        <p className={styles.hint}>{t('admin.categories.field.slugHelp')}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryDescriptionBn">{t('admin.categories.field.descriptionBn')}</label>
        <textarea
          id="categoryDescriptionBn"
          name="descriptionBn"
          rows={2}
          defaultValue={values.descriptionBn ?? ''}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryDescriptionEn">{t('admin.categories.field.descriptionEn')}</label>
        <textarea
          id="categoryDescriptionEn"
          name="descriptionEn"
          rows={2}
          defaultValue={values.descriptionEn ?? ''}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="sortOrder">{t('admin.categories.field.sortOrder')}</label>
        <input
          id="sortOrder"
          name="sortOrder"
          inputMode="numeric"
          defaultValue={values.sortOrder ?? 0}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="isVisible">
          <input id="isVisible" name="isVisible" type="checkbox" defaultChecked={values.isVisible ?? true} />{' '}
          {t('admin.categories.field.isVisible')}
        </label>
      </div>
    </>
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.categories.title')}</h1>
          <p>{t('admin.categories.body')}</p>
        </div>

        {notice !== null && (
          <p className={noticeIsError ? `${styles.alert} ${styles.alertError}` : `${styles.alert} ${styles.alertSuccess}`}>
            {t(NOTICE_KEYS[notice])}
          </p>
        )}
      </section>

      {canManage && editing === null && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.categories.createTitle')}</h2>
          </div>
          <form className={styles.form} action="/api/admin/catalog/category" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="create" />
            {fields({})}
            <button type="submit" className={styles.button}>
              {t('admin.categories.create')}
            </button>
          </form>
        </section>
      )}

      {canManage && editing !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.categories.editTitle')}</h2>
            <p className={styles.note}>
              <Link href="/admin/categories">{t('admin.categories.editCancel')}</Link>
            </p>
          </div>
          <form className={styles.form} action="/api/admin/catalog/category" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="categoryId" value={editing.id} />
            {fields(editing)}
            <button type="submit" className={styles.button}>
              {t('admin.categories.save')}
            </button>
          </form>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.categories.listTitle')}</h2>
        </div>

        {categories.length === 0 ? (
          <p className={styles.empty}>{t('admin.categories.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin.categories.field.nameEn')}</th>
                  <th>{t('admin.categories.field.sortOrder')}</th>
                  <th>{t('admin.categories.visible')}</th>
                  <th>{t('admin.categories.productCount')}</th>
                  <th>{t('admin.owners.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      {category.nameEn}
                      <br />
                      <span className={styles.mono}>{category.slug}</span>
                    </td>
                    <td>{category.sortOrder}</td>
                    <td>
                      {category.isVisible ? (
                        <span className={styles.tag}>{t('admin.categories.visible')}</span>
                      ) : (
                        <span className={styles.tagMuted}>{t('admin.categories.hidden')}</span>
                      )}
                    </td>
                    <td>{category.productCount}</td>
                    <td>
                      <div className={styles.inlineForm}>
                        <Link href={`/admin/categories?edit=${category.id}`}>{t('admin.categories.edit')}</Link>
                        {canManage && (
                          <form
                            className={styles.inlineForm}
                            action="/api/admin/catalog/category"
                            method="post"
                            onSubmit={(event) => {
                              if (!window.confirm(t('admin.categories.archiveConfirm'))) event.preventDefault();
                            }}
                          >
                            <input type="hidden" name="csrf" value={csrfToken} />
                            <input type="hidden" name="operation" value="archive" />
                            <input type="hidden" name="categoryId" value={category.id} />
                            <button
                              type="submit"
                              className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                            >
                              {t('admin.categories.archive')}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

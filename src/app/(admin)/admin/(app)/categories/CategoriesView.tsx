'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { AdminIcon } from '../../_ui/icons';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { StatusPill } from '../../_ui/StatusPill';
import { SubmitButton } from '../../_ui/SubmitButton';
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
 * Archiving is refused while a category still has live products or subcategories, so the product count
 * is shown in the list: the owner can see what is in the way before trying. The refusal itself happens on
 * the server, in the same transaction as the read that decides it.
 */
export function CategoriesView({
  categories,
  editing,
  notice,
  canManage,
  csrfToken,
  creating,
}: {
  categories: readonly CategoryRow[];
  editing:
    | {
        id: number;
        slug: string;
        nameBn: string;
        nameEn: string;
        descriptionBn: string | null;
        descriptionEn: string | null;
        sortOrder: number;
        isVisible: boolean;
      }
    | null;
  notice: CategoriesNotice | null;
  canManage: boolean;
  csrfToken: string;
  creating: boolean;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);
  const formOpen = editing !== null || (canManage && creating);

  const fields = (values: {
    slug?: string;
    nameBn?: string;
    nameEn?: string;
    descriptionBn?: string | null;
    descriptionEn?: string | null;
    sortOrder?: number;
    isVisible?: boolean;
  }) => (
    <div className={styles.form}>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="categoryNameEn">{t('admin.categories.field.nameEn')}</label>
          <input
            className={styles.input}
            id="categoryNameEn"
            name="nameEn"
            required
            maxLength={80}
            defaultValue={values.nameEn ?? ''}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="categoryNameBn">{t('admin.categories.field.nameBn')}</label>
          <input
            className={styles.input}
            id="categoryNameBn"
            name="nameBn"
            required
            maxLength={80}
            defaultValue={values.nameBn ?? ''}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="categorySlug">{t('admin.categories.field.slug')}</label>
          <input className={styles.input} id="categorySlug" name="slug" defaultValue={values.slug ?? ''} />
          <p className={styles.hint}>{t('admin.categories.field.slugHelp')}</p>
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
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryDescriptionEn">{t('admin.categories.field.descriptionEn')}</label>
        <textarea
          className={styles.textarea}
          id="categoryDescriptionEn"
          name="descriptionEn"
          rows={2}
          defaultValue={values.descriptionEn ?? ''}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="categoryDescriptionBn">{t('admin.categories.field.descriptionBn')}</label>
        <textarea
          className={styles.textarea}
          id="categoryDescriptionBn"
          name="descriptionBn"
          rows={2}
          defaultValue={values.descriptionBn ?? ''}
        />
      </div>
      <label className={styles.checkboxRow} htmlFor="isVisible">
        <input id="isVisible" name="isVisible" type="checkbox" defaultChecked={values.isVisible ?? true} />{' '}
        {t('admin.categories.field.isVisible')}
      </label>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.commerce')}
        title={editing === null ? t('admin.categories.title') : t('admin.categories.editTitle')}
        description={editing === null ? t('admin.categories.body') : t('admin.categories.editBody')}
        actions={
          editing === null && !creating ? (
            <Link className={styles.button} href="/admin/categories?new=1">
              <AdminIcon name="plus" width={15} height={15} />
              {t('admin.categories.create')}
            </Link>
          ) : (
            <Link className={styles.buttonSecondary} href="/admin/categories">
              {t('admin.common.cancel')}
            </Link>
          )
        }
      />

      {notice !== null && (
        <Notice tone={noticeIsError ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      {formOpen && (
        <section className={styles.section} aria-labelledby="category-form-heading">
          <div className={styles.sectionHead}>
            <h2 id="category-form-heading">
              {editing === null ? t('admin.categories.createTitle') : t('admin.categories.editTitle')}
            </h2>
            {editing !== null && <p className={styles.mono}>{editing.slug}</p>}
          </div>
          <form className={styles.panel} action="/api/admin/catalog/category" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value={editing === null ? 'create' : 'update'} />
            {editing !== null && <input type="hidden" name="categoryId" value={editing.id} />}
            {fields(editing ?? {})}
            <div className={styles.formActions}>
              <SubmitButton
                label={editing === null ? t('admin.categories.create') : t('admin.categories.save')}
                pendingLabel={t('admin.common.working')}
              />
              <Link className={styles.recordLink} href="/admin/categories">
                {t('admin.common.cancel')}
              </Link>
            </div>
          </form>
        </section>
      )}

      <section className={styles.section} aria-labelledby="category-list-heading">
        <div className={styles.sectionHead}>
          <h2 id="category-list-heading">{t('admin.categories.listTitle')}</h2>
          <p>{t('admin.categories.listBody')}</p>
        </div>

        {categories.length === 0 ? (
          <EmptyState title={t('admin.categories.emptyTitle')} body={t('admin.categories.emptyBody')} icon="categories" />
        ) : (
          <ul className={styles.recordList}>
            {categories.map((category) => (
              <li className={styles.record} key={category.id}>
                <span className={styles.recordThumb} aria-hidden="true">
                  {category.nameEn.slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{category.nameEn}</span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{category.slug}</span>
                    <span>{t('admin.categories.productCountValue', { count: category.productCount })}</span>
                    <span>{t('admin.categories.orderValue', { count: category.sortOrder })}</span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <StatusPill tone={category.isVisible ? 'success' : 'neutral'}>
                    {category.isVisible ? t('admin.categories.visible') : t('admin.categories.hidden')}
                  </StatusPill>
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/admin/categories?edit=${category.id}`}>
                      {t('admin.categories.edit')}
                    </Link>
                    {canManage && (
                      <ConfirmSubmit
                        action="/api/admin/catalog/category"
                        csrfToken={csrfToken}
                        fields={{ operation: 'archive', categoryId: category.id }}
                        triggerLabel={t('admin.categories.archive')}
                        triggerVariant="ghost"
                        title={t('admin.categories.archive')}
                        body={t('admin.categories.archiveConfirm')}
                        confirmLabel={t('admin.categories.archive')}
                        cancelLabel={t('admin.common.cancel')}
                        pendingLabel={t('admin.common.working')}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

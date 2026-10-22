/**
 * The notice codes the category routes can receive, and the copy each maps to.
 *
 * One map, three routes: the list (which only reports an archive), the create editor and the edit
 * editor. A redirect carries a fixed code and never a submitted value, so a refusal cannot reflect
 * attacker-controlled text - it is mapped here or it is not shown at all.
 */
import type { TranslationKey } from '@/i18n/dictionaries';

export type CategoryNotice = 'created' | 'updated' | 'archived' | 'denied' | 'conflict' | 'invalid';

export const CATEGORY_NOTICE_KEYS: Record<CategoryNotice, TranslationKey> = {
  created: 'admin.categories.notice.created',
  updated: 'admin.categories.notice.updated',
  archived: 'admin.categories.notice.archived',
  denied: 'admin.categories.notice.denied',
  conflict: 'admin.categories.notice.conflict',
  invalid: 'admin.categories.notice.invalid',
};

export const CATEGORY_NOTICE_ERRORS: readonly CategoryNotice[] = ['denied', 'conflict', 'invalid'];

/** A recognised code, or `null`. An unrecognised one renders nothing rather than a borrowed message. */
export function readCategoryNotice(value: string | string[] | undefined): CategoryNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (Object.keys(CATEGORY_NOTICE_KEYS) as string[]).includes(candidate)
    ? (candidate as CategoryNotice)
    : null;
}

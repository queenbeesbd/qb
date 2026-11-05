/**
 * The notice codes the brand routes can receive, and the copy each maps to.
 *
 * One map for one editor and one list. A redirect carries a fixed code and never a submitted value, so
 * a refusal cannot reflect attacker-controlled text - it is mapped here or it is not shown at all.
 */
import type { TranslationKey } from '@/i18n/dictionaries';

export type BrandNotice =
  | 'imageUpdated'
  | 'imageRemoved'
  | 'imageInvalid'
  | 'denied'
  | 'conflict'
  | 'invalid';

export const BRAND_NOTICE_KEYS: Record<BrandNotice, TranslationKey> = {
  imageUpdated: 'admin.brands.notice.imageUpdated',
  imageRemoved: 'admin.brands.notice.imageRemoved',
  imageInvalid: 'admin.brands.notice.imageInvalid',
  denied: 'admin.brands.notice.denied',
  conflict: 'admin.brands.notice.conflict',
  invalid: 'admin.brands.notice.invalid',
};

export const BRAND_NOTICE_ERRORS: readonly BrandNotice[] = [
  'imageInvalid',
  'denied',
  'conflict',
  'invalid',
];

/** A recognised code, or `null`. An unrecognised one renders nothing rather than a borrowed message. */
export function readBrandNotice(value: string | string[] | undefined): BrandNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (Object.keys(BRAND_NOTICE_KEYS) as string[]).includes(candidate)
    ? (candidate as BrandNotice)
    : null;
}

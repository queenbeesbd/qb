import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  HERO_ALT_MAX,
  HERO_MAX_IMAGES,
  HERO_MIN_IMAGES,
  listHeroImages,
} from '@/server/settings/hero';
import { HeroSettingsView, type HeroNotice } from './HeroSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly HeroNotice[] = [
  'added',
  'updated',
  'removed',
  'reordered',
  'denied',
  'invalid',
  'conflict',
];

function readNotice(value: string | string[] | undefined): HeroNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as HeroNotice)
    : null;
}

/**
 * Settings -> Homepage hero.
 *
 * Requires `settings.write`, which is owner-level in the catalogue. The page reads the carousel;
 * every write goes through `/api/qbpanel/hero` and its service-level re-check, so hiding a control
 * here is never the control.
 */
export default async function HeroSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const images = await withTransaction((tx) => listHeroImages(tx));

  return (
    <HeroSettingsView
      images={images}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      minImages={HERO_MIN_IMAGES}
      maxImages={HERO_MAX_IMAGES}
      altMax={HERO_ALT_MAX}
    />
  );
}

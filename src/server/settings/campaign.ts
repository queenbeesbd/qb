import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';

/**
 * The homepage campaign band's owner-editable content.
 *
 * One campaign at a time, stored in the existing `store_setting` key/value table — the same storage
 * the announcement bar uses, so this needed **no schema change and no migration**. The band renders
 * only what is saved and switched on: a missing or hidden campaign means the section is absent from
 * the homepage entirely, never a placeholder pretending a campaign exists.
 *
 * Fields are deliberately minimal: a headline, one supporting line, and a product or collection path
 * the band links to. The link is validated to an internal path shape at read time (it must begin
 * with `/` and carry no scheme or authority), so a saved value can never turn the band into an open
 * redirect. Imagery is not part of this setting: the band is a typographic campaign card on the
 * brand's pink field, which keeps it renderable before any asset pipeline work and honest about what
 * the shop has.
 *
 * Writing this setting is **not wired to an admin screen in this phase** — the blueprint gates that
 * on the owner actually having campaign content. The save function below follows the exact pattern
 * of `saveAnnouncement` (same table, same validation shape, audit-friendly), so wiring a form to it
 * later is a route, not a redesign. Until then the band is dormant: `loadCampaign` returns null on
 * the empty database this ship state has.
 */

export const CAMPAIGN_HEADLINE_KEY = 'campaign.headline';
export const CAMPAIGN_BODY_KEY = 'campaign.body';
export const CAMPAIGN_LINK_KEY = 'campaign.link';
export const CAMPAIGN_VISIBLE_KEY = 'campaign.visible';

export const CAMPAIGN_HEADLINE_MAX = 80;
export const CAMPAIGN_BODY_MAX = 200;

export type CampaignSetting = {
  readonly headline: string | null;
  readonly body: string | null;
  readonly link: string | null;
  readonly visible: boolean;
};

const EMPTY: CampaignSetting = { headline: null, body: null, link: null, visible: false };

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The saved link renders only if it is a safe internal path: begins with a single `/`, has no
 * scheme or authority, and no control characters. Anything else reads as absent — the band then
 * renders without a call to action rather than linking somewhere unreviewed.
 */
function asInternalPath(value: unknown): string | null {
  const text = asText(value);
  if (text === null) return null;
  if (!/^\/[^\s<>\\]*$/.test(text)) return null;
  if (text.includes('//')) return null;
  return text;
}

/** Reads the current campaign. A missing row is `null`, not an invented default. */
export async function loadCampaign(tx: Transaction): Promise<CampaignSetting> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(
      sql`${storeSetting.key} in (${CAMPAIGN_HEADLINE_KEY}, ${CAMPAIGN_BODY_KEY}, ${CAMPAIGN_LINK_KEY}, ${CAMPAIGN_VISIBLE_KEY})`,
    );

  if (rows.length === 0) return EMPTY;

  let headline: string | null = null;
  let body: string | null = null;
  let link: string | null = null;
  let visible = false;
  for (const row of rows) {
    if (row.key === CAMPAIGN_HEADLINE_KEY) headline = asText(row.value);
    if (row.key === CAMPAIGN_BODY_KEY) body = asText(row.value);
    if (row.key === CAMPAIGN_LINK_KEY) link = asInternalPath(row.value);
    if (row.key === CAMPAIGN_VISIBLE_KEY) visible = row.value === true;
  }
  return { headline, body, link, visible };
}

/** True when the campaign has everything it needs to render. Partial saves stay dormant. */
export function isCampaignRenderable(campaign: CampaignSetting): boolean {
  return campaign.visible && campaign.headline !== null;
}
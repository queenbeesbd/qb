import type { Announcement } from '@/lib/types';

/**
 * Announcement strip configuration.
 *
 * **The locked demo notice is gone (owner decision, 2026-10-23).** It used to live here as a
 * non-removable entry that said the store was a preview and took no payments. The owner has taken the
 * storefront out of demonstration and asked for that wording to be removed completely, so this list is
 * empty: the only announcement the storefront shows is the owner's own line, stored in
 * `store_setting` and edited at Settings -> Announcement bar.
 *
 * The list stays as a typed, local model rather than being deleted, because it is the composition
 * point the storefront layout reads. A future owner-authored notice that must never be switched off
 * would be declared here with `locked: true`; nothing is locked today.
 *
 * Honesty is unchanged: an empty list renders no strip, and the owner's saved message is composed on
 * the server. See docs/decisions/0020-storefront-launch-presentation.md.
 */
export const announcements: Announcement[] = [];

/**
 * The announcements to render, in order. Locked entries would always be included; there are none.
 */
export function activeAnnouncements(): Announcement[] {
  return announcements.filter((announcement) => announcement.enabled || announcement.locked);
}

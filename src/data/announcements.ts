import type { Announcement } from '@/lib/types';

/**
 * Announcement strip configuration.
 *
 * This is deliberately a small, typed, local model rather than a hardcoded
 * string inside the header, so a later authorised phase can populate it from a
 * merchant source without touching presentation code.
 *
 * Future backend dependency (not implemented, not designed): an authorised
 * endpoint could return `Announcement[]`. Until then this file is the only
 * source. No API, schema, admin panel or integration exists today.
 */
export const announcements: Announcement[] = [
  {
    id: 'demo-preview',
    enabled: true,
    variant: 'demo',
    /**
     * Locked: rendered even if `enabled` is set to false, and asserted by
     * `npm run check:catalog`. The demonstration must never be able to present
     * itself as a live ordering channel.
     */
    locked: true,
    message: {
      bn: 'এটি একটি প্রিভিউ — প্রকৃত অর্ডার বা পেমেন্ট এখনো চালু হয়নি।',
      en: 'This is a preview — real orders and payments are not available yet.',
    },
  },
];

/**
 * The announcements to render, in order. Locked entries are always included.
 */
export function activeAnnouncements(): Announcement[] {
  return announcements.filter((announcement) => announcement.enabled || announcement.locked);
}

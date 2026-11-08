import type { Metadata } from 'next';

import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ForbiddenView } from './ForbiddenView';

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where an authenticated staff member is sent when a page's permission check fails.
 *
 * It requires a session, so an unauthenticated visitor never reaches it - they are redirected to
 * sign-in by `requireAdminPage`, which keeps this page from becoming a soft landing for a stranger.
 */
export default async function AdminForbiddenPage() {
  await requireAdminPage(PERMISSIONS.staffRead);
  return <ForbiddenView />;
}

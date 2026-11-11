import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { LOGIN_PATH } from '@/server/auth/constants';
import { currentStaffPrincipal } from '@/server/auth/guard';
import { ForbiddenView } from './ForbiddenView';

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where an authenticated staff member is sent when a page's permission check fails.
 *
 * It requires a **session and nothing else**. It used to require `staff.read`, which read as harmless
 * while every account was an owner - and became an infinite redirect the moment a moderator without that
 * permission was refused somewhere: the refusal sent them here, and this page refused them back
 * (owner direction, 2026-11-12). A refusal destination cannot require a capability the refused principal
 * may not hold.
 */
export default async function AdminForbiddenPage() {
  const principal = await currentStaffPrincipal();
  if (principal === null) redirect(LOGIN_PATH);
  return <ForbiddenView />;
}

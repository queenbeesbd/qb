import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { CONTACT_MAX, loadStoreContact } from '@/server/settings/contact';
import { ContactSettingsView, type ContactNotice } from './ContactSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly ContactNotice[] = ['saved', 'denied', 'invalid'];

function readNotice(value: string | string[] | undefined): ContactNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as ContactNotice)
    : null;
}

/**
 * Settings -> Contact and policies.
 *
 * Requires `settings.write`, which is owner-level in the catalogue. Every field is optional: an empty
 * one means the shop publishes that fact nowhere, and the storefront states the gap rather than
 * inventing a placeholder. The write goes through `/api/admin/settings/contact`, which re-checks the
 * permission and the field rules in the service.
 */
export default async function ContactSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const contact = await withTransaction((tx) => loadStoreContact(tx));

  return (
    <ContactSettingsView
      contact={contact}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      maxLengths={CONTACT_MAX}
    />
  );
}

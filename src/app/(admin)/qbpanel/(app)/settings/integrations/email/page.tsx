import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { providerCredentialStatus } from '@/server/integrations/provider-credentials';
import { AccountEmailView, type ProviderNotice } from './AccountEmailView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly ProviderNotice[] = ['saved', 'invalid', 'denied'];

function readNotice(value: string | string[] | undefined): ProviderNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as ProviderNotice)
    : null;
}

export default async function AccountEmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const status = await providerCredentialStatus();

  return (
    <AccountEmailView
      status={status}
      notice={readNotice((await searchParams).notice)}
      csrfToken={principal.csrfToken}
    />
  );
}

import type { Metadata } from 'next';
import { AccountView } from '@/features/account/AccountView';
import { currentCustomerPrincipal } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'My account' };
export const dynamic = 'force-dynamic';

/**
 * The account landing page.
 *
 * It resolves the session on the server and passes only the two facts the view needs, so the client
 * component never sees a token, an expiry or an identifier it does not display.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await currentCustomerPrincipal();
  const params = await searchParams;
  const notice = typeof params.notice === 'string' ? params.notice : null;
  return (
    <AccountView
      customer={
        principal === null ? null : { email: principal.email, displayName: principal.displayName }
      }
      csrfToken={principal?.csrfToken ?? null}
      notice={notice}
    />
  );
}

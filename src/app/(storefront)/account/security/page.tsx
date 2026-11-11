import type { Metadata } from 'next';

import { AccountFrame } from '@/features/account/dashboard/AccountFrame';
import { AccountSecurity } from '@/features/account/dashboard/AccountSecurity';
import { CUSTOMER_SECURITY_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';

export const metadata: Metadata = {
  title: 'Password and email',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Password, number and email, one screen.
 *
 * Both routes on this page (`/api/account/password` and `/api/account/email`) and the two verification
 * resends return their result code to **this** path, so a refusal is read beside the form that produced
 * it rather than on the dashboard, where the fields it refers to are not on screen.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireCustomerPage(CUSTOMER_SECURITY_PATH);
  const params = await searchParams;
  const notice = typeof params.notice === 'string' ? params.notice : null;

  return (
    <AccountFrame
      customer={{
        email: principal.email,
        phone: principal.phone,
        displayName: principal.displayName,
      }}
      csrfToken={principal.csrfToken}
      active="security"
    >
      <AccountSecurity
        email={principal.email}
        phone={principal.phone}
        emailVerified={principal.emailVerifiedAt !== null}
        phoneVerified={principal.phoneVerifiedAt !== null}
        csrfToken={principal.csrfToken}
        notice={notice}
      />
    </AccountFrame>
  );
}

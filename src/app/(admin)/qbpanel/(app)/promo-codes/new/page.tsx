import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { PromoCodeForm } from '../PromoCodeForm';
import { emptyPromoForm } from '../promo-form-values';

export const dynamic = 'force-dynamic';

/**
 * New promo code.
 *
 * A route of its own rather than a panel on the list, for the same reason the product editor has one:
 * a filtered list and a full-height rule editor are different tasks, and sharing a URL lets a refresh
 * lose whichever one the owner was in.
 */
export default async function NewPromoCodePage() {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);

  return (
    <PromoCodeForm
      mode="create"
      initial={emptyPromoForm}
      notice={null}
      csrfToken={principal.csrfToken}
    />
  );
}

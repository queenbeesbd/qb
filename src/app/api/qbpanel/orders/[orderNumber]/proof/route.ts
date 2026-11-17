/**
 * GET /api/qbpanel/orders/[orderNumber]/proof - the screenshot's bytes, for the owner (ADR 0042).
 *
 * This route is the whole reason the screenshot is not a public asset. A bKash/Nagad image carries a
 * transaction id, a phone number and often a name; `public/` and `/catalog/[...path]` are public,
 * CDN-cached surfaces, so the bytes live under a private `payment-proof/` key and are only ever handed
 * out here, to a session holding `order.read`.
 *
 * `no-store`, `private`, `nosniff` and `inline` are deliberate: the image must not be cached by a shared
 * cache, reinterpreted as another type, or downloaded as a file behind the owner's back. A missing proof
 * is a **404**, the same answer as an order number that names nothing.
 */

import { sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { order, paymentProof } from '@/db/schema';
import { principalFromRequest } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { hasPermission } from '@/server/authz/principal';
import { readProof } from '@/server/orders/proof-upload';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
): Promise<Response> {
  const principal = await principalFromRequest(request);
  if (principal === null) return new Response('Unauthorized', { status: 401 });
  if (!hasPermission(principal, PERMISSIONS.orderRead)) {
    // Another principal's resource is a 404, never a 403 that confirms it exists.
    return new Response('Not found', { status: 404 });
  }

  const { orderNumber } = await context.params;
  const reference = orderNumber.slice(0, 64);

  const stored = await withTransaction(async (tx) => {
    const rows = await tx
      .select({ storageKey: paymentProof.storageKey })
      .from(paymentProof)
      .innerJoin(order, sql`${order.id} = ${paymentProof.orderId}`)
      .where(sql`${order.orderNumber} = ${reference}`)
      .limit(1);
    return rows[0];
  });

  if (stored === undefined) return new Response('Not found', { status: 404 });

  const bytes = await readProof(stored.storageKey);
  if (bytes === null) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(bytes.bytes), {
    status: 200,
    headers: {
      'content-type': bytes.contentType,
      'content-length': String(bytes.bytes.length),
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
}

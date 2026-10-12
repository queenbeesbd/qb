/**
 * The authoritative orderability check.
 *
 * This is the single server-side answer to *"may this product be ordered right now?"*. It exists in
 * Phase 13 so that the storefront's out-of-stock state is not merely a label: the owner's availability
 * state is read from the database and refuses the operation, whatever the browser sent.
 *
 * **Phase 15 must call this inside the order transaction.** It is deliberately a function taking a
 * transaction so it composes into the same atomic unit as order creation, rather than being a separate
 * read that a concurrent write could invalidate between the check and the insert. Until Phase 15
 * exists there is no caller in the order path, which is why the check is tested directly - the honest
 * statement is that the gate is implemented and proven, and that no order flow consumes it yet.
 *
 * What this check does **not** do is guarantee a unit exists. Availability is a state the owner sets,
 * not a quantity, and no ledger, reservation or deduction participates in it - so two concurrent orders
 * for the last physical unit would both pass. That is recorded as an acknowledged risk in
 * `docs/decisions/0010-availability-toggle-scope.md`, together with the owner question it reopens.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { product, productVariant } from '@/db/schema';

export type OrderabilityRefusal =
  /** No such product, or it is soft-deleted. Never distinguishes the two to a caller that reports it. */
  | 'not_orderable'
  /** The owner has not published it, so it is not part of the public catalog. */
  | 'unpublished'
  /** The owner has set the availability state to Out of Stock (D19). */
  | 'out_of_stock';

export type OrderabilityResult =
  | { readonly orderable: true; readonly productId: number; readonly variantId: number }
  | { readonly orderable: false; readonly reason: OrderabilityRefusal };

/**
 * Decides whether a product may be ordered.
 *
 * Reads only server-side state: the product row's publication, deletion and availability, and the
 * existence of an active variant to price the order from. Nothing from the request participates except
 * the id, which the caller resolves from the catalog rather than trusting a submitted price.
 */
export async function checkOrderability(tx: Transaction, productId: number): Promise<OrderabilityResult> {
  const rows = await tx
    .select({
      id: product.id,
      availability: product.availability,
      isPublished: product.isPublished,
      deletedAt: product.deletedAt,
    })
    .from(product)
    .where(sql`${product.id} = ${productId}`);

  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) return { orderable: false, reason: 'not_orderable' };
  if (!row.isPublished) return { orderable: false, reason: 'unpublished' };
  if (row.availability !== 'in_stock') return { orderable: false, reason: 'out_of_stock' };

  const variantRows = await tx
    .select({ id: productVariant.id })
    .from(productVariant)
    .where(
      sql`${productVariant.productId} = ${productId}
          and ${productVariant.isActive}
          and ${productVariant.isDefault}`,
    );
  const variantId = variantRows[0]?.id;
  // A product with no priced variant cannot be ordered: there is no authoritative amount to charge, and
  // inventing one is exactly what the money rules forbid.
  if (variantId === undefined) return { orderable: false, reason: 'not_orderable' };

  return { orderable: true, productId: row.id, variantId };
}

/**
 * Throwing form, for a caller that would otherwise have to branch.
 *
 * The message is deliberately generic: it must not tell a customer whether a hidden product exists.
 */
export class NotOrderableError extends Error {
  readonly reason: OrderabilityRefusal;

  constructor(reason: OrderabilityRefusal) {
    super('this product cannot be ordered');
    this.name = 'NotOrderableError';
    this.reason = reason;
  }
}

export async function assertOrderable(tx: Transaction, productId: number): Promise<number> {
  const result = await checkOrderability(tx, productId);
  if (!result.orderable) throw new NotOrderableError(result.reason);
  return result.variantId;
}

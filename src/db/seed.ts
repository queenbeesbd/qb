/**
 * Reference-data seed.
 *
 * Writes the permission catalogue and the **owner role only**, which is the owner's approved D10
 * ruling: *owner-only at launch*. No `admin` and no `support` role is created, so no second principal
 * can verify a payment, approve COD, complete a refund or manage staff until the owner creates that
 * role deliberately.
 *
 * This is a seed, not DDL (`docs/data-model.md` 16.1 item 5): it is re-runnable, idempotent, and it
 * never rewrites a role the owner has since edited. It is also the only place the catalogue in
 * `src/server/authz/permissions.ts` is written to the database.
 *
 * Idempotence rules, deliberately:
 *   - a permission code that already exists is left alone apart from its description and privileged
 *     flag, which are re-asserted from the catalogue so the catalogue stays the source of truth;
 *   - the owner role is created if absent and never renamed;
 *   - role-permission rows are **added**, never removed, so a permission the owner granted by hand is
 *     not silently taken away by re-running the seed.
 */

import { sql } from 'drizzle-orm';

import { withTransaction } from './client';
import { permission, role, rolePermission } from './schema';
import {
  MODERATOR_DEFAULT_PERMISSIONS,
  MODERATOR_ROLE,
  OWNER_ROLE,
  PERMISSION_CATALOGUE,
} from '@/server/authz/permissions';

export type SeedReport = {
  permissionsInserted: number;
  permissionsUpdated: number;
  ownerRoleCreated: boolean;
  ownerPermissionsGranted: number;
};

export async function seedReferenceData(): Promise<SeedReport> {
  return withTransaction(async (tx) => {
    let permissionsInserted = 0;
    let permissionsUpdated = 0;

    for (const definition of PERMISSION_CATALOGUE) {
      const existing = await tx
        .select({ id: permission.id, description: permission.description, isPrivileged: permission.isPrivileged })
        .from(permission)
        .where(sql`${permission.code} = ${definition.code}`);

      const row = existing[0];
      if (row === undefined) {
        await tx.insert(permission).values({
          code: definition.code,
          description: definition.description,
          isPrivileged: definition.isPrivileged,
        });
        permissionsInserted += 1;
        continue;
      }

      if (row.description !== definition.description || row.isPrivileged !== definition.isPrivileged) {
        await tx
          .update(permission)
          .set({ description: definition.description, isPrivileged: definition.isPrivileged })
          .where(sql`${permission.id} = ${row.id}`);
        permissionsUpdated += 1;
      }
    }

    const existingOwner = await tx.select({ id: role.id }).from(role).where(sql`${role.code} = ${OWNER_ROLE.code}`);
    let ownerRoleId = existingOwner[0]?.id;
    const ownerRoleCreated = ownerRoleId === undefined;

    if (ownerRoleId === undefined) {
      const inserted = await tx
        .insert(role)
        .values({
          code: OWNER_ROLE.code,
          name: OWNER_ROLE.name,
          description: OWNER_ROLE.description,
          isOwnerLevel: true,
        })
        .returning({ id: role.id });
      ownerRoleId = inserted[0]?.id;
      if (ownerRoleId === undefined) throw new Error('owner role insert returned no id');
    }

    const catalogue = await tx
      .select({ id: permission.id, code: permission.code })
      .from(permission);

    const alreadyGranted = new Set(
      (
        await tx
          .select({ permissionId: rolePermission.permissionId })
          .from(rolePermission)
          .where(sql`${rolePermission.roleId} = ${ownerRoleId}`)
      ).map((row) => row.permissionId),
    );

    let ownerPermissionsGranted = 0;
    for (const entry of catalogue) {
      if (alreadyGranted.has(entry.id)) continue;
      await tx.insert(rolePermission).values({ roleId: ownerRoleId, permissionId: entry.id });
      ownerPermissionsGranted += 1;
    }

    /*
     * The moderator role (owner direction, 2026-11-12). Created once, then left alone: the owner edits its
     * permission set on the owners screen, and re-seeding must not undo that decision. Its defaults are
     * written only when the role is new, which is also what the migration does for an existing database.
     */
    const existingModerator = await tx
      .select({ id: role.id })
      .from(role)
      .where(sql`${role.code} = ${MODERATOR_ROLE.code}`);
    let moderatorRoleId = existingModerator[0]?.id;

    if (moderatorRoleId === undefined) {
      const inserted = await tx
        .insert(role)
        .values({
          code: MODERATOR_ROLE.code,
          name: MODERATOR_ROLE.name,
          description: MODERATOR_ROLE.description,
          isOwnerLevel: false,
        })
        .returning({ id: role.id });
      moderatorRoleId = inserted[0]?.id;
      if (moderatorRoleId === undefined) throw new Error('moderator role insert returned no id');

      for (const code of MODERATOR_DEFAULT_PERMISSIONS) {
        const target = catalogue.find((entry) => entry.code === code);
        if (target === undefined) continue;
        await tx.insert(rolePermission).values({ roleId: moderatorRoleId, permissionId: target.id });
      }
    }

    return {
      permissionsInserted,
      permissionsUpdated,
      ownerRoleCreated,
      ownerPermissionsGranted,
      moderatorRoleCreated: existingModerator[0] === undefined,
    };
  });
}

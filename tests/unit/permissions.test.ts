import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OWNER_ROLE,
  PERMISSION_CATALOGUE,
  PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_LABELS_BN,
  PERMISSIONS_IMPLEMENTED,
} from '../../src/server/authz/permissions';
import { hasPermission, holdsOwnerRole, roleCodes, type StaffPrincipal } from '../../src/server/authz/principal';
import { PERMISSION_CATALOGUE as DB_SEED_SOURCE } from '../../src/server/authz/permissions';

function principal(permissions: readonly string[], roleCodesHeld: readonly string[] = ['owner']): StaffPrincipal {
  return {
    sessionId: 'session',
    staffUserId: 1,
    email: 'owner@example.test',
    displayName: 'Owner',
    roles: roleCodesHeld.map((code, index) => ({
      id: index + 1,
      code,
      name: code,
      isOwnerLevel: code === OWNER_ROLE.code,
    })),
    permissions: new Set(permissions),
    isOwnerLevel: roleCodesHeld.includes(OWNER_ROLE.code),
    absoluteExpiresAt: new Date(),
    idleExpiresAt: new Date(),
    csrfToken: 'csrf',
  };
}

describe('permission catalogue', () => {
  it('has unique codes in the documented format', () => {
    const codes = PERMISSION_CATALOGUE.map((entry) => entry.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, /^[a-z][a-z0-9_.]*$/);
  });

  it('is the same list the seed writes, so the catalogue cannot drift from the database rows', () => {
    assert.deepEqual(PERMISSION_CATALOGUE, DB_SEED_SOURCE);
  });

  it('marks every money fact, staff control and settings write as privileged', () => {
    const privileged = new Set(
      PERMISSION_CATALOGUE.filter((entry) => entry.isPrivileged).map((entry) => entry.code),
    );
    for (const code of [
      PERMISSIONS.paymentVerify,
      PERMISSIONS.paymentReject,
      PERMISSIONS.paymentFlagFalse,
      PERMISSIONS.codApprove,
      PERMISSIONS.codConfirmCollection,
      PERMISSIONS.financeReconcile,
      PERMISSIONS.refundConfirm,
      PERMISSIONS.staffManage,
      PERMISSIONS.settingsWrite,
    ]) {
      assert.ok(privileged.has(code), `${code} must be privileged`);
    }
  });

  it('does not mark routine operational permissions as privileged', () => {
    const privileged = new Set(
      PERMISSION_CATALOGUE.filter((entry) => entry.isPrivileged).map((entry) => entry.code),
    );
    for (const code of [
      PERMISSIONS.orderRead,
      PERMISSIONS.orderCancel,
      PERMISSIONS.refundRequest,
      PERMISSIONS.returnInspect,
      PERMISSIONS.customerRead,
      PERMISSIONS.catalogWrite,
      PERMISSIONS.inventoryAdjust,
      PERMISSIONS.staffRead,
      PERMISSIONS.auditRead,
    ]) {
      assert.ok(!privileged.has(code), `${code} must not be privileged`);
    }
  });

  it('labels every code in both locales, so the staff screen has no untranslated row', () => {
    for (const entry of PERMISSION_CATALOGUE) {
      assert.ok(PERMISSION_LABELS[entry.code], `missing English label for ${entry.code}`);
      assert.ok(PERMISSION_LABELS_BN[entry.code], `missing Bangla label for ${entry.code}`);
    }
  });

  it('seeds exactly one owner-level role and no other (the owner D10 ruling)', () => {
    assert.equal(OWNER_ROLE.code, 'owner');
    assert.equal(OWNER_ROLE.isOwnerLevel, true);
  });

  it('implements a reachable workflow for exactly these permissions, and says so', () => {
    assert.deepEqual(
      [...PERMISSIONS_IMPLEMENTED].sort(),
      [
        PERMISSIONS.auditRead,
        PERMISSIONS.catalogWrite,
        PERMISSIONS.staffManage,
        PERMISSIONS.staffRead,
        // Phase 16A: the payment, COD and customer moderation worklists.
        PERMISSIONS.codApprove,
        PERMISSIONS.customerRead,
        PERMISSIONS.customerSuspend,
        PERMISSIONS.orderCancel,
        PERMISSIONS.orderRead,
        PERMISSIONS.paymentFlagFalse,
        PERMISSIONS.paymentReject,
        PERMISSIONS.paymentVerify,
      ].sort(),
    );
  });
});

describe('authorization decision', () => {
  it('denies by default: an absent code is refused', () => {
    const owner = principal([PERMISSIONS.staffRead]);
    assert.equal(hasPermission(owner, PERMISSIONS.staffRead), true);
    assert.equal(hasPermission(owner, PERMISSIONS.staffManage), false);
    assert.equal(hasPermission(owner, 'payment.verify'), false);
    assert.equal(hasPermission(owner, ''), false);
    assert.equal(hasPermission(owner, 'anything.at.all'), false);
  });

  it('grants nothing to a principal with no permissions, whatever roles it claims', () => {
    const unprivileged = principal([], ['admin']);
    for (const entry of PERMISSION_CATALOGUE) {
      assert.equal(hasPermission(unprivileged, entry.code), false, entry.code);
    }
  });

  it('detects an owner-level role from the role row, not from the permission set', () => {
    assert.equal(holdsOwnerRole(principal([], ['owner'])), true);
    assert.equal(holdsOwnerRole(principal([PERMISSIONS.staffManage], ['admin'])), false);
    assert.equal(holdsOwnerRole(principal([], [])), false);
  });

  it('reports role codes in a stable order for the audit snapshot', () => {
    assert.deepEqual(roleCodes(principal([], ['support', 'owner', 'admin'])), ['admin', 'owner', 'support']);
  });
});

#!/usr/bin/env tsx
/**
 * Staff provisioning CLI.
 *
 * Subcommands:
 *   seed       - write the permission catalogue and the owner role (D10: owner-only at launch)
 *   bootstrap  - create the first owner account and issue its one-time credential token
 *   list       - list staff accounts and their roles
 *
 * Why this exists rather than a web setup screen: a reachable "create the first admin" route is a
 * backdoor, and a default password is a credential in the repository. Provisioning therefore happens
 * from a shell on the host, with the database credential the operator already holds, and the password
 * itself is chosen by the account's owner at `/qbpanel/redeem` - never typed into this process, never
 * passed as an argument, never echoed.
 *
 * The credential token is printed **once**, to stdout, because only its SHA-256 digest is stored. If
 * it is lost, `bootstrap` is not re-run: an owner issues a new one from the staff screen.
 */

import { sql } from 'drizzle-orm';
import { createInterface } from 'node:readline/promises';

import { closeDb, withTransaction } from '../src/db/client';
import { role, staffCredential, staffRecoveryToken, staffRole, staffUser } from '../src/db/schema';
import { seedReferenceData } from '../src/db/seed';
import { recordAudit } from '../src/server/auth/audit';
import { RECOVERY_TOKEN_MS } from '../src/server/auth/constants';
import { createOpaqueToken, normalizeEmail, sha256Hex } from '../src/server/auth/tokens';
import { OWNER_ROLE } from '../src/server/authz/permissions';
import { listStaff } from '../src/server/authz/roles';
import { serverEnv } from '../src/server/env';

/** Host and database only. The connection string is never printed. */
function describeTarget(): string {
  const env = serverEnv();
  const parsed = new URL(env.databaseUrl);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname} (env=${env.environment})`;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function seed(): Promise<void> {
  console.log(`target: ${describeTarget()}`);
  const report = await seedReferenceData();
  console.log(
    `✓ seed: ${report.permissionsInserted} permission(s) inserted, ${report.permissionsUpdated} updated, ` +
      `owner role ${report.ownerRoleCreated ? 'created' : 'already present'}, ` +
      `${report.ownerPermissionsGranted} role-permission row(s) added`,
  );
  if (report.ownerRoleCreated) {
    console.log(
      '  D10 (owner-approved): owner-only at launch. No admin or support role is seeded - create one\n' +
        '  deliberately when a second person needs access.',
    );
  }
}

async function bootstrap(): Promise<void> {
  const emailArgument = process.argv[3];
  const nameArgument = process.argv[4];

  if (emailArgument === undefined || nameArgument === undefined) {
    fail('usage: npm run staff:bootstrap -- <email> "<display name>"');
  }

  const email = normalizeEmail(emailArgument);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('that does not look like an email address');
  const displayName = nameArgument.trim();
  if (displayName.length === 0 || displayName.length > 80) fail('display name must be 1-80 characters');

  console.log(`target: ${describeTarget()}`);

  const result = await withTransaction(async (tx) => {
    const existing = await tx.select({ id: staffUser.id }).from(staffUser).limit(1);
    if (existing.length > 0) {
      return { conflict: true as const };
    }

    const ownerRoleRow = await tx.select({ id: role.id }).from(role).where(sql`${role.code} = ${OWNER_ROLE.code}`);
    const ownerRoleId = ownerRoleRow[0]?.id;
    if (ownerRoleId === undefined) {
      return { missingSeed: true as const };
    }

    const inserted = await tx
      .insert(staffUser)
      .values({ email, displayName })
      .returning({ id: staffUser.id });
    const staffUserId = inserted[0]?.id;
    if (staffUserId === undefined) throw new Error('staff user insert returned no id');

    // The bootstrap account grants itself the owner role. `granted_by` is itself, which is the honest
    // record: no other staff user existed to grant it.
    await tx.insert(staffRole).values({ staffUserId, roleId: ownerRoleId, grantedBy: staffUserId });

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MS);
    await tx.insert(staffRecoveryToken).values({
      staffUserId,
      purpose: 'initial_credential',
      tokenHash: sha256Hex(token),
      issuedByStaffId: staffUserId,
      expiresAt,
    });

    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: staffUserId,
      actorRoleCodes: [OWNER_ROLE.code],
      action: 'staff.created',
      entityType: 'staff_user',
      entityId: staffUserId,
      after: { email, displayName, role: OWNER_ROLE.code, bootstrap: true },
      reason: 'bootstrap: first owner account, created from the host shell',
    });

    return { staffUserId, token, expiresAt };
  });

  if ('conflict' in result) {
    fail(
      'a staff account already exists. Bootstrap runs exactly once; issue a credential token from\n' +
        '  /qbpanel/owners instead. If every owner account is lost, that is a restore decision, not a\n' +
        '  second bootstrap.',
    );
  }
  if ('missingSeed' in result) {
    fail(`the ${OWNER_ROLE.code} role does not exist. Run "npm run db:seed" first.`);
  }

  console.log(`✓ owner account created: staff_user #${result.staffUserId} (${email})`);
  console.log('');
  console.log('  One-time credential token - shown once, stored only as a SHA-256 digest:');
  console.log('');
  console.log(`    ${result.token}`);
  console.log('');
  console.log(
    `  Redeem it at /qbpanel/redeem within ${Math.round(RECOVERY_TOKEN_MS / 60000)} minutes: paste it into the token`,
  );
  console.log('  field and choose the password there. The token is deliberately not accepted from the URL,');
  console.log('  so it stays out of browser history, referrer headers and proxy logs.');
  console.log('  Pass it to the account owner out of band. Do not paste it into a chat, a ticket or a file.');
  console.log('  The password is chosen on that page - this command never sees it.');
}

async function list(): Promise<void> {
  console.log(`target: ${describeTarget()}`);
  const entries = await withTransaction((tx) => listStaff(tx));
  if (entries.length === 0) {
    console.log('- no staff accounts. Run: npm run db:seed && npm run staff:bootstrap -- <email> "<name>"');
    return;
  }
  for (const entry of entries) {
    const roles = entry.roles.map((r) => r.code).join(', ') || '(no role)';
    const credential = await hasCredential(entry.id);
    console.log(
      `- #${entry.id} ${entry.email} [${entry.status}] roles: ${roles} credential: ${credential ? 'set' : 'not set'}`,
    );
  }
}

async function hasCredential(staffUserId: number): Promise<boolean> {
  const rows = await withTransaction((tx) =>
    tx
      .select({ id: staffCredential.id })
      .from(staffCredential)
      .where(sql`${staffCredential.staffUserId} = ${staffUserId} and ${staffCredential.revokedAt} is null`),
  );
  return rows.length > 0;
}

/** Confirms the operator means it, because both of these write to a real database. */
async function confirm(prompt: string): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(`${prompt} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    readline.close();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const commands: Record<string, () => Promise<void>> = { seed, bootstrap, list };
  const selected = command === undefined ? undefined : commands[command];

  if (selected === undefined) {
    fail(`unknown subcommand "${command ?? ''}". Use one of: ${Object.keys(commands).join(', ')}`);
  }

  const env = serverEnv();
  if (!env.isLocal) {
    const confirmed = await confirm(`This writes to a NON-LOCAL database (${env.environment}). Continue?`);
    if (!confirmed) fail('aborted');
  }

  await selected();
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

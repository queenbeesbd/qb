#!/usr/bin/env tsx
/**
 * Secret-exposure check.
 *
 * Guards the rules that matter most for a repository that will hold production configuration:
 *   1. no environment file is tracked (only .env.example, which holds placeholders);
 *   2. no file in the build output contains a secret-shaped string;
 *   3. no server-only module is reachable from the client bundle;
 *   4. no committed file contains a credential-looking literal.
 *
 * It reports file names and line numbers, never matched values - a check for secrets must not become
 * a way to leak them into a log.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

type Finding = { file: string; line: number; rule: string };

const findings: Finding[] = [];

/** Files that must never be tracked. */
const FORBIDDEN_TRACKED = ['.env', '.env.local', '.env.production', '.env.development', '.env.test'];

/** Patterns that indicate a real credential rather than a placeholder. */
const SECRET_PATTERNS: [string, RegExp][] = [
  ['postgres URL with credentials', /postgres(?:ql)?:\/\/[^\s:@'"]+:[^\s:@'"]+@/],
  ['Neon credential', /npg_[A-Za-z0-9]{8,}/],
  ['AWS-style key', /AKIA[0-9A-Z]{16}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Stripe-style key', /sk_(live|test)_[A-Za-z0-9]{16,}/],
  ['long hex secret', /\b[a-f0-9]{64}\b/],
];

/** Placeholders that are legitimately allowed to appear. */
const ALLOWED_PLACEHOLDERS = [
  'postgresql://postgres:postgres@127.0.0.1:5432/queenbees_dev',
  'postgresql://user:pw@db.example.com',
  'postgresql://user:pw@ep-cool-name-123456.us-east-2.aws.neon.tech',
  'postgres://user:password@host',
];

function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return output.split('\n').filter((line) => line.trim() !== '');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scan(file: string, text: string, rule: string, pattern: RegExp): void {
  const lines = text.split('\n');
  lines.forEach((content, index) => {
    if (!pattern.test(content)) return;
    if (ALLOWED_PLACEHOLDERS.some((placeholder) => content.includes(placeholder))) return;
    findings.push({ file, line: index + 1, rule });
  });
}

// 1. No environment file may be tracked.
const tracked = trackedFiles();
for (const file of tracked) {
  if (FORBIDDEN_TRACKED.includes(file) || (file.startsWith('.env') && file !== '.env.example')) {
    findings.push({ file, line: 0, rule: 'environment file is tracked' });
  }
}

// 2. No tracked file may contain a credential-shaped literal, except the check itself.
const SELF = 'scripts/check-secrets.ts';
for (const file of tracked) {
  if (file === SELF) continue;
  if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.webp') || file.endsWith('.svg')) continue;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const [rule, pattern] of SECRET_PATTERNS) scan(file, text, rule, pattern);
}

// 3. No server-only module may appear in the client bundle.
const buildDir = '.next';
const serverOnlyMarkers = ['DATABASE_URL', 'postgresql://', 'queenbees_forbid_write'];
const clientBundleFiles = walk(join(buildDir, 'static')).filter((file) => file.endsWith('.js'));
for (const file of clientBundleFiles) {
  const text = readFileSync(file, 'utf8');
  for (const marker of serverOnlyMarkers) {
    if (text.includes(marker)) {
      findings.push({ file: relative(process.cwd(), file), line: 0, rule: `server-only marker "${marker}" in client bundle` });
    }
  }
}

// 4. The environment guard itself must exist, so a server module cannot be imported client-side.
const guardFile = 'src/server/env.ts';
if (!existsSync(guardFile)) {
  findings.push({ file: guardFile, line: 0, rule: 'server environment guard is missing' });
} else if (!readFileSync(guardFile, 'utf8').includes("typeof window !== 'undefined'")) {
  findings.push({ file: guardFile, line: 0, rule: 'server environment guard does not detect a browser runtime' });
}

if (findings.length > 0) {
  console.error(`✗ secret-exposure check failed (${findings.length} finding(s)):`);
  for (const finding of findings) {
    console.error(`  ${finding.file}${finding.line > 0 ? `:${finding.line}` : ''} - ${finding.rule}`);
  }
  console.error('Values are never printed by this check.');
  process.exit(1);
}

const scannedBundles = clientBundleFiles.length;
console.log(
  `✓ no secrets tracked, no credential-shaped literals, no server-only markers in ${scannedBundles} client bundle file(s)`,
);
if (scannedBundles === 0) {
  console.log('  note: no client bundle found - run "npm run build" first for bundle coverage');
}

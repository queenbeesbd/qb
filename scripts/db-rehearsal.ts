#!/usr/bin/env tsx
/**
 * Clean-environment rehearsal.
 *
 * Proves the Phase 11 acceptance criterion that a database can be built from the repository alone:
 * it creates a disposable cluster, then drives the real CLI (`db:migrate`, `db:status`,
 * `db:validate`, `db:grants`) against it exactly as an operator would, and tears the cluster down.
 *
 * It deliberately shells out to the npm scripts rather than calling the modules directly, because
 * the acceptance criterion is about the documented workflow working, not about the functions
 * working in-process. The tests already cover the latter.
 *
 * Nothing here touches a deployed database or creates a cloud resource.
 */

import { spawnSync } from 'node:child_process';
import { startLocalCluster } from './local-pg';

type Step = { name: string; script: string };

const STEPS: Step[] = [
  { name: 'apply migrations from empty', script: 'db:migrate' },
  { name: 'report status', script: 'db:status' },
  { name: 'validate schema against migrations', script: 'db:validate' },
  { name: 'apply least-privilege grants', script: 'db:grants' },
  // Re-running must be a no-op: this is what makes the workflow safe to repeat.
  { name: 'apply migrations again (idempotent)', script: 'db:migrate' },
  { name: 'validate again after re-run', script: 'db:validate' },
];

function runStep(script: string, databaseUrl: string): { ok: boolean; output: string } {
  const result = spawnSync('npm', ['run', '--silent', script], {
    encoding: 'utf8',
    timeout: 300_000,
    env: { ...process.env, DATABASE_URL: databaseUrl, QUEENBEES_ENV: 'test' },
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return { ok: result.status === 0, output };
}

// Wrapped in a function rather than using top-level await: the project has no "type": "module",
// so tsx transpiles these scripts as CommonJS, where top-level await is not supported.
async function main(): Promise<void> {
  const cluster = await startLocalCluster('queenbees_rehearsal');
  let failed = false;

  try {
    console.log(`disposable cluster on 127.0.0.1:${cluster.port} (data dir removed on exit)\n`);

    for (const step of STEPS) {
      const { ok, output } = runStep(step.script, cluster.url);
      console.log(`${ok ? '✓' : '✗'} ${step.name}`);
      if (output !== '') {
        for (const line of output.split('\n')) console.log(`    ${line}`);
      }
      if (!ok) {
        failed = true;
        console.log('  stopped: a step failed, so later steps would not be meaningful');
        break;
      }
    }
  } finally {
    await cluster.stop();
  }

  if (failed) throw new Error('clean-environment rehearsal failed');
  console.log('\n✓ a clean database is reproducible from the repository alone');
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

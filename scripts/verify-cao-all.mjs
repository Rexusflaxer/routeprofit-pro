import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const checks = [
  {
    name: 'CAO foundation scenarios',
    script: 'scripts/verify-cao-foundation.mjs'
  },
  {
    name: 'CAO PB source coverage',
    script: 'scripts/audit-cao-coverage.mjs'
  },
  {
    name: 'CAO runtime readiness',
    script: 'scripts/audit-cao-runtime-readiness.mjs'
  },
  {
    name: 'CAO planner readiness',
    script: 'scripts/audit-cao-planner-readiness.mjs'
  }
];

for (const check of checks) {
  console.log(`\n== ${check.name} ==`);
  const result = spawnSync(process.execPath, [check.script], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    console.error(`\nfailed - ${check.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nfailed - ${check.name} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\nok - all CAO foundation gates passed.');

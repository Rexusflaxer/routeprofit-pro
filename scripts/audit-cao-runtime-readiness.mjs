import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadFunctionModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  let code = fs.readFileSync(absolutePath, 'utf8');
  code = code.replace(/^import[^\n]+\n/, '');
  code = code.split('\nDeno.serve')[0];
  const context = { console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: relativePath });
  return context;
}

const runtimeReadiness = loadFunctionModule('base44/functions/resolveCaoRuntimeReadiness/entry.ts');

const expectedKnownKeys = [
  'cao_particuliere_beveiliging',
  'cao_evenementen_horecabeveiliging',
  'cao_veiligheidsdomein',
  'cao_verkeersregelaars'
];

const matrix = runtimeReadiness.resolveCaoRuntimeReadiness();

function assertSameValues(actual, expected, message) {
  assert.deepEqual([...actual], expected, message);
}

assert.deepEqual(
  [...matrix.known_security_cao_keys],
  expectedKnownKeys,
  'Known security CAO catalog changed unexpectedly'
);
assertSameValues(
  matrix.supported_payroll_runtime_cao_keys,
  ['cao_particuliere_beveiliging'],
  'Only CAO PB may be payroll-final supported until other CAO runtimes are implemented and verified'
);
assertSameValues(
  [...matrix.known_source_monitoring_only_cao_keys].sort(),
  [
    'cao_evenementen_horecabeveiliging',
    'cao_veiligheidsdomein',
    'cao_verkeersregelaars'
  ].sort(),
  'External security CAOs must stay known-but-blocked until their full rule runtime exists'
);

const pb = runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_particuliere_beveiliging');
assert.equal(pb.known_cao, true);
assert.equal(pb.payroll_final_allowed_by_static_runtime, true);
assert.equal(pb.manual_review_required, false);
assert.equal(pb.runtime_surfaces.filter(surface => surface.required_for_payroll_final && !surface.supported).length, 0);

for (const key of matrix.known_source_monitoring_only_cao_keys) {
  const readiness = runtimeReadiness.buildCaoRuntimeReadinessForKey(key);
  assert.equal(readiness.known_cao, true, `${key} must remain in the catalog`);
  assert.equal(readiness.payroll_final_allowed_by_static_runtime, false, `${key} must not be payroll-final supported yet`);
  assert.equal(readiness.manual_review_required, true, `${key} must require review until implemented`);
  assert.ok(readiness.source_families.length >= 3, `${key} must declare source families for automation`);
  assert.ok(
    readiness.runtime_surfaces.some(surface => surface.surface_key === 'source_monitoring_contract' && surface.supported),
    `${key} must be supported by source monitoring contract`
  );
  assert.ok(
    readiness.runtime_surfaces.some(surface => surface.required_for_payroll_final && !surface.supported),
    `${key} must have at least one unsupported payroll-final surface`
  );
}

const unknown = runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_onbekend');
assert.equal(unknown.known_cao, false);
assert.equal(unknown.status, 'blocked_unknown_cao_key');
assert.equal(unknown.payroll_final_allowed_by_static_runtime, false);
assert.equal(unknown.manual_review_required, true);

console.log('ok - CAO runtime readiness matrix keeps PB payroll-enabled and other known security CAOs source-monitored but fail-closed.');

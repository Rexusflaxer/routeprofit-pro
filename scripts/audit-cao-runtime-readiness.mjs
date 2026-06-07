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
const ingestCaoAutomation = loadFunctionModule('base44/functions/ingestCaoAutomationPayload/entry.ts');
const syncCaoFromCloudflare = loadFunctionModule('base44/functions/syncCaoFromCloudflare/entry.ts');
const scheduleRules = loadFunctionModule('base44/functions/validateCaoScheduleRules/entry.ts');
const taskPlanningContext = loadFunctionModule('base44/functions/validateTaskPlanningContext/entry.ts');
const contractResolver = loadFunctionModule('base44/functions/resolvePersonnelContractForService/entry.ts');
const personnelCosts = loadFunctionModule('base44/functions/calculatePersonnelCosts/entry.ts');
const routePersonnelCosts = loadFunctionModule('base44/functions/calculateRoutePersonnelCosts/entry.ts');
const contractRules = loadFunctionModule('base44/functions/applyCaoContractRules/entry.ts');
const functionClassification = loadFunctionModule('base44/functions/resolveCaoFunctionClassification/entry.ts');
const caoApplicability = loadFunctionModule('base44/functions/resolveCaoApplicability/entry.ts');
const reimbursements = loadFunctionModule('base44/functions/calculateCaoReimbursements/entry.ts');
const leaveSickness = loadFunctionModule('base44/functions/calculateCaoLeaveAndSickness/entry.ts');
const yearEndBonus = loadFunctionModule('base44/functions/calculateCaoYearEndBonus/entry.ts');
const policyReferenceContext = loadFunctionModule('base44/functions/resolveCaoPolicyReferenceContext/entry.ts');
const governanceCompliancePolicy = loadFunctionModule('base44/functions/resolveCaoGovernanceCompliancePolicy/entry.ts');
const planningAssignment = loadFunctionModule('base44/functions/resolveCaoPlanningAssignmentDecision/entry.ts');

const expectedKnownKeys = [
  'cao_particuliere_beveiliging',
  'cao_evenementen_horecabeveiliging',
  'cao_veiligheidsdomein',
  'cao_verkeersregelaars'
];

const matrix = runtimeReadiness.resolveCaoRuntimeReadiness();

function assertSameValues(actual, expected, message) {
  assert.deepEqual(Array.from(actual), Array.from(expected), message);
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
assert.ok(
  pb.runtime_surfaces.some(surface =>
    surface.surface_key === 'planning_assignment_decision' &&
    surface.function_name === 'resolveCaoPlanningAssignmentDecision' &&
    surface.required_for_payroll_final &&
    surface.supported
  ),
  'PB runtime must include the central planning assignment decision gate'
);

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

const payrollRuntimeModules = [
  ['validateTaskPlanningContext', taskPlanningContext],
  ['resolvePersonnelContractForService', contractResolver],
  ['resolveCaoPlanningAssignmentDecision', planningAssignment],
  ['validateCaoScheduleRules', scheduleRules],
  ['calculatePersonnelCosts', personnelCosts],
  ['calculateRoutePersonnelCosts', routePersonnelCosts],
  ['applyCaoContractRules', contractRules],
  ['resolveCaoFunctionClassification', functionClassification],
  ['resolveCaoApplicability', caoApplicability],
  ['calculateCaoReimbursements', reimbursements],
  ['calculateCaoLeaveAndSickness', leaveSickness],
  ['calculateCaoYearEndBonus', yearEndBonus],
  ['resolveCaoPolicyReferenceContext', policyReferenceContext],
  ['resolveCaoGovernanceCompliancePolicy', governanceCompliancePolicy]
];

const pbRuntimeFunctionNames = new Set(
  pb.runtime_surfaces
    .filter(surface => surface.required_for_payroll_final)
    .map(surface => surface.function_name)
);
for (const [functionName] of payrollRuntimeModules) {
  assert.ok(
    pbRuntimeFunctionNames.has(functionName),
    `${functionName} must be declared in resolveCaoRuntimeReadiness PAYROLL_FINAL_RUNTIME_SURFACES`
  );
}

for (const [functionName, module] of payrollRuntimeModules) {
  assert.equal(typeof module.getCaoRuntimeSupport, 'function', `${functionName} must expose getCaoRuntimeSupport for fail-closed audits`);
  const pbSupport = module.getCaoRuntimeSupport('cao_particuliere_beveiliging', functionName);
  assert.equal(pbSupport.supported, true, `${functionName} must support PB runtime`);
  assertSameValues(pbSupport.supported_cao_keys, ['cao_particuliere_beveiliging'], `${functionName} must not add external CAOs before verified runtime exists`);

  for (const externalKey of matrix.known_source_monitoring_only_cao_keys) {
    const support = module.getCaoRuntimeSupport(externalKey, functionName);
    assert.equal(support.supported, false, `${functionName} must fail closed for ${externalKey}`);
    assert.equal(support.status, 'blocked_unsupported_cao_runtime', `${functionName}/${externalKey} wrong unsupported status`);
    assert.equal(support.cao_key, externalKey, `${functionName}/${externalKey} must report the attempted cao_key`);
    assert.ok(
      support.message.includes('geen PB-regels') || support.message.includes('nog niet'),
      `${functionName}/${externalKey} must explain that PB rules cannot be reused for this CAO`
    );
  }

  const missingSupport = module.getCaoRuntimeSupport(null, functionName);
  assert.equal(missingSupport.supported, false, `${functionName} must fail closed when cao_key is missing`);
  assert.equal(missingSupport.status, 'blocked_missing_cao_key', `${functionName} must report missing cao_key`);
}

const customerRuntimeFunctionNames = new Set(payrollRuntimeModules.map(([functionName]) => functionName));
for (const functionName of customerRuntimeFunctionNames) {
  const functionPath = path.join(repoRoot, 'base44/functions', functionName, 'entry.ts');
  const source = fs.readFileSync(functionPath, 'utf8');
  assert.equal(
    /caoKey\s*=\s*CAO_PB_KEY/.test(source),
    false,
    `${functionName} must not default helper caoKey parameters to CAO_PB_KEY; missing cao_key must fail closed`
  );
}

for (const externalKey of matrix.known_source_monitoring_only_cao_keys) {
  const readinessGate = {
    cao_readiness: [{
      cao_key: externalKey,
      status: 'known_cao_runtime_not_implemented',
      payroll_final_allowed_by_static_runtime: false,
      planning_final_allowed_by_static_runtime: false,
      manual_review_required: true,
      blocking_reasons: [`CAO ${externalKey} is bekend voor bronbewaking, maar mist geverifieerde lokale runtime.`]
    }]
  };
  const assignment = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: `person-${externalKey}`, service_context: { cao_key: externalKey } },
    serviceContextValidation: {
      service_context: {
        company_id: 'company-1',
        cao_key: externalKey,
        service_function_type: 'external-cao-service'
      },
      service_context_readiness: {
        status: 'planning_context_ready',
        ready: true,
        source_rule_ids: [],
        blocking_reasons: [],
        manual_review_reasons: [],
        warnings: []
      }
    },
    contractResolution: {
      status: 'resolved',
      cao_key: externalKey,
      service_context: { company_id: 'company-1', cao_key: externalKey },
      selected_contract: { id: `contract-${externalKey}`, company_id: 'company-1', cao_key: externalKey },
      contract_id: `contract-${externalKey}`,
      planning_allowed: true,
      payroll_final_allowed: true,
      manual_review_required: false,
      blocking_reasons: [],
      manual_review_reasons: [],
      source_rule_ids: []
    },
    caoRuntimeReadiness: readinessGate,
    scheduleValidation: {
      planning_allowed: true,
      payroll_final_allowed: true,
      calculation_status: 'valid',
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      source_rule_ids: []
    },
    requireScheduleValidation: true
  });
  assert.equal(assignment.decision_status, 'blocked', `Planning assignment must block ${externalKey}`);
  assert.equal(assignment.planning_assignment_allowed, false, `Planning assignment must not allow final planning for ${externalKey}`);
  assert.equal(assignment.payroll_final_allowed, false, `Planning assignment must not allow payroll-final for ${externalKey}`);
  assert.ok(
    assignment.blocking_reasons.some(reason => reason.includes(externalKey)),
    `Planning assignment block for ${externalKey} must cite the unsupported CAO`
  );
}

for (const key of expectedKnownKeys) {
  const readiness = runtimeReadiness.buildCaoRuntimeReadinessForKey(key);
  const ingestFamilies = ingestCaoAutomation.getRequiredSourceFamiliesForCao(key).map(family => family.key).sort();
  const readinessFamilies = [...readiness.source_families].sort();
  const contractFamilies = readiness.source_monitoring_contract.map(family => family.family_key).sort();

  assertSameValues(readinessFamilies, ingestFamilies, `${key} readiness source families must match ingest gate families`);
  assertSameValues(contractFamilies, ingestFamilies, `${key} source monitoring contract must cover every ingest gate family`);
  assert.equal(
    readiness.source_monitoring_summary.family_count,
    ingestFamilies.length,
    `${key} source monitoring summary family_count mismatch`
  );
  assert.equal(readiness.source_monitoring_summary.all_families_have_primary_url, true, `${key} source families must have primary URLs`);
  assert.equal(readiness.source_monitoring_summary.all_families_have_change_detection, true, `${key} source families must declare change detection`);
  assert.equal(readiness.source_monitoring_summary.all_families_have_effective_date_fields, true, `${key} source families must declare effective date fields`);

  for (const family of readiness.source_monitoring_contract) {
    assert.ok(family.label, `${key}/${family.family_key} missing label`);
    assert.ok(family.primary_urls.length > 0, `${key}/${family.family_key} missing primary_urls`);
    assert.ok(family.required_source_types.length > 0, `${key}/${family.family_key} missing required_source_types`);
    assert.ok(family.official_hosts.length > 0, `${key}/${family.family_key} missing official_hosts`);
    assert.ok(family.change_detection.includes('content_hash'), `${key}/${family.family_key} must include content_hash detection`);
    assert.ok(family.effective_date_fields.length > 0, `${key}/${family.family_key} missing effective_date_fields`);
  }
}

const pbMinimums = ingestCaoAutomation.getSourceCoverageMinimums({ cao_key: 'cao_particuliere_beveiliging' });
assert.equal(pbMinimums.total, 2110, 'PB must retain fixed 2024-2026 source coverage minimum');
assert.equal(pbMinimums.automatic_or_calculation, 852, 'PB automatic coverage minimum changed unexpectedly');

for (const module of [ingestCaoAutomation, syncCaoFromCloudflare]) {
  const missingExternalBaseline = module.evaluateSourceCoverageCompleteness(
    {
      cao_key: 'cao_evenementen_horecabeveiliging',
      source_documents_snapshot: []
    },
    []
  );
  assert.equal(missingExternalBaseline.external_coverage_baseline.required, true);
  assert.equal(missingExternalBaseline.external_coverage_baseline.present, false);
  assert.ok(
    missingExternalBaseline.blocking_findings.some(f => f.code === 'incomplete_external_cao_rule_coverage_baseline'),
    'External CAO without declared coverage baseline must be blocked'
  );

  const declaredExternalMinimums = module.getSourceCoverageMinimums({
    cao_key: 'cao_evenementen_horecabeveiliging',
    coverage_summary: {
      expected_total_rules: 123,
      expected_automation_level_counts: {
        automatic_or_calculation: 45,
        validation_or_policy: 12,
        workflow_or_documentation: 8
      }
    }
  });
  assert.equal(declaredExternalMinimums.total, 123);
  assert.equal(declaredExternalMinimums.automatic_or_calculation, 45);
  assert.equal(declaredExternalMinimums.validation_or_policy, 12);
  assert.equal(declaredExternalMinimums.workflow_or_documentation, 8);
}

const unknown = runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_onbekend');
assert.equal(unknown.known_cao, false);
assert.equal(unknown.status, 'blocked_unknown_cao_key');
assert.equal(unknown.payroll_final_allowed_by_static_runtime, false);
assert.equal(unknown.manual_review_required, true);

console.log('ok - CAO runtime readiness matrix keeps PB payroll-enabled and other known security CAOs source-monitored but fail-closed.');

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

const schedule = loadFunctionModule('base44/functions/validateCaoScheduleRules/entry.ts');
const taskContext = loadFunctionModule('base44/functions/validateTaskPlanningContext/entry.ts');
const contractResolver = loadFunctionModule('base44/functions/resolvePersonnelContractForService/entry.ts');
const contractRules = loadFunctionModule('base44/functions/applyCaoContractRules/entry.ts');
const correctionQueue = loadFunctionModule('base44/functions/queueCaoPayrollCorrections/entry.ts');

function assertIncludes(values, expected, message) {
  assert.ok(values.includes(expected), `${message}: expected ${expected} in ${JSON.stringify(values)}`);
}

function assertCleanBooleanField(value, expected, field) {
  assert.equal(value, expected, `${field} should remain ${expected}, not be dropped as an empty value`);
}

function runExternalCaoGateScenarios() {
  const signals = schedule.collectInlineExternalCaoSignals([
    { function_type: 'verkeersregelaar' },
    { service_context: { service_function_type: 'veiligheidsdomein toezichthouder' } },
    { works_event_or_hospitality_security: true, event_hospitality_cao_applies: true }
  ], {});
  const keys = signals.map(signal => signal.cao_key).filter(Boolean);
  assertIncludes(keys, 'cao_verkeersregelaars', 'Traffic-controller CAO signal missing');
  assertIncludes(keys, 'cao_veiligheidsdomein', 'Safety-domain CAO signal missing');
  assertIncludes(keys, 'cao_evenementen_horecabeveiliging', 'Event/hospitality CAO signal missing');

  const trafficSignal = schedule.collectInlineExternalCaoSignals([{ function_type: 'verkeersregelaar' }], {});
  const mismatchGate = schedule.buildExternalCaoScopeGate({
    targetCaoKey: 'cao_particuliere_beveiliging',
    signals: trafficSignal
  });
  assert.equal(mismatchGate.passed, false, 'PB schedule validation must block when service context points to traffic-controller CAO');
  assert.equal(mismatchGate.status, 'blocked_cao_scope_signal_mismatch');

  const supportedPb = schedule.getCaoRuntimeSupport('cao_particuliere_beveiliging', 'validateCaoScheduleRules');
  const unsupportedTraffic = schedule.getCaoRuntimeSupport('cao_verkeersregelaars', 'validateCaoScheduleRules');
  assert.equal(supportedPb.supported, true, 'PB runtime should remain supported');
  assert.equal(unsupportedTraffic.supported, false, 'Traffic-controller runtime must fail closed until implemented');
}

function runPlanningContextScenarios() {
  const nonSecurityService = taskContext.buildServiceContext({
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      function_type: 'klantrelatie',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable'
    },
    task: null,
    object: null,
    route: null
  });
  const readiness = taskContext.evaluateServiceContextReadiness(nonSecurityService);
  assert.equal(nonSecurityService.function_type, 'klantrelatie');
  assertCleanBooleanField(nonSecurityService.performs_security_work, false, 'planning_context.performs_security_work');
  assert.equal(nonSecurityService.security_work_percentage, 0);
  assert.equal(readiness.status, 'planning_context_ready');
  assert.equal(readiness.ready, true);

  const trafficService = taskContext.buildServiceContext({
    body: {
      company_id: 'company-a',
      function_type: 'verkeersregelaar',
      performs_security_work: true,
      security_work_percentage: 100
    },
    task: null,
    object: null,
    route: null
  });
  const trafficReadiness = taskContext.evaluateServiceContextReadiness(trafficService);
  assert.equal(trafficService.cao_key, 'cao_verkeersregelaars');
  assert.equal(trafficReadiness.status, 'manual_review_required');
  assert.ok(
    trafficReadiness.manual_review_reasons.some(reason => reason.includes('cao_verkeersregelaars')),
    'Unsupported inferred traffic-controller CAO must force manual review'
  );
}

function runContractResolverScenarios() {
  const serviceContext = contractResolver.inferServiceContext({
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      function_type: 'klantrelatie',
      cao_function_group: 'non_security_staff',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable',
      contract_assignment_policy: 'strict_contract_match'
    },
    task: null,
    route: null,
    object: null
  });
  const readiness = contractResolver.evaluateServiceContextReadiness(serviceContext);
  assert.equal(readiness.status, 'planning_context_ready');
  assertCleanBooleanField(serviceContext.performs_security_work, false, 'resolver.serviceContext.performs_security_work');

  const nonSecurityContract = {
    function_type: 'klantrelatie',
    allowed_function_types: ['klantrelatie'],
    cao_function_group: 'non_security_staff',
    allowed_cao_function_groups: ['non_security_staff'],
    security_role_status: 'not_applicable',
    allowed_security_role_statuses: ['not_applicable'],
    performs_security_work: false,
    security_work_percentage: 0,
    cao_scope_profile: 'non_security_work_article_3_exception'
  };
  const functionMatch = contractResolver.evaluateFunctionMatch(nonSecurityContract, serviceContext);
  const securityScopeMatch = contractResolver.evaluateSecurityScopeMatch(nonSecurityContract, serviceContext);
  assert.equal(functionMatch.matched, true, 'Non-security service should match non-security contract function scope');
  assert.equal(securityScopeMatch.matched, true, 'Non-security service should match article 3 non-security contract scope');

  const securityOnlyContract = {
    function_type: 'objectbeveiliger',
    allowed_function_types: ['objectbeveiliger'],
    cao_function_group: 'objectbeveiliger_receptionist',
    allowed_cao_function_groups: ['objectbeveiliger_receptionist'],
    security_role_status: 'beveiliger',
    allowed_security_role_statuses: ['beveiliger'],
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scope_profile: 'full_security_worker'
  };
  const blockedScope = contractResolver.evaluateSecurityScopeMatch(securityOnlyContract, serviceContext);
  assert.equal(blockedScope.matched, false, 'Non-security service must not match security-only contract');
  assert.ok(blockedScope.blocking_checks.length > 0, 'Security-only mismatch should be blocking, not merely advisory');
}

async function runContractScopePersistenceScenarios() {
  const result = await contractRules.evaluateContractBasis({ asServiceRole: { entities: {} } }, {
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      contract_form: 'bepaalde_tijd',
      contract_start_date: '2026-01-01',
      contract_end_date: '2026-08-01',
      function_type: 'klantrelatie',
      cao_function_group: 'non_security_staff',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable',
      allowed_function_types: ['klantrelatie'],
      allowed_cao_function_groups: ['non_security_staff'],
      allowed_security_role_statuses: ['not_applicable'],
      contract_assignment_policy: 'strict_contract_match'
    },
    personnel: {},
    contract: {},
    targetCaoKey: null
  });
  const update = result.recommended_contract_update || {};
  assert.equal(update.function_type, 'klantrelatie');
  assert.equal(update.cao_function_group, 'non_security_staff');
  assertCleanBooleanField(update.performs_security_work, false, 'recommended_contract_update.performs_security_work');
  assert.equal(update.security_work_percentage, 0);
  assert.equal(update.security_role_status, 'not_applicable');
  assertIncludes(update.allowed_security_role_statuses || [], 'not_applicable', 'not_applicable must be persisted as non-security proof');

  const persistence = contractRules.buildContractRulePersistence({
    contract_basis: result,
    recommended_contract_update: update,
    contract_final_allowed: result.contract_final_allowed,
    payroll_final_allowed: result.payroll_final_allowed,
    source_rule_ids: result.source_rule_ids || []
  });
  assert.equal(persistence.function_type, 'klantrelatie');
  assertCleanBooleanField(persistence.performs_security_work, false, 'persistence.performs_security_work');
  assert.equal(persistence.security_role_status, 'not_applicable');
}

function runProbationScenarios() {
  const fullSecurityScope = {
    cao_scope_profile: 'full_security_worker',
    applies_full_security_rules: true,
    manual_review_required: false,
    payroll_rule_profile: {
      apply_article_40_special_hours: true,
      apply_article_41_holidays: true,
      apply_article_42_overtime: true
    }
  };

  const sevenMonthFixedTerm = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 1,
    security_role_status: 'beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a'
  }, fullSecurityScope);
  assert.equal(sevenMonthFixedTerm.probation_period_months, 1, 'Fixed-term contract longer than 6 months should get 1 month probation');
  assert.equal(sevenMonthFixedTerm.probation_compliant, true);
  assertIncludes(sevenMonthFixedTerm.source_rule_ids, 'CAO-PB-2024-R0315', 'Fixed-term probation source rule missing');

  const aspirantSevenMonth = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 2,
    security_role_status: 'aspirant_beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'aspirant'
  }, fullSecurityScope);
  assert.equal(aspirantSevenMonth.probation_period_months, 2, 'Aspirant security worker longer than 6 months should get 2 months probation');
  assert.equal(aspirantSevenMonth.probation_compliant, true);
  assertIncludes(aspirantSevenMonth.source_rule_ids, 'CAO-PB-2024-R0317', 'Aspirant probation source rule missing');

  const indefinite = contractRules.calculateProbationPeriod({
    contract_form: 'onbepaalde_tijd',
    contract_start_date: '2026-01-01',
    requested_probation_period_months: 2,
    security_role_status: 'beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a'
  }, fullSecurityScope);
  assert.equal(indefinite.probation_period_months, 2, 'Indefinite contract should get 2 months probation');
  assert.equal(indefinite.probation_compliant, true);
  assertIncludes(indefinite.source_rule_ids, 'CAO-PB-2024-R0316', 'Indefinite probation source rule missing');
}

function runEffectiveDateCorrectionScenarios() {
  const review = {
    id: 'review-2026-wage',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    import_run_id: 'import-1',
    rule_key: 'wage_scales.2026',
    field_path: 'wage_scales',
    effective_from: '2026-05-10',
    effective_until: null,
    payroll_impact: true,
    status: 'applied'
  };
  const touchedRun = {
    id: 'payroll-2026-05',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    pay_period_year: 2026,
    pay_period_number: 5,
    pay_period_start: '2026-05-01',
    pay_period_end: '2026-05-28',
    payroll_run_status: 'paid',
    calculation_output: { gross: 1000 }
  };
  const beforeRun = {
    id: 'payroll-before-change',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    pay_period_year: 2026,
    pay_period_number: 4,
    pay_period_start: '2026-04-12',
    pay_period_end: '2026-05-09',
    payroll_run_status: 'paid'
  };

  assert.equal(correctionQueue.runTouchesReview(touchedRun, review), true);
  assert.equal(correctionQueue.runTouchesReview(beforeRun, review), false, 'Payroll ending before effective_from must not be affected');

  const overlap = correctionQueue.exactOverlapEvidence(touchedRun, review);
  assert.equal(overlap.match_type, 'exact_pay_period_overlap');
  assert.equal(overlap.overlap_start, '2026-05-10');
  assert.equal(overlap.overlap_end, '2026-05-28');
  assert.equal(overlap.overlap_days, 19);

  const inferredDateReview = { ...review, effective_from_inferred: true };
  const manualReason = correctionQueue.effectiveDateManualReviewReason(inferredDateReview);
  assert.ok(manualReason.includes('afgeleide ingangsdatum'), 'Inferred effective date must require manual review before correction matching');

  const config = {
    id: 'cao-config-pb',
    cao_key: 'cao_particuliere_beveiliging',
    pay_periods: {
      2026: [
        { period_number: 5, start_date: '2026-05-29', end_date: '2026-06-25' },
        { period_number: 6, start_date: '2026-06-26', end_date: '2026-07-23' }
      ]
    }
  };
  const queueTarget = correctionQueue.resolveCorrectionQueueTarget({
    review,
    run: touchedRun,
    reviewCaoKey: 'cao_particuliere_beveiliging',
    config,
    payrollRuns: [
      { ...touchedRun },
      {
        id: 'already-final-pay-period-5',
        cao_key: 'cao_particuliere_beveiliging',
        pay_period_year: 2026,
        pay_period_number: 5,
        payroll_run_status: 'paid'
      }
    ],
    configById: {},
    queueReferenceDate: '2026-06-01',
    requestedTarget: null
  });
  assert.equal(queueTarget.match_type, 'next_open_pay_period');
  assert.equal(queueTarget.pay_period_year, 2026);
  assert.equal(queueTarget.pay_period_number, 6, 'Correction must be queued into the first future open pay period');
  assert.equal(queueTarget.manual_review_required, false);

  const correctionData = correctionQueue.buildCorrectionData(
    review,
    touchedRun,
    'queued',
    'Payrollrun is al betaald; correctie moet in de volgende open loonperiode landen.',
    'cao_particuliere_beveiliging',
    overlap,
    queueTarget
  );
  assert.equal(correctionData.effective_from, '2026-05-10');
  assert.equal(correctionData.affected_overlap_start, '2026-05-10');
  assert.equal(correctionData.queued_for_pay_period_number, 6);
  assert.equal(correctionData.queue_target_match_type, 'next_open_pay_period');

  const ehbRun = { ...touchedRun, id: 'ehb-payroll', cao_key: 'cao_evenementen_horecabeveiliging' };
  assert.equal(
    correctionQueue.runMatchesReviewCao(ehbRun, 'cao_particuliere_beveiliging', {}),
    false,
    'Retroactive PB correction must not touch a payroll run calculated under another CAO'
  );
}

async function main() {
  const scenarios = [
    ['external CAO gates', () => runExternalCaoGateScenarios()],
    ['planning context', () => runPlanningContextScenarios()],
    ['contract resolver scope', () => runContractResolverScenarios()],
    ['contract scope persistence', () => runContractScopePersistenceScenarios()],
    ['probation rules', () => runProbationScenarios()],
    ['effective-date correction queue', () => runEffectiveDateCorrectionScenarios()]
  ];

  for (const [name, fn] of scenarios) {
    await fn();
    console.log(`ok - ${name}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

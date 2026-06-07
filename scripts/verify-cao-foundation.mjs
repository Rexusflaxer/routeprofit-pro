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
const reimbursements = loadFunctionModule('base44/functions/calculateCaoReimbursements/entry.ts');
const leaveSickness = loadFunctionModule('base44/functions/calculateCaoLeaveAndSickness/entry.ts');
const yearEndBonus = loadFunctionModule('base44/functions/calculateCaoYearEndBonus/entry.ts');
const personnelCosts = loadFunctionModule('base44/functions/calculatePersonnelCosts/entry.ts');
const routePersonnelCosts = loadFunctionModule('base44/functions/calculateRoutePersonnelCosts/entry.ts');
const functionClassification = loadFunctionModule('base44/functions/resolveCaoFunctionClassification/entry.ts');
const caoApplicability = loadFunctionModule('base44/functions/resolveCaoApplicability/entry.ts');
const policyReferenceContext = loadFunctionModule('base44/functions/resolveCaoPolicyReferenceContext/entry.ts');
const caoRuntimeReadiness = loadFunctionModule('base44/functions/resolveCaoRuntimeReadiness/entry.ts');
const planningAssignment = loadFunctionModule('base44/functions/resolveCaoPlanningAssignmentDecision/entry.ts');
const caoConfigurationOptions = loadFunctionModule('base44/functions/listCaoConfigurationOptions/entry.ts');
const ingestCaoAutomation = loadFunctionModule('base44/functions/ingestCaoAutomationPayload/entry.ts');
const syncCaoFromCloudflare = loadFunctionModule('base44/functions/syncCaoFromCloudflare/entry.ts');

function assertIncludes(values, expected, message) {
  assert.ok(values.includes(expected), `${message}: expected ${expected} in ${JSON.stringify(values)}`);
}

function assertAlmostEqual(actual, expected, message) {
  assert.equal(Math.round(Number(actual) * 100) / 100, expected, message);
}

function assertCleanBooleanField(value, expected, field) {
  assert.equal(value, expected, `${field} should remain ${expected}, not be dropped as an empty value`);
}

function assertSameValues(actual, expected, message) {
  assert.deepEqual([...actual], expected, message);
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

  const readinessMatrix = caoRuntimeReadiness.resolveCaoRuntimeReadiness();
  assertIncludes(readinessMatrix.known_security_cao_keys, 'cao_particuliere_beveiliging', 'PB CAO catalog entry missing');
  assertIncludes(readinessMatrix.known_security_cao_keys, 'cao_evenementen_horecabeveiliging', 'EHB CAO catalog entry missing');
  assertIncludes(readinessMatrix.known_security_cao_keys, 'cao_veiligheidsdomein', 'Safety-domain CAO catalog entry missing');
  assertIncludes(readinessMatrix.known_security_cao_keys, 'cao_verkeersregelaars', 'Traffic-controller CAO catalog entry missing');
  assertSameValues(readinessMatrix.supported_payroll_runtime_cao_keys, ['cao_particuliere_beveiliging'], 'Only CAO PB should be payroll-runtime supported');
  assertIncludes(readinessMatrix.known_source_monitoring_only_cao_keys, 'cao_evenementen_horecabeveiliging', 'EHB must stay source-monitored but blocked until runtime exists');
  assertIncludes(readinessMatrix.known_source_monitoring_only_cao_keys, 'cao_veiligheidsdomein', 'Safety-domain must stay source-monitored but blocked until runtime exists');
  assertIncludes(readinessMatrix.known_source_monitoring_only_cao_keys, 'cao_verkeersregelaars', 'Traffic-controller must stay source-monitored but blocked until runtime exists');

  const pbReadiness = caoRuntimeReadiness.buildCaoRuntimeReadinessForKey('cao_particuliere_beveiliging');
  assert.equal(pbReadiness.source_monitoring_summary.all_families_have_primary_url, true);
  assertIncludes(
    pbReadiness.source_monitoring_summary.primary_urls,
    'https://www.beveiligingsbranche.nl/cao/',
    'PB source monitoring must include the official CAO landing page'
  );
  assertIncludes(
    pbReadiness.source_monitoring_summary.primary_urls,
    'https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2025-per-uur-en-per-4-weken-1.pdf',
    'PB source monitoring must include the official 2025 wage table'
  );
  assertIncludes(
    pbReadiness.source_monitoring_summary.primary_urls,
    'https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2026-per-uur-en-per-4-weken.pdf',
    'PB source monitoring must include the official 2026 wage table'
  );
  assertIncludes(
    pbReadiness.source_monitoring_summary.primary_urls,
    'https://www.beveiligingsbranche.nl/wp-content/uploads/Loonperiodes-2025.pdf',
    'PB source monitoring must include the official 2025 pay-period table'
  );
  const ehbReadiness = caoRuntimeReadiness.buildCaoRuntimeReadinessForKey('cao_evenementen_horecabeveiliging');
  assertIncludes(
    ehbReadiness.source_monitoring_summary.primary_urls,
    'https://www.veiligheidsbranche.nl/cao/cao-ehb/',
    'EHB source monitoring must include the official CAO landing page'
  );
  assert.equal(ehbReadiness.payroll_final_allowed_by_static_runtime, false);

  const unknownReadiness = caoRuntimeReadiness.buildCaoRuntimeReadinessForKey('cao_onbekend');
  assert.equal(unknownReadiness.status, 'blocked_unknown_cao_key');
  assert.equal(unknownReadiness.payroll_final_allowed_by_static_runtime, false);
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

  const legacyNotRequiredService = taskContext.buildServiceContext({
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable',
      contract_assignment_policy: 'not_required'
    },
    task: null,
    object: null,
    route: null
  });
  const legacyReadiness = taskContext.evaluateServiceContextReadiness(legacyNotRequiredService);
  assert.equal(legacyNotRequiredService.contract_assignment_policy, 'strict_contract_match', 'Legacy not_required policy must normalize to strict contract matching');
  assert.equal(legacyReadiness.status, 'blocked', 'Legacy not_required policy must not bypass missing function context');
  assertIncludes(
    legacyReadiness.blocking_reasons,
    'Dienst mist functiecontext. Stel service_function_type, required_cao_function_group of task_type in voordat contractmatching definitief mag zijn.',
    'Legacy not_required planning context must fail closed'
  );

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

  const objectDefaultCompanyService = taskContext.buildServiceContext({
    body: {
      cao_key: 'cao_particuliere_beveiliging',
      function_type: 'objectbeveiliger',
      performs_security_work: true,
      security_work_percentage: 100,
      security_role_status: 'beveiliger'
    },
    task: null,
    object: { default_operating_company_id: 'company-object-default' },
    route: null
  });
  assert.equal(objectDefaultCompanyService.company_id, 'company-object-default');
  assert.equal(objectDefaultCompanyService.company_id_source, 'object.default_operating_company_id');
}

function runCaoApplicabilityScenarios() {
  const nonSecurityApplicability = caoApplicability.resolveApplicability({
    function_type: 'klantrelatie',
    performs_security_work: false,
    security_work_percentage: 0,
    security_role_status: 'not_applicable'
  }, {}, {});
  assert.equal(nonSecurityApplicability.cao_scope_profile, 'non_security_work_article_3_exception');
  assert.equal(nonSecurityApplicability.applies_cao_pb, true);
  assert.equal(nonSecurityApplicability.applies_full_security_rules, false);
  assert.equal(nonSecurityApplicability.manual_review_required, false);
  assertIncludes(nonSecurityApplicability.source_rule_ids, 'CAO-PB-2024-R0164', 'Article 4 rights source rule must be retained in applicability output');
  assertIncludes(nonSecurityApplicability.source_rule_ids, 'CAO-PB-2024-R0234', 'Article 4 rights source rule must be retained in applicability output');
  assertIncludes(nonSecurityApplicability.source_rule_ids, 'CAO-PB-2024-R0233', 'Appendix 2 exclusion source rule must be retained for non-security work');
}

function runPolicyReferenceContextScenarios() {
  const contractPolicyContext = policyReferenceContext.resolvePolicyReferenceContext({
    cao_key: 'cao_particuliere_beveiliging',
    domains: ['contract_employment']
  });
  assert.equal(contractPolicyContext.policy_reference_context_status, 'resolved');
  assert.equal(contractPolicyContext.calculation_policy, 'policy_only');
  assert.equal(contractPolicyContext.manual_review_required, false);
  assert.equal(contractPolicyContext.payroll_final_allowed, true);
  assert.ok(contractPolicyContext.source_rule_count >= 50, 'Contract policy context should expose high-impact contract reference rules');
  assertIncludes(contractPolicyContext.source_rule_ids, 'CAO-PB-2024-R0296', 'Fulltime contract article heading policy anchor missing');
  assertIncludes(contractPolicyContext.source_rule_ids, 'CAO-PB-2024-R0452', 'Summary dismissal policy anchor missing');

  const payrollPolicyContext = policyReferenceContext.resolvePolicyReferenceContext({
    cao_key: 'cao_particuliere_beveiliging',
    surfaces: ['payroll']
  });
  assert.equal(payrollPolicyContext.policy_reference_context_status, 'resolved');
  assert.ok(payrollPolicyContext.source_rule_ids.includes('CAO-PB-2024-R1201'), 'Pension/older-worker payroll policy anchor missing');
  assert.ok(payrollPolicyContext.source_rule_ids.includes('CAO-PB-2024-R0768'), 'Year-end bonus policy anchor missing');

  const metadataContext = policyReferenceContext.resolvePolicyReferenceContext({
    cao_key: 'cao_particuliere_beveiliging',
    domains: ['metadata_toc']
  });
  assert.equal(metadataContext.policy_reference_context_status, 'resolved');
  assert.equal(metadataContext.policy_reference_context_type, 'cao_reference_and_policy_rules');
  assert.ok(metadataContext.source_rule_count >= 150, 'Metadata/table-of-contents context should expose full CAO navigation references');
  assertIncludes(metadataContext.source_rule_ids, 'CAO-PB-2024-R0008', 'CAO table-of-contents context must include inhoud heading');
  assertIncludes(metadataContext.source_rule_ids, 'CAO-PB-2024-R0159', 'CAO table-of-contents context must include appendix/protocol tail references');

  const schipholAgreementContext = policyReferenceContext.resolvePolicyReferenceContext({
    cao_key: 'cao_particuliere_beveiliging',
    domains: ['airport_schiphol_agreements'],
    surfaces: ['reimbursement']
  });
  assert.equal(schipholAgreementContext.policy_reference_context_status, 'resolved');
  assertIncludes(schipholAgreementContext.source_rule_ids, 'CAO-PB-2024-R1956', 'Schiphol agreement reference context missing');
  assertIncludes(schipholAgreementContext.source_rule_ids, 'CAO-PB-2024-R2073', 'Schiphol agreement tail reference context missing');

  const unsupported = policyReferenceContext.resolvePolicyReferenceContext({
    cao_key: 'cao_verkeersregelaars',
    surfaces: ['payroll']
  });
  assert.equal(unsupported.policy_reference_context_status, 'blocked_unsupported_cao_runtime');
  assert.equal(unsupported.manual_review_required, true);
  assert.equal(unsupported.payroll_final_allowed, false);
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

  const legacyBypassServiceContext = {
    ...serviceContext,
    contract_assignment_policy: 'not_required'
  };
  const blockedFunctionByLegacyPolicy = contractResolver.evaluateFunctionMatch(securityOnlyContract, legacyBypassServiceContext);
  const blockedScopeByLegacyPolicy = contractResolver.evaluateSecurityScopeMatch(securityOnlyContract, legacyBypassServiceContext);
  assert.equal(blockedFunctionByLegacyPolicy.matched, false, 'not_required must not bypass function matching');
  assert.equal(blockedScopeByLegacyPolicy.matched, false, 'not_required must not bypass article 3 security-scope matching');

  const activeContracts = [
    { id: 'contract-company-a', company_id: 'company-a' },
    { id: 'contract-company-b', company_id: 'company-b' },
    { id: 'legacy-companyless-contract' }
  ];
  const companyBCandidates = contractResolver.resolveCompanyScopedContractCandidates({
    activeContracts,
    companyId: 'company-b',
    serviceDate: '2026-01-15'
  });
  assert.deepEqual(
    companyBCandidates.contract_candidates.map(contract => contract.id),
    ['contract-company-b'],
    'Exact company contract must take precedence over legacy/companyless contracts'
  );
  assert.equal(companyBCandidates.contract_selection_policy, 'exact_company_contracts_only');
  assertIncludes(companyBCandidates.ignored_other_company_contract_ids, 'contract-company-a', 'Other company contract must be ignored');
  assert.ok(companyBCandidates.warnings.some(message => message.includes('Legacy contracten zonder company_id zijn genegeerd')));

  const legacyOnlyCandidates = contractResolver.resolveCompanyScopedContractCandidates({
    activeContracts: [{ id: 'legacy-companyless-contract' }],
    companyId: 'company-b',
    serviceDate: '2026-01-15'
  });
  assert.deepEqual(legacyOnlyCandidates.contract_candidates.map(contract => contract.id), ['legacy-companyless-contract']);
  assert.equal(legacyOnlyCandidates.contract_selection_policy, 'legacy_companyless_contracts_manual_review');
  assert.ok(
    legacyOnlyCandidates.manual_review_reasons.some(message => message.includes('legacy contract zonder company_id')),
    'Legacy companyless contract must require manual review for definitive planning/payroll'
  );

  const wrongCompanyCandidates = contractResolver.resolveCompanyScopedContractCandidates({
    activeContracts: [{ id: 'contract-company-a', company_id: 'company-a' }],
    companyId: 'company-b',
    serviceDate: '2026-01-15'
  });
  assert.equal(wrongCompanyCandidates.contract_candidates.length, 0);
  assert.equal(wrongCompanyCandidates.contract_selection_policy, 'no_company_scoped_contract_candidates');
  assert.ok(
    wrongCompanyCandidates.blocking_reasons.some(message => message.includes('Geen actief arbeidscontract gevonden voor bedrijf company-b')),
    'Contract belonging to another company must not be usable for the service company'
  );
}

function runPlanningAssignmentDecisionScenarios() {
  const readyServiceContext = {
    service_date: '2026-01-15',
    company_id: 'company-a',
    task_id: 'task-1',
    object_id: 'object-1',
    cao_key: 'cao_particuliere_beveiliging',
    function_type: 'objectbeveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    security_role_status: 'beveiliger',
    performs_security_work: true,
    security_work_percentage: 100
  };
  const serviceContextValidation = {
    service_context: readyServiceContext,
    service_context_readiness: {
      status: 'planning_context_ready',
      ready: true,
      source_rule_ids: ['CAO-PB-2024-R0227', 'CAO-PB-2024-R0227'],
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: []
    }
  };
  const contractResolution = {
    status: 'resolved',
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    personnel_id: 'person-1',
    company_id: 'company-a',
    contract_id: 'contract-1',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-1',
    selected_contract: {
      id: 'contract-1',
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      cao_configuration_id: 'cao-config-1'
    },
    service_context: readyServiceContext,
    service_context_readiness: {
      source_rule_ids: ['CAO-PB-2024-R0228']
    },
    cao_applicability: {
      source_rule_ids: ['CAO-PB-2024-R0164']
    },
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: []
  };
  const runtimeReadiness = {
    cao_readiness: [{
      cao_key: 'cao_particuliere_beveiliging',
      status: 'local_payroll_runtime_supported',
      payroll_final_allowed_by_static_runtime: true,
      planning_final_allowed_by_static_runtime: true,
      manual_review_required: false,
      blocking_reasons: []
    }]
  };

  const allowed = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    serviceContextValidation,
    contractResolution,
    caoRuntimeReadiness: runtimeReadiness
  });
  assert.equal(allowed.decision_status, 'assignable');
  assert.equal(allowed.planning_assignment_allowed, true);
  assert.equal(allowed.payroll_final_allowed, false);
  assert.equal(allowed.schedule_gate.status, 'not_required_for_assignment_gate');
  assert.equal(allowed.cao_key, 'cao_particuliere_beveiliging');
  assert.equal(allowed.contract_id, 'contract-1');
  assert.equal(allowed.cao_configuration_id, 'cao-config-1');
  assertIncludes(allowed.source_rule_ids, 'CAO-PB-2024-R0164', 'Assignment decision must retain applicability source rules');
  assert.equal(
    allowed.source_rule_ids.filter(ruleId => ruleId === 'CAO-PB-2024-R0227').length,
    1,
    'Assignment decision source_rule_ids must be deduplicated'
  );

  const payrollFinalWithSchedule = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    serviceContextValidation,
    contractResolution,
    scheduleValidation: {
      planning_allowed: true,
      payroll_final_allowed: true,
      calculation_status: 'valid',
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      source_rule_ids: ['CAO-PB-2024-R0560']
    },
    caoRuntimeReadiness: runtimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(payrollFinalWithSchedule.decision_status, 'assignable');
  assert.equal(payrollFinalWithSchedule.planning_assignment_allowed, true);
  assert.equal(payrollFinalWithSchedule.payroll_final_allowed, true);
  assert.equal(payrollFinalWithSchedule.schedule_gate.status, 'schedule_validation_ready');
  assertIncludes(payrollFinalWithSchedule.source_rule_ids, 'CAO-PB-2024-R0560', 'Assignment decision must retain schedule validation source rules');

  const missingContext = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    serviceContextValidation: {
      service_context: { company_id: null },
      service_context_readiness: {
        status: 'blocked',
        ready: false,
        blocking_reasons: ['Dienst mist uitvoerende werkgever/bedrijf.'],
        manual_review_reasons: [],
        warnings: [],
        source_rule_ids: ['CAO-PB-2024-R0227']
      }
    },
    contractResolution,
    caoRuntimeReadiness: runtimeReadiness
  });
  assert.equal(missingContext.decision_status, 'blocked');
  assert.equal(missingContext.planning_assignment_allowed, false);
  assert.equal(missingContext.payroll_final_allowed, false);
  assert.ok(
    missingContext.blocking_reasons.some(reason => reason.includes('uitvoerende werkgever')),
    'Missing company/service context must block final assignment'
  );

  const manualContractReview = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    serviceContextValidation,
    contractResolution: {
      ...contractResolution,
      planning_allowed: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      manual_review_reasons: ['Meerdere actieve contracten matchen deze dienst. Kies expliciet contract_id.']
    },
    caoRuntimeReadiness: runtimeReadiness
  });
  assert.equal(manualContractReview.decision_status, 'manual_review_required');
  assert.equal(manualContractReview.draft_assignment_allowed, true);
  assert.equal(manualContractReview.planning_assignment_allowed, false);
  assert.equal(manualContractReview.payroll_final_allowed, false);

  const unsupportedTraffic = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-traffic', service_context: { cao_key: 'cao_verkeersregelaars' } },
    serviceContextValidation: {
      service_context: { ...readyServiceContext, cao_key: 'cao_verkeersregelaars' },
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
      ...contractResolution,
      cao_key: 'cao_verkeersregelaars',
      service_context: { ...readyServiceContext, cao_key: 'cao_verkeersregelaars' },
      selected_contract: {
        ...contractResolution.selected_contract,
        cao_key: 'cao_verkeersregelaars'
      }
    },
    caoRuntimeReadiness: {
      cao_readiness: [{
        cao_key: 'cao_verkeersregelaars',
        status: 'known_cao_runtime_not_implemented',
        payroll_final_allowed_by_static_runtime: false,
        planning_final_allowed_by_static_runtime: false,
        manual_review_required: true,
        blocking_reasons: ['CAO cao_verkeersregelaars is bekend voor bronbewaking, maar mist geverifieerde lokale runtime.']
      }]
    }
  });
  assert.equal(unsupportedTraffic.decision_status, 'blocked');
  assert.equal(unsupportedTraffic.cao_key, 'cao_verkeersregelaars');
  assert.equal(unsupportedTraffic.planning_assignment_allowed, false);
  assert.ok(
    unsupportedTraffic.blocking_reasons.some(reason => reason.includes('cao_verkeersregelaars')),
    'Unsupported external CAO must fail closed and must not fall back to PB'
  );

  const scheduleRequired = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    serviceContextValidation,
    contractResolution,
    caoRuntimeReadiness: runtimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(scheduleRequired.decision_status, 'blocked');
  assert.equal(scheduleRequired.schedule_gate.status, 'blocked_missing_schedule_validation');
  assert.equal(scheduleRequired.payroll_final_allowed, false);
}

function runIntegratedMultiCompanyPlanningContractScenarios() {
  const object = {
    id: 'object-factory',
    default_operating_company_id: 'company-security-bv',
    cao_key: 'cao_particuliere_beveiliging',
    default_service_function_type: 'objectbeveiliger',
    default_cao_function_group: 'objectbeveiliger_receptionist',
    default_cao_function_level: 'a',
    default_security_role_status: 'beveiliger',
    default_performs_security_work: true,
    default_security_work_percentage: 100
  };
  const task = {
    id: 'task-factory-reception-weekday',
    object_id: 'object-factory',
    cao_key: 'cao_particuliere_beveiliging',
    service_function_type: 'objectbeveiliger',
    required_cao_function_group: 'objectbeveiliger_receptionist',
    required_cao_function_level: 'a',
    required_security_role_status: 'beveiliger',
    performs_security_work: true,
    security_work_percentage: 100,
    contract_assignment_policy: 'strict_contract_match',
    customer_billable: true,
    counts_toward_required_staffing: true
  };
  const serviceContext = contractResolver.inferServiceContext({
    body: {
      service_date: '2026-01-15',
      task_id: task.id,
      object_id: object.id
    },
    task,
    object,
    route: null
  });
  const serviceReadiness = contractResolver.evaluateServiceContextReadiness(serviceContext);
  assert.equal(serviceContext.company_id, 'company-security-bv');
  assert.equal(serviceContext.company_id_source, 'object.default_operating_company_id');
  assert.equal(serviceContext.cao_key, 'cao_particuliere_beveiliging');
  assert.equal(serviceContext.function_type, 'objectbeveiliger');
  assert.equal(serviceContext.cao_function_group, 'objectbeveiliger_receptionist');
  assert.equal(serviceReadiness.status, 'planning_context_ready');

  const securityContract = {
    id: 'contract-security-company',
    personnel_id: 'person-security',
    company_id: 'company-security-bv',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb-2026',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-12-31',
    function_type: 'objectbeveiliger',
    allowed_function_types: ['objectbeveiliger', 'receptie'],
    cao_function_group: 'objectbeveiliger_receptionist',
    allowed_cao_function_groups: ['objectbeveiliger_receptionist'],
    cao_function_level: 'a',
    allowed_cao_function_levels: ['a', 'b', 'c'],
    security_role_status: 'beveiliger',
    allowed_security_role_statuses: ['beveiliger'],
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scope_profile: 'full_security_worker',
    planning_allowed: true,
    payroll_final_allowed: true
  };
  const nonSecuritySameCompanyContract = {
    id: 'contract-customer-relations',
    personnel_id: 'person-customer-relations',
    company_id: 'company-security-bv',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb-2026',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-12-31',
    function_type: 'klantrelatie',
    allowed_function_types: ['klantrelatie'],
    cao_function_group: 'non_security_staff',
    allowed_cao_function_groups: ['non_security_staff'],
    cao_function_level: 'not_applicable',
    allowed_cao_function_levels: ['not_applicable'],
    security_role_status: 'not_applicable',
    allowed_security_role_statuses: ['not_applicable'],
    performs_security_work: false,
    security_work_percentage: 0,
    cao_scope_profile: 'non_security_work_article_3_exception',
    planning_allowed: true,
    payroll_final_allowed: true
  };
  const otherCompanySecurityContract = {
    ...securityContract,
    id: 'contract-other-company',
    personnel_id: 'person-other-company',
    company_id: 'company-other-bv'
  };

  const candidates = contractResolver.resolveCompanyScopedContractCandidates({
    activeContracts: [securityContract, nonSecuritySameCompanyContract, otherCompanySecurityContract],
    companyId: serviceContext.company_id,
    serviceDate: serviceContext.service_date
  });
  assert.deepEqual(
    candidates.contract_candidates.map(contract => contract.id).sort(),
    ['contract-customer-relations', 'contract-security-company'],
    'Only contracts of the operating company may be considered for this object service'
  );
  assertIncludes(candidates.ignored_other_company_contract_ids, 'contract-other-company', 'Contract from another employer must be ignored');

  const securityFunctionMatch = contractResolver.evaluateFunctionMatch(securityContract, serviceContext);
  const securityScopeMatch = contractResolver.evaluateSecurityScopeMatch(securityContract, serviceContext);
  assert.equal(securityFunctionMatch.matched, true);
  assert.equal(securityScopeMatch.matched, true);

  const nonSecurityFunctionMatch = contractResolver.evaluateFunctionMatch(nonSecuritySameCompanyContract, serviceContext);
  const nonSecurityScopeMatch = contractResolver.evaluateSecurityScopeMatch(nonSecuritySameCompanyContract, serviceContext);
  assert.equal(nonSecurityFunctionMatch.matched, false, 'Klantrelatie contract must not match objectbeveiliger/receptiedienst');
  assert.equal(nonSecurityScopeMatch.matched, false, 'Non-security article 3 contract must not match a security object service');
  assert.ok(nonSecurityScopeMatch.blocking_checks.length > 0);

  const runtimeReadiness = {
    cao_readiness: [{
      cao_key: 'cao_particuliere_beveiliging',
      status: 'local_payroll_runtime_supported',
      payroll_final_allowed_by_static_runtime: true,
      planning_final_allowed_by_static_runtime: true,
      manual_review_required: false,
      blocking_reasons: []
    }]
  };
  const serviceContextValidation = {
    service_context: serviceContext,
    service_context_readiness: serviceReadiness
  };
  const contractResolution = {
    status: 'resolved',
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    personnel_id: securityContract.personnel_id,
    company_id: serviceContext.company_id,
    contract_id: securityContract.id,
    cao_key: securityContract.cao_key,
    cao_configuration_id: securityContract.cao_configuration_id,
    selected_contract: securityContract,
    service_context: serviceContext,
    service_context_readiness: serviceReadiness,
    function_match: securityFunctionMatch,
    security_scope_match: securityScopeMatch,
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: candidates.warnings
  };
  const scheduleValidation = {
    planning_allowed: true,
    payroll_final_allowed: true,
    calculation_status: 'final',
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: [],
    source_rule_ids: ['CAO-PB-2024-R0560', 'CAO-PB-2024-R0590']
  };
  const decision = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: securityContract.personnel_id },
    serviceContextValidation,
    contractResolution,
    scheduleValidation,
    caoRuntimeReadiness: runtimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(decision.decision_status, 'assignable');
  assert.equal(decision.planning_assignment_allowed, true);
  assert.equal(decision.payroll_final_allowed, true);
  assert.equal(decision.company_id, 'company-security-bv');
  assert.equal(decision.contract_id, 'contract-security-company');
  assert.equal(decision.cao_configuration_id, 'cao-config-pb-2026');
  assert.equal(decision.task_id, 'task-factory-reception-weekday');
  assert.equal(decision.object_id, 'object-factory');

  const blockedNonSecurityDecision = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: nonSecuritySameCompanyContract.personnel_id },
    serviceContextValidation,
    contractResolution: {
      ...contractResolution,
      status: 'blocked',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      personnel_id: nonSecuritySameCompanyContract.personnel_id,
      contract_id: nonSecuritySameCompanyContract.id,
      selected_contract: nonSecuritySameCompanyContract,
      function_match: nonSecurityFunctionMatch,
      security_scope_match: nonSecurityScopeMatch,
      blocking_reasons: [
        'Arbeidscontractfunctie klantrelatie/non_security_staff matcht niet met objectbeveiliger_receptionist.',
        'Arbeidscontract valt onder artikel 3 niet-beveiligingswerk en mag niet op beveiligingsdienst worden gepland.'
      ],
      manual_review_reasons: []
    },
    scheduleValidation,
    caoRuntimeReadiness: runtimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(blockedNonSecurityDecision.decision_status, 'blocked');
  assert.equal(blockedNonSecurityDecision.planning_assignment_allowed, false);
  assert.equal(blockedNonSecurityDecision.payroll_final_allowed, false);
  assert.ok(
    blockedNonSecurityDecision.blocking_reasons.some(reason => reason.includes('niet-beveiligingswerk')),
    'Security service assigned to non-security contract must block with article 3 scope reason'
  );

  const wrongCompanyCandidates = contractResolver.resolveCompanyScopedContractCandidates({
    activeContracts: [otherCompanySecurityContract],
    companyId: serviceContext.company_id,
    serviceDate: serviceContext.service_date
  });
  assert.equal(wrongCompanyCandidates.contract_candidates.length, 0);
  assert.equal(wrongCompanyCandidates.contract_selection_policy, 'no_company_scoped_contract_candidates');
  assert.ok(
    wrongCompanyCandidates.blocking_reasons.some(reason => reason.includes('bedrijf company-security-bv')),
    'A valid-looking security contract from another operating company must still be unusable'
  );
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

  const sevenMonthTooLow = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 0,
    security_role_status: 'beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a'
  }, fullSecurityScope);
  assert.equal(sevenMonthTooLow.probation_period_months, 1, 'Fixed-term contract longer than 6 months must not accept a shorter probation');
  assert.equal(sevenMonthTooLow.probation_compliant, false);
  assert.equal(sevenMonthTooLow.probation_validation_status, 'non_compliant');
  assert.equal(sevenMonthTooLow.contract_rule_status, 'blocked');
  assertIncludes(sevenMonthTooLow.source_rule_ids, 'CAO-PB-2024-R0315', 'Too-low probation must cite the fixed-term probation source rule');

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

  const nonSecurityScaleTwo = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 1,
    security_role_status: 'aspirant_beveiliger',
    cao_function_group: 'non_security_staff',
    cao_function_level: 'aspirant',
    cao_scale: 2
  }, {
    cao_scope_profile: 'non_security_work_article_3_exception',
    applies_full_security_rules: false,
    manual_review_required: false,
    payroll_rule_profile: {
      apply_article_40_special_hours: false,
      apply_article_41_holidays: true,
      apply_article_42_overtime: false
    }
  });
  assert.equal(nonSecurityScaleTwo.probation_period_months, 1, 'Article 3 non-security work must use regular fixed-term probation, not aspirant security probation');
  assert.equal(nonSecurityScaleTwo.probation_compliant, true);
  assertIncludes(nonSecurityScaleTwo.source_rule_ids, 'CAO-PB-2024-R0315', 'Non-security fixed-term probation source rule missing');
  assert.equal(
    nonSecurityScaleTwo.source_rule_ids.includes('CAO-PB-2024-R0317'),
    false,
    'Aspirant security probation rule must not apply to article 3 non-security work'
  );
  assert.ok(
    nonSecurityScaleTwo.scope_warnings.some(warning => warning.rule_id === 'CAO-PB-2024-R0317'),
    'Blocked aspirant security probation rule should be traceable in scope warnings'
  );

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
  for (const module of [ingestCaoAutomation, syncCaoFromCloudflare]) {
    const explicitPayrollChange = module.buildChangeEffectiveMetadata({
      rule_key: 'wage_scales.2026.scale_3.period_0',
      field_path: 'wage_scales_detailed.3.0.hourly_rate',
      payroll_impact: true,
      effective_from: '2026-05-10',
      change_type: 'updated'
    }, '2026-01-01', '2026-06-01T10:00:00Z');
    assert.equal(explicitPayrollChange.effective_from, '2026-05-10');
    assert.equal(explicitPayrollChange.effective_from_source, 'change.effective_from');
    assert.equal(explicitPayrollChange.effective_from_inferred, false);
    assert.equal(explicitPayrollChange.effective_date_manual_review_required, false);
    assert.equal(explicitPayrollChange.retroactive, true);
    assert.equal(explicitPayrollChange.correction_required, true);
    assert.equal(explicitPayrollChange.correction_status, 'candidate');

    const futurePayrollChange = module.buildChangeEffectiveMetadata({
      rule_key: 'wage_scales.2026.scale_3.period_0',
      field_path: 'wage_scales_detailed.3.0.hourly_rate',
      payroll_impact: true,
      effective_from: '2026-07-01',
      change_type: 'updated'
    }, '2026-01-01', '2026-06-01T10:00:00Z');
    assert.equal(futurePayrollChange.effective_from, '2026-07-01');
    assert.equal(futurePayrollChange.retroactive, false);
    assert.equal(futurePayrollChange.correction_required, false);
    assert.equal(futurePayrollChange.correction_status, 'not_required');

    const fallbackPayrollChange = module.buildChangeEffectiveMetadata({
      rule_key: 'wage_scales.2026.scale_3.period_0',
      field_path: 'wage_scales_detailed.3.0.hourly_rate',
      payroll_impact: true,
      change_type: 'updated'
    }, '2026-01-01', '2026-06-01T10:00:00Z');
    assert.equal(fallbackPayrollChange.effective_from, '2026-01-01');
    assert.equal(fallbackPayrollChange.effective_from_source, 'candidate_configuration.valid_from');
    assert.equal(fallbackPayrollChange.effective_from_inferred, true);
    assert.equal(fallbackPayrollChange.effective_date_manual_review_required, true);
    assert.equal(fallbackPayrollChange.correction_required, true);
    assert.equal(fallbackPayrollChange.correction_status, 'manual_review_required');

    const invalidRangeChange = module.buildChangeEffectiveMetadata({
      rule_key: 'wage_scales.2026.scale_3.period_0',
      field_path: 'wage_scales_detailed.3.0.hourly_rate',
      payroll_impact: true,
      effective_from: '2026-05-10',
      effective_until: '2026-05-09',
      change_type: 'updated'
    }, '2026-01-01', '2026-06-01T10:00:00Z');
    assert.equal(invalidRangeChange.effective_date_manual_review_required, true);
    assert.equal(invalidRangeChange.correction_status, 'manual_review_required');
    assert.ok(
      invalidRangeChange.effective_date_warnings.some(message => message.includes('effective_until ligt voor effective_from')),
      'Invalid effective date range must be visible in review warnings'
    );
  }

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

  const limitedWindowReview = { ...review, effective_until: '2026-05-20' };
  const afterWindowRun = {
    id: 'payroll-after-effective-until',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    pay_period_year: 2026,
    pay_period_number: 5,
    pay_period_start: '2026-05-21',
    pay_period_end: '2026-05-28',
    payroll_run_status: 'paid'
  };
  assert.equal(correctionQueue.runTouchesReview(touchedRun, limitedWindowReview), true);
  assert.equal(correctionQueue.runTouchesReview(afterWindowRun, limitedWindowReview), false, 'Payroll after effective_until must not be affected');
  const limitedOverlap = correctionQueue.exactOverlapEvidence(touchedRun, limitedWindowReview);
  assert.equal(limitedOverlap.overlap_start, '2026-05-10');
  assert.equal(limitedOverlap.overlap_end, '2026-05-20');
  assert.equal(limitedOverlap.overlap_days, 11);

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

async function runCaoConfigurationDateSelectionScenarios() {
  const oldConfig = {
    id: 'cao-old',
    cao_key: 'cao_particuliere_beveiliging',
    status: 'active',
    is_active: true,
    valid_from: '2024-12-18',
    valid_until: '2026-05-09'
  };
  const newConfig = {
    id: 'cao-new',
    cao_key: 'cao_particuliere_beveiliging',
    status: 'active',
    is_active: true,
    valid_from: '2026-05-10',
    valid_until: '2026-12-27'
  };

  const beforeChangePayroll = personnelCosts.resolvePayrollCaoConfiguration([oldConfig, newConfig], {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-09'
  });
  assert.equal(beforeChangePayroll.status, 'resolved');
  assert.equal(beforeChangePayroll.config.id, 'cao-old', 'Payroll through 2026-05-09 must use the old CAO config');

  const afterChangePayroll = personnelCosts.resolvePayrollCaoConfiguration([oldConfig, newConfig], {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-10',
    periodEnd: '2026-05-28'
  });
  assert.equal(afterChangePayroll.status, 'resolved');
  assert.equal(afterChangePayroll.config.id, 'cao-new', 'Payroll from 2026-05-10 must use the new CAO config');

  const spanningPayroll = personnelCosts.resolvePayrollCaoConfiguration([oldConfig, newConfig], {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-28'
  });
  assert.equal(spanningPayroll.status, 'blocked_payroll_period_spans_multiple_cao_configs');
  assert.equal(spanningPayroll.config, null);
  assert.deepEqual(
    spanningPayroll.candidates.map(candidate => candidate.id),
    ['cao-new', 'cao-old'],
    'Payroll period crossing a CAO change must expose both candidates and require splitting'
  );

  const scheduleBase44 = {
    asServiceRole: {
      entities: {
        CAOConfiguration: {
          filter: async () => [oldConfig, newConfig]
        }
      }
    }
  };
  const beforeChangeSchedule = await schedule.resolveScheduleCaoConfiguration(scheduleBase44, {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-09'
  });
  assert.equal(beforeChangeSchedule.status, 'resolved');
  assert.equal(beforeChangeSchedule.config.id, 'cao-old');

  const afterChangeSchedule = await schedule.resolveScheduleCaoConfiguration(scheduleBase44, {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-10',
    periodEnd: '2026-05-28'
  });
  assert.equal(afterChangeSchedule.status, 'resolved');
  assert.equal(afterChangeSchedule.config.id, 'cao-new');

  const spanningSchedule = await schedule.resolveScheduleCaoConfiguration(scheduleBase44, {
    caoKey: 'cao_particuliere_beveiliging',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-28'
  });
  assert.equal(spanningSchedule.status, 'blocked_schedule_period_spans_multiple_cao_configs');
  assert.equal(spanningSchedule.config, null);

  for (const [label, module] of [
    ['leave/sickness', leaveSickness],
    ['reimbursements', reimbursements],
    ['year-end bonus', yearEndBonus]
  ]) {
    const before = await module.resolveActiveCaoConfig(
      scheduleBase44,
      '2026-05-09',
      'cao_particuliere_beveiliging'
    );
    assert.equal(before.status, 'resolved', `${label} should resolve old config before change date`);
    assert.equal(before.config.id, 'cao-old', `${label} through 2026-05-09 must use old CAO config`);

    const after = await module.resolveActiveCaoConfig(
      scheduleBase44,
      '2026-05-10',
      'cao_particuliere_beveiliging'
    );
    assert.equal(after.status, 'resolved', `${label} should resolve new config from change date`);
    assert.equal(after.config.id, 'cao-new', `${label} from 2026-05-10 must use new CAO config`);
  }

  const classificationBase44 = {
    asServiceRole: {
      entities: {
        CAOConfiguration: {
          filter: async () => [oldConfig, newConfig]
        }
      }
    }
  };
  const beforeChangeClassification = await functionClassification.resolveActiveCaoConfig(
    classificationBase44,
    '2026-05-09',
    'cao_particuliere_beveiliging'
  );
  assert.equal(beforeChangeClassification.status, 'resolved');
  assert.equal(beforeChangeClassification.config.id, 'cao-old');

  const afterChangeClassification = await functionClassification.resolveActiveCaoConfig(
    classificationBase44,
    '2026-05-10',
    'cao_particuliere_beveiliging'
  );
  assert.equal(afterChangeClassification.status, 'resolved');
  assert.equal(afterChangeClassification.config.id, 'cao-new');

  const overlappingOldConfig = { ...oldConfig, id: 'cao-old-overlap', valid_until: '2026-05-15' };
  const overlappingBase44 = {
    asServiceRole: {
      entities: {
        CAOConfiguration: {
          filter: async () => [overlappingOldConfig, newConfig]
        }
      }
    }
  };
  const ambiguousClassification = await functionClassification.resolveActiveCaoConfig(
    overlappingBase44,
    '2026-05-10',
    'cao_particuliere_beveiliging'
  );
  assert.equal(ambiguousClassification.status, 'blocked_ambiguous_active_cao_config');
  assert.equal(ambiguousClassification.config, null);
  assert.deepEqual(
    ambiguousClassification.candidates.map(candidate => candidate.id),
    ['cao-new', 'cao-old-overlap'],
    'Overlapping function-classification CAO configs must block instead of silently selecting latest'
  );

  for (const [label, module] of [
    ['leave/sickness', leaveSickness],
    ['reimbursements', reimbursements],
    ['year-end bonus', yearEndBonus]
  ]) {
    const ambiguous = await module.resolveActiveCaoConfig(
      overlappingBase44,
      '2026-05-10',
      'cao_particuliere_beveiliging'
    );
    assert.equal(ambiguous.status, 'blocked_ambiguous_active_cao_config', `${label} must block overlapping active CAO configs`);
    assert.equal(ambiguous.config, null);
    assert.deepEqual(
      ambiguous.candidates.map(candidate => candidate.id),
      ['cao-new', 'cao-old-overlap'],
      `${label} overlap must expose candidate configs for owner cleanup`
    );
  }
}

function runReimbursementScenarios() {
  const params = reimbursements.resolveReimbursementParameters(null);
  assert.equal(params.travel_cost_per_km, 0.23);
  assert.equal(params.travel_min_km, 9);
  assert.equal(params.travel_above_40_threshold_km, 40);
  assert.equal(params.travel_above_40_rate_per_km, 0.16);
  assert.equal(params.work_work_travel_rate_per_km, 0.27);
  assert.equal(params.meal_allowance_max, 11.91);
  assert.equal(params.break_availability_per_half_hour, 0.43);
  assert.equal(params.consignment_per_hour, 1.43);
  assert.equal(params.consignment_weekend_holiday_per_hour, 2.87);
  assert.equal(params.reachability_per_pay_period, 71.73);

  const shortCommute = reimbursements.calculateTravelCost(8, null, params);
  assert.equal(shortCommute.eligible, false, 'Commute below 9 km one-way must not receive regular travel allowance');
  assert.equal(shortCommute.amount, 0);

  const longCommute = reimbursements.calculateTravelCost(45, null, params);
  assert.equal(longCommute.eligible, true);
  assert.equal(longCommute.km_total, 90);
  assertAlmostEqual(longCommute.base_amount, 20.7, 'Base commute amount must use EUR 0.23/km over return trip');
  assertAlmostEqual(longCommute.above_40_amount, 1.6, 'Above-40km supplement must use EUR 0.16/km over excess return km');
  assertAlmostEqual(longCommute.amount, 22.3, 'Total commute reimbursement mismatch');

  const workWorkTravel = reimbursements.calculateWorkWorkTravelCost(10, params);
  assertAlmostEqual(workWorkTravel.amount, 2.7, 'Work-work travel must use EUR 0.27/km');

  const meal = reimbursements.calculateMealAllowance({
    start_time: '12:00',
    end_time: '20:00',
    meal_declared_costs: 20
  }, params);
  assert.equal(meal.eligible, true);
  assertAlmostEqual(meal.amount, 11.91, 'Meal allowance must be capped at CAO maximum');
  assert.equal(meal.manual_review_required, false);

  const breakAvailability = reimbursements.calculateBreakAvailabilityAllowance({
    cao_function_group: 'mobiel_surveillant',
    break_availability_half_hours: 3,
    unpaid_break_available_required: true
  }, params);
  assert.equal(breakAvailability.eligible, true);
  assertAlmostEqual(breakAvailability.amount, 1.29, 'Break availability allowance must use EUR 0.43 per half hour');

  const invalidBreakAvailability = reimbursements.calculateBreakAvailabilityAllowance({
    cao_function_group: 'objectbeveiliger_receptionist',
    break_availability_half_hours: 2,
    unpaid_break_available_required: true
  }, params);
  assert.equal(invalidBreakAvailability.eligible, false);
  assert.equal(invalidBreakAvailability.manual_review_required, true, 'Break availability outside mobile/retail surveillance must require review');

  const consignment = reimbursements.calculateConsignmentAndReachability({
    consignment_hours: 10,
    consignment_weekend_holiday_hours: 4,
    reachability_phone_followup_required: true
  }, params);
  assertAlmostEqual(consignment.amount, 91.79, 'Consignment and reachability amount mismatch');

  const dogAllowance = reimbursements.calculateDogAllowance({
    works_with_dog: true,
    dog_owner: 'employee',
    contract_hours_per_pay_period: 72
  }, params);
  assertAlmostEqual(dogAllowance.parttime_ratio, 0.5, 'Dog allowance must be prorated for part-time work');
  assertAlmostEqual(dogAllowance.amount_gross, 57.62, 'Dog service allowance gross amount mismatch');
  assertAlmostEqual(dogAllowance.amount_net, 72.02, 'Dog owner cost allowance net amount mismatch');

  const dogProofReview = reimbursements.calculateDogAllowance({
    works_with_dog: true,
    dog_owner: 'employee',
    dog_costs_proof_requested: true,
    dog_training_required_for_work: true
  }, params);
  assert.equal(dogProofReview.manual_review_required, true);
  assert.ok(
    dogProofReview.manual_review_items.some(item => item.rule_id === 'CAO-PB-2024-R0922'),
    'Dog cost proof request must require evidence review'
  );
  assert.ok(
    dogProofReview.manual_review_items.some(item => item.rule_id === 'CAO-PB-2024-R0930'),
    'Required dog training must require employer arrangement/reimbursement evidence'
  );
}

function runLeaveSicknessScenarios() {
  const params = leaveSickness.resolveLeaveSicknessParameters(null);
  assert.equal(params.standard_vacation.fulltimeAnnualHours, 172.8);
  assert.equal(params.standard_vacation.fulltimeAnnualDays, 24);
  assert.equal(params.standard_vacation.fulltimePerPeriodHours, 13.3);
  assert.equal(params.call_worker_vacation_payout_percentage, 9.24);
  assert.equal(params.call_worker_vacation_max_hours_per_period, 144);
  assert.equal(params.sickness.waiting_day_seniority_periods, 13);
  assert.equal(params.sickness.short_seniority_payment_percentage, 70);
  assert.equal(params.sickness.first_six_months_percentage, 100);
  assert.equal(params.sickness.second_six_months_percentage, 90);

  const fulltimeVacation = leaveSickness.calculateVacationAccrual({
    paid_hours_per_pay_period: 144,
    continuous_service_years: 10
  }, params);
  assertAlmostEqual(fulltimeVacation.vacation_hours_accrued_per_period, 13.3, 'Full-time vacation accrual per period mismatch');
  assert.equal(fulltimeVacation.extra_vacation_days_annual_fulltime_basis, 2);
  assertAlmostEqual(fulltimeVacation.vacation_hours_annual_total, 187.2, 'Vacation total with 10 service years must include 2 extra days');
  assert.equal(fulltimeVacation.manual_review_required, false);

  const callWorkerVacation = leaveSickness.calculateVacationAccrual({
    contract_form: 'oproep',
    worked_hours: 160,
    base_hourly_rate: 20
  }, params);
  assert.equal(callWorkerVacation.vacation_accrual_type, 'call_worker_paid_in_money');
  assert.equal(callWorkerVacation.capped_at_144_hours_per_pay_period, true);
  assertAlmostEqual(callWorkerVacation.vacation_payout_amount, 266.11, 'Call-worker vacation payout must be capped at 144 hours and use 9.24%');

  const holidayCredit = leaveSickness.calculateHolidayCredit({
    holiday_dates: ['2026-12-25'],
    is_fulltime: true
  }, {}, params);
  assertAlmostEqual(holidayCredit.total_holiday_credit_hours, 7.2, 'Full-time weekday holiday must create 7.2 hours credit');
  assert.equal(holidayCredit.manual_review_required, false);

  const vacationAllowance = leaveSickness.calculateVacationAllowance({
    base_salary_amount: 1000,
    periodic_increase_amount: 50,
    special_hours_allowance_amount: 100,
    holiday_surcharge_amount: 20,
    structural_overtime_amount: 30,
    fixed_allowances_amount: 10
  }, params);
  assertAlmostEqual(vacationAllowance.vacation_allowance_basis_amount, 1210, 'Vacation allowance basis mismatch');
  assertAlmostEqual(vacationAllowance.vacation_allowance_amount, 96.8, 'Vacation allowance must be 8% over eligible basis');

  const shortSenioritySickness = leaveSickness.calculateSicknessPayment({
    sickness_start_date: '2026-01-01',
    sickness_end_date: '2026-01-10',
    sickness_payable_days: 10,
    industry_seniority_periods: 12,
    base_gross_salary: 2000,
    payable_days_per_pay_period: 20
  }, params);
  assert.equal(shortSenioritySickness.has_waiting_day, true);
  assert.equal(shortSenioritySickness.payment_percentage, 70);
  assertAlmostEqual(shortSenioritySickness.total_sickness_payment, 630, 'Short-seniority sickness must apply 1 waiting day and 70% payment');

  const regularSickness = leaveSickness.calculateSicknessPayment({
    sickness_start_date: '2026-01-01',
    sickness_end_date: '2026-01-10',
    sickness_payable_days: 10,
    industry_seniority_periods: 13,
    base_gross_salary: 2000,
    payable_days_per_pay_period: 20
  }, params);
  assert.equal(regularSickness.has_waiting_day, false);
  assert.equal(regularSickness.days_first_six_months_100_percent, 10);
  assertAlmostEqual(regularSickness.total_sickness_payment, 1000, 'First six months sickness payment must be 100% for >=13 pay periods seniority');
}

function runPayrollPolicyScenarios() {
  const params = personnelCosts.resolvePayrollCaoParameters(null);
  assert.equal(params.standard_vacation.fulltimeAnnualHours, 172.8);
  assert.equal(params.standard_vacation.fulltimeVacationHoursPerPeriod, 13.3);
  assert.equal(params.call_worker_vacation_payout_percentage, 9.24);
  assert.equal(params.pension.franchiseAnnual, 16164);
  assert.equal(params.pension.premiumRateTotalPercentage, 24.1);
  assert.equal(params.pension.employerSharePercentage, 60);
  assert.equal(params.funds.sfpbEmployeePercentage, 0.061);
  assert.equal(params.funds.pawwEmployeePercentage, 0.1);

  const regularSurcharges = personnelCosts.resolveArticle40And41SurchargeMatrix({
    caoConfig: {},
    isCallWorker: false,
    applySpecialHours: true,
    applyHolidays: true
  });
  assert.equal(regularSurcharges.special_hours.evening_18_00_24_00_monday_friday_percentage, 10);
  assert.equal(regularSurcharges.special_hours.night_00_00_07_00_monday_friday_percentage, 20);
  assert.equal(regularSurcharges.special_hours.weekend_saturday_sunday_percentage, 35);
  assert.equal(regularSurcharges.special_hours.new_years_eve_after_16_00_percentage, 100);
  assert.equal(regularSurcharges.holidays.applied_holiday_percentage, 50);
  assert.equal(regularSurcharges.holidays.article_40_stacks_with_article_41_for_this_employee, true);

  const callWorkerSurcharges = personnelCosts.resolveArticle40And41SurchargeMatrix({
    caoConfig: {},
    isCallWorker: true,
    applySpecialHours: true,
    applyHolidays: true
  });
  assert.equal(callWorkerSurcharges.holidays.applied_holiday_percentage, 100);
  assert.equal(callWorkerSurcharges.holidays.article_40_stacks_with_article_41_for_this_employee, false);

  const callWorkerVacation = personnelCosts.calculateCallWorkerVacationPayoutArticle59({
    baseWageAmount: 4000,
    minimumServiceAmount: 0,
    baseHourlyRate: 20,
    paidBaseHours: 160
  });
  assert.equal(callWorkerVacation.capped_at_144_hours_per_pay_period, true);
  assertAlmostEqual(callWorkerVacation.payout_base_amount, 2880, 'Call-worker vacation basis must cap at 144 hours');
  assertAlmostEqual(callWorkerVacation.amount, 266.11, 'Call-worker vacation amount must use 9.24%');

  const yearEndBasis = yearEndBonus.extractYearEndBonusBasisFromRun({
    id: 'run-1',
    pay_period_year: 2026,
    pay_period_number: 5,
    calculation_output: {
      payslip: {
        base_salary: 1000,
        minimum_service_compensation: { amount: 50 },
        overtime_50: { amount: 200 }
      }
    }
  }, 8);
  assert.equal(yearEndBasis.basis_source, 'fallback_base_salary_plus_minimum_service');
  assertAlmostEqual(yearEndBasis.eligible_base_wage, 1050, 'Year-end bonus basis must include base salary and minimum service compensation');
  assertAlmostEqual(yearEndBasis.vacation_allowance_on_eligible_base_wage, 84, 'Year-end bonus basis must include 8% vacation allowance');
  assertAlmostEqual(yearEndBasis.eligible_amount_including_vacation_allowance, 1134, 'Year-end bonus eligible amount mismatch');
  assertAlmostEqual(yearEndBasis.excluded_overtime_amount, 200, 'Year-end bonus basis must keep overtime excluded');

  const correctionApplication = personnelCosts.buildCaoCorrectionApplication([
    { id: 'corr-1', status: 'queued', cao_change_review_id: 'review-1' }
  ], {
    'corr-1': {
      delta_snapshot: {
        gross_delta: 100,
        employee_deductions_delta: 20,
        employer_costs_delta: 30,
        vacation_allowance_delta: 8,
        year_end_bonus_delta: 2
      }
    }
  }, true);
  assert.equal(correctionApplication.ready_to_apply, true);

  const correctionComponent = personnelCosts.buildCaoCorrectionPayrollComponent([
    { id: 'corr-1', status: 'queued', cao_change_review_id: 'review-1' }
  ], {
    'corr-1': {
      delta_snapshot: {
        gross_delta: 100,
        employee_deductions_delta: 20,
        employer_costs_delta: 30,
        vacation_allowance_delta: 8,
        year_end_bonus_delta: 2
      }
    }
  });
  assert.equal(correctionComponent.applied, true);
  assertAlmostEqual(correctionComponent.total_gross_delta, 100, 'Correction gross delta mismatch');
  assertAlmostEqual(correctionComponent.net_salary_delta, 80, 'Correction net delta should default to gross minus employee deductions');
  assertAlmostEqual(correctionComponent.total_cost_employer_delta, 140, 'Correction employer total should default to gross plus employer/vacation/year-end deltas');

  assert.equal(
    personnelCosts.shouldRequirePayrollScheduleValidation({ body: {}, recordPayrollRun: false }),
    false,
    'Concept payroll should not require schedule validation'
  );
  assert.equal(
    personnelCosts.shouldRequirePayrollScheduleValidation({ body: {}, recordPayrollRun: true }),
    true,
    'Recorded payroll run must require schedule validation'
  );
  assert.equal(
    personnelCosts.shouldRequirePayrollScheduleValidation({ body: { require_payroll_final: true }, recordPayrollRun: false }),
    true,
    'Explicit payroll-final request must require schedule validation'
  );

  const conceptScheduleGate = personnelCosts.buildPayrollScheduleValidationGate(null, { required: false });
  assert.equal(conceptScheduleGate.status, 'not_required_for_concept_payroll');
  assert.equal(conceptScheduleGate.payroll_final_allowed, null);

  const blockedScheduleGate = personnelCosts.buildPayrollScheduleValidationGate({
    planning_allowed: true,
    payroll_final_allowed: false,
    manual_review_required: true,
    calculation_status: 'manual_review_required',
    manual_review_reasons: ['Roosterregel vereist handmatige review.'],
    violations: [{ severity: 'high', message: 'Rusttijd wordt overtreden.' }]
  }, { required: true });
  assert.equal(blockedScheduleGate.status, 'blocked');
  assert.equal(blockedScheduleGate.payroll_final_allowed, false);
  assertIncludes(blockedScheduleGate.blocking_reasons, 'Rusttijd wordt overtreden.', 'High severity roster violation must block payroll-final');

  const validScheduleGate = personnelCosts.buildPayrollScheduleValidationGate({
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    calculation_status: 'final',
    period_start: '2026-01-01',
    period_end: '2026-01-28',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-1'
  }, { required: true });
  assert.equal(validScheduleGate.status, 'validated');
  assert.equal(validScheduleGate.payroll_final_allowed, true);
  assert.equal(validScheduleGate.cao_key, 'cao_particuliere_beveiliging');
}

function runRouteCostScheduleGateScenarios() {
  assert.equal(
    routePersonnelCosts.shouldRequireRouteScheduleValidation({}),
    false,
    'Route cost concept calculation should not require schedule validation'
  );
  assert.equal(
    routePersonnelCosts.shouldRequireRouteScheduleValidation({ require_payroll_final: true }),
    true,
    'Route payroll-final request must require schedule validation'
  );

  const conceptGate = routePersonnelCosts.buildRouteScheduleValidationGate(null, { required: false });
  assert.equal(conceptGate.status, 'not_required_for_route_cost_concept');
  assert.equal(conceptGate.payroll_final_allowed, false);
  assert.equal(conceptGate.manual_review_required, false);

  const missingPersonnelGate = routePersonnelCosts.buildRouteScheduleValidationGate(null, {
    required: true,
    personnelId: null
  });
  assert.equal(missingPersonnelGate.status, 'blocked_missing_personnel_for_final_route_schedule');
  assert.equal(missingPersonnelGate.payroll_final_allowed, false);
  assert.ok(
    missingPersonnelGate.blocking_reasons.some(reason => reason.includes('personnel_id')),
    'Final route validation must block without selected personnel_id'
  );

  const validGate = routePersonnelCosts.buildRouteScheduleValidationGate({
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    calculation_status: 'final',
    period_start: '2026-01-15',
    period_end: '2026-01-15',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-1'
  }, {
    required: true,
    personnelId: 'person-1'
  });
  assert.equal(validGate.status, 'validated');
  assert.equal(validGate.payroll_final_allowed, true);
  assert.equal(validGate.personnel_id, 'person-1');

  const conceptCost = routePersonnelCosts.applyRouteScheduleGateToCostResult({
    calculation_status: 'final',
    manual_review_required: false,
    payroll_final_allowed: true,
    total_cost_employer: 100
  }, conceptGate);
  assert.equal(conceptCost.calculation_status, 'concept_route_cost');
  assert.equal(conceptCost.planning_cost_allowed, true);
  assert.equal(conceptCost.payroll_final_allowed, false);
  assert.ok(
    conceptCost.payroll_final_blocking_reasons.some(reason => reason.includes('concept')),
    'Concept route costs must explain why payroll-final is false'
  );

  const finalCost = routePersonnelCosts.applyRouteScheduleGateToCostResult({
    personnel_id: 'person-1',
    calculation_status: 'final',
    manual_review_required: false,
    payroll_final_allowed: true,
    total_cost_employer: 100
  }, validGate);
  assert.equal(finalCost.calculation_status, 'final');
  assert.equal(finalCost.planning_cost_allowed, true);
  assert.equal(finalCost.payroll_final_allowed, true);
  assert.equal(finalCost.route_schedule_validation_status, 'validated');

  const otherCandidateCost = routePersonnelCosts.applyRouteScheduleGateToCostResult({
    personnel_id: 'person-2',
    calculation_status: 'final',
    manual_review_required: false,
    payroll_final_allowed: true,
    total_cost_employer: 100
  }, validGate);
  assert.equal(otherCandidateCost.calculation_status, 'concept_route_cost');
  assert.equal(otherCandidateCost.planning_cost_allowed, true);
  assert.equal(otherCandidateCost.payroll_final_allowed, false);
}

function runFunctionClassificationScenarios() {
  const nonSecurity = functionClassification.classify({
    function_type: 'klantrelatie',
    cao_function_group: 'non_security_staff',
    custom_hourly_rate: 25
  }, {}, {
    cao_scope_profile: 'non_security_work_article_3_exception',
    manual_review_required: false,
    payroll_rule_profile: {
      apply_appendix_2_function_scales: false
    }
  }, null, '2026-01-01', []);
  assert.equal(nonSecurity.appendix_2_applies, false);
  assert.equal(nonSecurity.classification_status, 'not_applicable');
  assert.equal(nonSecurity.cao_function_group, 'non_security_staff');
  assertAlmostEqual(nonSecurity.hourly_rate, 25, 'Non-security function must use explicit custom hourly wage basis');
  assert.equal(nonSecurity.payroll_final_allowed, true);
  assertIncludes(nonSecurity.source_rule_ids, 'CAO-PB-2024-R0228', 'Non-security classification must cite article 3 exclusion scope');
  assertIncludes(nonSecurity.source_rule_ids, 'CAO-PB-2024-R0233', 'Non-security classification must cite article 3 exclusion scope');

  const security = functionClassification.classify({
    function_type: 'objectbeveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a',
    security_role_status: 'beveiliger',
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scale: 3,
    cao_period: 0,
    written_classification_notice_confirmed: true,
    written_scale_period_notice_confirmed: true,
    periodic_increase_due_confirmed: true
  }, {}, {
    cao_scope_profile: 'full_security_worker',
    manual_review_required: false,
    payroll_rule_profile: {
      apply_appendix_2_function_scales: true
    }
  }, {
    wage_scales_detailed: {
      3: {
        0: { hourly_rate: 16.02, period_salary: 2307.84 }
      }
    }
  }, '2026-01-01', []);
  assert.equal(security.appendix_2_applies, true);
  assert.equal(security.classification_status, 'resolved');
  assert.equal(security.suggested_cao_scale, 3);
  assert.equal(security.current_cao_period, 0);
  assert.equal(security.period_valid_for_scale, true);
  assert.equal(security.wage_rate_found, true);
  assertAlmostEqual(security.hourly_rate, 16.02, 'Security worker wage must come from wage_scales_detailed');
  assert.equal(security.payroll_final_allowed, true);
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1812', 'Function-to-salary-scale mapping source missing');
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1838', 'Appendix 4 wage-scale source missing');
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1753', 'Objectbeveiliger/receptionist function description source missing');
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1755', 'Winkelsurveillant function description source missing');

  const dateAwareWageConfig = {
    wage_scales_detailed_by_year: {
      2025: {
        3: {
          1: { hourly_rate: 16.73, period_salary_4_weeks: 2410.43 }
        }
      },
      2026: {
        3: {
          1: { hourly_rate: 17.37, period_salary_4_weeks: 2502.03 }
        }
      }
    }
  };
  const dateAwareSecurityWorker = {
    function_type: 'objectbeveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a',
    security_role_status: 'beveiliger',
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scale: 3,
    cao_period: 1,
    written_classification_notice_confirmed: true,
    written_scale_period_notice_confirmed: true,
    periodic_increase_due_confirmed: true
  };
  const dateAwareScope = {
    cao_scope_profile: 'full_security_worker',
    manual_review_required: false,
    payroll_rule_profile: {
      apply_appendix_2_function_scales: true
    }
  };
  const wage2025 = functionClassification.classify(
    dateAwareSecurityWorker,
    {},
    dateAwareScope,
    dateAwareWageConfig,
    '2025-06-01',
    []
  );
  assert.equal(wage2025.wage_table_year, 2025);
  assertAlmostEqual(wage2025.hourly_rate, 16.73, '2025 services must use the 2025 wage table');
  assert.equal(wage2025.payroll_final_allowed, true);

  const wage2026 = functionClassification.classify(
    dateAwareSecurityWorker,
    {},
    dateAwareScope,
    dateAwareWageConfig,
    '2026-06-01',
    []
  );
  assert.equal(wage2026.wage_table_year, 2026);
  assertAlmostEqual(wage2026.hourly_rate, 17.37, '2026 services must use the 2026 wage table');
  assert.equal(wage2026.payroll_final_allowed, true);
}

function runCaoGovernanceUiOptionScenarios() {
  const activeConfig = {
    id: 'cao-config-active',
    cao_key: 'cao_particuliere_beveiliging',
    name: 'CAO PB 2024-2026',
    display_name: 'CAO Particuliere Beveiliging',
    sector: 'Particuliere beveiliging',
    version_label: '2024-2026',
    valid_from: '2024-12-18',
    valid_until: '2026-12-27',
    status: 'active',
    is_active: true,
    is_payroll_ready: true,
    payroll_readiness_status: 'ready',
    wage_scales: { 3: { 0: 16.02 } },
    surcharges: { weekend: 35 },
    pension_rules: { franchiseAnnual: 16164 },
    rule_engine_metadata: { internal: true },
    payroll_readiness_gate: { passed: true },
    source_documents_snapshot: [{ url: 'https://www.beveiligingsbranche.nl/cao/' }],
    codex_approval_message: 'Owner approved in Codex'
  };

  const option = caoConfigurationOptions.buildCaoConfigurationOption(activeConfig, []);
  assert.equal(option.id, 'cao-config-active');
  assert.equal(option.label, 'CAO Particuliere Beveiliging');
  assert.equal(option.selectable, true);
  assert.equal(option.is_payroll_ready, true);
  assert.equal(caoConfigurationOptions.assertNoSensitiveCaoConfigurationFields(option).passed, true);
  assert.equal(option.wage_scales, undefined, 'Company CAO dropdown options must not expose wage scales');
  assert.equal(option.surcharges, undefined, 'Company CAO dropdown options must not expose surcharge parameters');
  assert.equal(option.pension_rules, undefined, 'Company CAO dropdown options must not expose pension parameters');
  assert.equal(option.rule_engine_metadata, undefined, 'Company CAO dropdown options must not expose rule-engine metadata');

  const inactiveConfig = {
    ...activeConfig,
    id: 'cao-config-archived',
    status: 'archived',
    is_active: false
  };
  const includedInactive = caoConfigurationOptions.buildCaoConfigurationOption(inactiveConfig, ['cao-config-archived']);
  assert.equal(includedInactive.selectable, false, 'Inactive selected CAO configs may be shown for existing companies but must not be selectable');
  assert.equal(includedInactive.included_for_existing_company, true);
  assert.ok(includedInactive.warning.includes('niet actief'));
}

function listFilesRecursive(rootDir, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      files.push(...listFilesRecursive(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath);
}

function runCaoStaticGovernanceScenarios() {
  const srcFiles = listFilesRecursive(path.join(repoRoot, 'src'), ['.js', '.jsx', '.ts', '.tsx']);
  const sensitiveCaoEntities = [
    'CAOConfiguration',
    'CAORule',
    'CAOChangeReview',
    'CAOSourceDocument',
    'CAOImportRun',
    'CAOPayrollCorrection'
  ];
  const frontendSensitiveEntityReads = srcFiles
    .filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      return sensitiveCaoEntities.some(name => source.includes(`base44.entities.${name}`));
    })
    .map(relativeRepoPath);
  assert.deepEqual(
    frontendSensitiveEntityReads,
    [],
    'Customer UI must not read raw internal CAO entities; use sanitized functions such as listCaoConfigurationOptions instead'
  );

  const appSource = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8');
  const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.jsx'), 'utf8');
  const pagesConfigSource = fs.readFileSync(path.join(repoRoot, 'src/pages.config.js'), 'utf8');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/pages/CAOBeheer.jsx')),
    false,
    'Customer app must not contain a CAOBeheer page; CAO governance stays owner-only via Codex/Cloudflare'
  );
  assert.equal(
    /import\s+CAOBeheer\b/.test(appSource) ||
      /path=["']\/CAOBeheer["']/.test(appSource) ||
      /createPageUrl\(["']CAOBeheer["']\)/.test(appSource),
    false,
    'Customer app routes must not expose CAOBeheer'
  );
  assert.equal(
    layoutSource.includes('CAOBeheer') || layoutSource.includes('CAO beheer') || layoutSource.includes('CAO-beheer'),
    false,
    'Customer navigation must not expose CAO beheer'
  );
  assert.equal(
    pagesConfigSource.includes('CAOBeheer'),
    false,
    'Auto page config must not register CAOBeheer'
  );

  const sensitiveOwnerFunctions = [
    'approveCaoConfiguration',
    'checkCaoSources',
    'extractCaoParameters',
    'ingestCaoAutomationPayload',
    'syncCaoFromCloudflare',
    'auditCaoRuleCoverage',
    'queueCaoPayrollCorrections'
  ];
  const frontendSensitiveFunctionInvokes = srcFiles
    .filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      return sensitiveOwnerFunctions.some(name =>
        source.includes(`functions.invoke("${name}"`) ||
        source.includes(`functions.invoke('${name}'`)
      );
    })
    .map(relativeRepoPath);
  assert.deepEqual(
    frontendSensitiveFunctionInvokes,
    [],
    'Customer UI must not invoke owner/internal CAO mutation, audit or source-monitoring functions'
  );

  const functionFiles = listFilesRecursive(path.join(repoRoot, 'base44/functions'), ['.ts']);
  const customerRuntimeDefaultPbFallbacks = [];
  const customerRuntimeDefaultPbHelperParams = [];
  const ownerInternalCaoFunctions = new Set([
    'approveCaoConfiguration',
    'checkCaoSources',
    'extractCaoParameters',
    'ingestCaoAutomationPayload',
    'syncCaoFromCloudflare',
    'auditCaoRuleCoverage',
    'queueCaoPayrollCorrections'
  ]);
  for (const file of functionFiles) {
    const functionName = path.basename(path.dirname(file));
    if (ownerInternalCaoFunctions.has(functionName)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/body\.cao_key\s*(\|\||\?\?)\s*CAO_PB_KEY/.test(source)) {
      customerRuntimeDefaultPbFallbacks.push(relativeRepoPath(file));
    }
    if (/caoKey\s*=\s*CAO_PB_KEY/.test(source)) {
      customerRuntimeDefaultPbHelperParams.push(relativeRepoPath(file));
    }
  }
  assert.deepEqual(
    customerRuntimeDefaultPbFallbacks,
    [],
    'Customer/runtime functions must not default body.cao_key to CAO PB; missing cao_key must fail closed'
  );
  assert.deepEqual(
    customerRuntimeDefaultPbHelperParams,
    [],
    'Customer/runtime helper parameters must not default caoKey to CAO PB; missing cao_key must fail closed'
  );

  const syncInvokeWithoutSecret = [];
  for (const file of functionFiles) {
    const source = fs.readFileSync(file, 'utf8');
    let searchFrom = 0;
    while (searchFrom < source.length) {
      const singleQuoteIndex = source.indexOf("functions.invoke('syncCaoFromCloudflare'", searchFrom);
      const doubleQuoteIndex = source.indexOf('functions.invoke("syncCaoFromCloudflare"', searchFrom);
      const indexes = [singleQuoteIndex, doubleQuoteIndex].filter(index => index >= 0);
      if (indexes.length === 0) break;
      const index = Math.min(...indexes);
      const snippet = source.slice(index, index + 700);
      if (!snippet.includes('sync_trigger_secret')) {
        syncInvokeWithoutSecret.push(`${relativeRepoPath(file)}:${index}`);
      }
      searchFrom = index + 1;
    }
  }
  assert.deepEqual(
    syncInvokeWithoutSecret,
    [],
    'Internal syncCaoFromCloudflare invokes must pass BASE44_CAO_SYNC_TRIGGER_SECRET'
  );

  const disabledCustomerFunctions = [
    'approveCaoConfiguration',
    'checkCaoSources',
    'extractCaoParameters'
  ];
  for (const name of disabledCustomerFunctions) {
    const source = fs.readFileSync(path.join(repoRoot, 'base44/functions', name, 'entry.ts'), 'utf8');
    assert.ok(source.includes('DISABLED'), `${name} must remain visibly disabled for customer roles`);
    assert.ok(source.includes('status: 403'), `${name} must return 403 for customer access`);
  }

  const ingestSource = fs.readFileSync(path.join(repoRoot, 'base44/functions/ingestCaoAutomationPayload/entry.ts'), 'utf8');
  assert.ok(ingestSource.includes('CAO_AUTOMATION_SHARED_SECRET'), 'ingestCaoAutomationPayload must stay secret-only');
  assert.ok(
    ingestSource.includes("approval?.status === 'approved_by_owner'"),
    'ingestCaoAutomationPayload must explicitly detect owner-approved Codex payloads'
  );
  assert.ok(
    ingestSource.includes("const approval_status = isOwnerApproved ? 'owner_approved' : 'proposed'"),
    'ingestCaoAutomationPayload must store non-owner-approved payloads as proposed only'
  );
  assert.ok(
    ingestSource.includes('Proposed CAO payload ontvangen') && ingestSource.includes('niet geactiveerd'),
    'ingestCaoAutomationPayload must clearly report that proposed payloads are not activated'
  );
  assert.ok(
    ingestSource.includes('Owner-approved CAO payload toegepast'),
    'ingestCaoAutomationPayload must distinguish owner-approved applied imports'
  );
  const syncSource = fs.readFileSync(path.join(repoRoot, 'base44/functions/syncCaoFromCloudflare/entry.ts'), 'utf8');
  assert.ok(syncSource.includes('BASE44_CAO_SYNC_TRIGGER_SECRET'), 'syncCaoFromCloudflare must require the internal sync secret');
  assert.ok(
    syncSource.includes('payload.applied !== true'),
    'syncCaoFromCloudflare must reject Cloudflare payloads that are not explicitly applied'
  );
  assert.ok(
    syncSource.includes("payload.approval?.status !== 'approved_by_owner'"),
    'syncCaoFromCloudflare must reject Cloudflare payloads without owner approval'
  );
  assert.ok(
    syncSource.includes('Payload is niet goedgekeurd door eigenaar'),
    'syncCaoFromCloudflare must make owner-approval failures explicit'
  );
  assert.ok(
    syncSource.includes("approval_status: 'owner_approved'"),
    'syncCaoFromCloudflare must only create active synced configs with owner-approved status'
  );

  const personnelContractsSource = fs.readFileSync(path.join(repoRoot, 'src/components/personnel/PersonnelContractsTab.jsx'), 'utf8');
  assert.ok(
    personnelContractsSource.includes('listCaoConfigurationOptions'),
    'Personnel contract UI must use sanitized CAO configuration options'
  );
  assert.equal(
    personnelContractsSource.includes('<Input value={form.cao_configuration_id'),
    false,
    'Personnel contract UI must not expose cao_configuration_id as free-text input'
  );
  assert.equal(
    personnelContractsSource.includes('CAO-configuratie id'),
    false,
    'Personnel contract UI must not label CAO configuration selection as raw id input'
  );

  const legacyPersonnelFormPath = path.join(repoRoot, 'src/components/personnel/PersonnelForm.jsx');
  assert.equal(
    fs.existsSync(legacyPersonnelFormPath),
    false,
    'Legacy PersonnelForm must stay removed; personnel onboarding must use PersonnelWizard + PersonnelContractsTab for CAO context'
  );
  const personnelPageSource = fs.readFileSync(path.join(repoRoot, 'src/pages/Personnel.jsx'), 'utf8');
  assert.equal(
    personnelPageSource.includes('PersonnelForm'),
    false,
    'Personnel page must not import the legacy PersonnelForm CAO shortcut'
  );
  const personnelWizardSource = fs.readFileSync(path.join(repoRoot, 'src/components/personnel/PersonnelWizard.jsx'), 'utf8');
  assert.equal(
    personnelWizardSource.includes('cao_configuration_id: data.personnel.cao_configuration_id || null'),
    false,
    'Initial contract snapshot must not copy cao_configuration_id from personnel master data'
  );

  const costCalculatorSource = fs.readFileSync(path.join(repoRoot, 'src/components/personnel/CostCalculator.jsx'), 'utf8');
  assert.ok(
    costCalculatorSource.includes('record_payroll_run: false'),
    'Personnel cost calculator must never record PayrollCalculationRun records'
  );
  assert.ok(
    costCalculatorSource.includes('require_payroll_final: false'),
    'Personnel cost calculator must explicitly stay out of payroll-final mode'
  );
  assert.ok(
    costCalculatorSource.includes('calculation_context: "concept_cost_preview"'),
    'Personnel cost calculator must identify itself as a concept preview'
  );
  assert.ok(
    costCalculatorSource.includes('Conceptpreview'),
    'Personnel cost calculator must visibly label results as concept preview'
  );
  assert.equal(
    costCalculatorSource.includes('Netto salaris'),
    false,
    'Personnel cost calculator must not present concept preview as definitive net salary'
  );

  const routePersonnelCostsSource = fs.readFileSync(path.join(repoRoot, 'src/components/routes/RoutePersonnelCosts.jsx'), 'utf8');
  assert.ok(
    routePersonnelCostsSource.includes('record_payroll_run: false'),
    'Route personnel cost preview must never record PayrollCalculationRun records'
  );
  assert.ok(
    routePersonnelCostsSource.includes('require_payroll_final: false'),
    'Route personnel cost preview must explicitly stay out of payroll-final mode'
  );
  assert.ok(
    routePersonnelCostsSource.includes('calculation_context: "route_concept_cost_preview"'),
    'Route personnel cost preview must identify itself as concept preview'
  );
  assert.ok(
    routePersonnelCostsSource.includes('Routekosten zijn een conceptpreview'),
    'Route personnel cost UI must visibly label route costs as concept preview'
  );

  const caoServiceContextSource = fs.readFileSync(path.join(repoRoot, 'src/components/cao/CaoServiceContextFields.jsx'), 'utf8');
  assert.equal(
    caoServiceContextSource.includes('value: "not_required"'),
    false,
    'Service context UI must not expose a no-contract-required CAO planning option'
  );
  const taskEntitySource = fs.readFileSync(path.join(repoRoot, 'base44/entities/Task.jsonc'), 'utf8');
  assert.equal(
    taskEntitySource.includes('"not_required"'),
    false,
    'Task contract_assignment_policy schema must not allow no-contract-required planning'
  );
  const resolverSource = fs.readFileSync(path.join(repoRoot, 'base44/functions/resolvePersonnelContractForService/entry.ts'), 'utf8');
  assert.equal(
    resolverSource.includes('function_match_not_required') || resolverSource.includes('security_scope_match_not_required'),
    false,
    'Contract resolver must not contain not_required bypass paths for function or security-scope matching'
  );
}

async function main() {
  const scenarios = [
    ['external CAO gates', () => runExternalCaoGateScenarios()],
    ['planning context', () => runPlanningContextScenarios()],
    ['CAO applicability', () => runCaoApplicabilityScenarios()],
    ['policy reference context', () => runPolicyReferenceContextScenarios()],
    ['contract resolver scope', () => runContractResolverScenarios()],
    ['planning assignment decision', () => runPlanningAssignmentDecisionScenarios()],
    ['integrated multi-company planning contract flow', () => runIntegratedMultiCompanyPlanningContractScenarios()],
    ['contract scope persistence', () => runContractScopePersistenceScenarios()],
    ['probation rules', () => runProbationScenarios()],
    ['effective-date correction queue', () => runEffectiveDateCorrectionScenarios()],
    ['CAO configuration date selection', () => runCaoConfigurationDateSelectionScenarios()],
    ['reimbursements', () => runReimbursementScenarios()],
    ['leave and sickness', () => runLeaveSicknessScenarios()],
    ['payroll policy and corrections', () => runPayrollPolicyScenarios()],
    ['route cost schedule gate', () => runRouteCostScheduleGateScenarios()],
    ['function classification and wage scales', () => runFunctionClassificationScenarios()],
    ['CAO governance UI options', () => runCaoGovernanceUiOptionScenarios()],
    ['CAO static governance guards', () => runCaoStaticGovernanceScenarios()]
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

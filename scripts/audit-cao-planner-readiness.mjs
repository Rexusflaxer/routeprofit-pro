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
  const context = { console, setTimeout, clearTimeout, URL };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: relativePath });
  return context;
}

function readEntitySchema(entityName) {
  const filePath = path.join(repoRoot, 'base44/entities', `${entityName}.jsonc`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertHasFields(entityName, fields) {
  const schema = readEntitySchema(entityName);
  const properties = schema.properties || {};
  for (const field of fields) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(properties, field),
      `${entityName} mist planner/CAO veld ${field}`
    );
  }
  return schema;
}

function assertIncludes(values, expected, message) {
  assert.ok((values || []).includes(expected), `${message}: expected ${expected} in ${JSON.stringify(values || [])}`);
}

const taskContext = loadFunctionModule('base44/functions/validateTaskPlanningContext/entry.ts');
const planningAssignment = loadFunctionModule('base44/functions/resolveCaoPlanningAssignmentDecision/entry.ts');
const runtimeReadiness = loadFunctionModule('base44/functions/resolveCaoRuntimeReadiness/entry.ts');
const scheduleRules = loadFunctionModule('base44/functions/validateCaoScheduleRules/entry.ts');
const contractResolver = loadFunctionModule('base44/functions/resolvePersonnelContractForService/entry.ts');

const REQUIRED_ENTITY_FIELDS = {
  PersonnelContract: [
    'personnel_id',
    'company_id',
    'cao_key',
    'cao_configuration_id',
    'contract_start_date',
    'contract_end_date',
    'contract_form',
    'planning_allowed',
    'contract_final_allowed',
    'payroll_final_allowed',
    'function_type',
    'allowed_function_types',
    'cao_function_group',
    'allowed_cao_function_groups',
    'security_role_status',
    'allowed_security_role_statuses',
    'performs_security_work',
    'security_work_percentage',
    'wpbr_required',
    'wpbr_status',
    'contract_hours_per_week',
    'contract_hours_per_pay_period'
  ],
  PersonnelCompanyAssignment: [
    'personnel_id',
    'company_id',
    'cao_key',
    'assignment_status',
    'available_for_planning',
    'valid_from',
    'valid_until',
    'default_cao_configuration_id'
  ],
  CompanyCaoAssignment: [
    'company_id',
    'cao_configuration_id',
    'cao_key',
    'is_primary',
    'applies_to_activities',
    'valid_from',
    'valid_until'
  ],
  Task: [
    'object_id',
    'service_function_type',
    'required_cao_function_group',
    'required_cao_function_level',
    'required_security_role_status',
    'required_qualification_types',
    'required_qualification_groups',
    'contract_assignment_policy',
    'operating_company_id',
    'cao_key',
    'performs_security_work',
    'security_work_percentage',
    'works_event_or_hospitality_security',
    'event_hospitality_cao_applies',
    'works_airport_schiphol',
    'works_cash_value_logistics'
  ],
  SurveillanceObject: [
    'cao_key',
    'default_service_function_type',
    'default_cao_function_group',
    'default_cao_function_level',
    'default_security_role_status',
    'default_required_qualification_types',
    'default_required_qualification_groups',
    'default_performs_security_work',
    'default_security_work_percentage',
    'default_works_event_or_hospitality_security',
    'default_event_hospitality_cao_applies',
    'default_works_airport_schiphol',
    'default_works_cash_value_logistics',
    'contract_assignment_policy',
    'default_operating_company_id'
  ],
  CAOConfiguration: [
    'cao_key',
    'valid_from',
    'valid_until',
    'is_payroll_ready',
    'wage_scales_detailed',
    'pay_periods',
    'rule_engine_metadata',
    'idempotency_key'
  ],
  PayrollCalculationRun: [
    'cao_configuration_id',
    'cao_key',
    'pay_period_year',
    'pay_period_number',
    'pay_period_start',
    'pay_period_end',
    'correction_run_for_review_ids',
    'cao_correction_applied_at'
  ],
  CAOPayrollCorrection: [
    'correction_key',
    'idempotency_key',
    'cao_configuration_id',
    'cao_key',
    'affected_payroll_run_id',
    'effective_from',
    'effective_until',
    'correction_match_type',
    'status',
    'queued_for_pay_period_number'
  ]
};

function runEntitySchemaChecks() {
  for (const [entityName, fields] of Object.entries(REQUIRED_ENTITY_FIELDS)) {
    assertHasFields(entityName, fields);
  }

  const task = readEntitySchema('Task');
  assertIncludes(task.properties.contract_assignment_policy.enum, 'strict_contract_match', 'Task contract_assignment_policy must support strict matching');
  assert.equal(task.properties.contract_assignment_policy.default, 'strict_contract_match', 'Task default contract assignment policy must be strict');

  const object = readEntitySchema('SurveillanceObject');
  assertIncludes(object.properties.contract_assignment_policy.enum, 'strict_contract_match', 'Object default contract policy must support strict matching');
}

function runRuntimeSurfaceChecks() {
  const matrix = runtimeReadiness.resolveCaoRuntimeReadiness();
  assertIncludes(matrix.supported_payroll_runtime_cao_keys, 'cao_particuliere_beveiliging', 'PB must remain payroll-runtime supported for planner');
  assertIncludes(matrix.known_security_cao_keys, 'cao_evenementen_horecabeveiliging', 'EHB must remain known for planner fail-closed behavior');
  assertIncludes(matrix.known_security_cao_keys, 'cao_veiligheidsdomein', 'Veiligheidsdomein must remain known for planner fail-closed behavior');
  assertIncludes(matrix.known_security_cao_keys, 'cao_verkeersregelaars', 'Verkeersregelaars must remain known for planner fail-closed behavior');

  const requiredPlannerSurfaces = [
    'validateTaskPlanningContext',
    'resolvePersonnelContractForService',
    'resolveCaoPlanningAssignmentDecision',
    'validateCaoScheduleRules'
  ];
  const pb = runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_particuliere_beveiliging');
  for (const functionName of requiredPlannerSurfaces) {
    assert.ok(
      pb.runtime_surfaces.some(surface => surface.function_name === functionName && surface.required_for_payroll_final && surface.supported),
      `PB planner runtime surface ontbreekt of is niet ondersteund: ${functionName}`
    );
  }

  for (const key of matrix.known_source_monitoring_only_cao_keys) {
    const readiness = runtimeReadiness.buildCaoRuntimeReadinessForKey(key);
    assert.equal(readiness.payroll_final_allowed_by_static_runtime, false, `${key} must fail closed for payroll-final planner use`);
    assert.equal(readiness.planning_final_allowed_by_static_runtime, false, `${key} must fail closed for final planner use`);
  }
}

function runPlanningContextChecks() {
  const serviceContext = taskContext.buildServiceContext({
    body: {
      service_date: '2026-06-08'
    },
    task: {
      id: 'task-reception',
      service_function_type: 'objectbeveiliger',
      required_cao_function_group: 'objectbeveiliger_receptionist',
      required_security_role_status: 'beveiliger',
      contract_assignment_policy: 'strict_contract_match'
    },
    object: {
      id: 'object-factory',
      cao_key: 'cao_particuliere_beveiliging',
      default_operating_company_id: 'company-veluwe-security',
      default_performs_security_work: true,
      default_security_work_percentage: 100
    },
    route: null
  });
  const readiness = taskContext.evaluateServiceContextReadiness(serviceContext);
  assert.equal(serviceContext.company_id, 'company-veluwe-security');
  assert.equal(serviceContext.company_id_source, 'object.default_operating_company_id');
  assert.equal(serviceContext.cao_key, 'cao_particuliere_beveiliging');
  assert.equal(serviceContext.function_type, 'objectbeveiliger');
  assert.equal(serviceContext.cao_function_group, 'objectbeveiliger_receptionist');
  assert.equal(serviceContext.contract_assignment_policy, 'strict_contract_match');
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, 'planning_context_ready');

  const missingCompany = taskContext.buildServiceContext({
    body: {
      service_date: '2026-06-08',
      cao_key: 'cao_particuliere_beveiliging',
      service_function_type: 'objectbeveiliger',
      performs_security_work: true,
      security_work_percentage: 100
    },
    task: null,
    object: null,
    route: null
  });
  const missingCompanyReadiness = taskContext.evaluateServiceContextReadiness(missingCompany);
  assert.equal(missingCompanyReadiness.status, 'blocked');
  assertIncludes(missingCompanyReadiness.missing_fields, 'operating_company_id', 'Missing company must block planner context');

  const missingFunction = taskContext.buildServiceContext({
    body: {
      service_date: '2026-06-08',
      cao_key: 'cao_particuliere_beveiliging',
      company_id: 'company-veluwe-security',
      performs_security_work: true,
      security_work_percentage: 100
    },
    task: null,
    object: null,
    route: null
  });
  const missingFunctionReadiness = taskContext.evaluateServiceContextReadiness(missingFunction);
  assert.equal(missingFunctionReadiness.status, 'blocked');
  assertIncludes(
    missingFunctionReadiness.missing_fields,
    'service_function_type_or_cao_function_group_or_task_type',
    'Missing function context must block planner context'
  );

  const nonSecurityContext = taskContext.buildServiceContext({
    body: {
      service_date: '2026-06-08',
      company_id: 'company-veluwe-security',
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
  const nonSecurityReadiness = taskContext.evaluateServiceContextReadiness(nonSecurityContext);
  assert.equal(nonSecurityReadiness.ready, true);
  assert.equal(nonSecurityContext.performs_security_work, false);
  assert.equal(nonSecurityContext.security_work_percentage, 0);

  return {
    service_context: serviceContext,
    service_context_readiness: readiness
  };
}

function runAssignmentDecisionChecks(serviceContextValidation) {
  const contractResolution = {
    status: 'resolved',
    personnel_id: 'person-1',
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: [],
    company_id: 'company-veluwe-security',
    contract_id: 'contract-pb-2026',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb-2026',
    selected_contract: {
      id: 'contract-pb-2026',
      company_id: 'company-veluwe-security',
      cao_key: 'cao_particuliere_beveiliging',
      cao_configuration_id: 'cao-config-pb-2026',
      planning_allowed: true,
      contract_final_allowed: true,
      payroll_final_allowed: true,
      function_type: 'objectbeveiliger',
      allowed_function_types: ['objectbeveiliger'],
      allowed_cao_function_groups: ['objectbeveiliger_receptionist']
    },
    service_context: serviceContextValidation.service_context
  };
  const scheduleValidation = {
    planning_allowed: true,
    payroll_final_allowed: true,
    calculation_status: 'valid',
    manual_review_required: false,
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: [],
    source_rule_ids: ['CAO-PB-2024-R0547']
  };
  const caoRuntimeReadiness = {
    cao_readiness: [runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_particuliere_beveiliging')]
  };

  const assignable = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    personnel_id: 'person-1',
    serviceContextValidation,
    contractResolution,
    scheduleValidation,
    caoRuntimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(assignable.decision_status, 'assignable');
  assert.equal(assignable.planning_assignment_allowed, true);
  assert.equal(assignable.payroll_final_allowed, true);
  assert.equal(assignable.company_id, 'company-veluwe-security');
  assert.equal(assignable.contract_id, 'contract-pb-2026');
  assert.equal(assignable.cao_configuration_id, 'cao-config-pb-2026');

  const missingSchedule = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    personnel_id: 'person-1',
    serviceContextValidation,
    contractResolution,
    scheduleValidation: null,
    caoRuntimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(missingSchedule.decision_status, 'blocked');
  assert.equal(missingSchedule.payroll_final_allowed, false);
  assert.ok(
    missingSchedule.blocking_reasons.some(reason => reason.includes('Roosterperiodecontrole ontbreekt')),
    'Planner must block payroll-final when schedule validation is required but missing'
  );

  const missingContractResolution = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    personnel_id: 'person-1',
    serviceContextValidation,
    contractResolution: null,
    scheduleValidation,
    caoRuntimeReadiness,
    requireScheduleValidation: true
  });
  assert.equal(missingContractResolution.decision_status, 'blocked');
  assert.ok(
    missingContractResolution.blocking_reasons.some(reason => reason.includes('Contractresolutie ontbreekt')),
    'Planner must block when contract resolution is missing'
  );

  const externalCao = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1', service_context: { cao_key: 'cao_verkeersregelaars' } },
    personnel_id: 'person-1',
    serviceContextValidation: {
      service_context: {
        ...serviceContextValidation.service_context,
        cao_key: 'cao_verkeersregelaars',
        function_type: 'verkeersregelaar',
        cao_function_group: 'verkeersregelaar'
      },
      service_context_readiness: {
        status: 'planning_context_ready',
        ready: true,
        blocking_reasons: [],
        manual_review_reasons: [],
        warnings: [],
        source_rule_ids: []
      }
    },
    contractResolution: {
      ...contractResolution,
      cao_key: 'cao_verkeersregelaars',
      selected_contract: {
        ...contractResolution.selected_contract,
        cao_key: 'cao_verkeersregelaars'
      }
    },
    scheduleValidation: {
      ...scheduleValidation,
      cao_key: 'cao_verkeersregelaars',
      target_cao_key: 'cao_verkeersregelaars'
    },
    caoRuntimeReadiness: {
      cao_readiness: [runtimeReadiness.buildCaoRuntimeReadinessForKey('cao_verkeersregelaars')]
    },
    requireScheduleValidation: true
  });
  assert.equal(externalCao.decision_status, 'blocked');
  assert.equal(externalCao.planning_assignment_allowed, false);
  assert.equal(externalCao.payroll_final_allowed, false);
  assert.ok(
    externalCao.blocking_reasons.some(reason => reason.includes('cao_verkeersregelaars')),
    'External CAO must stay blocked until its own runtime exists'
  );

  const missingCaoKey = planningAssignment.buildCaoPlanningAssignmentDecision({
    body: { personnel_id: 'person-1' },
    personnel_id: 'person-1',
    serviceContextValidation: {
      service_context: {
        ...serviceContextValidation.service_context,
        cao_key: null
      },
      service_context_readiness: serviceContextValidation.service_context_readiness
    },
    contractResolution: {
      ...contractResolution,
      cao_key: null,
      service_context: {
        ...contractResolution.service_context,
        cao_key: null
      },
      selected_contract: {
        ...contractResolution.selected_contract,
        cao_key: null
      }
    },
    scheduleValidation: {
      ...scheduleValidation,
      cao_key: null,
      target_cao_key: null
    },
    caoRuntimeReadiness: null,
    requireScheduleValidation: true
  });
  assert.equal(missingCaoKey.decision_status, 'blocked');
  assert.ok(
    missingCaoKey.blocking_reasons.some(reason => reason.includes('Geen eenduidige cao_key')),
    'Planner must never default missing CAO to PB'
  );
}

function runRuntimeSupportFunctionChecks() {
  for (const [name, module] of [
    ['validateTaskPlanningContext', taskContext],
    ['resolvePersonnelContractForService', contractResolver],
    ['resolveCaoPlanningAssignmentDecision', planningAssignment],
    ['validateCaoScheduleRules', scheduleRules]
  ]) {
    assert.equal(typeof module.getCaoRuntimeSupport, 'function', `${name} must expose getCaoRuntimeSupport`);
    assert.equal(module.getCaoRuntimeSupport('cao_particuliere_beveiliging', name).supported, true, `${name} must support PB`);
    assert.equal(module.getCaoRuntimeSupport('cao_verkeersregelaars', name).supported, false, `${name} must fail closed for traffic-controller CAO`);
    assert.equal(module.getCaoRuntimeSupport(null, name).supported, false, `${name} must fail closed without cao_key`);
  }
}

runEntitySchemaChecks();
runRuntimeSurfaceChecks();
const serviceContextValidation = runPlanningContextChecks();
runAssignmentDecisionChecks(serviceContextValidation);
runRuntimeSupportFunctionChecks();

console.log('ok - CAO planner readiness gates passed.');

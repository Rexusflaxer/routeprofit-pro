import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isWithinDateRange(record, date, startField = 'valid_from', endField = 'valid_until') {
  if (!record) return false;
  if (record[startField] && record[startField] > date) return false;
  if (record[endField] && record[endField] < date) return false;
  return true;
}

function isContractActive(contract, date) {
  if (!contract || contract.is_current === false) return false;
  if (contract.contract_start_date && contract.contract_start_date > date) return false;
  if (contract.contract_end_date && contract.contract_end_date < date) return false;
  return true;
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function booleanOrNull(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

const SECURITY_FUNCTION_GROUPS = [
  'objectbeveiliger_receptionist', 'mobiel_surveillant', 'winkelsurveillant',
  'brandwacht', 'geld_waardetransporteur', 'centralist'
];
const SECURITY_FUNCTION_TYPES = ['surveillant', 'centralist', 'verkeersregelaar', 'brandwacht', 'rechercheur'];
const SECURITY_ROLE_STATUSES = ['aspirant_beveiliger', 'beveiliger', 'leidinggevende'];

function unwrapFunctionData(response) {
  return response?.data || response || null;
}

function serviceRequiresSecurityScope(serviceContext) {
  return SECURITY_ROLE_STATUSES.includes(serviceContext.security_role_status) ||
    SECURITY_FUNCTION_GROUPS.includes(serviceContext.cao_function_group) ||
    SECURITY_FUNCTION_TYPES.includes(serviceContext.function_type);
}

function listAllowsValue(list, value) {
  if (!value) return { matched: true, reason: 'no_requested_value' };
  const values = normalizeArray(list);
  if (values.includes('all')) return { matched: true, reason: 'all' };
  if (values.length === 0) return { matched: false, reason: 'contract_has_no_allowed_values' };
  return {
    matched: values.includes(value),
    reason: values.includes(value) ? 'explicit_match' : 'not_allowed'
  };
}

function inferServiceContext({ body, task, route, object }) {
  const input = body.service_context || {};
  const taskType = input.task_type || task?.task_type || null;
  const functionType = input.function_type ||
    task?.service_function_type ||
    object?.default_service_function_type ||
    null;
  const caoFunctionGroup = input.cao_function_group ||
    task?.required_cao_function_group ||
    object?.default_cao_function_group ||
    null;
  const caoFunctionLevel = input.cao_function_level ||
    task?.required_cao_function_level ||
    object?.default_cao_function_level ||
    null;
  const securityRoleStatus = input.security_role_status ||
    task?.required_security_role_status ||
    object?.default_security_role_status ||
    null;
  const caoKey = input.cao_key ||
    body.cao_key ||
    task?.cao_key ||
    task?.cao ||
    object?.cao_key ||
    object?.cao ||
    route?.cao_key ||
    route?.cao ||
    null;
  const objectId = body.object_id || input.object_id || task?.object_id || object?.id || null;

  return {
    service_date: body.service_date || input.service_date || todayIsoDate(),
    cao_key: caoKey,
    cao: input.cao || body.cao || task?.cao || object?.cao || route?.cao || null,
    company_id: body.company_id || input.company_id || route?.operating_company_id || null,
    route_id: body.route_id || null,
    task_id: body.task_id || null,
    object_id: objectId,
    task_type: taskType,
    function_type: functionType,
    cao_function_group: caoFunctionGroup,
    cao_function_level: caoFunctionLevel,
    security_role_status: securityRoleStatus,
    performs_security_work: input.performs_security_work ??
      task?.performs_security_work ??
      object?.default_performs_security_work ??
      object?.performs_security_work ??
      null,
    security_work_percentage: input.security_work_percentage ??
      task?.security_work_percentage ??
      object?.default_security_work_percentage ??
      object?.security_work_percentage ??
      null,
    works_airport_schiphol: input.works_airport_schiphol ??
      task?.works_airport_schiphol ??
      object?.default_works_airport_schiphol ??
      object?.works_airport_schiphol ??
      null,
    works_cash_value_logistics: input.works_cash_value_logistics ??
      task?.works_cash_value_logistics ??
      object?.default_works_cash_value_logistics ??
      object?.works_cash_value_logistics ??
      null,
    works_event_or_hospitality_security: input.works_event_or_hospitality_security ??
      task?.works_event_or_hospitality_security ??
      object?.default_works_event_or_hospitality_security ??
      object?.works_event_or_hospitality_security ??
      null,
    event_hospitality_cao_applies: input.event_hospitality_cao_applies ??
      task?.event_hospitality_cao_applies ??
      object?.default_event_hospitality_cao_applies ??
      object?.event_hospitality_cao_applies ??
      null,
    customer_billable: input.customer_billable ??
      task?.customer_billable ??
      object?.default_customer_billable ??
      object?.customer_billable ??
      null,
    counts_toward_required_staffing: input.counts_toward_required_staffing ??
      task?.counts_toward_required_staffing ??
      object?.default_counts_toward_required_staffing ??
      object?.counts_toward_required_staffing ??
      null,
    internship_practice_trainer_personnel_id: input.internship_practice_trainer_personnel_id ?? task?.internship_practice_trainer_personnel_id ?? null,
    internship_mentor_personnel_id: input.internship_mentor_personnel_id ?? task?.internship_mentor_personnel_id ?? null,
    internship_one_to_one_guidance_confirmed: input.internship_one_to_one_guidance_confirmed ?? task?.internship_one_to_one_guidance_confirmed ?? null,
    internship_uniform_label_confirmed: input.internship_uniform_label_confirmed ?? task?.internship_uniform_label_confirmed ?? null,
    contract_assignment_policy: input.contract_assignment_policy ||
      task?.contract_assignment_policy ||
      object?.contract_assignment_policy ||
      'strict_contract_match'
  };
}

function evaluateFunctionMatch(contract, serviceContext) {
  if (serviceContext.contract_assignment_policy === 'not_required') {
    return {
      matched: true,
      manual_review_required: false,
      blocking_checks: [],
      missing_proof_checks: [],
      checks: [{ field: 'contract_assignment_policy', requested: 'not_required', allowed: ['not_required'], matched: true, reason: 'function_match_not_required' }]
    };
  }

  const checks = [];
  const requestedFunctionType = serviceContext.function_type || null;
  const requestedGroup = serviceContext.cao_function_group || null;
  const requestedLevel = serviceContext.cao_function_level || null;
  const requestedTaskType = serviceContext.task_type || null;
  const requestedSecurityRoleStatus = serviceContext.security_role_status || null;

  const functionTypes = uniq([
    ...normalizeArray(contract.allowed_function_types),
    contract.function_type
  ]);
  const groups = uniq([
    ...normalizeArray(contract.allowed_cao_function_groups),
    contract.cao_function_group
  ]);
  const levels = uniq([
    ...normalizeArray(contract.allowed_cao_function_levels),
    contract.cao_function_level
  ]);
  const taskTypes = normalizeArray(contract.allowed_task_types);
  const securityRoleStatuses = uniq([
    ...normalizeArray(contract.allowed_security_role_statuses),
    contract.security_role_status
  ]);

  const functionTypeCheck = listAllowsValue(functionTypes, requestedFunctionType);
  checks.push({ field: 'function_type', requested: requestedFunctionType, allowed: functionTypes, ...functionTypeCheck });

  const groupCheck = listAllowsValue(groups, requestedGroup);
  checks.push({ field: 'cao_function_group', requested: requestedGroup, allowed: groups, ...groupCheck });

  const levelCheck = listAllowsValue(levels, requestedLevel);
  checks.push({ field: 'cao_function_level', requested: requestedLevel, allowed: levels, ...levelCheck });

  const taskTypeCheck = listAllowsValue(taskTypes, requestedTaskType);
  checks.push({ field: 'task_type', requested: requestedTaskType, allowed: taskTypes, ...taskTypeCheck });

  const securityRoleCheck = listAllowsValue(securityRoleStatuses, requestedSecurityRoleStatus);
  checks.push({ field: 'security_role_status', requested: requestedSecurityRoleStatus, allowed: securityRoleStatuses, ...securityRoleCheck });

  const blocking = checks.filter(check => check.reason === 'not_allowed');
  const missingProof = checks.filter(check =>
    check.requested &&
    check.reason === 'contract_has_no_allowed_values'
  );
  const strict = serviceContext.contract_assignment_policy === 'strict_contract_match';

  return {
    matched: blocking.length === 0 && (!strict || missingProof.length === 0),
    manual_review_required: missingProof.length > 0,
    blocking_checks: blocking,
    missing_proof_checks: missingProof,
    checks
  };
}

function getCaoPayrollReadiness(caoConfig) {
  const gate = caoConfig?.payroll_readiness_gate || null;
  const status = caoConfig?.payroll_readiness_status || null;
  const registrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
  const registryReady = !!registrySnapshot.fingerprint && Number(registrySnapshot.rule_count || 0) > 0;
  const ready = caoConfig?.is_payroll_ready === true &&
    status === 'ready' &&
    gate?.passed === true &&
    registryReady;
  const blockingFindings = gate?.blocking_findings || [];

  return {
    ready,
    status: ready ? 'ready' : !registryReady ? 'blocked_missing_rule_registry_fingerprint' : (status || 'unknown'),
    is_payroll_ready: caoConfig?.is_payroll_ready === true,
    gate_present: !!gate,
    rule_registry_fingerprint_present: !!registrySnapshot.fingerprint,
    rule_registry_rule_count: registrySnapshot.rule_count,
    blocking_findings: registryReady
      ? blockingFindings
      : [
        {
          code: 'missing_rule_registry_fingerprint',
          severity: 'critical',
          message: 'CAOConfiguration mist rule_registry_fingerprint; contractresolutie is niet payroll-final audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

function getCaoRuleRegistrySnapshot(caoConfig) {
  const gateSnapshot = caoConfig?.payroll_readiness_gate?.persisted_rule_registry || null;
  const configuredSnapshot = caoConfig?.rule_registry_snapshot || null;
  const snapshot = configuredSnapshot || gateSnapshot || null;
  const fingerprint = caoConfig?.rule_registry_fingerprint ||
    snapshot?.fingerprint ||
    null;
  const ruleCount = caoConfig?.rule_registry_rule_count ??
    snapshot?.persisted_unique_rule_count ??
    snapshot?.fingerprint_rule_count ??
    null;
  const verifiedAt = caoConfig?.rule_registry_verified_at ||
    snapshot?.verified_at ||
    null;

  return {
    fingerprint,
    fingerprint_algorithm: snapshot?.fingerprint_algorithm || (fingerprint ? 'sha256' : null),
    rule_count: ruleCount,
    verified_at: verifiedAt,
    expected_unique_rule_count: snapshot?.expected_unique_rule_count ?? null,
    persisted_unique_rule_count: snapshot?.persisted_unique_rule_count ?? ruleCount,
    source_coverage_passed: snapshot?.source_coverage?.passed ?? null,
    missing_rule_ids_truncated: snapshot?.missing_rule_ids_truncated ?? false
  };
}

function evaluateInternshipServiceConstraints(contract, serviceContext) {
  if (contract?.contract_form !== 'stage') {
    return {
      source_rule_ids: [],
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      payroll_rule_profile: null
    };
  }

  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const sourceRuleIds = [
    'CAO-PB-2024-R0407', 'CAO-PB-2024-R0408', 'CAO-PB-2024-R0409',
    'CAO-PB-2024-R0410', 'CAO-PB-2024-R0411', 'CAO-PB-2024-R0412'
  ];

  const countsTowardRequiredStaffing = booleanOrNull(serviceContext.counts_toward_required_staffing);
  const customerBillable = booleanOrNull(serviceContext.customer_billable);
  const oneToOneConfirmed = booleanOrNull(serviceContext.internship_one_to_one_guidance_confirmed ?? contract.internship_one_to_one_guidance_confirmed);
  const uniformConfirmed = booleanOrNull(serviceContext.internship_uniform_label_confirmed ?? contract.internship_uniform_label_confirmed);
  const trainerId = serviceContext.internship_practice_trainer_personnel_id ||
    serviceContext.internship_mentor_personnel_id ||
    contract.internship_practice_trainer_personnel_id ||
    contract.internship_mentor_personnel_id ||
    null;

  if (countsTowardRequiredStaffing === true) {
    blockingReasons.push('CAO artikel 14: stagiair mag niet in plaats van een gediplomeerde beveiliger/vereiste bezetting worden ingezet (R0407).');
  } else if (countsTowardRequiredStaffing === null && contract.internship_above_strength_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 14: bevestig dat stagiair boven de sterkte wordt ingepland (R0407).');
  }

  if (customerBillable === true) {
    blockingReasons.push('CAO artikel 14: stagiair mag niet aan de klant worden doorberekend (R0408).');
  } else if (customerBillable === null && contract.internship_not_customer_billed_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 14: bevestig dat deze stage-inzet niet aan de klant wordt doorberekend (R0408).');
  }

  if (!trainerId) {
    manualReviewReasons.push('CAO artikel 14: leg praktijkopleider/mentor vast voor deze stage-inzet (R0410).');
  }
  if (oneToOneConfirmed !== true) {
    manualReviewReasons.push('CAO artikel 14: bevestig 1-op-1 begeleiding voor de stagiair (R0411).');
  }
  if (uniformConfirmed !== true) {
    manualReviewReasons.push('CAO artikel 14: bevestig dat de stagiair herkenbaar is als stagiair op het uniform (R0412).');
  }

  warnings.push('CAO artikel 14: voor stagiairs geldt alleen hoofdstuk 3 van de CAO; payroll mag geen reguliere loon-/toeslagprofielen toepassen zonder aparte stagevergoeding.');

  return {
    source_rule_ids: sourceRuleIds,
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons,
    warnings,
    payroll_rule_profile: {
      apply_only_chapter_3: true,
      apply_wage_scales: false,
      apply_chapter_4_allowances: false,
      apply_chapter_5_reimbursements: false,
      must_be_rostered: true,
      must_be_above_strength: true,
      customer_billing_allowed: false,
      one_to_one_guidance_required: true
    }
  };
}

function evaluateHiredWorkerServiceConstraints(contract) {
  const hiredWorkerType = contract?.hired_worker_type ||
    (contract?.contract_form === 'uitzend' ? 'agency_worker' : contract?.contract_form === 'payroll' ? 'payroll_worker' : 'not_applicable');

  if (!['agency_worker', 'payroll_worker'].includes(hiredWorkerType)) {
    return {
      source_rule_ids: [],
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      payroll_rule_profile: null
    };
  }

  const sourceRuleIds = [
    'CAO-PB-2024-R0424', 'CAO-PB-2024-R0425', 'CAO-PB-2024-R0426',
    'CAO-PB-2024-R0427', 'CAO-PB-2024-R0428', 'CAO-PB-2024-R0429',
    'CAO-PB-2024-R0430', 'CAO-PB-2024-R0431', 'CAO-PB-2024-R0432',
    'CAO-PB-2024-R0433', 'CAO-PB-2024-R0434', 'CAO-PB-2024-R0435',
    'CAO-PB-2024-R0436', 'CAO-PB-2024-R0437', 'CAO-PB-2024-R0438'
  ];
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];

  if (contract?.hired_worker_rule_status === 'blocked') {
    blockingReasons.push('CAO artikel 15: ingehuurde-arbeidskrachtprofiel is geblokkeerd op contractniveau.');
  }
  if (contract?.hired_worker_rule_status !== 'compliant') {
    manualReviewReasons.push('CAO artikel 15: inlenersbeloning/equivalente arbeidsvoorwaarden zijn nog niet volledig bewezen op het contract.');
  }

  if (hiredWorkerType === 'agency_worker' && contract?.hired_worker_inlenersbeloning_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 15: bevestig inlenersbeloning vanaf eerste werkdag voor uitzendkracht (R0424).');
  }
  if (hiredWorkerType === 'payroll_worker' && contract?.hired_worker_equal_conditions_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 15: bevestig gelijke arbeidsvoorwaarden vanaf eerste werkdag voor payroller (R0435).');
  }
  if (contract?.hired_worker_hirer_verification_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 15: inlener moet bewijzen dat uitzendbureau/payrollonderneming loon, vergoedingen en arbeidstijdregels juist toepast (R0436).');
  }
  if (contract?.hired_worker_working_time_rules_confirmed !== true || contract?.hired_worker_roster_rules_confirmed !== true) {
    manualReviewReasons.push('CAO artikel 15: algemene arbeids-/rusttijden en aanvullende roosterregels moeten bevestigd zijn voor inhuur (R0437/R0438).');
  }

  warnings.push('CAO artikel 15: planning/payroll mag alleen definitief worden als inlenersbeloning of gelijke arbeidsvoorwaarden vanaf dag één bewezen zijn.');

  return {
    source_rule_ids: sourceRuleIds,
    blocking_reasons: blockingReasons,
    manual_review_reasons: [...new Set(manualReviewReasons)],
    warnings,
    payroll_rule_profile: {
      apply_from_first_workday: true,
      apply_hirer_reward: hiredWorkerType === 'agency_worker',
      apply_equal_employment_conditions: hiredWorkerType === 'payroll_worker',
      apply_cao_scale_period: true,
      apply_overtime_shift_special_hours_holiday_allowances: true,
      apply_consignation_allowance: true,
      apply_initial_wage_increases: true,
      apply_periodics: true,
      apply_one_off_wage_increase_payments_if_employed_at_effective_date: true,
      apply_year_end_bonus_basis_hourly_wage_plus_vacation_allowance: true,
      apply_reimbursements: true,
      apply_travel_reimbursement: true,
      apply_other_function_costs: true,
      external_employer_pays_wages_and_reimbursements: true,
      hirer_must_verify_compliance: true,
      apply_general_working_and_rest_times: true,
      apply_chapter_3_roster_rules: true
    }
  };
}

async function getCaoConfigForContract(base44, { contract, companyAssignment, company, companyCaoAssignments, serviceDate, requestedCaoKey }) {
  const explicitId = contract?.cao_configuration_id ||
    companyAssignment?.default_cao_configuration_id ||
    company?.default_cao_configuration_id ||
    null;

  if (explicitId) {
    try {
      const config = await base44.asServiceRole.entities.CAOConfiguration.get(explicitId);
      if (config && isWithinDateRange(config, serviceDate, 'valid_from', 'valid_until')) {
        return { config, source: contract?.cao_configuration_id ? 'contract' : companyAssignment?.default_cao_configuration_id ? 'personnel_company_assignment' : 'company_default' };
      }
      return {
        config: null,
        source: 'explicit_id_not_valid_on_service_date',
        warning: `CAO-configuratie ${explicitId} is niet geldig op ${serviceDate}.`
      };
    } catch {
      return {
        config: null,
        source: 'explicit_id_not_found',
        warning: `CAO-configuratie ${explicitId} kon niet worden opgehaald.`
      };
    }
  }

  const matchingCompanyCao = (companyCaoAssignments || [])
    .filter(a => isWithinDateRange(a, serviceDate))
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return String(b.valid_from || '').localeCompare(String(a.valid_from || ''));
    })[0] || null;

  if (matchingCompanyCao?.cao_configuration_id) {
    const config = await base44.asServiceRole.entities.CAOConfiguration.get(matchingCompanyCao.cao_configuration_id);
    return { config, source: 'company_cao_assignment', company_cao_assignment_id: matchingCompanyCao.id };
  }

  const caoKey = contract?.cao_key || companyAssignment?.cao_key || requestedCaoKey || CAO_PB_KEY;
  const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({
    cao_key: caoKey,
    is_active: true
  });
  const eligible = configs
    .filter(c => isWithinDateRange(c, serviceDate, 'valid_from', 'valid_until'))
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));

  if (eligible.length > 1) {
    return {
      config: null,
      source: 'ambiguous_active_cao_configurations',
      cao_key: caoKey,
      candidate_configuration_ids: eligible.map(config => config.id).filter(Boolean),
      warning: `Meerdere actieve CAO-configuraties gevonden voor ${caoKey} op ${serviceDate}; planning/payroll is geblokkeerd totdat geldigheidsperiodes zijn opgeschoond.`
    };
  }

  return {
    config: eligible[0] || null,
    source: eligible[0] ? 'active_cao_by_key_and_date' : 'not_found',
    cao_key: caoKey
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { personnel_id } = body;
    if (!personnel_id) {
      return Response.json({ error: 'personnel_id is verplicht.' }, { status: 400 });
    }

    const [personnel, task, route] = await Promise.all([
      base44.entities.Personnel.get(personnel_id),
      body.task_id ? base44.entities.Task.get(body.task_id).catch(() => null) : Promise.resolve(null),
      body.route_id ? base44.entities.Route.get(body.route_id).catch(() => null) : Promise.resolve(null)
    ]);

    if (!personnel) return Response.json({ error: 'Medewerker niet gevonden.' }, { status: 404 });

    const input = body.service_context || {};
    const objectId = body.object_id || input.object_id || task?.object_id || null;
    const object = objectId ? await base44.entities.SurveillanceObject.get(objectId).catch(() => null) : null;

    const serviceContext = inferServiceContext({ body, task, route, object });
    const warnings = [];
    const manualReviewReasons = [];
    const blockingReasons = [];

    const hasServiceFunctionContext = !!(
      serviceContext.function_type ||
      serviceContext.cao_function_group ||
      serviceContext.cao_function_level ||
      serviceContext.task_type
    );
    if (!hasServiceFunctionContext && serviceContext.contract_assignment_policy === 'strict_contract_match') {
      blockingReasons.push('Dienst mist functiecontext. Stel service_function_type, required_cao_function_group of task_type in voordat contractmatching definitief mag zijn.');
    } else if (!hasServiceFunctionContext && serviceContext.contract_assignment_policy === 'allow_manual_review') {
      manualReviewReasons.push('Dienst mist functiecontext. Handmatige review vereist om te bepalen welk contract bij deze dienst hoort.');
    }

    const [contracts, assignments] = await Promise.all([
      base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id }),
      base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id })
    ]);

    const activeAssignments = assignments.filter(a =>
      a.assignment_status !== 'ended' &&
      a.available_for_planning !== false &&
      isWithinDateRange(a, serviceContext.service_date)
    );

    let companyId = serviceContext.company_id;
    if (!companyId) {
      const primary = activeAssignments.find(a => a.is_primary) || null;
      if (primary) companyId = primary.company_id;
      else if (activeAssignments.length === 1) companyId = activeAssignments[0].company_id;
      else if (personnel.primary_company_id) companyId = personnel.primary_company_id;
    }

    if (!companyId) {
      blockingReasons.push('Geen werkgever/bedrijf bepaald voor deze dienst. Geef company_id of route.operating_company_id mee.');
    }

    const companyAssignment = companyId
      ? activeAssignments.find(a => a.company_id === companyId) || null
      : null;

    if (companyId && !companyAssignment) {
      blockingReasons.push(`Medewerker heeft geen actieve personeelskoppeling met bedrijf ${companyId} op ${serviceContext.service_date}.`);
    }

    const activeContracts = contracts.filter(c => isContractActive(c, serviceContext.service_date));
    const companyContracts = activeContracts.filter(c => {
      if (!companyId) return true;
      return c.company_id === companyId || !c.company_id;
    });

    const exactCompanyContracts = companyContracts.filter(c => companyId && c.company_id === companyId);
    const legacyCompanylessContracts = companyContracts.filter(c => !c.company_id);

    let contractCandidates = exactCompanyContracts.length > 0 ? exactCompanyContracts : legacyCompanylessContracts;

    if (activeContracts.length === 0) {
      blockingReasons.push(`Geen actief arbeidscontract gevonden op ${serviceContext.service_date}.`);
    } else if (contractCandidates.length === 0) {
      blockingReasons.push(`Geen actief arbeidscontract gevonden voor bedrijf ${companyId || 'onbekend'} op ${serviceContext.service_date}.`);
    }

    if (serviceContext.cao_key && contractCandidates.length > 0) {
      const matchingCaoContracts = contractCandidates.filter(c => c.cao_key === serviceContext.cao_key);
      const unknownCaoContracts = contractCandidates.filter(c => !c.cao_key);
      const mismatchingCaoContracts = contractCandidates.filter(c => c.cao_key && c.cao_key !== serviceContext.cao_key);
      contractCandidates = matchingCaoContracts.length > 0
        ? matchingCaoContracts
        : unknownCaoContracts;

      if (matchingCaoContracts.length === 0 && unknownCaoContracts.length === 0 && mismatchingCaoContracts.length > 0) {
        blockingReasons.push(`Geen actief contract met cao_key ${serviceContext.cao_key}; beschikbare contracten hebben een andere CAO.`);
      }
      if (matchingCaoContracts.length === 0 && unknownCaoContracts.length > 0) {
        manualReviewReasons.push(`Dienst vraagt cao_key ${serviceContext.cao_key}, maar een of meer kandidaatcontracten missen cao_key. Vul contract.cao_key voor definitieve planning/payroll.`);
      }
      if (matchingCaoContracts.length > 0 && (mismatchingCaoContracts.length > 0 || unknownCaoContracts.length > 0)) {
        warnings.push(`Contracten zonder of met afwijkende cao_key zijn genegeerd voor deze dienst (${serviceContext.cao_key}).`);
      }
    }

    if (exactCompanyContracts.length === 0 && legacyCompanylessContracts.length > 0 && companyId) {
      manualReviewReasons.push('Alleen legacy contract zonder company_id gevonden. Contract moet expliciet aan werkgever/bedrijf worden gekoppeld voor definitieve planning/payroll.');
    }

    const evaluatedContracts = contractCandidates.map(contract => ({
      contract,
      function_match: evaluateFunctionMatch(contract, serviceContext)
    }));

    const matchingContracts = evaluatedContracts.filter(item => item.function_match.matched);
    if (evaluatedContracts.length > 0 && matchingContracts.length === 0) {
      blockingReasons.push('Geen actief contract staat de gevraagde dienstfunctie toe.');
    }

    const selected = matchingContracts.length === 1 ? matchingContracts[0] : null;
    if (matchingContracts.length > 1 && !body.contract_id) {
      manualReviewReasons.push('Meerdere actieve contracten matchen deze dienst. Kies expliciet contract_id in planning/payroll.');
    }

    let selectedItem = selected;
    let selectedContract = selected?.contract || null;
    if (body.contract_id) {
      const explicit = evaluatedContracts.find(item => item.contract.id === body.contract_id) || null;
      if (!explicit) {
        blockingReasons.push(`Opgegeven contract_id ${body.contract_id} is niet actief of hoort niet bij deze dienstcontext.`);
      } else {
        selectedItem = explicit;
        selectedContract = explicit.contract;
        if (!explicit.function_match.matched) {
          blockingReasons.push(`Opgegeven contract_id ${body.contract_id} staat de gevraagde dienstfunctie of beveiligingsstatus niet toe.`);
        }
      }
    }

    if (selectedItem?.function_match?.manual_review_required) {
      manualReviewReasons.push('Contract mist expliciete allowed_* functievelden voor de gevraagde dienst. Dit moet worden aangevuld voor definitieve planning/payroll.');
    }

    const internshipServiceCheck = selectedContract
      ? evaluateInternshipServiceConstraints(selectedContract, serviceContext)
      : null;
    if (internshipServiceCheck) {
      blockingReasons.push(...internshipServiceCheck.blocking_reasons);
      manualReviewReasons.push(...internshipServiceCheck.manual_review_reasons);
      warnings.push(...internshipServiceCheck.warnings);
    }
    const hiredWorkerServiceCheck = selectedContract
      ? evaluateHiredWorkerServiceConstraints(selectedContract)
      : null;
    if (hiredWorkerServiceCheck) {
      blockingReasons.push(...hiredWorkerServiceCheck.blocking_reasons);
      manualReviewReasons.push(...hiredWorkerServiceCheck.manual_review_reasons);
      warnings.push(...hiredWorkerServiceCheck.warnings);
    }

    let company = null;
    let companyCaoAssignments = [];
    if (companyId) {
      company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
      companyCaoAssignments = await base44.asServiceRole.entities.CompanyCaoAssignment.filter({ company_id: companyId }).catch(() => []);
    }

    let caoResolution = { config: null, source: 'not_attempted' };
    if (selectedContract || companyAssignment || company) {
      caoResolution = await getCaoConfigForContract(base44, {
        contract: selectedContract,
        companyAssignment,
        company,
        companyCaoAssignments,
        serviceDate: serviceContext.service_date,
        requestedCaoKey: serviceContext.cao_key
      });
      if (caoResolution.warning) warnings.push(caoResolution.warning);
    }

    if (!caoResolution.config) {
      blockingReasons.push(`Geen geldige CAO-configuratie gevonden voor ${serviceContext.service_date}.`);
    }

    const caoPayrollReadiness = getCaoPayrollReadiness(caoResolution.config);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoResolution.config);
    if (caoResolution.config && !caoPayrollReadiness.ready) {
      manualReviewReasons.push(`CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}).`);
    }

    let caoApplicability = null;
    if (selectedContract && (caoResolution.config?.cao_key || selectedContract?.cao_key || 'cao_particuliere_beveiliging') === 'cao_particuliere_beveiliging') {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          contract: selectedContract,
          work_context: serviceContext
        });
        caoApplicability = unwrapFunctionData(scopeRes);
      } catch (error) {
        manualReviewReasons.push(`CAO-toepassingsscope kon niet worden bepaald: ${error.message || String(error)}.`);
      }

      if (caoApplicability) {
        warnings.push(...(caoApplicability.warnings || []));
        if (caoApplicability.applies_cao_pb === false) {
          blockingReasons.push('Geselecteerd contract/dienstcontext valt niet onder CAO PB; kies de juiste CAO of contractscope voordat planning/payroll definitief mag zijn.');
        }
        if (caoApplicability.manual_review_required === true) {
          manualReviewReasons.push(`CAO-toepassingsscope vereist handmatige review (${caoApplicability.cao_scope_profile || 'unknown'}).`);
        }
        if (serviceRequiresSecurityScope(serviceContext) && caoApplicability.applies_full_security_rules !== true) {
          blockingReasons.push(`Dienst vraagt beveiligingsfunctie/-status, maar geselecteerd contract heeft CAO-scope ${caoApplicability.cao_scope_profile || 'unknown'} en past de volledige beveiligingsregels niet toe.`);
        }
      }
    }

    const hasBlocking = blockingReasons.length > 0;
    const manualReviewRequired = manualReviewReasons.length > 0;
    const planningAllowed = !hasBlocking && !manualReviewRequired;
    const payrollFinalAllowed = planningAllowed && caoPayrollReadiness.ready;

    const status = hasBlocking
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'resolved';

    return Response.json({
      success: !hasBlocking,
      status,
      planning_allowed: planningAllowed,
      payroll_final_allowed: payrollFinalAllowed,
      manual_review_required: manualReviewRequired || hasBlocking,
      blocking_reasons: blockingReasons,
      manual_review_reasons: manualReviewReasons,
      warnings,
      personnel_id,
      personnel_name: personnel.name || null,
      company_id: companyId || null,
      company_assignment_id: companyAssignment?.id || null,
      contract_id: selectedContract?.id || null,
      selected_contract: selectedContract ? {
        id: selectedContract.id,
        company_id: selectedContract.company_id || null,
        contract_form: selectedContract.contract_form || null,
        is_call_agreement: selectedContract.is_call_agreement === true,
        call_agreement_type: selectedContract.call_agreement_type || null,
        call_contract_type: selectedContract.call_contract_type || null,
        contract_start_date: selectedContract.contract_start_date || null,
        contract_end_date: selectedContract.contract_end_date || null,
        cao_key: selectedContract.cao_key || null,
        cao_configuration_id: selectedContract.cao_configuration_id || null,
        function_type: selectedContract.function_type || null,
        allowed_function_types: selectedContract.allowed_function_types || [],
        security_role_status: selectedContract.security_role_status || null,
        allowed_security_role_statuses: selectedContract.allowed_security_role_statuses || [],
        cao_function_group: selectedContract.cao_function_group || null,
        allowed_cao_function_groups: selectedContract.allowed_cao_function_groups || [],
        cao_function_level: selectedContract.cao_function_level || null,
        allowed_cao_function_levels: selectedContract.allowed_cao_function_levels || [],
        allowed_task_types: selectedContract.allowed_task_types || [],
        contract_hours_per_week: selectedContract.contract_hours_per_week ?? null,
        contract_hours_per_pay_period: selectedContract.contract_hours_per_pay_period ?? null,
        min_hours_per_week: selectedContract.min_hours_per_week ?? null,
        max_hours_per_week: selectedContract.max_hours_per_week ?? null,
        min_hours_per_pay_period: selectedContract.min_hours_per_pay_period ?? null,
        max_hours_per_pay_period: selectedContract.max_hours_per_pay_period ?? null,
        annual_contract_hours: selectedContract.annual_contract_hours ?? null,
        annualized_hours_with_bandwidth: selectedContract.annualized_hours_with_bandwidth === true,
        no_work_no_pay_first_6_months: selectedContract.no_work_no_pay_first_6_months === true,
        internship_type: selectedContract.internship_type || null,
        internship_rule_status: selectedContract.internship_rule_status || null,
        internship_rule_profile: internshipServiceCheck?.payroll_rule_profile || null,
        hired_worker_type: selectedContract.hired_worker_type || null,
        hired_worker_rule_status: selectedContract.hired_worker_rule_status || null,
        hired_worker_rule_profile: hiredWorkerServiceCheck?.payroll_rule_profile || null
      } : null,
      contract_source: selectedContract?.company_id ? 'company_contract' : selectedContract ? 'legacy_companyless_contract' : null,
      service_context: serviceContext,
      internship_service_check: internshipServiceCheck,
      hired_worker_service_check: hiredWorkerServiceCheck,
      cao_applicability: caoApplicability,
      function_match: selectedItem?.function_match || null,
      evaluated_contracts: evaluatedContracts.map(item => ({
        contract_id: item.contract.id,
        company_id: item.contract.company_id || null,
        contract_start_date: item.contract.contract_start_date || null,
        contract_end_date: item.contract.contract_end_date || null,
        contract_form: item.contract.contract_form || null,
        is_call_agreement: item.contract.is_call_agreement === true,
        call_agreement_type: item.contract.call_agreement_type || null,
        cao_key: item.contract.cao_key || null,
        security_role_status: item.contract.security_role_status || null,
        allowed_security_role_statuses: item.contract.allowed_security_role_statuses || [],
        function_match: item.function_match
      })),
      cao_configuration_id: caoResolution.config?.id || null,
      cao_key: caoResolution.config?.cao_key || selectedContract?.cao_key || personnel.cao || null,
      cao_resolution_source: caoResolution.source,
      cao_resolution_candidate_configuration_ids: caoResolution.candidate_configuration_ids || [],
      cao_version_label: caoResolution.config?.version_label || caoResolution.config?.name || null,
      cao_valid_from: caoResolution.config?.valid_from || null,
      cao_valid_until: caoResolution.config?.valid_until || null,
      cao_payroll_readiness: caoPayrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

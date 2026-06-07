import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_ASSIGNMENT_DECISION_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_ASSIGNMENT_DECISION_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_ASSIGNMENT_DECISION_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : !key
      ? `Runtime ${functionName} mist cao_key. Assignmentbeslissing is geblokkeerd zodat geen PB-default wordt toegepast.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Assignmentbeslissing is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
  };
}

const ASSIGNMENT_DECISION_SOURCE_RULE_IDS = [
  'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
  'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
  'CAO-PB-2024-R0233', 'CAO-PB-2024-R0296', 'CAO-PB-2024-R0547',
  'CAO-PB-2024-R0548', 'CAO-PB-2024-R0549'
];

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value].filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function appendUnique(target, values) {
  for (const value of normalizeArray(values)) {
    if (value && !target.includes(value)) target.push(value);
  }
}

function unwrapFunctionData(response) {
  return response?.data || response || null;
}

function nestedValue(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function collectValuesFromPaths(source, paths) {
  return paths.map(path => nestedValue(source, path)).filter(Boolean);
}

function collectCaoKeyEvidence({ body = {}, serviceContextValidation = null, contractResolution = null, scheduleValidation = null, caoRuntimeReadiness = null }) {
  const evidence = [];
  const add = (source, value) => {
    if (value) evidence.push({ source, cao_key: value });
  };

  add('body.cao_key', body.cao_key);
  add('body.service_context.cao_key', body.service_context?.cao_key);

  for (const value of collectValuesFromPaths(serviceContextValidation, [
    'service_context.cao_key',
    'planning_contract_context.cao_key'
  ])) add('validateTaskPlanningContext', value);

  for (const value of collectValuesFromPaths(contractResolution, [
    'cao_key',
    'service_context.cao_key',
    'selected_contract.cao_key'
  ])) add('resolvePersonnelContractForService', value);

  for (const value of collectValuesFromPaths(scheduleValidation, [
    'cao_key',
    'target_cao_key'
  ])) add('validateCaoScheduleRules', value);

  for (const value of collectValuesFromPaths(caoRuntimeReadiness, [
    'cao_key',
    'cao_readiness.0.cao_key'
  ])) add('resolveCaoRuntimeReadiness', value);

  return evidence;
}

function resolveEffectiveCaoKey(evidence) {
  const keys = unique((evidence || []).map(item => item.cao_key));
  return {
    cao_key: keys.length === 1 ? keys[0] : null,
    unique_cao_keys: keys,
    has_conflict: keys.length > 1
  };
}

function resolveRuntimeReadiness(caoKey, caoRuntimeReadiness) {
  const matrixItem = Array.isArray(caoRuntimeReadiness?.cao_readiness)
    ? caoRuntimeReadiness.cao_readiness.find(item => item?.cao_key === caoKey) || caoRuntimeReadiness.cao_readiness[0] || null
    : null;
  if (matrixItem) return matrixItem;

  if (!caoKey) {
    return {
      cao_key: null,
      status: 'blocked_missing_cao_key',
      payroll_final_allowed_by_static_runtime: false,
      planning_final_allowed_by_static_runtime: false,
      manual_review_required: true,
      blocking_reasons: ['cao_key ontbreekt. Definitieve planning/payroll mag geen CAO PB default gebruiken.']
    };
  }

  const supported = SUPPORTED_ASSIGNMENT_DECISION_CAO_KEYS.includes(caoKey);
  return {
    cao_key: caoKey,
    status: supported ? 'local_payroll_runtime_supported' : 'known_cao_runtime_not_implemented',
    payroll_final_allowed_by_static_runtime: supported,
    planning_final_allowed_by_static_runtime: supported,
    manual_review_required: !supported,
    blocking_reasons: supported
      ? []
      : [`CAO ${caoKey} heeft geen geverifieerde lokale runtime voor definitieve planning/payroll.`]
  };
}

function collectSourceRuleIds({ serviceContextValidation = null, contractResolution = null, scheduleValidation = null }) {
  const ids = [...ASSIGNMENT_DECISION_SOURCE_RULE_IDS];
  appendUnique(ids, serviceContextValidation?.service_context_readiness?.source_rule_ids);
  appendUnique(ids, serviceContextValidation?.planning_contract_context?.readiness_source_rule_ids);
  appendUnique(ids, contractResolution?.service_context_readiness?.source_rule_ids);
  appendUnique(ids, contractResolution?.function_match?.source_rule_ids);
  appendUnique(ids, contractResolution?.security_scope_match?.source_rule_ids);
  appendUnique(ids, contractResolution?.qualification_check?.source_rule_ids);
  appendUnique(ids, contractResolution?.wpbr_permission_check?.source_rule_ids);
  appendUnique(ids, contractResolution?.internship_service_check?.source_rule_ids);
  appendUnique(ids, contractResolution?.hired_worker_service_check?.source_rule_ids);
  appendUnique(ids, contractResolution?.cao_applicability?.source_rule_ids);
  appendUnique(ids, scheduleValidation?.source_rule_ids);
  appendUnique(ids, scheduleValidation?.rule_validation_summary?.source_rule_ids);
  return unique(ids);
}

function buildScheduleGate({ scheduleValidation = null, requireScheduleValidation = false }) {
  if (!requireScheduleValidation && !scheduleValidation) {
    return {
      status: 'not_required_for_assignment_gate',
      required: false,
      ready: true,
      payroll_final_ready: false,
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: ['Roosterperiodecontrole is niet uitgevoerd in deze assignmentbeslissing; de dienst mag alleen payroll-final worden nadat validateCaoScheduleRules over de volledige loon-/roosterperiode is geslaagd.']
    };
  }

  if (requireScheduleValidation && !scheduleValidation) {
    return {
      status: 'blocked_missing_schedule_validation',
      required: true,
      ready: false,
      payroll_final_ready: false,
      blocking_reasons: ['Roosterperiodecontrole ontbreekt. Voer validateCaoScheduleRules uit met alle diensten in de loon-/roosterperiode voordat deze assignment payroll-final mag zijn.'],
      manual_review_reasons: [],
      warnings: []
    };
  }

  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  if (scheduleValidation?.planning_allowed !== true || scheduleValidation?.payroll_final_allowed !== true) {
    blockingReasons.push('Roosterperiodecontrole staat definitieve planning/payroll niet toe.');
  }
  appendUnique(blockingReasons, scheduleValidation?.blocking_reasons);
  appendUnique(blockingReasons, scheduleValidation?.contract_violations?.map(item => item.message || String(item)));
  appendUnique(manualReviewReasons, scheduleValidation?.manual_review_reasons);
  appendUnique(warnings, scheduleValidation?.warnings);
  appendUnique(warnings, scheduleValidation?.contract_warnings?.map(item => item.message || String(item)));

  return {
    status: blockingReasons.length > 0
      ? 'blocked'
      : manualReviewReasons.length > 0 || scheduleValidation?.manual_review_required === true
      ? 'manual_review_required'
      : 'schedule_validation_ready',
    required: requireScheduleValidation,
    ready: blockingReasons.length === 0 && manualReviewReasons.length === 0 && scheduleValidation?.manual_review_required !== true,
    payroll_final_ready: scheduleValidation?.payroll_final_allowed === true && blockingReasons.length === 0 && manualReviewReasons.length === 0,
    blocking_reasons: unique(blockingReasons),
    manual_review_reasons: unique(manualReviewReasons),
    warnings: unique(warnings)
  };
}

function buildCaoPlanningAssignmentDecision({
  body = {},
  personnel_id = null,
  serviceContextValidation = null,
  contractResolution = null,
  scheduleValidation = null,
  caoRuntimeReadiness = null,
  requireScheduleValidation = false
} = {}) {
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const caoKeyEvidence = collectCaoKeyEvidence({
    body,
    serviceContextValidation,
    contractResolution,
    scheduleValidation,
    caoRuntimeReadiness
  });
  const caoKeyResolution = resolveEffectiveCaoKey(caoKeyEvidence);
  const runtimeReadiness = resolveRuntimeReadiness(caoKeyResolution.cao_key, caoRuntimeReadiness);
  const serviceReadiness = serviceContextValidation?.service_context_readiness || null;
  const serviceContext = serviceContextValidation?.service_context || contractResolution?.service_context || body.service_context || {};
  const scheduleGate = buildScheduleGate({ scheduleValidation, requireScheduleValidation });

  if (caoKeyResolution.has_conflict) {
    blockingReasons.push(`CAO-conflict in assignmentbeslissing: ${caoKeyResolution.unique_cao_keys.join(', ')}. Splits of herstel de dienst-/contractcontext.`);
  }
  if (!caoKeyResolution.cao_key) {
    blockingReasons.push('Geen eenduidige cao_key bewezen voor deze assignment. De planner mag niet naar CAO PB default vallen.');
  }

  if (!serviceContextValidation) {
    blockingReasons.push('Planningcontext is niet gevalideerd. Roep validateTaskPlanningContext aan voordat assignment definitief mag zijn.');
  } else if (serviceReadiness?.ready !== true) {
    appendUnique(blockingReasons, serviceReadiness?.blocking_reasons);
    appendUnique(manualReviewReasons, serviceReadiness?.manual_review_reasons);
    if ((serviceReadiness?.blocking_reasons || []).length === 0 && (serviceReadiness?.manual_review_reasons || []).length === 0) {
      manualReviewReasons.push(`Planningcontext is niet ready (${serviceReadiness?.status || 'unknown'}).`);
    }
  }
  appendUnique(warnings, serviceReadiness?.warnings);

  if (!contractResolution) {
    blockingReasons.push('Contractresolutie ontbreekt. Roep resolvePersonnelContractForService aan zodat de dienst aan een geldig arbeidscontract, bedrijf en CAO-configuratie is gekoppeld.');
  } else {
    if (contractResolution.status === 'blocked' || contractResolution.planning_allowed !== true) {
      appendUnique(blockingReasons, contractResolution.blocking_reasons);
      if ((contractResolution.blocking_reasons || []).length === 0) {
        blockingReasons.push(`Contractresolutie staat planning niet toe (${contractResolution.status || 'unknown'}).`);
      }
    }
    if (contractResolution.manual_review_required === true || contractResolution.payroll_final_allowed !== true) {
      appendUnique(manualReviewReasons, contractResolution.manual_review_reasons);
      if ((contractResolution.manual_review_reasons || []).length === 0 && contractResolution.payroll_final_allowed !== true) {
        manualReviewReasons.push('Contractresolutie is niet payroll-final toegestaan.');
      }
    }
    appendUnique(warnings, contractResolution.warnings);
  }

  if (runtimeReadiness.payroll_final_allowed_by_static_runtime !== true) {
    appendUnique(blockingReasons, runtimeReadiness.blocking_reasons);
    if ((runtimeReadiness.blocking_reasons || []).length === 0) {
      blockingReasons.push(`CAO-runtime is niet payroll-final ondersteund (${runtimeReadiness.status || 'unknown'}).`);
    }
  }
  if (runtimeReadiness.manual_review_required === true && runtimeReadiness.payroll_final_allowed_by_static_runtime === true) {
    manualReviewReasons.push(`CAO-runtime vereist handmatige review (${runtimeReadiness.status || 'unknown'}).`);
  }

  appendUnique(blockingReasons, scheduleGate.blocking_reasons);
  appendUnique(manualReviewReasons, scheduleGate.manual_review_reasons);
  appendUnique(warnings, scheduleGate.warnings);

  const uniqueBlocking = unique(blockingReasons);
  const uniqueManual = unique(manualReviewReasons);
  const uniqueWarnings = unique(warnings);
  const decisionStatus = uniqueBlocking.length > 0
    ? 'blocked'
    : uniqueManual.length > 0
    ? 'manual_review_required'
    : 'assignable';
  const assignmentAllowed = decisionStatus === 'assignable';

  return {
    success: assignmentAllowed,
    decision_status: decisionStatus,
    planning_assignment_allowed: assignmentAllowed,
    draft_assignment_allowed: uniqueBlocking.length === 0,
    payroll_final_allowed: assignmentAllowed && scheduleGate.payroll_final_ready === true,
    manual_review_required: decisionStatus !== 'assignable',
    blocking_reasons: uniqueBlocking,
    manual_review_reasons: uniqueManual,
    warnings: uniqueWarnings,
    personnel_id: personnel_id || body.personnel_id || contractResolution?.personnel_id || null,
    company_id: contractResolution?.company_id || serviceContext.company_id || body.company_id || null,
    service_date: serviceContext.service_date || body.service_date || body.service_context?.service_date || null,
    task_id: serviceContext.task_id || body.task_id || body.service_context?.task_id || null,
    object_id: serviceContext.object_id || body.object_id || body.service_context?.object_id || null,
    route_id: serviceContext.route_id || body.route_id || body.service_context?.route_id || null,
    cao_key: caoKeyResolution.cao_key,
    cao_key_evidence: caoKeyEvidence,
    cao_runtime_status: runtimeReadiness.status || null,
    cao_runtime_readiness: runtimeReadiness,
    planning_context_status: serviceReadiness?.status || null,
    service_context_readiness: serviceReadiness,
    contract_resolution_status: contractResolution?.status || null,
    contract_selection_policy: contractResolution?.contract_selection_policy || null,
    contract_id: contractResolution?.contract_id || contractResolution?.selected_contract?.id || body.contract_id || null,
    selected_contract: contractResolution?.selected_contract || null,
    cao_configuration_id: contractResolution?.cao_configuration_id || contractResolution?.selected_contract?.cao_configuration_id || null,
    cao_resolution_source: contractResolution?.cao_resolution_source || null,
    schedule_gate: scheduleGate,
    schedule_validation_status: scheduleValidation?.calculation_status || scheduleValidation?.status || null,
    decision_inputs: {
      task_planning_context_validated: !!serviceContextValidation,
      contract_resolution_validated: !!contractResolution,
      schedule_validation_validated: !!scheduleValidation,
      schedule_validation_required: requireScheduleValidation === true
    },
    source_rule_ids: collectSourceRuleIds({ serviceContextValidation, contractResolution, scheduleValidation })
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = body.service_context || {};
    const personnelId = body.personnel_id || input.personnel_id || null;
    if (!personnelId) {
      return Response.json({ success: false, error: 'personnel_id is verplicht.' }, { status: 400 });
    }

    const servicePayload = {
      task_id: body.task_id || input.task_id || null,
      object_id: body.object_id || input.object_id || null,
      route_id: body.route_id || input.route_id || null,
      company_id: body.company_id || input.company_id || input.operating_company_id || null,
      operating_company_id: body.operating_company_id || input.operating_company_id || null,
      service_date: body.service_date || input.service_date || null,
      cao_key: body.cao_key || input.cao_key || null,
      cao: body.cao || input.cao || null,
      service_context: {
        ...input,
        personnel_id: personnelId
      },
      save: body.save_task_planning_context === true || body.persist_task_planning_context === true
    };

    const serviceContextRes = await base44.asServiceRole.functions.invoke('validateTaskPlanningContext', servicePayload);
    const serviceContextValidation = unwrapFunctionData(serviceContextRes);

    const contractPayload = {
      personnel_id: personnelId,
      contract_id: body.contract_id || input.contract_id || null,
      task_id: servicePayload.task_id,
      object_id: servicePayload.object_id,
      route_id: servicePayload.route_id,
      company_id: servicePayload.company_id,
      service_date: servicePayload.service_date,
      cao_key: servicePayload.cao_key,
      service_context: serviceContextValidation?.service_context || servicePayload.service_context
    };
    const contractRes = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', contractPayload);
    const contractResolution = unwrapFunctionData(contractRes);

    const provisionalCaoKey = contractResolution?.cao_key ||
      contractResolution?.selected_contract?.cao_key ||
      serviceContextValidation?.service_context?.cao_key ||
      servicePayload.cao_key ||
      null;
    let caoRuntimeReadiness = null;
    try {
      const runtimeRes = await base44.asServiceRole.functions.invoke('resolveCaoRuntimeReadiness', {
        cao_key: provisionalCaoKey
      });
      caoRuntimeReadiness = unwrapFunctionData(runtimeRes);
    } catch {
      caoRuntimeReadiness = null;
    }

    let scheduleValidation = body.schedule_validation || null;
    const shifts = body.period_shifts || body.shifts || null;
    if (!scheduleValidation && body.run_schedule_validation === true && Array.isArray(shifts)) {
      const scheduleRes = await base44.asServiceRole.functions.invoke('validateCaoScheduleRules', {
        ...body,
        personnel_id: personnelId,
        cao_key: provisionalCaoKey,
        period_shifts: shifts,
        shifts,
        enforce_task_planning_context: true,
        enforce_contract_resolution: true,
        final_validation: body.final_validation !== false
      });
      scheduleValidation = unwrapFunctionData(scheduleRes);
    }

    const decision = buildCaoPlanningAssignmentDecision({
      body,
      personnel_id: personnelId,
      serviceContextValidation,
      contractResolution,
      scheduleValidation,
      caoRuntimeReadiness,
      requireScheduleValidation: body.require_schedule_validation === true || body.final_validation === true
    });

    return Response.json(decision);
  } catch (error) {
    return Response.json({
      success: false,
      decision_status: 'failed',
      planning_assignment_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      error: error.message || String(error)
    }, { status: 500 });
  }
});

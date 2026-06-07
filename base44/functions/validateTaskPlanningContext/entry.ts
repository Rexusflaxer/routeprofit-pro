import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EVENT_HOSPITALITY_SECURITY_KEY = 'cao_evenementen_horecabeveiliging';
const CAO_TRAFFIC_CONTROLLERS_KEY = 'cao_verkeersregelaars';
const CAO_SAFETY_DOMAIN_KEY = 'cao_veiligheidsdomein';
const SUPPORTED_PLANNING_CONTEXT_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_PLANNING_CONTEXT_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_PLANNING_CONTEXT_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : !key
      ? `Runtime ${functionName} mist cao_key. Definitieve planning/payroll is geblokkeerd zodat geen PB-default wordt toegepast.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Definitieve planning/payroll is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
  };
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '_')
    .trim();
}

function booleanTrue(value) {
  return value === true || value === 'true' || value === 'yes' || value === 'ja';
}

function normalizeContractAssignmentPolicy(value) {
  const policy = normalizeToken(value);
  return policy === 'allow_manual_review' ? 'allow_manual_review' : 'strict_contract_match';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function buildServiceSignalText(values = []) {
  return values.map(normalizeToken).filter(Boolean).join('_');
}

function inferServiceCaoKey({
  explicitCaoKey,
  explicitCao,
  worksEventOrHospitalitySecurity,
  eventHospitalityCaoApplies,
  serviceSignalText
}) {
  if (explicitCaoKey) {
    return {
      cao_key: explicitCaoKey,
      cao_key_source: 'explicit_service_or_object_context',
      inferred: false,
      suggested_cao_keys: []
    };
  }

  const explicitCaoText = normalizeToken(explicitCao);
  if (explicitCaoText.includes('evenement') || explicitCaoText.includes('horeca')) {
    return {
      cao_key: CAO_EVENT_HOSPITALITY_SECURITY_KEY,
      cao_key_source: 'explicit_cao_text_event_hospitality',
      inferred: true,
      suggested_cao_keys: [CAO_EVENT_HOSPITALITY_SECURITY_KEY]
    };
  }

  if (booleanTrue(worksEventOrHospitalitySecurity) && booleanTrue(eventHospitalityCaoApplies)) {
    return {
      cao_key: CAO_EVENT_HOSPITALITY_SECURITY_KEY,
      cao_key_source: 'event_hospitality_scope',
      inferred: true,
      suggested_cao_keys: [CAO_EVENT_HOSPITALITY_SECURITY_KEY]
    };
  }

  if (booleanTrue(worksEventOrHospitalitySecurity) && eventHospitalityCaoApplies !== false) {
    return {
      cao_key: null,
      cao_key_source: 'event_hospitality_scope_requires_confirmation',
      inferred: false,
      manual_review_required: true,
      suggested_cao_keys: [CAO_EVENT_HOSPITALITY_SECURITY_KEY],
      warning: 'Dienst lijkt evenementen-/horecabeveiliging, maar event_hospitality_cao_applies is niet expliciet bevestigd. Kies de juiste cao_key voordat planning/payroll definitief mag zijn.'
    };
  }

  const combinedSignalText = buildServiceSignalText([explicitCao, serviceSignalText]);
  if (
    combinedSignalText.includes('verkeersregelaar') ||
    combinedSignalText.includes('traffic_controller') ||
    combinedSignalText.includes('traffic_control') ||
    combinedSignalText.includes('traffic_regulation')
  ) {
    return {
      cao_key: CAO_TRAFFIC_CONTROLLERS_KEY,
      cao_key_source: 'traffic_controller_scope',
      inferred: true,
      suggested_cao_keys: [CAO_TRAFFIC_CONTROLLERS_KEY]
    };
  }

  if (
    combinedSignalText.includes('veiligheidsdomein') ||
    combinedSignalText.includes('safety_domain') ||
    combinedSignalText.includes('public_safety')
  ) {
    return {
      cao_key: CAO_SAFETY_DOMAIN_KEY,
      cao_key_source: 'safety_domain_scope',
      inferred: true,
      suggested_cao_keys: [CAO_SAFETY_DOMAIN_KEY]
    };
  }

  return {
    cao_key: null,
    cao_key_source: 'not_provided',
    inferred: false,
    suggested_cao_keys: []
  };
}

function resolveOperatingCompanyContext({ body, input, task, object, route }) {
  const candidates = [
    { source: 'body.company_id', value: body.company_id },
    { source: 'service_context.company_id', value: input.company_id },
    { source: 'body.operating_company_id', value: body.operating_company_id },
    { source: 'service_context.operating_company_id', value: input.operating_company_id },
    { source: 'task.operating_company_id', value: task?.operating_company_id },
    { source: 'object.default_operating_company_id', value: object?.default_operating_company_id },
    { source: 'object.operating_company_id', value: object?.operating_company_id },
    { source: 'route.operating_company_id', value: route?.operating_company_id }
  ];
  const match = candidates.find(candidate => candidate.value);
  return {
    company_id: match?.value || null,
    company_id_source: match?.source || 'not_provided'
  };
}

function buildServiceContext({ body, task, object, route }) {
  const input = body.service_context || {};
  const taskType = input.task_type || body.task_type || task?.task_type || null;
  const functionType = input.function_type ||
    body.function_type ||
    body.service_function_type ||
    task?.service_function_type ||
    object?.default_service_function_type ||
    null;
  const caoFunctionGroup = input.cao_function_group ||
    body.cao_function_group ||
    body.required_cao_function_group ||
    task?.required_cao_function_group ||
    object?.default_cao_function_group ||
    null;
  const caoFunctionLevel = input.cao_function_level ||
    body.cao_function_level ||
    body.required_cao_function_level ||
    task?.required_cao_function_level ||
    object?.default_cao_function_level ||
    null;
  const securityRoleStatus = input.security_role_status ||
    body.security_role_status ||
    body.required_security_role_status ||
    task?.required_security_role_status ||
    object?.default_security_role_status ||
    null;
  const explicitCaoKey = input.cao_key ||
    body.cao_key ||
    task?.cao_key ||
    task?.cao ||
    object?.cao_key ||
    object?.cao ||
    route?.cao_key ||
    route?.cao ||
    null;
  const explicitCao = input.cao || body.cao || task?.cao || object?.cao || route?.cao || null;
  const worksEventOrHospitalitySecurity = input.works_event_or_hospitality_security ??
    body.works_event_or_hospitality_security ??
    task?.works_event_or_hospitality_security ??
    object?.default_works_event_or_hospitality_security ??
    object?.works_event_or_hospitality_security ??
    null;
  const eventHospitalityCaoApplies = input.event_hospitality_cao_applies ??
    body.event_hospitality_cao_applies ??
    task?.event_hospitality_cao_applies ??
    object?.default_event_hospitality_cao_applies ??
    object?.event_hospitality_cao_applies ??
    null;
  const caoKeyResolution = inferServiceCaoKey({
    explicitCaoKey,
    explicitCao,
    worksEventOrHospitalitySecurity,
    eventHospitalityCaoApplies,
    serviceSignalText: buildServiceSignalText([
      taskType,
      functionType,
      caoFunctionGroup,
      caoFunctionLevel,
      securityRoleStatus,
      task?.service_function_type,
      object?.default_service_function_type
    ])
  });
  const operatingCompany = resolveOperatingCompanyContext({ body, input, task, object, route });

  return {
    service_date: body.service_date || input.service_date || new Date().toISOString().slice(0, 10),
    cao_key: caoKeyResolution.cao_key,
    cao_key_source: caoKeyResolution.cao_key_source,
    cao_key_inferred: caoKeyResolution.inferred === true,
    suggested_cao_keys: caoKeyResolution.suggested_cao_keys || [],
    cao_key_manual_review_required: caoKeyResolution.manual_review_required === true,
    cao_key_resolution_warning: caoKeyResolution.warning || null,
    cao: explicitCao,
    company_id: operatingCompany.company_id,
    company_id_source: operatingCompany.company_id_source,
    route_id: body.route_id || input.route_id || null,
    task_id: body.task_id || input.task_id || task?.id || null,
    object_id: body.object_id || input.object_id || task?.object_id || object?.id || null,
    task_type: taskType,
    function_type: functionType,
    cao_function_group: caoFunctionGroup,
    cao_function_level: caoFunctionLevel,
    security_role_status: securityRoleStatus,
    required_qualification_types: uniqueValues([
      ...normalizeArray(input.required_qualification_types),
      ...normalizeArray(body.required_qualification_types),
      ...normalizeArray(task?.required_qualification_types),
      ...normalizeArray(object?.default_required_qualification_types)
    ]),
    required_qualification_groups: uniqueValues([
      ...normalizeArray(input.required_qualification_groups),
      ...normalizeArray(body.required_qualification_groups),
      ...normalizeArray(task?.required_qualification_groups),
      ...normalizeArray(object?.default_required_qualification_groups)
    ]),
    performs_security_work: input.performs_security_work ??
      body.performs_security_work ??
      task?.performs_security_work ??
      object?.default_performs_security_work ??
      object?.performs_security_work ??
      null,
    security_work_percentage: input.security_work_percentage ??
      body.security_work_percentage ??
      task?.security_work_percentage ??
      object?.default_security_work_percentage ??
      object?.security_work_percentage ??
      null,
    works_airport_schiphol: input.works_airport_schiphol ??
      body.works_airport_schiphol ??
      task?.works_airport_schiphol ??
      object?.default_works_airport_schiphol ??
      object?.works_airport_schiphol ??
      null,
    works_cash_value_logistics: input.works_cash_value_logistics ??
      body.works_cash_value_logistics ??
      task?.works_cash_value_logistics ??
      object?.default_works_cash_value_logistics ??
      object?.works_cash_value_logistics ??
      null,
    works_event_or_hospitality_security: worksEventOrHospitalitySecurity,
    event_hospitality_cao_applies: eventHospitalityCaoApplies,
    customer_billable: input.customer_billable ??
      body.customer_billable ??
      task?.customer_billable ??
      object?.default_customer_billable ??
      object?.customer_billable ??
      null,
    counts_toward_required_staffing: input.counts_toward_required_staffing ??
      body.counts_toward_required_staffing ??
      task?.counts_toward_required_staffing ??
      object?.default_counts_toward_required_staffing ??
      object?.counts_toward_required_staffing ??
      null,
    contract_assignment_policy: normalizeContractAssignmentPolicy(input.contract_assignment_policy ||
      body.contract_assignment_policy ||
      task?.contract_assignment_policy ||
      object?.contract_assignment_policy ||
      'strict_contract_match')
  };
}

function evaluateServiceContextReadiness(serviceContext) {
  const missingFields = [];
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const sourceRuleIds = [
    'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
    'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
    'CAO-PB-2024-R0233'
  ];
  const contractAssignmentPolicy = normalizeContractAssignmentPolicy(serviceContext.contract_assignment_policy);
  const hasFunctionContext = !!(
    serviceContext.function_type ||
    serviceContext.cao_function_group ||
    serviceContext.cao_function_level ||
    serviceContext.task_type
  );
  const hasCaoResolutionContext = !!(
    serviceContext.cao_key ||
    serviceContext.cao ||
    serviceContext.company_id ||
    serviceContext.suggested_cao_keys?.length > 0
  );
  const hasSecurityScopeEvidence = (
    serviceContext.performs_security_work !== null &&
    serviceContext.performs_security_work !== undefined
  ) ||
    (
      serviceContext.security_work_percentage !== null &&
      serviceContext.security_work_percentage !== undefined
    ) ||
    !!serviceContext.security_role_status ||
    !!serviceContext.cao_function_group;

  if (!hasCaoResolutionContext) {
    missingFields.push('cao_key_or_company_id');
    manualReviewReasons.push('Dienst mist CAO-context: leg cao_key vast of koppel de dienst aan een bedrijf met geldige CompanyCaoAssignment voordat planning/payroll definitief mag zijn.');
  }

  if (!serviceContext.company_id) {
    missingFields.push('operating_company_id');
    if (contractAssignmentPolicy === 'strict_contract_match') {
      blockingReasons.push('Dienst mist uitvoerende werkgever/bedrijf. Stel operating_company_id/company_id in op taak, route of object-default voordat een arbeidscontract audit-proof gekoppeld kan worden.');
    } else {
      manualReviewReasons.push('Dienst mist uitvoerende werkgever/bedrijf. Handmatige review vereist voordat de juiste bedrijf-CAO en het juiste arbeidscontract gekozen kunnen worden.');
    }
  }

  if (!hasFunctionContext && contractAssignmentPolicy === 'strict_contract_match') {
    missingFields.push('service_function_type_or_cao_function_group_or_task_type');
    blockingReasons.push('Dienst mist functiecontext. Stel service_function_type, required_cao_function_group of task_type in voordat contractmatching definitief mag zijn.');
  } else if (!hasFunctionContext && contractAssignmentPolicy === 'allow_manual_review') {
    missingFields.push('service_function_type_or_cao_function_group_or_task_type');
    manualReviewReasons.push('Dienst mist functiecontext. Handmatige review vereist om te bepalen welk contract bij deze dienst hoort.');
  }

  if (!hasSecurityScopeEvidence) {
    missingFields.push('performs_security_work_or_security_scope');
    manualReviewReasons.push('Dienst mist expliciete beveiligingsscope. Leg performs_security_work, security_work_percentage, security_role_status of cao_function_group vast zodat CAO artikel 3 correct kan worden toegepast.');
  }

  if (serviceContext.cao_key_resolution_warning) {
    warnings.push(serviceContext.cao_key_resolution_warning);
  }
  if (serviceContext.cao_key_manual_review_required) {
    manualReviewReasons.push('Dienstcontext wijst op een mogelijke andere CAO, maar cao_key is niet definitief vastgesteld. Kies expliciet de juiste CAO voordat planning/payroll definitief mag zijn.');
  }
  if (serviceContext.cao_key && !SUPPORTED_PLANNING_CONTEXT_CAO_KEYS.includes(serviceContext.cao_key)) {
    manualReviewReasons.push(`Dienst gebruikt ${serviceContext.cao_key}; automatische planning/payroll-runtime is hiervoor nog niet lokaal geverifieerd.`);
  }

  const uniqueBlocking = [...new Set(blockingReasons)];
  const uniqueManual = [...new Set(manualReviewReasons)];
  const status = uniqueBlocking.length > 0
    ? 'blocked'
    : missingFields.length > 0
    ? 'missing_context'
    : uniqueManual.length > 0
    ? 'manual_review_required'
    : 'planning_context_ready';

  return {
    status,
    ready: status === 'planning_context_ready',
    missing_fields: [...new Set(missingFields)],
    blocking_reasons: uniqueBlocking,
    manual_review_reasons: uniqueManual,
    warnings: [...new Set(warnings)],
    source_rule_ids: sourceRuleIds,
    checked_at: new Date().toISOString(),
    has_function_context: hasFunctionContext,
    has_cao_resolution_context: hasCaoResolutionContext,
    has_security_scope_evidence: hasSecurityScopeEvidence,
    contract_assignment_policy: contractAssignmentPolicy,
    cao_key_source: serviceContext.cao_key_source || null,
    company_id_source: serviceContext.company_id_source || null
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = body.service_context || {};
    const taskId = body.task_id || input.task_id || null;
    const routeId = body.route_id || input.route_id || null;

    const [task, route] = await Promise.all([
      taskId ? base44.asServiceRole.entities.Task.get(taskId).catch(() => null) : Promise.resolve(null),
      routeId ? base44.asServiceRole.entities.Route.get(routeId).catch(() => null) : Promise.resolve(null)
    ]);

    if (taskId && !task) {
      return Response.json({ success: false, error: 'Taak niet gevonden.' }, { status: 404 });
    }

    const objectId = body.object_id || input.object_id || task?.object_id || null;
    const object = objectId ? await base44.asServiceRole.entities.SurveillanceObject.get(objectId).catch(() => null) : null;
    const serviceContext = buildServiceContext({ body, task, object, route });
    const readiness = evaluateServiceContextReadiness(serviceContext);
    const planningContractContext = {
      ...serviceContext,
      readiness_status: readiness.status,
      readiness_checked_at: readiness.checked_at,
      readiness_missing_fields: readiness.missing_fields,
      readiness_manual_review_reasons: readiness.manual_review_reasons,
      readiness_blocking_reasons: readiness.blocking_reasons,
      readiness_warnings: readiness.warnings,
      readiness_source_rule_ids: readiness.source_rule_ids
    };

    let saved = false;
    if (body.save === true || body.persist === true) {
      if (!taskId) {
        return Response.json({
          success: false,
          error: 'task_id is verplicht wanneer save=true.'
        }, { status: 400 });
      }
      await base44.asServiceRole.entities.Task.update(taskId, {
        planning_contract_context: planningContractContext,
        planning_context_status: readiness.status,
        planning_context_missing_fields: readiness.missing_fields,
        planning_context_manual_review_reasons: readiness.manual_review_reasons,
        planning_context_blocking_reasons: readiness.blocking_reasons,
        planning_context_warnings: readiness.warnings,
        planning_context_checked_at: readiness.checked_at,
        planning_context_source_rule_ids: readiness.source_rule_ids
      });
      saved = true;
    }

    return Response.json({
      success: true,
      saved,
      task_id: taskId,
      object_id: serviceContext.object_id || null,
      service_context: serviceContext,
      service_context_readiness: readiness,
      planning_contract_context: planningContractContext
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

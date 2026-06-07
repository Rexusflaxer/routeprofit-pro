import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EVENT_HOSPITALITY_SECURITY_KEY = 'cao_evenementen_horecabeveiliging';
const CAO_TRAFFIC_CONTROLLERS_KEY = 'cao_verkeersregelaars';
const CAO_SAFETY_DOMAIN_KEY = 'cao_veiligheidsdomein';

const KNOWN_SECURITY_CAO_CATALOG = [
  {
    cao_key: CAO_PB_KEY,
    label: 'CAO Particuliere Beveiliging',
    local_runtime_stage: 'implemented_verified_foundation',
    source_monitoring_status: 'required',
    source_families: [
      'cao_landing_page',
      'main_cao_pdf',
      'wage_tables',
      'pay_periods',
      'fonds_cao',
      'question_answer',
      'social_committee',
      'news_updates'
    ]
  },
  {
    cao_key: CAO_EVENT_HOSPITALITY_SECURITY_KEY,
    label: 'CAO Evenementen- en Horecabeveiligingsbranche',
    local_runtime_stage: 'known_source_monitoring_only',
    source_monitoring_status: 'required_before_runtime',
    source_families: [
      'cao_landing_page',
      'main_cao_pdf',
      'wage_and_version_updates',
      'scope_membership_rule'
    ]
  },
  {
    cao_key: CAO_SAFETY_DOMAIN_KEY,
    label: 'CAO Veiligheidsdomein',
    local_runtime_stage: 'known_source_monitoring_only',
    source_monitoring_status: 'required_before_runtime',
    source_families: [
      'cao_landing_page',
      'main_cao_pdf',
      'wage_and_reimbursement_updates',
      'social_fund_sources'
    ]
  },
  {
    cao_key: CAO_TRAFFIC_CONTROLLERS_KEY,
    label: 'CAO Verkeersregelaars',
    local_runtime_stage: 'known_source_monitoring_only',
    source_monitoring_status: 'required_before_runtime',
    source_families: [
      'main_cao_pdf',
      'current_version_or_landing_page',
      'wage_and_scope_sources'
    ]
  }
];

const PAYROLL_FINAL_RUNTIME_SURFACES = [
  {
    surface_key: 'contract_rules',
    function_name: 'applyCaoContractRules',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'contract_resolution',
    function_name: 'resolvePersonnelContractForService',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'planning_context',
    function_name: 'validateTaskPlanningContext',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'schedule_validation',
    function_name: 'validateCaoScheduleRules',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'payroll_calculation',
    function_name: 'calculatePersonnelCosts',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'route_payroll_calculation',
    function_name: 'calculateRoutePersonnelCosts',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'leave_sickness',
    function_name: 'calculateCaoLeaveAndSickness',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'reimbursements',
    function_name: 'calculateCaoReimbursements',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'year_end_bonus',
    function_name: 'calculateCaoYearEndBonus',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'function_classification',
    function_name: 'resolveCaoFunctionClassification',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'policy_reference_context',
    function_name: 'resolveCaoPolicyReferenceContext',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  }
];

const NON_PAYROLL_OWNER_SURFACES = [
  {
    surface_key: 'automation_ingest_candidate_review',
    function_name: 'ingestCaoAutomationPayload',
    supported_cao_keys: KNOWN_SECURITY_CAO_CATALOG.map(item => item.cao_key),
    required_for_payroll_final: false
  },
  {
    surface_key: 'source_monitoring_contract',
    function_name: 'Codex automation / Cloudflare relay source monitor',
    supported_cao_keys: KNOWN_SECURITY_CAO_CATALOG.map(item => item.cao_key),
    required_for_payroll_final: false
  }
];

const ALL_RUNTIME_SURFACES = [
  ...PAYROLL_FINAL_RUNTIME_SURFACES,
  ...NON_PAYROLL_OWNER_SURFACES
];

function normalizeCaoKey(value) {
  return String(value || '').trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value].filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function knownSecurityCaoKeys() {
  return KNOWN_SECURITY_CAO_CATALOG.map(item => item.cao_key);
}

function getKnownCaoCatalogEntry(caoKey) {
  const key = normalizeCaoKey(caoKey);
  return KNOWN_SECURITY_CAO_CATALOG.find(item => item.cao_key === key) || null;
}

function runtimeSurfaceStatus(surface, caoKey) {
  const key = normalizeCaoKey(caoKey);
  const supported = surface.supported_cao_keys.includes(key);
  return {
    surface_key: surface.surface_key,
    function_name: surface.function_name,
    required_for_payroll_final: surface.required_for_payroll_final === true,
    supported,
    status: supported ? 'supported' : 'blocked_unsupported_cao_runtime',
    supported_cao_keys: surface.supported_cao_keys,
    message: supported
      ? `${surface.function_name} ondersteunt ${key}.`
      : `${surface.function_name} ondersteunt ${key || 'onbekende CAO'} niet. Definitieve planning/payroll moet fail-closed blokkeren.`
  };
}

function buildCaoRuntimeReadinessForKey(caoKey) {
  const key = normalizeCaoKey(caoKey);
  const catalogEntry = getKnownCaoCatalogEntry(key);
  if (!catalogEntry) {
    return {
      cao_key: key || null,
      known_cao: false,
      label: null,
      status: key ? 'blocked_unknown_cao_key' : 'blocked_missing_cao_key',
      local_runtime_stage: 'unknown',
      source_monitoring_status: 'unknown',
      source_families: [],
      payroll_final_allowed_by_static_runtime: false,
      planning_final_allowed_by_static_runtime: false,
      manual_review_required: true,
      blocking_reasons: [
        key
          ? `Onbekende cao_key ${key}. Voeg eerst een CAO-catalogus, bronbewaking en runtime-dekking toe.`
          : 'cao_key ontbreekt. Definitieve planning/payroll mag geen CAO PB default gebruiken.'
      ],
      runtime_surfaces: ALL_RUNTIME_SURFACES.map(surface => runtimeSurfaceStatus(surface, key))
    };
  }

  const runtimeSurfaces = ALL_RUNTIME_SURFACES.map(surface => runtimeSurfaceStatus(surface, key));
  const payrollSurfaces = runtimeSurfaces.filter(surface => surface.required_for_payroll_final);
  const unsupportedPayrollSurfaces = payrollSurfaces.filter(surface => !surface.supported);
  const payrollFinalAllowed = unsupportedPayrollSurfaces.length === 0;
  const status = payrollFinalAllowed
    ? 'local_payroll_runtime_supported'
    : 'known_cao_runtime_not_implemented';

  return {
    cao_key: key,
    known_cao: true,
    label: catalogEntry.label,
    status,
    local_runtime_stage: catalogEntry.local_runtime_stage,
    source_monitoring_status: catalogEntry.source_monitoring_status,
    source_families: catalogEntry.source_families,
    payroll_final_allowed_by_static_runtime: payrollFinalAllowed,
    planning_final_allowed_by_static_runtime: payrollFinalAllowed,
    manual_review_required: !payrollFinalAllowed,
    blocking_reasons: payrollFinalAllowed
      ? []
      : [
        `CAO ${key} is bekend voor bronbewaking, maar mist geverifieerde lokale runtime voor: ${unsupportedPayrollSurfaces.map(surface => surface.surface_key).join(', ')}.`
      ],
    runtime_surfaces: runtimeSurfaces
  };
}

function resolveCaoRuntimeReadiness(input = {}) {
  const requestedKeys = unique(normalizeArray(input.cao_key || input.cao_keys).map(normalizeCaoKey));
  const keys = requestedKeys.length > 0 ? requestedKeys : knownSecurityCaoKeys();
  const cao_readiness = keys.map(buildCaoRuntimeReadinessForKey);
  const supportedPayrollKeys = cao_readiness
    .filter(item => item.payroll_final_allowed_by_static_runtime === true)
    .map(item => item.cao_key);
  const knownBlockedKeys = cao_readiness
    .filter(item => item.known_cao && item.payroll_final_allowed_by_static_runtime !== true)
    .map(item => item.cao_key);
  const unknownKeys = cao_readiness
    .filter(item => !item.known_cao)
    .map(item => item.cao_key)
    .filter(Boolean);

  return {
    status: unknownKeys.length > 0
      ? 'contains_unknown_cao_keys'
      : knownBlockedKeys.length > 0
      ? 'contains_known_cao_runtime_gaps'
      : 'all_requested_cao_runtimes_supported',
    known_security_cao_keys: knownSecurityCaoKeys(),
    supported_payroll_runtime_cao_keys: supportedPayrollKeys,
    known_source_monitoring_only_cao_keys: knownBlockedKeys,
    unknown_cao_keys: unknownKeys,
    cao_readiness
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    return Response.json(resolveCaoRuntimeReadiness(body));
  } catch (error) {
    return Response.json({
      error: error.message || String(error),
      status: 'failed'
    }, { status: 500 });
  }
});

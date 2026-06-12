import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EVENT_HOSPITALITY_SECURITY_KEY = 'cao_evenementen_horecabeveiliging';
const CAO_TRAFFIC_CONTROLLERS_KEY = 'cao_verkeersregelaars';
const CAO_SAFETY_DOMAIN_KEY = 'cao_veiligheidsdomein';
const SUPPORTED_CONTRACT_RESOLUTION_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_CONTRACT_RESOLUTION_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_CONTRACT_RESOLUTION_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : !key
      ? `Runtime ${functionName} mist cao_key. Contractkoppeling voor definitieve planning/payroll is geblokkeerd zodat geen PB-default wordt toegepast.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Contractkoppeling voor definitieve planning/payroll is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isWithinDateRange(record, date, startField = 'valid_from', endField = 'valid_until') {
  if (!record) return false;
  if (record[startField] && record[startField] > date) return false;
  if (record[endField] && record[endField] < date) return false;
  return true;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '_')
    .trim();
}

function normalizeContractAssignmentPolicy(value) {
  const policy = normalizeToken(value);
  return policy === 'allow_manual_review' ? 'allow_manual_review' : 'strict_contract_match';
}

function buildServiceSignalText(values = []) {
  return values.map(normalizeToken).filter(Boolean).join('_');
}

function addToken(tokens, value) {
  const normalized = normalizeToken(value);
  if (normalized) tokens.push(normalized);
}

function booleanTrue(value) {
  return value === true || value === 'true' || value === 'yes' || value === 'ja';
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

function getServiceActivityTokens(serviceContext, requestedCaoKey) {
  const tokens = [];
  [
    requestedCaoKey,
    serviceContext?.cao_key,
    serviceContext?.cao,
    serviceContext?.task_type,
    serviceContext?.function_type,
    serviceContext?.cao_function_group,
    serviceContext?.cao_function_level,
    serviceContext?.security_role_status
  ].forEach(value => addToken(tokens, value));

  if (booleanTrue(serviceContext?.works_event_or_hospitality_security) || booleanTrue(serviceContext?.event_hospitality_cao_applies)) {
    [
      'event_hospitality_security',
      'evenementen_horecabeveiliging',
      'horecabeveiliging',
      CAO_EVENT_HOSPITALITY_SECURITY_KEY
    ].forEach(value => addToken(tokens, value));
  }
  if (normalizeToken(serviceContext?.function_type).includes('verkeersregelaar') ||
      normalizeToken(serviceContext?.task_type).includes('verkeersregelaar')) {
    [
      'verkeersregelaar',
      'traffic_controller',
      'traffic_regulation',
      'traffic_control',
      CAO_TRAFFIC_CONTROLLERS_KEY
    ].forEach(value => addToken(tokens, value));
  }
  if (booleanTrue(serviceContext?.works_cash_value_logistics)) {
    ['cash_value_logistics', 'geld_waardelogistiek', 'geld_waardetransport', 'waardetransport'].forEach(value => addToken(tokens, value));
  }
  if (booleanTrue(serviceContext?.works_airport_schiphol)) {
    ['airport_schiphol', 'schiphol', 'airport_security'].forEach(value => addToken(tokens, value));
  }
  if (normalizeToken(serviceContext?.function_type).includes('veiligheidsdomein') ||
      normalizeToken(serviceContext?.task_type).includes('veiligheidsdomein')) {
    ['veiligheidsdomein', 'safety_domain', CAO_SAFETY_DOMAIN_KEY].forEach(value => addToken(tokens, value));
  }

  return uniq(tokens);
}

function companyCaoAssignmentMatchesService(assignment, serviceContext, requestedCaoKey) {
  if (assignment?.cao_key && requestedCaoKey && assignment.cao_key !== requestedCaoKey) {
    return {
      matched: false,
      reason: 'assignment_cao_key_mismatch',
      assignment_cao_key: assignment.cao_key,
      requested_cao_key: requestedCaoKey
    };
  }
  const activities = normalizeArray(assignment?.applies_to_activities).map(normalizeToken);
  if (activities.length === 0 || activities.includes('all')) {
    return { matched: true, reason: activities.includes('all') ? 'all' : 'no_activity_scope' };
  }
  const serviceTokens = getServiceActivityTokens(serviceContext, requestedCaoKey);
  const matched = activities.some(activity => serviceTokens.includes(activity));
  return {
    matched,
    reason: matched ? 'activity_scope_match' : 'activity_scope_mismatch',
    applies_to_activities: activities,
    service_tokens: serviceTokens
  };
}

function isContractActive(contract, date) {
  if (!contract || contract.is_current === false) return false;
  if (contract.contract_start_date && contract.contract_start_date > date) return false;
  if (contract.contract_end_date && contract.contract_end_date < date) return false;
  return true;
}

function resolveCompanyScopedContractCandidates({ activeContracts, companyId, serviceDate }) {
  const contracts = Array.isArray(activeContracts) ? activeContracts : [];
  const blocking_reasons = [];
  const manual_review_reasons = [];
  const warnings = [];
  const companyContracts = contracts.filter(contract => {
    if (!companyId) return true;
    return contract.company_id === companyId || !contract.company_id;
  });
  const exact_company_contracts = companyContracts.filter(contract => companyId && contract.company_id === companyId);
  const legacy_companyless_contracts = companyContracts.filter(contract => !contract.company_id);
  const ignored_other_company_contract_ids = contracts
    .filter(contract => companyId && contract.company_id && contract.company_id !== companyId)
    .map(contract => contract.id)
    .filter(Boolean);
  const contract_candidates = exact_company_contracts.length > 0
    ? exact_company_contracts
    : legacy_companyless_contracts;

  if (contracts.length === 0) {
    blocking_reasons.push(`Geen actief arbeidscontract gevonden op ${serviceDate}.`);
  } else if (contract_candidates.length === 0) {
    blocking_reasons.push(`Geen actief arbeidscontract gevonden voor bedrijf ${companyId || 'onbekend'} op ${serviceDate}.`);
  }

  if (exact_company_contracts.length === 0 && legacy_companyless_contracts.length > 0 && companyId) {
    manual_review_reasons.push('Alleen legacy contract zonder company_id gevonden. Contract moet expliciet aan werkgever/bedrijf worden gekoppeld voor definitieve planning/payroll.');
  }
  if (exact_company_contracts.length > 0 && legacy_companyless_contracts.length > 0) {
    warnings.push('Legacy contracten zonder company_id zijn genegeerd omdat exact bedrijfcontract beschikbaar is.');
  }
  if (ignored_other_company_contract_ids.length > 0) {
    warnings.push(`Contracten van andere bedrijven zijn genegeerd voor deze dienst: ${ignored_other_company_contract_ids.join(', ')}.`);
  }

  return {
    contract_candidates,
    exact_company_contracts,
    legacy_companyless_contracts,
    ignored_other_company_contract_ids,
    blocking_reasons,
    manual_review_reasons,
    warnings,
    contract_selection_policy: exact_company_contracts.length > 0
      ? 'exact_company_contracts_only'
      : legacy_companyless_contracts.length > 0
      ? 'legacy_companyless_contracts_manual_review'
      : 'no_company_scoped_contract_candidates'
  };
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

function asIsoDate(value) {
  return value ? String(value).slice(0, 10) : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const SECURITY_FUNCTION_GROUPS = [
  'objectbeveiliger_receptionist', 'mobiel_surveillant', 'winkelsurveillant',
  'brandwacht', 'geld_waardetransporteur', 'centralist'
];
const SECURITY_FUNCTION_TYPES = [
  'objectbeveiliger', 'receptie', 'receptionist',
  'surveillant', 'alarmopvolging', 'centralist', 'verkeersregelaar', 'brandwacht', 'rechercheur'
];
const SECURITY_ROLE_STATUSES = ['aspirant_beveiliger', 'beveiliger', 'leidinggevende'];
const NON_SECURITY_FUNCTION_GROUPS = ['non_security_staff'];
const NON_SECURITY_FUNCTION_TYPES = [
  'klantrelatie', 'relatiebeheer', 'accountmanager', 'sales',
  'binnendienst', 'backoffice', 'administratie', 'hr', 'planning',
  'planner', 'office', 'management'
];
const FULL_SECURITY_SCOPE_PROFILES = ['full_security_worker', 'airport_schiphol', 'cash_value_logistics'];
const NON_SECURITY_SCOPE_PROFILES = ['non_security_work_article_3_exception'];

function unwrapFunctionData(response) {
  return response?.data || response || null;
}

function serviceRequiresSecurityScope(serviceContext) {
  const securityRoleStatus = normalizeToken(serviceContext?.security_role_status);
  const caoFunctionGroup = normalizeToken(serviceContext?.cao_function_group);
  const functionType = normalizeToken(serviceContext?.function_type);
  return serviceContext?.performs_security_work === true ||
    numberOrNull(serviceContext?.security_work_percentage) > 0 ||
    SECURITY_ROLE_STATUSES.includes(securityRoleStatus) ||
    SECURITY_FUNCTION_GROUPS.includes(caoFunctionGroup) ||
    SECURITY_FUNCTION_TYPES.includes(functionType);
}

function contractOrPersonnelRequiresWpbr(contract, personnel, serviceContext) {
  return serviceRequiresSecurityScope(serviceContext) ||
    contract?.wpbr_required === true ||
    personnel?.wpbr_required === true ||
    SECURITY_ROLE_STATUSES.includes(normalizeToken(contract?.security_role_status)) ||
    normalizeArray(contract?.allowed_security_role_statuses).map(normalizeToken).some(value => SECURITY_ROLE_STATUSES.includes(value));
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function evaluateWpbrPermissionForService(contract, personnel, serviceContext) {
  const sourceRuleIds = ['CAO-PB-2024-R0312'];
  const serviceDate = asIsoDate(serviceContext?.service_date || todayIsoDate());
  const required = contractOrPersonnelRequiresWpbr(contract, personnel, serviceContext);
  const status = pickFirst(contract?.wpbr_status, personnel?.wpbr_status, null);
  const validFrom = asIsoDate(pickFirst(contract?.wpbr_permission_valid_from, personnel?.wpbr_permission_valid_from, null));
  const validUntil = asIsoDate(pickFirst(contract?.wpbr_permission_valid_until, personnel?.wpbr_permission_valid_until, null));
  const permissionNumber = pickFirst(contract?.wpbr_permission_number, personnel?.wpbr_permission_number, null);
  const authority = pickFirst(contract?.wpbr_authority, personnel?.wpbr_authority, null);
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];

  if (!required) {
    return {
      required: false,
      status: 'not_required',
      wpbr_status: status || 'not_required',
      service_date: serviceDate,
      source_rule_ids: [],
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings,
      planning_allowed: true,
      payroll_final_allowed: true
    };
  }

  if (!status) {
    manualReviewReasons.push('CAO artikel 9 lid 1d: beveiligingsdienst vereist overheidstoestemming/WPBR, maar status ontbreekt.');
  } else if (status !== 'approved') {
    blockingReasons.push(`CAO artikel 9 lid 1d: beveiligingsdienst vereist goedgekeurde overheidstoestemming/WPBR; huidige status is ${status}.`);
  }
  if (!permissionNumber) {
    manualReviewReasons.push('CAO artikel 9 lid 1d: bewijsnummer van overheidstoestemming/WPBR ontbreekt.');
  }
  if (!authority) {
    manualReviewReasons.push('CAO artikel 9 lid 1d: bevoegde instantie voor overheidstoestemming/WPBR ontbreekt.');
  }
  if (!validFrom) {
    manualReviewReasons.push('CAO artikel 9 lid 1d: geldigheid vanaf-datum van overheidstoestemming/WPBR ontbreekt.');
  }
  if (!validUntil) {
    manualReviewReasons.push('CAO artikel 9 lid 1d: geldigheid tot-datum van overheidstoestemming/WPBR ontbreekt.');
  }
  if (validFrom && serviceDate && validFrom > serviceDate) {
    blockingReasons.push(`CAO artikel 9 lid 1d: WPBR/toestemming is pas geldig vanaf ${validFrom}, maar dienstdatum is ${serviceDate}.`);
  }
  if (validUntil && serviceDate && validUntil < serviceDate) {
    blockingReasons.push(`CAO artikel 9 lid 1d: WPBR/toestemming is verlopen op ${validUntil}, maar dienstdatum is ${serviceDate}.`);
  }
  if (validUntil && serviceDate && validUntil >= serviceDate) {
    warnings.push(`WPBR/toestemming is geldig tot ${validUntil}; planning na deze datum moet blokkeren tot hernieuwde toestemming is vastgelegd.`);
  }

  const hasBlocking = blockingReasons.length > 0;
  const manualReviewRequired = manualReviewReasons.length > 0;
  return {
    required: true,
    status: hasBlocking ? 'blocked' : manualReviewRequired ? 'manual_review_required' : 'compliant',
    wpbr_status: status,
    wpbr_authority: authority,
    wpbr_permission_number_present: !!permissionNumber,
    wpbr_permission_valid_from: validFrom,
    wpbr_permission_valid_until: validUntil,
    service_date: serviceDate,
    source_rule_ids: sourceRuleIds,
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons,
    warnings,
    planning_allowed: !hasBlocking && !manualReviewRequired,
    payroll_final_allowed: !hasBlocking && !manualReviewRequired
  };
}

const QUALIFICATION_BASE_SOURCE_RULE_IDS = [
  'CAO-PB-2024-R0730',
  'CAO-PB-2024-R1752',
  'CAO-PB-2024-R1761',
  'CAO-PB-2024-R1763',
  'CAO-PB-2024-R1815',
  'CAO-PB-2024-R1816'
];

const QUALIFICATION_GROUP_DEFINITIONS = {
  security_study_in_progress: {
    label: 'Aantoonbaar studerend voor mbo diploma Beveiliger',
    accepted_types: ['mbo_beveiliger_in_opleiding'],
    source_rule_ids: ['CAO-PB-2024-R1765', 'CAO-PB-2024-R1772', 'CAO-PB-2024-R1779', 'CAO-PB-2024-R1794', 'CAO-PB-2024-R1795']
  },
  centralist_training_in_progress: {
    label: 'Aantoonbaar studerend voor mbo Beveiliger of BOCA',
    accepted_types: ['mbo_beveiliger_in_opleiding', 'centralist_boca_in_opleiding'],
    source_rule_ids: ['CAO-PB-2024-R1801']
  },
  base_security: {
    label: 'Mbo Beveiliger 2, gelijkgesteld diploma of permanente ontheffing',
    accepted_types: [
      'mbo_beveiliger',
      'beveiliger_2',
      'svpb_basisdiploma_beveiliging',
      'beveiliger_3',
      'coordinator_beveiliging',
      'branchediploma_coordinator_beveiliging',
      'svpb_vakdiploma_beveiliging',
      'svpb_kaderdiploma_beveiliging',
      'permanente_ontheffing_minister'
    ],
    source_rule_ids: ['CAO-PB-2024-R1766', 'CAO-PB-2024-R1773', 'CAO-PB-2024-R1780', 'CAO-PB-2024-R1796', 'CAO-PB-2024-R1817', 'CAO-PB-2024-R1819']
  },
  advanced_security: {
    label: 'Coordinator Beveiliging 3, SVPB Vakdiploma of gelijkgesteld hoger beveiligingsdiploma',
    accepted_types: [
      'beveiliger_3',
      'coordinator_beveiliging',
      'branchediploma_coordinator_beveiliging',
      'svpb_vakdiploma_beveiliging',
      'svpb_kaderdiploma_beveiliging'
    ],
    source_rule_ids: ['CAO-PB-2024-R1767', 'CAO-PB-2024-R1774', 'CAO-PB-2024-R1790', 'CAO-PB-2024-R1804', 'CAO-PB-2024-R1818', 'CAO-PB-2024-R1820', 'CAO-PB-2024-R1821', 'CAO-PB-2024-R1836']
  },
  ehbo_or_bhv: {
    label: 'Geldig EHBO- of BHV-diploma',
    accepted_types: ['ehbo', 'bhv'],
    source_rule_ids: ['CAO-PB-2024-R1767', 'CAO-PB-2024-R1774', 'CAO-PB-2024-R1781', 'CAO-PB-2024-R1787', 'CAO-PB-2024-R1789', 'CAO-PB-2024-R1790', 'CAO-PB-2024-R1822', 'CAO-PB-2024-R1823']
  },
  winkel_specific: {
    label: 'SVPB certificaat Detailhandel of Winkelsurveillance',
    accepted_types: ['detailhandel', 'certificaat_winkelsurveillance'],
    source_rule_ids: ['CAO-PB-2024-R1781', 'CAO-PB-2024-R1824', 'CAO-PB-2024-R1832']
  },
  brandwacht_base: {
    label: 'Rijksdiploma brandwacht',
    accepted_types: ['brandwacht', 'rijksdiploma_brandwacht', 'rijksdiploma_brandwacht_1e_klas', 'rijksdiploma_hoofdbrandwacht'],
    source_rule_ids: ['CAO-PB-2024-R1756', 'CAO-PB-2024-R1786', 'CAO-PB-2024-R1787', 'CAO-PB-2024-R1789', 'CAO-PB-2024-R1790', 'CAO-PB-2024-R1825', 'CAO-PB-2024-R1826', 'CAO-PB-2024-R1827']
  },
  brandwacht_hoofd: {
    label: 'Rijksdiploma hoofdbrandwacht',
    accepted_types: ['rijksdiploma_hoofdbrandwacht'],
    source_rule_ids: ['CAO-PB-2024-R1791', 'CAO-PB-2024-R1827']
  },
  rijbewijs_c: {
    label: 'Groot rijbewijs / rijbewijs C',
    accepted_types: ['rijbewijs_c'],
    source_rule_ids: ['CAO-PB-2024-R1797', 'CAO-PB-2024-R1828']
  },
  centralist_basic: {
    label: 'Mbo Beveiliger, BOCA of permanente ontheffing',
    accepted_types: [
      'mbo_beveiliger',
      'beveiliger_2',
      'beveiliger_3',
      'svpb_basisdiploma_beveiliging',
      'centralist_boca',
      'permanente_ontheffing_minister'
    ],
    source_rule_ids: ['CAO-PB-2024-R1802', 'CAO-PB-2024-R1817', 'CAO-PB-2024-R1819', 'CAO-PB-2024-R1831']
  },
  centralist_advanced: {
    label: 'VOCA, Coordinator Beveiliging of SVPB Vakdiploma',
    accepted_types: [
      'centralist_voca',
      'beveiliger_3',
      'coordinator_beveiliging',
      'branchediploma_coordinator_beveiliging',
      'svpb_vakdiploma_beveiliging',
      'svpb_kaderdiploma_beveiliging'
    ],
    source_rule_ids: ['CAO-PB-2024-R1804', 'CAO-PB-2024-R1834', 'CAO-PB-2024-R1818', 'CAO-PB-2024-R1820']
  }
};

const CAO_PB_FUNCTION_QUALIFICATION_REQUIREMENTS = {
  objectbeveiliger_receptionist: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1765'], evidence_groups: ['security_study_in_progress'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1766'], evidence_groups: ['base_security'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1767'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24 },
    c: { source_rule_ids: ['CAO-PB-2024-R1768'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true },
    d: { source_rule_ids: ['CAO-PB-2024-R1769'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true },
    e: { source_rule_ids: ['CAO-PB-2024-R1770'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true }
  },
  mobiel_surveillant: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1772'], evidence_groups: ['security_study_in_progress'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1773'], evidence_groups: ['base_security'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1774'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24 },
    c: { source_rule_ids: ['CAO-PB-2024-R1775'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true },
    d: { source_rule_ids: ['CAO-PB-2024-R1776'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true },
    e: { source_rule_ids: ['CAO-PB-2024-R1777'], evidence_groups: ['advanced_security', 'ehbo_or_bhv'], minimum_experience_months: 24, discretionary_promotion_required: true }
  },
  winkelsurveillant: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1779'], evidence_groups: ['security_study_in_progress'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1780'], evidence_groups: ['base_security'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1781'], evidence_groups: ['base_security', 'winkel_specific', 'ehbo_or_bhv'], minimum_experience_months: 12 },
    c: { source_rule_ids: ['CAO-PB-2024-R1782'], evidence_groups: ['base_security', 'winkel_specific', 'ehbo_or_bhv'], minimum_experience_months: 12, discretionary_promotion_required: true },
    d: { source_rule_ids: ['CAO-PB-2024-R1783'], evidence_groups: ['advanced_security', 'winkel_specific', 'ehbo_or_bhv'], minimum_experience_months: 12, discretionary_promotion_required: true },
    e: { source_rule_ids: ['CAO-PB-2024-R1784'], evidence_groups: ['advanced_security', 'winkel_specific', 'ehbo_or_bhv'], minimum_experience_months: 12, discretionary_promotion_required: true }
  },
  brandwacht: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1786'], evidence_groups: ['brandwacht_base'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1787'], evidence_groups: ['security_study_in_progress', 'brandwacht_base', 'ehbo_or_bhv'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1789'], evidence_groups: ['base_security', 'brandwacht_base', 'ehbo_or_bhv'] },
    c: { source_rule_ids: ['CAO-PB-2024-R1790'], evidence_groups: ['advanced_security', 'brandwacht_base', 'ehbo_or_bhv'], minimum_experience_months: 36 },
    d: { source_rule_ids: ['CAO-PB-2024-R1791'], evidence_groups: ['advanced_security', 'brandwacht_hoofd'], minimum_experience_months: 36, discretionary_promotion_required: true },
    e: { source_rule_ids: ['CAO-PB-2024-R1792'], evidence_groups: ['advanced_security'], minimum_experience_months: 36, discretionary_promotion_required: true }
  },
  geld_waardetransporteur: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1794'], evidence_groups: ['security_study_in_progress'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1795'], evidence_groups: ['security_study_in_progress'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1796'], evidence_groups: ['base_security'] },
    c: { source_rule_ids: ['CAO-PB-2024-R1797'], evidence_groups: ['base_security', 'rijbewijs_c'], minimum_experience_months: 36 },
    d: { source_rule_ids: ['CAO-PB-2024-R1798'], evidence_groups: ['base_security', 'rijbewijs_c'], minimum_experience_months: 36, discretionary_promotion_required: true },
    e: { source_rule_ids: ['CAO-PB-2024-R1799'], evidence_groups: ['base_security', 'rijbewijs_c'], minimum_experience_months: 36, discretionary_promotion_required: true }
  },
  centralist: {
    aspirant: { source_rule_ids: ['CAO-PB-2024-R1801'], evidence_groups: ['centralist_training_in_progress'] },
    a: { source_rule_ids: ['CAO-PB-2024-R1802'], evidence_groups: ['centralist_basic'] },
    b: { source_rule_ids: ['CAO-PB-2024-R1803'], evidence_groups: ['centralist_basic'], minimum_experience_months: 24 },
    c: { source_rule_ids: ['CAO-PB-2024-R1804'], evidence_groups: ['centralist_advanced'], minimum_experience_months: 12 },
    d: { source_rule_ids: ['CAO-PB-2024-R1805'], evidence_groups: ['centralist_advanced'], minimum_experience_months: 24 },
    e: { source_rule_ids: ['CAO-PB-2024-R1806'], evidence_groups: ['centralist_advanced'], minimum_experience_months: 24, discretionary_promotion_required: true }
  }
};

function inferQualificationTypesFromText(value) {
  const text = normalizeToken(value);
  const matches = [];
  if (!text) return matches;
  if (text.includes('in_opleiding') || text.includes('studerend') || text.includes('opleiding_beveiliger')) matches.push('mbo_beveiliger_in_opleiding');
  if (text.includes('beveiliger_2') || text.includes('mbo_beveiliger') || text.includes('algemeen_beveiligingsmedewerker')) matches.push('mbo_beveiliger');
  if (text.includes('coordinator_beveiliging') || text.includes('beveiliger_3')) matches.push('coordinator_beveiliging', 'beveiliger_3');
  if (text.includes('basisdiploma_beveiliging')) matches.push('svpb_basisdiploma_beveiliging');
  if (text.includes('vakdiploma_beveiliging')) matches.push('svpb_vakdiploma_beveiliging');
  if (text.includes('kaderdiploma_beveiliging')) matches.push('svpb_kaderdiploma_beveiliging');
  if (text.includes('ontheffing')) matches.push('permanente_ontheffing_minister');
  if (text.includes('ehbo') || text.includes('eerste_hulp')) matches.push('ehbo');
  if (text.includes('bhv')) matches.push('bhv');
  if (text.includes('detailhandel')) matches.push('detailhandel');
  if (text.includes('winkelsurveillance')) matches.push('certificaat_winkelsurveillance');
  if (text.includes('hoofdbrandwacht')) matches.push('rijksdiploma_hoofdbrandwacht');
  else if (text.includes('brandwacht_1e_klas')) matches.push('rijksdiploma_brandwacht_1e_klas');
  else if (text.includes('brandwacht')) matches.push('rijksdiploma_brandwacht', 'brandwacht');
  if (text.includes('rijbewijs_c') || text.includes('groot_rijbewijs')) matches.push('rijbewijs_c');
  if (text.includes('boca') || text.includes('basisopleiding_centralist')) matches.push('centralist_boca');
  if (text.includes('voca') || text.includes('vakopleiding_centralist')) matches.push('centralist_voca');
  if (text.includes('leidinggeven')) matches.push('leidinggeven_pb');
  return matches;
}

function qualificationTypeTokens(qualification) {
  return uniq([
    normalizeToken(qualification?.qualification_type),
    ...inferQualificationTypesFromText(qualification?.name),
    ...inferQualificationTypesFromText(qualification?.notes),
    ...inferQualificationTypesFromText(qualification?.certificate_number)
  ]);
}

function qualificationIsVerifiedForService(qualification, serviceDate, companyId) {
  if (!qualification) return false;
  if (companyId && qualification.company_id && qualification.company_id !== companyId) return false;
  if (qualification.verification_status !== 'verified') return false;
  return isWithinDateRange(qualification, serviceDate);
}

function buildQualificationRequirement(groupKey, overrides = {}) {
  const definition = QUALIFICATION_GROUP_DEFINITIONS[groupKey];
  if (!definition) return null;
  return {
    requirement_key: groupKey,
    label: definition.label,
    accepted_types: definition.accepted_types,
    source_rule_ids: uniq([...(definition.source_rule_ids || []), ...(overrides.source_rule_ids || [])]),
    explicit: overrides.explicit === true
  };
}

function buildExplicitQualificationRequirements(serviceContext) {
  const requirements = [];
  for (const group of normalizeArray(serviceContext.required_qualification_groups).map(normalizeToken)) {
    const requirement = buildQualificationRequirement(group, {
      source_rule_ids: ['explicit_service_requirement'],
      explicit: true
    });
    if (requirement) requirements.push(requirement);
  }
  for (const type of normalizeArray(serviceContext.required_qualification_types).map(normalizeToken)) {
    if (QUALIFICATION_GROUP_DEFINITIONS[type]) {
      requirements.push(buildQualificationRequirement(type, {
        source_rule_ids: ['explicit_service_requirement'],
        explicit: true
      }));
    } else if (type) {
      requirements.push({
        requirement_key: `qualification_type:${type}`,
        label: `Expliciet vereist kwalificatietype ${type}`,
        accepted_types: [type],
        source_rule_ids: ['explicit_service_requirement'],
        explicit: true
      });
    }
  }
  return requirements;
}

function getCaoPbFunctionQualificationRequirements(serviceContext, contract = null) {
  const explicitRequirements = buildExplicitQualificationRequirements(serviceContext);
  const sourceRuleIds = [...QUALIFICATION_BASE_SOURCE_RULE_IDS];
  const manualReviewReasons = [];
  const warnings = [];
  const effectiveCaoKey = serviceContext.cao_key || contract?.cao_key || null;

  if (effectiveCaoKey !== CAO_PB_KEY) {
    return {
      required: explicitRequirements.length > 0,
      requirements: explicitRequirements,
      minimum_experience_months: null,
      discretionary_promotion_required: false,
      source_rule_ids: explicitRequirements.flatMap(item => item.source_rule_ids || []),
      manual_review_reasons: [],
      warnings,
      inferred_from: explicitRequirements.length > 0 ? 'explicit_service_requirement' : 'not_cao_pb',
      effective_cao_key: effectiveCaoKey
    };
  }

  if (!serviceRequiresSecurityScope(serviceContext)) {
    return {
      required: explicitRequirements.length > 0,
      requirements: explicitRequirements,
      minimum_experience_months: null,
      discretionary_promotion_required: false,
      source_rule_ids: explicitRequirements.flatMap(item => item.source_rule_ids || []),
      manual_review_reasons: [],
      warnings,
      inferred_from: explicitRequirements.length > 0 ? 'explicit_service_requirement' : 'non_security_scope',
      effective_cao_key: effectiveCaoKey
    };
  }

  const group = normalizeToken(serviceContext.cao_function_group);
  const level = normalizeCaoFunctionLevel(serviceContext.cao_function_level) ||
    (normalizeToken(serviceContext.security_role_status) === 'aspirant_beveiliger' ? 'aspirant' : null);

  if (!group || !CAO_PB_FUNCTION_QUALIFICATION_REQUIREMENTS[group]) {
    manualReviewReasons.push('CAO PB bijlage 2/3: functiegroep ontbreekt of wordt niet herkend; diploma- en certificaateisen kunnen niet automatisch worden afgeleid.');
    return {
      required: true,
      requirements: explicitRequirements,
      minimum_experience_months: null,
      discretionary_promotion_required: false,
      source_rule_ids: sourceRuleIds,
      manual_review_reasons: manualReviewReasons,
      warnings,
      inferred_from: 'missing_or_unknown_cao_function_group',
      effective_cao_key: effectiveCaoKey
    };
  }

  if (!level) {
    manualReviewReasons.push('CAO PB bijlage 2/3: functieniveau ontbreekt; diploma-, ervaring- en schaalvoorwaarden kunnen niet automatisch worden afgeleid.');
    return {
      required: true,
      requirements: explicitRequirements,
      minimum_experience_months: null,
      discretionary_promotion_required: false,
      source_rule_ids: sourceRuleIds,
      manual_review_reasons: manualReviewReasons,
      warnings,
      inferred_from: 'missing_cao_function_level',
      effective_cao_key: effectiveCaoKey
    };
  }

  const rule = CAO_PB_FUNCTION_QUALIFICATION_REQUIREMENTS[group][level];
  if (!rule) {
    manualReviewReasons.push(`CAO PB bijlage 2/3: geen automatische diploma-/certificaatmatrix gevonden voor functiegroep ${group} niveau ${level}.`);
    return {
      required: true,
      requirements: explicitRequirements,
      minimum_experience_months: null,
      discretionary_promotion_required: false,
      source_rule_ids: sourceRuleIds,
      manual_review_reasons: manualReviewReasons,
      warnings,
      inferred_from: 'unsupported_group_level_combination',
      effective_cao_key: effectiveCaoKey
    };
  }

  const inferredRequirements = (rule.evidence_groups || [])
    .map(groupKey => buildQualificationRequirement(groupKey, { source_rule_ids: rule.source_rule_ids || [] }))
    .filter(Boolean);
  const requirementsByKey = new Map();
  for (const requirement of [...inferredRequirements, ...explicitRequirements]) {
    if (!requirementsByKey.has(requirement.requirement_key)) requirementsByKey.set(requirement.requirement_key, requirement);
  }

  return {
    required: requirementsByKey.size > 0 || !!rule.minimum_experience_months || rule.discretionary_promotion_required === true,
    requirements: [...requirementsByKey.values()],
    minimum_experience_months: rule.minimum_experience_months || null,
    discretionary_promotion_required: rule.discretionary_promotion_required === true,
    source_rule_ids: uniq([...sourceRuleIds, ...(rule.source_rule_ids || []), ...[...requirementsByKey.values()].flatMap(item => item.source_rule_ids || [])]),
    manual_review_reasons: [],
    warnings,
    inferred_from: `cao_pb_${group}_${level}`,
    effective_cao_key: effectiveCaoKey,
    cao_function_group: group,
    cao_function_level: level
  };
}

function evaluateQualificationRequirement(requirement, qualifications, serviceDate, companyId) {
  const acceptedTypes = (requirement.accepted_types || []).map(normalizeToken);
  const candidates = (qualifications || [])
    .map(qualification => ({
      qualification,
      tokens: qualificationTypeTokens(qualification)
    }))
    .filter(item => !companyId || !item.qualification.company_id || item.qualification.company_id === companyId)
    .filter(item => item.tokens.some(token => acceptedTypes.includes(token)));
  const verifiedMatches = candidates.filter(item =>
    qualificationIsVerifiedForService(item.qualification, serviceDate, companyId)
  );
  const expiredMatches = candidates.filter(item =>
    item.qualification.verification_status === 'verified' &&
    !isWithinDateRange(item.qualification, serviceDate)
  );
  const unverifiedMatches = candidates.filter(item =>
    item.qualification.verification_status !== 'verified'
  );

  return {
    ...requirement,
    matched: verifiedMatches.length > 0,
    matched_qualification_ids: verifiedMatches.map(item => item.qualification.id).filter(Boolean),
    expired_candidate_ids: expiredMatches.map(item => item.qualification.id).filter(Boolean),
    unverified_candidate_ids: unverifiedMatches.map(item => item.qualification.id).filter(Boolean),
    candidate_count: candidates.length
  };
}

function evaluateFunctionExperienceRequirement(contract, serviceContext, minimumMonths) {
  if (!minimumMonths) return null;
  const group = normalizeToken(serviceContext.cao_function_group);
  const experienceGroup = normalizeToken(contract?.cao_function_experience_group || contract?.cao_function_group);
  const months = numberOrNull(contract?.cao_function_experience_months);
  const verified = contract?.cao_function_experience_verified === true;
  const blockingReasons = [];
  const manualReviewReasons = [];

  if (experienceGroup && group && experienceGroup !== group) {
    manualReviewReasons.push(`CAO PB bijlage 2: functie-ervaring is vastgelegd voor ${experienceGroup}, maar dienst vraagt ${group}.`);
  }
  if (months === null) {
    manualReviewReasons.push(`CAO PB bijlage 2: minimaal ${minimumMonths} maanden functie-ervaring vereist, maar cao_function_experience_months ontbreekt.`);
  } else if (!verified) {
    manualReviewReasons.push(`CAO PB bijlage 2: ${months} maanden functie-ervaring is vastgelegd maar nog niet geverifieerd.`);
  } else if (months < minimumMonths) {
    blockingReasons.push(`CAO PB bijlage 2: minimaal ${minimumMonths} maanden functie-ervaring vereist; contract heeft ${months} geverifieerde maanden.`);
  }

  return {
    required: true,
    minimum_months: minimumMonths,
    recorded_months: months,
    experience_group: experienceGroup || null,
    verified,
    matched: blockingReasons.length === 0 && manualReviewReasons.length === 0,
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons
  };
}

function evaluateCaoPbQualificationForService(contract, personnelQualifications, serviceContext, companyId, qualificationFetchError = null) {
  const serviceDate = asIsoDate(serviceContext?.service_date || todayIsoDate());
  const requirementSet = getCaoPbFunctionQualificationRequirements(serviceContext, contract);
  const strict = normalizeContractAssignmentPolicy(serviceContext.contract_assignment_policy) === 'strict_contract_match';
  const blockingReasons = [];
  const manualReviewReasons = [...(requirementSet.manual_review_reasons || [])];
  const warnings = [...(requirementSet.warnings || [])];

  if (!requirementSet.required) {
    return {
      required: false,
      status: 'not_required',
      matched: true,
      manual_review_required: false,
      service_date: serviceDate,
      source_rule_ids: requirementSet.source_rule_ids || [],
      inferred_from: requirementSet.inferred_from,
      effective_cao_key: requirementSet.effective_cao_key || null,
      required_qualification_checks: [],
      experience_check: null,
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings
    };
  }

  if (qualificationFetchError) {
    manualReviewReasons.push(`Personeelskwalificaties konden niet worden opgehaald: ${qualificationFetchError.message || String(qualificationFetchError)}.`);
  }

  const requirementChecks = (requirementSet.requirements || [])
    .map(requirement => evaluateQualificationRequirement(requirement, personnelQualifications, serviceDate, companyId));

  for (const check of requirementChecks) {
    if (!check.matched) {
      if (check.expired_candidate_ids.length > 0) {
        blockingReasons.push(`CAO PB bijlage 2/3: ${check.label} is aanwezig maar niet geldig op ${serviceDate}.`);
      } else if (check.unverified_candidate_ids.length > 0) {
        manualReviewReasons.push(`CAO PB bijlage 2/3: ${check.label} is gevonden maar nog niet verified/geldig op ${serviceDate}.`);
      } else {
        blockingReasons.push(`CAO PB bijlage 2/3: vereist bewijs ontbreekt voor ${check.label}.`);
      }
    }
  }

  const experienceCheck = evaluateFunctionExperienceRequirement(
    contract,
    serviceContext,
    requirementSet.minimum_experience_months
  );
  if (experienceCheck) {
    blockingReasons.push(...experienceCheck.blocking_reasons);
    manualReviewReasons.push(...experienceCheck.manual_review_reasons);
  }

  const promotionConfirmed = contract?.cao_function_promotion_confirmed === true ||
    contract?.cao_equivalent_knowledge_experience_confirmed === true;
  if (requirementSet.discretionary_promotion_required && !promotionConfirmed) {
    manualReviewReasons.push('CAO PB bijlage 2: hogere functie/keuzebevordering of gelijkgestelde kennis/ervaring is vereist maar niet bevestigd op het contract.');
  }

  const manualReviewRequired = manualReviewReasons.length > 0;
  const matched = blockingReasons.length === 0 && (!strict || !manualReviewRequired);
  return {
    required: true,
    status: blockingReasons.length > 0
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    matched,
    manual_review_required: manualReviewRequired,
    service_date: serviceDate,
    source_rule_ids: uniq([
      ...(requirementSet.source_rule_ids || []),
      ...requirementChecks.flatMap(check => check.source_rule_ids || [])
    ]),
    inferred_from: requirementSet.inferred_from,
    effective_cao_key: requirementSet.effective_cao_key || null,
    cao_function_group: requirementSet.cao_function_group || null,
    cao_function_level: requirementSet.cao_function_level || null,
    required_qualification_checks: requirementChecks,
    experience_check: experienceCheck,
    discretionary_promotion_required: requirementSet.discretionary_promotion_required,
    promotion_or_equivalent_confirmed: promotionConfirmed,
    blocking_reasons: [...new Set(blockingReasons)],
    manual_review_reasons: [...new Set(manualReviewReasons)],
    warnings: [...new Set(warnings)]
  };
}

function getContractResolutionRuntimeSupport(caoKey) {
  const key = caoKey || null;
  const supported = SUPPORTED_CONTRACT_RESOLUTION_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    supported_cao_keys: SUPPORTED_CONTRACT_RESOLUTION_CAO_KEYS,
    message: supported
      ? `Contractresolver ondersteunt CAO ${key}.`
      : key
      ? `Contractresolver ondersteunt CAO ${key} nog niet volledig. Definitieve planning/payroll is geblokkeerd totdat deze CAO-runtime lokaal is geimplementeerd en geverifieerd.`
      : 'Contractresolver mist cao_key. Definitieve planning/payroll is geblokkeerd zodat geen PB-default wordt toegepast.'
  };
}

function listAllowsValue(list, value) {
  if (!value) return { matched: true, reason: 'no_requested_value' };
  const values = normalizeArray(list);
  const normalizedRequested = normalizeToken(value);
  const normalizedValues = values.map(item => ({
    raw: item,
    normalized: normalizeToken(item)
  }));
  if (normalizedValues.some(item => item.normalized === 'all')) return { matched: true, reason: 'all' };
  if (values.length === 0) return { matched: false, reason: 'contract_has_no_allowed_values' };
  const normalizedMatch = normalizedValues.find(item => item.normalized && item.normalized === normalizedRequested);
  if (normalizedMatch) {
    return {
      matched: true,
      reason: normalizedMatch.raw === value ? 'explicit_match' : 'normalized_token_match',
      matched_allowed_value: normalizedMatch.raw
    };
  }
  return {
    matched: false,
    reason: 'not_allowed'
  };
}

const CAO_FUNCTION_LEVEL_RANK = {
  aspirant: 0,
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5
};

function normalizeCaoFunctionLevel(value) {
  const normalized = normalizeToken(value);
  if (normalized === 'aspirant_beveiliger') return 'aspirant';
  if (normalized === 'leidinggevend' || normalized === 'leidinggevende') return null;
  return CAO_FUNCTION_LEVEL_RANK[normalized] !== undefined ? normalized : null;
}

function listAllowsCaoFunctionLevel(list, requestedLevel) {
  if (!requestedLevel) return { matched: true, reason: 'no_requested_value' };
  const values = normalizeArray(list);
  if (values.includes('all')) return { matched: true, reason: 'all' };
  if (values.length === 0) return { matched: false, reason: 'contract_has_no_allowed_values' };
  if (values.includes(requestedLevel)) return { matched: true, reason: 'explicit_match' };

  const requested = normalizeCaoFunctionLevel(requestedLevel);
  const rankedAllowed = values
    .map(value => ({ value, level: normalizeCaoFunctionLevel(value) }))
    .filter(item => item.level && CAO_FUNCTION_LEVEL_RANK[item.level] !== undefined);

  if (requested && rankedAllowed.length > 0) {
    const requestedRank = CAO_FUNCTION_LEVEL_RANK[requested];
    const higherOrEqual = rankedAllowed
      .filter(item => CAO_FUNCTION_LEVEL_RANK[item.level] >= requestedRank)
      .sort((a, b) => CAO_FUNCTION_LEVEL_RANK[a.level] - CAO_FUNCTION_LEVEL_RANK[b.level]);
    if (higherOrEqual.length > 0) {
      return {
        matched: true,
        reason: 'hierarchical_minimum_match',
        matched_allowed_value: higherOrEqual[0].value,
        requested_rank: requestedRank,
        matched_allowed_rank: CAO_FUNCTION_LEVEL_RANK[higherOrEqual[0].level]
      };
    }
  }

  return {
    matched: false,
    reason: requested ? 'below_required_cao_function_level' : 'not_allowed'
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

function inferServiceContext({ body, task, route, object }) {
  const input = body.service_context || {};
  const taskType = input.task_type || body.task_type || task?.task_type || null;
  const functionType = input.function_type ||
    body.function_type ||
    body.service_function_type ||
    body.required_function_type ||
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
  const objectId = body.object_id || input.object_id || task?.object_id || object?.id || null;
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
    service_date: body.service_date || input.service_date || todayIsoDate(),
    cao_key: caoKeyResolution.cao_key,
    cao_key_source: caoKeyResolution.cao_key_source,
    cao_key_inferred: caoKeyResolution.inferred === true,
    suggested_cao_keys: caoKeyResolution.suggested_cao_keys || [],
    cao_key_manual_review_required: caoKeyResolution.manual_review_required === true,
    cao_key_resolution_warning: caoKeyResolution.warning || null,
    cao: explicitCao,
    company_id: operatingCompany.company_id,
    company_id_source: operatingCompany.company_id_source,
    route_id: body.route_id || input.route_id || route?.id || null,
    task_id: body.task_id || input.task_id || task?.id || null,
    object_id: objectId,
    task_type: taskType,
    function_type: functionType,
    cao_function_group: caoFunctionGroup,
    cao_function_level: caoFunctionLevel,
    security_role_status: securityRoleStatus,
    required_qualification_types: uniq([
      ...normalizeArray(input.required_qualification_types),
      ...normalizeArray(body.required_qualification_types),
      ...normalizeArray(task?.required_qualification_types),
      ...normalizeArray(object?.default_required_qualification_types)
    ]),
    required_qualification_groups: uniq([
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
    internship_practice_trainer_personnel_id: input.internship_practice_trainer_personnel_id ?? body.internship_practice_trainer_personnel_id ?? task?.internship_practice_trainer_personnel_id ?? null,
    internship_mentor_personnel_id: input.internship_mentor_personnel_id ?? body.internship_mentor_personnel_id ?? task?.internship_mentor_personnel_id ?? null,
    internship_one_to_one_guidance_confirmed: input.internship_one_to_one_guidance_confirmed ?? body.internship_one_to_one_guidance_confirmed ?? task?.internship_one_to_one_guidance_confirmed ?? null,
    internship_uniform_label_confirmed: input.internship_uniform_label_confirmed ?? body.internship_uniform_label_confirmed ?? task?.internship_uniform_label_confirmed ?? null,
    contract_assignment_policy: normalizeContractAssignmentPolicy(input.contract_assignment_policy ||
      body.contract_assignment_policy ||
      task?.contract_assignment_policy ||
      object?.contract_assignment_policy ||
      'strict_contract_match')
  };
}

function evaluateFunctionMatch(contract, serviceContext) {
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

  const levelCheck = listAllowsCaoFunctionLevel(levels, requestedLevel);
  checks.push({ field: 'cao_function_level', requested: requestedLevel, allowed: levels, ...levelCheck });

  const taskTypeCheck = listAllowsValue(taskTypes, requestedTaskType);
  checks.push({ field: 'task_type', requested: requestedTaskType, allowed: taskTypes, ...taskTypeCheck });

  const securityRoleCheck = listAllowsValue(securityRoleStatuses, requestedSecurityRoleStatus);
  checks.push({ field: 'security_role_status', requested: requestedSecurityRoleStatus, allowed: securityRoleStatuses, ...securityRoleCheck });

  const blocking = checks.filter(check =>
    check.matched === false &&
    check.reason !== 'contract_has_no_allowed_values'
  );
  const missingProof = checks.filter(check =>
    check.requested &&
    check.reason === 'contract_has_no_allowed_values'
  );
  const strict = normalizeContractAssignmentPolicy(serviceContext.contract_assignment_policy) === 'strict_contract_match';

  return {
    matched: blocking.length === 0 && (!strict || missingProof.length === 0),
    manual_review_required: missingProof.length > 0,
    blocking_checks: blocking,
    missing_proof_checks: missingProof,
    checks
  };
}

function serviceSecurityIntent(serviceContext = {}) {
  const performsSecurityWork = booleanOrNull(serviceContext.performs_security_work);
  const securityWorkPercentage = numberOrNull(serviceContext.security_work_percentage);
  const securityRoleStatus = normalizeToken(serviceContext.security_role_status);
  const caoFunctionGroup = normalizeToken(serviceContext.cao_function_group);
  const functionType = normalizeToken(serviceContext.function_type);
  const taskType = normalizeToken(serviceContext.task_type);
  const securitySignals = [];
  const nonSecuritySignals = [];

  if (performsSecurityWork === true) securitySignals.push('performs_security_work=true');
  if (performsSecurityWork === false) nonSecuritySignals.push('performs_security_work=false');
  if (securityWorkPercentage !== null && securityWorkPercentage > 0) securitySignals.push(`security_work_percentage=${securityWorkPercentage}`);
  if (securityWorkPercentage === 0) nonSecuritySignals.push('security_work_percentage=0');
  if (SECURITY_ROLE_STATUSES.includes(securityRoleStatus)) securitySignals.push(`security_role_status=${securityRoleStatus}`);
  if (securityRoleStatus === 'not_applicable') nonSecuritySignals.push('security_role_status=not_applicable');
  if (SECURITY_FUNCTION_GROUPS.includes(caoFunctionGroup)) securitySignals.push(`cao_function_group=${caoFunctionGroup}`);
  if (NON_SECURITY_FUNCTION_GROUPS.includes(caoFunctionGroup)) nonSecuritySignals.push(`cao_function_group=${caoFunctionGroup}`);
  if (SECURITY_FUNCTION_TYPES.includes(functionType)) securitySignals.push(`function_type=${functionType}`);
  if (NON_SECURITY_FUNCTION_TYPES.includes(functionType)) nonSecuritySignals.push(`function_type=${functionType}`);
  if (NON_SECURITY_FUNCTION_TYPES.includes(taskType)) nonSecuritySignals.push(`task_type=${taskType}`);

  if (securitySignals.length > 0 && nonSecuritySignals.length > 0) {
    return {
      intent: 'mixed_manual_review',
      security_signals: securitySignals,
      non_security_signals: nonSecuritySignals
    };
  }
  if (securitySignals.length > 0) {
    return {
      intent: 'security_work',
      security_signals: securitySignals,
      non_security_signals: []
    };
  }
  if (nonSecuritySignals.length > 0) {
    return {
      intent: 'non_security_work',
      security_signals: [],
      non_security_signals: nonSecuritySignals
    };
  }
  return {
    intent: 'unknown',
    security_signals: [],
    non_security_signals: []
  };
}

function contractSecurityCapabilities(contract = {}) {
  const performsSecurityWork = booleanOrNull(contract.performs_security_work);
  const securityWorkPercentage = numberOrNull(contract.security_work_percentage);
  const securityRoleStatus = normalizeToken(contract.security_role_status);
  const caoFunctionGroup = normalizeToken(contract.cao_function_group);
  const scopeProfile = normalizeToken(contract.cao_scope_profile);
  const allowedSecurityRoleStatuses = normalizeArray(contract.allowed_security_role_statuses).map(normalizeToken);
  const allowedCaoFunctionGroups = normalizeArray(contract.allowed_cao_function_groups).map(normalizeToken);
  const payrollRuleProfile = contract.cao_applicable_rule_profile || {};
  const securitySignals = [];
  const nonSecuritySignals = [];

  if (performsSecurityWork === true) securitySignals.push('performs_security_work=true');
  if (performsSecurityWork === false) nonSecuritySignals.push('performs_security_work=false');
  if (securityWorkPercentage !== null && securityWorkPercentage > 0) securitySignals.push(`security_work_percentage=${securityWorkPercentage}`);
  if (securityWorkPercentage === 0) nonSecuritySignals.push('security_work_percentage=0');
  if (FULL_SECURITY_SCOPE_PROFILES.includes(scopeProfile)) securitySignals.push(`cao_scope_profile=${scopeProfile}`);
  if (NON_SECURITY_SCOPE_PROFILES.includes(scopeProfile)) nonSecuritySignals.push(`cao_scope_profile=${scopeProfile}`);
  if (payrollRuleProfile.apply_appendix_2_function_scales === true) securitySignals.push('cao_applicable_rule_profile.apply_appendix_2_function_scales=true');
  if (payrollRuleProfile.apply_appendix_2_function_scales === false) nonSecuritySignals.push('cao_applicable_rule_profile.apply_appendix_2_function_scales=false');
  if (SECURITY_ROLE_STATUSES.includes(securityRoleStatus)) securitySignals.push(`security_role_status=${securityRoleStatus}`);
  if (securityRoleStatus === 'not_applicable') nonSecuritySignals.push('security_role_status=not_applicable');
  if (allowedSecurityRoleStatuses.some(value => SECURITY_ROLE_STATUSES.includes(value))) securitySignals.push('allowed_security_role_statuses includes security role');
  if (allowedSecurityRoleStatuses.includes('not_applicable')) nonSecuritySignals.push('allowed_security_role_statuses includes not_applicable');
  if (SECURITY_FUNCTION_GROUPS.includes(caoFunctionGroup)) securitySignals.push(`cao_function_group=${caoFunctionGroup}`);
  if (NON_SECURITY_FUNCTION_GROUPS.includes(caoFunctionGroup)) nonSecuritySignals.push(`cao_function_group=${caoFunctionGroup}`);
  if (allowedCaoFunctionGroups.some(value => SECURITY_FUNCTION_GROUPS.includes(value))) securitySignals.push('allowed_cao_function_groups includes security group');
  if (allowedCaoFunctionGroups.some(value => NON_SECURITY_FUNCTION_GROUPS.includes(value))) nonSecuritySignals.push('allowed_cao_function_groups includes non_security_staff');

  return {
    allows_security_work: securitySignals.length > 0,
    allows_non_security_work: nonSecuritySignals.length > 0,
    security_signals: [...new Set(securitySignals)],
    non_security_signals: [...new Set(nonSecuritySignals)]
  };
}

function evaluateSecurityScopeMatch(contract, serviceContext) {
  const serviceIntent = serviceSecurityIntent(serviceContext);
  const contractCapabilities = contractSecurityCapabilities(contract);
  const strict = normalizeContractAssignmentPolicy(serviceContext.contract_assignment_policy) === 'strict_contract_match';
  const sourceRuleIds = ['CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229', 'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232', 'CAO-PB-2024-R0233'];
  const checks = [];
  const blockingChecks = [];
  const missingProofChecks = [];

  if (serviceIntent.intent === 'security_work') {
    const check = {
      field: 'article_3_security_scope',
      requested: 'security_work',
      allowed_security_work: contractCapabilities.allows_security_work,
      allowed_non_security_work: contractCapabilities.allows_non_security_work,
      matched: contractCapabilities.allows_security_work,
      reason: contractCapabilities.allows_security_work
        ? 'contract_allows_security_work'
        : contractCapabilities.allows_non_security_work
        ? 'contract_scope_is_non_security_only'
        : 'contract_security_scope_not_proven'
    };
    checks.push(check);
    if (!check.matched && contractCapabilities.allows_non_security_work) blockingChecks.push(check);
    else if (!check.matched) missingProofChecks.push(check);
  } else if (serviceIntent.intent === 'non_security_work') {
    const check = {
      field: 'article_3_non_security_scope',
      requested: 'non_security_work',
      allowed_security_work: contractCapabilities.allows_security_work,
      allowed_non_security_work: contractCapabilities.allows_non_security_work,
      matched: contractCapabilities.allows_non_security_work,
      reason: contractCapabilities.allows_non_security_work
        ? 'contract_allows_article_3_non_security_scope'
        : contractCapabilities.allows_security_work
        ? 'contract_scope_is_security_only'
        : 'contract_non_security_scope_not_proven'
    };
    checks.push(check);
    if (!check.matched && contractCapabilities.allows_security_work) blockingChecks.push(check);
    else if (!check.matched) missingProofChecks.push(check);
  } else if (serviceIntent.intent === 'mixed_manual_review') {
    const check = {
      field: 'article_3_mixed_scope',
      requested: 'mixed_manual_review',
      matched: false,
      reason: 'service_context_has_conflicting_security_scope_signals'
    };
    checks.push(check);
    missingProofChecks.push(check);
  } else {
    const check = {
      field: 'article_3_security_scope',
      requested: 'unknown',
      matched: false,
      reason: 'service_security_scope_not_proven'
    };
    checks.push(check);
    missingProofChecks.push(check);
  }

  return {
    matched: blockingChecks.length === 0 && (!strict || missingProofChecks.length === 0),
    manual_review_required: missingProofChecks.length > 0,
    blocking_checks: blockingChecks,
    missing_proof_checks: missingProofChecks,
    source_rule_ids: sourceRuleIds,
    service_security_intent: serviceIntent,
    contract_security_capabilities: contractCapabilities,
    checks
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

function configMatchesRequestedCaoKey(config, requestedCaoKey) {
  if (!requestedCaoKey) return true;
  return config?.cao_key === requestedCaoKey;
}

function assignmentMatchesConfigCaoKey(assignment, config) {
  if (!assignment?.cao_key) return true;
  return config?.cao_key === assignment.cao_key;
}

async function resolveConfigForCompanyCaoAssignment(base44, assignment, serviceDate) {
  if (assignment?.cao_configuration_id) {
    try {
      const config = await base44.asServiceRole.entities.CAOConfiguration.get(assignment.cao_configuration_id);
      return { assignment, config, error: null, candidate_configuration_ids: config?.id ? [config.id] : [] };
    } catch {
      return { assignment, config: null, error: 'config_not_found', candidate_configuration_ids: [assignment.cao_configuration_id].filter(Boolean) };
    }
  }

  if (!assignment?.cao_key) {
    return { assignment, config: null, error: 'missing_cao_key', candidate_configuration_ids: [] };
  }

  const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({
    cao_key: assignment.cao_key,
    is_active: true
  }).catch(() => []);
  const eligible = (configs || [])
    .filter(config => isWithinDateRange(config, serviceDate, 'valid_from', 'valid_until'))
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')) ||
      String(b.approved_at || '').localeCompare(String(a.approved_at || '')) ||
      String(b.id || '').localeCompare(String(a.id || '')));

  if (eligible.length === 1) {
    return { assignment, config: eligible[0], error: null, candidate_configuration_ids: [eligible[0].id].filter(Boolean) };
  }

  return {
    assignment,
    config: null,
    error: eligible.length > 1 ? 'ambiguous_active_cao_configurations' : 'config_not_valid_on_service_date',
    candidate_configuration_ids: eligible.map(config => config.id).filter(Boolean)
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

function evaluateStoredContractReadiness(contract) {
  if (!contract) {
    return {
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      contract_context_status: null,
      cao_contract_rule_status: null,
      planning_allowed: false,
      payroll_final_allowed: false,
      contract_final_allowed: false
    };
  }

  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const contextStatus = contract.contract_context_status || 'unknown';
  const ruleStatus = contract.cao_contract_rule_status || 'unknown';

  if (['draft_missing_context', 'blocked'].includes(contextStatus)) {
    blockingReasons.push(`Geselecteerd contract heeft contract_context_status=${contextStatus}; contractbasis moet eerst worden aangevuld voordat planning/payroll definitief mag zijn.`);
  } else if (contextStatus === 'manual_review_required') {
    manualReviewReasons.push('Geselecteerd contract heeft contract_context_status=manual_review_required. Rond contractreview af voordat planning/payroll definitief mag zijn.');
  } else if (contextStatus !== 'compliant') {
    manualReviewReasons.push(`Geselecteerd contract is nog niet contract-final beoordeeld (contract_context_status=${contextStatus}). Voer applyCaoContractRules met save uit voordat planning/payroll definitief mag zijn.`);
  }

  if (ruleStatus === 'blocked') {
    blockingReasons.push('Geselecteerd contract heeft cao_contract_rule_status=blocked; CAO-contractregels blokkeren definitieve inzet.');
  } else if (ruleStatus === 'manual_review_required') {
    manualReviewReasons.push('Geselecteerd contract heeft cao_contract_rule_status=manual_review_required. Rond CAO-contractreview af voordat planning/payroll definitief mag zijn.');
  } else if (ruleStatus !== 'compliant') {
    manualReviewReasons.push(`Geselecteerd contract heeft cao_contract_rule_status=${ruleStatus}. Contractregels moeten compliant zijn voordat planning/payroll definitief mag zijn.`);
  }

  if (contract.contract_final_allowed !== true) {
    manualReviewReasons.push('Geselecteerd contract heeft contract_final_allowed niet op true. Finaliseer het contract voordat het als geldige CAO-basis wordt gebruikt.');
  }
  if (contract.planning_allowed !== true) {
    manualReviewReasons.push('Geselecteerd contract heeft planning_allowed niet op true. Planning blijft geblokkeerd of vereist review.');
  }
  if (contract.payroll_final_allowed !== true) {
    manualReviewReasons.push('Geselecteerd contract heeft payroll_final_allowed niet op true. Payroll-final blijft geblokkeerd.');
  }
  if (Array.isArray(contract.contract_context_missing_fields) && contract.contract_context_missing_fields.length > 0) {
    blockingReasons.push(`Geselecteerd contract mist contractbasisvelden: ${contract.contract_context_missing_fields.join(', ')}.`);
  }

  return {
    blocking_reasons: [...new Set(blockingReasons)],
    manual_review_reasons: [...new Set(manualReviewReasons)],
    warnings,
    contract_context_status: contextStatus,
    cao_contract_rule_status: ruleStatus,
    planning_allowed: contract.planning_allowed === true,
    payroll_final_allowed: contract.payroll_final_allowed === true,
    contract_final_allowed: contract.contract_final_allowed === true,
    contract_context_missing_fields: contract.contract_context_missing_fields || []
  };
}

async function getCaoConfigForContract(base44, { contract, companyAssignment, company, companyCaoAssignments, serviceDate, requestedCaoKey, serviceContext }) {
  if (!contract) {
    return {
      config: null,
      source: 'missing_selected_contract',
      warning: 'Geen arbeidscontract geselecteerd. CAO-resolutie mag niet via bedrijfsdefaults verlopen; kies eerst een passend arbeidscontract.'
    };
  }

  const contractCaoKey = contract?.cao_key || null;
  if (!contractCaoKey) {
    return {
      config: null,
      source: 'missing_contract_cao_key',
      warning: 'Geselecteerd arbeidscontract mist cao_key. Leg de toepasselijke CAO expliciet vast op het contract voordat planning/payroll definitief mag zijn.'
    };
  }

  if (requestedCaoKey && requestedCaoKey !== contractCaoKey) {
    return {
      config: null,
      source: 'contract_cao_key_mismatch',
      cao_key: contractCaoKey,
      requested_cao_key: requestedCaoKey,
      warning: `Dienst vraagt cao_key ${requestedCaoKey}, maar geselecteerd arbeidscontract heeft cao_key ${contractCaoKey}.`
    };
  }

  const explicitId = contract?.cao_configuration_id || null;
  const expectedExplicitCaoKey = contractCaoKey;

  if (explicitId) {
    try {
      const config = await base44.asServiceRole.entities.CAOConfiguration.get(explicitId);
      if (config && isWithinDateRange(config, serviceDate, 'valid_from', 'valid_until')) {
        if (!configMatchesRequestedCaoKey(config, expectedExplicitCaoKey)) {
          return {
            config: null,
            source: 'explicit_id_cao_key_mismatch',
            candidate_configuration_ids: [config.id].filter(Boolean),
            warning: `CAO-configuratie ${explicitId} hoort bij ${config.cao_key || 'cao_key onbekend'}, maar de contract-/dienstcontext vraagt ${expectedExplicitCaoKey}.`
          };
        }
        return { config, source: 'contract' };
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

  const activeCompanyCaoAssignments = (companyCaoAssignments || [])
    .filter(assignment => isWithinDateRange(assignment, serviceDate));
  const scopedCompanyCaoAssignments = activeCompanyCaoAssignments
    .map(assignment => ({
      assignment,
      match: companyCaoAssignmentMatchesService(assignment, serviceContext, contractCaoKey)
    }));
  const matchingCompanyCaoAssignments = scopedCompanyCaoAssignments
    .filter(item => item.match.matched)
    .map(item => item.assignment);

  if (activeCompanyCaoAssignments.length > 0 && matchingCompanyCaoAssignments.length === 0) {
    return {
      config: null,
      source: 'company_cao_assignment_activity_scope_mismatch',
      candidate_company_cao_assignment_ids: activeCompanyCaoAssignments.map(assignment => assignment.id).filter(Boolean),
      warning: `Actieve bedrijfs-CAO-koppelingen gevonden voor ${serviceDate}, maar geen koppeling past op de dienstactiviteit/-functie.`
    };
  }

  if (matchingCompanyCaoAssignments.length > 0) {
    const resolvedCompanyCaos = await Promise.all(matchingCompanyCaoAssignments.map(assignment =>
      resolveConfigForCompanyCaoAssignment(base44, assignment, serviceDate)
    ));

    const dateValidLinks = resolvedCompanyCaos
      .filter(item => item.config && isWithinDateRange(item.config, serviceDate, 'valid_from', 'valid_until'));
    const assignmentConfigMismatches = dateValidLinks
      .filter(item => !assignmentMatchesConfigCaoKey(item.assignment, item.config));
    const caoKeyMismatches = dateValidLinks
      .filter(item => !configMatchesRequestedCaoKey(item.config, contractCaoKey));
    const validLinks = dateValidLinks
      .filter(item => configMatchesRequestedCaoKey(item.config, contractCaoKey))
      .filter(item => assignmentMatchesConfigCaoKey(item.assignment, item.config))
      .sort((a, b) => {
        const assignmentDateCompare = String(b.assignment.valid_from || '').localeCompare(String(a.assignment.valid_from || ''));
        if (assignmentDateCompare !== 0) return assignmentDateCompare;
        return String(b.config.valid_from || '').localeCompare(String(a.config.valid_from || ''));
      });

    if (dateValidLinks.length > 0 && validLinks.length === 0) {
      return {
        config: null,
        source: 'company_cao_assignment_cao_key_mismatch',
        cao_key: contractCaoKey,
        candidate_company_cao_assignment_ids: matchingCompanyCaoAssignments.map(assignment => assignment.id).filter(Boolean),
        candidate_configuration_ids: dateValidLinks.map(item => item.config.id).filter(Boolean),
        mismatching_cao_keys: [...new Set(caoKeyMismatches.map(item => item.config.cao_key || 'unknown'))],
        warning: `Actieve bedrijfs-CAO-koppelingen matchen de dienstactiviteit, maar geen gekoppelde CAO-configuratie hoort bij contract-cao_key ${contractCaoKey}.`
      };
    }

    if (assignmentConfigMismatches.length > 0 && validLinks.length === 0) {
      return {
        config: null,
        source: 'company_cao_assignment_config_cao_key_mismatch',
        candidate_company_cao_assignment_ids: assignmentConfigMismatches.map(item => item.assignment.id).filter(Boolean),
        candidate_configuration_ids: assignmentConfigMismatches.map(item => item.config.id).filter(Boolean),
        warning: 'Een of meer bedrijfs-CAO-koppelingen hebben een cao_key die niet overeenkomt met de gekoppelde CAO-configuratie.'
      };
    }

    const ambiguousAssignmentConfigs = resolvedCompanyCaos
      .filter(item => item.error === 'ambiguous_active_cao_configurations');
    if (ambiguousAssignmentConfigs.length > 0 && validLinks.length === 0) {
      return {
        config: null,
        source: 'company_cao_assignment_ambiguous_active_cao_configurations',
        cao_key: ambiguousAssignmentConfigs[0]?.assignment?.cao_key || contractCaoKey,
        candidate_company_cao_assignment_ids: ambiguousAssignmentConfigs.map(item => item.assignment.id).filter(Boolean),
        candidate_configuration_ids: ambiguousAssignmentConfigs.flatMap(item => item.candidate_configuration_ids || []),
        warning: `Meerdere actieve CAO-configuraties gevonden voor een bedrijfs-CAO-koppeling op ${serviceDate}; planning/payroll is geblokkeerd totdat overlappende CAO-configuraties zijn opgeschoond.`
      };
    }

    if (validLinks.length > 1) {
      return {
        config: null,
        source: 'ambiguous_company_cao_assignments',
        candidate_company_cao_assignment_ids: validLinks.map(item => item.assignment.id).filter(Boolean),
        candidate_configuration_ids: validLinks.map(item => item.config.id).filter(Boolean),
        warning: `Meerdere actieve bedrijfs-CAO-koppelingen hebben een geldige CAO-configuratie op ${serviceDate}; planning/payroll is geblokkeerd totdat de bedrijfs-CAO-koppelingen zijn opgeschoond.`
      };
    }

    if (validLinks.length === 1) {
      const invalidLinks = resolvedCompanyCaos.filter(item =>
        !item.config ||
        !isWithinDateRange(item.config, serviceDate, 'valid_from', 'valid_until') ||
        !configMatchesRequestedCaoKey(item.config, contractCaoKey) ||
        !assignmentMatchesConfigCaoKey(item.assignment, item.config)
      );
      if (invalidLinks.length > 0) {
        return {
          config: null,
          source: 'company_cao_assignment_contains_invalid_config',
          candidate_company_cao_assignment_ids: resolvedCompanyCaos.map(item => item.assignment.id).filter(Boolean),
          candidate_configuration_ids: resolvedCompanyCaos.flatMap(item => item.candidate_configuration_ids || [item.assignment.cao_configuration_id]).filter(Boolean),
          warning: `Actieve bedrijfs-CAO-koppelingen gevonden voor ${serviceDate}, maar minimaal een gekoppelde CAO-configuratie ontbreekt of is niet geldig op die datum.`
        };
      }
      return {
        config: validLinks[0].config,
        source: 'company_cao_assignment',
        company_cao_assignment_id: validLinks[0].assignment.id,
        candidate_company_cao_assignment_ids: matchingCompanyCaoAssignments.map(assignment => assignment.id).filter(Boolean),
        candidate_configuration_ids: [validLinks[0].config.id].filter(Boolean)
      };
    }

    const source = resolvedCompanyCaos.every(item => item.error === 'config_not_found')
      ? 'company_cao_assignment_config_not_found'
      : 'company_cao_assignment_config_not_valid_on_service_date';
    return {
      config: null,
      source,
      candidate_company_cao_assignment_ids: matchingCompanyCaoAssignments.map(assignment => assignment.id).filter(Boolean),
      candidate_configuration_ids: resolvedCompanyCaos.flatMap(item => item.candidate_configuration_ids || [item.assignment.cao_configuration_id]).filter(Boolean),
      warning: `Actieve bedrijfs-CAO-koppeling gevonden voor ${serviceDate}, maar de gekoppelde CAO-configuratie ontbreekt of is niet geldig op die datum.`
    };
  }

  const caoKey = contractCaoKey;
  if (activeCompanyCaoAssignments.length === 0) {
    return {
      config: null,
      source: 'missing_company_cao_assignment',
      cao_key: caoKey,
      warning: `Bedrijf heeft geen actieve CAO-koppeling voor contract-cao_key ${caoKey} op ${serviceDate}. Koppel de CAO eerst aan het bedrijf.`
    };
  }

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
    const input = body.service_context || {};
    const { personnel_id } = body;
    if (!personnel_id) {
      return Response.json({ error: 'personnel_id is verplicht.' }, { status: 400 });
    }
    const requestedTaskId = body.task_id || input.task_id || null;
    const requestedRouteId = body.route_id || input.route_id || null;

    const [personnel, task, route] = await Promise.all([
      base44.entities.Personnel.get(personnel_id),
      requestedTaskId ? base44.entities.Task.get(requestedTaskId).catch(() => null) : Promise.resolve(null),
      requestedRouteId ? base44.entities.Route.get(requestedRouteId).catch(() => null) : Promise.resolve(null)
    ]);

    if (!personnel) return Response.json({ error: 'Medewerker niet gevonden.' }, { status: 404 });

    const objectId = body.object_id || input.object_id || task?.object_id || null;
    const object = objectId ? await base44.entities.SurveillanceObject.get(objectId).catch(() => null) : null;

    const serviceContext = inferServiceContext({
      body: {
        ...body,
        task_id: requestedTaskId,
        route_id: requestedRouteId
      },
      task,
      route,
      object
    });
    const warnings = [];
    const manualReviewReasons = [];
    const blockingReasons = [];
    const serviceContextReadiness = evaluateServiceContextReadiness(serviceContext);

    warnings.push(...serviceContextReadiness.warnings);
    manualReviewReasons.push(...serviceContextReadiness.manual_review_reasons);
    blockingReasons.push(...serviceContextReadiness.blocking_reasons);

    let qualificationFetchError = null;
    const [contracts, assignments, personnelQualifications] = await Promise.all([
      base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id }),
      base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id }),
      base44.asServiceRole.entities.PersonnelQualification.filter({ personnel_id }).catch(error => {
        qualificationFetchError = error;
        return [];
      })
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
    const companyScopedContracts = resolveCompanyScopedContractCandidates({
      activeContracts,
      companyId,
      serviceDate: serviceContext.service_date
    });
    let contractCandidates = companyScopedContracts.contract_candidates;
    blockingReasons.push(...companyScopedContracts.blocking_reasons);
    manualReviewReasons.push(...companyScopedContracts.manual_review_reasons);
    warnings.push(...companyScopedContracts.warnings);

    const contractsMissingCaoKey = contractCandidates.filter(c => !c.cao_key);
    if (contractsMissingCaoKey.length > 0) {
      blockingReasons.push('Een of meer actieve kandidaatcontracten missen cao_key. Contracten zonder expliciete CAO mogen niet worden gebruikt voor planning/payroll.');
      contractCandidates = contractCandidates.filter(c => c.cao_key);
    }

    if (serviceContext.cao_key && contractCandidates.length > 0) {
      const matchingCaoContracts = contractCandidates.filter(c => c.cao_key === serviceContext.cao_key);
      const mismatchingCaoContracts = contractCandidates.filter(c => c.cao_key && c.cao_key !== serviceContext.cao_key);
      contractCandidates = matchingCaoContracts;

      if (matchingCaoContracts.length === 0 && mismatchingCaoContracts.length > 0) {
        blockingReasons.push(`Geen actief contract met cao_key ${serviceContext.cao_key}; beschikbare contracten hebben een andere CAO.`);
      }
      if (matchingCaoContracts.length > 0 && mismatchingCaoContracts.length > 0) {
        warnings.push(`Contracten met afwijkende cao_key zijn genegeerd voor deze dienst (${serviceContext.cao_key}).`);
      }
    }

    const evaluatedContracts = contractCandidates.map(contract => {
      const functionMatch = evaluateFunctionMatch(contract, serviceContext);
      const securityScopeMatch = evaluateSecurityScopeMatch(contract, serviceContext);
      const wpbrPermission = evaluateWpbrPermissionForService(contract, personnel, serviceContext);
      const qualificationCheck = evaluateCaoPbQualificationForService(
        contract,
        personnelQualifications,
        serviceContext,
        companyId,
        qualificationFetchError
      );
      return {
        contract,
        function_match: functionMatch,
        security_scope_match: securityScopeMatch,
        wpbr_permission_check: wpbrPermission,
        qualification_check: qualificationCheck,
        matched: functionMatch.matched && securityScopeMatch.matched && qualificationCheck.matched
      };
    });

    const matchingContracts = evaluatedContracts.filter(item => item.matched);
    if (evaluatedContracts.length > 0 && matchingContracts.length === 0) {
      const hasFunctionMatch = evaluatedContracts.some(item => item.function_match.matched);
      const hasScopeMatch = evaluatedContracts.some(item => item.security_scope_match.matched);
      const hasQualificationMatch = evaluatedContracts.some(item => item.qualification_check.matched);
      if (!hasFunctionMatch && !hasScopeMatch) {
        blockingReasons.push('Geen actief contract staat de gevraagde dienstfunctie en CAO artikel-3 beveiligingsscope toe.');
      } else if (!hasFunctionMatch) {
        blockingReasons.push('Geen actief contract staat de gevraagde dienstfunctie toe.');
      } else if (!hasQualificationMatch) {
        blockingReasons.push('Geen actief contract/medewerkerdossier voldoet aan de vereiste CAO PB diploma-, certificaat- en ervaringseisen voor deze dienst.');
      } else {
        blockingReasons.push('Geen actief contract past bij de CAO artikel-3 beveiligingsscope van deze dienst.');
      }
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
        if (!explicit.function_match.matched || !explicit.security_scope_match.matched || !explicit.qualification_check.matched) {
          blockingReasons.push(`Opgegeven contract_id ${body.contract_id} staat de gevraagde dienstfunctie, beveiligingsstatus, kwalificatie-eisen of CAO artikel-3 scope niet toe.`);
        }
      }
    }

    if (selectedItem?.function_match?.manual_review_required) {
      manualReviewReasons.push('Contract mist expliciete allowed_* functievelden voor de gevraagde dienst. Dit moet worden aangevuld voor definitieve planning/payroll.');
    }
    if (selectedItem?.security_scope_match?.manual_review_required) {
      manualReviewReasons.push('Contract-/dienstkoppeling mist expliciet bewijs voor CAO artikel 3 beveiligingsscope. Leg performs_security_work, security_work_percentage, security_role_status of cao_function_group vast op contract en dienst.');
    }
    if (selectedItem?.security_scope_match?.blocking_checks?.length > 0) {
      blockingReasons.push('Contract-/dienstkoppeling heeft een tegenstrijdige CAO artikel 3 beveiligingsscope.');
    }
    if (selectedItem?.qualification_check?.manual_review_required) {
      manualReviewReasons.push('Medewerker-/contractdossier mist verified bewijs voor een of meer CAO PB bijlage-2/bijlage-3 kwalificatie- of ervaringseisen.');
    }
    if (selectedItem?.qualification_check?.blocking_reasons?.length > 0) {
      blockingReasons.push('Medewerker-/contractdossier voldoet niet aan de vereiste CAO PB bijlage-2/bijlage-3 kwalificatie- of ervaringseisen.');
    }

    if (selectedContract && !selectedContract.cao_key) {
      blockingReasons.push('Geselecteerd contract mist cao_key. Leg de toepasselijke CAO expliciet vast op het arbeidscontract voordat planning/payroll definitief mag zijn.');
    }

    const selectedContractReadiness = selectedContract
      ? evaluateStoredContractReadiness(selectedContract)
      : null;
    if (selectedContractReadiness) {
      blockingReasons.push(...selectedContractReadiness.blocking_reasons);
      manualReviewReasons.push(...selectedContractReadiness.manual_review_reasons);
      warnings.push(...selectedContractReadiness.warnings);
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
    const wpbrPermissionCheck = selectedItem?.wpbr_permission_check || null;
    if (wpbrPermissionCheck) {
      blockingReasons.push(...wpbrPermissionCheck.blocking_reasons);
      manualReviewReasons.push(...wpbrPermissionCheck.manual_review_reasons);
      warnings.push(...wpbrPermissionCheck.warnings);
    }
    const qualificationCheck = selectedItem?.qualification_check || null;
    if (qualificationCheck) {
      blockingReasons.push(...qualificationCheck.blocking_reasons);
      manualReviewReasons.push(...qualificationCheck.manual_review_reasons);
      warnings.push(...qualificationCheck.warnings);
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
        requestedCaoKey: serviceContext.cao_key,
        serviceContext
      });
      if (caoResolution.warning) warnings.push(caoResolution.warning);
      if (Array.isArray(caoResolution.warnings)) warnings.push(...caoResolution.warnings);
    }

    if (!caoResolution.config) {
      blockingReasons.push(`Geen geldige CAO-configuratie gevonden voor ${serviceContext.service_date}.`);
    }

    const caoPayrollReadiness = getCaoPayrollReadiness(caoResolution.config);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoResolution.config);
    if (caoResolution.config && !caoPayrollReadiness.ready) {
      manualReviewReasons.push(`CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}).`);
    }
    const resolvedCaoKey = caoResolution.config?.cao_key ||
      serviceContext.cao_key ||
      selectedContract?.cao_key ||
      companyAssignment?.cao_key ||
      null;
    const caoRuntimeSupport = getContractResolutionRuntimeSupport(resolvedCaoKey);
    if (!caoRuntimeSupport.supported) {
      manualReviewReasons.push(caoRuntimeSupport.message);
    }

    let caoApplicability = null;
    const selectedCaoKeyForApplicability = caoResolution.config?.cao_key ||
      selectedContract?.cao_key ||
      serviceContext.cao_key ||
      null;
    if (selectedContract && selectedCaoKeyForApplicability === CAO_PB_KEY) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          contract: selectedContract,
          work_context: serviceContext,
          cao_key: selectedCaoKeyForApplicability
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
      contract_selection_policy: companyScopedContracts.contract_selection_policy,
      ignored_other_company_contract_ids: companyScopedContracts.ignored_other_company_contract_ids,
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
        contract_context_status: selectedContract.contract_context_status || null,
        contract_context_missing_fields: selectedContract.contract_context_missing_fields || [],
        cao_contract_rule_status: selectedContract.cao_contract_rule_status || null,
        planning_allowed: selectedContract.planning_allowed === true,
        contract_final_allowed: selectedContract.contract_final_allowed === true,
        payroll_final_allowed: selectedContract.payroll_final_allowed === true,
        function_type: selectedContract.function_type || null,
        allowed_function_types: selectedContract.allowed_function_types || [],
        security_role_status: selectedContract.security_role_status || null,
        allowed_security_role_statuses: selectedContract.allowed_security_role_statuses || [],
        performs_security_work: selectedContract.performs_security_work ?? null,
        security_work_percentage: selectedContract.security_work_percentage ?? null,
        wpbr_required: wpbrPermissionCheck?.required ?? false,
        wpbr_status: wpbrPermissionCheck?.wpbr_status || selectedContract.wpbr_status || personnel.wpbr_status || null,
        wpbr_permission_valid_from: wpbrPermissionCheck?.wpbr_permission_valid_from || selectedContract.wpbr_permission_valid_from || personnel.wpbr_permission_valid_from || null,
        wpbr_permission_valid_until: wpbrPermissionCheck?.wpbr_permission_valid_until || selectedContract.wpbr_permission_valid_until || personnel.wpbr_permission_valid_until || null,
        wpbr_permission_check_status: wpbrPermissionCheck?.status || null,
        qualification_check_status: qualificationCheck?.status || null,
        qualification_required: qualificationCheck?.required ?? false,
        cao_scope_profile: selectedContract.cao_scope_profile || null,
        cao_function_group: selectedContract.cao_function_group || null,
        allowed_cao_function_groups: selectedContract.allowed_cao_function_groups || [],
        cao_function_level: selectedContract.cao_function_level || null,
        allowed_cao_function_levels: selectedContract.allowed_cao_function_levels || [],
        cao_function_experience_months: selectedContract.cao_function_experience_months ?? null,
        cao_function_experience_verified: selectedContract.cao_function_experience_verified === true,
        cao_function_promotion_confirmed: selectedContract.cao_function_promotion_confirmed === true,
        cao_equivalent_knowledge_experience_confirmed: selectedContract.cao_equivalent_knowledge_experience_confirmed === true,
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
      service_context_readiness: serviceContextReadiness,
      internship_service_check: internshipServiceCheck,
      hired_worker_service_check: hiredWorkerServiceCheck,
      wpbr_permission_check: wpbrPermissionCheck,
      qualification_check: qualificationCheck,
      selected_contract_readiness: selectedContractReadiness,
      cao_applicability: caoApplicability,
      function_match: selectedItem?.function_match || null,
      security_scope_match: selectedItem?.security_scope_match || null,
      evaluated_contracts: evaluatedContracts.map(item => ({
        contract_id: item.contract.id,
        company_id: item.contract.company_id || null,
        contract_start_date: item.contract.contract_start_date || null,
        contract_end_date: item.contract.contract_end_date || null,
        contract_form: item.contract.contract_form || null,
        is_call_agreement: item.contract.is_call_agreement === true,
        call_agreement_type: item.contract.call_agreement_type || null,
        cao_key: item.contract.cao_key || null,
        contract_context_status: item.contract.contract_context_status || null,
        cao_contract_rule_status: item.contract.cao_contract_rule_status || null,
        planning_allowed: item.contract.planning_allowed === true,
        contract_final_allowed: item.contract.contract_final_allowed === true,
        payroll_final_allowed: item.contract.payroll_final_allowed === true,
        security_role_status: item.contract.security_role_status || null,
        allowed_security_role_statuses: item.contract.allowed_security_role_statuses || [],
        performs_security_work: item.contract.performs_security_work ?? null,
        security_work_percentage: item.contract.security_work_percentage ?? null,
        wpbr_required: item.wpbr_permission_check?.required ?? false,
        wpbr_permission_check_status: item.wpbr_permission_check?.status || null,
        qualification_required: item.qualification_check?.required ?? false,
        qualification_check_status: item.qualification_check?.status || null,
        cao_scope_profile: item.contract.cao_scope_profile || null,
        stored_contract_readiness: evaluateStoredContractReadiness(item.contract),
        function_match: item.function_match,
        security_scope_match: item.security_scope_match,
        qualification_check: item.qualification_check,
        matched: item.matched
      })),
      cao_configuration_id: caoResolution.config?.id || null,
      cao_key: caoResolution.config?.cao_key || serviceContext.cao_key || selectedContract?.cao_key || companyAssignment?.cao_key || null,
      cao_resolution_source: caoResolution.source,
      cao_resolution_candidate_configuration_ids: caoResolution.candidate_configuration_ids || [],
      cao_resolution_candidate_company_cao_assignment_ids: caoResolution.candidate_company_cao_assignment_ids || [],
      cao_version_label: caoResolution.config?.version_label || caoResolution.config?.name || null,
      cao_valid_from: caoResolution.config?.valid_from || null,
      cao_valid_until: caoResolution.config?.valid_until || null,
      cao_payroll_readiness: caoPayrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_runtime_support: caoRuntimeSupport
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

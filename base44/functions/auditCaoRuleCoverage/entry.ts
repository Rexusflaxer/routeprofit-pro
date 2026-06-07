import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner/internal CAO coverage audit.
// This function does not approve or import CAO changes. It only recomputes the
// runtime coverage gate from the current CAOConfiguration + CAORule registry.

const PAYROLL_CRITICAL_DOMAINS = [
  'payroll', 'wage', 'wages', 'salary', 'loon', 'loontabel', 'allowance',
  'allowances', 'reimbursement', 'toeslag', 'surcharge', 'overtime',
  'overwerk', 'planning', 'schedule', 'rooster', 'contract', 'employment',
  'probation', 'proeftijd', 'dismissal', 'termination', 'opzegging',
  'leave', 'vacation', 'holiday', 'sickness', 'ziekte', 'pension', 'fund',
  'function_classification', 'classification', 'bijlage_2'
];

const CRITICAL_RULE_ID_NEEDLES = [
  'R031', 'R032', 'R037', 'R038', 'R039', 'R040', 'R041', 'R042', 'R043',
  'R047', 'R048', 'R056', 'R057', 'R058', 'R059', 'R064', 'R065', 'R066',
  'R067', 'R072', 'R073', 'R077', 'R079', 'R080', 'R081', 'R085', 'R087',
  'R088', 'R089', 'R090', 'R099', 'R114', 'R115', 'R116', 'R160', 'R175',
  'R181'
];

const CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS = {
  total: 2110,
  automatic_or_calculation: 852,
  validation_or_policy: 90,
  workflow_or_documentation: 84
};

const EMPTY_SOURCE_COVERAGE_MINIMUMS = {
  total: 0,
  automatic_or_calculation: 0,
  validation_or_policy: 0,
  workflow_or_documentation: 0
};

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EVENT_HOSPITALITY_SECURITY_KEY = 'cao_evenementen_horecabeveiliging';
const CAO_TRAFFIC_CONTROLLERS_KEY = 'cao_verkeersregelaars';
const CAO_SAFETY_DOMAIN_KEY = 'cao_veiligheidsdomein';
const KNOWN_SECURITY_CAO_KEYS = [
  CAO_PB_KEY,
  CAO_EVENT_HOSPITALITY_SECURITY_KEY,
  CAO_TRAFFIC_CONTROLLERS_KEY,
  CAO_SAFETY_DOMAIN_KEY
];
const LOCAL_PAYROLL_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function normalizeCaoKey(value) {
  return String(value || '').trim();
}

function isKnownSecurityCaoKey(caoKey) {
  return KNOWN_SECURITY_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

function hasLocalPayrollRuntime(caoKey) {
  return LOCAL_PAYROLL_RUNTIME_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

function caoPbRuleId(number) {
  return `CAO-PB-2024-R${String(number).padStart(4, '0')}`;
}

function ruleIds(...numbers) {
  return numbers.map(number => caoPbRuleId(number));
}

function ruleRange(start, end, excluded = []) {
  const excludedSet = new Set(excluded);
  const ids = [];
  for (let number = start; number <= end; number++) {
    if (!excludedSet.has(number)) ids.push(caoPbRuleId(number));
  }
  return ids;
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort();
}

const LOCAL_RUNTIME_RULE_BINDINGS = {
  'resolveCaoApplicability.article_3_scope': {
    functions: ['resolveCaoApplicability', 'validateTaskPlanningContext', 'calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: ruleRange(227, 233)
  },
  'applyCaoContractRules.probation_and_probation_dismissal': {
    functions: ['applyCaoContractRules'],
    rule_ids: ruleIds(315, 316, 317, 321, 322)
  },
  'applyCaoContractRules.fulltime_parttime_contract_model_articles_10_11': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(309, 310, 337, 339, 342, 343, 345, 347, 358, 359)
  },
  'applyCaoContractRules.parttime_workload_change_articles_11_12': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      ...ruleRange(349, 365),
      ...ruleRange(367, 369),
      ...ruleIds(358, 359)
    ]
  },
  'applyCaoContractRules.contract_clauses_and_termination_article_9': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      ...ruleIds(236, 311),
      ...ruleRange(323, 335)
    ]
  },
  'applyCaoContractRules.call_agreement_article_13': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      ...ruleRange(372, 374),
      ...ruleIds(377, 378, 380),
      ...ruleRange(387, 394),
      ...ruleRange(396, 399)
    ]
  },
  'applyCaoContractRules.internship_article_14': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules'],
    rule_ids: [
      ...ruleRange(401, 405),
      ...ruleRange(407, 412),
      ...ruleIds(414, 415),
      ...ruleRange(417, 422)
    ]
  },
  'applyCaoContractRules.hired_worker_article_15': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ruleRange(423, 438)
  },
  'applyCaoContractRules.suspension_article_16': {
    functions: ['applyCaoContractRules', 'calculatePersonnelCosts'],
    rule_ids: [...ruleRange(445, 448), ...ruleIds(451)]
  },
  'applyCaoContractRules.contract_transfer_articles_18_20': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'calculatePersonnelCosts'],
    rule_ids: ruleRange(464, 545)
  },
  'validateCaoScheduleRules.roster_period_constraints': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [...ruleRange(547, 549), ...ruleRange(560, 713)]
  },
  'resolveCaoFunctionClassification.appendix_2_wage_scales': {
    functions: ['resolveCaoApplicability', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      ...ruleRange(714, 716),
      ...ruleIds(728, 729, 731, 733, 734),
      ...ruleRange(738, 747),
      ...ruleIds(1751, 1813)
    ]
  },
  'calculatePersonnelCosts.article_39_acting_function_allowance': {
    functions: ['resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: ruleRange(775, 783)
  },
  'calculateCaoYearEndBonus.article_38_year_end_bonus': {
    functions: ['calculatePersonnelCosts', 'calculateCaoYearEndBonus', 'queueCaoPayrollCorrections'],
    rule_ids: ruleRange(770, 773)
  },
  'calculatePersonnelCosts.article_25_general_reserve_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(605, 606)
  },
  'calculatePersonnelCosts.article_42_overtime_payroll': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(797)
  },
  'calculatePersonnelCosts.article_43_44_shift_change_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      ...ruleIds(576, 580, 585, 586, 606),
      ...ruleRange(799, 807)
    ]
  },
  'calculatePersonnelCosts.article_45_minimum_service_compensation': {
    functions: ['calculatePersonnelCosts', 'validateCaoScheduleRules', 'calculateCaoReimbursements'],
    rule_ids: ruleRange(810, 818)
  },
  'calculateCaoReimbursements.article_47_48_49_50': {
    functions: ['calculateCaoReimbursements'],
    rule_ids: ruleIds(855, 878, 880, 885, 890, 895, 900, 905, 1609)
  },
  'calculateCaoLeaveAndSickness.articles_59_65_66_67': {
    functions: ['calculateCaoLeaveAndSickness'],
    rule_ids: [
      ...ruleRange(999, 1006),
      ...ruleRange(1008, 1017),
      ...ruleIds(1019, 1022),
      ...ruleRange(1148, 1155),
      ...ruleRange(1157, 1163),
      ...ruleRange(1165, 1167),
      ...ruleRange(1172, 1184)
    ]
  }
};

const LOCAL_RUNTIME_RULE_ID_INDEX = Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)
  .reduce((acc, [key, binding]) => {
    for (const ruleId of uniqueSorted(binding.rule_ids)) {
      acc[ruleId] = {
        key,
        functions: uniqueSorted(binding.functions),
        rule_ids: uniqueSorted(binding.rule_ids)
      };
    }
    return acc;
  }, {});

function getLocalRuntimeBinding(rule) {
  return LOCAL_RUNTIME_RULE_ID_INDEX[rule?.rule_id] || null;
}

function normalizeDate(value) {
  return value ? String(value).slice(0, 10) : null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasAnyNeedle(value, needles) {
  const text = String(value || '').toLowerCase();
  return needles.some(needle => text.includes(needle));
}

function hasWageScales(config) {
  return Object.keys(config?.wage_scales || {}).length > 0 ||
    Object.keys(config?.wage_scales_detailed || {}).length > 0;
}

function hasPayPeriods(config) {
  const payPeriods = config?.pay_periods;
  if (!payPeriods) return false;
  if (Array.isArray(payPeriods)) return payPeriods.length > 0;
  if (typeof payPeriods === 'object') return Object.keys(payPeriods).length > 0;
  return false;
}

function getDeclaredCoverageSummary(config) {
  return config?.coverage_summary ||
    config?.rule_engine_metadata?.coverage_summary ||
    config?.source_coverage_summary ||
    {};
}

function getSourceCoverageMinimums(config) {
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const summary = getDeclaredCoverageSummary(config);
  const minimums = caoKey === CAO_PB_KEY
    ? { ...CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS }
    : { ...EMPTY_SOURCE_COVERAGE_MINIMUMS };
  const declaredTotal = numberOrNull(
    summary.expected_total_rules ??
    summary.total_atomic_rules ??
    summary.total_source_rules ??
    summary.total
  );
  if (declaredTotal && declaredTotal > minimums.total) minimums.total = declaredTotal;

  const byLevel = summary.expected_automation_level_counts ||
    summary.by_automation_level ||
    summary.automation_level_counts ||
    {};
  for (const key of ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation']) {
    const declared = numberOrNull(byLevel[key]);
    if (declared && declared > minimums[key]) minimums[key] = declared;
  }
  return minimums;
}

function countRulesByAutomationLevel(rules) {
  return rules.reduce((acc, rule) => {
    const key = rule.automation_level || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hasRuleSourceLocator(rule) {
  return Boolean(
    rule?.source_document_id ||
    rule?.source_pdf ||
    rule?.source_url ||
    rule?.source_reference ||
    rule?.document_url
  );
}

function hasRuleSourceHash(rule) {
  return Boolean(
    rule?.sha1 ||
    rule?.sha256 ||
    rule?.source_hash ||
    rule?.rule_hash ||
    rule?.rule_text_hash
  );
}

function summarizeSourceEvidenceGap(rule, message) {
  return {
    rule_id: rule.rule_id || 'unknown',
    domain: rule.domain || null,
    article: rule.article || null,
    automation_level: rule.automation_level || null,
    implementation_status: rule.implementation_status || 'MISSING',
    source_document_id: rule.source_document_id || null,
    source_pdf: rule.source_pdf || null,
    pdf_page_start: rule.pdf_page_start ?? null,
    pdf_page_end: rule.pdf_page_end ?? null,
    message
  };
}

function uniqueRuleIds(rules) {
  return new Set((Array.isArray(rules) ? rules : []).map(rule => rule.rule_id).filter(Boolean));
}

function duplicateRuleIds(rules) {
  const seen = new Set();
  const duplicates = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule.rule_id) continue;
    if (seen.has(rule.rule_id)) duplicates.add(rule.rule_id);
    seen.add(rule.rule_id);
  }
  return [...duplicates].sort();
}

function evaluateSourceCoverageCompleteness(config, rules) {
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const minimums = getSourceCoverageMinimums(config);
  const ruleIds = uniqueRuleIds(rules);
  const byAutomationLevel = countRulesByAutomationLevel(rules);
  const blockingFindings = [];
  const payrollCriticalMissingSourceLocator = [];
  const payrollCriticalMissingSourceHash = [];

  if (ruleIds.size < minimums.total) {
    blockingFindings.push({
      code: 'incomplete_source_rule_coverage',
      severity: 'critical',
      message: caoKey === CAO_PB_KEY
        ? `CAO-broncoverage is incompleet: ${ruleIds.size} unieke regels aanwezig, minimaal ${minimums.total} verwacht voor CAO PB 2024-2026.`
        : `CAO-broncoverage is incompleet: ${ruleIds.size} unieke regels aanwezig, minimaal ${minimums.total} verwacht voor ${caoKey}.`
    });
  }

  for (const key of ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation']) {
    const actual = byAutomationLevel[key] || 0;
    const expected = minimums[key] || 0;
    if (actual < expected) {
      blockingFindings.push({
        code: `incomplete_${key}_coverage`,
        severity: 'critical',
        message: `CAO-broncoverage voor ${key} is incompleet: ${actual} regels aanwezig, minimaal ${expected} verwacht.`
      });
    }
  }

  for (const rule of rules) {
    if (!isPayrollCriticalRule(rule)) continue;
    if (!hasRuleSourceLocator(rule)) {
      payrollCriticalMissingSourceLocator.push(summarizeSourceEvidenceGap(
        rule,
        'Payrollkritische regel mist source_document_id/source_pdf/source_url/source_reference; bronherkomst is niet audit-proof.'
      ));
    }
    if (!hasRuleSourceHash(rule)) {
      payrollCriticalMissingSourceHash.push(summarizeSourceEvidenceGap(
        rule,
        'Payrollkritische regel mist regelhash; wijzigingen in brontekst kunnen niet deterministisch worden bewezen.'
      ));
    }
  }

  if (payrollCriticalMissingSourceLocator.length > 0) {
    blockingFindings.push({
      code: 'incomplete_payroll_critical_source_locator',
      severity: 'critical',
      message: `${payrollCriticalMissingSourceLocator.length} payrollkritische CAO-regels missen een bronlocator; payroll-ready wordt geblokkeerd.`
    });
  }
  if (payrollCriticalMissingSourceHash.length > 0) {
    blockingFindings.push({
      code: 'incomplete_payroll_critical_source_hash',
      severity: 'critical',
      message: `${payrollCriticalMissingSourceHash.length} payrollkritische CAO-regels missen een regelhash; payroll-ready wordt geblokkeerd.`
    });
  }

  return {
    passed: blockingFindings.length === 0,
    unique_rule_ids: ruleIds.size,
    by_automation_level: byAutomationLevel,
    minimums,
    payroll_critical_source_evidence: {
      missing_source_locator_count: payrollCriticalMissingSourceLocator.length,
      missing_source_hash_count: payrollCriticalMissingSourceHash.length,
      missing_source_locator_rules: payrollCriticalMissingSourceLocator.slice(0, 100),
      missing_source_locator_truncated: payrollCriticalMissingSourceLocator.length > 100,
      missing_source_hash_rules: payrollCriticalMissingSourceHash.slice(0, 100),
      missing_source_hash_truncated: payrollCriticalMissingSourceHash.length > 100
    },
    blocking_findings: blockingFindings
  };
}

function stableForHash(value) {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableForHash(value[key]);
      return acc;
    }, {});
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function buildRuleRegistrySnapshot(config, rules) {
  const sourceCoverage = evaluateSourceCoverageCompleteness(config, rules || []);
  const duplicates = duplicateRuleIds(rules || []);
  const normalizedRules = (Array.isArray(rules) ? rules : [])
    .filter(rule => rule.rule_id)
    .map(rule => ({
      rule_id: rule.rule_id,
      cao_key: rule.cao_key || null,
      version_label: rule.version_label || null,
      source_pdf: rule.source_pdf || null,
      source_document_id: rule.source_document_id || null,
      source_url: rule.source_url || null,
      document_url: rule.document_url || null,
      source_reference: rule.source_reference || null,
      pdf_page_start: rule.pdf_page_start ?? null,
      pdf_page_end: rule.pdf_page_end ?? null,
      source_page_label: rule.source_page_label || null,
      source_line_start: rule.source_line_start ?? null,
      source_line_end: rule.source_line_end ?? null,
      source_paragraph: rule.source_paragraph || null,
      source_anchor: rule.source_anchor || null,
      sha1: rule.sha1 || null,
      sha256: rule.sha256 || null,
      source_hash: rule.source_hash || null,
      rule_hash: rule.rule_hash || null,
      rule_text_hash: rule.rule_text_hash || null,
      hash_algorithm: rule.hash_algorithm || null,
      source_evidence: stableForHash(rule.source_evidence || null),
      source_evidence_confidence: rule.source_evidence_confidence || null,
      domain: rule.domain || null,
      impact: rule.impact || null,
      automation_level: rule.automation_level || null,
      implementation_status: rule.implementation_status || null,
      manual_review_required: rule.manual_review_required === true,
      calculation_policy: rule.calculation_policy || null,
      runtime_binding_status: rule.runtime_binding_status || null,
      runtime_binding_key: rule.runtime_binding_key || null,
      runtime_binding_functions: Array.isArray(rule.runtime_binding_functions)
        ? [...rule.runtime_binding_functions].sort()
        : [],
      implemented_in: Array.isArray(rule.implemented_in)
        ? [...rule.implemented_in].sort()
        : [],
      tests: stableForHash(rule.tests || null),
      rule_text: rule.rule_text || null,
      rule_text_summary: rule.rule_text_summary || null
    }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  const duplicateFindings = duplicates.length > 0
    ? [{
      code: 'duplicate_rule_ids_in_registry',
      severity: 'critical',
      message: `${duplicates.length} CAORule rule_id's komen dubbel voor binnen dezelfde configuratie.`
    }]
    : [];
  const canonicalJson = JSON.stringify(stableForHash(normalizedRules));
  const verifiedAt = new Date().toISOString();

  return {
    passed: sourceCoverage.passed && duplicateFindings.length === 0,
    fingerprint: await sha256Hex(canonicalJson),
    fingerprint_algorithm: 'sha256',
    fingerprint_rule_count: normalizedRules.length,
    expected_unique_rule_count: sourceCoverage.minimums.total,
    persisted_unique_rule_count: sourceCoverage.unique_rule_ids,
    verified_at: verifiedAt,
    source_coverage: sourceCoverage,
    duplicate_rule_ids: duplicates.slice(0, 100),
    duplicate_rule_ids_truncated: duplicates.length > 100,
    blocking_findings: [
      ...duplicateFindings,
      ...sourceCoverage.blocking_findings
    ]
  };
}

function mergeRegistrySnapshotIntoGate(gate, registrySnapshot) {
  const registryBlocking = registrySnapshot.blocking_findings || [];
  const mergedFindings = [
    ...registryBlocking,
    ...(gate.blocking_findings || [])
  ];
  const dedupedFindings = [];
  const seenFindingKeys = new Set();
  for (const finding of mergedFindings) {
    const key = `${finding.code || 'unknown'}:${finding.message || ''}`;
    if (seenFindingKeys.has(key)) continue;
    seenFindingKeys.add(key);
    dedupedFindings.push(finding);
  }
  const passed = gate.passed === true && registrySnapshot.passed === true;
  let status = gate.status;
  if (!passed) {
    if (dedupedFindings.some(f => f.code === 'unsupported_cao_runtime')) status = 'blocked_unsupported_cao_runtime';
    else if (dedupedFindings.some(f => f.code === 'missing_effective_date')) status = 'blocked_missing_effective_date';
    else if (dedupedFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
    else if (
      dedupedFindings.some(f => String(f.code || '').startsWith('incomplete_')) ||
      dedupedFindings.some(f => f.code === 'duplicate_rule_ids_in_registry')
    ) status = 'blocked_incomplete_source_coverage';
    else if (dedupedFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
    else if (gate.status === 'ready') status = 'blocked_incomplete_runtime_rules';
  }
  return {
    ...gate,
    passed,
    status,
    persisted_rule_registry: registrySnapshot,
    blocking_findings: dedupedFindings
  };
}

function isReferenceOnly(rule) {
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const implementationStatus = String(rule.implementation_status || '').toUpperCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  return calculationPolicy === 'not_payroll' ||
    (['reference', 'reference_or_policy'].includes(automationLevel) && implementationStatus === 'REFERENCE');
}

function isPayrollCriticalRule(rule) {
  if (isReferenceOnly(rule)) return false;
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  return calculationPolicy === 'automatic' ||
    automationLevel === 'automatic_or_calculation' ||
    automationLevel === 'validation_or_policy' ||
    hasAnyNeedle(rule.domain, PAYROLL_CRITICAL_DOMAINS) ||
    hasAnyNeedle(rule.impact, ['payroll', 'calculation', 'planning', 'validation']) ||
    hasAnyNeedle(rule.rule_id, CRITICAL_RULE_ID_NEEDLES);
}

function hasRuntimeBinding(rule) {
  return Boolean(getLocalRuntimeBinding(rule));
}

function hasRuntimeBindingMetadata(rule) {
  return hasRuntimeBinding(rule) ||
    !!rule.runtime_binding_key ||
    (Array.isArray(rule.runtime_binding_functions) && rule.runtime_binding_functions.length > 0);
}

function runtimeBindingStatusForSummary(rule) {
  if (hasRuntimeBinding(rule)) return 'verified_local_runtime';
  if (hasRuntimeBindingMetadata(rule)) {
    return rule.runtime_binding_status === 'verified_local_runtime'
      ? 'persisted_verified_without_local_index'
      : rule.runtime_binding_status || 'unverified_runtime_metadata';
  }
  return rule.runtime_binding_status || 'missing_local_runtime';
}

function runtimeBindingKeyForSummary(rule) {
  return getLocalRuntimeBinding(rule)?.key || rule.runtime_binding_key || null;
}

function runtimeBindingFunctionsForSummary(rule) {
  const localBinding = getLocalRuntimeBinding(rule);
  if (localBinding) return localBinding.functions || [];
  return Array.isArray(rule.runtime_binding_functions) ? rule.runtime_binding_functions : [];
}

function isPositiveTestEvidence(value, key = '') {
  const normalizedKey = String(key || '').toLowerCase();
  const positiveEvidenceKey = /^(passed|pass|success|successful|verified|coverage_verified|ok|green)$/.test(normalizedKey);
  const negativeEvidenceKey = /^(failed|fail|todo|pending|missing|skipped|skip|unknown|error)$/.test(normalizedKey);
  const descriptiveKey = /^(name|title|description|note|comment|source|url|file|path)$/.test(normalizedKey);

  if (value === true) return normalizedKey === '' || positiveEvidenceKey;
  if (value === false || value === null || value === undefined || value === '') return false;
  if (negativeEvidenceKey) return false;
  if (Array.isArray(value)) return value.some(item => isPositiveTestEvidence(item));
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (/(not\s+pass|fail|failed|todo|pending|missing|skip|skipped|unknown|error)/.test(normalized)) return false;
    if (descriptiveKey) return false;
    return /^(pass|passed|success|successful|verified|ok|green)$/.test(normalized) ||
      /\b(passed|success|successful|verified|ok|green)\b/.test(normalized);
  }
  if (typeof value !== 'object') return false;

  const directStatus = String(value.status || value.result || value.outcome || '').toLowerCase();
  if (['passed', 'pass', 'success', 'successful', 'verified', 'ok', 'green'].includes(directStatus)) return true;
  if (['failed', 'fail', 'todo', 'pending', 'missing', 'skipped', 'skip', 'unknown', 'error'].includes(directStatus)) return false;
  if (value.passed === true || value.success === true || value.verified === true || value.coverage_verified === true) return true;
  if (value.passed === false || value.success === false || value.verified === false || value.coverage_verified === false) return false;

  return Object.entries(value).some(([entryKey, entryValue]) => isPositiveTestEvidence(entryValue, entryKey));
}

function hasVerifiedTestEvidence(rule) {
  return isPositiveTestEvidence(rule?.tests);
}

function countBy(collection, keyFn) {
  return collection.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeRule(rule, extra = {}) {
  const localBinding = getLocalRuntimeBinding(rule);
  return {
    rule_id: rule.rule_id || 'unknown',
    domain: rule.domain || null,
    article: rule.article || null,
    automation_level: rule.automation_level || null,
    implementation_status: rule.implementation_status || 'MISSING',
    manual_review_required: rule.manual_review_required === true,
    runtime_binding_status: runtimeBindingStatusForSummary(rule),
    runtime_binding_key: runtimeBindingKeyForSummary(rule),
    runtime_binding_functions: runtimeBindingFunctionsForSummary(rule),
    local_runtime_binding_source: localBinding ? 'audit_local_runtime_index' : null,
    implemented_in: rule.implemented_in || [],
    risk_level: rule.risk_level || null,
    ...extra
  };
}

function evaluateLocalRuntimeBindingCoverage(rules, maxOpenRules) {
  const persistedRuleIds = uniqueRuleIds(rules);
  const bindingSummaries = [];
  const allMissingRuleIds = [];
  let boundRuleCount = 0;
  let presentRuleCount = 0;

  for (const [key, binding] of Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)) {
    const ruleIdsForBinding = uniqueSorted(binding.rule_ids);
    const missingRuleIds = ruleIdsForBinding.filter(ruleId => !persistedRuleIds.has(ruleId));
    boundRuleCount += ruleIdsForBinding.length;
    presentRuleCount += ruleIdsForBinding.length - missingRuleIds.length;
    allMissingRuleIds.push(...missingRuleIds);
    bindingSummaries.push({
      key,
      functions: uniqueSorted(binding.functions),
      bound_rule_count: ruleIdsForBinding.length,
      present_rule_count: ruleIdsForBinding.length - missingRuleIds.length,
      missing_rule_count: missingRuleIds.length,
      missing_rule_ids: missingRuleIds.slice(0, maxOpenRules),
      missing_rule_ids_truncated: missingRuleIds.length > maxOpenRules
    });
  }

  const missingRuleIds = uniqueSorted(allMissingRuleIds);
  return {
    local_runtime_binding_keys: Object.keys(LOCAL_RUNTIME_RULE_BINDINGS).sort(),
    local_runtime_binding_count: Object.keys(LOCAL_RUNTIME_RULE_BINDINGS).length,
    local_runtime_bound_rule_count: boundRuleCount,
    local_runtime_bound_rules_present_in_registry: presentRuleCount,
    local_runtime_bound_rules_missing_from_registry_count: missingRuleIds.length,
    local_runtime_bound_rules_missing_from_registry: missingRuleIds.slice(0, maxOpenRules),
    local_runtime_bound_rules_missing_from_registry_truncated: missingRuleIds.length > maxOpenRules,
    bindings: bindingSummaries
  };
}

function evaluateCoverageGate(config, rules, options = {}) {
  const maxOpenRules = Math.max(1, Number(options.max_open_rules || 100));
  const activeConfigurationCandidates = Array.isArray(options.active_configuration_candidates)
    ? options.active_configuration_candidates
    : [];
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const sourceCoverage = evaluateSourceCoverageCompleteness(config, rules);
  const localRuntimeCoverage = evaluateLocalRuntimeBindingCoverage(rules, maxOpenRules);
  const counts = {
    total: rules.length,
    unique_rule_ids: sourceCoverage.unique_rule_ids,
    by_automation_level: sourceCoverage.by_automation_level,
    source_coverage_minimums: sourceCoverage.minimums,
    source_coverage_passed: sourceCoverage.passed,
    implemented: 0,
    partial: 0,
    missing: 0,
    reference: 0,
    unknown: 0,
    manual_review_required: 0,
    payroll_critical: 0,
    payroll_critical_open: 0,
    runtime_bound: 0,
    runtime_missing: 0,
    implemented_without_runtime_binding: 0,
    implemented_without_test_evidence: 0,
    partial_without_manual_review: 0,
    payroll_critical_missing_rule_text: 0,
    missing_rule_text: 0,
    local_runtime_binding_count: localRuntimeCoverage.local_runtime_binding_count,
    local_runtime_bound_rule_count: localRuntimeCoverage.local_runtime_bound_rule_count,
    local_runtime_bound_rules_present_in_registry: localRuntimeCoverage.local_runtime_bound_rules_present_in_registry,
    local_runtime_bound_rules_missing_from_registry: localRuntimeCoverage.local_runtime_bound_rules_missing_from_registry_count
  };

  const openCriticalRules = [];
  const implementedWithoutRuntimeBinding = [];
  const implementedWithoutTestEvidence = [];
  const partialWithoutManualReview = [];
  const payrollCriticalMissingRuleText = [];
  const missingRuleText = [];

  for (const rule of rules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    const runtimeBound = hasRuntimeBinding(rule);
    const runtimeMetadataPresent = hasRuntimeBindingMetadata(rule);
    const testEvidence = hasVerifiedTestEvidence(rule);
    const payrollCritical = isPayrollCriticalRule(rule);
    const missingText = !rule.rule_text && !rule.rule_text_summary;

    if (status === 'IMPLEMENTED') counts.implemented++;
    else if (status === 'PARTIAL') counts.partial++;
    else if (status === 'MISSING') counts.missing++;
    else if (status === 'REFERENCE') counts.reference++;
    else counts.unknown++;

    if (rule.manual_review_required === true) counts.manual_review_required++;
    if (missingText) {
      counts.missing_rule_text++;
      missingRuleText.push(rule.rule_id || 'unknown');
    }

    if (!payrollCritical) continue;

    counts.payroll_critical++;
    if (runtimeBound) counts.runtime_bound++;
    else counts.runtime_missing++;

    const implementedNoRuntime = status === 'IMPLEMENTED' && !runtimeBound;
    const implementedNoTests = status === 'IMPLEMENTED' && !testEvidence;
    const partialNoManualReview = status === 'PARTIAL' && rule.manual_review_required !== true;
    const payrollCriticalNoText = missingText;

    if (payrollCriticalNoText) {
      counts.payroll_critical_missing_rule_text++;
      payrollCriticalMissingRuleText.push(summarizeRule(rule, {
        message: 'Payrollkritische regel mist zowel rule_text als rule_text_summary; CAO-broninterpretatie kan niet worden bewezen.'
      }));
    }

    if (implementedNoRuntime) {
      counts.implemented_without_runtime_binding++;
      implementedWithoutRuntimeBinding.push(summarizeRule(rule, {
        has_runtime_binding_metadata: runtimeMetadataPresent,
        message: 'Rule claims IMPLEMENTED but has no verified local Base44 runtime binding.'
      }));
    }
    if (implementedNoTests) {
      counts.implemented_without_test_evidence++;
      implementedWithoutTestEvidence.push(summarizeRule(rule, {
        message: 'Rule claims IMPLEMENTED but has no verified passing test evidence recorded in CAORule.tests.'
      }));
    }
    if (partialNoManualReview) {
      counts.partial_without_manual_review++;
      partialWithoutManualReview.push(summarizeRule(rule, {
        message: 'Rule is PARTIAL but manual_review_required is not true.'
      }));
    }

    if (
      status !== 'IMPLEMENTED' ||
      rule.manual_review_required === true ||
      implementedNoRuntime ||
      implementedNoTests ||
      partialNoManualReview ||
      payrollCriticalNoText
    ) {
      counts.payroll_critical_open++;
      openCriticalRules.push(summarizeRule(rule, {
        has_runtime_binding: runtimeBound,
        has_runtime_binding_metadata: runtimeMetadataPresent,
        has_test_evidence: testEvidence,
        has_verified_test_evidence: testEvidence
      }));
    }
  }

  const blockingFindings = [];
  if (!hasLocalPayrollRuntime(caoKey)) {
    blockingFindings.push({
      code: 'unsupported_cao_runtime',
      severity: 'critical',
      message: `CAO ${caoKey} kan worden opgeslagen als owner-approved bronconfiguratie, maar payroll/planning runtime is lokaal nog niet geimplementeerd en geverifieerd.`
    });
  }
  blockingFindings.push(...sourceCoverage.blocking_findings);
  if (!config?.valid_from) {
    blockingFindings.push({
      code: 'missing_effective_date',
      severity: 'critical',
      message: 'Active CAOConfiguration.valid_from ontbreekt; payroll kan zonder ingangsdatum niet veilig historisch rekenen.'
    });
  }
  if (config?.valid_from && config?.valid_until && config.valid_until < config.valid_from) {
    blockingFindings.push({
      code: 'invalid_cao_validity_range',
      severity: 'critical',
      message: `Active CAOConfiguration heeft een ongeldig geldigheidsbereik: valid_until (${config.valid_until}) ligt voor valid_from (${config.valid_from}).`
    });
  }
  if (activeConfigurationCandidates.length > 1) {
    blockingFindings.push({
      code: 'ambiguous_active_cao_configurations',
      severity: 'critical',
      message: `${activeConfigurationCandidates.length} actieve CAO-configuraties overlappen op de referentiedatum; payroll mag niet gokken welke configuratie geldt.`,
      candidate_configuration_ids: activeConfigurationCandidates.map(candidate => candidate.id).filter(Boolean)
    });
  }
  if (rules.length === 0) {
    blockingFindings.push({
      code: 'missing_rules',
      severity: 'critical',
      message: 'CAORule registry is leeg; CAO-regeldekking kan niet worden bewezen.'
    });
  }
  if (!hasWageScales(config)) {
    blockingFindings.push({
      code: 'missing_wage_scales',
      severity: 'critical',
      message: 'Loontabellen ontbreken; loonberekening mag niet payroll-ready zijn.'
    });
  }
  if (!hasPayPeriods(config)) {
    blockingFindings.push({
      code: 'missing_pay_periods',
      severity: 'high',
      message: 'Loonperiodetabel ontbreekt; payrollcorrecties en historische runs kunnen niet betrouwbaar worden afgebakend.'
    });
  }
  if (counts.payroll_critical_open > 0) {
    blockingFindings.push({
      code: 'open_payroll_critical_rules',
      severity: 'critical',
      message: `${counts.payroll_critical_open} payrollkritische CAO-regels zijn niet volledig runtime- en testgedekt.`
    });
  }
  if (localRuntimeCoverage.local_runtime_bound_rules_missing_from_registry_count > 0) {
    blockingFindings.push({
      code: 'incomplete_local_runtime_binding_registry',
      severity: 'critical',
      message: `${localRuntimeCoverage.local_runtime_bound_rules_missing_from_registry_count} lokaal geimplementeerde CAO-regelbindingen ontbreken in de actieve CAORule registry; runtime-dekking kan niet audit-proof worden bewezen.`
    });
  }
  if (implementedWithoutRuntimeBinding.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_runtime_binding',
      severity: 'critical',
      message: `${implementedWithoutRuntimeBinding.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen een lokale runtime-binding.`
    });
  }
  if (implementedWithoutTestEvidence.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_test_evidence',
      severity: 'high',
      message: `${implementedWithoutTestEvidence.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen geverifieerd testbewijs.`
    });
  }
  if (partialWithoutManualReview.length > 0) {
    blockingFindings.push({
      code: 'partial_rules_without_manual_review',
      severity: 'high',
      message: `${partialWithoutManualReview.length} payrollkritische PARTIAL-regels missen manual_review_required=true.`
    });
  }
  if (payrollCriticalMissingRuleText.length > 0) {
    blockingFindings.push({
      code: 'incomplete_payroll_critical_rule_text',
      severity: 'critical',
      message: `${payrollCriticalMissingRuleText.length} payrollkritische CAO-regels missen rule_text en rule_text_summary; broninterpretatie is niet audit-proof.`
    });
  }

  let status = 'ready';
  if (blockingFindings.some(f => f.code === 'unsupported_cao_runtime')) status = 'blocked_unsupported_cao_runtime';
  else if (blockingFindings.some(f => f.code === 'missing_effective_date')) status = 'blocked_missing_effective_date';
  else if (blockingFindings.some(f => f.code === 'invalid_cao_validity_range' || f.code === 'ambiguous_active_cao_configurations')) status = 'blocked_ambiguous_effective_date';
  else if (blockingFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
  else if (blockingFindings.some(f => String(f.code || '').startsWith('incomplete_'))) status = 'blocked_incomplete_source_coverage';
  else if (blockingFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
  else if (counts.payroll_critical_open > 0) status = 'blocked_incomplete_runtime_rules';
  else if (counts.manual_review_required > 0) status = 'manual_review_required';

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    source_coverage: sourceCoverage,
    local_runtime_coverage: localRuntimeCoverage,
    by_domain: countBy(rules, rule => rule.domain),
    by_automation_level: countBy(rules, rule => rule.automation_level),
    by_implementation_status: countBy(rules, rule => String(rule.implementation_status || 'MISSING').toUpperCase()),
    by_runtime_binding_status: countBy(rules, rule => runtimeBindingStatusForSummary(rule)),
    by_runtime_binding_key: countBy(rules, rule => runtimeBindingKeyForSummary(rule)),
    has_local_payroll_runtime: hasLocalPayrollRuntime(caoKey),
    local_runtime_binding_keys: localRuntimeCoverage.local_runtime_binding_keys,
    blocking_findings: blockingFindings,
    open_payroll_critical_rules: openCriticalRules.slice(0, maxOpenRules),
    open_payroll_critical_rules_truncated: openCriticalRules.length > maxOpenRules,
    implemented_without_runtime_binding_rules: implementedWithoutRuntimeBinding.slice(0, maxOpenRules),
    implemented_without_runtime_binding_truncated: implementedWithoutRuntimeBinding.length > maxOpenRules,
    implemented_without_test_evidence_rules: implementedWithoutTestEvidence.slice(0, maxOpenRules),
    implemented_without_test_evidence_truncated: implementedWithoutTestEvidence.length > maxOpenRules,
    partial_without_manual_review_rules: partialWithoutManualReview.slice(0, maxOpenRules),
    partial_without_manual_review_truncated: partialWithoutManualReview.length > maxOpenRules,
    payroll_critical_missing_rule_text_rules: payrollCriticalMissingRuleText.slice(0, maxOpenRules),
    payroll_critical_missing_rule_text_truncated: payrollCriticalMissingRuleText.length > maxOpenRules,
    missing_rule_text_rule_ids: missingRuleText.slice(0, maxOpenRules),
    missing_rule_text_truncated: missingRuleText.length > maxOpenRules
  };
}

function activeConfigurationCandidates(configs, referenceDate) {
  const ref = normalizeDate(referenceDate || new Date().toISOString());
  return configs
    .filter(config => config.status === 'active' || config.is_active === true)
    .filter(config => !config.valid_from || config.valid_from <= ref)
    .filter(config => !config.valid_until || config.valid_until >= ref)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));
}

function chooseActiveConfiguration(configs, referenceDate) {
  return activeConfigurationCandidates(configs, referenceDate)[0] || null;
}

async function loadRulesForConfiguration(base44, caoKey, config) {
  if (!config?.id) {
    const rules = await base44.asServiceRole.entities.CAORule.filter({ cao_key: caoKey });
    return {
      rules: (rules || []).filter(rule => !rule.cao_configuration_id),
      scope: 'unscoped_legacy_rules'
    };
  }

  const scopedRules = await base44.asServiceRole.entities.CAORule.filter({
    cao_key: caoKey,
    cao_configuration_id: config.id
  });

  return {
    rules: scopedRules || [],
    scope: 'cao_configuration_id'
  };
}

function bearerToken(req) {
  const auth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function verifyInternalSecret(req, body) {
  const expected = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET') ||
    Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
  if (!expected || expected.length < 16) {
    return { ok: false, status: 500, error: 'Internal CAO audit secret is not configured.' };
  }
  const provided = bearerToken(req) ||
    body.audit_secret ||
    body.sync_trigger_secret ||
    body.shared_secret;
  if (provided !== expected) {
    return { ok: false, status: 403, error: 'Forbidden: owner/internal CAO audit secret required.' };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const secretCheck = verifyInternalSecret(req, body);
    if (!secretCheck.ok) {
      return Response.json({ success: false, error: secretCheck.error }, { status: secretCheck.status });
    }

    const caoKey = normalizeCaoKey(body.cao_key || CAO_PB_KEY);
    if (!isKnownSecurityCaoKey(caoKey)) {
      return Response.json({
        success: false,
        error: `Onbekende CAO sleutel: ${caoKey || '(leeg)'}.`,
        known_cao_keys: KNOWN_SECURITY_CAO_KEYS
      }, { status: 400 });
    }

    const referenceDate = normalizeDate(body.reference_date || new Date().toISOString());
    const persistResult = body.persist_result === true;
    const maxOpenRules = Math.min(500, Math.max(25, Number(body.max_open_rules || 100)));

    const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({ cao_key: caoKey });
    const activeCandidates = activeConfigurationCandidates(configs || [], referenceDate);
    const activeConfig = activeCandidates[0] || null;
    const auditConfig = activeConfig || { cao_key: caoKey };
    const ruleLoad = await loadRulesForConfiguration(base44, caoKey, activeConfig);
    const rules = ruleLoad.rules;
    const runtimeGate = evaluateCoverageGate(auditConfig, rules || [], {
      max_open_rules: maxOpenRules,
      active_configuration_candidates: activeCandidates
    });
    const registrySnapshot = await buildRuleRegistrySnapshot(auditConfig, rules || []);
    const gate = mergeRegistrySnapshotIntoGate(runtimeGate, registrySnapshot);

    const requestedPayrollReady = activeConfig?.is_payroll_ready === true;
    const isPayrollReady = requestedPayrollReady && gate.passed;
    const payrollReadinessStatus = isPayrollReady
      ? 'ready'
      : requestedPayrollReady
      ? gate.status
      : gate.passed
      ? 'owner_not_marked_ready'
      : gate.status;

    if (persistResult && activeConfig?.id) {
      await base44.asServiceRole.entities.CAOConfiguration.update(activeConfig.id, {
        is_payroll_ready: isPayrollReady,
        payroll_readiness_status: payrollReadinessStatus,
        payroll_readiness_checked_at: gate.checked_at,
        payroll_readiness_gate: gate,
        rule_registry_fingerprint: registrySnapshot.fingerprint,
        rule_registry_rule_count: registrySnapshot.persisted_unique_rule_count,
        rule_registry_verified_at: registrySnapshot.verified_at,
        rule_registry_snapshot: registrySnapshot,
        coverage_summary: {
          ...(activeConfig.coverage_summary || {}),
          last_owner_internal_audit: {
            checked_at: gate.checked_at,
            reference_date: referenceDate,
            rules_scope: ruleLoad.scope,
            audited_rule_count: rules.length,
            status: payrollReadinessStatus,
            passed: gate.passed,
            counts: gate.counts,
            blocking_findings: gate.blocking_findings,
            persisted_rule_registry: {
              fingerprint: registrySnapshot.fingerprint,
              fingerprint_algorithm: registrySnapshot.fingerprint_algorithm,
              fingerprint_rule_count: registrySnapshot.fingerprint_rule_count,
              persisted_unique_rule_count: registrySnapshot.persisted_unique_rule_count,
              expected_unique_rule_count: registrySnapshot.expected_unique_rule_count,
              verified_at: registrySnapshot.verified_at,
              passed: registrySnapshot.passed
            }
          }
        }
      });
    }

    return Response.json({
      success: true,
      cao_key: caoKey,
      reference_date: referenceDate,
      active_configuration_id: activeConfig?.id || null,
      active_configuration_revision: activeConfig?.cloudflare_revision || null,
      active_configuration_candidate_ids: activeCandidates.map(config => config.id).filter(Boolean),
      requested_payroll_ready: requestedPayrollReady,
      is_payroll_ready: isPayrollReady,
      payroll_readiness_status: payrollReadinessStatus,
      persisted_to_active_configuration: persistResult && !!activeConfig?.id,
      rules_scope: ruleLoad.scope,
      audited_rule_count: rules.length,
      rule_registry_fingerprint: registrySnapshot.fingerprint,
      rule_registry_rule_count: registrySnapshot.persisted_unique_rule_count,
      rule_registry_verified_at: registrySnapshot.verified_at,
      coverage_gate: gate
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
});

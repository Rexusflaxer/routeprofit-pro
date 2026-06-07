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

const CAO_SOURCE_TYPES = [
  'cao_page',
  'official_webpage',
  'news_page',
  'news_update',
  'cao_pdf',
  'wage_table_pdf',
  'wage_table_xlsx',
  'pay_periods_pdf',
  'pay_periods_xlsx',
  'fonds_cao_pdf',
  'faq_page',
  'question_answer_page',
  'sociale_commissie_page',
  'sociale_commissie_pdf',
  'sociale_commissie_decision_pdf',
  'protocol_pdf',
  'appendix_pdf',
  'ministerial_registration',
  'other'
];

const CAO_PB_REQUIRED_SOURCE_FAMILIES = [
  {
    key: 'cao_landing_page',
    label: 'CAO-overzichtspagina beveiligingsbranche',
    source_types: ['cao_page', 'official_webpage'],
    keywords: ['beveiligingsbranche.nl/cao', '/cao/'],
    minimum_count: 1
  },
  {
    key: 'main_cao_pdf',
    label: 'Hoofd-CAO Particuliere Beveiliging PDF',
    source_types: ['cao_pdf'],
    keywords: ['cao-pb', 'particuliere beveiliging', 'met-omslag'],
    minimum_count: 1
  },
  {
    key: 'wage_tables',
    label: 'Loontabellen',
    source_types: ['wage_table_pdf', 'wage_table_xlsx'],
    keywords: ['loontabel', 'loontabellen', 'loongebouw', 'wage table'],
    minimum_count: 1
  },
  {
    key: 'pay_periods',
    label: 'Loonperiodetabellen',
    source_types: ['pay_periods_pdf', 'pay_periods_xlsx'],
    keywords: ['loonperiode', 'loonperioden', 'loonperiodes', 'pay period'],
    minimum_count: 1
  },
  {
    key: 'fonds_cao',
    label: 'Fonds-CAO / SFPB-bronnen',
    source_types: ['fonds_cao_pdf'],
    keywords: ['fonds-cao', 'fonds cao', 'sociaalfondsbeveiliging', 'sociaal fonds beveiliging', 'sfpb'],
    minimum_count: 1
  },
  {
    key: 'question_answer',
    label: 'Vraagbaak / FAQ',
    source_types: ['faq_page', 'question_answer_page'],
    keywords: ['vraagbaak', 'veelgestelde', 'faq', 'q&a'],
    minimum_count: 1
  },
  {
    key: 'social_committee',
    label: 'Sociale commissie / uitspraken',
    source_types: ['sociale_commissie_page', 'sociale_commissie_pdf', 'sociale_commissie_decision_pdf'],
    keywords: ['sociale commissie', 'sociale-commissie', 'uitspraak', 'uitspraken'],
    minimum_count: 1
  },
  {
    key: 'news_updates',
    label: 'CAO-nieuws en losse updates',
    source_types: ['news_page', 'news_update'],
    keywords: ['nieuws', 'news', 'update'],
    minimum_count: 1
  }
];

const OFFICIAL_CAO_SOURCE_HOSTS = [
  'beveiligingsbranche.nl',
  'www.beveiligingsbranche.nl',
  'sociaalfondsbeveiliging.nl',
  'www.sociaalfondsbeveiliging.nl',
  'sfpb.nl',
  'www.sfpb.nl',
  'cao.minszw.nl',
  'www.uitvoeringarbeidsvoorwaardenwetgeving.nl'
];

function normalizeCaoKey(value) {
  return String(value || '').trim();
}

function isKnownSecurityCaoKey(caoKey) {
  return KNOWN_SECURITY_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

function hasLocalPayrollRuntime(caoKey) {
  return LOCAL_PAYROLL_RUNTIME_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'ja', '1'].includes(normalized)) return true;
  if (['false', 'no', 'nee', '0'].includes(normalized)) return false;
  return null;
}

function inferOfficialSource(url) {
  try {
    const host = typeof URL === 'function'
      ? new URL(url).hostname.toLowerCase()
      : String(url || '').replace(/^[a-z]+:\/\//i, '').split('/')[0].toLowerCase();
    return OFFICIAL_CAO_SOURCE_HOSTS.some(officialHost => host === officialHost || host.endsWith(`.${officialHost}`));
  } catch (_) {
    return false;
  }
}

function normalizeCaoSourceType(value, doc = {}, defaultSourceType = 'other') {
  const raw = String(value || '').trim().toLowerCase();
  const alias = {
    page: 'cao_page',
    cao: 'cao_pdf',
    cao_document: 'cao_pdf',
    cao_source: 'cao_pdf',
    wage_table: 'wage_table_pdf',
    wage_table_pdf: 'wage_table_pdf',
    wage_table_xlsx: 'wage_table_xlsx',
    loontabel: 'wage_table_pdf',
    loongebouw: 'wage_table_pdf',
    pay_periods: 'pay_periods_pdf',
    pay_periods_pdf: 'pay_periods_pdf',
    pay_periods_xlsx: 'pay_periods_xlsx',
    loonperioden: 'pay_periods_pdf',
    loonperiodes: 'pay_periods_pdf',
    fonds_cao: 'fonds_cao_pdf',
    faq: 'faq_page',
    vraagbaak: 'question_answer_page',
    social_committee: 'sociale_commissie_pdf',
    sociale_commissie: 'sociale_commissie_pdf',
    decision: 'sociale_commissie_decision_pdf',
    uitspraak: 'sociale_commissie_decision_pdf',
    news: 'news_page',
    nieuws: 'news_page',
    protocol: 'protocol_pdf',
    appendix: 'appendix_pdf',
    bijlage: 'appendix_pdf',
    registration: 'ministerial_registration'
  };
  const candidate = alias[raw] || raw;
  if (CAO_SOURCE_TYPES.includes(candidate)) return candidate;

  const text = `${doc.title || ''} ${doc.url || ''} ${doc.source_category || ''}`.toLowerCase();
  if (/loontabel|wage[-_ ]?table|loongebouw/.test(text)) return /\.xlsx?(\?|$)/.test(text) ? 'wage_table_xlsx' : 'wage_table_pdf';
  if (/loonperiode|loonperioden|pay[-_ ]?period/.test(text)) return /\.xlsx?(\?|$)/.test(text) ? 'pay_periods_xlsx' : 'pay_periods_pdf';
  if (/fonds[-_ ]?cao|sociaal[-_ ]?fonds|sfpb/.test(text)) return 'fonds_cao_pdf';
  if (/vraagbaak|faq|veelgestelde/.test(text)) return 'question_answer_page';
  if (/sociale[-_ ]?commissie|uitspraak/.test(text)) return /pdf/.test(text) ? 'sociale_commissie_decision_pdf' : 'sociale_commissie_page';
  if (/nieuws|news|update/.test(text)) return 'news_page';
  if (/cao/.test(text) && /pdf/.test(text)) return 'cao_pdf';
  if (/cao/.test(text)) return 'cao_page';
  return CAO_SOURCE_TYPES.includes(defaultSourceType) ? defaultSourceType : 'other';
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
    rule_ids: ruleIds(313, 314, 315, 316, 317, 318, 319, 320, 321, 322)
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
      ...ruleIds(236, 311, 312),
      ...ruleRange(323, 335)
    ]
  },
  'applyCaoContractRules.call_agreement_article_13': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      ...ruleIds(371),
      ...ruleRange(372, 374),
      ...ruleIds(376, 377, 378, 380),
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
      ...ruleIds(1751, 1810, 1811, 1812, 1813, 1814, 1837, 1838, 1840)
    ]
  },
  'applyCaoContractRules.appendix_2_function_qualification_requirements': {
    functions: [
      'applyCaoContractRules',
      'resolvePersonnelContractForService',
      'validateCaoScheduleRules',
      'calculatePersonnelCosts',
      'calculateRoutePersonnelCosts'
    ],
    rule_ids: [
      ...ruleRange(1752, 1760),
      ...ruleRange(1763, 1808),
      ...ruleRange(1815, 1836)
    ]
  },
  'calculatePersonnelCosts.article_35_36_wage_promotion': {
    functions: ['applyCaoContractRules', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(748, 749, 750, 751, 752, 753, 755, 757)
  },
  'calculatePersonnelCosts.article_37_wage_increases': {
    functions: ['calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: ruleIds(760, 761, 762, 764, 765, 766)
  },
  'calculatePersonnelCosts.article_39_acting_function_allowance': {
    functions: ['resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: ruleRange(775, 783)
  },
  'calculatePersonnelCosts.article_40_41_special_holiday_surcharges': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      ...ruleIds(719, 720, 721, 722, 723, 724, 725, 774, 784),
      ...ruleRange(785, 790),
      ...ruleIds(791),
      ...ruleRange(792, 795),
      ...ruleIds(796, 798, 808)
    ]
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
  'calculatePersonnelCosts.article_46_income_structure_phase_out': {
    functions: ['calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: ruleRange(820, 836)
  },
  'calculateCaoReimbursements.article_47_48_49_50': {
    functions: ['calculateCaoReimbursements'],
    rule_ids: [
      ...ruleRange(838, 845),
      ...ruleIds(847, 849, 853, 854, 855, 856, 857, 858, 861, 862, 864, 868),
      ...ruleRange(877, 885),
      ...ruleRange(887, 896),
      ...ruleRange(897, 910),
      ...ruleRange(911, 928),
      ...ruleRange(930, 932),
      ...ruleIds(937, 938, 939, 940),
      ...ruleRange(941, 947),
      ...ruleIds(1609)
    ]
  },
  'calculatePersonnelCosts.articles_55_58_training_education': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'applyCaoContractRules'],
    rule_ids: ruleIds(950, 953, 956, 957, 958, 959, 962, 966, 968, 971, 976, 979, 980, 981, 982, 991)
  },
  'calculateCaoLeaveAndSickness.articles_59_65_66_67': {
    functions: ['calculateCaoLeaveAndSickness'],
    rule_ids: [
      ...ruleRange(1133, 1137),
      ...ruleIds(1147, 1156, 1164),
      ...ruleIds(998),
      ...ruleRange(999, 1006),
      ...ruleIds(1007),
      ...ruleRange(1008, 1017),
      ...ruleIds(1018, 1019, 1022),
      ...ruleRange(1148, 1155),
      ...ruleRange(1157, 1163),
      ...ruleRange(1165, 1167),
      ...ruleRange(1172, 1184)
    ]
  },
  'calculateCaoLeaveAndSickness.articles_68_69_70_disability_compliance': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts'],
    rule_ids: [
      ...ruleRange(1186, 1193),
      ...ruleRange(1195, 1198)
    ]
  },
  'calculateCaoLeaveAndSickness.article_59_reference_and_protocol_ii_vacation': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: ruleIds(1021, 1601, 1602)
  },
  'calculateCaoLeaveAndSickness.article_60_vacation_requests': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules'],
    rule_ids: [
      ...ruleIds(993, 1031, 1032),
      ...ruleRange(1033, 1047),
      ...ruleIds(1049)
    ]
  },
  'calculateCaoLeaveAndSickness.article_61_holiday_credit': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(994, 1050, 1052, 1053, 1054, 1056, 1057, 1058)
  },
  'calculateCaoLeaveAndSickness.article_62_vacation_allowance': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts'],
    rule_ids: ruleIds(995, 1059, 1060, 1061, 1062, 1064, 1065, 1066, 1067, 1068)
  },
  'calculateCaoLeaveAndSickness.article_63_extraordinary_leave': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      ...ruleIds(997),
      ...ruleRange(1070, 1130)
    ]
  },
  'calculatePersonnelCosts.article_71_72_pension_80_90_100': {
    functions: ['calculatePersonnelCosts'],
    rule_ids: [
      ...ruleIds(1210, 1211, 1214, 1215, 1217, 1218),
      ...ruleRange(1221, 1227),
      ...ruleRange(1229, 1235),
      ...ruleIds(1237)
    ]
  },
  'validateCaoScheduleRules.article_73_older_workers': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      ...ruleIds(1242, 1244, 1245, 1246, 1248),
      ...ruleRange(1253, 1268),
      ...ruleRange(1270, 1294),
      ...ruleIds(1296)
    ]
  },
  'calculatePersonnelCosts.protocol_ii_cash_value_notice_article_103': {
    functions: ['calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: ruleIds(1613, 1617, 1618)
  },
  'validateCaoScheduleRules.protocol_ii_cash_value_schedule_articles_104_107': {
    functions: ['validateCaoScheduleRules'],
    rule_ids: [
      ...ruleRange(1619, 1624),
      ...ruleRange(1626, 1633),
      ...ruleRange(1635, 1642)
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

function getSourceDocumentsForCoverage(config) {
  const sourceSets = [
    config?.source_documents_snapshot,
    config?.source_documents,
    config?.monitored_source_documents,
    config?.rule_engine_metadata?.source_documents,
    config?.rule_engine_metadata?.source_documents_snapshot,
    config?.coverage_summary?.source_documents,
    config?.source_coverage_summary?.source_documents
  ];
  const docsByUrl = new Map();
  for (const sourceSet of sourceSets) {
    if (!Array.isArray(sourceSet)) continue;
    for (const doc of sourceSet) {
      if (!doc || typeof doc !== 'object') continue;
      const key = String(doc.canonical_url || doc.url || doc.title || JSON.stringify(doc)).toLowerCase();
      if (!docsByUrl.has(key)) docsByUrl.set(key, doc);
    }
  }
  return [...docsByUrl.values()];
}

function sourceDocumentSearchText(doc) {
  return [
    doc?.source_type,
    doc?.document_type,
    doc?.type,
    doc?.source_category,
    doc?.category,
    doc?.title,
    doc?.url,
    doc?.canonical_url,
    doc?.discovered_from_url
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizedSourceTypeForCoverage(doc) {
  return normalizeCaoSourceType(
    doc?.source_type || doc?.document_type || doc?.type || doc?.source_category,
    doc || {},
    'other'
  );
}

function sourceDocumentMatchesFamily(doc, family) {
  const sourceType = normalizedSourceTypeForCoverage(doc);
  const text = sourceDocumentSearchText(doc);
  return family.source_types.includes(sourceType) ||
    family.keywords.some(keyword => text.includes(keyword));
}

function sourceDocumentHasHashEvidence(doc) {
  return Boolean(
    doc?.content_hash ||
    doc?.source_hash ||
    doc?.sha256 ||
    doc?.content_sha256 ||
    doc?.extracted_text_hash ||
    doc?.text_hash
  );
}

function sourceDocumentIsOfficial(doc) {
  const explicitOfficial = booleanOrNull(doc?.is_official_source ?? doc?.official_source);
  if (explicitOfficial !== null) return explicitOfficial;
  const confidence = String(doc?.official_source_confidence || '').toLowerCase();
  if (['high', 'medium'].includes(confidence)) return true;
  return inferOfficialSource(doc?.canonical_url || doc?.url || '');
}

function sourceDocumentExtractionBlocks(doc) {
  const status = String(doc?.extraction_status || doc?.parse_status || '').toLowerCase();
  return ['pending', 'failed', 'manual_review_required'].includes(status);
}

function evaluateRequiredSourceFamilyCoverage(config) {
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const sourceDocuments = getSourceDocumentsForCoverage(config);
  if (caoKey !== CAO_PB_KEY) {
    return {
      passed: true,
      required: false,
      source_document_count: sourceDocuments.length,
      required_families: [],
      missing_families: [],
      blocking_findings: []
    };
  }

  const requiredFamilies = CAO_PB_REQUIRED_SOURCE_FAMILIES.map(family => {
    const matches = sourceDocuments.filter(doc => sourceDocumentMatchesFamily(doc, family));
    const officialMatches = matches.filter(sourceDocumentIsOfficial);
    const hashMatches = matches.filter(sourceDocumentHasHashEvidence);
    const extractionBlockedMatches = matches.filter(sourceDocumentExtractionBlocks);
    return {
      key: family.key,
      label: family.label,
      minimum_count: family.minimum_count,
      matched_count: matches.length,
      official_count: officialMatches.length,
      hash_evidence_count: hashMatches.length,
      extraction_blocked_count: extractionBlockedMatches.length,
      matched_urls: matches.slice(0, 20).map(doc => doc.url || doc.canonical_url || doc.title || null).filter(Boolean),
      matched_urls_truncated: matches.length > 20
    };
  });

  const missingFamilies = requiredFamilies.filter(family => family.matched_count < family.minimum_count);
  const unofficialFamilies = requiredFamilies.filter(family => family.matched_count >= family.minimum_count && family.official_count === 0);
  const missingHashFamilies = requiredFamilies.filter(family => family.matched_count >= family.minimum_count && family.hash_evidence_count === 0);
  const extractionBlockedFamilies = requiredFamilies.filter(family => family.extraction_blocked_count > 0);
  const blockingFindings = [];

  if (missingFamilies.length > 0) {
    blockingFindings.push({
      code: 'missing_required_cao_source_family',
      severity: 'critical',
      message: `CAO PB bronmonitoring mist verplichte bronfamilies: ${missingFamilies.map(family => family.label).join(', ')}. Payroll-ready blijft geblokkeerd.`
    });
  }
  if (unofficialFamilies.length > 0) {
    blockingFindings.push({
      code: 'unverified_required_cao_source_officiality',
      severity: 'critical',
      message: `CAO PB bronmonitoring bevat bronfamilies zonder bewezen officiele bron: ${unofficialFamilies.map(family => family.label).join(', ')}.`
    });
  }
  if (missingHashFamilies.length > 0) {
    blockingFindings.push({
      code: 'missing_required_cao_source_hash',
      severity: 'critical',
      message: `CAO PB bronmonitoring mist hashbewijs voor verplichte bronfamilies: ${missingHashFamilies.map(family => family.label).join(', ')}. Wijzigingen zijn dan niet audit-proof detecteerbaar.`
    });
  }
  if (extractionBlockedFamilies.length > 0) {
    blockingFindings.push({
      code: 'blocked_required_cao_source_extraction',
      severity: 'critical',
      message: `CAO PB bronmonitoring heeft onvolledig of mislukt extractiewerk voor: ${extractionBlockedFamilies.map(family => family.label).join(', ')}.`
    });
  }

  return {
    passed: blockingFindings.length === 0,
    required: true,
    source_document_count: sourceDocuments.length,
    required_family_count: requiredFamilies.length,
    present_family_count: requiredFamilies.length - missingFamilies.length,
    required_families: requiredFamilies,
    missing_families: missingFamilies,
    unofficial_families: unofficialFamilies,
    missing_hash_families: missingHashFamilies,
    extraction_blocked_families: extractionBlockedFamilies,
    blocking_findings: blockingFindings
  };
}

function evaluateSourceCoverageCompleteness(config, rules) {
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const minimums = getSourceCoverageMinimums(config);
  const ruleIds = uniqueRuleIds(rules);
  const byAutomationLevel = countRulesByAutomationLevel(rules);
  const sourceFamilyCoverage = evaluateRequiredSourceFamilyCoverage(config);
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
  blockingFindings.push(...sourceFamilyCoverage.blocking_findings);

  return {
    passed: blockingFindings.length === 0,
    unique_rule_ids: ruleIds.size,
    by_automation_level: byAutomationLevel,
    minimums,
    source_family_coverage: sourceFamilyCoverage,
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

function localRuntimeBindingRegistryEntries() {
  return Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)
    .map(([key, binding]) => {
      const ruleIds = uniqueSorted(binding.rule_ids);
      return {
        key,
        functions: uniqueSorted(binding.functions),
        rule_ids: ruleIds,
        bound_rule_count: ruleIds.length
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function buildLocalRuntimeBindingRegistrySnapshot() {
  const bindings = localRuntimeBindingRegistryEntries();
  const canonicalJson = JSON.stringify(stableForHash(bindings));
  const boundRuleIds = uniqueSorted(bindings.flatMap(binding => binding.rule_ids));
  return {
    fingerprint: await sha256Hex(canonicalJson),
    fingerprint_algorithm: 'sha256',
    fingerprint_scope: 'local_runtime_rule_bindings',
    canonical_binding_count: bindings.length,
    canonical_bound_rule_count: boundRuleIds.length,
    binding_keys: bindings.map(binding => binding.key),
    bound_rule_ids: boundRuleIds,
    bindings
  };
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
      applies_when: stableForHash(rule.applies_when || null),
      default_action: stableForHash(rule.default_action || null),
      validation_action: stableForHash(rule.validation_action || null),
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

function hasMachineReadableObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function hasMachineReadableApplicability(rule) {
  return hasMachineReadableObject(rule?.applies_when);
}

function hasMachineReadableAction(rule) {
  const calculationPolicy = String(rule?.calculation_policy || '').toLowerCase();
  return hasMachineReadableObject(rule?.default_action) ||
    hasMachineReadableObject(rule?.validation_action) ||
    ['automatic', 'manual_review_required', 'policy_only'].includes(calculationPolicy);
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

function isActionableRuntimeRule(rule) {
  const automationLevel = String(rule?.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule?.calculation_policy || '').toLowerCase();
  return calculationPolicy === 'automatic' ||
    ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation'].includes(automationLevel);
}

function createRuntimeCoverageBucket(key) {
  return {
    key: key || 'unknown',
    total_rules: 0,
    actionable_rules: 0,
    runtime_bound_rules: 0,
    actionable_runtime_bound_rules: 0,
    actionable_runtime_missing_rules: 0,
    implemented_rules: 0,
    partial_rules: 0,
    missing_rules: 0,
    reference_rules: 0,
    manual_review_required_rules: 0,
    missing_actionable_rule_ids: [],
    missing_actionable_rule_ids_truncated: false
  };
}

function updateRuntimeCoverageBucket(bucket, rule, runtimeBound, maxRuleIds) {
  const actionable = isActionableRuntimeRule(rule);
  const status = String(rule?.implementation_status || 'MISSING').toUpperCase();
  bucket.total_rules++;
  if (actionable) bucket.actionable_rules++;
  if (runtimeBound) bucket.runtime_bound_rules++;
  if (actionable && runtimeBound) bucket.actionable_runtime_bound_rules++;
  if (actionable && !runtimeBound) {
    bucket.actionable_runtime_missing_rules++;
    if (bucket.missing_actionable_rule_ids.length < maxRuleIds) {
      bucket.missing_actionable_rule_ids.push(rule.rule_id || 'unknown');
    } else {
      bucket.missing_actionable_rule_ids_truncated = true;
    }
  }
  if (status === 'IMPLEMENTED') bucket.implemented_rules++;
  else if (status === 'PARTIAL') bucket.partial_rules++;
  else if (status === 'MISSING') bucket.missing_rules++;
  else if (status === 'REFERENCE') bucket.reference_rules++;
  if (rule?.manual_review_required === true) bucket.manual_review_required_rules++;
}

function finalizeRuntimeCoverageBucket(bucket) {
  return {
    ...bucket,
    runtime_bound_pct: bucket.total_rules > 0
      ? Number(((bucket.runtime_bound_rules / bucket.total_rules) * 100).toFixed(1))
      : 0,
    actionable_runtime_bound_pct: bucket.actionable_rules > 0
      ? Number(((bucket.actionable_runtime_bound_rules / bucket.actionable_rules) * 100).toFixed(1))
      : null
  };
}

function sortedRuntimeCoverageBuckets(map, maxGroups) {
  return [...map.values()]
    .map(finalizeRuntimeCoverageBucket)
    .sort((a, b) =>
      b.actionable_runtime_missing_rules - a.actionable_runtime_missing_rules ||
      b.actionable_rules - a.actionable_rules ||
      b.total_rules - a.total_rules ||
      a.key.localeCompare(b.key)
    )
    .slice(0, maxGroups);
}

function buildRuntimeCoverageRollup(rules, maxGroups = 100, maxRuleIds = 25) {
  const total = createRuntimeCoverageBucket('all');
  const byDomain = new Map();
  const byChapter = new Map();
  const byArticle = new Map();
  const byAutomationLevel = new Map();

  for (const rule of Array.isArray(rules) ? rules : []) {
    const runtimeBound = hasRuntimeBinding(rule);
    const keys = {
      domain: rule.domain || 'unknown',
      chapter: rule.chapter || 'unknown',
      article: rule.article || 'unknown',
      automation_level: rule.automation_level || 'unknown'
    };
    updateRuntimeCoverageBucket(total, rule, runtimeBound, maxRuleIds);
    for (const [map, key] of [
      [byDomain, keys.domain],
      [byChapter, keys.chapter],
      [byArticle, keys.article],
      [byAutomationLevel, keys.automation_level]
    ]) {
      if (!map.has(key)) map.set(key, createRuntimeCoverageBucket(key));
      updateRuntimeCoverageBucket(map.get(key), rule, runtimeBound, maxRuleIds);
    }
  }

  return {
    total: finalizeRuntimeCoverageBucket(total),
    by_domain: sortedRuntimeCoverageBuckets(byDomain, maxGroups),
    by_chapter: sortedRuntimeCoverageBuckets(byChapter, maxGroups),
    by_article: sortedRuntimeCoverageBuckets(byArticle, maxGroups),
    by_automation_level: sortedRuntimeCoverageBuckets(byAutomationLevel, maxGroups),
    sort_order: 'highest actionable_runtime_missing_rules first',
    generation_note: 'Owner/internal CAO runtime coverage rollup. Gebruik dit om implementatiebatches te prioriteren; niet tonen aan eindgebruikers.'
  };
}

const SEMANTIC_GAP_DEFINITIONS = {
  missing_rule_text: { priority: 100, label: 'Brontekst ontbreekt' },
  missing_local_runtime: { priority: 95, label: 'Lokale runtime ontbreekt' },
  missing_applicability_semantics: { priority: 90, label: 'applies_when ontbreekt' },
  missing_action_semantics: { priority: 90, label: 'actie-/validatiesemantiek ontbreekt' },
  missing_test_evidence: { priority: 80, label: 'Testbewijs ontbreekt' },
  runtime_bound_status_unverified: { priority: 75, label: 'Runtimebinding aanwezig, implementatiestatus niet bewezen' },
  partial_without_manual_review: { priority: 70, label: 'PARTIAL zonder verplichte review' },
  manual_review_required: { priority: 60, label: 'Handmatige review vereist' },
  not_implemented: { priority: 55, label: 'Niet volledig geimplementeerd' }
};

function addSemanticGap(backlogByRule, rule, gapType) {
  if (!rule?.rule_id) return;
  if (!backlogByRule.has(rule.rule_id)) {
    backlogByRule.set(rule.rule_id, {
      rule_id: rule.rule_id,
      domain: rule.domain || null,
      article: rule.article || null,
      automation_level: rule.automation_level || null,
      implementation_status: rule.implementation_status || 'MISSING',
      manual_review_required: rule.manual_review_required === true,
      runtime_binding_status: rule.runtime_binding_status || null,
      runtime_binding_key: rule.runtime_binding_key || null,
      gap_types: [],
      priority: 0
    });
  }
  const item = backlogByRule.get(rule.rule_id);
  if (!item.gap_types.includes(gapType)) item.gap_types.push(gapType);
  item.priority = Math.max(item.priority, SEMANTIC_GAP_DEFINITIONS[gapType]?.priority || 0);
}

function countGapTypes(items) {
  const counts = {};
  for (const item of items) {
    for (const gapType of item.gap_types || []) {
      counts[gapType] = (counts[gapType] || 0) + 1;
    }
  }
  return counts;
}

function buildSemanticBacklogGroup(items, groupKey, maxRuleIds = 25) {
  const sorted = [...items].sort((a, b) => b.priority - a.priority || a.rule_id.localeCompare(b.rule_id));
  return {
    key: groupKey || 'unknown',
    open_rule_count: sorted.length,
    highest_priority: sorted[0]?.priority || 0,
    gap_types: countGapTypes(sorted),
    sample_rule_ids: sorted.slice(0, maxRuleIds).map(item => item.rule_id),
    sample_rule_ids_truncated: sorted.length > maxRuleIds
  };
}

function groupSemanticBacklog(items, keyFn, maxGroups, maxRuleIds) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .map(([key, groupItems]) => buildSemanticBacklogGroup(groupItems, key, maxRuleIds))
    .sort((a, b) => b.highest_priority - a.highest_priority || b.open_rule_count - a.open_rule_count || a.key.localeCompare(b.key))
    .slice(0, maxGroups);
}

function buildSemanticBacklog({
  openCriticalRules,
  implementedWithoutRuntimeBinding,
  implementedWithoutTestEvidence,
  partialWithoutManualReview,
  payrollCriticalMissingRuleText,
  payrollCriticalMissingApplicabilitySemantics,
  payrollCriticalMissingActionSemantics,
  maxGroups = 25,
  maxRuleIds = 25
}) {
  const backlogByRule = new Map();

  for (const rule of openCriticalRules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    if (rule.has_runtime_binding === false) addSemanticGap(backlogByRule, rule, 'missing_local_runtime');
    if (status !== 'IMPLEMENTED') {
      addSemanticGap(
        backlogByRule,
        rule,
        rule.has_runtime_binding === true ? 'runtime_bound_status_unverified' : 'not_implemented'
      );
    }
    if (rule.manual_review_required === true) addSemanticGap(backlogByRule, rule, 'manual_review_required');
  }
  for (const rule of implementedWithoutRuntimeBinding) addSemanticGap(backlogByRule, rule, 'missing_local_runtime');
  for (const rule of implementedWithoutTestEvidence) addSemanticGap(backlogByRule, rule, 'missing_test_evidence');
  for (const rule of partialWithoutManualReview) addSemanticGap(backlogByRule, rule, 'partial_without_manual_review');
  for (const rule of payrollCriticalMissingRuleText) addSemanticGap(backlogByRule, rule, 'missing_rule_text');
  for (const rule of payrollCriticalMissingApplicabilitySemantics) addSemanticGap(backlogByRule, rule, 'missing_applicability_semantics');
  for (const rule of payrollCriticalMissingActionSemantics) addSemanticGap(backlogByRule, rule, 'missing_action_semantics');

  const items = [...backlogByRule.values()]
    .map(item => ({
      ...item,
      gap_types: item.gap_types.sort((a, b) => (SEMANTIC_GAP_DEFINITIONS[b]?.priority || 0) - (SEMANTIC_GAP_DEFINITIONS[a]?.priority || 0) || a.localeCompare(b))
    }))
    .sort((a, b) => b.priority - a.priority || a.rule_id.localeCompare(b.rule_id));

  return {
    open_rule_count: items.length,
    gap_type_counts: countGapTypes(items),
    gap_type_definitions: SEMANTIC_GAP_DEFINITIONS,
    top_rules: items.slice(0, maxRuleIds),
    top_rules_truncated: items.length > maxRuleIds,
    by_domain: groupSemanticBacklog(items, item => item.domain, maxGroups, maxRuleIds),
    by_article: groupSemanticBacklog(items, item => item.article, maxGroups, maxRuleIds),
    by_runtime_binding_key: groupSemanticBacklog(items, item => item.runtime_binding_key || 'missing_local_runtime', maxGroups, maxRuleIds),
    generation_note: 'Owner/internal backlog voor CAO-dekking. Gebruik dit als implementatievolgorde; niet tonen aan eindgebruikers.'
  };
}

async function evaluateLocalRuntimeBindingCoverage(rules, maxOpenRules) {
  const registrySnapshot = await buildLocalRuntimeBindingRegistrySnapshot();
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
    registry_fingerprint: registrySnapshot.fingerprint,
    registry_fingerprint_algorithm: registrySnapshot.fingerprint_algorithm,
    registry_snapshot: registrySnapshot,
    bindings: bindingSummaries
  };
}

async function evaluateCoverageGate(config, rules, options = {}) {
  const maxOpenRules = Math.max(1, Number(options.max_open_rules || 100));
  const activeConfigurationCandidates = Array.isArray(options.active_configuration_candidates)
    ? options.active_configuration_candidates
    : [];
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const sourceCoverage = evaluateSourceCoverageCompleteness(config, rules);
  const localRuntimeCoverage = await evaluateLocalRuntimeBindingCoverage(rules, maxOpenRules);
  const runtimeCoverage = buildRuntimeCoverageRollup(rules, Math.min(maxOpenRules, 100), Math.min(maxOpenRules, 25));
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
    payroll_critical_missing_applicability_semantics: 0,
    payroll_critical_missing_action_semantics: 0,
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
  const payrollCriticalMissingApplicabilitySemantics = [];
  const payrollCriticalMissingActionSemantics = [];
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
    const hasApplicabilitySemantics = hasMachineReadableApplicability(rule);
    const hasActionSemantics = hasMachineReadableAction(rule);
    const missingApplicabilitySemantics = !hasApplicabilitySemantics;
    const missingActionSemantics = !hasActionSemantics;

    if (payrollCriticalNoText) {
      counts.payroll_critical_missing_rule_text++;
      payrollCriticalMissingRuleText.push(summarizeRule(rule, {
        message: 'Payrollkritische regel mist zowel rule_text als rule_text_summary; CAO-broninterpretatie kan niet worden bewezen.'
      }));
    }
    if (missingApplicabilitySemantics) {
      counts.payroll_critical_missing_applicability_semantics++;
      payrollCriticalMissingApplicabilitySemantics.push(summarizeRule(rule, {
        message: 'Payrollkritische regel mist machineleesbare applies_when-condities; de applicatie kan niet audit-proof bepalen voor welk contract, functieprofiel, diensttype of CAO-scope deze regel geldt.'
      }));
    }
    if (missingActionSemantics) {
      counts.payroll_critical_missing_action_semantics++;
      payrollCriticalMissingActionSemantics.push(summarizeRule(rule, {
        message: 'Payrollkritische regel mist machineleesbare default_action/validation_action/calculation_policy; de applicatie weet niet bewijsbaar of zij moet berekenen, blokkeren, waarschuwen of handmatige review eisen.'
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
      payrollCriticalNoText ||
      missingApplicabilitySemantics ||
      missingActionSemantics
    ) {
      counts.payroll_critical_open++;
      openCriticalRules.push(summarizeRule(rule, {
        has_runtime_binding: runtimeBound,
        has_runtime_binding_metadata: runtimeMetadataPresent,
        has_test_evidence: testEvidence,
        has_verified_test_evidence: testEvidence,
        has_machine_applicability: hasApplicabilitySemantics,
        has_machine_action: hasActionSemantics
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
  if (payrollCriticalMissingApplicabilitySemantics.length > 0) {
    blockingFindings.push({
      code: 'missing_payroll_critical_applicability_semantics',
      severity: 'critical',
      message: `${payrollCriticalMissingApplicabilitySemantics.length} payrollkritische CAO-regels missen machineleesbare applies_when-condities; de applicatie kan niet zeker bepalen op wie of welke dienst de regel geldt.`
    });
  }
  if (payrollCriticalMissingActionSemantics.length > 0) {
    blockingFindings.push({
      code: 'missing_payroll_critical_action_semantics',
      severity: 'critical',
      message: `${payrollCriticalMissingActionSemantics.length} payrollkritische CAO-regels missen machineleesbare actie-/validatiesemantiek; de applicatie kan niet zeker bepalen wat zij met de regel moet doen.`
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

  const semanticBacklog = buildSemanticBacklog({
    openCriticalRules,
    implementedWithoutRuntimeBinding,
    implementedWithoutTestEvidence,
    partialWithoutManualReview,
    payrollCriticalMissingRuleText,
    payrollCriticalMissingApplicabilitySemantics,
    payrollCriticalMissingActionSemantics,
    maxGroups: maxOpenRules,
    maxRuleIds: maxOpenRules
  });

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    source_coverage: sourceCoverage,
    local_runtime_coverage: localRuntimeCoverage,
    local_runtime_registry: localRuntimeCoverage.registry_snapshot,
    runtime_coverage: runtimeCoverage,
    by_domain: countBy(rules, rule => rule.domain),
    by_automation_level: countBy(rules, rule => rule.automation_level),
    by_implementation_status: countBy(rules, rule => String(rule.implementation_status || 'MISSING').toUpperCase()),
    by_runtime_binding_status: countBy(rules, rule => runtimeBindingStatusForSummary(rule)),
    by_runtime_binding_key: countBy(rules, rule => runtimeBindingKeyForSummary(rule)),
    has_local_payroll_runtime: hasLocalPayrollRuntime(caoKey),
    local_runtime_binding_keys: localRuntimeCoverage.local_runtime_binding_keys,
    local_runtime_binding_fingerprint: localRuntimeCoverage.registry_fingerprint,
    local_runtime_binding_fingerprint_algorithm: localRuntimeCoverage.registry_fingerprint_algorithm,
    semantic_backlog: semanticBacklog,
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
    payroll_critical_missing_applicability_semantics_rules: payrollCriticalMissingApplicabilitySemantics.slice(0, maxOpenRules),
    payroll_critical_missing_applicability_semantics_truncated: payrollCriticalMissingApplicabilitySemantics.length > maxOpenRules,
    payroll_critical_missing_action_semantics_rules: payrollCriticalMissingActionSemantics.slice(0, maxOpenRules),
    payroll_critical_missing_action_semantics_truncated: payrollCriticalMissingActionSemantics.length > maxOpenRules,
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
    const runtimeGate = await evaluateCoverageGate(auditConfig, rules || [], {
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

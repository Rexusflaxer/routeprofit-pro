import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_POLICY_REFERENCE_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_POLICY_REFERENCE_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_POLICY_REFERENCE_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : key
      ? `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Policycontext wordt fail-closed geblokkeerd zodat geen PB-referentieregels op een andere CAO worden toegepast.`
      : `Runtime ${functionName} mist cao_key. Policycontext wordt fail-closed geblokkeerd zodat geen PB-default wordt toegepast.`
  };
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
  for (let number = start; number <= end; number += 1) {
    if (!excludedSet.has(number)) ids.push(caoPbRuleId(number));
  }
  return ids;
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function anchor({ key, domain, surfaces, rule_ids, policy_role = 'policy_reference_context' }) {
  return {
    key,
    domain,
    surfaces,
    policy_role,
    calculation_policy: 'policy_only',
    implementation_status: 'REFERENCE_POLICY_CONTEXT',
    manual_review_required: false,
    rule_ids
  };
}

const HIGH_IMPACT_POLICY_REFERENCE_ANCHORS = [
  anchor({
    key: 'definitions.leave_and_contract_reference_context',
    domain: 'definitions',
    surfaces: ['contract', 'planning', 'payroll', 'leave'],
    rule_ids: [...ruleIds(176), ...ruleIds(1854)]
  }),
  anchor({
    key: 'contract_employment.article_headings_and_reference_context',
    domain: 'contract_employment',
    surfaces: ['contract', 'planning', 'payroll', 'termination', 'contract_change'],
    rule_ids: [
      ...ruleRange(296, 300), ...ruleRange(302, 304), ...ruleRange(307, 308), ...ruleIds(336),
      ...ruleRange(340, 341), ...ruleIds(344, 348, 366, 370, 375, 379), ...ruleRange(381, 386),
      ...ruleIds(395, 400, 406, 413, 416), ...ruleRange(439, 444), ...ruleRange(449, 450),
      ...ruleIds(452), ...ruleRange(454, 455), ...ruleRange(457, 460), ...ruleIds(463, 546),
      ...ruleRange(1851, 1852), ...ruleIds(1922, 1924, 1926)
    ]
  }),
  anchor({
    key: 'planning_working_time.article_headings_and_reference_context',
    domain: 'planning_working_time',
    surfaces: ['planning', 'payroll'],
    rule_ids: [...ruleRange(550, 551), ...ruleIds(554), ...ruleRange(558, 559)]
  }),
  anchor({
    key: 'payroll_wages_allowances.article_headings_and_reference_context',
    domain: 'payroll_wages_allowances',
    surfaces: ['contract', 'payroll', 'planning'],
    rule_ids: [
      ...ruleRange(717, 718), ...ruleRange(726, 727), ...ruleIds(730, 732), ...ruleRange(735, 737),
      ...ruleIds(754, 756), ...ruleRange(758, 759), ...ruleIds(763), ...ruleRange(768, 769),
      ...ruleIds(809, 819)
    ]
  }),
  anchor({
    key: 'expenses_reimbursements.policy_reference_context',
    domain: 'expenses_reimbursements',
    surfaces: ['payroll', 'reimbursement', 'planning'],
    rule_ids: [
      ...ruleIds(846, 848), ...ruleRange(850, 852), ...ruleIds(863, 871), ...ruleRange(874, 876),
      ...ruleIds(886, 929), ...ruleRange(933, 936), ...ruleIds(948)
    ]
  }),
  anchor({
    key: 'training_education.policy_reference_context',
    domain: 'training_education',
    surfaces: ['contract', 'payroll', 'reimbursement', 'training'],
    rule_ids: [...ruleRange(954, 955), ...ruleIds(961, 963, 967, 969, 988, 990)]
  }),
  anchor({
    key: 'leave_holidays.policy_reference_context',
    domain: 'leave_holidays',
    surfaces: ['contract', 'planning', 'payroll', 'leave', 'sickness'],
    rule_ids: [
      ...ruleIds(996, 1020), ...ruleRange(1023, 1030), ...ruleIds(1048, 1051, 1055, 1063, 1069, 1131)
    ]
  }),
  anchor({
    key: 'sickness_disability.policy_reference_context',
    domain: 'sickness_disability',
    surfaces: ['contract', 'payroll', 'sickness'],
    rule_ids: [...ruleRange(1138, 1146), ...ruleIds(1194, 1199)]
  }),
  anchor({
    key: 'pension_older_workers.policy_reference_context',
    domain: 'pension_older_workers',
    surfaces: ['contract', 'payroll', 'pension', 'planning'],
    rule_ids: [
      ...ruleIds(1201), ...ruleRange(1203, 1209), ...ruleRange(1212, 1213), ...ruleIds(1216),
      ...ruleRange(1219, 1220), ...ruleIds(1228, 1236), ...ruleRange(1238, 1241), ...ruleIds(1243, 1247),
      ...ruleRange(1249, 1252), ...ruleIds(1269, 1295)
    ]
  }),
  anchor({
    key: 'organization_social_policy_unions.policy_reference_context',
    domain: 'organization_social_policy_unions',
    surfaces: ['contract', 'payroll', 'leave', 'social_fund'],
    rule_ids: [
      ...ruleRange(1341, 1342), ...ruleRange(1352, 1353), ...ruleIds(1397, 1429, 1462, 1487),
      ...ruleRange(1503, 1505), ...ruleIds(1507, 1512)
    ]
  }),
  anchor({
    key: 'special_scope_policy_reference_context',
    domain: 'special_scope',
    surfaces: ['contract', 'planning', 'payroll', 'reimbursement'],
    rule_ids: [
      ...ruleIds(1572, 1590), ...ruleRange(1603, 1604), ...ruleIds(1643),
      ...ruleIds(1969, 1996, 1999, 2014, 2037), ...ruleRange(2082, 2083)
    ]
  }),
  anchor({
    key: 'governance_compliance_protocol_reference_context',
    domain: 'governance_compliance',
    surfaces: ['contract', 'payroll', 'audit', 'reimbursement'],
    rule_ids: [
      ...ruleIds(1650, 1663, 1672, 1687, 1710, 1713, 1715), ...ruleRange(1866, 1867),
      ...ruleIds(1876, 1878, 1880, 1901), ...ruleIds(1922, 1924, 1926), ...ruleRange(1930, 1931),
      ...ruleIds(1933)
    ]
  }),
  anchor({
    key: 'function_salary_scale_policy_reference_context',
    domain: 'functions_diplomas_salary_scales',
    surfaces: ['contract', 'planning', 'payroll', 'function_classification'],
    rule_ids: [...ruleRange(1761, 1762), ...ruleIds(1809, 1839)]
  }),
  anchor({
    key: 'contract_change_appendix_reference_context',
    domain: 'contract_change',
    surfaces: ['contract_change', 'contract', 'payroll', 'leave'],
    rule_ids: [...ruleRange(1954, 1955), ...ruleIds(2106)]
  })
];

const GENERAL_REFERENCE_POLICY_CONTEXT_ANCHORS = [
  anchor({
    key: 'airport_schiphol.general_reference_policy_context',
    domain: 'airport_schiphol',
    surfaces: ['planning', 'payroll', 'contract', 'reimbursement'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1522), ...ruleIds(1526), ...ruleIds(1529, 1530), ...ruleRange(1534, 1538),
      ...ruleRange(1540, 1542), ...ruleIds(1544), ...ruleIds(1546), ...ruleRange(1548, 1550),
      ...ruleIds(1552, 1553), ...ruleIds(1557), ...ruleIds(1563), ...ruleIds(1570, 1571),
      ...ruleIds(1574, 1575), ...ruleIds(1581), ...ruleIds(1587)
    ]
  }),
  anchor({
    key: 'airport_schiphol_agreements.general_reference_policy_context',
    domain: 'airport_schiphol_agreements',
    surfaces: ['planning', 'payroll', 'contract', 'reimbursement'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1956), ...ruleIds(1960, 1961), ...ruleIds(1963, 1964), ...ruleIds(1967, 1968),
      ...ruleIds(1970), ...ruleIds(1972), ...ruleIds(1980, 1981), ...ruleIds(1986),
      ...ruleIds(1988), ...ruleIds(1992), ...ruleIds(1994, 1995), ...ruleIds(1998),
      ...ruleIds(2000), ...ruleIds(2002), ...ruleIds(2004, 2005), ...ruleIds(2007),
      ...ruleIds(2009), ...ruleIds(2015, 2016), ...ruleRange(2019, 2023), ...ruleIds(2025),
      ...ruleIds(2027), ...ruleRange(2029, 2034), ...ruleRange(2047, 2052), ...ruleIds(2054),
      ...ruleRange(2056, 2063), ...ruleIds(2066), ...ruleIds(2073)
    ]
  }),
  anchor({
    key: 'cash_value_logistics.general_reference_policy_context',
    domain: 'cash_value_logistics',
    surfaces: ['planning', 'payroll'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1591), ...ruleRange(1594, 1599), ...ruleRange(1606, 1608), ...ruleIds(1611, 1612),
      ...ruleIds(1614), ...ruleIds(1625), ...ruleIds(1634), ...ruleRange(1644, 1648)
    ]
  }),
  anchor({
    key: 'compliance_control_regulation.general_reference_policy_context',
    domain: 'compliance_control_regulation',
    surfaces: ['audit', 'compliance', 'contract'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1846), ...ruleIds(1849), ...ruleIds(1870), ...ruleIds(1882),
      ...ruleIds(1899), ...ruleIds(1906, 1907), ...ruleIds(1909), ...ruleIds(1912)
    ]
  }),
  anchor({
    key: 'definitions.general_reference_policy_context',
    domain: 'definitions',
    surfaces: ['audit', 'contract', 'planning', 'payroll'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(161, 162), ...ruleIds(170), ...ruleIds(173), ...ruleRange(178, 181),
      ...ruleIds(183), ...ruleIds(207), ...ruleIds(212, 213), ...ruleIds(1842, 1843),
      ...ruleIds(1853), ...ruleIds(1855)
    ]
  }),
  anchor({
    key: 'employer_compliance.general_reference_policy_context',
    domain: 'employer_compliance',
    surfaces: ['audit', 'compliance', 'contract'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleRange(1653, 1657), ...ruleRange(1659, 1662), ...ruleRange(1664, 1667), ...ruleIds(1674),
      ...ruleIds(1680), ...ruleIds(1684, 1685), ...ruleIds(1688), ...ruleIds(1697),
      ...ruleRange(1699, 1704)
    ]
  }),
  anchor({
    key: 'general_reference.general_reference_policy_context',
    domain: 'general_reference',
    surfaces: ['audit', 'contract', 'planning', 'payroll'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(160), ...ruleRange(165, 169), ...ruleIds(235), ...ruleRange(237, 295),
      ...ruleIds(837), ...ruleIds(949), ...ruleIds(992), ...ruleIds(1132),
      ...ruleRange(1168, 1171), ...ruleIds(1185), ...ruleIds(1200), ...ruleIds(1297),
      ...ruleIds(1335), ...ruleIds(1405), ...ruleIds(1447), ...ruleIds(1518),
      ...ruleIds(1588), ...ruleIds(1649), ...ruleIds(1705)
    ]
  }),
  anchor({
    key: 'metadata.general_reference_policy_context',
    domain: 'metadata',
    surfaces: ['audit', 'contract', 'planning', 'payroll'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleRange(1, 7), ...ruleIds(2104)
    ]
  }),
  anchor({
    key: 'metadata_toc.general_reference_policy_context',
    domain: 'metadata_toc',
    surfaces: ['audit', 'contract', 'planning', 'payroll'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleRange(8, 159)
    ]
  }),
  anchor({
    key: 'organization_social_policy_unions.general_reference_policy_context',
    domain: 'organization_social_policy_unions',
    surfaces: ['contract', 'leave', 'payroll', 'social_fund', 'compliance'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1336), ...ruleIds(1339, 1340), ...ruleRange(1343, 1351), ...ruleRange(1354, 1356),
      ...ruleRange(1361, 1365), ...ruleRange(1367, 1374), ...ruleIds(1376), ...ruleRange(1378, 1385),
      ...ruleRange(1388, 1391), ...ruleIds(1394), ...ruleIds(1396), ...ruleIds(1398),
      ...ruleRange(1402, 1404), ...ruleIds(1406, 1407), ...ruleRange(1410, 1422), ...ruleRange(1424, 1428),
      ...ruleRange(1430, 1435), ...ruleIds(1437), ...ruleIds(1446), ...ruleRange(1448, 1454),
      ...ruleRange(1456, 1459), ...ruleIds(1461), ...ruleRange(1463, 1471), ...ruleIds(1473),
      ...ruleRange(1475, 1483), ...ruleIds(1485, 1486), ...ruleRange(1488, 1490), ...ruleRange(1492, 1494),
      ...ruleRange(1496, 1498), ...ruleIds(1502), ...ruleIds(1511), ...ruleIds(1513),
      ...ruleIds(1517)
    ]
  }),
  anchor({
    key: 'payslip_template.general_reference_policy_context',
    domain: 'payslip_template',
    surfaces: ['payroll', 'audit'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleRange(1737, 1739), ...ruleIds(1741), ...ruleIds(1743), ...ruleIds(1748)
    ]
  }),
  anchor({
    key: 'protocols.general_reference_policy_context',
    domain: 'protocols',
    surfaces: ['audit', 'compliance', 'contract'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(1706), ...ruleIds(1709), ...ruleIds(1711), ...ruleIds(1718),
      ...ruleIds(1721), ...ruleIds(1724), ...ruleRange(1726, 1735)
    ]
  }),
  anchor({
    key: 'safety_risk_working_conditions.general_reference_policy_context',
    domain: 'safety_risk_working_conditions',
    surfaces: ['planning', 'compliance', 'contract'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleRange(1298, 1302), ...ruleRange(1304, 1310), ...ruleIds(1312), ...ruleRange(1314, 1321),
      ...ruleRange(1323, 1326), ...ruleIds(1328, 1329), ...ruleRange(1331, 1334)
    ]
  }),
  anchor({
    key: 'scope_applicability.general_reference_policy_context',
    domain: 'scope_applicability',
    surfaces: ['contract', 'planning', 'payroll', 'applicability'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(163), ...ruleRange(214, 220), ...ruleRange(222, 226), ...ruleIds(1519),
      ...ruleIds(1527, 1528), ...ruleIds(1600), ...ruleIds(1845), ...ruleIds(1856),
      ...ruleIds(1860), ...ruleIds(1863, 1864), ...ruleIds(2075, 2076), ...ruleRange(2085, 2087),
      ...ruleRange(2096, 2098)
    ]
  }),
  anchor({
    key: 'training_education.general_reference_policy_context',
    domain: 'training_education',
    surfaces: ['contract', 'training', 'payroll', 'reimbursement'],
    policy_role: 'general_reference_policy_context',
    rule_ids: [
      ...ruleIds(951, 952), ...ruleIds(960), ...ruleIds(964, 965), ...ruleIds(970),
      ...ruleRange(972, 975), ...ruleIds(977, 978), ...ruleRange(983, 987), ...ruleIds(989)
    ]
  })
];

const POLICY_REFERENCE_CONTEXT_ANCHORS = [
  ...HIGH_IMPACT_POLICY_REFERENCE_ANCHORS,
  ...GENERAL_REFERENCE_POLICY_CONTEXT_ANCHORS
];

function resolvePolicyReferenceContext(input = {}) {
  const caoKey = input.cao_key || input.cao || null;
  const runtimeSupport = getCaoRuntimeSupport(caoKey, 'resolveCaoPolicyReferenceContext');
  if (!runtimeSupport.supported) {
    return {
      cao_key: caoKey,
      cao_runtime_support: runtimeSupport,
      policy_reference_context_status: runtimeSupport.status,
      manual_review_required: true,
      payroll_final_allowed: false,
      policy_anchors: [],
      source_rule_ids: [],
      warnings: [runtimeSupport.message]
    };
  }

  const requestedDomains = new Set(normalizeArray(input.domain || input.domains).map(String));
  const requestedSurfaces = new Set(normalizeArray(input.surface || input.surfaces || input.application_surface).map(String));
  const requestedRuleIds = new Set(normalizeArray(input.rule_id || input.rule_ids).map(String));

  const anchors = POLICY_REFERENCE_CONTEXT_ANCHORS
    .filter(item => requestedDomains.size === 0 || requestedDomains.has(item.domain))
    .filter(item => requestedSurfaces.size === 0 || item.surfaces.some(surface => requestedSurfaces.has(surface)))
    .map(item => {
      const ruleIdsForAnchor = requestedRuleIds.size === 0
        ? item.rule_ids
        : item.rule_ids.filter(ruleId => requestedRuleIds.has(ruleId));
      return { ...item, rule_ids: ruleIdsForAnchor };
    })
    .filter(item => item.rule_ids.length > 0);

  const sourceRuleIds = unique(anchors.flatMap(item => item.rule_ids)).sort();
  return {
    cao_key: caoKey,
    cao_runtime_support: runtimeSupport,
    policy_reference_context_status: 'resolved',
    policy_reference_context_type: 'cao_reference_and_policy_rules',
    calculation_policy: 'policy_only',
    manual_review_required: false,
    payroll_final_allowed: true,
    anchor_count: anchors.length,
    source_rule_count: sourceRuleIds.length,
    policy_anchors: anchors,
    source_rule_ids: sourceRuleIds,
    warnings: []
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const result = resolvePolicyReferenceContext(body);
    const status = result.cao_runtime_support?.supported === false ? 422 : 200;
    return Response.json(result, { status });
  } catch (error) {
    return Response.json({
      error: error.message || String(error),
      policy_reference_context_status: 'failed'
    }, { status: 500 });
  }
});

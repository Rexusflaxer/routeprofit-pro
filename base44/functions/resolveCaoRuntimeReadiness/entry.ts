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

const SOURCE_MONITORING_CONTRACT_BY_CAO_KEY = {
  [CAO_PB_KEY]: [
    {
      family_key: 'cao_landing_page',
      label: 'CAO PB overzicht, vraagbaak en losse updates',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/cao/',
        'https://www.beveiligingsbranche.nl/actueel/cao/'
      ],
      required_source_types: ['cao_page', 'official_webpage'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'linked_document_hashes', 'question_answer_section_hash'],
      watch_for_keywords: ['cao', 'vraagbaak', 'loontabel', 'loonperiodes', 'sociale commissie', 'premie', '2026'],
      effective_date_fields: ['effective_from', 'valid_from', 'applies_from', 'pay_period_effective_from']
    },
    {
      family_key: 'main_cao_pdf',
      label: 'Hoofd-CAO Particuliere Beveiliging PDF',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/wp-content/uploads/CAO-PB-18-dec-2024-27-dec-2026_met-omslag.pdf'
      ],
      required_source_types: ['cao_pdf'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_text_hash', 'linked_from_landing_page_hash'],
      watch_for_keywords: ['particuliere beveiliging', '18 december 2024', '27 december 2026'],
      effective_date_fields: ['valid_from', 'valid_until', 'effective_from']
    },
    {
      family_key: 'wage_tables',
      label: 'CAO PB loontabellen en loonstijgingen',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2025-per-uur-en-per-4-weken-1.pdf',
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2026-per-uur-en-per-4-weken.pdf',
        'https://www.beveiligingsbranche.nl/loonstijging-per-loonperiode-1-2026-bekend/'
      ],
      required_source_types: ['wage_table_pdf', 'wage_table_xlsx', 'news_update'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_table_hash', 'numeric_parameter_hash'],
      watch_for_keywords: ['loontabel', 'salarisschaal', 'loonperiode 1 2025', 'loonperiode 1 2026', '4,5%', '3,8%', 'indexatie'],
      effective_date_fields: ['effective_from', 'pay_period_effective_from', 'wage_period']
    },
    {
      family_key: 'pay_periods',
      label: 'CAO PB loonperiodetabellen',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Loonperiodes-2025.pdf',
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Loonperiodes-2026.pdf',
        'https://www.beveiligingsbranche.nl/cao/'
      ],
      required_source_types: ['pay_periods_pdf', 'pay_periods_xlsx', 'cao_page'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pay_period_table_hash'],
      watch_for_keywords: ['loonperiodes', 'loonperioden', '2025', '2026', '14e loonperiode'],
      effective_date_fields: ['period_start', 'period_end', 'pay_period_year']
    },
    {
      family_key: 'fonds_cao',
      label: 'Fonds-CAO en SFPB-premiebronnen',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Fonds-cao-1-juli-2021-1-juli-2026-versie-5-december-2025.pdf',
        'https://www.beveiligingsbranche.nl/premie-inning-2026/'
      ],
      required_source_types: ['fonds_cao_pdf', 'official_webpage', 'news_update'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl', 'sociaalfondsbeveiliging.nl', 'www.sociaalfondsbeveiliging.nl', 'sfpb.nl', 'www.sfpb.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_text_hash', 'numeric_parameter_hash'],
      watch_for_keywords: ['sociaal fonds', 'sfpb', 'premie', '0,245%', '0,06125%', '0,18375%'],
      effective_date_fields: ['effective_from', 'valid_from', 'premium_year']
    },
    {
      family_key: 'question_answer',
      label: 'CAO PB vraagbaak/FAQ payroll interpretaties',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/cao/'
      ],
      required_source_types: ['faq_page', 'question_answer_page', 'cao_page'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'supporting',
      change_detection: ['content_hash', 'question_answer_section_hash'],
      watch_for_keywords: ['cao-vraagbaak', 'ziekte', 'vakantie', 'overwerk', 'minuren', 'feestdagen', 'pauze'],
      effective_date_fields: ['effective_from', 'interprets_article', 'published_at']
    },
    {
      family_key: 'social_committee',
      label: 'Sociale Commissie uitspraken',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Artikel_61_en_62_Feestdag_Vergoeding_Vakantietegoed_II.pdf',
        'https://www.beveiligingsbranche.nl/wp-content/uploads/Artikel_23_aantal_tijdvakken_parttimer_vast_model.pdf',
        'https://www.beveiligingsbranche.nl/cao/'
      ],
      required_source_types: ['sociale_commissie_page', 'sociale_commissie_pdf', 'sociale_commissie_decision_pdf'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl'],
      payroll_relevance: 'supporting',
      change_detection: ['content_hash', 'pdf_text_hash', 'decision_reference_hash'],
      watch_for_keywords: ['sociale commissie', 'uitspraak', 'feestdag', 'parttimer', 'tijdvakken'],
      effective_date_fields: ['decision_date', 'effective_from', 'interprets_article']
    },
    {
      family_key: 'news_updates',
      label: 'CAO PB nieuws, AVV en losse payroll updates',
      primary_urls: [
        'https://www.beveiligingsbranche.nl/loonstijging-per-loonperiode-1-2026-bekend/',
        'https://www.beveiligingsbranche.nl/cao-particuliere-beveiliging-algemeen-verbindend-verklaard/',
        'https://www.beveiligingsbranche.nl/actueel/cao/'
      ],
      required_source_types: ['news_page', 'news_update', 'ministerial_registration'],
      official_hosts: ['beveiligingsbranche.nl', 'www.beveiligingsbranche.nl', 'cao.minszw.nl', 'www.uitvoeringarbeidsvoorwaardenwetgeving.nl'],
      payroll_relevance: 'supporting',
      change_detection: ['content_hash', 'article_text_hash', 'linked_document_hashes'],
      watch_for_keywords: ['loonstijging', 'algemeen verbindend', 'staatscourant', 'vanaf', 'ingang van'],
      effective_date_fields: ['published_at', 'effective_from', 'valid_from', 'avv_effective_from']
    }
  ],
  [CAO_EVENT_HOSPITALITY_SECURITY_KEY]: [
    {
      family_key: 'cao_landing_page',
      label: 'CAO EHB overzichtspagina Nederlandse Veiligheidsbranche',
      primary_urls: [
        'https://www.veiligheidsbranche.nl/cao/cao-ehb/'
      ],
      required_source_types: ['cao_page', 'official_webpage'],
      official_hosts: ['veiligheidsbranche.nl', 'www.veiligheidsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'linked_document_hashes'],
      watch_for_keywords: ['cao ehb', 'evenementen', 'horecabeveiliging', 'versie januari 2026', '4,62%'],
      effective_date_fields: ['effective_from', 'valid_from', 'applies_from']
    },
    {
      family_key: 'main_cao_pdf',
      label: 'Hoofd-CAO Evenementen- en Horecabeveiliging PDF',
      primary_urls: [
        'https://d1p3jfjj2ztqji.cloudfront.net/wp-content/uploads/2025/12/16121903/CAO-EHB-2024-2027-januari-2026-.pdf',
        'https://d1p3jfjj2ztqji.cloudfront.net/wp-content/uploads/2025/07/07151312/CAO-EHB-2024-2027-juli-2025-schone-versie.pdf'
      ],
      required_source_types: ['cao_pdf'],
      official_hosts: ['veiligheidsbranche.nl', 'www.veiligheidsbranche.nl', 'd1p3jfjj2ztqji.cloudfront.net'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_text_hash', 'linked_from_landing_page_hash'],
      watch_for_keywords: ['2024', '2027', 'loonschalen', 'oproepkracht', 'vakantiebijslag'],
      effective_date_fields: ['valid_from', 'valid_until', 'effective_from']
    },
    {
      family_key: 'wage_and_version_updates',
      label: 'CAO EHB loon- en versie-updates',
      primary_urls: [
        'https://www.veiligheidsbranche.nl/cao/cao-ehb/',
        'https://www.veiligheidsbranche.nl/nieuws/'
      ],
      required_source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      official_hosts: ['veiligheidsbranche.nl', 'www.veiligheidsbranche.nl', 'd1p3jfjj2ztqji.cloudfront.net'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'numeric_parameter_hash', 'linked_document_hashes'],
      watch_for_keywords: ['4,62%', 'wml', 'minimumloon', 'loontreden', 'tredeverhoging', 'januari 2026'],
      effective_date_fields: ['effective_from', 'pay_period_effective_from', 'published_at']
    },
    {
      family_key: 'scope_membership_rule',
      label: 'CAO EHB werkingssfeer en lidmaatschapsvoorwaarde',
      primary_urls: [
        'https://www.veiligheidsbranche.nl/cao/cao-ehb/',
        'https://www.veiligheidsbranche.nl/ehb/'
      ],
      required_source_types: ['cao_page', 'official_webpage', 'cao_pdf'],
      official_hosts: ['veiligheidsbranche.nl', 'www.veiligheidsbranche.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'scope_text_hash'],
      watch_for_keywords: ['sectie ehb', 'aangesloten', 'evenementen', 'horeca', 'werkingssfeer'],
      effective_date_fields: ['effective_from', 'valid_from', 'membership_required_from']
    }
  ],
  [CAO_SAFETY_DOMAIN_KEY]: [
    {
      family_key: 'cao_landing_page',
      label: 'CAO Veiligheidsdomein overzichtspagina VVNL',
      primary_urls: [
        'https://veiligheidsdomein.nl/caoveiligheidsdomein/'
      ],
      required_source_types: ['cao_page', 'official_webpage'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'linked_document_hashes'],
      watch_for_keywords: ['cao veiligheidsdomein', '28 december 2025', '28 december 2027', '1 januari 2026', '4%'],
      effective_date_fields: ['effective_from', 'valid_from', 'applies_from']
    },
    {
      family_key: 'main_cao_pdf',
      label: 'Hoofd-CAO Veiligheidsdomein PDF',
      primary_urls: [
        'https://veiligheidsdomein.nl/wp-content/uploads/2026/01/Cao-Veiligheidsdomein-2025-2027-28-12.pdf',
        'https://veiligheidsdomein.nl/wp-content/uploads/2025/10/Principeakkoord-VVNL-en-vakbond-AVV_2025.pdf'
      ],
      required_source_types: ['cao_pdf'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_text_hash', 'linked_from_landing_page_hash'],
      watch_for_keywords: ['veiligheidsdomein', '2025', '2027', 'loontabel', 'reiskosten'],
      effective_date_fields: ['valid_from', 'valid_until', 'effective_from']
    },
    {
      family_key: 'wage_and_reimbursement_updates',
      label: 'CAO Veiligheidsdomein loon- en reiskostenupdates',
      primary_urls: [
        'https://veiligheidsdomein.nl/2025/10/29/akkoord-vvnl-en-vakbond-avv-over-nieuwe-cao-veiligheidsdomein-2025-2027/',
        'https://veiligheidsdomein.nl/caoveiligheidsdomein/'
      ],
      required_source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'numeric_parameter_hash', 'linked_document_hashes'],
      watch_for_keywords: ['2,5%', '4%', 'reiskosten', '0,23', '1 januari 2026', 'loonstijging'],
      effective_date_fields: ['effective_from', 'published_at', 'pay_period_effective_from']
    },
    {
      family_key: 'social_fund_sources',
      label: 'Sociaal Fonds Veiligheidsdomein bronnen',
      primary_urls: [
        'https://veiligheidsdomein.nl/caoveiligheidsdomein/',
        'https://veiligheidsdomein.nl/2025/10/29/akkoord-vvnl-en-vakbond-avv-over-nieuwe-cao-veiligheidsdomein-2025-2027/'
      ],
      required_source_types: ['fonds_cao_pdf', 'official_webpage', 'news_update'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'numeric_parameter_hash'],
      watch_for_keywords: ['sociaal fonds veiligheidsdomein', 'premie sociaal fonds', 'sociaalfonds'],
      effective_date_fields: ['effective_from', 'premium_year', 'valid_from']
    }
  ],
  [CAO_TRAFFIC_CONTROLLERS_KEY]: [
    {
      family_key: 'main_cao_pdf',
      label: 'Hoofd-CAO Verkeersregelaars PDF',
      primary_urls: [
        'https://veiligheidsdomein.nl/wp-content/uploads/2026/03/Cao-Veiligheidsdomein-voor-verkeersregelaars-2025-2027-versie-maart-2026.pdf'
      ],
      required_source_types: ['cao_pdf'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'pdf_text_hash', 'linked_from_landing_page_hash'],
      watch_for_keywords: ['verkeersregelaars', '2025', '2027', 'loontabel', 'nacht', 'weekend'],
      effective_date_fields: ['valid_from', 'valid_until', 'effective_from']
    },
    {
      family_key: 'current_version_or_landing_page',
      label: 'Actuele verkeersregelaars-CAO pagina of versiebron',
      primary_urls: [
        'https://veiligheidsdomein.nl/caoveiligheidsdomein/',
        'https://veiligheidsdomein.nl/2025/10/29/akkoord-vvnl-en-vakbond-avv-over-nieuwe-cao-veiligheidsdomein-2025-2027/'
      ],
      required_source_types: ['cao_page', 'official_webpage', 'cao_pdf'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl', 'jouwveiligheidsdomein.nl', 'www.jouwveiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'linked_document_hashes'],
      watch_for_keywords: ['verkeersregelaars', '28 december 2025', '2025-2027', 'versie maart 2026'],
      effective_date_fields: ['effective_from', 'valid_from', 'published_at']
    },
    {
      family_key: 'wage_and_scope_sources',
      label: 'Verkeersregelaars loon- en werkingssfeerbronnen',
      primary_urls: [
        'https://veiligheidsdomein.nl/wp-content/uploads/2026/03/Cao-Veiligheidsdomein-voor-verkeersregelaars-2025-2027-versie-maart-2026.pdf',
        'https://veiligheidsdomein.nl/2025/10/29/akkoord-vvnl-en-vakbond-avv-over-nieuwe-cao-veiligheidsdomein-2025-2027/'
      ],
      required_source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      official_hosts: ['veiligheidsdomein.nl', 'www.veiligheidsdomein.nl'],
      payroll_relevance: 'critical',
      change_detection: ['content_hash', 'numeric_parameter_hash', 'scope_text_hash'],
      watch_for_keywords: ['wml', '2,5%', 'nacht', '5%', 'weekend', '10%', 'werkingssfeer'],
      effective_date_fields: ['effective_from', 'pay_period_effective_from', 'published_at']
    }
  ]
};

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
    surface_key: 'planning_assignment_decision',
    function_name: 'resolveCaoPlanningAssignmentDecision',
    supported_cao_keys: [CAO_PB_KEY],
    required_for_payroll_final: true
  },
  {
    surface_key: 'cao_applicability',
    function_name: 'resolveCaoApplicability',
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
  },
  {
    surface_key: 'governance_compliance_policy',
    function_name: 'resolveCaoGovernanceCompliancePolicy',
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

function sourceMonitoringContractForCao(caoKey) {
  return SOURCE_MONITORING_CONTRACT_BY_CAO_KEY[normalizeCaoKey(caoKey)] || [];
}

function sourceMonitoringSummary(caoKey) {
  const contract = sourceMonitoringContractForCao(caoKey);
  const primaryUrls = unique(contract.flatMap(item => item.primary_urls || []));
  const officialHosts = unique(contract.flatMap(item => item.official_hosts || []));
  return {
    family_count: contract.length,
    family_keys: contract.map(item => item.family_key),
    primary_url_count: primaryUrls.length,
    primary_urls: primaryUrls,
    official_hosts: officialHosts,
    all_families_have_primary_url: contract.every(item => Array.isArray(item.primary_urls) && item.primary_urls.length > 0),
    all_families_have_change_detection: contract.every(item => Array.isArray(item.change_detection) && item.change_detection.length > 0),
    all_families_have_effective_date_fields: contract.every(item => Array.isArray(item.effective_date_fields) && item.effective_date_fields.length > 0)
  };
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
      source_monitoring_contract: [],
      source_monitoring_summary: sourceMonitoringSummary(key),
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
    source_monitoring_contract: sourceMonitoringContractForCao(key),
    source_monitoring_summary: sourceMonitoringSummary(key),
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

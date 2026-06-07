import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * syncCaoFromCloudflare
 * Haalt de owner-approved CAO op uit Cloudflare en synchroniseert naar Base44.
 * Standaard wordt alleen de payroll-ready configuratie plus een gehashte
 * CAORule-manifest registry opgeslagen. Volledige CAORule backfill blijft
 * optioneel voor audit/zoekschermen, maar blokkeert payroll niet.
 */

const PAYROLL_CRITICAL_DOMAINS = [
  'payroll', 'wage', 'wages', 'salary', 'loon', 'loontabel', 'allowance',
  'allowances', 'reimbursement', 'toeslag', 'surcharge', 'overtime',
  'overwerk', 'planning', 'schedule', 'rooster', 'contract', 'employment',
  'probation', 'proeftijd', 'dismissal', 'termination', 'opzegging',
  'leave', 'vacation', 'holiday', 'sickness', 'ziekte', 'pension', 'fund',
  'function_classification', 'classification', 'bijlage_2'
];

const CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS = {
  total: 2110,
  automatic_or_calculation: 852,
  validation_or_policy: 90,
  workflow_or_documentation: 84
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
const EXTERNAL_SECURITY_CAO_KEYS_REQUIRING_DECLARED_COVERAGE_BASELINE = KNOWN_SECURITY_CAO_KEYS
  .filter(key => key !== CAO_PB_KEY);
const CAO_DISPLAY_DEFAULTS = {
  [CAO_PB_KEY]: { name: 'CAO PB', display_name: 'CAO Particuliere Beveiliging', sector: 'Particuliere beveiliging' },
  [CAO_EVENT_HOSPITALITY_SECURITY_KEY]: { name: 'CAO Evenementen- en Horecabeveiliging', display_name: 'CAO Evenementen- en Horecabeveiliging', sector: 'Evenementen- en horecabeveiliging' },
  [CAO_TRAFFIC_CONTROLLERS_KEY]: { name: 'CAO Verkeersregelaars', display_name: 'CAO Verkeersregelaars', sector: 'Verkeersregelaars' },
  [CAO_SAFETY_DOMAIN_KEY]: { name: 'CAO Veiligheidsdomein', display_name: 'CAO Veiligheidsdomein', sector: 'Veiligheidsdomein' }
};

function normalizeCaoKey(value) {
  return String(value || '').trim();
}

function isKnownSecurityCaoKey(caoKey) {
  return KNOWN_SECURITY_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

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

const CAO_REQUIRED_SOURCE_FAMILIES_BY_KEY = {
  [CAO_PB_KEY]: CAO_PB_REQUIRED_SOURCE_FAMILIES,
  [CAO_EVENT_HOSPITALITY_SECURITY_KEY]: [
    {
      key: 'cao_landing_page',
      label: 'CAO EHB overzichtspagina Nederlandse Veiligheidsbranche',
      source_types: ['cao_page', 'official_webpage'],
      keywords: ['veiligheidsbranche.nl/cao/cao-ehb', 'cao-ehb', 'evenementen- en horecabeveiliging'],
      minimum_count: 1
    },
    {
      key: 'main_cao_pdf',
      label: 'Hoofd-CAO Evenementen- en Horecabeveiliging PDF',
      source_types: ['cao_pdf'],
      keywords: ['cao ehb', 'evenementen- en horecabeveiliging', 'horecabeveiligingsbranche'],
      minimum_count: 1
    },
    {
      key: 'wage_and_version_updates',
      label: 'CAO EHB loon-/versie-updates',
      source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      keywords: ['versie januari 2026', '4,62', 'wml', 'minimumloon', 'loontreden', 'tredeverhoging'],
      minimum_count: 1
    },
    {
      key: 'scope_membership_rule',
      label: 'CAO EHB werkingssfeer en lidmaatschapsvoorwaarde',
      source_types: ['cao_page', 'official_webpage', 'cao_pdf'],
      keywords: ['sectie ehb', 'aangesloten bij de nederlandse veiligheidsbranche', 'evenementen of in de horeca'],
      minimum_count: 1
    }
  ],
  [CAO_SAFETY_DOMAIN_KEY]: [
    {
      key: 'cao_landing_page',
      label: 'CAO Veiligheidsdomein overzichtspagina VVNL',
      source_types: ['cao_page', 'official_webpage'],
      keywords: ['veiligheidsdomein.nl/caoveiligheidsdomein', 'cao veiligheidsdomein', 'vvnl'],
      minimum_count: 1
    },
    {
      key: 'main_cao_pdf',
      label: 'Hoofd-CAO Veiligheidsdomein PDF',
      source_types: ['cao_pdf'],
      keywords: ['cao veiligheidsdomein', '28 december 2025', '28 december 2027'],
      minimum_count: 1
    },
    {
      key: 'wage_and_reimbursement_updates',
      label: 'CAO Veiligheidsdomein loon- en reiskostenupdates',
      source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      keywords: ['1 januari 2026', '4%', 'loonstijging', 'reiskosten', 'onderhandelingsakkoord'],
      minimum_count: 1
    },
    {
      key: 'social_fund_sources',
      label: 'Sociaal Fonds Veiligheidsdomein bronnen',
      source_types: ['fonds_cao_pdf', 'official_webpage', 'news_update'],
      keywords: ['sociaal fonds veiligheidsdomein', 'premie sociaal fonds', 'sociaalfonds'],
      minimum_count: 1
    }
  ],
  [CAO_TRAFFIC_CONTROLLERS_KEY]: [
    {
      key: 'main_cao_pdf',
      label: 'Hoofd-CAO Verkeersregelaars PDF',
      source_types: ['cao_pdf'],
      keywords: ['cao verkeersregelaars', 'verkeersregelaars', 'veiligheidsdomein - voor verkeersregelaars'],
      minimum_count: 1
    },
    {
      key: 'current_version_or_landing_page',
      label: 'Actuele verkeersregelaars-CAO pagina of versiebron',
      source_types: ['cao_page', 'official_webpage', 'cao_pdf'],
      keywords: ['28 december 2025', '2025-2027', 'jouwveiligheidsdomein.nl', 'veiligheidsdomein.nl', 'vvnl'],
      minimum_count: 1
    },
    {
      key: 'wage_and_scope_sources',
      label: 'Verkeersregelaars loon-/werkingsfeerbronnen',
      source_types: ['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'official_webpage', 'news_update'],
      keywords: ['loon', 'salaris', 'wml', 'werkingssfeer', 'aangesloten werkgevers', 'verkeersregeling'],
      minimum_count: 1
    }
  ]
};

const OFFICIAL_CAO_SOURCE_HOSTS = [
  'beveiligingsbranche.nl',
  'www.beveiligingsbranche.nl',
  'veiligheidsbranche.nl',
  'www.veiligheidsbranche.nl',
  'veiligheidsdomein.nl',
  'www.veiligheidsdomein.nl',
  'jouwveiligheidsdomein.nl',
  'www.jouwveiligheidsdomein.nl',
  'sociaalfondsbeveiliging.nl',
  'www.sociaalfondsbeveiliging.nl',
  'sfpb.nl',
  'www.sfpb.nl',
  'cao.minszw.nl',
  'www.uitvoeringarbeidsvoorwaardenwetgeving.nl'
];

const TRUSTED_OFFICIAL_CAO_CDN_HOSTS = [
  'd1p3jfjj2ztqji.cloudfront.net'
];

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

function inferOfficialSourceOrTrustedOfficialCdn(doc) {
  const url = doc?.canonical_url || doc?.url || '';
  if (inferOfficialSource(url)) return true;
  try {
    const host = typeof URL === 'function'
      ? new URL(url).hostname.toLowerCase()
      : String(url || '').replace(/^[a-z]+:\/\//i, '').split('/')[0].toLowerCase();
    const officialReferrer = inferOfficialSource(doc?.discovered_from_url || doc?.parent_url || '');
    return TRUSTED_OFFICIAL_CAO_CDN_HOSTS.includes(host) && officialReferrer;
  } catch (_) {
    return false;
  }
}

function getRequiredSourceFamiliesForCao(caoKey) {
  return CAO_REQUIRED_SOURCE_FAMILIES_BY_KEY[normalizeCaoKey(caoKey)] || [];
}

function caoLabel(caoKey) {
  const labels = {
    [CAO_PB_KEY]: 'CAO PB',
    [CAO_EVENT_HOSPITALITY_SECURITY_KEY]: 'CAO EHB',
    [CAO_TRAFFIC_CONTROLLERS_KEY]: 'CAO Verkeersregelaars',
    [CAO_SAFETY_DOMAIN_KEY]: 'CAO Veiligheidsdomein'
  };
  return labels[normalizeCaoKey(caoKey)] || `CAO ${normalizeCaoKey(caoKey) || 'onbekend'}`;
}

function normalizeOfficialConfidence(value, official) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['high', 'medium', 'low', 'unknown'].includes(normalized)) return normalized;
  return official ? 'high' : 'unknown';
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'ja', '1'].includes(normalized)) return true;
  if (['false', 'no', 'nee', '0'].includes(normalized)) return false;
  return null;
}

function normalizePayrollRelevance(value, sourceType) {
  if (value === true) return 'critical';
  if (value === false) return 'none';
  const normalized = String(value || '').trim().toLowerCase();
  if (['critical', 'supporting', 'reference', 'none', 'unknown'].includes(normalized)) return normalized;
  if (['cao_pdf', 'wage_table_pdf', 'wage_table_xlsx', 'pay_periods_pdf', 'pay_periods_xlsx', 'fonds_cao_pdf'].includes(sourceType)) return 'critical';
  if (['faq_page', 'question_answer_page', 'sociale_commissie_page', 'sociale_commissie_pdf', 'sociale_commissie_decision_pdf', 'news_page', 'news_update'].includes(sourceType)) return 'supporting';
  if (['cao_page', 'official_webpage', 'protocol_pdf', 'appendix_pdf', 'ministerial_registration'].includes(sourceType)) return 'reference';
  return 'unknown';
}

function normalizeMonitoringFrequency(value, relevance) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['monthly', 'weekly', 'manual', 'on_change', 'none'].includes(normalized)) return normalized;
  return relevance === 'none' ? 'none' : 'monthly';
}

function normalizeExtractionStatus(value, fallback = 'ok') {
  const normalized = String(value || fallback || '').trim().toLowerCase();
  return ['pending', 'ok', 'failed', 'manual_review_required'].includes(normalized) ? normalized : fallback;
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
    doc?.discovered_from_url,
    doc?.rule_text_summary,
    doc?.extracted_text_summary,
    doc?.content_summary,
    doc?.extracted_text
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
  return inferOfficialSourceOrTrustedOfficialCdn(doc);
}

function sourceDocumentExtractionBlocks(doc) {
  const status = String(doc?.extraction_status || doc?.parse_status || '').toLowerCase();
  return ['pending', 'failed', 'manual_review_required'].includes(status);
}

function evaluateRequiredSourceFamilyCoverage(config) {
  const caoKey = normalizeCaoKey(config?.cao_key) || CAO_PB_KEY;
  const sourceDocuments = getSourceDocumentsForCoverage(config);
  const requiredSourceFamilies = getRequiredSourceFamiliesForCao(caoKey);
  if (requiredSourceFamilies.length === 0) {
    return {
      passed: true,
      required: false,
      source_document_count: sourceDocuments.length,
      required_families: [],
      missing_families: [],
      blocking_findings: []
    };
  }

  const requiredFamilies = requiredSourceFamilies.map(family => {
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
      message: `${caoLabel(caoKey)} bronmonitoring mist verplichte bronfamilies: ${missingFamilies.map(family => family.label).join(', ')}. Payroll-ready blijft geblokkeerd.`
    });
  }
  if (unofficialFamilies.length > 0) {
    blockingFindings.push({
      code: 'unverified_required_cao_source_officiality',
      severity: 'critical',
      message: `${caoLabel(caoKey)} bronmonitoring bevat bronfamilies zonder bewezen officiele bron: ${unofficialFamilies.map(family => family.label).join(', ')}.`
    });
  }
  if (missingHashFamilies.length > 0) {
    blockingFindings.push({
      code: 'missing_required_cao_source_hash',
      severity: 'critical',
      message: `${caoLabel(caoKey)} bronmonitoring mist hashbewijs voor verplichte bronfamilies: ${missingHashFamilies.map(family => family.label).join(', ')}. Wijzigingen zijn dan niet audit-proof detecteerbaar.`
    });
  }
  if (extractionBlockedFamilies.length > 0) {
    blockingFindings.push({
      code: 'blocked_required_cao_source_extraction',
      severity: 'critical',
      message: `${caoLabel(caoKey)} bronmonitoring heeft onvolledig of mislukt extractiewerk voor: ${extractionBlockedFamilies.map(family => family.label).join(', ')}.`
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

function buildCaoSourceDocumentData(doc, existingDoc, { now, caoKey, revision, defaultSourceType = 'other' }) {
  const sourceType = normalizeCaoSourceType(
    doc.source_type || doc.document_type || doc.type || doc.source_category,
    doc,
    defaultSourceType
  );
  const explicitOfficial = booleanOrNull(doc.is_official_source ?? doc.official_source);
  const official = explicitOfficial ?? inferOfficialSourceOrTrustedOfficialCdn(doc);
  const payrollRelevance = normalizePayrollRelevance(doc.payroll_relevance ?? doc.payroll_relevant, sourceType);
  const contentHash = doc.content_hash || doc.source_hash || doc.sha256 || doc.content_sha256 || existingDoc?.content_hash || null;
  const changed = doc.changed === true ||
    Boolean(existingDoc?.content_hash && contentHash && existingDoc.content_hash !== contentHash);
  const previousContentHash = changed && existingDoc?.content_hash && existingDoc.content_hash !== contentHash
    ? existingDoc.content_hash
    : (doc.previous_content_hash || existingDoc?.previous_content_hash || null);
  const explicitMonitoringRequired = booleanOrNull(doc.monitoring_required);
  const monitoringRequired = explicitMonitoringRequired !== null
    ? explicitMonitoringRequired
    : payrollRelevance !== 'none';
  const extractionStatus = normalizeExtractionStatus(doc.extraction_status || doc.parse_status || existingDoc?.extraction_status || 'ok');
  const extractionError = doc.extraction_error || doc.parse_error || (extractionStatus === 'ok' ? null : existingDoc?.extraction_error || null);

  return {
    title: doc.title || existingDoc?.title || doc.url,
    url: doc.url,
    canonical_url: doc.canonical_url || doc.canonicalUrl || existingDoc?.canonical_url || doc.url,
    cao_key: normalizeCaoKey(doc.cao_key) || caoKey,
    source_type: sourceType,
    source_category: doc.source_category || doc.category || doc.document_category || sourceType,
    status: 'active',
    is_official_source: official === true,
    official_source_confidence: normalizeOfficialConfidence(doc.official_source_confidence, official),
    payroll_relevance: payrollRelevance,
    monitoring_required: monitoringRequired,
    monitoring_frequency: normalizeMonitoringFrequency(doc.monitoring_frequency, payrollRelevance),
    source_priority: doc.source_priority ?? existingDoc?.source_priority ?? null,
    discovered_from_url: doc.discovered_from_url || doc.parent_url || existingDoc?.discovered_from_url || null,
    published_at: doc.published_at || existingDoc?.published_at || null,
    retrieved_at: doc.retrieved_at || doc.fetched_at || now,
    valid_from: doc.valid_from || existingDoc?.valid_from || null,
    valid_until: doc.valid_until || existingDoc?.valid_until || null,
    content_hash: contentHash,
    hash_algorithm: doc.hash_algorithm || doc.content_hash_algorithm || existingDoc?.hash_algorithm || (contentHash ? 'sha256' : null),
    previous_content_hash: previousContentHash,
    extracted_text_hash: doc.extracted_text_hash || doc.text_hash || existingDoc?.extracted_text_hash || null,
    etag: doc.etag || existingDoc?.etag || null,
    last_modified: doc.last_modified || existingDoc?.last_modified || null,
    first_seen_at: existingDoc?.first_seen_at || doc.first_seen_at || now,
    last_checked_at: doc.last_checked_at || now,
    last_changed_at: changed ? now : (doc.last_changed_at || existingDoc?.last_changed_at || null),
    file_url: doc.file_url || existingDoc?.file_url || null,
    extracted_text: doc.extracted_text ?? existingDoc?.extracted_text ?? null,
    extraction_status: extractionStatus,
    extraction_error: extractionError,
    parse_warnings: doc.parse_warnings || doc.extraction_warnings || existingDoc?.parse_warnings || null,
    coverage_scope: doc.coverage_scope || doc.rule_coverage_scope || existingDoc?.coverage_scope || null,
    source_revision: revision || doc.source_revision || existingDoc?.source_revision || null
  };
}

function buildCaoSourceDocumentSnapshot(docData, id) {
  const { extracted_text, extraction_error, ...snapshot } = docData;
  return { id, ...snapshot };
}

function getCaoDisplayDefaults(caoKey) {
  return CAO_DISPLAY_DEFAULTS[normalizeCaoKey(caoKey)] || {
    name: `CAO ${normalizeCaoKey(caoKey) || 'onbekend'}`,
    display_name: `CAO ${normalizeCaoKey(caoKey) || 'onbekend'}`,
    sector: null
  };
}

function hasLocalPayrollRuntime(caoKey) {
  return LOCAL_PAYROLL_RUNTIME_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

function localRuleIds(...ids) {
  return ids.map(id => `CAO-PB-2024-R${String(id).padStart(4, '0')}`);
}

function localRuleRange(start, end, excluded = []) {
  const excludedSet = new Set(excluded);
  const ids = [];
  for (let number = start; number <= end; number += 1) {
    if (!excludedSet.has(number)) ids.push(`CAO-PB-2024-R${String(number).padStart(4, '0')}`);
  }
  return ids;
}

const HIGH_IMPACT_REFERENCE_POLICY_RULE_IDS = [
  ...localRuleIds(176),
  ...localRuleRange(296, 300),
  ...localRuleRange(302, 304),
  ...localRuleRange(307, 308),
  ...localRuleIds(336),
  ...localRuleRange(340, 341),
  ...localRuleIds(344, 348, 366, 370, 375, 379),
  ...localRuleRange(381, 386),
  ...localRuleIds(395, 400, 406, 413, 416),
  ...localRuleRange(439, 444),
  ...localRuleRange(449, 450),
  ...localRuleIds(452),
  ...localRuleRange(454, 455),
  ...localRuleRange(457, 460),
  ...localRuleIds(463, 546),
  ...localRuleRange(550, 551),
  ...localRuleIds(554),
  ...localRuleRange(558, 559),
  ...localRuleRange(717, 718),
  ...localRuleRange(726, 727),
  ...localRuleIds(730, 732),
  ...localRuleRange(735, 737),
  ...localRuleIds(754, 756),
  ...localRuleRange(758, 759),
  ...localRuleIds(763),
  ...localRuleRange(768, 769),
  ...localRuleIds(809, 819, 846, 848),
  ...localRuleRange(850, 852),
  ...localRuleIds(863, 871),
  ...localRuleRange(874, 876),
  ...localRuleIds(886, 929),
  ...localRuleRange(933, 936),
  ...localRuleIds(948),
  ...localRuleRange(954, 955),
  ...localRuleIds(961, 963, 967, 969, 988, 990, 996, 1020),
  ...localRuleRange(1023, 1030),
  ...localRuleIds(1048, 1051, 1055, 1063, 1069, 1131),
  ...localRuleRange(1138, 1146),
  ...localRuleIds(1194, 1199, 1201),
  ...localRuleRange(1203, 1209),
  ...localRuleRange(1212, 1213),
  ...localRuleIds(1216),
  ...localRuleRange(1219, 1220),
  ...localRuleIds(1228, 1236),
  ...localRuleRange(1238, 1241),
  ...localRuleIds(1243, 1247),
  ...localRuleRange(1249, 1252),
  ...localRuleIds(1269, 1295),
  ...localRuleRange(1341, 1342),
  ...localRuleRange(1352, 1353),
  ...localRuleIds(1397, 1429, 1462, 1487),
  ...localRuleRange(1503, 1505),
  ...localRuleIds(1507, 1512, 1572, 1590),
  ...localRuleRange(1603, 1604),
  ...localRuleIds(1643, 1650, 1663, 1672, 1687, 1710, 1713, 1715),
  ...localRuleRange(1761, 1762),
  ...localRuleIds(1809, 1839),
  ...localRuleRange(1851, 1852),
  ...localRuleIds(1854),
  ...localRuleRange(1866, 1867),
  ...localRuleIds(1876, 1878, 1880, 1901, 1922, 1924, 1926),
  ...localRuleRange(1930, 1931),
  ...localRuleIds(1933),
  ...localRuleRange(1954, 1955),
  ...localRuleIds(1969, 1996, 1999, 2014, 2037),
  ...localRuleRange(2082, 2083),
  ...localRuleIds(2106)
];

const LOCAL_RUNTIME_RULE_BINDINGS = {
  'resolveCaoPolicyReferenceContext.high_impact_reference_policy_context': {
    functions: ['resolveCaoPolicyReferenceContext'],
    rule_ids: HIGH_IMPACT_REFERENCE_POLICY_RULE_IDS
  },
  'resolveCaoApplicability.article_3_scope': {
    functions: ['resolveCaoApplicability', 'validateTaskPlanningContext', 'calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
      'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
      'CAO-PB-2024-R0233'
    ]
  },
  'validateCaoScheduleRules.article_1_planning_payroll_definitions': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateCaoLeaveAndSickness'],
    rule_ids: [
      'CAO-PB-2024-R0171', 'CAO-PB-2024-R0172', 'CAO-PB-2024-R0174',
      'CAO-PB-2024-R0175', 'CAO-PB-2024-R0177', 'CAO-PB-2024-R0182',
      'CAO-PB-2024-R0184', 'CAO-PB-2024-R0185', 'CAO-PB-2024-R0186',
      'CAO-PB-2024-R0187', 'CAO-PB-2024-R0188', 'CAO-PB-2024-R0189',
      'CAO-PB-2024-R0190', 'CAO-PB-2024-R0191', 'CAO-PB-2024-R0192',
      'CAO-PB-2024-R0193', 'CAO-PB-2024-R0194', 'CAO-PB-2024-R0195',
      'CAO-PB-2024-R0196', 'CAO-PB-2024-R0197', 'CAO-PB-2024-R0198',
      'CAO-PB-2024-R0199', 'CAO-PB-2024-R0200', 'CAO-PB-2024-R0201',
      'CAO-PB-2024-R0202', 'CAO-PB-2024-R0203', 'CAO-PB-2024-R0204',
      'CAO-PB-2024-R0205', 'CAO-PB-2024-R0206', 'CAO-PB-2024-R0208',
      'CAO-PB-2024-R0209', 'CAO-PB-2024-R0210', 'CAO-PB-2024-R0211'
    ]
  },
  'applyCaoContractRules.probation_and_probation_dismissal': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0313', 'CAO-PB-2024-R0314',
      'CAO-PB-2024-R0315', 'CAO-PB-2024-R0316', 'CAO-PB-2024-R0317',
      'CAO-PB-2024-R0318', 'CAO-PB-2024-R0319', 'CAO-PB-2024-R0320',
      'CAO-PB-2024-R0321', 'CAO-PB-2024-R0322'
    ]
  },
  'applyCaoContractRules.fulltime_parttime_contract_model_articles_10_11': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0309', 'CAO-PB-2024-R0310',
      'CAO-PB-2024-R0337', 'CAO-PB-2024-R0339',
      'CAO-PB-2024-R0342', 'CAO-PB-2024-R0343',
      'CAO-PB-2024-R0345', 'CAO-PB-2024-R0347',
      'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359'
    ]
  },
  'applyCaoContractRules.parttime_workload_change_articles_11_12': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0349', 'CAO-PB-2024-R0350', 'CAO-PB-2024-R0351',
      'CAO-PB-2024-R0352', 'CAO-PB-2024-R0353', 'CAO-PB-2024-R0354',
      'CAO-PB-2024-R0355', 'CAO-PB-2024-R0356', 'CAO-PB-2024-R0357',
      'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359', 'CAO-PB-2024-R0360',
      'CAO-PB-2024-R0361', 'CAO-PB-2024-R0362', 'CAO-PB-2024-R0363',
      'CAO-PB-2024-R0364', 'CAO-PB-2024-R0365', 'CAO-PB-2024-R0367',
      'CAO-PB-2024-R0368', 'CAO-PB-2024-R0369'
    ]
  },
  'applyCaoContractRules.contract_clauses_and_termination_article_9': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0236', 'CAO-PB-2024-R0311', 'CAO-PB-2024-R0312',
      'CAO-PB-2024-R0323', 'CAO-PB-2024-R0324', 'CAO-PB-2024-R0325',
      'CAO-PB-2024-R0326', 'CAO-PB-2024-R0327', 'CAO-PB-2024-R0328',
      'CAO-PB-2024-R0329', 'CAO-PB-2024-R0330', 'CAO-PB-2024-R0331',
      'CAO-PB-2024-R0332', 'CAO-PB-2024-R0333', 'CAO-PB-2024-R0334',
      'CAO-PB-2024-R0335'
    ]
  },
  'applyCaoContractRules.call_agreement_article_13': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0371',
      'CAO-PB-2024-R0372', 'CAO-PB-2024-R0373', 'CAO-PB-2024-R0374',
      'CAO-PB-2024-R0376', 'CAO-PB-2024-R0377', 'CAO-PB-2024-R0378', 'CAO-PB-2024-R0380',
      'CAO-PB-2024-R0387', 'CAO-PB-2024-R0388', 'CAO-PB-2024-R0389',
      'CAO-PB-2024-R0390', 'CAO-PB-2024-R0391', 'CAO-PB-2024-R0392',
      'CAO-PB-2024-R0393', 'CAO-PB-2024-R0394', 'CAO-PB-2024-R0396',
      'CAO-PB-2024-R0397', 'CAO-PB-2024-R0398', 'CAO-PB-2024-R0399'
    ]
  },
  'applyCaoContractRules.internship_article_14': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0401', 'CAO-PB-2024-R0402', 'CAO-PB-2024-R0403',
      'CAO-PB-2024-R0404', 'CAO-PB-2024-R0405', 'CAO-PB-2024-R0407',
      'CAO-PB-2024-R0408', 'CAO-PB-2024-R0409', 'CAO-PB-2024-R0410',
      'CAO-PB-2024-R0411', 'CAO-PB-2024-R0412', 'CAO-PB-2024-R0414',
      'CAO-PB-2024-R0415', 'CAO-PB-2024-R0417', 'CAO-PB-2024-R0418',
      'CAO-PB-2024-R0419', 'CAO-PB-2024-R0420', 'CAO-PB-2024-R0421',
      'CAO-PB-2024-R0422'
    ]
  },
  'applyCaoContractRules.hired_worker_article_15': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0423', 'CAO-PB-2024-R0424', 'CAO-PB-2024-R0425',
      'CAO-PB-2024-R0426', 'CAO-PB-2024-R0427', 'CAO-PB-2024-R0428',
      'CAO-PB-2024-R0429', 'CAO-PB-2024-R0430', 'CAO-PB-2024-R0431',
      'CAO-PB-2024-R0432', 'CAO-PB-2024-R0433', 'CAO-PB-2024-R0434',
      'CAO-PB-2024-R0435', 'CAO-PB-2024-R0436', 'CAO-PB-2024-R0437',
      'CAO-PB-2024-R0438'
    ]
  },
  'applyCaoContractRules.suspension_article_16': {
    functions: ['applyCaoContractRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0445', 'CAO-PB-2024-R0446',
      'CAO-PB-2024-R0447', 'CAO-PB-2024-R0448', 'CAO-PB-2024-R0451',
      'CAO-PB-2024-R1605'
    ]
  },
  'applyCaoContractRules.contract_transfer_articles_18_20': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0464', 'CAO-PB-2024-R0465', 'CAO-PB-2024-R0466',
      'CAO-PB-2024-R0467', 'CAO-PB-2024-R0468', 'CAO-PB-2024-R0469',
      'CAO-PB-2024-R0470', 'CAO-PB-2024-R0471', 'CAO-PB-2024-R0472',
      'CAO-PB-2024-R0473', 'CAO-PB-2024-R0474', 'CAO-PB-2024-R0475',
      'CAO-PB-2024-R0476', 'CAO-PB-2024-R0477', 'CAO-PB-2024-R0478',
      'CAO-PB-2024-R0479', 'CAO-PB-2024-R0480', 'CAO-PB-2024-R0481',
      'CAO-PB-2024-R0482', 'CAO-PB-2024-R0483', 'CAO-PB-2024-R0484',
      'CAO-PB-2024-R0485', 'CAO-PB-2024-R0486', 'CAO-PB-2024-R0487',
      'CAO-PB-2024-R0488', 'CAO-PB-2024-R0489', 'CAO-PB-2024-R0490',
      'CAO-PB-2024-R0491', 'CAO-PB-2024-R0492', 'CAO-PB-2024-R0493',
      'CAO-PB-2024-R0494', 'CAO-PB-2024-R0495', 'CAO-PB-2024-R0496',
      'CAO-PB-2024-R0497', 'CAO-PB-2024-R0498', 'CAO-PB-2024-R0499',
      'CAO-PB-2024-R0500', 'CAO-PB-2024-R0501', 'CAO-PB-2024-R0502',
      'CAO-PB-2024-R0503', 'CAO-PB-2024-R0504', 'CAO-PB-2024-R0505',
      'CAO-PB-2024-R0506', 'CAO-PB-2024-R0507', 'CAO-PB-2024-R0508',
      'CAO-PB-2024-R0509', 'CAO-PB-2024-R0510', 'CAO-PB-2024-R0511',
      'CAO-PB-2024-R0512', 'CAO-PB-2024-R0513', 'CAO-PB-2024-R0514',
      'CAO-PB-2024-R0515', 'CAO-PB-2024-R0516', 'CAO-PB-2024-R0517',
      'CAO-PB-2024-R0518', 'CAO-PB-2024-R0519', 'CAO-PB-2024-R0520',
      'CAO-PB-2024-R0521', 'CAO-PB-2024-R0522', 'CAO-PB-2024-R0523',
      'CAO-PB-2024-R0524', 'CAO-PB-2024-R0525', 'CAO-PB-2024-R0526',
      'CAO-PB-2024-R0527', 'CAO-PB-2024-R0528', 'CAO-PB-2024-R0529',
      'CAO-PB-2024-R0530', 'CAO-PB-2024-R0531', 'CAO-PB-2024-R0532',
      'CAO-PB-2024-R0533', 'CAO-PB-2024-R0534', 'CAO-PB-2024-R0535',
      'CAO-PB-2024-R0536', 'CAO-PB-2024-R0537', 'CAO-PB-2024-R0538',
      'CAO-PB-2024-R0539', 'CAO-PB-2024-R0540', 'CAO-PB-2024-R0541',
      'CAO-PB-2024-R0542', 'CAO-PB-2024-R0543', 'CAO-PB-2024-R0544',
      'CAO-PB-2024-R0545'
    ]
  },
  'validateCaoScheduleRules.roster_period_constraints': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0547', 'CAO-PB-2024-R0548', 'CAO-PB-2024-R0549',
      'CAO-PB-2024-R0552', 'CAO-PB-2024-R0553', 'CAO-PB-2024-R0555',
      'CAO-PB-2024-R0556', 'CAO-PB-2024-R0557',
      'CAO-PB-2024-R0560', 'CAO-PB-2024-R0561',
      'CAO-PB-2024-R0562', 'CAO-PB-2024-R0563', 'CAO-PB-2024-R0564',
      'CAO-PB-2024-R0565', 'CAO-PB-2024-R0566', 'CAO-PB-2024-R0567',
      'CAO-PB-2024-R0568', 'CAO-PB-2024-R0569', 'CAO-PB-2024-R0570',
      'CAO-PB-2024-R0571', 'CAO-PB-2024-R0572', 'CAO-PB-2024-R0573',
      'CAO-PB-2024-R0574', 'CAO-PB-2024-R0575', 'CAO-PB-2024-R0576',
      'CAO-PB-2024-R0577', 'CAO-PB-2024-R0578', 'CAO-PB-2024-R0579',
      'CAO-PB-2024-R0580', 'CAO-PB-2024-R0581', 'CAO-PB-2024-R0582',
      'CAO-PB-2024-R0583', 'CAO-PB-2024-R0584', 'CAO-PB-2024-R0585',
      'CAO-PB-2024-R0586', 'CAO-PB-2024-R0587', 'CAO-PB-2024-R0588',
      'CAO-PB-2024-R0589', 'CAO-PB-2024-R0590', 'CAO-PB-2024-R0591',
      'CAO-PB-2024-R0592', 'CAO-PB-2024-R0593', 'CAO-PB-2024-R0594',
      'CAO-PB-2024-R0595', 'CAO-PB-2024-R0596', 'CAO-PB-2024-R0597',
      'CAO-PB-2024-R0598', 'CAO-PB-2024-R0599', 'CAO-PB-2024-R0600',
      'CAO-PB-2024-R0601', 'CAO-PB-2024-R0602', 'CAO-PB-2024-R0603',
      'CAO-PB-2024-R0604', 'CAO-PB-2024-R0605', 'CAO-PB-2024-R0606',
      'CAO-PB-2024-R0607', 'CAO-PB-2024-R0608', 'CAO-PB-2024-R0609',
      'CAO-PB-2024-R0610', 'CAO-PB-2024-R0611', 'CAO-PB-2024-R0612',
      'CAO-PB-2024-R0613', 'CAO-PB-2024-R0614', 'CAO-PB-2024-R0615',
      'CAO-PB-2024-R0616', 'CAO-PB-2024-R0617', 'CAO-PB-2024-R0618',
      'CAO-PB-2024-R0619', 'CAO-PB-2024-R0620', 'CAO-PB-2024-R0621',
      'CAO-PB-2024-R0622', 'CAO-PB-2024-R0623', 'CAO-PB-2024-R0624',
      'CAO-PB-2024-R0625', 'CAO-PB-2024-R0626', 'CAO-PB-2024-R0627',
      'CAO-PB-2024-R0628', 'CAO-PB-2024-R0629', 'CAO-PB-2024-R0630',
      'CAO-PB-2024-R0631', 'CAO-PB-2024-R0632', 'CAO-PB-2024-R0633',
      'CAO-PB-2024-R0634', 'CAO-PB-2024-R0635', 'CAO-PB-2024-R0636',
      'CAO-PB-2024-R0637', 'CAO-PB-2024-R0638', 'CAO-PB-2024-R0639',
      'CAO-PB-2024-R0640', 'CAO-PB-2024-R0641', 'CAO-PB-2024-R0642',
      'CAO-PB-2024-R0643', 'CAO-PB-2024-R0644', 'CAO-PB-2024-R0645',
      'CAO-PB-2024-R0646', 'CAO-PB-2024-R0647', 'CAO-PB-2024-R0648',
      'CAO-PB-2024-R0649', 'CAO-PB-2024-R0650', 'CAO-PB-2024-R0651',
      'CAO-PB-2024-R0652', 'CAO-PB-2024-R0653', 'CAO-PB-2024-R0654',
      'CAO-PB-2024-R0655', 'CAO-PB-2024-R0656', 'CAO-PB-2024-R0657',
      'CAO-PB-2024-R0658', 'CAO-PB-2024-R0659', 'CAO-PB-2024-R0660',
      'CAO-PB-2024-R0661', 'CAO-PB-2024-R0662', 'CAO-PB-2024-R0663',
      'CAO-PB-2024-R0664', 'CAO-PB-2024-R0665', 'CAO-PB-2024-R0666',
      'CAO-PB-2024-R0667', 'CAO-PB-2024-R0668', 'CAO-PB-2024-R0669',
      'CAO-PB-2024-R0670', 'CAO-PB-2024-R0671', 'CAO-PB-2024-R0672',
      'CAO-PB-2024-R0673', 'CAO-PB-2024-R0674', 'CAO-PB-2024-R0675',
      'CAO-PB-2024-R0676', 'CAO-PB-2024-R0677', 'CAO-PB-2024-R0678',
      'CAO-PB-2024-R0679', 'CAO-PB-2024-R0680', 'CAO-PB-2024-R0681',
      'CAO-PB-2024-R0682', 'CAO-PB-2024-R0683', 'CAO-PB-2024-R0684',
      'CAO-PB-2024-R0685', 'CAO-PB-2024-R0686', 'CAO-PB-2024-R0687',
      'CAO-PB-2024-R0688', 'CAO-PB-2024-R0689', 'CAO-PB-2024-R0690',
      'CAO-PB-2024-R0691', 'CAO-PB-2024-R0692', 'CAO-PB-2024-R0693',
      'CAO-PB-2024-R0694', 'CAO-PB-2024-R0695', 'CAO-PB-2024-R0696',
      'CAO-PB-2024-R0697', 'CAO-PB-2024-R0698', 'CAO-PB-2024-R0699',
      'CAO-PB-2024-R0700', 'CAO-PB-2024-R0701', 'CAO-PB-2024-R0702',
      'CAO-PB-2024-R0703', 'CAO-PB-2024-R0704', 'CAO-PB-2024-R0705',
      'CAO-PB-2024-R0706', 'CAO-PB-2024-R0707', 'CAO-PB-2024-R0708',
      'CAO-PB-2024-R0709', 'CAO-PB-2024-R0710', 'CAO-PB-2024-R0711',
      'CAO-PB-2024-R0712', 'CAO-PB-2024-R0713'
    ]
  },
  'resolveCaoFunctionClassification.appendix_2_wage_scales': {
    functions: ['resolveCaoApplicability', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0714', 'CAO-PB-2024-R0715', 'CAO-PB-2024-R0716',
      'CAO-PB-2024-R0728', 'CAO-PB-2024-R0729', 'CAO-PB-2024-R0731',
      'CAO-PB-2024-R0733', 'CAO-PB-2024-R0734', 'CAO-PB-2024-R0738',
      'CAO-PB-2024-R0739', 'CAO-PB-2024-R0740', 'CAO-PB-2024-R0741',
      'CAO-PB-2024-R0742', 'CAO-PB-2024-R0743', 'CAO-PB-2024-R0744',
      'CAO-PB-2024-R0745', 'CAO-PB-2024-R0746', 'CAO-PB-2024-R0747',
      'CAO-PB-2024-R1751', 'CAO-PB-2024-R1813'
    ]
  },
  'calculatePersonnelCosts.article_35_36_wage_promotion': {
    functions: ['applyCaoContractRules', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0748', 'CAO-PB-2024-R0749', 'CAO-PB-2024-R0750',
      'CAO-PB-2024-R0751', 'CAO-PB-2024-R0752', 'CAO-PB-2024-R0753',
      'CAO-PB-2024-R0755', 'CAO-PB-2024-R0757'
    ]
  },
  'calculatePersonnelCosts.article_37_wage_increases': {
    functions: ['calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0760', 'CAO-PB-2024-R0761', 'CAO-PB-2024-R0762',
      'CAO-PB-2024-R0764', 'CAO-PB-2024-R0765', 'CAO-PB-2024-R0766',
      'CAO-PB-2024-R0767'
    ]
  },
  'calculatePersonnelCosts.article_39_acting_function_allowance': {
    functions: ['resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0775', 'CAO-PB-2024-R0776', 'CAO-PB-2024-R0777',
      'CAO-PB-2024-R0778', 'CAO-PB-2024-R0779', 'CAO-PB-2024-R0780',
      'CAO-PB-2024-R0781', 'CAO-PB-2024-R0782', 'CAO-PB-2024-R0783'
    ]
  },
  'calculatePersonnelCosts.article_40_41_special_holiday_surcharges': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0719', 'CAO-PB-2024-R0720', 'CAO-PB-2024-R0721',
      'CAO-PB-2024-R0722', 'CAO-PB-2024-R0723', 'CAO-PB-2024-R0724',
      'CAO-PB-2024-R0725', 'CAO-PB-2024-R0774', 'CAO-PB-2024-R0784',
      'CAO-PB-2024-R0785', 'CAO-PB-2024-R0786', 'CAO-PB-2024-R0787',
      'CAO-PB-2024-R0788', 'CAO-PB-2024-R0789', 'CAO-PB-2024-R0790',
      'CAO-PB-2024-R0791', 'CAO-PB-2024-R0792', 'CAO-PB-2024-R0793',
      'CAO-PB-2024-R0794', 'CAO-PB-2024-R0795', 'CAO-PB-2024-R0796',
      'CAO-PB-2024-R0798', 'CAO-PB-2024-R0808'
    ]
  },
  'calculateCaoYearEndBonus.article_38_year_end_bonus': {
    functions: ['calculatePersonnelCosts', 'calculateCaoYearEndBonus', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0770', 'CAO-PB-2024-R0771',
      'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773'
    ]
  },
  'calculatePersonnelCosts.article_25_general_reserve_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ['CAO-PB-2024-R0605', 'CAO-PB-2024-R0606']
  },
  'calculatePersonnelCosts.article_42_overtime_payroll': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ['CAO-PB-2024-R0797']
  },
  'calculatePersonnelCosts.article_43_44_shift_change_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0576', 'CAO-PB-2024-R0580', 'CAO-PB-2024-R0585',
      'CAO-PB-2024-R0586', 'CAO-PB-2024-R0606',
      'CAO-PB-2024-R0799', 'CAO-PB-2024-R0800', 'CAO-PB-2024-R0801',
      'CAO-PB-2024-R0802', 'CAO-PB-2024-R0803', 'CAO-PB-2024-R0804',
      'CAO-PB-2024-R0805', 'CAO-PB-2024-R0806', 'CAO-PB-2024-R0807'
    ]
  },
  'calculatePersonnelCosts.article_45_minimum_service_compensation': {
    functions: ['calculatePersonnelCosts', 'validateCaoScheduleRules', 'calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R0810', 'CAO-PB-2024-R0811', 'CAO-PB-2024-R0812',
      'CAO-PB-2024-R0813', 'CAO-PB-2024-R0814', 'CAO-PB-2024-R0815',
      'CAO-PB-2024-R0816', 'CAO-PB-2024-R0817', 'CAO-PB-2024-R0818'
    ]
  },
  'calculatePersonnelCosts.article_46_income_structure_phase_out': {
    functions: ['calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0820', 'CAO-PB-2024-R0821', 'CAO-PB-2024-R0822',
      'CAO-PB-2024-R0823', 'CAO-PB-2024-R0824', 'CAO-PB-2024-R0825',
      'CAO-PB-2024-R0826', 'CAO-PB-2024-R0827', 'CAO-PB-2024-R0828',
      'CAO-PB-2024-R0829', 'CAO-PB-2024-R0830', 'CAO-PB-2024-R0831',
      'CAO-PB-2024-R0832', 'CAO-PB-2024-R0833', 'CAO-PB-2024-R0834',
      'CAO-PB-2024-R0835', 'CAO-PB-2024-R0836'
    ]
  },
  'calculateCaoReimbursements.article_47_48_49_50': {
    functions: ['calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R0855', 'CAO-PB-2024-R0859', 'CAO-PB-2024-R0860',
      'CAO-PB-2024-R0865', 'CAO-PB-2024-R0866', 'CAO-PB-2024-R0867',
      'CAO-PB-2024-R0869', 'CAO-PB-2024-R0870', 'CAO-PB-2024-R0872',
      'CAO-PB-2024-R0873', 'CAO-PB-2024-R0878', 'CAO-PB-2024-R0880',
      'CAO-PB-2024-R0885', 'CAO-PB-2024-R0890', 'CAO-PB-2024-R0895',
      'CAO-PB-2024-R0900', 'CAO-PB-2024-R0905', 'CAO-PB-2024-R1609'
    ]
  },
  'calculatePersonnelCosts.articles_55_58_training_education': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0950', 'CAO-PB-2024-R0953', 'CAO-PB-2024-R0956',
      'CAO-PB-2024-R0957', 'CAO-PB-2024-R0958', 'CAO-PB-2024-R0959',
      'CAO-PB-2024-R0962', 'CAO-PB-2024-R0966', 'CAO-PB-2024-R0968',
      'CAO-PB-2024-R0971', 'CAO-PB-2024-R0976', 'CAO-PB-2024-R0979',
      'CAO-PB-2024-R0980', 'CAO-PB-2024-R0981', 'CAO-PB-2024-R0982',
      'CAO-PB-2024-R0991'
    ]
  },
  'calculateCaoLeaveAndSickness.articles_59_65_66_67': {
    functions: ['calculateCaoLeaveAndSickness'],
    rule_ids: [
      'CAO-PB-2024-R1133', 'CAO-PB-2024-R1134', 'CAO-PB-2024-R1135',
      'CAO-PB-2024-R1136', 'CAO-PB-2024-R1137', 'CAO-PB-2024-R1147',
      'CAO-PB-2024-R1156', 'CAO-PB-2024-R1164',
      'CAO-PB-2024-R0998',
      'CAO-PB-2024-R0999', 'CAO-PB-2024-R1000', 'CAO-PB-2024-R1001',
      'CAO-PB-2024-R1002', 'CAO-PB-2024-R1003', 'CAO-PB-2024-R1004',
      'CAO-PB-2024-R1005', 'CAO-PB-2024-R1006', 'CAO-PB-2024-R1008',
      'CAO-PB-2024-R1009', 'CAO-PB-2024-R1010', 'CAO-PB-2024-R1011',
      'CAO-PB-2024-R1012', 'CAO-PB-2024-R1013', 'CAO-PB-2024-R1014',
      'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017',
      'CAO-PB-2024-R1007', 'CAO-PB-2024-R1018', 'CAO-PB-2024-R1019', 'CAO-PB-2024-R1022',
      'CAO-PB-2024-R1148', 'CAO-PB-2024-R1149', 'CAO-PB-2024-R1150',
      'CAO-PB-2024-R1151', 'CAO-PB-2024-R1152', 'CAO-PB-2024-R1153',
      'CAO-PB-2024-R1154', 'CAO-PB-2024-R1155', 'CAO-PB-2024-R1157',
      'CAO-PB-2024-R1158', 'CAO-PB-2024-R1159', 'CAO-PB-2024-R1160',
      'CAO-PB-2024-R1161', 'CAO-PB-2024-R1162', 'CAO-PB-2024-R1163',
      'CAO-PB-2024-R1165', 'CAO-PB-2024-R1166', 'CAO-PB-2024-R1167',
      'CAO-PB-2024-R1172', 'CAO-PB-2024-R1173', 'CAO-PB-2024-R1174',
      'CAO-PB-2024-R1175', 'CAO-PB-2024-R1176', 'CAO-PB-2024-R1177',
      'CAO-PB-2024-R1178', 'CAO-PB-2024-R1179', 'CAO-PB-2024-R1180',
      'CAO-PB-2024-R1181', 'CAO-PB-2024-R1182', 'CAO-PB-2024-R1183',
      'CAO-PB-2024-R1184'
    ]
  },
  'calculateCaoLeaveAndSickness.articles_68_69_70_disability_compliance': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1186', 'CAO-PB-2024-R1187', 'CAO-PB-2024-R1188',
      'CAO-PB-2024-R1189', 'CAO-PB-2024-R1190', 'CAO-PB-2024-R1191',
      'CAO-PB-2024-R1192', 'CAO-PB-2024-R1193', 'CAO-PB-2024-R1195',
      'CAO-PB-2024-R1196', 'CAO-PB-2024-R1197', 'CAO-PB-2024-R1198'
    ]
  },
  'calculateCaoLeaveAndSickness.article_59_reference_and_protocol_ii_vacation': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1021', 'CAO-PB-2024-R1589', 'CAO-PB-2024-R1601',
      'CAO-PB-2024-R1602'
    ]
  },
  'calculateCaoLeaveAndSickness.article_60_vacation_requests': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0993', 'CAO-PB-2024-R1031', 'CAO-PB-2024-R1032',
      'CAO-PB-2024-R1033', 'CAO-PB-2024-R1034', 'CAO-PB-2024-R1035',
      'CAO-PB-2024-R1036', 'CAO-PB-2024-R1037', 'CAO-PB-2024-R1038',
      'CAO-PB-2024-R1039', 'CAO-PB-2024-R1040', 'CAO-PB-2024-R1041',
      'CAO-PB-2024-R1042', 'CAO-PB-2024-R1043', 'CAO-PB-2024-R1044',
      'CAO-PB-2024-R1045', 'CAO-PB-2024-R1046', 'CAO-PB-2024-R1047',
      'CAO-PB-2024-R1049'
    ]
  },
  'calculateCaoLeaveAndSickness.article_61_holiday_credit': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0994', 'CAO-PB-2024-R1050',
      'CAO-PB-2024-R1052', 'CAO-PB-2024-R1053', 'CAO-PB-2024-R1054',
      'CAO-PB-2024-R1056', 'CAO-PB-2024-R1057', 'CAO-PB-2024-R1058'
    ]
  },
  'calculateCaoLeaveAndSickness.article_62_vacation_allowance': {
    functions: ['calculateCaoLeaveAndSickness', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0995', 'CAO-PB-2024-R1059', 'CAO-PB-2024-R1060',
      'CAO-PB-2024-R1061', 'CAO-PB-2024-R1062', 'CAO-PB-2024-R1064',
      'CAO-PB-2024-R1065', 'CAO-PB-2024-R1066', 'CAO-PB-2024-R1067',
      'CAO-PB-2024-R1068'
    ]
  },
  'calculateCaoLeaveAndSickness.article_63_extraordinary_leave': {
    functions: ['calculateCaoLeaveAndSickness', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0997',
      'CAO-PB-2024-R1070', 'CAO-PB-2024-R1071', 'CAO-PB-2024-R1072',
      'CAO-PB-2024-R1073', 'CAO-PB-2024-R1074', 'CAO-PB-2024-R1075',
      'CAO-PB-2024-R1076', 'CAO-PB-2024-R1077', 'CAO-PB-2024-R1078',
      'CAO-PB-2024-R1079', 'CAO-PB-2024-R1080', 'CAO-PB-2024-R1081',
      'CAO-PB-2024-R1082', 'CAO-PB-2024-R1083', 'CAO-PB-2024-R1084',
      'CAO-PB-2024-R1085', 'CAO-PB-2024-R1086', 'CAO-PB-2024-R1087',
      'CAO-PB-2024-R1088', 'CAO-PB-2024-R1089', 'CAO-PB-2024-R1090',
      'CAO-PB-2024-R1091', 'CAO-PB-2024-R1092', 'CAO-PB-2024-R1093',
      'CAO-PB-2024-R1094', 'CAO-PB-2024-R1095', 'CAO-PB-2024-R1096',
      'CAO-PB-2024-R1097', 'CAO-PB-2024-R1098', 'CAO-PB-2024-R1099',
      'CAO-PB-2024-R1100', 'CAO-PB-2024-R1101', 'CAO-PB-2024-R1102',
      'CAO-PB-2024-R1103', 'CAO-PB-2024-R1104', 'CAO-PB-2024-R1105',
      'CAO-PB-2024-R1106', 'CAO-PB-2024-R1107', 'CAO-PB-2024-R1108',
      'CAO-PB-2024-R1109', 'CAO-PB-2024-R1110', 'CAO-PB-2024-R1111',
      'CAO-PB-2024-R1112', 'CAO-PB-2024-R1113', 'CAO-PB-2024-R1114',
      'CAO-PB-2024-R1115', 'CAO-PB-2024-R1116', 'CAO-PB-2024-R1117',
      'CAO-PB-2024-R1118', 'CAO-PB-2024-R1119', 'CAO-PB-2024-R1120',
      'CAO-PB-2024-R1121', 'CAO-PB-2024-R1122', 'CAO-PB-2024-R1123',
      'CAO-PB-2024-R1124', 'CAO-PB-2024-R1125', 'CAO-PB-2024-R1126',
      'CAO-PB-2024-R1127', 'CAO-PB-2024-R1128', 'CAO-PB-2024-R1129',
      'CAO-PB-2024-R1130'
    ]
  },
  'calculatePersonnelCosts.article_71_72_pension_80_90_100': {
    functions: ['calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1210', 'CAO-PB-2024-R1211',
      'CAO-PB-2024-R1214', 'CAO-PB-2024-R1215',
      'CAO-PB-2024-R1217', 'CAO-PB-2024-R1218',
      'CAO-PB-2024-R1221', 'CAO-PB-2024-R1222',
      'CAO-PB-2024-R1223', 'CAO-PB-2024-R1224',
      'CAO-PB-2024-R1225', 'CAO-PB-2024-R1226',
      'CAO-PB-2024-R1227', 'CAO-PB-2024-R1229',
      'CAO-PB-2024-R1230', 'CAO-PB-2024-R1231',
      'CAO-PB-2024-R1232', 'CAO-PB-2024-R1233',
      'CAO-PB-2024-R1234', 'CAO-PB-2024-R1235',
      'CAO-PB-2024-R1237'
    ]
  },
  'validateCaoScheduleRules.article_73_older_workers': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1202',
      'CAO-PB-2024-R1242', 'CAO-PB-2024-R1244',
      'CAO-PB-2024-R1245', 'CAO-PB-2024-R1246',
      'CAO-PB-2024-R1248', 'CAO-PB-2024-R1253',
      'CAO-PB-2024-R1254', 'CAO-PB-2024-R1255',
      'CAO-PB-2024-R1256', 'CAO-PB-2024-R1257',
      'CAO-PB-2024-R1258', 'CAO-PB-2024-R1259',
      'CAO-PB-2024-R1260', 'CAO-PB-2024-R1261',
      'CAO-PB-2024-R1262', 'CAO-PB-2024-R1263',
      'CAO-PB-2024-R1264', 'CAO-PB-2024-R1265',
      'CAO-PB-2024-R1266', 'CAO-PB-2024-R1267',
      'CAO-PB-2024-R1268', 'CAO-PB-2024-R1270',
      'CAO-PB-2024-R1271', 'CAO-PB-2024-R1272',
      'CAO-PB-2024-R1273', 'CAO-PB-2024-R1274',
      'CAO-PB-2024-R1275', 'CAO-PB-2024-R1276',
      'CAO-PB-2024-R1277', 'CAO-PB-2024-R1278',
      'CAO-PB-2024-R1279', 'CAO-PB-2024-R1280',
      'CAO-PB-2024-R1281', 'CAO-PB-2024-R1282',
      'CAO-PB-2024-R1283', 'CAO-PB-2024-R1284',
      'CAO-PB-2024-R1285', 'CAO-PB-2024-R1286',
      'CAO-PB-2024-R1287', 'CAO-PB-2024-R1288',
      'CAO-PB-2024-R1289', 'CAO-PB-2024-R1290',
      'CAO-PB-2024-R1291', 'CAO-PB-2024-R1292',
      'CAO-PB-2024-R1293', 'CAO-PB-2024-R1294',
      'CAO-PB-2024-R1296'
    ]
  },
  'calculatePersonnelCosts.protocol_ii_cash_value_notice_article_103': {
    functions: ['calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1613', 'CAO-PB-2024-R1617', 'CAO-PB-2024-R1618'
    ]
  },
  'validateCaoScheduleRules.protocol_ii_cash_value_schedule_articles_104_107': {
    functions: ['validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R1592', 'CAO-PB-2024-R1593', 'CAO-PB-2024-R1610',
      'CAO-PB-2024-R1615', 'CAO-PB-2024-R1616',
      'CAO-PB-2024-R1619', 'CAO-PB-2024-R1620', 'CAO-PB-2024-R1621',
      'CAO-PB-2024-R1622', 'CAO-PB-2024-R1623', 'CAO-PB-2024-R1624',
      'CAO-PB-2024-R1626', 'CAO-PB-2024-R1627', 'CAO-PB-2024-R1628',
      'CAO-PB-2024-R1629', 'CAO-PB-2024-R1630', 'CAO-PB-2024-R1631',
      'CAO-PB-2024-R1632', 'CAO-PB-2024-R1633',
      'CAO-PB-2024-R1635', 'CAO-PB-2024-R1636', 'CAO-PB-2024-R1637',
      'CAO-PB-2024-R1638', 'CAO-PB-2024-R1639', 'CAO-PB-2024-R1640',
      'CAO-PB-2024-R1641', 'CAO-PB-2024-R1642'
    ]
  },
  'calculatePersonnelCosts.payslip_template_compliance': {
    functions: ['calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R1740', 'CAO-PB-2024-R1742', 'CAO-PB-2024-R1744',
      'CAO-PB-2024-R1745', 'CAO-PB-2024-R1746', 'CAO-PB-2024-R1747',
      'CAO-PB-2024-R1749', 'CAO-PB-2024-R1750'
    ]
  },
  'validateCaoScheduleRules.schiphol_airport_schedule_policy': {
    functions: ['resolveCaoApplicability', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R1520', 'CAO-PB-2024-R1524', 'CAO-PB-2024-R1525',
      'CAO-PB-2024-R1531', 'CAO-PB-2024-R1532', 'CAO-PB-2024-R1533',
      'CAO-PB-2024-R1561', 'CAO-PB-2024-R1562', 'CAO-PB-2024-R1564',
      'CAO-PB-2024-R1565', 'CAO-PB-2024-R1566', 'CAO-PB-2024-R1567',
      'CAO-PB-2024-R1568', 'CAO-PB-2024-R1569', 'CAO-PB-2024-R1573',
      'CAO-PB-2024-R1997', 'CAO-PB-2024-R2036', 'CAO-PB-2024-R2038'
    ]
  },
  'calculateCaoReimbursements.schiphol_reimbursements_article_94_96': {
    functions: ['resolveCaoApplicability', 'calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R1521', 'CAO-PB-2024-R1523', 'CAO-PB-2024-R1539',
      'CAO-PB-2024-R1543', 'CAO-PB-2024-R1545', 'CAO-PB-2024-R1547',
      'CAO-PB-2024-R1551', 'CAO-PB-2024-R1554'
    ]
  },
  'calculatePersonnelCosts.schiphol_payroll_allowances': {
    functions: ['resolveCaoApplicability', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R1555', 'CAO-PB-2024-R1556', 'CAO-PB-2024-R1558',
      'CAO-PB-2024-R1559', 'CAO-PB-2024-R1560', 'CAO-PB-2024-R1576',
      'CAO-PB-2024-R1577', 'CAO-PB-2024-R1578', 'CAO-PB-2024-R1579',
      'CAO-PB-2024-R1580', 'CAO-PB-2024-R1582', 'CAO-PB-2024-R1583',
      'CAO-PB-2024-R1584', 'CAO-PB-2024-R1585', 'CAO-PB-2024-R1586',
      'CAO-PB-2024-R1958', 'CAO-PB-2024-R1973', 'CAO-PB-2024-R1974',
      'CAO-PB-2024-R1975', 'CAO-PB-2024-R1976', 'CAO-PB-2024-R1977',
      'CAO-PB-2024-R1978', 'CAO-PB-2024-R1982', 'CAO-PB-2024-R2017',
      'CAO-PB-2024-R2039', 'CAO-PB-2024-R2040', 'CAO-PB-2024-R2041',
      'CAO-PB-2024-R2042', 'CAO-PB-2024-R2043', 'CAO-PB-2024-R2044',
      'CAO-PB-2024-R2045', 'CAO-PB-2024-R2046', 'CAO-PB-2024-R2064',
      'CAO-PB-2024-R2065', 'CAO-PB-2024-R2067', 'CAO-PB-2024-R2068',
      'CAO-PB-2024-R2069', 'CAO-PB-2024-R2070', 'CAO-PB-2024-R2071',
      'CAO-PB-2024-R2072'
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.organization_social_policy_unions': {
    functions: ['resolveCaoGovernanceCompliancePolicy'],
    rule_ids: [
      ...localRuleIds(1337, 1338, 1357, 1358, 1359, 1360, 1366, 1375, 1377),
      ...localRuleIds(1386, 1387, 1392, 1393, 1395, 1399, 1400, 1401, 1408, 1409),
      ...localRuleIds(1423, 1436, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445),
      ...localRuleIds(1455, 1460, 1472, 1474, 1484, 1491, 1495, 1499, 1500, 1501),
      ...localRuleIds(1506, 1508, 1509, 1510, 1514, 1515, 1516)
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.compliance_control_regulation': {
    functions: ['resolveCaoGovernanceCompliancePolicy'],
    rule_ids: [
      ...localRuleIds(1841, 1844, 1847, 1848, 1850, 1857, 1858, 1859, 1861, 1862),
      ...localRuleIds(1865, 1868, 1869, 1871, 1872, 1873, 1874, 1875, 1877),
      ...localRuleIds(1879, 1881, 1883, 1884, 1885, 1886, 1887, 1888, 1889, 1890, 1891),
      ...localRuleIds(1892, 1893, 1894, 1895, 1896, 1897, 1898, 1900, 1902, 1903),
      ...localRuleIds(1904, 1905, 1908, 1910, 1911, 1913, 1914, 1915, 1916, 1917),
      ...localRuleIds(1918, 1919, 1920, 1921)
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.employer_compliance_and_scope': {
    functions: ['resolveCaoGovernanceCompliancePolicy', 'resolveCaoApplicability'],
    rule_ids: [
      ...localRuleIds(164, 221, 234),
      ...localRuleIds(1651, 1652, 1658, 1668, 1669, 1670, 1671, 1673, 1675, 1676),
      ...localRuleIds(1677, 1678, 1679, 1681, 1682, 1683, 1686, 1689, 1690, 1691),
      ...localRuleIds(1692, 1693, 1694, 1695, 1696, 1698),
      ...localRuleIds(2074, 2077, 2078, 2079, 2080, 2081, 2084, 2088, 2089, 2090),
      ...localRuleIds(2091, 2092, 2093, 2094, 2095, 2099, 2100, 2101, 2102, 2103)
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.protocols_travel_vacation_contract_change': {
    functions: ['resolveCaoGovernanceCompliancePolicy', 'calculateCaoReimbursements', 'calculateCaoLeaveAndSickness'],
    rule_ids: [
      ...localRuleIds(1707, 1708, 1712, 1714, 1716, 1717, 1719, 1720, 1722, 1723, 1725, 1736),
      ...localRuleIds(1927, 1928, 1929, 1932, 1934, 1935, 1936),
      ...localRuleIds(1937, 1938, 1939, 1940, 1941, 1942, 1943, 1944, 1945, 1946, 1947, 1948),
      ...localRuleIds(1949, 1950, 1951, 1952, 1953),
      ...localRuleIds(2105, 2107, 2108, 2109, 2110)
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.schiphol_social_agreement_policy': {
    functions: ['resolveCaoGovernanceCompliancePolicy', 'calculatePersonnelCosts', 'calculateCaoReimbursements', 'validateCaoScheduleRules'],
    rule_ids: [
      ...localRuleIds(1957, 1959, 1962, 1965, 1966, 1971, 1979, 1983, 1984, 1985),
      ...localRuleIds(1987, 1989, 1990, 1991, 1993, 2001, 2003, 2006, 2008, 2010),
      ...localRuleIds(2011, 2012, 2013, 2018, 2024, 2026, 2028, 2035, 2053, 2055)
    ]
  },
  'resolveCaoGovernanceCompliancePolicy.contract_employment_governance': {
    functions: ['resolveCaoGovernanceCompliancePolicy', 'applyCaoContractRules', 'resolvePersonnelContractForService'],
    rule_ids: localRuleIds(301, 305, 306, 338, 346, 453, 456, 461, 462, 1923, 1925)
  },
  'resolveCaoGovernanceCompliancePolicy.safety_risk_working_conditions_policy': {
    functions: ['resolveCaoGovernanceCompliancePolicy'],
    rule_ids: localRuleIds(1303, 1311, 1313, 1322, 1327, 1330)
  }
};

const LOCAL_RUNTIME_RULE_ID_INDEX = Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)
  .reduce((acc, [key, binding]) => {
    for (const ruleId of binding.rule_ids) acc[ruleId] = { key, ...binding };
    return acc;
  }, {});

function hasAnyNeedle(value, needles) {
  const text = String(value || '').toLowerCase();
  return needles.some(needle => text.includes(needle));
}

function getLocalRuntimeBinding(rule) {
  return LOCAL_RUNTIME_RULE_ID_INDEX[rule?.rule_id] || null;
}

function nonEmptyString(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return null;
}

function objectOrNull(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      return value;
    }
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch (_) {
        // Ignore non-JSON strings; rule_text remains the source of truth.
      }
    }
  }
  return null;
}

function normalizeCaoRuleInput(rule, fallbackCaoKey) {
  const ruleText = nonEmptyString(
    rule?.rule_text,
    rule?.text,
    rule?.source_text,
    rule?.source_line,
    rule?.line_text
  );
  const sourceReference = nonEmptyString(
    rule?.source_reference,
    rule?.article,
    rule?.appendix,
    rule?.protocol,
    rule?.source_anchor
  );
  const hashAlgorithm = nonEmptyString(
    rule?.hash_algorithm,
    rule?.sha256 ? 'sha256' : null,
    rule?.sha1 ? 'sha1' : null,
    rule?.source_hash || rule?.rule_hash || rule?.rule_text_hash ? 'unknown' : null
  );

  return {
    ...rule,
    cao_key: normalizeCaoKey(rule?.cao_key) || fallbackCaoKey,
    rule_text: ruleText,
    rule_text_summary: nonEmptyString(rule?.rule_text_summary, rule?.summary, rule?.text_summary),
    source_reference: sourceReference,
    source_url: nonEmptyString(rule?.source_url, rule?.url),
    document_url: nonEmptyString(rule?.document_url, rule?.file_url),
    applies_when: objectOrNull(rule?.applies_when, rule?.conditions, rule?.applicability, rule?.when, rule?.applies_to),
    default_action: objectOrNull(rule?.default_action, rule?.action, rule?.calculation_action, rule?.payroll_action),
    validation_action: objectOrNull(rule?.validation_action, rule?.validation, rule?.validation_policy, rule?.validation_rule),
    calculation_policy: nonEmptyString(rule?.calculation_policy, rule?.policy, rule?.payroll_policy),
    tests: rule?.tests ?? objectOrNull(rule?.test_evidence, rule?.verification_tests),
    hash_algorithm: hashAlgorithm,
    source_evidence_confidence: nonEmptyString(rule?.source_evidence_confidence) || (hasRuleSourceLocator(rule) && hasRuleSourceHash(rule) ? 'high' : null)
  };
}

function normalizeCaoRulesInput(rules, fallbackCaoKey) {
  return (Array.isArray(rules) ? rules : []).map(rule => normalizeCaoRuleInput(rule || {}, fallbackCaoKey));
}

function hasMachineReadableObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function inferRuntimeApplicabilityRequirements(binding) {
  const functions = Array.isArray(binding?.functions) ? binding.functions : [];
  return {
    contract_context_required: functions.some(fn => [
      'applyCaoContractRules',
      'resolvePersonnelContractForService'
    ].includes(fn)),
    planning_context_required: functions.some(fn => [
      'validateCaoScheduleRules',
      'validateTaskPlanningContext'
    ].includes(fn)),
    payroll_context_required: functions.some(fn => [
      'calculatePersonnelCosts',
      'calculateRoutePersonnelCosts',
      'calculateCaoYearEndBonus',
      'calculateCaoReimbursements',
      'calculateCaoLeaveAndSickness',
      'queueCaoPayrollCorrections'
    ].includes(fn)),
    function_classification_context_required: functions.some(fn => fn === 'resolveCaoFunctionClassification'),
    cao_scope_context_required: functions.some(fn => fn === 'resolveCaoApplicability' || fn === 'validateTaskPlanningContext')
  };
}

function buildRuntimeDelegatedApplicability(rule, binding) {
  return {
    semantic_precision: 'runtime_delegated_minimum',
    cao_key: normalizeCaoKey(rule?.cao_key) || CAO_PB_KEY,
    rule_id: rule?.rule_id || null,
    domain: rule?.domain || null,
    automation_level: rule?.automation_level || null,
    runtime_binding_key: binding.key,
    runtime_binding_functions: binding.functions || [],
    effective_date_required: true,
    manual_review_if_context_missing: true,
    ...inferRuntimeApplicabilityRequirements(binding)
  };
}

function inferRuntimeEffects(binding) {
  const functions = Array.isArray(binding?.functions) ? binding.functions : [];
  return {
    applies_contract_rules: functions.includes('applyCaoContractRules'),
    validates_planning_rules: functions.includes('validateCaoScheduleRules') || functions.includes('validateTaskPlanningContext'),
    resolves_contract_for_service: functions.includes('resolvePersonnelContractForService'),
    resolves_cao_applicability: functions.includes('resolveCaoApplicability'),
    resolves_function_classification: functions.includes('resolveCaoFunctionClassification'),
    calculates_payroll_costs: functions.some(fn => [
      'calculatePersonnelCosts',
      'calculateRoutePersonnelCosts',
      'calculateCaoYearEndBonus',
      'calculateCaoReimbursements',
      'calculateCaoLeaveAndSickness'
    ].includes(fn)),
    queues_retro_payroll_corrections: functions.includes('queueCaoPayrollCorrections')
  };
}

function buildRuntimeDelegatedAction(rule, binding) {
  return {
    type: 'runtime_delegation',
    semantic_precision: 'runtime_delegated_minimum',
    rule_id: rule?.rule_id || null,
    runtime_binding_key: binding.key,
    runtime_binding_functions: binding.functions || [],
    effects: inferRuntimeEffects(binding),
    source_of_truth: 'local_base44_runtime_binding',
    manual_review_if_runtime_unhandled: true
  };
}

function withLocalRuntimeBindingMetadata(rule) {
  const binding = getLocalRuntimeBinding(rule);
  const critical = isPayrollCriticalRule(rule);
  const runtimeApplicability = binding && !hasMachineReadableObject(rule.applies_when)
    ? buildRuntimeDelegatedApplicability(rule, binding)
    : rule.applies_when;
  const runtimeAction = binding && !hasMachineReadableObject(rule.default_action)
    ? buildRuntimeDelegatedAction(rule, binding)
    : rule.default_action;
  const runtimeValidationAction = binding && !hasMachineReadableObject(rule.validation_action)
    ? {
      type: 'runtime_validation_delegation',
      semantic_precision: 'runtime_delegated_minimum',
      rule_id: rule?.rule_id || null,
      runtime_binding_key: binding.key,
      runtime_binding_functions: binding.functions || [],
      manual_review_if_validation_context_missing: true
    }
    : rule.validation_action;
  return {
    ...rule,
    applies_when: runtimeApplicability,
    default_action: runtimeAction,
    validation_action: runtimeValidationAction,
    runtime_binding_status: binding ? 'verified_local_runtime' : critical ? 'missing_local_runtime' : 'not_required',
    runtime_binding_key: binding?.key || null,
    runtime_binding_functions: binding?.functions || [],
    local_runtime_verified_at: binding ? new Date().toISOString() : null
  };
}

async function findExistingCaoRule(base44, { ruleId, caoKey, configId }) {
  if (configId) {
    const scoped = await base44.asServiceRole.entities.CAORule.filter({
      rule_id: ruleId,
      cao_configuration_id: configId
    });
    if (scoped.length > 0) return scoped[0];
  }

  if (!configId) {
    const candidates = await base44.asServiceRole.entities.CAORule.filter({
      rule_id: ruleId,
      cao_key: caoKey
    });
    return candidates.find(rule => !rule.cao_configuration_id) || null;
  }

  return null;
}

function buildIncompleteRuleImportGate(gate, processedRules, totalRules) {
  const finding = {
    code: 'incomplete_rule_registry_import',
    severity: 'critical',
    message: `CAO-registry import is nog niet compleet: ${processedRules} van ${totalRules} regels verwerkt. Payroll blijft geblokkeerd tot alle regels voor deze CAO-configuratie zijn opgeslagen.`
  };
  return {
    ...(gate || {}),
    passed: false,
    status: 'blocked_incomplete_source_coverage',
    counts: {
      ...(gate?.counts || {}),
      persisted_rule_import_count: processedRules,
      expected_rule_import_count: totalRules
    },
    blocking_findings: [
      finding,
      ...((gate?.blocking_findings || []).filter(f => f.code !== finding.code))
    ]
  };
}

function uniqueRuleIds(rules) {
  return new Set((Array.isArray(rules) ? rules : []).map(rule => rule.rule_id).filter(Boolean));
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort();
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

async function buildRuleRegistryFingerprint(rules) {
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

  const canonicalJson = JSON.stringify(stableForHash(normalizedRules));
  return {
    algorithm: 'sha256',
    fingerprint: await sha256Hex(canonicalJson),
    canonical_rule_count: normalizedRules.length
  };
}

async function verifyPersistedRuleRegistry(base44, { caoKey, configId, candidateCfg, candidateRules }) {
  const persistedRules = await base44.asServiceRole.entities.CAORule.filter({
    cao_key: caoKey,
    cao_configuration_id: configId
  });
  const expectedRuleIds = uniqueRuleIds(candidateRules);
  const persistedRuleIds = uniqueRuleIds(persistedRules);
  const missingRuleIds = [...expectedRuleIds].filter(ruleId => !persistedRuleIds.has(ruleId));
  const sourceCoverage = evaluateSourceCoverageCompleteness(candidateCfg, persistedRules || []);
  const fingerprint = await buildRuleRegistryFingerprint(persistedRules || []);
  const blockingFindings = [];
  const verifiedAt = new Date().toISOString();

  if (missingRuleIds.length > 0) {
    blockingFindings.push({
      code: 'persisted_rule_registry_incomplete',
      severity: 'critical',
      message: `Niet alle CAO-regels zijn opgeslagen voor configuratie ${configId}: ${persistedRuleIds.size}/${expectedRuleIds.size} unieke regels aanwezig.`
    });
  }
  blockingFindings.push(...sourceCoverage.blocking_findings);

  return {
    passed: blockingFindings.length === 0,
    expected_unique_rule_count: expectedRuleIds.size,
    persisted_unique_rule_count: persistedRuleIds.size,
    fingerprint: fingerprint.fingerprint,
    fingerprint_algorithm: fingerprint.algorithm,
    fingerprint_rule_count: fingerprint.canonical_rule_count,
    verified_at: verifiedAt,
    missing_rule_ids: missingRuleIds.slice(0, 100),
    missing_rule_ids_truncated: missingRuleIds.length > 100,
    source_coverage: sourceCoverage,
    blocking_findings: blockingFindings
  };
}

async function buildPayloadManifestRuleRegistrySnapshot({ candidateCfg, candidateRules, payload, cloudflareRevision, ruleImportMode }) {
  const expectedRuleIds = uniqueRuleIds(candidateRules);
  const sourceCoverage = evaluateSourceCoverageCompleteness(candidateCfg, candidateRules || []);
  const fingerprint = await buildRuleRegistryFingerprint(candidateRules || []);
  const blockingFindings = [...(sourceCoverage.blocking_findings || [])];
  const verifiedAt = new Date().toISOString();

  if (expectedRuleIds.size === 0) {
    blockingFindings.push({
      code: 'empty_payload_rule_manifest',
      severity: 'critical',
      message: 'Cloudflare-payload bevat geen CAO-regels; manifest-only sync mag geen payroll-ready configuratie activeren.'
    });
  }

  return {
    passed: blockingFindings.length === 0,
    mode: ruleImportMode,
    registry_source: 'cloudflare_payload_manifest',
    persisted_rule_registry_required: false,
    base44_caorule_import_required_for_payroll_ready: false,
    expected_unique_rule_count: expectedRuleIds.size,
    manifest_unique_rule_count: expectedRuleIds.size,
    persisted_unique_rule_count: null,
    fingerprint: fingerprint.fingerprint,
    fingerprint_algorithm: fingerprint.algorithm,
    fingerprint_rule_count: fingerprint.canonical_rule_count,
    verified_at: verifiedAt,
    payload_revision: payload?.revision || null,
    cloudflare_revision: cloudflareRevision || null,
    idempotency_key: payload?.idempotency_key || null,
    source_coverage: sourceCoverage,
    blocking_findings: blockingFindings
  };
}

function hasWageScales(candidateCfg) {
  return Object.keys(candidateCfg?.wage_scales || {}).length > 0 ||
    Object.keys(candidateCfg?.wage_scales_detailed || {}).length > 0;
}

function hasPayPeriods(candidateCfg) {
  const payPeriods = candidateCfg?.pay_periods;
  if (!payPeriods) return false;
  if (Array.isArray(payPeriods)) return payPeriods.length > 0;
  if (typeof payPeriods === 'object') return Object.keys(payPeriods).length > 0;
  return false;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDeclaredCoverageSummary(candidateCfg) {
  return candidateCfg?.coverage_summary ||
    candidateCfg?.rule_engine_metadata?.coverage_summary ||
    candidateCfg?.source_coverage_summary ||
    {};
}

function getSourceCoverageMinimums(candidateCfg) {
  const summary = getDeclaredCoverageSummary(candidateCfg);
  const caoKey = normalizeCaoKey(candidateCfg?.cao_key) || CAO_PB_KEY;
  const minimums = caoKey === CAO_PB_KEY
    ? { ...CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS }
    : {
      total: 0,
      automatic_or_calculation: 0,
      validation_or_policy: 0,
      workflow_or_documentation: 0
    };
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

function getDeclaredExternalCoverageBaselineStatus(candidateCfg) {
  const caoKey = normalizeCaoKey(candidateCfg?.cao_key) || CAO_PB_KEY;
  const required = EXTERNAL_SECURITY_CAO_KEYS_REQUIRING_DECLARED_COVERAGE_BASELINE.includes(caoKey);
  const summary = getDeclaredCoverageSummary(candidateCfg);
  const declaredTotal = numberOrNull(
    summary.expected_total_rules ??
    summary.total_atomic_rules ??
    summary.total_source_rules ??
    summary.total
  );
  const byLevel = summary.expected_automation_level_counts ||
    summary.by_automation_level ||
    summary.automation_level_counts ||
    {};
  const declaredLevelKeys = ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation']
    .filter(key => numberOrNull(byLevel[key]) !== null);
  return {
    cao_key: caoKey,
    required,
    present: !required || (declaredTotal !== null && declaredTotal > 0 && declaredLevelKeys.length > 0),
    declared_total_rules: declaredTotal,
    declared_automation_level_keys: declaredLevelKeys
  };
}

function countByAutomationLevel(rules) {
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

function evaluateSourceCoverageCompleteness(candidateCfg, rules) {
  const caoKey = normalizeCaoKey(candidateCfg?.cao_key) || CAO_PB_KEY;
  const minimums = getSourceCoverageMinimums(candidateCfg);
  const externalCoverageBaseline = getDeclaredExternalCoverageBaselineStatus(candidateCfg);
  const uniqueRuleIds = new Set(rules.map(rule => rule.rule_id).filter(Boolean));
  const byAutomationLevel = countByAutomationLevel(rules);
  const sourceFamilyCoverage = evaluateRequiredSourceFamilyCoverage(candidateCfg);
  const blockingFindings = [];
  const payrollCriticalMissingSourceLocator = [];
  const payrollCriticalMissingSourceHash = [];

  if (externalCoverageBaseline.required && !externalCoverageBaseline.present) {
    blockingFindings.push({
      code: 'incomplete_external_cao_rule_coverage_baseline',
      severity: 'critical',
      message: `CAO ${caoKey} mist een expliciete coverage_summary met expected_total_rules en automation-level aantallen. Externe CAO-runtime mag pas worden opgebouwd na een volledige regelcoverage baseline.`
    });
  }

  if (uniqueRuleIds.size < minimums.total) {
    blockingFindings.push({
      code: 'incomplete_source_rule_coverage',
      severity: 'critical',
      message: caoKey === CAO_PB_KEY
        ? `CAO-broncoverage is incompleet: ${uniqueRuleIds.size} unieke regels aanwezig, minimaal ${minimums.total} verwacht voor CAO PB 2024-2026.`
        : `CAO-broncoverage is incompleet: ${uniqueRuleIds.size} unieke regels aanwezig, minimaal ${minimums.total} verwacht voor ${caoKey}.`
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
    unique_rule_ids: uniqueRuleIds.size,
    by_automation_level: byAutomationLevel,
    minimums,
    external_coverage_baseline: externalCoverageBaseline,
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

function isPayrollCriticalRule(rule) {
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  const implementationStatus = String(rule.implementation_status || '').toUpperCase();

  if (calculationPolicy === 'not_payroll') return false;
  if (['reference', 'reference_or_policy'].includes(automationLevel) && implementationStatus === 'REFERENCE') return false;

  return calculationPolicy === 'automatic' ||
    automationLevel === 'automatic_or_calculation' ||
    automationLevel === 'validation_or_policy' ||
    hasAnyNeedle(rule.domain, PAYROLL_CRITICAL_DOMAINS) ||
    hasAnyNeedle(rule.impact, ['payroll', 'calculation', 'planning', 'validation']) ||
    hasAnyNeedle(rule.rule_id, ['R031', 'R032', 'R037', 'R038', 'R039', 'R040', 'R041', 'R042', 'R043', 'R047', 'R048', 'R056', 'R057', 'R058', 'R059', 'R064', 'R065', 'R066', 'R067', 'R072', 'R073', 'R085', 'R087', 'R088', 'R089', 'R090', 'R099', 'R114', 'R115', 'R116', 'R160', 'R175', 'R181']);
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

function hasMachineReadableApplicability(rule) {
  return hasMachineReadableObject(rule?.applies_when);
}

function hasMachineReadableAction(rule) {
  const calculationPolicy = String(rule?.calculation_policy || '').toLowerCase();
  return hasMachineReadableObject(rule?.default_action) ||
    hasMachineReadableObject(rule?.validation_action) ||
    ['automatic', 'manual_review_required', 'policy_only'].includes(calculationPolicy);
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

function hasRuntimeBindingSummary(rule) {
  return rule?.has_runtime_binding === true ||
    rule?.runtime_binding_status === 'verified_local_runtime' ||
    Boolean(rule?.runtime_binding_key) ||
    (Array.isArray(rule?.runtime_binding_functions) && rule.runtime_binding_functions.length > 0);
}

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
    const runtimeBound = hasRuntimeBindingSummary(rule);
    if (!runtimeBound) addSemanticGap(backlogByRule, rule, 'missing_local_runtime');
    if (status !== 'IMPLEMENTED') addSemanticGap(backlogByRule, rule, runtimeBound ? 'runtime_bound_status_unverified' : 'not_implemented');
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
    const runtimeBound = Boolean(getLocalRuntimeBinding(rule));
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

async function evaluateCaoCoverageGate(candidateCfg, candidateRules) {
  const rules = Array.isArray(candidateRules) ? candidateRules : [];
  const caoKey = normalizeCaoKey(candidateCfg?.cao_key) || CAO_PB_KEY;
  const sourceCoverage = evaluateSourceCoverageCompleteness(candidateCfg, rules);
  const localRuntimeRegistry = await buildLocalRuntimeBindingRegistrySnapshot();
  const runtimeCoverage = buildRuntimeCoverageRollup(rules);
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
    payroll_critical_missing_action_semantics: 0
  };
  const openCriticalRules = [];
  const implementedWithoutRuntimeBinding = [];
  const implementedWithoutTestEvidence = [];
  const partialWithoutManualReview = [];
  const payrollCriticalMissingRuleText = [];
  const payrollCriticalMissingApplicabilitySemantics = [];
  const payrollCriticalMissingActionSemantics = [];
  const missingTextRules = [];

  for (const rule of rules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    const runtimeBinding = getLocalRuntimeBinding(rule);
    const missingText = !rule.rule_text && !rule.rule_text_summary;
    if (status === 'IMPLEMENTED') counts.implemented++;
    else if (status === 'PARTIAL') counts.partial++;
    else if (status === 'MISSING') counts.missing++;
    else if (status === 'REFERENCE') counts.reference++;
    else counts.unknown++;

    if (rule.manual_review_required === true) counts.manual_review_required++;
    if (missingText) missingTextRules.push(rule.rule_id || 'unknown');

    if (isPayrollCriticalRule(rule)) {
      counts.payroll_critical++;
      if (runtimeBinding) counts.runtime_bound++;
      else counts.runtime_missing++;

      const lacksRuntimeBinding = status === 'IMPLEMENTED' && !runtimeBinding;
      const hasTestEvidence = hasVerifiedTestEvidence(rule);
      const lacksTestEvidence = status === 'IMPLEMENTED' && !hasTestEvidence;
      const partialWithoutReview = status === 'PARTIAL' && rule.manual_review_required !== true;
      const payrollCriticalNoText = missingText;
      const hasApplicabilitySemantics = hasMachineReadableApplicability(rule);
      const hasActionSemantics = hasMachineReadableAction(rule);
      const missingApplicabilitySemantics = !hasApplicabilitySemantics;
      const missingActionSemantics = !hasActionSemantics;
      if (payrollCriticalNoText) {
        counts.payroll_critical_missing_rule_text++;
        payrollCriticalMissingRuleText.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'MISSING',
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          message: 'Payrollkritische regel mist zowel rule_text als rule_text_summary; CAO-broninterpretatie kan niet worden bewezen.'
        });
      }
      if (missingApplicabilitySemantics) {
        counts.payroll_critical_missing_applicability_semantics++;
        payrollCriticalMissingApplicabilitySemantics.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'MISSING',
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          message: 'Payrollkritische regel mist machineleesbare applies_when-condities; de applicatie kan niet audit-proof bepalen voor welk contract, functieprofiel, diensttype of CAO-scope deze regel geldt.'
        });
      }
      if (missingActionSemantics) {
        counts.payroll_critical_missing_action_semantics++;
        payrollCriticalMissingActionSemantics.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'MISSING',
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          message: 'Payrollkritische regel mist machineleesbare default_action/validation_action/calculation_policy; de applicatie weet niet bewijsbaar of zij moet berekenen, blokkeren, waarschuwen of handmatige review eisen.'
        });
      }
      if (lacksRuntimeBinding) {
        counts.implemented_without_runtime_binding++;
        implementedWithoutRuntimeBinding.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'IMPLEMENTED',
          implemented_in: rule.implemented_in || [],
          message: 'Regel claimt IMPLEMENTED, maar heeft geen lokale runtime-binding in Base44.'
        });
      }
      if (lacksTestEvidence) {
        counts.implemented_without_test_evidence++;
        implementedWithoutTestEvidence.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'IMPLEMENTED',
          implemented_in: rule.implemented_in || [],
          message: 'Regel claimt IMPLEMENTED, maar CAORule.tests bevat geen geverifieerd geslaagd testbewijs.'
        });
      }
      if (partialWithoutReview) {
        counts.partial_without_manual_review++;
        partialWithoutManualReview.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'PARTIAL',
          message: 'Regel is PARTIAL, maar manual_review_required is niet true.'
        });
      }

      if (
        status !== 'IMPLEMENTED' ||
        rule.manual_review_required === true ||
        lacksRuntimeBinding ||
        lacksTestEvidence ||
        partialWithoutReview ||
        payrollCriticalNoText ||
        missingApplicabilitySemantics ||
        missingActionSemantics
      ) {
        counts.payroll_critical_open++;
        openCriticalRules.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          article: rule.article || null,
          implementation_status: rule.implementation_status || 'MISSING',
          manual_review_required: rule.manual_review_required === true,
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          runtime_binding_status: runtimeBinding ? 'verified_local_runtime' : 'missing_local_runtime',
          runtime_binding_key: runtimeBinding?.key || null,
          runtime_binding_functions: runtimeBinding?.functions || [],
          has_verified_test_evidence: hasTestEvidence,
          has_rule_text: !payrollCriticalNoText,
          has_machine_applicability: hasApplicabilitySemantics,
          has_machine_action: hasActionSemantics
        });
      }
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
  if (!candidateCfg?.valid_from) {
    blockingFindings.push({
      code: 'missing_effective_date',
      severity: 'critical',
      message: 'candidate_configuration.valid_from ontbreekt; payroll kan zonder ingangsdatum niet veilig historisch rekenen.'
    });
  }
  if (rules.length === 0) {
    blockingFindings.push({
      code: 'missing_rules',
      severity: 'critical',
      message: 'candidate_rules is leeg; CAO-regeldekking kan niet worden bewezen.'
    });
  }
  if (!hasWageScales(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_wage_scales',
      severity: 'critical',
      message: 'Loontabellen ontbreken; loonberekening mag niet payroll-ready zijn.'
    });
  }
  if (!hasPayPeriods(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_pay_periods',
      severity: 'high',
      message: 'Loonperiodetabel ontbreekt; payrollcorrecties en historische runs kunnen niet betrouwbaar worden afgebakend.'
    });
  }
  if (openCriticalRules.length > 0) {
    blockingFindings.push({
      code: 'open_payroll_critical_rules',
      severity: 'critical',
      message: `${openCriticalRules.length} payrollkritische CAO-regels zijn niet volledig geïmplementeerd of vereisen handmatige review.`
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
  else if (blockingFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
  else if (blockingFindings.some(f => String(f.code || '').startsWith('incomplete_'))) status = 'blocked_incomplete_source_coverage';
  else if (blockingFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
  else if (openCriticalRules.length > 0 || implementedWithoutRuntimeBinding.length > 0) status = 'blocked_incomplete_runtime_rules';
  else if (counts.manual_review_required > 0) status = 'manual_review_required';

  const semanticBacklog = buildSemanticBacklog({
    openCriticalRules,
    implementedWithoutRuntimeBinding,
    implementedWithoutTestEvidence,
    partialWithoutManualReview,
    payrollCriticalMissingRuleText,
    payrollCriticalMissingApplicabilitySemantics,
    payrollCriticalMissingActionSemantics,
    maxGroups: 100,
    maxRuleIds: 100
  });

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    source_coverage: sourceCoverage,
    local_runtime_registry: localRuntimeRegistry,
    runtime_coverage: runtimeCoverage,
    semantic_backlog: semanticBacklog,
    blocking_findings: blockingFindings,
    open_payroll_critical_rules: openCriticalRules.slice(0, 100),
    open_payroll_critical_rules_truncated: openCriticalRules.length > 100,
    implemented_without_runtime_binding_rules: implementedWithoutRuntimeBinding.slice(0, 100),
    implemented_without_runtime_binding_truncated: implementedWithoutRuntimeBinding.length > 100,
    implemented_without_test_evidence_rules: implementedWithoutTestEvidence.slice(0, 100),
    implemented_without_test_evidence_truncated: implementedWithoutTestEvidence.length > 100,
    partial_without_manual_review_rules: partialWithoutManualReview.slice(0, 100),
    partial_without_manual_review_truncated: partialWithoutManualReview.length > 100,
    payroll_critical_missing_rule_text_rules: payrollCriticalMissingRuleText.slice(0, 100),
    payroll_critical_missing_rule_text_truncated: payrollCriticalMissingRuleText.length > 100,
    payroll_critical_missing_applicability_semantics_rules: payrollCriticalMissingApplicabilitySemantics.slice(0, 100),
    payroll_critical_missing_applicability_semantics_truncated: payrollCriticalMissingApplicabilitySemantics.length > 100,
    payroll_critical_missing_action_semantics_rules: payrollCriticalMissingActionSemantics.slice(0, 100),
    payroll_critical_missing_action_semantics_truncated: payrollCriticalMissingActionSemantics.length > 100,
    local_runtime_binding_keys: localRuntimeRegistry.binding_keys,
    local_runtime_binding_fingerprint: localRuntimeRegistry.fingerprint,
    local_runtime_binding_fingerprint_algorithm: localRuntimeRegistry.fingerprint_algorithm,
    missing_rule_text_rule_ids: missingTextRules.slice(0, 100),
    missing_rule_text_truncated: missingTextRules.length > 100
  };
}

async function resolvePayrollReadiness(candidateCfg, candidateRules) {
  const gate = await evaluateCaoCoverageGate(candidateCfg, candidateRules);
  const requestedPayrollReady = candidateCfg?.is_payroll_ready === true;
  const isPayrollReady = requestedPayrollReady && gate.passed;
  return {
    gate,
    requested_payroll_ready: requestedPayrollReady,
    is_payroll_ready: isPayrollReady,
    status: isPayrollReady ? 'ready' : (requestedPayrollReady ? gate.status : (gate.passed ? 'owner_not_marked_ready' : gate.status))
  };
}

function isPayrollImpactChange(change) {
  if (change.payroll_impact === true) return true;
  return hasAnyNeedle(
    `${change.rule_key || ''} ${change.field_path || ''} ${change.domain || ''} ${change.change_type || ''}`,
    PAYROLL_CRITICAL_DOMAINS
  );
}

function normalizeEffectiveDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function buildChangeEffectiveMetadata(change, fallbackValidFrom, approvedAt) {
  const explicitEffectiveFrom = normalizeEffectiveDate(change.effective_from || change.valid_from || change.applies_from);
  const fallbackEffectiveFrom = normalizeEffectiveDate(fallbackValidFrom);
  const effectiveFrom = explicitEffectiveFrom || fallbackEffectiveFrom || null;
  const effectiveUntil = normalizeEffectiveDate(change.effective_until || change.valid_until);
  const effectiveFromSource = explicitEffectiveFrom
    ? change.effective_from ? 'change.effective_from' : change.valid_from ? 'change.valid_from' : 'change.applies_from'
    : fallbackEffectiveFrom
    ? 'candidate_configuration.valid_from'
    : null;
  const effectiveFromInferred = !!effectiveFrom && !explicitEffectiveFrom;
  const payrollImpact = isPayrollImpactChange(change);
  const approvedDate = approvedAt ? new Date(approvedAt) : new Date();
  const approvedDay = approvedDate.toISOString().slice(0, 10);
  const retroactive = change.retroactive === true ||
    (!!effectiveFrom && effectiveFrom < approvedDay);
  const missingEffectiveDate = payrollImpact && !effectiveFrom;
  const invalidEffectiveRange = !!(effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom);
  const inferredPayrollEffectiveDate = payrollImpact && effectiveFromInferred;
  const effectiveDateManualReviewRequired = missingEffectiveDate || invalidEffectiveRange || inferredPayrollEffectiveDate;
  const effectiveDateWarnings = [
    ...(missingEffectiveDate ? ['Payrollkritische wijziging mist een expliciete ingangsdatum.'] : []),
    ...(inferredPayrollEffectiveDate ? ['Payrollkritische wijziging gebruikt candidate_configuration.valid_from als fallback; bevestig de wijzigingsspecifieke ingangsdatum voordat historische loonruns worden gematcht.'] : []),
    ...(invalidEffectiveRange ? ['effective_until ligt voor effective_from; datumbereik is ongeldig.'] : [])
  ];
  const correctionRequired = payrollImpact && (retroactive || effectiveDateManualReviewRequired);

  return {
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    effective_from_source: effectiveFromSource,
    effective_from_inferred: effectiveFromInferred,
    effective_date_manual_review_required: effectiveDateManualReviewRequired,
    effective_date_warnings: effectiveDateWarnings,
    payroll_impact: payrollImpact,
    retroactive,
    correction_required: correctionRequired,
    correction_status: effectiveDateManualReviewRequired
      ? 'manual_review_required'
      : correctionRequired
      ? 'candidate'
      : 'not_required'
  };
}

Deno.serve(async (req) => {
  let importRun = null;
  const base44 = createClientFromRequest(req);

  try {
    // ── Auth ──
    const body = await req.json().catch(() => ({}));
    const syncSecret = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET');

    if (!syncSecret) {
      return Response.json({ error: 'BASE44_CAO_SYNC_TRIGGER_SECRET niet geconfigureerd op server.' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const bodySecret = body.sync_trigger_secret || '';
    delete body.sync_trigger_secret;

    if (authHeader !== `Bearer ${syncSecret}` && bodySecret !== syncSecret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { force = false, trigger_source = 'manual' } = body;
    const requestedRuleImportMode = String(body.rule_import_mode || body.caorule_import_mode || 'manifest_only').trim();
    const normalizedRuleImportMode = requestedRuleImportMode === 'batch'
      ? 'full_backfill'
      : requestedRuleImportMode;
    const allowedRuleImportModes = new Set(['manifest_only', 'full_backfill']);
    if (!allowedRuleImportModes.has(normalizedRuleImportMode)) {
      return Response.json({
        success: false,
        error: `Onbekende rule_import_mode: ${requestedRuleImportMode}`,
        allowed_rule_import_modes: [...allowedRuleImportModes]
      }, { status: 422 });
    }
    const ruleImportMode = normalizedRuleImportMode;
    const importCaoRulesToBase44 = ruleImportMode === 'full_backfill';

    // Batch parameters
    const ruleBatchOffset = Math.max(0, Number(body.rule_batch_offset ?? 0));
    const ruleBatchSize = Math.min(Math.max(1, Number(body.rule_batch_size ?? 75)), 150);

    console.log(`[syncCaoFromCloudflare] trigger_source=${trigger_source} force=${force} ruleImportMode=${ruleImportMode} offset=${ruleBatchOffset} batchSize=${ruleBatchSize}`);

    const apiKey = Deno.env.get('BASE44_CAO_API_KEY');
    const statusUrl = Deno.env.get('CAO_CLOUDFLARE_STATUS_URL');
    const currentUrl = Deno.env.get('CAO_CLOUDFLARE_CURRENT_URL');

    if (!apiKey || !statusUrl || !currentUrl) {
      return Response.json({ error: 'CAO Cloudflare secrets niet geconfigureerd' }, { status: 500 });
    }

    // ── Stap 1: Haal status op (lichtgewicht) ──
    let statusData;
    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (statusRes.status === 404) {
        return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
      }
      if (!statusRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable', http_status: statusRes.status });
      }

      statusData = await statusRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    if (!statusData?.current_revision) {
      return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
    }

    const cloudflareRevision = statusData.current_revision;
    const explicitRequestedCaoKey = normalizeCaoKey(
      body.cao_key ||
      statusData.cao_key ||
      statusData.current_cao_key ||
      statusData.cao ||
      ''
    );
    const requestedCaoKey = explicitRequestedCaoKey || CAO_PB_KEY;
    if (!isKnownSecurityCaoKey(requestedCaoKey)) {
      return Response.json({
        success: false,
        error: `Onbekende of niet-toegestane cao_key in Cloudflare-status: ${requestedCaoKey}`,
        known_cao_keys: KNOWN_SECURITY_CAO_KEYS
      }, { status: 422 });
    }

    // ── Stap 2: Revision check over ALLE actieve configs ──
    const activeConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: requestedCaoKey,
      is_active: true
    });

    const activeConfigWithRevision = activeConfigs.find(cfg => cfg.cloudflare_revision === cloudflareRevision);

    if (!force && activeConfigWithRevision) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'already_current',
        revision: cloudflareRevision,
        cao_configuration_id: activeConfigWithRevision.id
      });
    }

    // ── Stap 3: Haal volledige payload op ──
    let payload;
    try {
      const currentRes = await fetch(currentUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (!currentRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_current_unavailable', http_status: currentRes.status });
      }

      payload = await currentRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    // ── Stap 4: Valideer payload ──
    if (payload.applied !== true) {
      return Response.json({ success: false, error: 'Payload applied !== true; niet geactiveerd.' }, { status: 422 });
    }
    if (payload.approval?.status !== 'approved_by_owner') {
      return Response.json({ success: false, error: 'Payload is niet goedgekeurd door eigenaar.' }, { status: 422 });
    }
    const payloadCaoKey = normalizeCaoKey(payload.cao_key || payload.candidate_configuration?.cao_key || requestedCaoKey);
    const candidatePayloadCaoKey = normalizeCaoKey(payload.candidate_configuration?.cao_key);
    if (!payloadCaoKey || !isKnownSecurityCaoKey(payloadCaoKey)) {
      return Response.json({
        success: false,
        error: `Onbekende of niet-toegestane cao_key: ${payloadCaoKey || '(leeg)'}`,
        known_cao_keys: KNOWN_SECURITY_CAO_KEYS
      }, { status: 422 });
    }
    if (explicitRequestedCaoKey && payloadCaoKey !== explicitRequestedCaoKey) {
      return Response.json({
        success: false,
        error: `Gevraagde cao_key ${explicitRequestedCaoKey} botst met Cloudflare-payload cao_key ${payloadCaoKey}.`
      }, { status: 422 });
    }
    if (candidatePayloadCaoKey && candidatePayloadCaoKey !== payloadCaoKey) {
      return Response.json({
        success: false,
        error: `Payload cao_key ${payloadCaoKey} botst met candidate_configuration.cao_key ${candidatePayloadCaoKey}.`
      }, { status: 422 });
    }
    if (!payload.revision || !payload.idempotency_key) {
      return Response.json({ success: false, error: 'Payload mist revision of idempotency_key.' }, { status: 422 });
    }
    const candidateCfgForGate = {
      ...(payload.candidate_configuration || {}),
      cao_key: payloadCaoKey,
      source_documents_snapshot: Array.isArray(payload.candidate_configuration?.source_documents_snapshot) && payload.candidate_configuration.source_documents_snapshot.length > 0
        ? payload.candidate_configuration.source_documents_snapshot
        : (payload.source_documents || [])
    };
    const candidateRulesForGate = normalizeCaoRulesInput(payload.candidate_rules || [], payloadCaoKey)
      .map(rule => withLocalRuntimeBindingMetadata(rule));
    const mismatchingRuleCaoKeysForGate = [...new Set(candidateRulesForGate
      .map(rule => normalizeCaoKey(rule?.cao_key))
      .filter(key => key && key !== payloadCaoKey))];
    if (mismatchingRuleCaoKeysForGate.length > 0) {
      return Response.json({
        success: false,
        error: `Payload bevat CAORule records met afwijkende cao_key waarden: ${mismatchingRuleCaoKeysForGate.join(', ')}.`,
        cao_key: payloadCaoKey,
        mismatching_rule_cao_keys: mismatchingRuleCaoKeysForGate
      }, { status: 422 });
    }
    const initialPayrollReadiness = await resolvePayrollReadiness(candidateCfgForGate, candidateRulesForGate);

    // ── Stap 5: Idempotency check met herstelpad ──
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key: payload.idempotency_key
    });
    const existingRun = existingRuns[0] || null;

    const existingSameConfig = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: payloadCaoKey,
      idempotency_key: payload.idempotency_key
    });

    // Completed + config aanwezig = idempotent, geen duplicaat
    if (!force && existingRun?.status === 'completed' && existingSameConfig.length > 0) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'duplicate_idempotency_key',
        idempotency_key: payload.idempotency_key,
        revision: payload.revision,
        cao_configuration_id: existingSameConfig[0].id
      });
    }

    // Hergebruik bestaande run (running/failed/geen config) of maak nieuw aan
    importRun = existingRun;
    if (!importRun) {
      importRun = await base44.asServiceRole.entities.CAOImportRun.create({
        started_at: new Date().toISOString(),
        trigger_type: 'cloudflare_pull',
        status: 'running',
        approval_status: 'owner_approved',
        idempotency_key: payload.idempotency_key,
        codex_thread_id: payload.approval?.codex_thread_id || null,
        source_document_ids: [],
        detected_changes: [],
        created_review_ids: [],
        payroll_readiness_status: initialPayrollReadiness.status,
        coverage_gate: initialPayrollReadiness.gate,
        summary: `Cloudflare sync gestart - revision ${payload.revision}`
      });
    } else {
      // Reset naar running bij herstel
      await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
        status: 'running',
        payroll_readiness_status: initialPayrollReadiness.status,
        coverage_gate: initialPayrollReadiness.gate
      });
    }

    // ── Stap 6: Upsert CAOSourceDocuments (alleen bij eerste batch of herstel) ──
    const sourceDocIds = [];
    const sourceDocumentSnapshots = [];
    const sourceDocs = payload.source_documents || [];
    const sourceDocsSeenAt = new Date().toISOString();
    for (const doc of sourceDocs) {
      if (!doc?.url) continue;
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      const docData = buildCaoSourceDocumentData(doc, existing[0], {
        now: sourceDocsSeenAt,
        caoKey: payloadCaoKey,
        revision: payload.revision,
        defaultSourceType: 'cao_pdf'
      });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, docData);
        sourceDocIds.push(existing[0].id);
        sourceDocumentSnapshots.push(buildCaoSourceDocumentSnapshot(docData, existing[0].id));
      } else {
        const created = await base44.asServiceRole.entities.CAOSourceDocument.create(docData);
        sourceDocIds.push(created.id);
        sourceDocumentSnapshots.push(buildCaoSourceDocumentSnapshot(docData, created.id));
      }
    }

    // ── Stap 7: Archiveer alleen exacte duplicaten (zelfde revision of idempotency_key) ──
    const duplicateConfigs = activeConfigs.filter(cfg =>
      cfg.cloudflare_revision === cloudflareRevision ||
      cfg.cloudflare_revision === payload.revision ||
      cfg.idempotency_key === payload.idempotency_key
    );
    for (const cfg of duplicateConfigs) {
      await base44.asServiceRole.entities.CAOConfiguration.update(cfg.id, {
        is_active: false,
        status: 'archived'
      });
    }

    // ── Stap 8: Normaliseer pay_periods ──
    function normalizePayPeriods(raw) {
      if (!raw) return null;
      if (Array.isArray(raw)) {
        const byYear = {};
        for (const p of raw) {
          const y = String(p.year || '');
          if (!y) continue;
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(p);
        }
        return Object.keys(byYear).length > 0 ? byYear : null;
      }
      if (typeof raw === 'object') return raw;
      return null;
    }

    // ── Stap 9: Upsert CAOConfiguration ──
    const candidateCfg = {
      ...(payload.candidate_configuration || {}),
      cao_key: payloadCaoKey,
      source_documents_snapshot: Array.isArray(payload.candidate_configuration?.source_documents_snapshot) && payload.candidate_configuration.source_documents_snapshot.length > 0
        ? payload.candidate_configuration.source_documents_snapshot
        : (payload.source_documents || [])
    };
    const candidateRules = normalizeCaoRulesInput(payload.candidate_rules || [], payloadCaoKey)
      .map(rule => withLocalRuntimeBindingMetadata(rule));
    const payrollReadiness = await resolvePayrollReadiness(candidateCfg, candidateRules);
    const manifestRegistry = await buildPayloadManifestRuleRegistrySnapshot({
      candidateCfg,
      candidateRules,
      payload,
      cloudflareRevision,
      ruleImportMode
    });
    const caoDefaults = getCaoDisplayDefaults(payloadCaoKey);
    const initialProcessedRuleCount = Math.min(ruleBatchOffset, candidateRules.length);
    const inProgressReadinessGate = importCaoRulesToBase44
      ? buildIncompleteRuleImportGate(
        payrollReadiness.gate,
        initialProcessedRuleCount,
        candidateRules.length
      )
      : {
        ...payrollReadiness.gate,
        payload_rule_registry: manifestRegistry,
        rule_import_mode: ruleImportMode
      };
    const initialPayrollReadinessStatus = importCaoRulesToBase44
      ? 'blocked_incomplete_source_coverage'
      : payrollReadiness.status;
    const configData = {
      name: candidateCfg.name || `${caoDefaults.name} - ${payload.revision}`,
      cao_key: payloadCaoKey,
      display_name: candidateCfg.display_name || caoDefaults.display_name || null,
      sector: candidateCfg.sector || caoDefaults.sector || null,
      version_label: candidateCfg.version_label || payload.revision,
      valid_from: candidateCfg.valid_from || null,
      valid_until: candidateCfg.valid_until || null,
      is_active: false,
      is_payroll_ready: false,
      payroll_readiness_status: initialPayrollReadinessStatus,
      payroll_readiness_checked_at: inProgressReadinessGate.checked_at || payrollReadiness.gate.checked_at,
      payroll_readiness_gate: inProgressReadinessGate,
      status: 'draft',
      wage_scales: candidateCfg.wage_scales || {},
      wage_scales_detailed: candidateCfg.wage_scales_detailed || null,
      holidays: candidateCfg.holidays || [],
      pay_periods: normalizePayPeriods(candidateCfg.pay_periods),
      surcharges: candidateCfg.surcharges || null,
      allowances: candidateCfg.allowances || null,
      leave_rules: candidateCfg.leave_rules || null,
      sickness_rules: candidateCfg.sickness_rules || null,
      minus_hours_rules: candidateCfg.minus_hours_rules || null,
      overtime_rules: candidateCfg.overtime_rules || null,
      shift_change_rules: candidateCfg.shift_change_rules || null,
      pension_rules: candidateCfg.pension_rules || null,
      fund_rules: candidateCfg.fund_rules || null,
      schiphol_rules: candidateCfg.schiphol_rules || null,
      cash_value_logistics_rules: candidateCfg.cash_value_logistics_rules || null,
      contract_change_rules: candidateCfg.contract_change_rules || null,
      function_classification_rules: candidateCfg.function_classification_rules || null,
      rule_engine_metadata: {
        ...((payload.rule_engine_metadata || {})),
        ...((candidateCfg.rule_engine_metadata || {})),
        rule_import_mode: ruleImportMode,
        rule_registry_source: 'cloudflare_payload_manifest',
        cloudflare_status_revision: cloudflareRevision,
        cloudflare_payload_revision: payload.revision,
        idempotency_key: payload.idempotency_key
      },
      source_documents_snapshot: sourceDocumentSnapshots.length > 0
        ? sourceDocumentSnapshots
        : (candidateCfg.source_documents_snapshot || null),
      coverage_summary: {
        ...(payload.coverage_summary || {}),
        ...(candidateCfg.coverage_summary || {}),
        payroll_readiness: {
          status: initialPayrollReadinessStatus,
          requested_payroll_ready: payrollReadiness.requested_payroll_ready,
          passed: importCaoRulesToBase44 ? false : payrollReadiness.gate.passed,
          counts: inProgressReadinessGate.counts,
          blocking_findings: inProgressReadinessGate.blocking_findings,
          rule_import_mode: ruleImportMode,
          payload_rule_registry: {
            expected_unique_rule_count: manifestRegistry.expected_unique_rule_count,
            manifest_unique_rule_count: manifestRegistry.manifest_unique_rule_count,
            fingerprint: manifestRegistry.fingerprint,
            fingerprint_algorithm: manifestRegistry.fingerprint_algorithm,
            verified_at: manifestRegistry.verified_at
          }
        }
      },
      surcharge_weekend: candidateCfg.surcharge_weekend ?? 35,
      surcharge_night: candidateCfg.surcharge_night ?? 20,
      surcharge_evening: candidateCfg.surcharge_evening ?? 10,
      surcharge_holiday: candidateCfg.surcharge_holiday ?? 50,
      surcharge_new_years_eve_after_16: candidateCfg.surcharge_new_years_eve_after_16 ?? 100,
      vacation_allowance: candidateCfg.vacation_allowance ?? 8,
      year_end_bonus: candidateCfg.year_end_bonus ?? 2.01,
      pension_base_salary_threshold: candidateCfg.pension_base_salary_threshold ?? 16164,
      pension_premium_rate_total: candidateCfg.pension_premium_rate_total ?? 24.1,
      pension_premium_employer: candidateCfg.pension_premium_employer ?? 60,
      pension_premium_employee: candidateCfg.pension_premium_employee ?? 40,
      premium_sfpb: candidateCfg.premium_sfpb ?? 0.061,
      premium_paww_employee: candidateCfg.premium_paww_employee ?? 0.1,
      premium_wga_employee: candidateCfg.premium_wga_employee ?? 0.81,
      premium_awf_employer: candidateCfg.premium_awf_employer ?? 2.64,
      premium_ww_employer_fixed: candidateCfg.premium_ww_employer_fixed ?? 0,
      premium_ww_employer_variable: candidateCfg.premium_ww_employer_variable ?? 1.5,
      premium_wia_employer: candidateCfg.premium_wia_employer ?? 0.72,
      premium_wga_employer: candidateCfg.premium_wga_employer ?? 1.5,
      premium_zw_employer: candidateCfg.premium_zw_employer ?? 0,
      tax_rate_bracket_1: candidateCfg.tax_rate_bracket_1 ?? 36.97,
      tax_rate_bracket_2: candidateCfg.tax_rate_bracket_2 ?? 36.97,
      tax_rate_bracket_3: candidateCfg.tax_rate_bracket_3 ?? 49.5,
      tax_bracket_1_limit: candidateCfg.tax_bracket_1_limit ?? 38098,
      tax_bracket_2_limit: candidateCfg.tax_bracket_2_limit ?? 75518,
      labor_tax_credit_max: candidateCfg.labor_tax_credit_max ?? 5672,
      approval_source: payload.approval?.approval_source || 'cloudflare_relay',
      approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
      approved_at: payload.approval?.approved_at || null,
      codex_thread_id: payload.approval?.codex_thread_id || null,
      codex_approval_message: payload.approval?.approval_message || null,
      cloudflare_revision: cloudflareRevision || payload.revision,
      idempotency_key: payload.idempotency_key,
      automation_version: payload.automation_version || null,
      notes: `Automatisch gesynchroniseerd via Cloudflare (${trigger_source}) op ${new Date().toISOString()}`
    };

    let newConfig;
    if (existingSameConfig.length > 0) {
      await base44.asServiceRole.entities.CAOConfiguration.update(existingSameConfig[0].id, configData);
      newConfig = { ...existingSameConfig[0], ...configData, id: existingSameConfig[0].id };
    } else {
      newConfig = await base44.asServiceRole.entities.CAOConfiguration.create(configData);
    }

    // ── Stap 10: Verwerk optionele CAORule backfill ──
    let rulesUpserted = 0;
    let nextRuleBatchOffset = ruleBatchOffset;
    let rulesComplete = true;
    let registrySnapshot = manifestRegistry;
    let registryGateProperty = 'payload_rule_registry';

    if (importCaoRulesToBase44) {
      const batchRules = candidateRules.slice(ruleBatchOffset, ruleBatchOffset + ruleBatchSize);

      for (const rule of batchRules) {
        if (!rule.rule_id) continue;
        const existing = await findExistingCaoRule(base44, {
          ruleId: rule.rule_id,
          caoKey: payloadCaoKey,
          configId: newConfig.id
        });
        const ruleData = {
          ...rule,
          cao_key: rule.cao_key || payloadCaoKey,
          cao_configuration_id: newConfig.id,
          status: 'active',
          last_verified_at: new Date().toISOString()
        };
        if (existing) {
          await base44.asServiceRole.entities.CAORule.update(existing.id, ruleData);
        } else {
          await base44.asServiceRole.entities.CAORule.create(ruleData);
        }
        rulesUpserted++;
      }

      nextRuleBatchOffset = ruleBatchOffset + batchRules.length;
      rulesComplete = nextRuleBatchOffset >= candidateRules.length;

      // ── Stap 11: Gedeeltelijke backfill — nog niet klaar ──
      if (!rulesComplete) {
        const partialReadinessGate = buildIncompleteRuleImportGate(
          payrollReadiness.gate,
          nextRuleBatchOffset,
          candidateRules.length
        );
        await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
          status: 'running',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          coverage_gate: partialReadinessGate,
          summary: `Cloudflare CAORule backfill: regels ${ruleBatchOffset}-${nextRuleBatchOffset - 1} van ${candidateRules.length} verwerkt. Volgende offset: ${nextRuleBatchOffset}`
        });
        await base44.asServiceRole.entities.CAOConfiguration.update(newConfig.id, {
          is_active: false,
          is_payroll_ready: false,
          status: 'draft',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          payroll_readiness_checked_at: partialReadinessGate.checked_at || new Date().toISOString(),
          payroll_readiness_gate: partialReadinessGate
        });
        newConfig = {
          ...newConfig,
          is_active: false,
          is_payroll_ready: false,
          status: 'draft',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          payroll_readiness_gate: partialReadinessGate
        };

        return Response.json({
          success: true,
          changed: true,
          partial: true,
          reason: 'rule_backfill_batch_processed',
          revision: payload.revision,
          cloudflare_revision: cloudflareRevision,
          idempotency_key: payload.idempotency_key,
          cao_configuration_id: newConfig.id,
          import_run_id: importRun.id,
          rule_import_mode: ruleImportMode,
          rules_upserted: rulesUpserted,
          rules_total: candidateRules.length,
          rule_batch_offset: ruleBatchOffset,
          next_rule_batch_offset: nextRuleBatchOffset,
          rule_batch_size: ruleBatchSize,
          rules_complete: false,
          is_payroll_ready: false,
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          coverage_gate: partialReadinessGate
        });
      }

      const persistedRegistry = await verifyPersistedRuleRegistry(base44, {
        caoKey: payloadCaoKey,
        configId: newConfig.id,
        candidateCfg,
        candidateRules
      });
      if (!persistedRegistry.passed) {
        const registryBlockedGate = {
          ...payrollReadiness.gate,
          passed: false,
          status: 'blocked_incomplete_source_coverage',
          persisted_rule_registry: persistedRegistry,
          rule_import_mode: ruleImportMode,
          blocking_findings: [
            ...persistedRegistry.blocking_findings,
            ...(payrollReadiness.gate.blocking_findings || [])
          ]
        };
        await base44.asServiceRole.entities.CAOConfiguration.update(newConfig.id, {
          is_active: false,
          is_payroll_ready: false,
          status: 'draft',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          payroll_readiness_checked_at: registryBlockedGate.checked_at || new Date().toISOString(),
          payroll_readiness_gate: registryBlockedGate
        });
        await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
          finished_at: new Date().toISOString(),
          status: 'failed',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          coverage_gate: registryBlockedGate,
          error_message: 'CAO-registry backfill incompleet; configuratie niet geactiveerd.',
          summary: `Cloudflare sync geblokkeerd: ${persistedRegistry.persisted_unique_rule_count}/${persistedRegistry.expected_unique_rule_count} regels opgeslagen voor config ${newConfig.id}.`
        });
        return Response.json({
          success: false,
          changed: false,
          reason: 'persisted_rule_registry_incomplete',
          revision: payload.revision,
          cloudflare_revision: cloudflareRevision,
          idempotency_key: payload.idempotency_key,
          cao_configuration_id: newConfig.id,
          import_run_id: importRun.id,
          rule_import_mode: ruleImportMode,
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          persisted_rule_registry: persistedRegistry,
          coverage_gate: registryBlockedGate
        }, { status: 422 });
      }

      registrySnapshot = persistedRegistry;
      registryGateProperty = 'persisted_rule_registry';
    }

    const finalCoverageGate = {
      ...payrollReadiness.gate,
      [registryGateProperty]: registrySnapshot,
      rule_import_mode: ruleImportMode
    };

    const activationData = {
      is_active: true,
      is_payroll_ready: payrollReadiness.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      payroll_readiness_checked_at: payrollReadiness.gate.checked_at,
      payroll_readiness_gate: finalCoverageGate,
      rule_registry_fingerprint: registrySnapshot.fingerprint,
      rule_registry_rule_count: registrySnapshot.persisted_unique_rule_count ?? registrySnapshot.manifest_unique_rule_count ?? registrySnapshot.fingerprint_rule_count,
      rule_registry_verified_at: registrySnapshot.verified_at,
      rule_registry_snapshot: registrySnapshot,
      status: 'active',
      coverage_summary: {
        ...(newConfig.coverage_summary || {}),
        payroll_readiness: {
          status: payrollReadiness.status,
          requested_payroll_ready: payrollReadiness.requested_payroll_ready,
          passed: payrollReadiness.gate.passed,
          counts: payrollReadiness.gate.counts,
          blocking_findings: payrollReadiness.gate.blocking_findings,
          rule_import_mode: ruleImportMode,
          [registryGateProperty]: {
            expected_unique_rule_count: registrySnapshot.expected_unique_rule_count,
            persisted_unique_rule_count: registrySnapshot.persisted_unique_rule_count ?? null,
            manifest_unique_rule_count: registrySnapshot.manifest_unique_rule_count ?? null,
            fingerprint: registrySnapshot.fingerprint,
            fingerprint_algorithm: registrySnapshot.fingerprint_algorithm,
            verified_at: registrySnapshot.verified_at
          }
        }
      }
    };
    await base44.asServiceRole.entities.CAOConfiguration.update(newConfig.id, activationData);
    newConfig = { ...newConfig, ...activationData };

    // ── Stap 12: Alle regels klaar — maak CAOChangeReview records ──
    const reviewIds = [];
    const detectedChanges = payload.detected_changes || [];
    for (const change of detectedChanges) {
      const effectiveMeta = buildChangeEffectiveMetadata(
        change,
        newConfig.valid_from || candidateCfg.valid_from || null,
        payload.approval?.approved_at || null
      );
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: newConfig.id,
        cao_key: newConfig.cao_key || candidateCfg.cao_key || null,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'medium',
        ...effectiveMeta,
        status: 'applied',
        approval_source: payload.approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
        approved_at: payload.approval?.approved_at || null,
        codex_thread_id: payload.approval?.codex_thread_id || null,
        idempotency_key: payload.idempotency_key
      });
      reviewIds.push(review.id);
    }

    let correctionQueueSummary = null;
    if (reviewIds.length > 0) {
      try {
        const queueRes = await base44.asServiceRole.functions.invoke('queueCaoPayrollCorrections', {
          review_ids: reviewIds,
          import_run_id: importRun.id,
          idempotency_key: payload.idempotency_key,
          sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
        });
        correctionQueueSummary = queueRes?.data || null;
      } catch (error) {
        correctionQueueSummary = {
          success: false,
          error: error.message,
          note: 'CAO-sync voltooid, maar queueCaoPayrollCorrections faalde. Handmatige queue-run vereist.'
        };
      }
    }

    // ── Stap 13: Finaliseer import run ──
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      created_configuration_id: newConfig.id,
      created_review_ids: reviewIds,
      created_correction_ids: [
        ...(correctionQueueSummary?.created_correction_ids || []),
        ...(correctionQueueSummary?.updated_correction_ids || [])
      ],
      correction_queue_summary: correctionQueueSummary,
      source_document_ids: sourceDocIds,
      detected_changes: detectedChanges,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: finalCoverageGate,
      summary: `Cloudflare sync voltooid (${ruleImportMode}): ${candidateRules.length} regels gevalideerd, ${rulesUpserted} CAORule records geupsert, ${sourceDocs.length} brondocumenten, ${reviewIds.length} wijzigingen, ${correctionQueueSummary?.corrections_created || 0} payrollcorrecties nieuw, ${correctionQueueSummary?.corrections_updated || 0} payrollcorrecties bijgewerkt. Payroll-ready: ${newConfig.is_payroll_ready ? 'ja' : 'nee'} (${payrollReadiness.status}). Revision: ${payload.revision}`
    });

    return Response.json({
      success: true,
      changed: true,
      partial: false,
      revision: payload.revision,
      cloudflare_revision: cloudflareRevision,
      idempotency_key: payload.idempotency_key,
      cao_configuration_id: newConfig.id,
      import_run_id: importRun.id,
      rule_import_mode: ruleImportMode,
      rules_upserted: rulesUpserted,
      rules_total: candidateRules.length,
      rule_batch_offset: ruleBatchOffset,
      next_rule_batch_offset: nextRuleBatchOffset,
      rule_batch_size: ruleBatchSize,
      rules_complete: true,
      source_docs_upserted: sourceDocIds.length,
      change_reviews_created: reviewIds.length,
      correction_queue_summary: correctionQueueSummary,
      is_payroll_ready: newConfig.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: finalCoverageGate,
      coverage_summary: newConfig.coverage_summary || null
    });

  } catch (error) {
    // Markeer import run als failed bij fout
    if (importRun?.id) {
      try {
        await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_message: error.message
        });
      } catch { /* negeer secundaire fout */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});

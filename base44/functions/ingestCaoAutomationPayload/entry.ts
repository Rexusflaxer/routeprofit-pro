import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner-only CAO ingest endpoint.
// Called by Cloudflare cao-automation-relay after owner approval in Codex.
// Auth: Authorization: Bearer <CAO_AUTOMATION_SHARED_SECRET>
// All customer user auth is ignored for mutations — secret-only gate.

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

function buildCaoSourceDocumentData(doc, existingDoc, { now, caoKey, revision, defaultSourceType = 'other' }) {
  const sourceType = normalizeCaoSourceType(
    doc.source_type || doc.document_type || doc.type || doc.source_category,
    doc,
    defaultSourceType
  );
  const explicitOfficial = booleanOrNull(doc.is_official_source ?? doc.official_source);
  const official = explicitOfficial ?? inferOfficialSource(doc.url);
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

function hasLocalPayrollRuntime(caoKey) {
  return LOCAL_PAYROLL_RUNTIME_CAO_KEYS.includes(normalizeCaoKey(caoKey));
}

const LOCAL_RUNTIME_RULE_BINDINGS = {
  'resolveCaoApplicability.article_3_scope': {
    functions: ['resolveCaoApplicability', 'validateTaskPlanningContext', 'calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
      'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
      'CAO-PB-2024-R0233'
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
      'CAO-PB-2024-R0447', 'CAO-PB-2024-R0448', 'CAO-PB-2024-R0451'
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
      'CAO-PB-2024-R0764', 'CAO-PB-2024-R0765', 'CAO-PB-2024-R0766'
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
      'CAO-PB-2024-R0855', 'CAO-PB-2024-R0878', 'CAO-PB-2024-R0880',
      'CAO-PB-2024-R0885', 'CAO-PB-2024-R0890', 'CAO-PB-2024-R0895',
      'CAO-PB-2024-R0900', 'CAO-PB-2024-R0905', 'CAO-PB-2024-R1609'
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
      'CAO-PB-2024-R1021', 'CAO-PB-2024-R1601', 'CAO-PB-2024-R1602'
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
      'CAO-PB-2024-R1619', 'CAO-PB-2024-R1620', 'CAO-PB-2024-R1621',
      'CAO-PB-2024-R1622', 'CAO-PB-2024-R1623', 'CAO-PB-2024-R1624',
      'CAO-PB-2024-R1626', 'CAO-PB-2024-R1627', 'CAO-PB-2024-R1628',
      'CAO-PB-2024-R1629', 'CAO-PB-2024-R1630', 'CAO-PB-2024-R1631',
      'CAO-PB-2024-R1632', 'CAO-PB-2024-R1633',
      'CAO-PB-2024-R1635', 'CAO-PB-2024-R1636', 'CAO-PB-2024-R1637',
      'CAO-PB-2024-R1638', 'CAO-PB-2024-R1639', 'CAO-PB-2024-R1640',
      'CAO-PB-2024-R1641', 'CAO-PB-2024-R1642'
    ]
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
  const uniqueRuleIds = new Set(rules.map(rule => rule.rule_id).filter(Boolean));
  const byAutomationLevel = countByAutomationLevel(rules);
  const sourceFamilyCoverage = evaluateRequiredSourceFamilyCoverage(candidateCfg);
  const blockingFindings = [];
  const payrollCriticalMissingSourceLocator = [];
  const payrollCriticalMissingSourceHash = [];

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

async function resolvePayrollReadiness(candidateCfg, candidateRules, isOwnerApproved) {
  const gate = await evaluateCaoCoverageGate(candidateCfg, candidateRules);
  const requestedPayrollReady = candidateCfg?.is_payroll_ready === true;
  const isPayrollReady = isOwnerApproved && requestedPayrollReady && gate.passed;
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
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Validate shared secret — must match CAO_AUTOMATION_SHARED_SECRET env var
    const authHeader = req.headers.get('Authorization') || '';
    const secret = Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
    if (!secret) {
      return Response.json({ error: 'CAO_AUTOMATION_SHARED_SECRET not configured on server.' }, { status: 500 });
    }
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearerToken || bearerToken !== secret) {
      return Response.json({ error: 'Unauthorized — invalid or missing CAO automation secret.' }, { status: 401 });
    }

    const cloudflareRequestId = req.headers.get('cf-ray') || req.headers.get('x-request-id') || null;

    const body = await req.json();
    const {
      idempotency_key,
      revision,
      cao_key,
      automation_version,
      approval,
      source_documents = [],
      candidate_configuration = {},
      candidate_rules = [],
      detected_changes = []
    } = body;

    if (!idempotency_key) {
      return Response.json({ error: 'idempotency_key is verplicht.' }, { status: 400 });
    }
    if (!cao_key) {
      return Response.json({ error: 'cao_key is verplicht.' }, { status: 400 });
    }
    const normalizedCaoKey = normalizeCaoKey(cao_key);
    const candidateCaoKey = normalizeCaoKey(candidate_configuration?.cao_key);
    if (!isKnownSecurityCaoKey(normalizedCaoKey)) {
      return Response.json({
        error: `Onbekende of niet-toegestane cao_key: ${normalizedCaoKey}`,
        known_cao_keys: KNOWN_SECURITY_CAO_KEYS
      }, { status: 422 });
    }
    if (candidateCaoKey && candidateCaoKey !== normalizedCaoKey) {
      return Response.json({
        error: `Payload cao_key ${normalizedCaoKey} botst met candidate_configuration.cao_key ${candidateCaoKey}.`
      }, { status: 422 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    // Idempotency check — reject duplicate ingest runs
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key
    });
    if (existingRuns.length > 0) {
      const prev = existingRuns[0];
      return Response.json({
        success: true,
        idempotency_key,
        message: 'Payload al eerder verwerkt (idempotent).',
        import_run_id: prev.id,
        cao_configuration_id: prev.created_configuration_id || null,
        applied: prev.status === 'completed',
        duplicate: true
      });
    }

    const isOwnerApproved = approval?.status === 'approved_by_owner';
    const trigger_type = 'cloudflare_relay';
    const approval_status = isOwnerApproved ? 'owner_approved' : 'proposed';
    const candidateConfigurationForGate = {
      ...candidate_configuration,
      cao_key: normalizedCaoKey,
      source_documents_snapshot: Array.isArray(candidate_configuration.source_documents_snapshot) && candidate_configuration.source_documents_snapshot.length > 0
        ? candidate_configuration.source_documents_snapshot
        : source_documents
    };
    const normalizedCandidateRules = normalizeCaoRulesInput(candidate_rules, normalizedCaoKey)
      .map(rule => withLocalRuntimeBindingMetadata(rule));
    const mismatchingRuleCaoKeys = [...new Set(normalizedCandidateRules
      .map(rule => normalizeCaoKey(rule?.cao_key))
      .filter(key => key && key !== normalizedCaoKey))];
    if (mismatchingRuleCaoKeys.length > 0) {
      return Response.json({
        error: `Payload bevat CAORule records met afwijkende cao_key waarden: ${mismatchingRuleCaoKeys.join(', ')}.`,
        cao_key: normalizedCaoKey,
        mismatching_rule_cao_keys: mismatchingRuleCaoKeys
      }, { status: 422 });
    }
    const payrollReadiness = await resolvePayrollReadiness(candidateConfigurationForGate, normalizedCandidateRules, isOwnerApproved);

    // Maak ImportRun aan
    const importRun = await base44.asServiceRole.entities.CAOImportRun.create({
      started_at: now,
      finished_at: null,
      trigger_type,
      status: 'running',
      idempotency_key,
      approval_status,
      codex_thread_id: approval?.codex_thread_id || null,
      cloudflare_request_id: cloudflareRequestId,
      source_document_ids: [],
      detected_changes: [],
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary: null,
      error_message: null
    });

    // Upsert source documents
    const sourceDocIds = [];
    const sourceDocumentSnapshots = [];
    for (const doc of source_documents) {
      if (!doc.url) continue;
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      const docData = buildCaoSourceDocumentData(doc, existing[0], {
        now,
        caoKey: normalizedCaoKey,
        revision,
        defaultSourceType: 'other'
      });
      let savedDoc;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, docData);
        savedDoc = { id: existing[0].id };
      } else {
        savedDoc = await base44.asServiceRole.entities.CAOSourceDocument.create(docData);
      }
      sourceDocIds.push(savedDoc.id);
      sourceDocumentSnapshots.push(buildCaoSourceDocumentSnapshot(docData, savedDoc.id));
    }

    // Upsert / create CAOConfiguration
    let configId = null;
    if (Object.keys(candidate_configuration).length > 0 || isOwnerApproved) {
      const existingConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({ cao_key: normalizedCaoKey });
      const inProgressReadinessGate = buildIncompleteRuleImportGate(
        payrollReadiness.gate,
        0,
        normalizedCandidateRules.length
      );

      const configData = {
        ...candidate_configuration,
        cao_key: normalizedCaoKey,
        status: 'draft',
        is_active: false,
        is_payroll_ready: false,
        payroll_readiness_status: isOwnerApproved ? 'blocked_incomplete_source_coverage' : payrollReadiness.status,
        payroll_readiness_checked_at: isOwnerApproved
          ? (inProgressReadinessGate.checked_at || payrollReadiness.gate.checked_at)
          : payrollReadiness.gate.checked_at,
        payroll_readiness_gate: isOwnerApproved ? inProgressReadinessGate : payrollReadiness.gate,
        source_documents_snapshot: sourceDocumentSnapshots.length > 0
          ? sourceDocumentSnapshots
          : (candidate_configuration.source_documents_snapshot || null),
        coverage_summary: {
          ...(candidate_configuration.coverage_summary || {}),
          payroll_readiness: {
            status: isOwnerApproved ? 'blocked_incomplete_source_coverage' : payrollReadiness.status,
            requested_payroll_ready: payrollReadiness.requested_payroll_ready,
            passed: isOwnerApproved ? false : payrollReadiness.gate.passed,
            counts: isOwnerApproved ? inProgressReadinessGate.counts : payrollReadiness.gate.counts,
            blocking_findings: isOwnerApproved ? inProgressReadinessGate.blocking_findings : payrollReadiness.gate.blocking_findings
          }
        },
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: approval?.approved_by_owner_name || null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        codex_approval_message: approval?.approval_message || null,
        cloudflare_request_id: cloudflareRequestId,
        cloudflare_revision: revision || candidate_configuration.cloudflare_revision || null,
        idempotency_key,
        automation_version: automation_version || null
      };

      if (isOwnerApproved) {
        // Archiveer alleen exacte duplicaten. Andere actieve configs met andere
        // valid_from/valid_until blijven bestaan voor historische berekeningen.
        const duplicateConfigs = existingConfigs.filter(existing =>
          (revision && existing.cloudflare_revision === revision) ||
          existing.idempotency_key === idempotency_key
        );
        for (const existing of duplicateConfigs) {
          await base44.asServiceRole.entities.CAOConfiguration.update(existing.id, {
            status: 'archived',
            is_active: false
          });
        }
      }

      // Check for existing pending config with same idempotency_key
      const existingPending = existingConfigs.find(c => c.idempotency_key === idempotency_key);
      if (existingPending) {
        await base44.asServiceRole.entities.CAOConfiguration.update(existingPending.id, configData);
        configId = existingPending.id;
      } else {
        const newConfig = await base44.asServiceRole.entities.CAOConfiguration.create(configData);
        configId = newConfig.id;
      }
    }

    // Upsert CAO rules
    let rulesUpserted = 0;
    for (const rule of normalizedCandidateRules) {
      if (!rule.rule_id) continue;
      const targetCaoKey = rule.cao_key || normalizedCaoKey;
      const targetConfigId = configId || rule.cao_configuration_id || null;
      const existing = await findExistingCaoRule(base44, {
        ruleId: rule.rule_id,
        caoKey: targetCaoKey,
        configId: targetConfigId
      });
      const ruleData = {
        ...rule,
        cao_key: targetCaoKey,
        cao_configuration_id: targetConfigId,
        status: isOwnerApproved ? 'active' : 'draft',
        last_verified_at: isOwnerApproved ? now : (rule.last_verified_at || null)
      };
      if (existing) {
        await base44.asServiceRole.entities.CAORule.update(existing.id, ruleData);
      } else {
        await base44.asServiceRole.entities.CAORule.create(ruleData);
      }
      rulesUpserted++;
    }

    if (isOwnerApproved && configId) {
      const persistedRegistry = await verifyPersistedRuleRegistry(base44, {
        caoKey: normalizedCaoKey,
        configId,
        candidateCfg: candidateConfigurationForGate,
        candidateRules: normalizedCandidateRules
      });
      if (!persistedRegistry.passed) {
        const registryBlockedGate = {
          ...payrollReadiness.gate,
          passed: false,
          status: 'blocked_incomplete_source_coverage',
          persisted_rule_registry: persistedRegistry,
          blocking_findings: [
            ...persistedRegistry.blocking_findings,
            ...(payrollReadiness.gate.blocking_findings || [])
          ]
        };
        await base44.asServiceRole.entities.CAOConfiguration.update(configId, {
          is_active: false,
          is_payroll_ready: false,
          status: 'draft',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          payroll_readiness_checked_at: registryBlockedGate.checked_at || now,
          payroll_readiness_gate: registryBlockedGate
        });
        await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
          finished_at: new Date().toISOString(),
          status: 'failed',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          coverage_gate: registryBlockedGate,
          error_message: 'CAO-registry import incompleet; configuratie niet geactiveerd.',
          summary: `Owner-approved CAO ingest geblokkeerd: ${persistedRegistry.persisted_unique_rule_count}/${persistedRegistry.expected_unique_rule_count} regels opgeslagen voor config ${configId}.`
        });
        return Response.json({
          success: false,
          idempotency_key,
          import_run_id: importRun.id,
          cao_configuration_id: configId,
          applied: false,
          reason: 'persisted_rule_registry_incomplete',
          payroll_readiness_status: 'blocked_incomplete_source_coverage',
          persisted_rule_registry: persistedRegistry,
          coverage_gate: registryBlockedGate
        }, { status: 422 });
      }

      await base44.asServiceRole.entities.CAOConfiguration.update(configId, {
        status: 'active',
        is_active: true,
        is_payroll_ready: payrollReadiness.is_payroll_ready,
        payroll_readiness_status: payrollReadiness.status,
        payroll_readiness_checked_at: payrollReadiness.gate.checked_at,
        payroll_readiness_gate: {
          ...payrollReadiness.gate,
          persisted_rule_registry: persistedRegistry
        },
        rule_registry_fingerprint: persistedRegistry.fingerprint,
        rule_registry_rule_count: persistedRegistry.persisted_unique_rule_count,
        rule_registry_verified_at: persistedRegistry.verified_at,
        rule_registry_snapshot: persistedRegistry,
        coverage_summary: {
          ...(candidate_configuration.coverage_summary || {}),
          payroll_readiness: {
            status: payrollReadiness.status,
            requested_payroll_ready: payrollReadiness.requested_payroll_ready,
            passed: payrollReadiness.gate.passed,
            counts: payrollReadiness.gate.counts,
            blocking_findings: payrollReadiness.gate.blocking_findings,
            persisted_rule_registry: {
              expected_unique_rule_count: persistedRegistry.expected_unique_rule_count,
              persisted_unique_rule_count: persistedRegistry.persisted_unique_rule_count,
              fingerprint: persistedRegistry.fingerprint,
              fingerprint_algorithm: persistedRegistry.fingerprint_algorithm,
              verified_at: persistedRegistry.verified_at
            }
          }
        }
      });
    }

    // Create CAOChangeReview records
    const reviewIds = [];
    const reviewStatus = isOwnerApproved ? 'applied' : 'proposed';
    for (const change of detected_changes) {
      const effectiveMeta = buildChangeEffectiveMetadata(
        change,
        candidate_configuration.valid_from || null,
        approval?.approved_at || null
      );
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: configId,
        cao_key: normalizedCaoKey,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        source_document_id: change.source_document_id || null,
        source_reference: change.source_reference || null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'low',
        ...effectiveMeta,
        status: reviewStatus,
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: isOwnerApproved ? (approval?.approved_by_owner_name || null) : null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        cloudflare_request_id: cloudflareRequestId,
        idempotency_key,
        review_notes: isOwnerApproved
          ? `Owner-approved via Codex (${approval?.approved_by_owner_name || 'owner'}) on ${approval?.approved_at || now}`
          : 'Proposed — awaiting owner approval'
      });
      reviewIds.push(review.id);
    }

    let correctionQueueSummary = null;
    if (reviewIds.length > 0 && isOwnerApproved) {
      try {
        const queueRes = await base44.asServiceRole.functions.invoke('queueCaoPayrollCorrections', {
          review_ids: reviewIds,
          import_run_id: importRun.id,
          idempotency_key,
          sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
        });
        correctionQueueSummary = queueRes?.data || null;
      } catch (error) {
        correctionQueueSummary = {
          success: false,
          error: error.message,
          note: 'Owner-approved ingest voltooid, maar queueCaoPayrollCorrections faalde. Handmatige queue-run vereist.'
        };
      }
    }

    const summary = isOwnerApproved
      ? `Owner-approved CAO payload toegepast. Config: ${configId}. Regels: ${rulesUpserted}. Wijzigingen: ${reviewIds.length}. Payrollcorrecties nieuw: ${correctionQueueSummary?.corrections_created || 0}, bijgewerkt: ${correctionQueueSummary?.corrections_updated || 0}.`
      : `Proposed CAO payload ontvangen (niet geactiveerd — geen owner approval). Regels: ${rulesUpserted}.`;

    // Finalize import run
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      source_document_ids: sourceDocIds,
      created_configuration_id: configId,
      created_review_ids: reviewIds,
      created_correction_ids: [
        ...(correctionQueueSummary?.created_correction_ids || []),
        ...(correctionQueueSummary?.updated_correction_ids || [])
      ],
      correction_queue_summary: correctionQueueSummary,
      detected_changes,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

    return Response.json({
      success: true,
      idempotency_key,
      import_run_id: importRun.id,
      cao_configuration_id: configId,
      applied: isOwnerApproved,
      changes_count: reviewIds.length,
      rules_upserted: rulesUpserted,
      source_docs_upserted: sourceDocIds.length,
      correction_queue_summary: correctionQueueSummary,
      is_payroll_ready: payrollReadiness.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_FUNCTION_CLASSIFICATION_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || CAO_PB_KEY;
  const supported = SUPPORTED_FUNCTION_CLASSIFICATION_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : 'blocked_unsupported_cao_runtime',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_FUNCTION_CLASSIFICATION_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Functie-indeling is geblokkeerd zodat geen PB-bijlage-2 regels op een andere CAO worden toegepast.`
  };
}

/**
 * resolveCaoFunctionClassification
 * Bepaalt CAO PB functie-indeling, loonschaal en periodiek-validatie op basis van artikel 34/35 en bijlage 2.
 * Bronregels: CAO-PB-2024-R0714 t/m R0747, R1751-R1814
 *
 * FAIL-CLOSED: geen stille fallback naar schaal 3 of periodiek 0.
 * Als functiegroep of niveau onbekend is → manual_review_required=true, geen schaal.
 */

// ── Bijlage 2 matrix: functiegroep → functieniveau → salarisschaal ──
// Bronregel CAO-PB-2024-R1813: alle functiegroepen volgen schaal 2 t/m 7.
const APPENDIX_2_SCALE_MAP = {
  objectbeveiliger_receptionist: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  },
  mobiel_surveillant: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  },
  winkelsurveillant: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  },
  brandwacht: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  },
  geld_waardetransporteur: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  },
  centralist: {
    aspirant: { scale: 2, source_rule: 'CAO-PB-2024-R1813' },
    a: { scale: 3, source_rule: 'CAO-PB-2024-R1813' },
    b: { scale: 4, source_rule: 'CAO-PB-2024-R1813' },
    c: { scale: 5, source_rule: 'CAO-PB-2024-R1813' },
    d: { scale: 6, source_rule: 'CAO-PB-2024-R1813' },
    e: { scale: 7, source_rule: 'CAO-PB-2024-R1813' }
  }
};

// ── Infereer functiegroep op basis van function_type/functietitel (50%-criterium R0729) ──
const FUNCTION_TYPE_ALIASES = [
  {
    group: 'objectbeveiliger_receptionist',
    aliases: [
      'objectbeveiliger', 'objectbeveiliging', 'object beveiliging', 'object security',
      'receptionist', 'receptie', 'receptiedienst', 'front office security', 'security receptionist'
    ]
  },
  {
    group: 'mobiel_surveillant',
    aliases: [
      'surveillant', 'mobiel_surveillant', 'mobiele surveillance', 'mobiele surveillant',
      'mobile surveillance', 'route surveillant', 'ronde surveillant'
    ]
  },
  {
    group: 'winkelsurveillant',
    aliases: ['winkelsurveillant', 'winkel surveillance', 'retail security', 'winkelbeveiliger']
  },
  {
    group: 'brandwacht',
    aliases: ['brandwacht', 'fire watch', 'mangatwacht', 'veiligheidswacht']
  },
  {
    group: 'geld_waardetransporteur',
    aliases: [
      'geld_waardetransporteur', 'geldtransport', 'waardetransport', 'cash transport',
      'cash value', 'value logistics', 'geld en waardetransport'
    ]
  },
  {
    group: 'centralist',
    aliases: ['centralist', 'alarmcentrale', 'meldkamer', 'operator alarmcentrale']
  }
];

const NON_SECURITY_FUNCTION_TYPES = ['binnendienst', 'planner', 'installateur', 'host', 'other'];

// ── Infereer niveau op basis van security_role_status (R0728) ──
const ROLE_STATUS_TO_LEVEL = {
  aspirant_beveiliger: 'aspirant',
  beveiliger: 'a'
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 'yes' || value === 'ja') return true;
  if (value === 'false' || value === 'no' || value === 'nee') return false;
  return null;
}

function pushUnique(target, ...items) {
  for (const item of items.flat()) {
    if (item && !target.includes(item)) target.push(item);
  }
}

function addWorkflowReview(items, ruleId, domain, message, field) {
  items.push({
    rule_id: ruleId,
    domain,
    message,
    field,
    blocking: false
  });
}

const CONTRACT_CLASSIFICATION_FIELDS = [
  'function_type',
  'cao_function_group',
  'cao_function_level',
  'security_role_status',
  'performs_security_work',
  'security_work_percentage',
  'works_airport_schiphol',
  'works_cash_value_logistics',
  'works_event_or_hospitality_security',
  'event_hospitality_cao_applies',
  'cao_scale',
  'cao_period',
  'written_classification_notice_confirmed',
  'written_function_classification_notice_confirmed',
  'written_scale_period_notice_confirmed',
  'wage_scale_period_notice_confirmed',
  'periodic_increase_due_confirmed',
  'periodiek_verhoging_bevestigd'
];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function buildClassificationSubject(personnel, contract) {
  const subject = { ...(personnel || {}) };
  const fieldSources = {};
  const overrides = [];

  for (const field of CONTRACT_CLASSIFICATION_FIELDS) {
    if (hasValue(contract?.[field])) {
      if (hasValue(subject[field]) && String(subject[field]) !== String(contract[field])) {
        overrides.push({
          field,
          personnel_value: subject[field],
          contract_value: contract[field],
          reason: 'contract_classification_overrides_personnel_default'
        });
      }
      subject[field] = contract[field];
      fieldSources[field] = 'contract';
    } else if (hasValue(subject[field])) {
      fieldSources[field] = 'personnel';
    }
  }

  return {
    subject,
    classification_scope: {
      contract_scope_used: !!contract?.id || CONTRACT_CLASSIFICATION_FIELDS.some(field => hasValue(contract?.[field])),
      field_sources: fieldSources,
      contract_overrides_personnel_defaults: overrides
    }
  };
}

function inferFunctionGroup(p, wc) {
  const explicit = p.cao_function_group && p.cao_function_group !== 'unknown' ? p.cao_function_group : null;
  if (explicit) return { group: explicit, source: 'explicit', matched_alias: null };

  const text = normalizeText([
    wc.function_type,
    p.function_type,
    wc.service_function_type,
    wc.job_title_raw,
    p.job_title_raw,
    wc.job_title,
    p.job_title
  ].filter(Boolean).join(' '));

  if (!text) return { group: null, source: null, matched_alias: null };
  if (NON_SECURITY_FUNCTION_TYPES.includes(text)) return { group: null, source: 'non_security_hint', matched_alias: text };

  for (const entry of FUNCTION_TYPE_ALIASES) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (text === normalizedAlias || text.includes(normalizedAlias)) {
        return { group: entry.group, source: 'inferred', matched_alias: alias };
      }
    }
  }

  return { group: null, source: null, matched_alias: null };
}

async function lazySyncCao(base44, force = false, caoKey = CAO_PB_KEY) {
  if (caoKey !== CAO_PB_KEY) {
    return {
      changed: false,
      reason: 'skipped_unsupported_cao_sync',
      cao_key: caoKey,
      note: 'Lazy Cloudflare sync is alleen ingericht voor CAO Particuliere Beveiliging.'
    };
  }
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force, trigger_source: 'lazy_function_classification', sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch { return { cloudflare_unavailable: true }; }
}

/**
 * Haal actieve CAO-configuratie op voor een referentiedatum.
 */
async function getActiveCaoConfig(base44, referenceDate, caoKey = CAO_PB_KEY) {
  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
    status: 'active',
    cao_key: caoKey
  });
  const eligible = allCaos.filter(c => {
    if (c.valid_from && new Date(c.valid_from) > refDate) return false;
    if (c.valid_until && new Date(c.valid_until) < refDate) return false;
    return true;
  });
  eligible.sort((a, b) => {
    const da = a.valid_from ? new Date(a.valid_from) : new Date(0);
    const db = b.valid_from ? new Date(b.valid_from) : new Date(0);
    return db - da;
  });
  return eligible[0] || null;
}

/**
 * Haal uurloon op uit wage_scales_detailed of legacy wage_scales.
 * Geen fallback. Retourneert null als niet gevonden.
 */
function getHourlyRate(scale, period, caoConfig) {
  const sk = String(scale);
  const pk = String(period);
  if (caoConfig?.wage_scales_detailed?.[sk]) {
    const entry = caoConfig.wage_scales_detailed[sk][pk];
    if (entry?.hourly_rate) return { hourly_rate: entry.hourly_rate, found: true };
  }
  if (caoConfig?.wage_scales?.[sk]) {
    const rate = caoConfig.wage_scales[sk][pk];
    if (rate != null) return { hourly_rate: rate, found: true };
  }
  return { hourly_rate: null, found: false };
}

/**
 * Controleer of een periodiek bestaat/geldig is voor een schaal in de loontabel.
 * Retourneert null als loontabel ontbreekt (geen uitspraak mogelijk).
 */
function isPeriodValidForScale(scale, period, caoConfig) {
  if (!caoConfig) return null;
  const sk = String(scale);
  const pk = String(period);
  if (caoConfig.wage_scales_detailed?.[sk]) {
    return !!(caoConfig.wage_scales_detailed[sk][pk]?.hourly_rate);
  }
  if (caoConfig.wage_scales?.[sk]) {
    return caoConfig.wage_scales[sk][pk] != null;
  }
  return null; // loontabel onbekend
}

/**
 * Kern classificatie-engine.
 */
function classify(personnel, workContext, caoScope, caoConfig, referenceDate) {
  const p = personnel || {};
  const wc = workContext || {};
  const warnings = [];
  const manual_review_reasons = [];
  const workflow_review_items = [];
  const source_rule_ids = [];

  const scopeProfile = caoScope?.cao_scope_profile || 'unknown_manual_review';
  const applyAppendix2 = caoScope?.payroll_rule_profile?.apply_appendix_2_function_scales === true;

  // ── Bijlage 2 niet van toepassing ──
  if (!applyAppendix2) {
    // Non-security: bijlage 2 uitgesloten conform art. 3 lid 2
    pushUnique(source_rule_ids, 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0233');

    const customHourlyRate = Number(p.custom_hourly_rate || 0);
    const hasWageBasis = customHourlyRate > 0;

    if (!hasWageBasis) {
      manual_review_reasons.push('Loonbasis ontbreekt voor niet-beveiligingspersoneel: custom_hourly_rate ontbreekt. Bijlage 2 loonschaal is niet van toepassing.');
      warnings.push('Loonbasis ontbreekt voor niet-beveiligingspersoneel. CAO-schaal/periodiek wordt niet gebruikt omdat bijlage 2 is uitgesloten.');
    }
    if (p.cao_scale != null || p.cao_period != null) {
      warnings.push('CAO-schaal/periodiek genegeerd: bijlage 2 is niet van toepassing op dit toepassingsprofiel.');
    }

    let hourlyRate = null;
    let wageRateFound = hasWageBasis;
    if (hasWageBasis) {
      hourlyRate = customHourlyRate;
    }

    return {
      cao_scope_profile: scopeProfile,
      appendix_2_applies: false,
      classification_status: 'not_applicable',
      cao_function_group: p.cao_function_group || 'non_security_staff',
      cao_function_level: null,
      suggested_cao_scale: null,
      suggested_cao_period: null,
      current_cao_scale: p.cao_scale || null,
      current_cao_period: p.cao_period != null ? p.cao_period : null,
      scale_valid_for_classification: null,
      period_valid_for_scale: null,
      wage_rate_found: wageRateFound,
      hourly_rate: hourlyRate,
      monthly_or_period_salary: null,
      confidence: 'high',
      manual_review_required: !hasWageBasis,
      manual_review_reasons,
      payroll_final_allowed: hasWageBasis && !caoScope?.manual_review_required,
      workflow_review_items,
      documentation_review_required: false,
      warnings,
      source_rule_ids
    };
  }

  // ── Bijlage 2 van toepassing (full-security) ──
  pushUnique(
    source_rule_ids,
    'CAO-PB-2024-R0714', 'CAO-PB-2024-R0715', 'CAO-PB-2024-R0716',
    'CAO-PB-2024-R0728', 'CAO-PB-2024-R0738', 'CAO-PB-2024-R1751'
  );

  // Bepaal functiegroep: expliciete velden eerst (R0728), dan inferentie via function_type (R0729)
  const inferredGroup = inferFunctionGroup(p, wc);
  let functionGroup = inferredGroup.group;
  let groupFromInference = inferredGroup.source === 'inferred';
  let groupFromDefault = false;

  if (functionGroup && groupFromInference) {
    // 50%-criterium: alleen als security_work_percentage >= 50 of expliciet true (R0729)
    const swPct = numberOrNull(wc.security_work_percentage !== undefined ? wc.security_work_percentage : p.security_work_percentage);
    if (swPct == null || swPct >= 50 || p.performs_security_work === true || wc.performs_security_work === true) {
      pushUnique(source_rule_ids, 'CAO-PB-2024-R0729');
      warnings.push(`Functiegroep "${functionGroup}" afgeleid op basis van "${inferredGroup.matched_alias}" (50%-criterium R0729). Controleer dit in de functie-inrichting.`);
    } else {
      functionGroup = null;
      groupFromInference = false;
      manual_review_reasons.push(`Functie lijkt beveiligingswerk, maar security_work_percentage=${swPct}%. Het 50%-criterium voor indeling vereist handmatige review.`);
      warnings.push(`50%-criterium: security_work_percentage=${swPct}% is te laag voor automatische bijlage-2 functiegroep.`);
    }
  }

  if (!functionGroup && inferredGroup.source !== 'non_security_hint') {
    const hasSecuritySignal =
      p.security_role_status === 'aspirant_beveiliger' ||
      p.security_role_status === 'beveiliger' ||
      p.security_role_status === 'leidinggevende' ||
      p.performs_security_work === true ||
      wc.performs_security_work === true;

    if (hasSecuritySignal) {
      functionGroup = 'objectbeveiliger_receptionist';
      groupFromDefault = true;
      pushUnique(source_rule_ids, 'CAO-PB-2024-R0733');
      warnings.push('Geen specifieke bijlage-2 functiegroep gevonden; conform art. 34 wordt objectbeveiliger/receptionist als uitgangspunt gebruikt zolang geen andere groep bewezen is.');
    }
  }

  const writtenClassificationConfirmed = booleanOrNull(
    wc.written_classification_notice_confirmed ??
    wc.written_function_classification_notice_confirmed ??
    p.written_classification_notice_confirmed ??
    p.written_function_classification_notice_confirmed
  );
  if (writtenClassificationConfirmed !== true) {
    pushUnique(source_rule_ids, 'CAO-PB-2024-R0731');
    addWorkflowReview(
      workflow_review_items,
      'CAO-PB-2024-R0731',
      'function_classification_notice',
      'Leg vast dat de werknemer schriftelijk is geinformeerd over functie en functiegroep.',
      'written_classification_notice_confirmed'
    );
  }

  const writtenScalePeriodConfirmed = booleanOrNull(
    wc.written_scale_period_notice_confirmed ??
    wc.wage_scale_period_notice_confirmed ??
    p.written_scale_period_notice_confirmed ??
    p.wage_scale_period_notice_confirmed
  );
  if (writtenScalePeriodConfirmed !== true) {
    pushUnique(source_rule_ids, 'CAO-PB-2024-R0743');
    addWorkflowReview(
      workflow_review_items,
      'CAO-PB-2024-R0743',
      'wage_scale_period_notice',
      'Leg vast dat schaal en periodiek schriftelijk aan de werknemer zijn meegedeeld.',
      'written_scale_period_notice_confirmed'
    );
  }

  // Bepaal niveau: expliciete velden eerst, dan via security_role_status (R0728)
  const rawFunctionLevel = p.cao_function_level && p.cao_function_level !== 'unknown' ? p.cao_function_level : null;
  let functionLevel = rawFunctionLevel === 'leidinggevend' ? null : rawFunctionLevel;
  let levelFromInference = false;

  if (rawFunctionLevel === 'leidinggevend') {
    pushUnique(source_rule_ids, 'CAO-PB-2024-R1813');
    manual_review_reasons.push('Functieniveau "leidinggevend" is geen exacte bijlage-2 schaal. Kies expliciet niveau C, D of E.');
    warnings.push('Leidinggevende status vereist expliciete functie-indeling C/D/E voordat een salarisschaal kan worden bepaald.');
  }

  if (!functionLevel && p.security_role_status) {
    const inferred = ROLE_STATUS_TO_LEVEL[p.security_role_status];
    if (inferred) {
      functionLevel = inferred;
      levelFromInference = true;
      pushUnique(source_rule_ids, 'CAO-PB-2024-R0728');
      warnings.push(`Functieniveau "${inferred}" afgeleid op basis van security_role_status "${p.security_role_status}". Controleer dit handmatig.`);
    } else if (p.security_role_status === 'leidinggevende') {
      pushUnique(source_rule_ids, 'CAO-PB-2024-R1813');
      manual_review_reasons.push('Security role status "leidinggevende" is onvoldoende voor automatische schaalbepaling. Kies expliciet functieniveau C, D of E.');
      warnings.push('Leidinggevende status vereist expliciete functie-indeling C/D/E.');
    }
  }

  // Tijdelijke waarneming check (R0734)
  const isActing = !!(wc.acting_function_group && wc.acting_function_group !== functionGroup);
  if (isActing) {
    warnings.push(`Waarneming/tijdelijke functie gedetecteerd (acting_function_group="${wc.acting_function_group}"). Conform art. 39 CAO PB: tijdelijke herindeling vereist handmatige review. Bronregel: CAO-PB-2024-R0734.`);
    pushUnique(source_rule_ids, 'CAO-PB-2024-R0734', 'CAO-PB-2024-R0775');
    manual_review_reasons.push(`Waarneming andere functiegroep (${wc.acting_function_group}): handmatige review vereist conform art. 39 CAO PB (R0734).`);
  }

  // ── Manual review als groep of niveau ontbreekt ──
  const groupMissing = !functionGroup;
  const levelMissing = !functionLevel;

  if (groupMissing) {
    manual_review_reasons.push('CAO-functiegroep niet bepaald. Stel cao_function_group in of geef duties/function_type op.');
    warnings.push('Functie-indeling: CAO-functiegroep ontbreekt. Bijlage 2-schaal kan niet worden bepaald. Payroll geblokkeerd.');
  }
  if (levelMissing) {
    manual_review_reasons.push('Functieniveau (cao_function_level) niet bepaald. Stel in of geef security_role_status op.');
    warnings.push('Functie-indeling: functieniveau ontbreekt. Bijlage 2-schaal kan niet worden bepaald. Payroll geblokkeerd.');
  }

  const classificationManualReview = groupMissing || levelMissing || isActing;

  if (classificationManualReview) {
    return {
      cao_scope_profile: scopeProfile,
      appendix_2_applies: true,
      classification_status: 'manual_review_required',
      cao_function_group: functionGroup || null,
      cao_function_level: functionLevel || null,
      suggested_cao_scale: null,
      suggested_cao_period: null,
      current_cao_scale: p.cao_scale || null,
      current_cao_period: p.cao_period != null ? p.cao_period : null,
      scale_valid_for_classification: false,
      period_valid_for_scale: null,
      wage_rate_found: false,
      hourly_rate: null,
      monthly_or_period_salary: null,
      confidence: 'low',
      manual_review_required: true,
      manual_review_reasons,
      payroll_final_allowed: false,
      workflow_review_items,
      documentation_review_required: workflow_review_items.length > 0,
      warnings,
      source_rule_ids
    };
  }

  // ── Zoek schaal in bijlage 2 mapping ──
  const groupMapping = APPENDIX_2_SCALE_MAP[functionGroup];
  const levelMapping = groupMapping?.[functionLevel];

  if (!levelMapping) {
    manual_review_reasons.push(`Combinatie ${functionGroup}/${functionLevel} niet gevonden in bijlage 2 mapping. Handmatige review vereist.`);
    warnings.push(`Bijlage 2: geen schaal gevonden voor "${functionGroup}" niveau "${functionLevel}". Controleer de CAO-registry.`);
    return {
      cao_scope_profile: scopeProfile,
      appendix_2_applies: true,
      classification_status: 'manual_review_required',
      cao_function_group: functionGroup,
      cao_function_level: functionLevel,
      suggested_cao_scale: null,
      suggested_cao_period: null,
      current_cao_scale: p.cao_scale || null,
      current_cao_period: p.cao_period != null ? p.cao_period : null,
      scale_valid_for_classification: false,
      period_valid_for_scale: null,
      wage_rate_found: false,
      hourly_rate: null,
      monthly_or_period_salary: null,
      confidence: 'low',
      manual_review_required: true,
      manual_review_reasons,
      payroll_final_allowed: false,
      workflow_review_items,
      documentation_review_required: workflow_review_items.length > 0,
      warnings,
      source_rule_ids: [...source_rule_ids, 'CAO-PB-2024-R1813']
    };
  }

  const suggestedScale = levelMapping.scale;
  pushUnique(
    source_rule_ids,
    'CAO-PB-2024-R0739', 'CAO-PB-2024-R0740', 'CAO-PB-2024-R0741',
    'CAO-PB-2024-R0743', 'CAO-PB-2024-R0744', 'CAO-PB-2024-R0745',
    'CAO-PB-2024-R0746', 'CAO-PB-2024-R0747',
    levelMapping.source_rule
  );

  // ── Vergelijk huidige schaal met voorgestelde schaal ──
  const currentScale = p.cao_scale != null ? p.cao_scale : null;
  const currentPeriod = p.cao_period != null ? p.cao_period : null;
  const scaleMatches = currentScale != null ? (Number(currentScale) === Number(suggestedScale)) : null;

  if (scaleMatches === false) {
    manual_review_reasons.push(
      `Huidige schaal (${currentScale}) wijkt af van bijlage 2 suggestie (${suggestedScale}) voor ${functionGroup}/${functionLevel}. ` +
      `Bronregel: ${levelMapping.source_rule}. Handmatige bevestiging vereist.`
    );
    warnings.push(`Schaalafwijking: cao_scale=${currentScale} maar bijlage 2 suggereert schaal ${suggestedScale} voor ${functionGroup}/${functionLevel}.`);
  }
  if (currentScale == null) {
    manual_review_reasons.push('Geen CAO-schaal ingesteld op medewerker. Stel cao_scale in.');
    warnings.push('CAO-schaal ontbreekt. Stel cao_scale in.');
  }

  // ── Valideer periodiek in loontabel ──
  const periodValid = currentPeriod != null && caoConfig
    ? isPeriodValidForScale(suggestedScale, currentPeriod, caoConfig)
    : null;

  if (periodValid === false) {
    manual_review_reasons.push(`Periodiek ${currentPeriod} bestaat niet in loontabel voor schaal ${suggestedScale}. Controleer cao_period.`);
    warnings.push(`Periodiek ${currentPeriod} niet gevonden in loontabel schaal ${suggestedScale}.`);
  }
  if (currentPeriod == null) {
    manual_review_reasons.push('CAO-periodiek niet ingesteld. Stel cao_period in.');
    warnings.push('CAO-periodiek (cao_period) ontbreekt.');
  }
  if (!caoConfig) {
    manual_review_reasons.push('Geen actieve CAO-configuratie gevonden voor deze cao_key en referentiedatum; loontabel kan niet worden gevalideerd.');
    warnings.push('Actieve CAO-configuratie ontbreekt. Functie-indeling is niet payroll-final.');
  }

  const periodicReviewSignals = [
    wc.periodic_increase_due_confirmed,
    wc.periodiek_verhoging_bevestigd,
    p.periodic_increase_due_confirmed,
    p.periodiek_verhoging_bevestigd
  ].map(booleanOrNull).filter(v => v !== null);
  if (periodicReviewSignals.length === 0 && currentPeriod != null) {
    addWorkflowReview(
      workflow_review_items,
      'CAO-PB-2024-R0747',
      'annual_periodic_increase',
      'Controleer jaarlijks of de werknemer recht heeft op een periodiekverhoging; de engine valideert de periodiek, maar kent deze niet stilzwijgend toe.',
      'periodic_increase_due_confirmed'
    );
  }

  // ── Haal uurloon op ──
  const wageScaleToUse = currentScale != null ? currentScale : suggestedScale;
  const wagePeriodToUse = currentPeriod != null ? currentPeriod : 0;
  let hourlyRate = null;
  let wageRateFound = false;

  if (caoConfig && wageScaleToUse != null) {
    const r = getHourlyRate(wageScaleToUse, wagePeriodToUse, caoConfig);
    if (r.found) {
      hourlyRate = r.hourly_rate;
      wageRateFound = true;
    } else {
      warnings.push(`Uurloon niet gevonden in loontabel voor schaal ${wageScaleToUse}/periodiek ${wagePeriodToUse}.`);
      manual_review_reasons.push(`Uurloon niet gevonden in loontabel voor schaal ${wageScaleToUse}/periodiek ${wagePeriodToUse}. Controleer wage_scales_detailed.`);
    }
  }

  // ── Bepaal confidence ──
  const hasInference = groupFromInference || groupFromDefault || levelFromInference;
  const allValid = scaleMatches === true && periodValid === true && wageRateFound;
  const confidence = allValid && !hasInference ? 'high' : (allValid || wageRateFound) ? 'medium' : 'low';

  // ── Payroll final allowed ──
  const hasManualReview = manual_review_reasons.length > 0 || caoScope?.manual_review_required === true;
  const payrollFinalAllowed = !hasManualReview && wageRateFound && scaleMatches !== false && periodValid !== false;

  return {
    cao_scope_profile: scopeProfile,
    appendix_2_applies: true,
    classification_status: payrollFinalAllowed ? 'resolved' : 'manual_review_required',
    cao_function_group: functionGroup,
    cao_function_level: functionLevel,
    suggested_cao_scale: suggestedScale,
    suggested_cao_period: null, // periodiek wordt bepaald door dienstjaren, niet automatisch
    current_cao_scale: currentScale,
    current_cao_period: currentPeriod,
    scale_valid_for_classification: scaleMatches !== false && currentScale != null,
    period_valid_for_scale: periodValid,
    wage_rate_found: wageRateFound,
    hourly_rate: hourlyRate,
    monthly_or_period_salary: null,
    confidence,
    manual_review_required: hasManualReview,
    manual_review_reasons,
    payroll_final_allowed: payrollFinalAllowed,
    workflow_review_items,
    documentation_review_required: workflow_review_items.length > 0,
    warnings,
    source_rule_ids
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { personnel_id, personnel: personnelInput, contract = null, work_context, reference_date, save = false, force_cao_sync = false } = body;

    // Haal medewerker op
    let personnel = personnelInput || null;
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }
    if (!personnel) return Response.json({ error: 'personnel of personnel_id is verplicht' }, { status: 400 });

    const classificationSubject = buildClassificationSubject(personnel, contract);
    const effectivePersonnel = classificationSubject.subject;

    const targetCaoKey = body.cao_key ||
      contract?.cao_key ||
      work_context?.cao_key ||
      work_context?.cao ||
      effectivePersonnel.cao ||
      CAO_PB_KEY;
    const functionClassificationRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'resolveCaoFunctionClassification');
    if (!functionClassificationRuntimeSupport.supported) {
      return Response.json({
        error: functionClassificationRuntimeSupport.message,
        personnel_id: personnel_id || null,
        cao_key: targetCaoKey,
        cao_runtime_support: functionClassificationRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        classification_status: functionClassificationRuntimeSupport.status
      }, { status: 422 });
    }

    // Lazy CAO-sync
    const syncResult = await lazySyncCao(base44, force_cao_sync, targetCaoKey);

    // Haal actieve CAO-configuratie op
    const caoConfig = await getActiveCaoConfig(base44, reference_date, targetCaoKey);

    // Haal CAO-toepassingsprofiel op (altijd als basis)
    let caoScope = null;
    try {
      const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
        personnel_id: personnel_id || undefined,
        personnel: personnel_id ? undefined : effectivePersonnel,
        contract: contract || undefined,
        work_context: work_context || {},
        cao_key: targetCaoKey
      });
      caoScope = scopeRes?.data || null;
    } catch { /* stille fallback */ }

    // Normaliseer scope: null = fail-closed
    if (!caoScope) {
      caoScope = {
        cao_scope_profile: 'unknown_manual_review',
        applies_full_security_rules: false,
        manual_review_required: true,
        payroll_rule_profile: { apply_appendix_2_function_scales: false }
      };
    }

    const result = classify(effectivePersonnel, work_context, caoScope, caoConfig, reference_date);

    // Sla alleen globale personeelsclassificatie op als er geen contractscope is gebruikt.
    if (save && personnel_id && classificationSubject.classification_scope.contract_scope_used) {
      result.warnings = [
        ...(result.warnings || []),
        'Contractspecifieke functieclassificatie is niet opgeslagen op de algemene personeelskaart.'
      ];
    } else if (save && personnel_id) {
      await base44.entities.Personnel.update(personnel_id, {
        cao_function_classification_status: result.classification_status,
        cao_function_manual_review_reasons: result.manual_review_reasons || [],
        cao_scale_validation_status: result.scale_valid_for_classification === false
          ? 'invalid'
          : result.classification_status === 'not_applicable'
          ? 'not_applicable'
          : result.manual_review_required
          ? 'manual_review_required'
          : 'valid',
        cao_wage_rate_resolved_at: result.wage_rate_found ? new Date().toISOString() : null,
        payroll_final_allowed: result.payroll_final_allowed || false,
        cao_function_classification: {
          ...result,
          resolved_at: new Date().toISOString(),
          cao_config_id: caoConfig?.id || null,
          cao_config_version: caoConfig?.version_label || null,
          cao_key: targetCaoKey
        }
      });
    }

    return Response.json({
      success: true,
      cao_key: targetCaoKey,
      cao_runtime_support: functionClassificationRuntimeSupport,
      cao_sync_status: {
        changed: syncResult?.changed ?? false,
        reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
        revision: syncResult?.revision || null
      },
      classification_scope: classificationSubject.classification_scope,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

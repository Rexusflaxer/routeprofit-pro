import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * resolveCaoApplicability
 * Bepaalt per medewerker welke CAO PB-regels van toepassing zijn.
 * Juridisch conservatief: bij twijfel altijd manual_review_required=true.
 * Bronregels: CAO-PB-2024-R0227 t/m R0233 (artikel 3 lid 2 uitzonderingen)
 */

const SECURITY_FUNCTION_GROUPS = [
  'objectbeveiliger_receptionist', 'mobiel_surveillant', 'winkelsurveillant',
  'brandwacht', 'geld_waardetransporteur', 'centralist'
];
const SECURITY_FUNCTION_TYPES = ['surveillant', 'centralist', 'verkeersregelaar', 'brandwacht', 'rechercheur'];
const SECURITY_ROLE_STATUSES = ['aspirant_beveiliger', 'beveiliger', 'leidinggevende'];
const NON_SECURITY_FUNCTION_TYPES = ['binnendienst', 'planner', 'installateur', 'host', 'other'];
const CONTRACT_SCOPE_FIELDS = [
  'performs_security_work',
  'security_work_percentage',
  'security_role_status',
  'cao_function_group',
  'cao_function_level',
  'function_type',
  'works_airport_schiphol',
  'works_cash_value_logistics',
  'works_event_or_hospitality_security',
  'event_hospitality_cao_applies'
];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function pickScopedValue(field, personnel, contract, workContext) {
  const candidates = [
    { source: 'contract', value: contract?.[field] },
    { source: 'work_context', value: workContext?.[field] },
    { source: 'personnel', value: personnel?.[field] }
  ];
  for (const candidate of candidates) {
    if (hasValue(candidate.value)) return candidate;
  }
  return { source: null, value: undefined };
}

function buildRuleSubject(personnel, contract, workContext) {
  const subject = { ...(personnel || {}) };
  const fieldSources = {};
  const overrides = [];
  const crossSourceWarnings = [];

  for (const field of CONTRACT_SCOPE_FIELDS) {
    const picked = pickScopedValue(field, personnel, contract, workContext);
    if (hasValue(picked.value)) {
      subject[field] = picked.value;
      fieldSources[field] = picked.source;
    }

    const personnelValue = personnel?.[field];
    const contractValue = contract?.[field];
    const workValue = workContext?.[field];
    if (hasValue(contractValue) && hasValue(personnelValue) && String(contractValue) !== String(personnelValue)) {
      overrides.push({
        field,
        chosen_source: picked.source,
        contract_value: contractValue,
        personnel_value: personnelValue,
        reason: 'contract_scope_overrides_personnel_default'
      });
    }
    if (hasValue(workValue) && hasValue(contractValue) && String(workValue) !== String(contractValue)) {
      crossSourceWarnings.push({
        field,
        chosen_source: picked.source,
        work_context_value: workValue,
        contract_value: contractValue,
        reason: 'work_context_differs_from_contract_scope'
      });
    }
  }

  return {
    subject,
    field_sources: fieldSources,
    overrides,
    cross_source_warnings: crossSourceWarnings,
    contract_scope_used: !!contract?.id || CONTRACT_SCOPE_FIELDS.some(field => hasValue(contract?.[field])),
    work_context_scope_used: CONTRACT_SCOPE_FIELDS.some(field => hasValue(workContext?.[field]))
  };
}

/**
 * Detecteer conflicten tussen velden.
 * Retourneert een array van conflictbeschrijvingen.
 */
function detectConflicts(p, wc) {
  const conflicts = [];
  const psw = wc.performs_security_work !== undefined ? wc.performs_security_work : p.performs_security_work;
  const role = p.security_role_status;
  const group = p.cao_function_group;
  const ftype = p.function_type;
  const pct = wc.security_work_percentage !== undefined ? wc.security_work_percentage : p.security_work_percentage;

  // performs_security_work=false maar aspirant/beveiliger role
  if (psw === false && SECURITY_ROLE_STATUSES.includes(role)) {
    conflicts.push(`performs_security_work=false maar security_role_status=${role}. Tegenstrijdig: beveiligingsstatus impliceert beveiligingswerk.`);
  }
  // performs_security_work=false maar security functiegroep
  if (psw === false && group && SECURITY_FUNCTION_GROUPS.includes(group)) {
    conflicts.push(`performs_security_work=false maar cao_function_group=${group}. Functiegroep bijlage 2 impliceert beveiligingswerk.`);
  }
  // binnendienst/planner function_type maar security_work_percentage >= 50
  if (NON_SECURITY_FUNCTION_TYPES.includes(ftype) && typeof pct === 'number' && pct >= 50) {
    conflicts.push(`function_type=${ftype} (niet-beveiliging) maar security_work_percentage=${pct}%. Percentage impliceert beveiligingswerk.`);
  }
  // non_security_staff maar security role status
  if (group === 'non_security_staff' && SECURITY_ROLE_STATUSES.includes(role)) {
    conflicts.push(`cao_function_group=non_security_staff maar security_role_status=${role}. Niet-beveiligingspersoneel heeft geen beveiligingsstatus.`);
  }
  // performs_security_work=true maar non_security_staff group
  if (psw === true && group === 'non_security_staff') {
    conflicts.push(`performs_security_work=true maar cao_function_group=non_security_staff. Tegenstrijdig.`);
  }
  return conflicts;
}

/**
 * Bepaalt of medewerker beveiligingswerk doet.
 * Retourneert: true (security), false (non-security), 'mixed' (onzeker percentage), null (onvoldoende data)
 *
 * Beslisvolgorde (juridisch conservatief):
 * 1. Expliciete performs_security_work override
 * 2. security_work_percentage === 0 → non-security
 * 3. cao_function_group === non_security_staff → non-security
 * 4. function_type in non-security EN geen security-signalen → non-security
 * 5. security_work_percentage >= 50 + security signaal → true
 * 6. security_work_percentage > 0 && < 50 → 'mixed' (manual review)
 * 7. security role/functiegroep → true
 * 8. null (onvoldoende data)
 */
function determinePerformsSecurityWork(p, wc) {
  const psw = wc.performs_security_work !== undefined ? wc.performs_security_work : p.performs_security_work;
  const pct = wc.security_work_percentage !== undefined ? wc.security_work_percentage : p.security_work_percentage;
  const role = p.security_role_status;
  const group = p.cao_function_group;
  const ftype = p.function_type;

  // 1. Expliciete override
  if (psw === true) return true;
  if (psw === false) return false;

  // 2. Percentage 0 → non-security
  if (typeof pct === 'number' && pct === 0) return false;

  // 3. cao_function_group = non_security_staff → non-security
  if (group === 'non_security_staff') return false;

  // 4. Non-security function_type zonder security-signalen
  if (NON_SECURITY_FUNCTION_TYPES.includes(ftype)) {
    const hasSecuritySignal = SECURITY_ROLE_STATUSES.includes(role) ||
      (group && SECURITY_FUNCTION_GROUPS.includes(group)) ||
      (typeof pct === 'number' && pct > 0);
    if (!hasSecuritySignal) return false;
    // function_type is non-security maar er zijn security-signalen → mixed
    return 'mixed';
  }

  // 5. Percentage >= 50 met security signaal → true
  if (typeof pct === 'number' && pct >= 50) {
    if (SECURITY_FUNCTION_TYPES.includes(ftype) || (group && SECURITY_FUNCTION_GROUPS.includes(group)) || SECURITY_ROLE_STATUSES.includes(role)) {
      return true;
    }
  }

  // 6. Percentage > 0 && < 50 → mixed (manual review vereist)
  if (typeof pct === 'number' && pct > 0 && pct < 50) {
    return 'mixed';
  }

  // 7. Security role/functiegroep/functietype → true
  if (SECURITY_ROLE_STATUSES.includes(role)) return true;
  if (role === 'not_applicable') return false;
  if (group && SECURITY_FUNCTION_GROUPS.includes(group)) return true;
  if (SECURITY_FUNCTION_TYPES.includes(ftype)) return true;

  // 8. Onvoldoende data
  return null;
}

function buildFunctionClassification(p, manualReview, sourceRuleIds, isNonSecurity) {
  const group = isNonSecurity ? 'non_security_staff' : (p.cao_function_group || 'unknown');
  const level = p.cao_function_level || 'unknown';

  // Bijlage 2 schaal-suggestie alleen voor echte beveiligingsfuncties.
  // CAO-PB-2024-R1813: alle zes functiegroepen volgen dezelfde schaalrij 2 t/m 7.
  const scaleMap = {
    'objectbeveiliger_receptionist_aspirant': 2, 'objectbeveiliger_receptionist_a': 3, 'objectbeveiliger_receptionist_b': 4, 'objectbeveiliger_receptionist_c': 5, 'objectbeveiliger_receptionist_d': 6, 'objectbeveiliger_receptionist_e': 7,
    'mobiel_surveillant_aspirant': 2, 'mobiel_surveillant_a': 3, 'mobiel_surveillant_b': 4, 'mobiel_surveillant_c': 5, 'mobiel_surveillant_d': 6, 'mobiel_surveillant_e': 7,
    'winkelsurveillant_aspirant': 2, 'winkelsurveillant_a': 3, 'winkelsurveillant_b': 4, 'winkelsurveillant_c': 5, 'winkelsurveillant_d': 6, 'winkelsurveillant_e': 7,
    'brandwacht_aspirant': 2, 'brandwacht_a': 3, 'brandwacht_b': 4, 'brandwacht_c': 5, 'brandwacht_d': 6, 'brandwacht_e': 7,
    'geld_waardetransporteur_aspirant': 2, 'geld_waardetransporteur_a': 3, 'geld_waardetransporteur_b': 4, 'geld_waardetransporteur_c': 5, 'geld_waardetransporteur_d': 6, 'geld_waardetransporteur_e': 7,
    'centralist_aspirant': 2, 'centralist_a': 3, 'centralist_b': 4, 'centralist_c': 5, 'centralist_d': 6, 'centralist_e': 7
  };

  const mapKey = `${group}_${level}`;
  const suggestedScale = (!isNonSecurity && !manualReview) ? (scaleMap[mapKey] || null) : null;

  return {
    cao_function_group: group,
    cao_function_level: level,
    suggested_cao_scale: suggestedScale,
    confidence: manualReview ? 'low' : (suggestedScale ? 'medium' : 'low'),
    manual_review_required: manualReview || !suggestedScale,
    source_rule_ids: [...sourceRuleIds, 'CAO-PB-2024-R1813']
  };
}

function buildPayrollProfile(mode) {
  // mode: 'full' | 'non_security' | 'unknown'
  if (mode === 'full') {
    return {
      apply_chapter_4: true,
      apply_article_37_wage_increase: true,
      apply_article_38_year_end_bonus: true,
      apply_article_40_special_hours: true,
      apply_article_41_holidays: true,
      apply_article_42_overtime: true,
      apply_article_43_shift_change: true,
      apply_chapter_5_reimbursements: true,
      apply_appendix_2_function_scales: true
    };
  }
  if (mode === 'non_security') {
    // Artikel 3 lid 2: hoofdstuk 4 (behalve 37/38/41), hoofdstuk 5, bijlage 2 uitgesloten
    return {
      apply_chapter_4: false,
      apply_article_37_wage_increase: true,
      apply_article_38_year_end_bonus: true,
      apply_article_40_special_hours: false,
      apply_article_41_holidays: true,
      apply_article_42_overtime: false,
      apply_article_43_shift_change: false,
      apply_chapter_5_reimbursements: false,
      apply_appendix_2_function_scales: false
    };
  }
  // unknown / mixed: conservatief — geen security-toeslagen, manual review
  return {
    apply_chapter_4: false,
    apply_article_37_wage_increase: true,
    apply_article_38_year_end_bonus: true,
    apply_article_40_special_hours: false,
    apply_article_41_holidays: true,
    apply_article_42_overtime: false,
    apply_article_43_shift_change: false,
    apply_chapter_5_reimbursements: false,
    apply_appendix_2_function_scales: false
  };
}

function resolveApplicability(personnel, contract, work_context) {
  const warnings = [];
  const source_rule_ids = [];
  const scopeSubject = buildRuleSubject(personnel || {}, contract || {}, work_context || {});
  const p = scopeSubject.subject;
  const wc = work_context || {};
  const scope_resolution = {
    contract_scope_used: scopeSubject.contract_scope_used,
    work_context_scope_used: scopeSubject.work_context_scope_used,
    field_sources: scopeSubject.field_sources,
    contract_overrides_personnel_defaults: scopeSubject.overrides,
    work_context_contract_differences: scopeSubject.cross_source_warnings
  };

  if (scopeSubject.overrides.length > 0) {
    warnings.push('Contractspecifieke CAO-scopevelden overschrijven medewerkerstamdata voor deze beoordeling.');
  }
  if (scopeSubject.cross_source_warnings.length > 0) {
    warnings.push('Dienstcontext wijkt af van contractscope; controleer contract-/dienstkoppeling als dit niet bewust is.');
  }

  // ── Evenementen-/horecabeveiliging exclusie ──
  if (p.works_event_or_hospitality_security === true && p.event_hospitality_cao_applies === true) {
    source_rule_ids.push('CAO-PB-2024-R0227');
    return {
      cao_scope_profile: 'excluded_event_hospitality_security',
      applies_cao_pb: false,
      applies_full_security_rules: false,
      excluded_rule_ids: ['CAO-PB-2024-R0227'],
      excluded_articles: [],
      excluded_chapters: [],
      excluded_rule_ids_reason: { 'CAO-PB-2024-R0227': 'Evenementen-/horecabeveiliging valt onder eigen CAO (art. 3 lid 1 CAO PB).' },
      applicable_exceptions: ['article_3_event_hospitality_exclusion'],
      function_classification: buildFunctionClassification(p, true, ['CAO-PB-2024-R0227'], false),
      payroll_rule_profile: buildPayrollProfile('unknown'),
      manual_review_required: true,
      confidence: 'high',
      warnings: [...warnings, 'CAO PB is niet van toepassing: evenementen-/horecabeveiliging valt onder eigen CAO (art. 3 lid 2 / R0227).'],
      scope_resolution,
      source_rule_ids
    };
  }

  // ── Conflictdetectie (altijd eerst) ──
  const conflicts = detectConflicts(p, {});
  const hasConflicts = conflicts.length > 0;

  if (hasConflicts) {
    warnings.push(...conflicts.map(c => `Conflicterende gegevens: ${c}`));
  }

  // ── Bepaal of medewerker beveiligingswerk doet ──
  const securityWorkResult = determinePerformsSecurityWork(p, {});

  // ── Schiphol / geld- en waardelogistiek scope ──
  const isSchiphol = wc.works_airport_schiphol === true || p.works_airport_schiphol === true;
  const isCashValueLogistics = wc.works_cash_value_logistics === true || p.works_cash_value_logistics === true;

  // ── Onvoldoende data ──
  if (securityWorkResult === null) {
    source_rule_ids.push('CAO-PB-2024-R0228');
    warnings.push('Onvoldoende gegevens om CAO-toepassingsprofiel te bepalen. Stel performs_security_work, security_work_percentage of function_type in.');
    return {
      cao_scope_profile: 'unknown_manual_review',
      applies_cao_pb: true,
      applies_full_security_rules: false,
      excluded_rule_ids: [],
      excluded_articles: [],
      excluded_chapters: [],
      excluded_rule_ids_reason: {},
      applicable_exceptions: [],
      function_classification: buildFunctionClassification(p, true, ['CAO-PB-2024-R0228'], false),
      payroll_rule_profile: buildPayrollProfile('unknown'),
      manual_review_required: true,
      confidence: 'low',
      scope_resolution,
      warnings,
      source_rule_ids
    };
  }

  // ── Mixed: onzeker percentage of conflicterende signalen ──
  if (securityWorkResult === 'mixed' || hasConflicts) {
    source_rule_ids.push('CAO-PB-2024-R0228');
    warnings.push('Gemengde signalen voor beveiligingswerk: handmatige review vereist voordat toeslagen/vergoedingen worden berekend.');
    return {
      cao_scope_profile: 'mixed_security_work_manual_review',
      applies_cao_pb: true,
      applies_full_security_rules: false,
      excluded_rule_ids: [],
      excluded_articles: [],
      excluded_chapters: [],
      excluded_rule_ids_reason: {},
      applicable_exceptions: [],
      function_classification: buildFunctionClassification(p, true, source_rule_ids, false),
      payroll_rule_profile: buildPayrollProfile('unknown'),
      manual_review_required: true,
      confidence: 'low',
      scope_resolution,
      conflict_details: conflicts,
      warnings,
      source_rule_ids
    };
  }

  // ── Non-security: artikel 3 lid 2 ──
  if (securityWorkResult === false) {
    source_rule_ids.push('CAO-PB-2024-R0228', 'CAO-PB-2024-R0229', 'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232', 'CAO-PB-2024-R0233');
    warnings.push('Artikel 3 lid 2 CAO PB van toepassing: medewerker doet normaal geen beveiligingswerk. Hoofdstuk 4 (behalve art. 37/38/41), hoofdstuk 5 en bijlage 2 zijn niet van toepassing. Basisloon, vakantiegeld, eindejaarsuitkering en feestdagtoeslag blijven gelden.');
    const excludedRuleIds = ['CAO-PB-2024-R0229', 'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232', 'CAO-PB-2024-R0233'];
    // Non-security functie-indeling: bijlage 2 expliciet uitgesloten → manual_review=false voor classificatie
    const nonSecurityClassification = buildFunctionClassification(p, false, source_rule_ids, true);
    // Overschrijf: bijlage 2 is uitgesloten, dus functie-indeling manual review is niet van toepassing
    nonSecurityClassification.manual_review_required = false;

    return {
      cao_scope_profile: 'non_security_work_article_3_exception',
      applies_cao_pb: true,
      applies_full_security_rules: false,
      excluded_rule_ids: excludedRuleIds,
      excluded_articles: ['article_10_fulltime_definition', 'article_9_lid1_c', 'article_40_special_hours', 'article_42_overtime', 'article_43_shift_change'],
      excluded_chapters: ['chapter_4_except_37_38_41', 'chapter_5', 'appendix_2'],
      excluded_rule_ids_reason: {
        'CAO-PB-2024-R0229': 'Art. 3 lid 2: art. 10 definitie fulltimer niet van toepassing.',
        'CAO-PB-2024-R0230': 'Art. 3 lid 2: art. 9 lid 1 sub c niet van toepassing.',
        'CAO-PB-2024-R0231': 'Art. 3 lid 2: hoofdstuk 4 (behalve art. 37/38/41) niet van toepassing.',
        'CAO-PB-2024-R0232': 'Art. 3 lid 2: hoofdstuk 5 vergoedingen niet van toepassing.',
        'CAO-PB-2024-R0233': 'Art. 3 lid 2: bijlage 2 functiegebouw/loontabel niet van toepassing.'
      },
      applicable_exceptions: ['article_3_lid2_non_security_work'],
      function_classification: nonSecurityClassification,
      payroll_rule_profile: buildPayrollProfile('non_security'),
      scope_manual_review_required: false,
      function_classification_manual_review_required: false,
      special_scope_manual_review_required: false,
      manual_review_required: false,
      confidence: 'high',
      scope_resolution,
      warnings,
      source_rule_ids
    };
  }

  // ── Full security ──
  let scopeProfile = 'full_security_worker';
  if (isSchiphol) scopeProfile = 'airport_schiphol';
  else if (isCashValueLogistics) scopeProfile = 'cash_value_logistics';
  source_rule_ids.push('CAO-PB-2024-R0728');

  const functionClassification = buildFunctionClassification(p, false, source_rule_ids, false);

  // Punt 5: onderscheid scope_manual_review vs function_classification_manual_review
  // Bijlage 2 loontabel is van toepassing bij full-security; als functiegroep/niveau onbekend → manual review
  const payrollProfile = buildPayrollProfile('full');
  const functionReviewRequired = functionClassification.manual_review_required &&
    payrollProfile.apply_appendix_2_function_scales === true;

  if (functionReviewRequired) {
    warnings.push('Functie-indeling/bijlage-2 schaal kon niet automatisch worden bepaald. Handmatige review vereist voor correcte loonschaal.');
  }

  // Punt 6: bijzondere scopes Schiphol / geld-waardelogistiek → special_scope_manual_review
  const specialScopeManualReview = isSchiphol || isCashValueLogistics;
  if (isSchiphol) {
    warnings.push('Schiphol bijzondere regels (bijlage 8 CAO PB) zijn nog niet volledig geïmplementeerd in de runtime. Handmatige review vereist voor Schiphol-specifieke toeslagen/afspraken.');
  }
  if (isCashValueLogistics) {
    warnings.push('Geld- en waardelogistiek bijzondere regels (bijlage 9 CAO PB) zijn nog niet volledig geïmplementeerd in de runtime. Handmatige review vereist.');
  }

  return {
    cao_scope_profile: scopeProfile,
    applies_cao_pb: true,
    applies_full_security_rules: true,
    excluded_rule_ids: [],
    excluded_articles: [],
    excluded_chapters: [],
    excluded_rule_ids_reason: {},
    applicable_exceptions: isSchiphol ? ['schiphol_special_rules'] : isCashValueLogistics ? ['cash_value_logistics_rules'] : [],
    function_classification: functionClassification,
    payroll_rule_profile: payrollProfile,
    scope_manual_review_required: false,
    function_classification_manual_review_required: functionReviewRequired,
    special_scope_manual_review_required: specialScopeManualReview,
    manual_review_required: functionReviewRequired || specialScopeManualReview,
    confidence: functionReviewRequired ? 'medium' : 'high',
    scope_resolution,
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
    const { personnel_id, personnel: personnelInput, contract, work_context, save = false } = body;

    let personnel = personnelInput || null;

    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }

    if (!personnel) return Response.json({ error: 'personnel of personnel_id is verplicht' }, { status: 400 });

    const result = resolveApplicability(personnel, contract, work_context);

    if (save && personnel_id) {
      await base44.entities.Personnel.update(personnel_id, {
        cao_scope_profile: result.cao_scope_profile,
        cao_applicability_manual_review_required: result.manual_review_required,
        cao_applicability_resolved_at: new Date().toISOString(),
        cao_excluded_rule_ids: result.excluded_rule_ids,
        cao_applicable_rule_profile: result.payroll_rule_profile,
        cao_applicability_source_rule_ids: result.source_rule_ids,
        cao_applicability_warnings: result.warnings,
        cao_excluded_articles: result.excluded_articles,
        cao_excluded_chapters: result.excluded_chapters,
        cao_function_classification: result.function_classification
      });
    }

    return Response.json({ success: true, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

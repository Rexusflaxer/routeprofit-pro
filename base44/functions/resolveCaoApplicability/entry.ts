import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * resolveCaoApplicability
 * Bepaalt per medewerker/werkcontext welke CAO PB-regels van toepassing zijn.
 * Bronregels: CAO-PB-2024-R0227 t/m R0233 (artikel 3 lid 2 uitzonderingen)
 */

// Functiegroepen conform bijlage 2 die als beveiligingswerk gelden
const SECURITY_FUNCTION_GROUPS = [
  'objectbeveiliger_receptionist',
  'mobiel_surveillant',
  'winkelsurveillant',
  'brandwacht',
  'geld_waardetransporteur',
  'centralist'
];

const SECURITY_FUNCTION_TYPES = ['surveillant', 'centralist', 'verkeersregelaar', 'brandwacht', 'rechercheur'];
const SECURITY_ROLE_STATUSES = ['aspirant_beveiliger', 'beveiliger', 'leidinggevende'];

function resolveApplicability(personnel, contract, work_context) {
  const warnings = [];
  const source_rule_ids = [];

  const p = personnel || {};
  const wc = work_context || {};

  // ── Evenementen-/horecabeveiliging exclusie ──
  if (wc.works_event_or_hospitality_security === true && wc.event_hospitality_cao_applies === true) {
    source_rule_ids.push('CAO-PB-2024-R0227');
    return {
      cao_scope_profile: 'excluded_event_hospitality_security',
      applies_cao_pb: false,
      applies_full_security_rules: false,
      excluded_rule_ids: ['CAO-PB-2024-R0227'],
      excluded_articles: [],
      excluded_chapters: [],
      applicable_exceptions: ['article_3_event_hospitality_exclusion'],
      function_classification: {
        cao_function_group: p.cao_function_group || 'unknown',
        cao_function_level: p.cao_function_level || 'unknown',
        suggested_cao_scale: null,
        confidence: 'low',
        manual_review_required: true,
        source_rule_ids: ['CAO-PB-2024-R0227']
      },
      payroll_rule_profile: buildPayrollProfile(false, false),
      warnings: ['CAO PB is niet van toepassing: evenementen-/horecabeveiliging valt onder eigen CAO (art. 3 lid 2 / R0227).'],
      source_rule_ids
    };
  }

  // ── Bepaal of medewerker beveiligingswerk doet ──
  const performsSecurityWork = determinePerformsSecurityWork(p, wc);

  // ── Schiphol scope ──
  const isSchiphol = wc.works_airport_schiphol === true || p.works_airport_schiphol === true;

  // ── Geld- en waardelogistiek scope ──
  const isCashValueLogistics = wc.works_cash_value_logistics === true || p.works_cash_value_logistics === true;

  if (performsSecurityWork === null) {
    // Onvoldoende data
    source_rule_ids.push('CAO-PB-2024-R0228');
    warnings.push('Onvoldoende gegevens om CAO-toepassingsprofiel te bepalen. Handmatige review vereist.');
    return {
      cao_scope_profile: 'unknown_manual_review',
      applies_cao_pb: true,
      applies_full_security_rules: false,
      excluded_rule_ids: [],
      excluded_articles: [],
      excluded_chapters: [],
      applicable_exceptions: [],
      function_classification: buildFunctionClassification(p, true, ['CAO-PB-2024-R0228']),
      payroll_rule_profile: buildPayrollProfile(false, false),
      warnings,
      source_rule_ids
    };
  }

  if (performsSecurityWork === false) {
    // Artikel 3 lid 2: normaal geen beveiligingswerk
    source_rule_ids.push('CAO-PB-2024-R0228', 'CAO-PB-2024-R0229', 'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232', 'CAO-PB-2024-R0233');
    warnings.push('Artikel 3 lid 2: medewerker doet normaal geen beveiligingswerk. Hoofdstuk 4 (behalve art. 37/38/41), hoofdstuk 5 en bijlage 2 zijn niet van toepassing.');
    return {
      cao_scope_profile: 'non_security_work_article_3_exception',
      applies_cao_pb: true,
      applies_full_security_rules: false,
      excluded_rule_ids: ['CAO-PB-2024-R0229', 'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232', 'CAO-PB-2024-R0233'],
      excluded_articles: ['article_10_fulltime_definition', 'article_9_lid1_c'],
      excluded_chapters: ['chapter_4_except_articles_37_38_41', 'chapter_5', 'appendix_2'],
      applicable_exceptions: ['article_3_lid2_non_security_work'],
      function_classification: buildFunctionClassification(p, false, source_rule_ids),
      payroll_rule_profile: buildPayrollProfile(false, true),
      warnings,
      source_rule_ids
    };
  }

  // Volledig beveiligingswerk — bepaal eventuele bijzondere scope
  let scopeProfile = 'full_security_worker';
  if (isSchiphol) scopeProfile = 'airport_schiphol';
  else if (isCashValueLogistics) scopeProfile = 'cash_value_logistics';

  source_rule_ids.push('CAO-PB-2024-R0728');

  return {
    cao_scope_profile: scopeProfile,
    applies_cao_pb: true,
    applies_full_security_rules: true,
    excluded_rule_ids: [],
    excluded_articles: [],
    excluded_chapters: [],
    applicable_exceptions: isSchiphol ? ['schiphol_special_rules'] : isCashValueLogistics ? ['cash_value_logistics_rules'] : [],
    function_classification: buildFunctionClassification(p, false, source_rule_ids),
    payroll_rule_profile: buildPayrollProfile(true, true),
    warnings,
    source_rule_ids
  };
}

function determinePerformsSecurityWork(p, wc) {
  // Expliciete override in work_context
  if (wc.performs_security_work === true) return true;
  if (wc.performs_security_work === false) return false;

  // Expliciete override op personeelsniveau
  if (p.performs_security_work === true) return true;
  if (p.performs_security_work === false) return false;

  // Percentage
  const pct = wc.security_work_percentage ?? p.security_work_percentage;
  if (typeof pct === 'number') {
    if (pct >= 50) return true;
    if (pct < 50) return false;
  }

  // security_role_status
  if (SECURITY_ROLE_STATUSES.includes(p.security_role_status)) return true;
  if (p.security_role_status === 'not_applicable') return false;

  // Functiegroep
  if (p.cao_function_group && SECURITY_FUNCTION_GROUPS.includes(p.cao_function_group)) return true;
  if (p.cao_function_group === 'non_security_staff') return false;

  // function_type
  if (SECURITY_FUNCTION_TYPES.includes(p.function_type)) return true;
  if (p.function_type === 'binnendienst' || p.function_type === 'planner') return false;

  // Onvoldoende data
  return null;
}

function buildFunctionClassification(p, manualReview, sourceRuleIds) {
  const group = p.cao_function_group || 'unknown';
  const level = p.cao_function_level || 'unknown';

  // Suggereer CAO-schaal op basis van functiegroep/niveau (bijlage 2 R1751-R1814)
  const scaleMap = {
    'objectbeveiliger_receptionist_aspirant': 2,
    'objectbeveiliger_receptionist_a': 3,
    'objectbeveiliger_receptionist_b': 4,
    'objectbeveiliger_receptionist_c': 5,
    'mobiel_surveillant_a': 3,
    'mobiel_surveillant_b': 4,
    'mobiel_surveillant_c': 5,
    'winkelsurveillant_a': 3,
    'brandwacht_a': 3,
    'geld_waardetransporteur_a': 4,
    'centralist_a': 4,
    'centralist_b': 5
  };

  const mapKey = `${group}_${level}`;
  const suggestedScale = scaleMap[mapKey] || null;

  return {
    cao_function_group: group,
    cao_function_level: level,
    suggested_cao_scale: suggestedScale,
    confidence: suggestedScale ? 'medium' : 'low',
    manual_review_required: manualReview || !suggestedScale,
    source_rule_ids: [...sourceRuleIds, 'CAO-PB-2024-R1751']
  };
}

function buildPayrollProfile(fullSecurity, holidaysApply) {
  if (fullSecurity) {
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
  // non_security_work_article_3_exception
  return {
    apply_chapter_4: false,
    apply_article_37_wage_increase: true,
    apply_article_38_year_end_bonus: true,
    apply_article_40_special_hours: false,
    apply_article_41_holidays: holidaysApply,
    apply_article_42_overtime: false,
    apply_article_43_shift_change: false,
    apply_chapter_5_reimbursements: false,
    apply_appendix_2_function_scales: false
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

    // Haal medewerker op als personnel_id is opgegeven en geen inline personnel
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id);
      if (!personnel) {
        return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
      }
    }

    if (!personnel) {
      return Response.json({ error: 'personnel of personnel_id is verplicht' }, { status: 400 });
    }

    const result = resolveApplicability(personnel, contract, work_context);

    // Optioneel: sla resultaat op bij medewerker
    if (save && personnel_id) {
      await base44.entities.Personnel.update(personnel_id, {
        cao_scope_profile: result.cao_scope_profile,
        cao_applicability_manual_review_required: result.function_classification.manual_review_required,
        cao_applicability_resolved_at: new Date().toISOString(),
        cao_excluded_rule_ids: result.excluded_rule_ids,
        cao_applicable_rule_profile: result.payroll_rule_profile
      });
    }

    return Response.json({ success: true, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
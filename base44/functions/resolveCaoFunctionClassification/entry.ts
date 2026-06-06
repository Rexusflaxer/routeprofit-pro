import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * resolveCaoFunctionClassification
 * Bepaalt CAO PB functie-indeling, loonschaal en periodiek-validatie op basis van bijlage 2.
 * Bronregels: CAO-PB-2024-R0728, R0729, R0734, R1751-R1814
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

// ── Infereer functiegroep op basis van function_type (50%-criterium R0729) ──
const FUNCTION_TYPE_TO_GROUP = {
  surveillant: 'mobiel_surveillant',
  centralist: 'centralist',
  brandwacht: 'brandwacht'
  // binnendienst/planner/host/other → non_security_staff (niet bijlage 2)
};

// ── Infereer niveau op basis van security_role_status (R0728) ──
const ROLE_STATUS_TO_LEVEL = {
  aspirant_beveiliger: 'aspirant',
  beveiliger: 'a'
};

async function lazySyncCao(base44, force = false) {
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
async function getActiveCaoConfig(base44, referenceDate) {
  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({ status: 'active' });
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
  const source_rule_ids = [];

  const scopeProfile = caoScope?.cao_scope_profile || 'unknown_manual_review';
  const applyAppendix2 = caoScope?.payroll_rule_profile?.apply_appendix_2_function_scales === true;

  // ── Bijlage 2 niet van toepassing ──
  if (!applyAppendix2) {
    // Non-security: bijlage 2 uitgesloten conform art. 3 lid 2
    source_rule_ids.push('CAO-PB-2024-R0228', 'CAO-PB-2024-R0233');

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
      warnings,
      source_rule_ids
    };
  }

  // ── Bijlage 2 van toepassing (full-security) ──
  source_rule_ids.push('CAO-PB-2024-R0728', 'CAO-PB-2024-R1751');

  // Bepaal functiegroep: expliciete velden eerst (R0728), dan inferentie via function_type (R0729)
  let functionGroup = p.cao_function_group && p.cao_function_group !== 'unknown' ? p.cao_function_group : null;
  let groupFromInference = false;

  if (!functionGroup) {
    const inferred = wc.duties?.length > 0 ? null : FUNCTION_TYPE_TO_GROUP[p.function_type];
    if (inferred) {
      // 50%-criterium: alleen als security_work_percentage >= 50 of expliciet true (R0729)
      const swPct = wc.security_work_percentage !== undefined ? wc.security_work_percentage : p.security_work_percentage;
      if (swPct == null || swPct >= 50 || p.performs_security_work === true) {
        functionGroup = inferred;
        groupFromInference = true;
        source_rule_ids.push('CAO-PB-2024-R0729');
        warnings.push(`Functiegroep "${inferred}" afgeleid op basis van function_type "${p.function_type}" (50%-criterium R0729). Controleer dit handmatig.`);
      }
    }
  }

  // Bepaal niveau: expliciete velden eerst, dan via security_role_status (R0728)
  const rawFunctionLevel = p.cao_function_level && p.cao_function_level !== 'unknown' ? p.cao_function_level : null;
  let functionLevel = rawFunctionLevel === 'leidinggevend' ? null : rawFunctionLevel;
  let levelFromInference = false;

  if (rawFunctionLevel === 'leidinggevend') {
    source_rule_ids.push('CAO-PB-2024-R1813');
    manual_review_reasons.push('Functieniveau "leidinggevend" is geen exacte bijlage-2 schaal. Kies expliciet niveau C, D of E.');
    warnings.push('Leidinggevende status vereist expliciete functie-indeling C/D/E voordat een salarisschaal kan worden bepaald.');
  }

  if (!functionLevel && p.security_role_status) {
    const inferred = ROLE_STATUS_TO_LEVEL[p.security_role_status];
    if (inferred) {
      functionLevel = inferred;
      levelFromInference = true;
      source_rule_ids.push('CAO-PB-2024-R0728');
      warnings.push(`Functieniveau "${inferred}" afgeleid op basis van security_role_status "${p.security_role_status}". Controleer dit handmatig.`);
    } else if (p.security_role_status === 'leidinggevende') {
      source_rule_ids.push('CAO-PB-2024-R1813');
      manual_review_reasons.push('Security role status "leidinggevende" is onvoldoende voor automatische schaalbepaling. Kies expliciet functieniveau C, D of E.');
      warnings.push('Leidinggevende status vereist expliciete functie-indeling C/D/E.');
    }
  }

  // Tijdelijke waarneming check (R0734)
  const isActing = !!(wc.acting_function_group && wc.acting_function_group !== functionGroup);
  if (isActing) {
    warnings.push(`Waarneming/tijdelijke functie gedetecteerd (acting_function_group="${wc.acting_function_group}"). Conform art. 39 CAO PB: tijdelijke herindeling vereist handmatige review. Bronregel: CAO-PB-2024-R0734.`);
    source_rule_ids.push('CAO-PB-2024-R0734');
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
      warnings,
      source_rule_ids: [...source_rule_ids, 'CAO-PB-2024-R1813']
    };
  }

  const suggestedScale = levelMapping.scale;
  source_rule_ids.push(levelMapping.source_rule);

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
  const hasInference = groupFromInference || levelFromInference;
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
    const { personnel_id, personnel: personnelInput, work_context, reference_date, save = false, force_cao_sync = false } = body;

    // Haal medewerker op
    let personnel = personnelInput || null;
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }
    if (!personnel) return Response.json({ error: 'personnel of personnel_id is verplicht' }, { status: 400 });

    // Lazy CAO-sync
    await lazySyncCao(base44, force_cao_sync);

    // Haal actieve CAO-configuratie op
    const caoConfig = await getActiveCaoConfig(base44, reference_date);

    // Haal CAO-toepassingsprofiel op (altijd als basis)
    let caoScope = null;
    try {
      const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
        personnel_id: personnel_id || undefined,
        personnel: personnel_id ? undefined : personnel,
        work_context: work_context || {}
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

    const result = classify(personnel, work_context, caoScope, caoConfig, reference_date);

    // Sla classificatiestatus op als save=true
    if (save && personnel_id) {
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
          cao_config_version: caoConfig?.version_label || null
        }
      });
    }

    return Response.json({ success: true, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

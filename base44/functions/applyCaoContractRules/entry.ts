import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_CONTRACT_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_CONTRACT_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_CONTRACT_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : key
      ? `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Contractregels zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
      : `Runtime ${functionName} mist cao_key. Contractregels zijn geblokkeerd zodat geen PB-default wordt toegepast.`
  };
}

async function lazySyncCao(base44, forceCaoSync = false, caoKey = CAO_PB_KEY) {
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
      force: forceCaoSync,
      trigger_source: 'lazy_contract_rules',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB contractvalidatie en proeftijdberekening
 * Bronregels: CAO-PB-2024-R0315 t/m R0322
 *
 * Scope-bewust: aspirant-beveiliger-specifieke proeftijdregel (R0317)
 * wordt niet toegepast als medewerker onder artikel 3 lid 2 valt.
 */

function asIsoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function resolveContractCaoRequest({ explicitCaoKey, contract, personnel }) {
  const contractCaoKey = contract?.cao_key || null;
  const personnelCaoKey = personnel?.cao || null;
  const resolution = {
    explicit_cao_key: explicitCaoKey || null,
    contract_cao_key: contractCaoKey,
    personnel_cao_key: personnelCaoKey,
    cao_key: explicitCaoKey || contractCaoKey || null,
    status: 'resolved',
    manual_review_required: false
  };

  if (explicitCaoKey && contractCaoKey && explicitCaoKey !== contractCaoKey) {
    return {
      ...resolution,
      status: 'blocked_explicit_cao_contract_mismatch',
      blocking_reason: `Expliciete cao_key ${explicitCaoKey} botst met contract-CAO ${contractCaoKey}.`,
      manual_review_required: true
    };
  }

  if (contract && !explicitCaoKey && !contractCaoKey) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_cao_key',
      blocking_reason: 'Arbeidscontract mist cao_key; contractregels kunnen niet audit-proof worden toegepast vanuit medewerkerstamdata.',
      manual_review_required: true
    };
  }

  if (!explicitCaoKey && !contractCaoKey) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_or_explicit_cao_key',
      blocking_reason: 'Contractregels vereisen een expliciete cao_key of een arbeidscontract met cao_key. Medewerkerstamdata of PB-default mag niet als bron worden gebruikt.',
      manual_review_required: true
    };
  }

  return resolution;
}

function dateFromIso(value) {
  const iso = asIsoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addCalendarMonths(dateStr, months) {
  const start = dateFromIso(dateStr);
  if (!start) return null;
  const originalDay = start.getUTCDate();
  const target = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + months,
    1
  ));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const date = dateFromIso(dateStr);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(later, earlier) {
  const laterDate = dateFromIso(later);
  const earlierDate = dateFromIso(earlier);
  if (!laterDate || !earlierDate) return null;
  return Math.round((laterDate - earlierDate) / (1000 * 60 * 60 * 24));
}

function calculateContractDurationBoundary(contract_start_date, contract_end_date) {
  const startIso = asIsoDate(contract_start_date);
  const endIso = asIsoDate(contract_end_date);
  if (!startIso || !endIso) {
    return {
      contract_duration_months: null,
      longer_than_six_months: null,
      six_month_boundary_date: startIso ? addCalendarMonths(startIso, 6) : null,
      six_month_exact_last_day: startIso ? addDays(addCalendarMonths(startIso, 6), -1) : null,
      warning: !startIso
        ? 'Geen startdatum opgegeven; contractduur kan niet worden bepaald.'
        : 'Geen einddatum opgegeven; contractduur kan niet worden bepaald.'
    };
  }

  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (!start || !end || end < start) {
    return {
      contract_duration_months: null,
      longer_than_six_months: null,
      six_month_boundary_date: addCalendarMonths(startIso, 6),
      six_month_exact_last_day: addDays(addCalendarMonths(startIso, 6), -1),
      warning: 'Contractdatums zijn ongeldig of einddatum ligt voor startdatum.'
    };
  }

  const sixMonthBoundaryDate = addCalendarMonths(startIso, 6);
  const sixMonthExactLastDay = addDays(sixMonthBoundaryDate, -1);
  const durationMonths = (end - start) / (1000 * 60 * 60 * 24 * 30.44);

  return {
    contract_duration_months: Math.round(durationMonths * 10) / 10,
    longer_than_six_months: endIso >= sixMonthBoundaryDate,
    six_month_boundary_date: sixMonthBoundaryDate,
    six_month_exact_last_day: sixMonthExactLastDay,
    warning: null
  };
}

function calculateContractDurationBoundaryForMonths(contract_start_date, contract_end_date, months) {
  const startIso = asIsoDate(contract_start_date);
  const endIso = asIsoDate(contract_end_date);
  const boundaryDate = startIso ? addCalendarMonths(startIso, months) : null;
  const exactLastDay = boundaryDate ? addDays(boundaryDate, -1) : null;

  if (!startIso || !endIso) {
    return {
      contract_duration_months: null,
      boundary_date: boundaryDate,
      exact_last_day: exactLastDay,
      exceeds_boundary: null,
      warning: !startIso
        ? 'Geen startdatum opgegeven; contractduur kan niet worden bepaald.'
        : 'Geen einddatum opgegeven; contractduur kan niet worden bepaald.'
    };
  }

  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (!start || !end || end < start) {
    return {
      contract_duration_months: null,
      boundary_date: boundaryDate,
      exact_last_day: exactLastDay,
      exceeds_boundary: null,
      warning: 'Contractdatums zijn ongeldig of einddatum ligt voor startdatum.'
    };
  }

  const durationMonths = (end - start) / (1000 * 60 * 60 * 24 * 30.44);
  return {
    contract_duration_months: Math.round(durationMonths * 10) / 10,
    boundary_date: boundaryDate,
    exact_last_day: exactLastDay,
    exceeds_boundary: boundaryDate ? endIso >= boundaryDate : null,
    warning: null
  };
}

function normalizeScope(caoScope) {
  return caoScope || {
    cao_scope_profile: 'unknown_manual_review',
    applies_full_security_rules: false,
    manual_review_required: true,
    payroll_rule_profile: {
      apply_article_40_special_hours: false,
      apply_article_41_holidays: true,
      apply_article_42_overtime: false
    }
  };
}

function resolveAspirantSecurityStatus(input) {
  const detectionSources = [];
  const explicitAspirant = booleanOrNull(
    input.is_aspirant_beveiliger ??
    input.aspirant_beveiliger ??
    input.aspirant_security_worker
  );
  const securityRole = String(input.security_role_status || '').toLowerCase();
  const functionLevel = String(input.cao_function_level || '').toLowerCase();
  const functionGroup = String(input.cao_function_group || '').toLowerCase();
  const functionType = String(input.function_type || '').toLowerCase();
  const caoScale = numberOrNull(input.cao_scale);

  if (explicitAspirant === true) detectionSources.push('explicit_aspirant_flag');
  if (securityRole === 'aspirant_beveiliger') detectionSources.push('security_role_status');
  if (functionLevel === 'aspirant') detectionSources.push('cao_function_level');
  if (functionGroup.includes('aspirant')) detectionSources.push('cao_function_group');
  if (functionType.includes('aspirant')) detectionSources.push('function_type');
  if (caoScale === 2) detectionSources.push('cao_scale_2');

  return {
    is_aspirant_beveiliger: detectionSources.length > 0,
    detection_sources: detectionSources,
    inferred_from_scale_only: detectionSources.length === 1 && detectionSources[0] === 'cao_scale_2'
  };
}

function validateRequestedProbation(requiredMonths, requestedMonths, sourceRuleIds) {
  if (requiredMonths === null || requiredMonths === undefined) {
    return {
      probation_validation_status: 'manual_review_required',
      probation_compliant: false,
      contract_rule_violations: [],
      recommended_contract_update: null
    };
  }

  if (requestedMonths === null || requestedMonths === undefined || requestedMonths === '') {
    return {
      probation_validation_status: 'calculated_not_saved',
      probation_compliant: false,
      contract_rule_violations: [],
      recommended_contract_update: {
        probation_period_months: requiredMonths,
        probation_period_source_rule_id: sourceRuleIds[0] || null
      }
    };
  }

  const requested = Number(requestedMonths);
  const required = Number(requiredMonths);
  if (!Number.isFinite(requested)) {
    return {
      probation_validation_status: 'manual_review_required',
      probation_compliant: false,
      contract_rule_violations: [{
        rule_id: sourceRuleIds[0] || 'CAO-PB-2024-R0315',
        severity: 'high',
        message: 'Ingevoerde proeftijd is geen geldig getal; handmatige review vereist.'
      }],
      recommended_contract_update: null
    };
  }

  if (requested !== required) {
    return {
      probation_validation_status: 'non_compliant',
      probation_compliant: false,
      contract_rule_violations: [{
        rule_id: sourceRuleIds[0] || 'CAO-PB-2024-R0315',
        severity: 'high',
        message: `Ingevoerde proeftijd (${requested} maanden) wijkt af van CAO-verplichte proeftijd (${required} maanden).`,
        requested_probation_period_months: requested,
        required_probation_period_months: required
      }],
      recommended_contract_update: {
        probation_period_months: required,
        probation_period_source_rule_id: sourceRuleIds[0] || null
      }
    };
  }

  return {
    probation_validation_status: 'compliant',
    probation_compliant: true,
    contract_rule_violations: [],
    recommended_contract_update: null
  };
}

function finalizeProbationResult(input, partial, duration, normalizedScope, extraWarnings = []) {
  const aspirantStatus = resolveAspirantSecurityStatus(input);
  const warnings = [
    ...(partial.warnings || []),
    ...(duration.warning ? [duration.warning] : []),
    ...extraWarnings
  ];
  const requestedProbation = input.requested_probation_period_months ??
    input.current_probation_period_months ??
    null;
  const validation = validateRequestedProbation(
    partial.probation_period_months,
    requestedProbation,
    partial.source_rule_ids || []
  );
  const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(normalizedScope.cao_scope_profile);
  const manualReviewRequired = partial.manual_review_required ||
    isUnknownOrMixed ||
    validation.probation_validation_status === 'manual_review_required';

  return {
    probation_period_months: partial.probation_period_months,
    requested_probation_period_months: requestedProbation,
    probation_validation_status: manualReviewRequired && validation.probation_validation_status !== 'non_compliant'
      ? 'manual_review_required'
      : validation.probation_validation_status,
    probation_compliant: validation.probation_compliant && !manualReviewRequired,
    contract_rule_status: validation.probation_validation_status === 'non_compliant'
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : validation.probation_compliant
      ? 'compliant'
      : 'calculated',
    source_rule_ids: partial.source_rule_ids || [],
    warnings,
    scope_warnings: partial.scope_warnings || [],
    manual_review_required: manualReviewRequired,
    contract_duration_months: duration.contract_duration_months,
    longer_than_six_months: duration.longer_than_six_months,
    six_month_boundary_date: duration.six_month_boundary_date,
    six_month_exact_last_day: duration.six_month_exact_last_day,
    cao_scope_profile: normalizedScope.cao_scope_profile,
    contract_rule_violations: validation.contract_rule_violations,
    recommended_contract_update: validation.recommended_contract_update,
    probation_contract_form: partial.probation_contract_form || input.contract_form || null,
    underlying_contract_form: partial.underlying_contract_form || input.underlying_contract_form || null,
    call_agreement_type: partial.call_agreement_type || null,
    aspirant_beveiliger_detected: partial.aspirant_beveiliger_detected ?? aspirantStatus.is_aspirant_beveiliger,
    aspirant_detection_sources: partial.aspirant_detection_sources ?? aspirantStatus.detection_sources,
    rule_engine_notes: partial.rule_engine_notes || []
  };
}

function resolveProbationContractForm(input) {
  const contractForm = input.contract_form || 'unknown';
  if (contractForm !== 'oproep') {
    return {
      probation_contract_form: contractForm,
      underlying_contract_form: input.underlying_contract_form || null,
      call_agreement_type: null,
      manual_review_required: false,
      warnings: [],
      source_rule_ids: [],
      rule_engine_notes: []
    };
  }

  const callAgreementType = inferCallAgreementType(input);
  const underlyingContractForm = input.underlying_contract_form ||
    input.call_underlying_contract_form ||
    input.call_employment_contract_form ||
    input.employment_duration_type ||
    null;

  if (callAgreementType === 'pre_agreement') {
    return {
      probation_contract_form: 'unknown',
      underlying_contract_form: underlyingContractForm,
      call_agreement_type: callAgreementType,
      manual_review_required: true,
      warnings: ['Oproepcontract met voorovereenkomst: iedere oproep kan een tijdelijke arbeidsovereenkomst laten ontstaan. Proeftijd kan niet definitief op hoofdcontractniveau worden berekend.'],
      source_rule_ids: ['CAO-PB-2024-R0371', 'CAO-PB-2024-R0372'],
      rule_engine_notes: ['Artikel 13 voorovereenkomst eerst juridisch/HR beoordelen voordat artikel 9 proeftijd definitief wordt toegepast.']
    };
  }

  if (underlyingContractForm === 'bepaalde_tijd' || underlyingContractForm === 'onbepaalde_tijd') {
    return {
      probation_contract_form: underlyingContractForm,
      underlying_contract_form: underlyingContractForm,
      call_agreement_type: callAgreementType,
      manual_review_required: false,
      warnings: [`Oproepovereenkomst (${callAgreementType}) gebruikt onderliggende duurvorm ${underlyingContractForm} voor artikel 9 proeftijd.`],
      source_rule_ids: [],
      rule_engine_notes: ['Artikel 13 nul-uren/min-max kan tijdelijk of vast zijn; artikel 9 proeftijd wordt toegepast op de onderliggende arbeidsovereenkomst.']
    };
  }

  if (asIsoDate(input.contract_end_date)) {
    return {
      probation_contract_form: 'bepaalde_tijd',
      underlying_contract_form: null,
      call_agreement_type: callAgreementType,
      manual_review_required: false,
      warnings: [`Oproepovereenkomst (${callAgreementType}) heeft een einddatum; proeftijd wordt als bepaalde tijd berekend. Leg bij voorkeur underlying_contract_form=bepaalde_tijd vast.`],
      source_rule_ids: [],
      rule_engine_notes: ['Onderliggende duurvorm is afgeleid uit contract_end_date zodat artikel 9 niet wordt overgeslagen bij oproepcontracten.']
    };
  }

  return {
    probation_contract_form: 'unknown',
    underlying_contract_form: null,
    call_agreement_type: callAgreementType,
    manual_review_required: true,
    warnings: [`Oproepovereenkomst (${callAgreementType}) mist onderliggende duurvorm. Leg underlying_contract_form=bepaalde_tijd of onbepaalde_tijd vast voordat proeftijd definitief mag zijn.`],
    source_rule_ids: ['CAO-PB-2024-R0315', 'CAO-PB-2024-R0316', 'CAO-PB-2024-R0371'],
    rule_engine_notes: ['Fail-closed: nul-uren/min-maxcontracten kunnen tijdelijk of vast zijn; zonder duurvorm is artikel 9 proeftijd onzeker.']
  };
}

function calculateProbationPeriod(input, caoScope) {
  const { contract_form, contract_start_date, contract_end_date } = input;

  const warnings = [];
  const source_rule_ids = [];
  const scope_warnings = [];

  const normalizedScope = normalizeScope(caoScope);
  const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(normalizedScope.cao_scope_profile);
  const scopeBlocksAspirant = normalizedScope.applies_full_security_rules === false;
  const duration = calculateContractDurationBoundary(contract_start_date, contract_end_date);
  const probationContract = resolveProbationContractForm(input);
  const aspirantStatus = resolveAspirantSecurityStatus(input);
  warnings.push(...(probationContract.warnings || []));

  if (probationContract.manual_review_required) {
    return finalizeProbationResult(input, {
      probation_period_months: null,
      source_rule_ids: probationContract.source_rule_ids || [],
      warnings,
      scope_warnings,
      manual_review_required: true,
      probation_contract_form: probationContract.probation_contract_form,
      underlying_contract_form: probationContract.underlying_contract_form,
      call_agreement_type: probationContract.call_agreement_type,
      aspirant_beveiliger_detected: aspirantStatus.is_aspirant_beveiliger,
      aspirant_detection_sources: aspirantStatus.detection_sources,
      rule_engine_notes: probationContract.rule_engine_notes || []
    }, duration, normalizedScope);
  }

  const effectiveContractForm = probationContract.probation_contract_form || contract_form;

  // Aspirant-beveiliger regel (CAO-PB-2024-R0317): ALLEEN als full-security scope
  if (aspirantStatus.is_aspirant_beveiliger) {
    if (scopeBlocksAspirant) {
      scope_warnings.push({
        rule_id: 'CAO-PB-2024-R0317',
        message: `Aspirant-beveiliger proeftijdregel (R0317) NIET toegepast: medewerker valt onder artikel 3 lid 2 of scope is onbekend/gemengd (profiel: ${normalizedScope.cao_scope_profile}). Reguliere proeftijdregels gelden. Detectie: ${aspirantStatus.detection_sources.join(', ')}.`
      });
      // Doorgaan met reguliere berekening hieronder
    } else if (normalizedScope.cao_scope_profile !== 'unknown_manual_review' && normalizedScope.applies_full_security_rules) {
      // Full-security scope: aspirant-regel mag worden toegepast
      if (duration.longer_than_six_months === true) {
        const aspirantRuleNotes = aspirantStatus.inferred_from_scale_only
          ? ['Aspirant-beveiligerstatus is afgeleid uit cao_scale=2; controleer dat schaal 2 inderdaad aspirantfunctie betreft.']
          : [];
        source_rule_ids.push('CAO-PB-2024-R0317');
        return finalizeProbationResult(input, {
          probation_period_months: 2,
          source_rule_ids,
          warnings,
          scope_warnings,
          manual_review_required: isUnknownOrMixed,
          probation_contract_form: effectiveContractForm,
          underlying_contract_form: probationContract.underlying_contract_form,
          call_agreement_type: probationContract.call_agreement_type,
          aspirant_beveiliger_detected: true,
          aspirant_detection_sources: aspirantStatus.detection_sources,
          rule_engine_notes: [...(probationContract.rule_engine_notes || []), ...aspirantRuleNotes]
        }, duration, normalizedScope);
      }
    }
  }

  // Onbepaalde tijd → 2 maanden (CAO-PB-2024-R0316)
  if (effectiveContractForm === 'onbepaalde_tijd') {
    source_rule_ids.push('CAO-PB-2024-R0316');
    return finalizeProbationResult(input, {
      probation_period_months: 2,
      source_rule_ids,
      warnings,
      scope_warnings,
      manual_review_required: isUnknownOrMixed,
      probation_contract_form: effectiveContractForm,
      underlying_contract_form: probationContract.underlying_contract_form,
      call_agreement_type: probationContract.call_agreement_type,
      rule_engine_notes: probationContract.rule_engine_notes || []
    }, {
      contract_duration_months: null,
      longer_than_six_months: null,
      six_month_boundary_date: null,
      six_month_exact_last_day: null,
      warning: null
    }, normalizedScope);
  }

  // Bepaalde tijd (CAO-PB-2024-R0315)
  if (effectiveContractForm === 'bepaalde_tijd') {
    if (duration.longer_than_six_months === null) {
      return finalizeProbationResult(input, {
        probation_period_months: null,
        source_rule_ids: ['CAO-PB-2024-R0315'],
        warnings,
        scope_warnings,
        manual_review_required: true,
        probation_contract_form: effectiveContractForm,
        underlying_contract_form: probationContract.underlying_contract_form,
        call_agreement_type: probationContract.call_agreement_type,
        rule_engine_notes: probationContract.rule_engine_notes || []
      }, duration, normalizedScope);
    }
    if (duration.longer_than_six_months === true) {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return finalizeProbationResult(input, {
        probation_period_months: 1,
        source_rule_ids,
        warnings,
        scope_warnings,
        manual_review_required: isUnknownOrMixed,
        probation_contract_form: effectiveContractForm,
        underlying_contract_form: probationContract.underlying_contract_form,
        call_agreement_type: probationContract.call_agreement_type,
        rule_engine_notes: probationContract.rule_engine_notes || []
      }, duration, normalizedScope);
    } else {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return finalizeProbationResult(input, {
        probation_period_months: 0,
        source_rule_ids,
        warnings: [...warnings, 'Contract korter dan of gelijk aan 6 maanden: geen proeftijd van toepassing.'],
        scope_warnings,
        manual_review_required: isUnknownOrMixed,
        probation_contract_form: effectiveContractForm,
        underlying_contract_form: probationContract.underlying_contract_form,
        call_agreement_type: probationContract.call_agreement_type,
        rule_engine_notes: probationContract.rule_engine_notes || []
      }, duration, normalizedScope);
    }
  }

  // Stage/uitzend/payroll/zzp: geen directe CAO-proeftijdregels bij de inlener
  if (['stage', 'uitzend', 'payroll', 'zzp'].includes(contract_form)) {
    return finalizeProbationResult(input, {
      probation_period_months: 0,
      source_rule_ids: [],
      warnings: [`Proeftijdregel niet van toepassing op contractvorm: ${contract_form}`],
      scope_warnings,
      manual_review_required: false,
      probation_contract_form: contract_form,
      underlying_contract_form: probationContract.underlying_contract_form,
      call_agreement_type: probationContract.call_agreement_type
    }, duration, normalizedScope);
  }

  return finalizeProbationResult(input, {
    probation_period_months: null,
    source_rule_ids: [],
    warnings: ['Contractvorm niet herkend; proeftijd kan niet worden berekend.'],
    scope_warnings,
    manual_review_required: true,
    probation_contract_form: effectiveContractForm,
    underlying_contract_form: probationContract.underlying_contract_form,
    call_agreement_type: probationContract.call_agreement_type,
    rule_engine_notes: probationContract.rule_engine_notes || []
  }, duration, normalizedScope);
}

function validateProbationDismissal(input) {
  const { probation_dismissal_datetime, next_shift_datetime, base_hourly_rate } = input;
  const violations = [];
  if (!probation_dismissal_datetime || !next_shift_datetime) return { violations: [], compensation: null };

  const dismissalTime = new Date(probation_dismissal_datetime);
  const shiftTime = new Date(next_shift_datetime);
  const hoursNotice = (shiftTime - dismissalTime) / (1000 * 60 * 60);

  if (hoursNotice < 12) {
    const compensation = base_hourly_rate ? base_hourly_rate * 8 : null;
    violations.push({
      rule_id: 'CAO-PB-2024-R0321',
      severity: 'high',
      message: `Opzegging in proeftijd te laat: ${Math.round(hoursNotice * 10) / 10} uur voor dienst (minimaal 12 uur vereist).`,
      compensation_rule_id: 'CAO-PB-2024-R0322',
      compensation_description: '8 basisuurlonen vergoeding',
      compensation_amount: compensation ? Math.round(compensation * 100) / 100 : null,
      hours_notice: Math.round(hoursNotice * 10) / 10
    });
  }

  return { violations, compensation: violations[0]?.compensation_amount || null };
}

function evaluateSuspensionRules(input) {
  const sourceRuleIds = [
    'CAO-PB-2024-R0445', 'CAO-PB-2024-R0446',
    'CAO-PB-2024-R0447', 'CAO-PB-2024-R0448', 'CAO-PB-2024-R0451'
  ];
  const warnings = [];
  const missingEvidence = [];
  const violations = [];
  const payrollEntitlements = [];
  const startDate = asIsoDate(input.suspension_start_date || input.event_start_date || input.start_date);
  const endDate = asIsoDate(input.suspension_end_date || input.event_end_date || input.end_date);
  const baseHourlyRate = numberOrNull(input.base_hourly_rate);
  const scheduledHours = numberOrNull(input.suspension_scheduled_hours) ??
    numberOrNull(input.suspended_scheduled_hours) ??
    sumScheduledHours(input.suspension_scheduled_shifts || input.suspended_scheduled_shifts);
  const reason = input.suspension_reason || input.reason || null;
  const notifiedAt = input.suspension_notified_at || input.employee_notified_at || null;
  const suspicionConfirmed = booleanOrNull(input.suspension_suspicion_confirmed);
  const rehabilitationWrittenAt = input.rehabilitation_written_at || input.suspension_rehabilitation_written_at || null;

  if (!startDate) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0448',
      field: 'suspension_start_date',
      message: 'Startdatum van schorsing ontbreekt; maximale duur van 7 dagen kan niet worden beoordeeld.'
    });
  }
  if (!endDate) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0448',
      field: 'suspension_end_date',
      message: 'Einddatum van schorsing ontbreekt; maximale duur van 7 dagen kan niet worden beoordeeld.'
    });
  }

  const suspensionDays = startDate && endDate ? daysBetween(endDate, startDate) + 1 : null;
  if (suspensionDays !== null && suspensionDays < 1) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0448',
      severity: 'high',
      message: 'Schorsingsdatums zijn ongeldig: einddatum ligt voor startdatum.',
      suspension_days: suspensionDays
    });
  } else if (suspensionDays !== null && suspensionDays > 7) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0448',
      severity: 'high',
      message: `Schorsing duurt ${suspensionDays} dagen; CAO staat maximaal 7 dagen toe.`,
      suspension_days: suspensionDays,
      max_suspension_days: 7
    });
  }

  if (!notifiedAt) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0445',
      field: 'suspension_notified_at',
      message: 'Leg vast dat werknemer direct is geinformeerd over de schorsing.'
    });
  }
  if (!reason) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0445',
      field: 'suspension_reason',
      message: 'Leg de reden van de schorsing vast.'
    });
  }

  if (suspicionConfirmed === false && !rehabilitationWrittenAt) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0451',
      field: 'rehabilitation_written_at',
      message: 'Als het vermoeden niet juist blijkt, moet schriftelijke rehabilitatie worden vastgelegd.'
    });
  }

  if (scheduledHours > 0 && baseHourlyRate !== null) {
    payrollEntitlements.push({
      rule_id: 'CAO-PB-2024-R0447',
      type: 'suspension_base_hourly_wage_continuation',
      suspended_scheduled_hours: round1(scheduledHours),
      base_hourly_rate: baseHourlyRate,
      amount: Math.round(scheduledHours * baseHourlyRate * 100) / 100,
      message: 'Tijdens schorsing moet het basisuurloon worden doorbetaald over de geraakte geplande uren.'
    });
  } else if (scheduledHours > 0 && baseHourlyRate === null) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0447',
      field: 'base_hourly_rate',
      message: 'Basisuurloon ontbreekt; doorbetaling tijdens schorsing kan niet definitief worden berekend.'
    });
  } else {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0447',
      field: 'suspension_scheduled_hours',
      message: 'Geplande uren tijdens schorsing ontbreken; doorbetaling basisuurloon moet handmatig worden vastgesteld.'
    });
  }

  warnings.push('Artikel 16: schorsing stopt de loonbetaling niet; basisuurloon blijft verschuldigd tijdens de schorsing.');

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    suspension_rule_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    suspension_compliant: !hasBlockingViolation && !manualReviewRequired,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    suspension_days: suspensionDays,
    max_suspension_days: 7,
    payroll_final_allowed: !hasBlockingViolation && !manualReviewRequired,
    manual_review_required: manualReviewRequired,
    recommended_event_update: {
      event_type: 'suspension',
      cao_rule_status: hasBlockingViolation ? 'blocked' : manualReviewRequired ? 'manual_review_required' : 'compliant',
      source_rule_ids: sourceRuleIds,
      suspension_start_date: startDate,
      suspension_end_date: endDate,
      suspension_days: suspensionDays,
      suspension_base_hourly_wage_due: true,
      suspension_max_days: 7
    }
  };
}

function resolveContractTransferArticle(input) {
  const annualHours = numberOrNull(
    input.contract_transfer_annual_hours ??
    input.contract_change_annual_hours ??
    input.object_contract_annual_hours
  );
  if (annualHours === null) {
    return {
      article: 'unknown',
      annual_hours: null,
      source_rule_id: 'CAO-PB-2024-R0473',
      threshold_hours: 15000
    };
  }
  return {
    article: annualHours <= 15000 ? 'article_19_15000_or_less' : 'article_20_more_than_15000',
    annual_hours: annualHours,
    source_rule_id: annualHours <= 15000 ? 'CAO-PB-2024-R0473' : 'CAO-PB-2024-R0501',
    threshold_hours: 15000
  };
}

function isEmployeeEligibleForLargeContractTransfer(input) {
  const transferDate = asIsoDate(input.contract_transfer_date || input.event_start_date || input.start_date);
  const objectStartDate = asIsoDate(input.object_assignment_start_date || input.employee_object_start_date);
  const continuousDays = numberOrNull(input.uninterrupted_object_work_days) ??
    (transferDate && objectStartDate ? daysBetween(transferDate, objectStartDate) : null);
  const totalWorkedHours = numberOrNull(input.total_worked_hours_reference_period);
  const assignmentHours = numberOrNull(input.assignment_worked_hours_reference_period ?? input.object_worked_hours_reference_period);
  const disabilityWeeks = numberOrNull(input.disability_weeks_at_transfer);
  const oneYearSatisfied = continuousDays !== null ? continuousDays >= 365 : null;
  const assignmentThreshold = totalWorkedHours !== null ? (totalWorkedHours / 2) + 1 : null;
  const assignmentShareSatisfied = assignmentHours !== null && assignmentThreshold !== null
    ? assignmentHours >= assignmentThreshold
    : null;
  const excludedByDisability = disabilityWeeks !== null ? disabilityWeeks > 26 : null;

  return {
    transfer_date: transferDate,
    object_assignment_start_date: objectStartDate,
    uninterrupted_object_work_days: continuousDays,
    one_year_uninterrupted_satisfied: oneYearSatisfied,
    total_worked_hours_reference_period: totalWorkedHours,
    assignment_worked_hours_reference_period: assignmentHours,
    assignment_threshold_hours: assignmentThreshold,
    assignment_share_satisfied: assignmentShareSatisfied,
    disability_weeks_at_transfer: disabilityWeeks,
    excluded_by_disability_over_26_weeks: excludedByDisability,
    eligible: oneYearSatisfied === true &&
      assignmentShareSatisfied === true &&
      excludedByDisability !== true
  };
}

function evaluateContractTransferRules(input) {
  const transfer = resolveContractTransferArticle(input);
  const sourceRuleIds = [
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
  ];
  const missingEvidence = [];
  const violations = [];
  const warnings = [];
  const payrollEntitlements = [];
  const transferDate = asIsoDate(input.contract_transfer_date || input.event_start_date || input.start_date);
  const offeredContractForm = input.offered_contract_form || input.new_contract_form || null;
  const offeredProbationMonths = numberOrNull(input.offered_probation_period_months);
  const previousHoursPerPeriod = numberOrNull(input.previous_contract_hours_per_pay_period);
  const offeredHoursPerPeriod = numberOrNull(input.offered_contract_hours_per_pay_period);
  const previousBaseHourlyRate = numberOrNull(input.previous_base_hourly_rate);
  const offeredBaseHourlyRate = numberOrNull(input.offered_base_hourly_rate);
  const employeeStaysWithLosingParty = booleanOrNull(input.employee_stays_with_losing_party);

  addMissingEvidence(missingEvidence, !!transferDate, 'CAO-PB-2024-R0467', 'Leg de feitelijke contractwisseldatum vast.', 'contract_transfer_date');
  addMissingEvidence(missingEvidence, !!input.losing_employer_id || !!input.losing_employer_name, 'CAO-PB-2024-R0470', 'Leg de latende partij vast.', 'losing_employer_id');
  addMissingEvidence(missingEvidence, !!input.acquiring_employer_id || !!input.acquiring_employer_name, 'CAO-PB-2024-R0469', 'Leg de verwervende partij vast.', 'acquiring_employer_id');
  addMissingEvidence(missingEvidence, !!input.object_id || !!input.contract_object_name, 'CAO-PB-2024-R0467', 'Leg het object/de opdracht vast waarop de contractwissel ziet.', 'object_id');
  addMissingEvidence(missingEvidence, transfer.annual_hours !== null, 'CAO-PB-2024-R0473', 'Leg het aantal contracturen per jaar bij de latende partij vast om artikel 19 of 20 te bepalen.', 'contract_transfer_annual_hours');

  if (transfer.article === 'article_19_15000_or_less') {
    addConfirmedEvidence(missingEvidence, input, 'employees_informed_confirmed', 'CAO-PB-2024-R0474', 'Bevestig dat betrokken werknemers zijn geinformeerd.');
    addConfirmedEvidence(missingEvidence, input, 'unions_informed_contract_hours_confirmed', 'CAO-PB-2024-R0474', 'Bevestig dat vakbonden over het aantal contracturen zijn geinformeerd.');
    addConfirmedEvidence(missingEvidence, input, 'losing_party_replacement_work_searched_confirmed', 'CAO-PB-2024-R0475', 'Bevestig dat latende partij zoveel mogelijk vervangend werk heeft gezocht.');
    addConfirmedEvidence(missingEvidence, input, 'acquiring_party_consultation_confirmed', 'CAO-PB-2024-R0477', 'Bevestig overleg tussen latende en verwervende partij over werkgelegenheid.');
    addConfirmedEvidence(missingEvidence, input, 'employee_cooperation_confirmed', 'CAO-PB-2024-R0478', 'Bevestig medewerking van werknemer.');
    addConfirmedEvidence(missingEvidence, input, 'contract_transfer_information_requested_confirmed', 'CAO-PB-2024-R0479', 'Bevestig dat verwervende partij informatie bij latende partij heeft gevraagd.');
    addConfirmedEvidence(missingEvidence, input, 'three_month_reference_information_confirmed', 'CAO-PB-2024-R0484', 'Bevestig informatie over 3 maanden voorafgaand aan offerteaanvraag/gunning en latere wijzigingen.');
    addConfirmedEvidence(missingEvidence, input, 'losing_party_information_complete_confirmed', 'CAO-PB-2024-R0485', 'Bevestig dat latende partij de vereiste informatie heeft gegeven zodra gunning zeker was.');

    const previousInProbation = booleanOrNull(input.employee_still_in_probation_at_losing_party) === true;
    if (!previousInProbation && offeredProbationMonths !== null && offeredProbationMonths > 0) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0487',
        severity: 'high',
        message: 'Bij contractwissel van 15.000 uur of minder mag geen proeftijd worden aangeboden, tenzij werknemer bij latende partij nog in proeftijd zat.',
        offered_probation_period_months: offeredProbationMonths
      });
    }
    if (previousInProbation && offeredProbationMonths !== null) {
      warnings.push('Artikel 19: proeftijd is alleen toegestaan omdat werknemer bij latende partij nog in proeftijd zat.');
    }

    const losingFixedTerm = booleanOrNull(input.losing_party_fixed_term_contract) === true;
    if (!losingFixedTerm && offeredContractForm && offeredContractForm !== 'onbepaalde_tijd') {
      violations.push({
        rule_id: 'CAO-PB-2024-R0489',
        severity: 'high',
        message: 'Bij contractwissel van 15.000 uur of minder moet een contract voor onbepaalde tijd worden aangeboden, tenzij werknemer bij latende partij nog bepaalde tijd had.',
        offered_contract_form: offeredContractForm
      });
    }
    addMissingEvidence(missingEvidence, !!offeredContractForm, 'CAO-PB-2024-R0489', 'Leg de aangeboden contractvorm vast.', 'offered_contract_form');

    if (previousHoursPerPeriod !== null && offeredHoursPerPeriod !== null && offeredHoursPerPeriod < previousHoursPerPeriod) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0491',
        severity: 'high',
        message: `Aangeboden uren per periode (${offeredHoursPerPeriod}) zijn lager dan vorige contracturen (${previousHoursPerPeriod}).`,
        previous_contract_hours_per_pay_period: previousHoursPerPeriod,
        offered_contract_hours_per_pay_period: offeredHoursPerPeriod
      });
    }
    if (previousBaseHourlyRate !== null && offeredBaseHourlyRate !== null && offeredBaseHourlyRate < previousBaseHourlyRate) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0492',
        severity: 'high',
        message: `Aangeboden basisuurloon (${offeredBaseHourlyRate}) is lager dan over te nemen cao-loon (${previousBaseHourlyRate}).`,
        previous_base_hourly_rate: previousBaseHourlyRate,
        offered_base_hourly_rate: offeredBaseHourlyRate
      });
    }

    addConfirmedEvidence(missingEvidence, input, 'cao_wage_taken_over_confirmed', 'CAO-PB-2024-R0492', 'Bevestig dat het cao-loon is overgenomen.');
    addConfirmedEvidence(missingEvidence, input, 'other_cao_claims_taken_over_confirmed', 'CAO-PB-2024-R0493', 'Bevestig dat overige aanspraken volgens de cao zijn overgenomen.');
    addConfirmedEvidence(missingEvidence, input, 'seniority_accrual_taken_over_confirmed', 'CAO-PB-2024-R0494', 'Bevestig doorbouw/aanspraken zoals functiejaren en ancienniteit.');
    addConfirmedEvidence(missingEvidence, input, 'study_agreement_taken_over_confirmed', 'CAO-PB-2024-R0495', 'Bevestig overname van eventuele studieovereenkomst.');
    addConfirmedEvidence(missingEvidence, input, 'above_cao_reimbursements_taken_over_confirmed', 'CAO-PB-2024-R0496', 'Bevestig overname van vergoedingen boven cao-minimum.');
    addConfirmedEvidence(missingEvidence, input, 'location_allowances_taken_over_confirmed', 'CAO-PB-2024-R0497', 'Bevestig overname van locatietoeslagen als de grondslag gelijk blijft.');
    addConfirmedEvidence(missingEvidence, input, 'regeling_80_90_100_taken_over_confirmed', 'CAO-PB-2024-R0498', 'Bevestig overname van 80-90-100-regeling indien van toepassing.');
  }

  let largeEligibility = null;
  if (transfer.article === 'article_20_more_than_15000') {
    largeEligibility = isEmployeeEligibleForLargeContractTransfer(input);
    addConfirmedEvidence(missingEvidence, input, 'mutation_list_used_confirmed', 'CAO-PB-2024-R0503', 'Bevestig dat mutatielijst contractwissel uit bijlage 9 is gebruikt.');
    if (largeEligibility.one_year_uninterrupted_satisfied === false) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0506',
        severity: 'high',
        message: 'Werknemer voldoet niet aan minimaal 1 jaar onafgebroken werken op het object.',
        uninterrupted_object_work_days: largeEligibility.uninterrupted_object_work_days
      });
    }
    if (largeEligibility.assignment_share_satisfied === false) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0507',
        severity: 'high',
        message: 'Werknemer voldoet niet aan minimaal 50% plus 1 uur voor deze opdracht.',
        assignment_worked_hours_reference_period: largeEligibility.assignment_worked_hours_reference_period,
        assignment_threshold_hours: largeEligibility.assignment_threshold_hours
      });
    }
    if (largeEligibility.excluded_by_disability_over_26_weeks === true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0507',
        severity: 'high',
        message: 'Werknemer is langer dan 26 weken arbeidsongeschikt en valt buiten de overnamegroep.',
        disability_weeks_at_transfer: largeEligibility.disability_weeks_at_transfer
      });
    }
    addMissingEvidence(missingEvidence, largeEligibility.one_year_uninterrupted_satisfied !== null, 'CAO-PB-2024-R0506', 'Leg objectstartdatum of onafgebroken dagen vast.', 'object_assignment_start_date');
    addMissingEvidence(missingEvidence, largeEligibility.assignment_share_satisfied !== null, 'CAO-PB-2024-R0507', 'Leg totale gewerkte uren en opdrachturen vast voor 50%+1 uur toets.', 'assignment_worked_hours_reference_period');
    addMissingEvidence(missingEvidence, largeEligibility.excluded_by_disability_over_26_weeks !== null, 'CAO-PB-2024-R0507', 'Leg arbeidsongeschiktheidsduur op peildatum vast.', 'disability_weeks_at_transfer');

    if (employeeStaysWithLosingParty === true) {
      addConfirmedEvidence(missingEvidence, input, 'employee_stays_agreement_confirmed', 'CAO-PB-2024-R0538', 'Bevestig overeenstemming dat werknemer bij latende partij blijft.');
      addConfirmedEvidence(missingEvidence, input, 'employee_stays_notified_acquiring_party_confirmed', 'CAO-PB-2024-R0539', 'Bevestig gezamenlijke melding aan verwervende partij.');
    } else if (largeEligibility.eligible === true) {
      addConfirmedEvidence(missingEvidence, input, 'employment_offer_made_confirmed', 'CAO-PB-2024-R0504', 'Bevestig aanbod arbeidsovereenkomst door verwervende partij.');
    }

    addConfirmedEvidence(missingEvidence, input, 'salary_preserved_confirmed', 'CAO-PB-2024-R0509', 'Bevestig behoud van salaris.');
    addConfirmedEvidence(missingEvidence, input, 'seniority_preserved_confirmed', 'CAO-PB-2024-R0510', 'Bevestig behoud van ancienniteit.');
    addConfirmedEvidence(missingEvidence, input, 'working_hours_preserved_confirmed', 'CAO-PB-2024-R0511', 'Bevestig behoud van arbeidsduur.');
    addConfirmedEvidence(missingEvidence, input, 'above_cao_claims_preserved_confirmed', 'CAO-PB-2024-R0512', 'Bevestig behoud van boven-cao aanspraken.');
    addConfirmedEvidence(missingEvidence, input, 'regeling_80_90_100_preserved_confirmed', 'CAO-PB-2024-R0513', 'Bevestig behoud van 80-90-100-regeling indien van toepassing.');
    addConfirmedEvidence(missingEvidence, input, 'other_conditions_preserved_confirmed', 'CAO-PB-2024-R0514', 'Bevestig behoud van overige arbeidsvoorwaarden.');
    addConfirmedEvidence(missingEvidence, input, 'personal_allowances_preserved_confirmed', 'CAO-PB-2024-R0519', 'Bevestig behoud van persoonlijke toeslagen.');
    if (booleanOrNull(input.object_or_function_allowance_ground_lapses) === true) {
      addConfirmedEvidence(missingEvidence, input, 'allowance_phase_out_article_46_confirmed', 'CAO-PB-2024-R0518', 'Bevestig afbouw volgens artikel 46 als grondslag voor object-/functietoeslag vervalt.');
    }
    addConfirmedEvidence(missingEvidence, input, 'vacation_transfer_choice_requested_confirmed', 'CAO-PB-2024-R0521', 'Bevestig tijdige schriftelijke vraag aan werknemers over meenemen vakantiedagen/vakantiebijslag.');
    addConfirmedEvidence(missingEvidence, input, 'unused_vacation_days_amount_known_confirmed', 'CAO-PB-2024-R0525', 'Bevestig dat ongebruikte vakantiedagen/aanspraakhoogte bekend zijn.');
    addConfirmedEvidence(missingEvidence, input, 'unpaid_vacation_allowance_amount_known_confirmed', 'CAO-PB-2024-R0526', 'Bevestig dat nog niet betaalde vakantiebijslag/aanspraakhoogte bekend is.');
    addConfirmedEvidence(missingEvidence, input, 'vacation_transfer_written_notice_confirmed', 'CAO-PB-2024-R0528', 'Bevestig schriftelijke melding aan verwervende partij over keuzes en hoogte aanspraken.');
    addConfirmedEvidence(missingEvidence, input, 'vacation_transfer_wishes_respected_confirmed', 'CAO-PB-2024-R0529', 'Bevestig uitvoering van werknemerswensen zonder voorbehoud.');
    addConfirmedEvidence(missingEvidence, input, 'vacation_transfer_protocol_followed_confirmed', 'CAO-PB-2024-R0530', 'Bevestig toepassing overdrachtsprotocol vakantiedagen/vakantiebijslag.');
    addConfirmedEvidence(missingEvidence, input, 'study_agreement_taken_over_confirmed', 'CAO-PB-2024-R0531', 'Bevestig overname van eventuele studieovereenkomst.');
    addConfirmedEvidence(missingEvidence, input, 'total_wage_sum_disclosed_confirmed', 'CAO-PB-2024-R0532', 'Bevestig inzage in totale loonsom tijdens aanbesteding.');
    addConfirmedEvidence(missingEvidence, input, 'wage_sum_includes_all_money_and_time_obligations_confirmed', 'CAO-PB-2024-R0534', 'Bevestig dat loonsom alle op geld en tijd waardeerbare verplichtingen omvat.');
    addConfirmedEvidence(missingEvidence, input, 'unions_informed_confirmed', 'CAO-PB-2024-R0541', 'Bevestig informatie aan vakbonden bij meer dan 15.000 uur beveiligingstaken.');
  }

  if (booleanOrNull(input.contract_transfer_dispute_exists) === true) {
    addConfirmedEvidence(missingEvidence, input, 'social_fund_dispute_submitted_confirmed', transfer.article === 'article_20_more_than_15000' ? 'CAO-PB-2024-R0545' : 'CAO-PB-2024-R0499', 'Bevestig dat geschil is voorgelegd aan bestuur Sociaal Fonds Particuliere Beveiliging.');
  }

  if (previousBaseHourlyRate !== null) {
    payrollEntitlements.push({
      rule_id: transfer.article === 'article_20_more_than_15000' ? 'CAO-PB-2024-R0509' : 'CAO-PB-2024-R0492',
      type: 'contract_transfer_cao_wage_preservation',
      previous_base_hourly_rate: previousBaseHourlyRate,
      offered_base_hourly_rate: offeredBaseHourlyRate,
      message: 'Contractwissel: cao-loon/salaris moet behouden of overgenomen worden.'
    });
  }
  if (previousHoursPerPeriod !== null) {
    payrollEntitlements.push({
      rule_id: transfer.article === 'article_20_more_than_15000' ? 'CAO-PB-2024-R0511' : 'CAO-PB-2024-R0491',
      type: 'contract_transfer_working_hours_preservation',
      previous_contract_hours_per_pay_period: previousHoursPerPeriod,
      offered_contract_hours_per_pay_period: offeredHoursPerPeriod,
      message: 'Contractwissel: arbeidsduur/uren per periode mogen niet lager worden dan de over te nemen aanspraak.'
    });
  }

  warnings.push('Contractwisselregels vereisen een auditbaar dossier per betrokken werknemer; ontbrekend bewijs blokkeert definitieve payroll.');

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    contract_transfer_rule_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    contract_transfer_compliant: !hasBlockingViolation && !manualReviewRequired,
    contract_transfer_article: transfer.article,
    annual_contract_hours: transfer.annual_hours,
    threshold_hours: transfer.threshold_hours,
    transfer_date: transferDate,
    large_contract_transfer_eligibility: largeEligibility,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    payroll_final_allowed: !hasBlockingViolation && !manualReviewRequired,
    manual_review_required: manualReviewRequired,
    recommended_event_update: {
      event_type: 'contract_transfer',
      cao_rule_status: hasBlockingViolation ? 'blocked' : manualReviewRequired ? 'manual_review_required' : 'compliant',
      source_rule_ids: sourceRuleIds,
      contract_transfer_article: transfer.article,
      contract_transfer_date: transferDate,
      annual_contract_hours: transfer.annual_hours,
      payroll_final_allowed: !hasBlockingViolation && !manualReviewRequired
    }
  };
}

function dateTimeFromValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffHours(later, earlier) {
  const laterDate = dateTimeFromValue(later);
  const earlierDate = dateTimeFromValue(earlier);
  if (!laterDate || !earlierDate) return null;
  return (laterDate - earlierDate) / (1000 * 60 * 60);
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function hoursBetween(start, end) {
  const hours = diffHours(end, start);
  return hours === null ? null : Math.max(0, round1(hours));
}

function sumScheduledHours(entries) {
  return normalizeArray(entries).reduce((total, entry) => {
    const explicit = numberOrNull(entry.hours ?? entry.scheduled_hours ?? entry.duration_hours);
    if (explicit !== null) return total + explicit;
    const calculated = hoursBetween(entry.start_datetime || entry.start, entry.end_datetime || entry.end);
    return total + (calculated || 0);
  }, 0);
}

function addMissingEvidence(target, condition, ruleId, message, field) {
  if (condition) return;
  target.push({ rule_id: ruleId, field, message });
}

function addConfirmedEvidence(target, input, field, ruleId, message) {
  addMissingEvidence(target, booleanOrNull(input[field]) === true, ruleId, message, field);
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function booleanOrNull(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function getCaoRuleRegistrySnapshot(caoConfig) {
  const gateSnapshot = caoConfig?.payroll_readiness_gate?.persisted_rule_registry || null;
  const configuredSnapshot = caoConfig?.rule_registry_snapshot || null;
  const snapshot = configuredSnapshot || gateSnapshot || null;
  const fingerprint = caoConfig?.rule_registry_fingerprint ||
    snapshot?.fingerprint ||
    null;
  const ruleCount = caoConfig?.rule_registry_rule_count ??
    snapshot?.persisted_unique_rule_count ??
    snapshot?.fingerprint_rule_count ??
    null;
  const verifiedAt = caoConfig?.rule_registry_verified_at ||
    snapshot?.verified_at ||
    null;

  return {
    fingerprint,
    fingerprint_algorithm: snapshot?.fingerprint_algorithm || (fingerprint ? 'sha256' : null),
    rule_count: ruleCount,
    verified_at: verifiedAt,
    expected_unique_rule_count: snapshot?.expected_unique_rule_count ?? null,
    persisted_unique_rule_count: snapshot?.persisted_unique_rule_count ?? ruleCount,
    source_coverage_passed: snapshot?.source_coverage?.passed ?? null,
    missing_rule_ids_truncated: snapshot?.missing_rule_ids_truncated ?? false
  };
}

function getCaoPayrollReadiness(caoConfig) {
  const gate = caoConfig?.payroll_readiness_gate || null;
  const status = caoConfig?.payroll_readiness_status || null;
  const registrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
  const registryReady = !!registrySnapshot.fingerprint && Number(registrySnapshot.rule_count || 0) > 0;
  const ready = caoConfig?.is_payroll_ready === true &&
    status === 'ready' &&
    gate?.passed === true &&
    registryReady;

  return {
    ready,
    status: ready ? 'ready' : !registryReady ? 'blocked_missing_rule_registry_fingerprint' : (status || 'unknown'),
    is_payroll_ready: caoConfig?.is_payroll_ready === true,
    gate_present: !!gate,
    rule_registry_fingerprint_present: !!registrySnapshot.fingerprint,
    rule_registry_rule_count: registrySnapshot.rule_count,
    blocking_findings: registryReady
      ? gate?.blocking_findings || []
      : [
        {
          code: 'missing_rule_registry_fingerprint',
          severity: 'critical',
          message: 'CAOConfiguration mist rule_registry_fingerprint; contractfinalisatie is niet audit-proof.'
        },
        ...(gate?.blocking_findings || [])
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

function isWithinDateRange(record, date, startField = 'valid_from', endField = 'valid_until') {
  if (!record || !date) return false;
  if (record[startField] && record[startField] > date) return false;
  if (record[endField] && record[endField] < date) return false;
  return true;
}

function hasAnyValue(...values) {
  return values.some(value => {
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    return value !== null && value !== undefined && value !== '';
  });
}

function caoConfigSummary(config) {
  return {
    id: config?.id || null,
    name: config?.name || config?.version_label || null,
    cao_key: config?.cao_key || null,
    cloudflare_revision: config?.cloudflare_revision || null,
    valid_from: config?.valid_from || null,
    valid_until: config?.valid_until || null
  };
}

async function resolveContractCaoConfiguration(base44, { caoKey, caoConfigurationId, referenceDate }) {
  if (!referenceDate) {
    return {
      config: null,
      status: 'blocked_missing_contract_reference_date',
      candidates: [],
      message: 'Contract mist startdatum; CAO-configuratie kan niet datumgeldig worden bepaald.'
    };
  }

  if (caoConfigurationId) {
    try {
      const config = await base44.asServiceRole.entities.CAOConfiguration.get(caoConfigurationId);
      if (!config) throw new Error('not_found');
      if (config.cao_key && caoKey && config.cao_key !== caoKey) {
        return {
          config: null,
          status: 'blocked_contract_cao_configuration_key_mismatch',
          candidates: [caoConfigSummary(config)],
          message: `CAO-configuratie ${caoConfigurationId} hoort bij ${config.cao_key}, maar contract gebruikt ${caoKey}.`
        };
      }
      if (!isWithinDateRange(config, referenceDate, 'valid_from', 'valid_until')) {
        return {
          config: null,
          status: 'blocked_contract_cao_configuration_not_valid_on_start_date',
          candidates: [caoConfigSummary(config)],
          message: `CAO-configuratie ${caoConfigurationId} is niet geldig op contractstartdatum ${referenceDate}.`
        };
      }
      return {
        config,
        status: 'resolved_explicit_cao_configuration',
        candidates: [caoConfigSummary(config)],
        message: null
      };
    } catch {
      return {
        config: null,
        status: 'blocked_contract_cao_configuration_not_found',
        candidates: [],
        message: `CAO-configuratie ${caoConfigurationId} kon niet worden opgehaald.`
      };
    }
  }

  const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({
    status: 'active',
    cao_key: caoKey
  });
  const eligible = (configs || [])
    .filter(config => isWithinDateRange(config, referenceDate, 'valid_from', 'valid_until'))
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));

  if (eligible.length === 0) {
    return {
      config: null,
      status: 'blocked_missing_active_contract_cao_configuration',
      candidates: [],
      message: `Geen actieve CAO-configuratie gevonden voor ${caoKey} op contractstartdatum ${referenceDate}.`
    };
  }
  if (eligible.length > 1) {
    return {
      config: null,
      status: 'blocked_ambiguous_contract_cao_configuration',
      candidates: eligible.map(caoConfigSummary),
      message: `Meerdere actieve CAO-configuraties gevonden voor ${caoKey} op contractstartdatum ${referenceDate}.`
    };
  }
  return {
    config: eligible[0],
    status: 'resolved_active_cao_by_key_and_start_date',
    candidates: eligible.map(caoConfigSummary),
    message: null
  };
}

async function evaluateContractBasis(base44, { body, personnel, contract, targetCaoKey }) {
  const violations = [];
  const warnings = [];
  const missingEvidence = [];
  const recommendedContractUpdate = {};

  const explicitCompanyId = pickFirst(body.company_id, contract?.company_id, null);
  const personnelPrimaryCompanyId = pickFirst(personnel?.primary_company_id, null);
  const explicitCaoKey = pickFirst(body.cao_key, contract?.cao_key, null);
  const contractForm = pickFirst(body.contract_form, contract?.contract_form, personnel?.contract_form, null);
  const underlyingContractForm = pickFirst(
    body.underlying_contract_form,
    body.call_underlying_contract_form,
    contract?.underlying_contract_form,
    contract?.call_underlying_contract_form,
    personnel?.underlying_contract_form,
    null
  );
  const contractStartDate = asIsoDate(pickFirst(body.contract_start_date, contract?.contract_start_date, null));
  const contractEndDate = asIsoDate(pickFirst(body.contract_end_date, contract?.contract_end_date, null));
  const caoConfigurationId = pickFirst(body.cao_configuration_id, contract?.cao_configuration_id, null);
  const securityRoleProofValues = normalizeArray([
    body.security_role_status,
    contract?.security_role_status,
    ...normalizeArray(body.allowed_security_role_statuses),
    ...normalizeArray(contract?.allowed_security_role_statuses)
  ]).filter(value => !['unknown', 'not_applicable'].includes(value));
  const functionContextPresent = hasAnyValue(
    body.function_type,
    contract?.function_type,
    body.cao_function_group,
    contract?.cao_function_group,
    body.cao_function_level,
    contract?.cao_function_level,
    normalizeArray(body.allowed_function_types),
    normalizeArray(contract?.allowed_function_types),
    normalizeArray(body.allowed_cao_function_groups),
    normalizeArray(contract?.allowed_cao_function_groups),
    normalizeArray(body.allowed_cao_function_levels),
    normalizeArray(contract?.allowed_cao_function_levels),
    normalizeArray(body.allowed_task_types),
    normalizeArray(contract?.allowed_task_types),
    securityRoleProofValues
  );

  if (!explicitCompanyId) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-COMPANY',
      severity: 'high',
      message: 'Arbeidscontract mist company_id. Een contract moet juridisch aan een werkgever/bedrijf gekoppeld zijn voordat planning/payroll definitief mag zijn.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'company_id'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-COMPANY',
      field: 'company_id',
      message: 'Leg company_id vast op PersonnelContract.'
    });
    if (personnelPrimaryCompanyId) {
      recommendedContractUpdate.company_id = personnelPrimaryCompanyId;
      warnings.push(`Medewerker heeft primary_company_id ${personnelPrimaryCompanyId}, maar contract.company_id moet expliciet worden opgeslagen.`);
    }
  }

  if (!explicitCaoKey) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-CAO',
      severity: 'high',
      message: 'Arbeidscontract mist expliciete cao_key. De toepasselijke CAO moet op contractniveau gekozen zijn.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'cao_key'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-CAO',
      field: 'cao_key',
      message: 'Leg cao_key vast op PersonnelContract.'
    });
    if (targetCaoKey) recommendedContractUpdate.cao_key = targetCaoKey;
  }

  if (!contractForm || contractForm === 'unknown') {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-FORM',
      severity: 'high',
      message: 'Arbeidscontract mist contract_form. Contractvorm is nodig voor proeftijd, oproep-, stage-, inhuur- en contractmodelregels.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'contract_form'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-FORM',
      field: 'contract_form',
      message: 'Leg contract_form vast op PersonnelContract.'
    });
  }

  if (contractForm === 'oproep' && (!underlyingContractForm || underlyingContractForm === 'unknown')) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-CALL-UNDERLYING-FORM',
      severity: 'high',
      message: 'Oproepovereenkomst mist onderliggende duurvorm. Leg vast of deze bepaalde tijd of onbepaalde tijd is voordat proeftijd en contractregels definitief mogen zijn.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'underlying_contract_form'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-CALL-UNDERLYING-FORM',
      field: 'underlying_contract_form',
      message: 'Leg underlying_contract_form vast voor oproepovereenkomsten.'
    });
  }

  if (!contractStartDate) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-DATE',
      severity: 'high',
      message: 'Arbeidscontract mist contract_start_date. CAO-configuratie en proeftijdregels kunnen niet datumvast worden toegepast.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'contract_start_date'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-DATE',
      field: 'contract_start_date',
      message: 'Leg contract_start_date vast op PersonnelContract.'
    });
  }
  if (contractStartDate && contractEndDate && contractEndDate < contractStartDate) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-DATE',
      severity: 'high',
      message: 'Arbeidscontract heeft een einddatum vóór de startdatum.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'contract_end_date'
    });
  }

  if (!functionContextPresent) {
    violations.push({
      rule_id: 'APP-CONTRACT-BASIS-FUNCTION',
      severity: 'high',
      message: 'Arbeidscontract mist functie-/CAO-scopevelden. Leg vast welke functies/diensten dit contract mag dragen.',
      payroll_impact: true,
      manual_review_required: true,
      field: 'function_type/cao_function_group/security_role_status/allowed_*'
    });
    missingEvidence.push({
      rule_id: 'APP-CONTRACT-BASIS-FUNCTION',
      field: 'function_type/cao_function_group/security_role_status/allowed_*',
      message: 'Leg minimaal een functieprofiel of allowed_* scope op het contract vast.'
    });
  }

  let caoConfigurationResolution = {
    config: null,
    status: 'not_attempted',
    candidates: [],
    message: null
  };
  let caoPayrollReadiness = null;
  let caoRuleRegistrySnapshot = null;
  if (targetCaoKey && contractStartDate && !(contractStartDate && contractEndDate && contractEndDate < contractStartDate)) {
    caoConfigurationResolution = await resolveContractCaoConfiguration(base44, {
      caoKey: targetCaoKey,
      caoConfigurationId,
      referenceDate: contractStartDate
    });
    if (!caoConfigurationResolution.config) {
      violations.push({
        rule_id: 'APP-CONTRACT-BASIS-CAO-CONFIG',
        severity: 'high',
        message: caoConfigurationResolution.message,
        payroll_impact: true,
        manual_review_required: true,
        field: 'cao_configuration_id/cao_key/contract_start_date'
      });
    } else {
      caoPayrollReadiness = getCaoPayrollReadiness(caoConfigurationResolution.config);
      caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfigurationResolution.config);
      if (!caoPayrollReadiness.ready) {
        violations.push({
          rule_id: 'APP-CONTRACT-BASIS-CAO-READINESS',
          severity: 'high',
          message: `CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}); contractfinalisatie is geblokkeerd totdat de CAO coverage-gate slaagt.`,
          payroll_impact: true,
          manual_review_required: true,
          field: 'cao_configuration.payroll_readiness'
        });
      }
      if (!caoConfigurationId) {
        recommendedContractUpdate.cao_configuration_id = caoConfigurationResolution.config.id;
      }
    }
  }

  const hasBlocking = violations.some(violation => ['high', 'critical'].includes(violation.severity));
  const manualReviewRequired = hasBlocking || missingEvidence.length > 0;
  return {
    status: hasBlocking ? 'blocked' : manualReviewRequired ? 'manual_review_required' : 'compliant',
    contract_final_allowed: !hasBlocking && !manualReviewRequired,
    payroll_final_allowed: !hasBlocking && !manualReviewRequired,
    manual_review_required: manualReviewRequired,
    company_id: explicitCompanyId || null,
    cao_key: explicitCaoKey || targetCaoKey || null,
    contract_form: contractForm || null,
    underlying_contract_form: underlyingContractForm || null,
    contract_start_date: contractStartDate,
    contract_end_date: contractEndDate,
    function_context_present: functionContextPresent,
    missing_evidence: missingEvidence,
    violations,
    warnings,
    recommended_contract_update: recommendedContractUpdate,
    cao_configuration_resolution: {
      status: caoConfigurationResolution.status,
      message: caoConfigurationResolution.message,
      selected_configuration_id: caoConfigurationResolution.config?.id || null,
      candidates: caoConfigurationResolution.candidates || []
    },
    cao_payroll_readiness: caoPayrollReadiness,
    cao_rule_registry_snapshot: caoRuleRegistrySnapshot
  };
}

function hasFixedPayPeriodHours(input) {
  return numberOrNull(input.contract_hours_per_pay_period) !== null ||
    numberOrNull(input.fixed_hours_per_pay_period) !== null;
}

function inferCallAgreementType(input) {
  const explicit = input.call_agreement_type || input.call_contract_type || null;
  if (explicit && explicit !== 'unknown') return explicit;

  const contractForm = input.contract_form || 'unknown';
  const minPayPeriod = numberOrNull(input.min_hours_per_pay_period);
  const maxPayPeriod = numberOrNull(input.max_hours_per_pay_period);
  const minWeek = numberOrNull(input.min_hours_per_week);
  const maxWeek = numberOrNull(input.max_hours_per_week);
  if ((minPayPeriod !== null && maxPayPeriod !== null) || (minWeek !== null && maxWeek !== null)) return 'min_max';
  if (input.annualized_hours_with_bandwidth === true || numberOrNull(input.annual_contract_hours) !== null) return 'annualized_bandwidth';
  if (input.no_work_no_pay_first_6_months === true) return 'no_work_no_pay_first_6_months';
  if (contractForm === 'oproep') return 'zero_hours';
  return 'not_applicable';
}

function evaluateCallAgreementRules(input) {
  const sourceRuleIds = [];
  const warnings = [];
  const violations = [];
  const payrollEntitlements = [];
  const recommendedContractUpdate = {};
  const callAgreementType = inferCallAgreementType(input);
  const contractForm = input.contract_form || 'unknown';

  const isCallAgreement = contractForm === 'oproep' ||
    ['zero_hours', 'min_max', 'annualized_bandwidth', 'no_work_no_pay_first_6_months', 'pre_agreement'].includes(callAgreementType);

  if (!isCallAgreement) {
    return {
      is_call_agreement: false,
      call_agreement_type: 'not_applicable',
      call_agreement_status: 'not_applicable',
      call_agreement_compliant: true,
      call_notice_days: null,
      employee_notice_days: null,
      source_rule_ids: [],
      warnings: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      recommended_contract_update: null,
      fixed_hours_offer: null,
      call_notice_validation: null
    };
  }

  sourceRuleIds.push('CAO-PB-2024-R0371');
  recommendedContractUpdate.is_call_agreement = true;
  recommendedContractUpdate.call_agreement_type = callAgreementType;
  recommendedContractUpdate.call_notice_days = 4;

  if (callAgreementType === 'zero_hours') {
    sourceRuleIds.push('CAO-PB-2024-R0372', 'CAO-PB-2024-R0377');
    recommendedContractUpdate.employee_notice_days = 4;
  } else if (callAgreementType === 'min_max') {
    sourceRuleIds.push('CAO-PB-2024-R0378');
    const minPayPeriod = numberOrNull(input.min_hours_per_pay_period);
    const maxPayPeriod = numberOrNull(input.max_hours_per_pay_period);
    const minWeek = numberOrNull(input.min_hours_per_week);
    const maxWeek = numberOrNull(input.max_hours_per_week);
    const hasPayPeriodBand = minPayPeriod !== null && maxPayPeriod !== null;
    const hasWeekBand = minWeek !== null && maxWeek !== null;
    if (!hasPayPeriodBand && !hasWeekBand) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0378',
        severity: 'high',
        message: 'Min-maxcontract mist minimum en maximum uren. Garantie-uren kunnen niet worden vastgesteld.'
      });
    }
    if (hasPayPeriodBand && minPayPeriod > maxPayPeriod) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0378',
        severity: 'high',
        message: `Minimum uren per loonperiode (${minPayPeriod}) zijn hoger dan maximum uren (${maxPayPeriod}).`
      });
    }
    if (hasWeekBand && minWeek > maxWeek) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0378',
        severity: 'high',
        message: `Minimum uren per week (${minWeek}) zijn hoger dan maximum uren (${maxWeek}).`
      });
    }
    if (hasPayPeriodBand || hasWeekBand) {
      payrollEntitlements.push({
        rule_id: 'CAO-PB-2024-R0378',
        type: 'guaranteed_minimum_hours',
        minimum_hours_per_pay_period: hasPayPeriodBand ? minPayPeriod : null,
        minimum_hours_per_week: hasWeekBand ? minWeek : null,
        message: 'Min-maxcontract: garantie-uren moeten altijd worden betaald, ook als niet wordt opgeroepen.'
      });
    }
  } else if (callAgreementType === 'annualized_bandwidth') {
    sourceRuleIds.push('CAO-PB-2024-R0373');
    warnings.push('Jaarurensystematiek met bandbreedte gedetecteerd. Definitieve payroll vraagt om vastgelegd maandsalaris en bandbreedte-afspraken.');
  } else if (callAgreementType === 'no_work_no_pay_first_6_months') {
    sourceRuleIds.push('CAO-PB-2024-R0374');
    warnings.push('Eerste 6 maanden alleen loon over gewerkte uren: ziekte-/loondoorbetalingsregels vragen afzonderlijke controle.');
  } else if (callAgreementType === 'pre_agreement') {
    sourceRuleIds.push('CAO-PB-2024-R0376');
    warnings.push('Voorovereenkomst: iedere geaccepteerde oproep creëert een tijdelijke arbeidsovereenkomst. Planning/payroll moet per oproep vastleggen of deze is aanvaard.');
  }

  sourceRuleIds.push('CAO-PB-2024-R0380');
  recommendedContractUpdate.payslip_call_agreement_indicator_required = true;

  const noticeValidation = validateCallNoticeAndChange(input, isCallAgreement);
  sourceRuleIds.push(...noticeValidation.source_rule_ids);
  violations.push(...noticeValidation.contract_rule_violations);
  payrollEntitlements.push(...noticeValidation.payroll_entitlements);

  const fixedHoursOffer = evaluateFixedHoursOffer(input, isCallAgreement);
  sourceRuleIds.push(...fixedHoursOffer.source_rule_ids);
  violations.push(...fixedHoursOffer.contract_rule_violations);
  payrollEntitlements.push(...fixedHoursOffer.payroll_entitlements);
  warnings.push(...fixedHoursOffer.warnings);

  const employeeFixedHoursRequest = evaluateEmployeeFixedHoursRequest(input, isCallAgreement);
  sourceRuleIds.push(...employeeFixedHoursRequest.source_rule_ids);
  violations.push(...employeeFixedHoursRequest.contract_rule_violations);
  payrollEntitlements.push(...employeeFixedHoursRequest.payroll_entitlements);
  warnings.push(...employeeFixedHoursRequest.warnings);

  const uniqueSourceRuleIds = [...new Set(sourceRuleIds)];
  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = fixedHoursOffer.manual_review_required ||
    employeeFixedHoursRequest.manual_review_required ||
    noticeValidation.manual_review_required ||
    warnings.some(w => String(w).includes('afzonderlijke controle'));

  return {
    is_call_agreement: true,
    call_agreement_type: callAgreementType,
    call_agreement_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    call_agreement_compliant: !hasBlockingViolation && !manualReviewRequired,
    call_notice_days: 4,
    employee_notice_days: callAgreementType === 'zero_hours' ? 4 : null,
    source_rule_ids: uniqueSourceRuleIds,
    warnings,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    recommended_contract_update: recommendedContractUpdate,
    fixed_hours_offer: fixedHoursOffer.fixed_hours_offer,
    employee_fixed_hours_request: employeeFixedHoursRequest.employee_fixed_hours_request,
    call_notice_validation: noticeValidation.call_notice_validation
  };
}

function validateCallNoticeAndChange(input, isCallAgreement) {
  if (!isCallAgreement) {
    return {
      source_rule_ids: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      manual_review_required: false,
      call_notice_validation: null
    };
  }

  const sourceRuleIds = [];
  const violations = [];
  const payrollEntitlements = [];
  const callCreatedAt = input.call_created_at || input.call_notified_at || null;
  const shiftStart = input.shift_start_datetime || input.original_shift_start_datetime || null;
  const noticeHours = callCreatedAt && shiftStart ? diffHours(shiftStart, callCreatedAt) : null;
  let employeeObligatedToWork = null;

  if (noticeHours !== null) {
    sourceRuleIds.push('CAO-PB-2024-R0387');
    employeeObligatedToWork = noticeHours >= 96;
    if (!employeeObligatedToWork) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0387',
        severity: 'medium',
        message: `Oproep is ${round1(noticeHours)} uur voor de dienst gedaan; medewerker is pas verplicht bij minimaal 4 dagen oproeptermijn.`,
        notice_hours: round1(noticeHours),
        required_notice_hours: 96
      });
    }
  }

  const changeType = input.call_change_type || input.call_action || null;
  const changeAt = input.call_cancelled_at || input.call_changed_at || input.call_change_datetime || null;
  const originalStart = input.original_shift_start_datetime || input.shift_start_datetime || null;
  const originalEnd = input.original_shift_end_datetime || input.shift_end_datetime || null;
  const hoursBeforeOriginalStart = changeAt && originalStart ? diffHours(originalStart, changeAt) : null;
  const isCancellationOrChange = ['cancel', 'cancelled', 'canceled', 'change', 'changed', 'partial_cancel'].includes(String(changeType || '').toLowerCase());

  if (isCancellationOrChange && hoursBeforeOriginalStart !== null) {
    sourceRuleIds.push('CAO-PB-2024-R0388');
    if (hoursBeforeOriginalStart < 96) {
      const originalHours = numberOrNull(input.original_call_hours) ?? hoursBetween(originalStart, originalEnd);
      payrollEntitlements.push({
        rule_id: 'CAO-PB-2024-R0388',
        type: 'original_call_wage_due',
        original_call_hours: originalHours,
        message: 'Oproep binnen 4 dagen ingetrokken of gewijzigd: loon volgens oorspronkelijke oproep blijft verschuldigd.'
      });
    }
  }

  return {
    source_rule_ids: [...new Set(sourceRuleIds)],
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    manual_review_required: false,
    call_notice_validation: {
      notice_hours: noticeHours === null ? null : round1(noticeHours),
      required_notice_hours: 96,
      employee_obligated_to_work: employeeObligatedToWork,
      call_change_hours_before_original_start: hoursBeforeOriginalStart === null ? null : round1(hoursBeforeOriginalStart)
    }
  };
}

function evaluateFixedHoursOffer(input, isCallAgreement) {
  if (!isCallAgreement) {
    return {
      source_rule_ids: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      warnings: [],
      manual_review_required: false,
      fixed_hours_offer: null
    };
  }

  const sourceRuleIds = ['CAO-PB-2024-R0389', 'CAO-PB-2024-R0390', 'CAO-PB-2024-R0391', 'CAO-PB-2024-R0392', 'CAO-PB-2024-R0393', 'CAO-PB-2024-R0394'];
  const warnings = [];
  const violations = [];
  const payrollEntitlements = [];
  const startDate = asIsoDate(input.contract_start_date);
  const referenceDate = asIsoDate(input.reference_date || new Date().toISOString());

  if (!startDate || !referenceDate) {
    return {
      source_rule_ids: sourceRuleIds,
      contract_rule_violations: [],
      payroll_entitlements: [],
      warnings: ['Startdatum of referentiedatum ontbreekt; 12-maanden-aanbod voor vaste arbeidsduur kan niet worden beoordeeld.'],
      manual_review_required: true,
      fixed_hours_offer: {
        status: 'manual_review_required',
        twelve_month_completed_date: null,
        offer_deadline_date: null
      }
    };
  }

  const twelveMonthCompletedDate = addCalendarMonths(startDate, 12);
  const offerDeadlineDate = addCalendarMonths(twelveMonthCompletedDate, 1);
  const offerSentAt = asIsoDate(input.fixed_hours_offer_sent_at);
  const offerAcceptedAt = asIsoDate(input.fixed_hours_offer_accepted_at);
  const acceptanceDeadlineDate = asIsoDate(input.fixed_hours_offer_acceptance_deadline_date);
  const averageHoursLast12Months = numberOrNull(input.average_hours_last_12_months);
  const due = referenceDate >= twelveMonthCompletedDate;
  const overdue = due && !offerSentAt && referenceDate > offerDeadlineDate;

  if (due && !offerSentAt) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0392',
      severity: overdue ? 'high' : 'medium',
      message: overdue
        ? `Aanbod vaste arbeidsduur had uiterlijk ${offerDeadlineDate} schriftelijk gedaan moeten zijn.`
        : `Aanbod vaste arbeidsduur is verschuldigd vanaf ${twelveMonthCompletedDate}.`
    });
  }

  if (acceptanceDeadlineDate && offerSentAt) {
    const minAcceptanceDeadline = addCalendarMonths(offerSentAt, 1);
    if (acceptanceDeadlineDate < minAcceptanceDeadline) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0393',
        severity: 'high',
        message: `Acceptatietermijn voor aanbod vaste arbeidsduur is korter dan 1 maand (${acceptanceDeadlineDate} < ${minAcceptanceDeadline}).`
      });
    }
  }

  if (overdue && averageHoursLast12Months !== null) {
    payrollEntitlements.push({
      rule_id: 'CAO-PB-2024-R0394',
      type: 'average_hours_pay_due_missing_fixed_hours_offer',
      average_hours_last_12_months: averageHoursLast12Months,
      message: 'Geen tijdig aanbod vaste arbeidsduur gedaan: werknemer krijgt automatisch recht op loon over gemiddelde arbeidsomvang van de afgelopen 12 maanden.'
    });
  } else if (overdue) {
    warnings.push('Aanbod vaste arbeidsduur is te laat, maar gemiddelde uren over de afgelopen 12 maanden ontbreken; payrollcorrectie vereist handmatige berekening.');
  }

  return {
    source_rule_ids: sourceRuleIds,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    warnings,
    manual_review_required: overdue && averageHoursLast12Months === null,
    fixed_hours_offer: {
      status: offerAcceptedAt
        ? 'accepted'
        : offerSentAt
        ? 'sent'
        : overdue
        ? 'overdue'
        : due
        ? 'due'
        : 'not_due',
      twelve_month_completed_date: twelveMonthCompletedDate,
      offer_deadline_date: offerDeadlineDate,
      offer_sent_at: offerSentAt,
      offer_accepted_at: offerAcceptedAt,
      acceptance_deadline_date: acceptanceDeadlineDate,
      average_hours_last_12_months: averageHoursLast12Months
    }
  };
}

function roundWorkedHoursForFixedHoursRequest(entry) {
  const rawHours = numberOrNull(entry.worked_hours);
  const rawMinutes = numberOrNull(entry.worked_minutes);
  if (rawHours === null && rawMinutes === null) return null;
  const totalMinutes = rawMinutes !== null
    ? rawMinutes
    : Math.round(rawHours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return remainder >= 30 ? wholeHours + 1 : wholeHours;
}

function countedPayPeriod(periodNumber) {
  const period = Number(periodNumber);
  if (!Number.isFinite(period)) return null;
  return [7, 8, 9, 13].includes(period) ? null : period;
}

function nextCountedPayPeriod(periodNumber) {
  const current = Number(periodNumber);
  if (!Number.isFinite(current)) return null;
  let next = current + 1;
  if (next > 13) next = 1;
  while ([7, 8, 9, 13].includes(next)) {
    next++;
    if (next > 13) next = 1;
  }
  return next;
}

function fixedHoursRequestEntriesAreConsecutive(previous, current) {
  const previousDate = asIsoDate(previous.week_start_date || previous.date);
  const currentDate = asIsoDate(current.week_start_date || current.date);
  const dayGap = previousDate && currentDate ? daysBetween(currentDate, previousDate) : null;
  if (dayGap !== null && dayGap === 7) return true;
  if (dayGap !== null && dayGap > 0 && dayGap <= 14 && previous.pay_period_number === current.pay_period_number) return true;

  const previousPeriod = countedPayPeriod(previous.pay_period_number);
  const currentPeriod = countedPayPeriod(current.pay_period_number);
  return previousPeriod !== null &&
    currentPeriod !== null &&
    nextCountedPayPeriod(previousPeriod) === currentPeriod;
}

function calculateFixedHoursRequestEvidence(input) {
  const entries = normalizeArray(
    input.fixed_hours_request_worked_weeks ||
    input.fixed_hours_request_weekly_evidence ||
    input.worked_weeks_evidence
  ).map((entry, index) => ({
    ...entry,
    _index: index,
    rounded_worked_hours: roundWorkedHoursForFixedHoursRequest(entry),
    pay_period_number: entry.pay_period_number ?? entry.period_number ?? null,
    contract_hours: numberOrNull(entry.contract_hours ?? input.contract_hours_per_week),
    regular_pattern: entry.regular_pattern !== false
  })).filter(entry => countedPayPeriod(entry.pay_period_number) !== null);

  if (input.fixed_hours_request_regular_13_weeks_confirmed === true) {
    const qualifyingWeeks = numberOrNull(input.fixed_hours_request_qualifying_weeks) ?? entries.length;
    return {
      status: qualifyingWeeks >= 13 ? 'eligible' : 'not_eligible',
      qualifying_weeks: qualifyingWeeks,
      longest_qualifying_run_weeks: qualifyingWeeks,
      rounded_hours_total: null,
      excluded_pay_periods: [7, 8, 9, 13],
      evidence_mode: 'owner_confirmed',
      manual_review_required: false
    };
  }

  if (entries.length === 0) {
    return {
      status: 'manual_review_required',
      qualifying_weeks: 0,
      longest_qualifying_run_weeks: 0,
      rounded_hours_total: null,
      excluded_pay_periods: [7, 8, 9, 13],
      evidence_mode: 'missing',
      manual_review_required: true
    };
  }

  const sorted = [...entries].sort((a, b) => {
    const aDate = asIsoDate(a.week_start_date || a.date) || '';
    const bDate = asIsoDate(b.week_start_date || b.date) || '';
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    return Number(a._index) - Number(b._index);
  });

  let currentRun = 0;
  let longestRun = 0;
  let previousQualified = null;
  let roundedHoursTotal = 0;

  for (const entry of sorted) {
    const qualifies = entry.regular_pattern === true &&
      entry.rounded_worked_hours !== null &&
      entry.contract_hours !== null &&
      entry.rounded_worked_hours > entry.contract_hours;

    if (qualifies) {
      roundedHoursTotal += entry.rounded_worked_hours;
      if (!previousQualified || fixedHoursRequestEntriesAreConsecutive(previousQualified, entry)) currentRun++;
      else currentRun = 1;
      longestRun = Math.max(longestRun, currentRun);
      previousQualified = entry;
    } else {
      currentRun = 0;
      previousQualified = null;
    }
  }

  return {
    status: longestRun >= 13 ? 'eligible' : 'not_eligible',
    qualifying_weeks: sorted.filter(entry =>
      entry.regular_pattern === true &&
      entry.rounded_worked_hours !== null &&
      entry.contract_hours !== null &&
      entry.rounded_worked_hours > entry.contract_hours
    ).length,
    longest_qualifying_run_weeks: longestRun,
    rounded_hours_total: roundedHoursTotal,
    excluded_pay_periods: [7, 8, 9, 13],
    evidence_mode: 'weekly_entries',
    manual_review_required: false
  };
}

function evaluateEmployeeFixedHoursRequest(input, isCallAgreement) {
  const submittedAt = asIsoDate(input.fixed_hours_request_submitted_at || input.employee_fixed_hours_request_submitted_at);
  const evidenceInput = normalizeArray(
    input.fixed_hours_request_worked_weeks ||
    input.fixed_hours_request_weekly_evidence ||
    input.worked_weeks_evidence
  );
  const hasRequestContext = !!submittedAt ||
    input.fixed_hours_request_regular_13_weeks_confirmed === true ||
    evidenceInput.length > 0;

  if (!isCallAgreement && !hasRequestContext) {
    return {
      source_rule_ids: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      warnings: [],
      manual_review_required: false,
      employee_fixed_hours_request: null
    };
  }

  const sourceRuleIds = ['CAO-PB-2024-R0396', 'CAO-PB-2024-R0397', 'CAO-PB-2024-R0398', 'CAO-PB-2024-R0399'];
  const warnings = [];
  const violations = [];
  const payrollEntitlements = [];
  const referenceDate = asIsoDate(input.reference_date || new Date().toISOString());
  const decisionSentAt = asIsoDate(input.fixed_hours_request_decision_sent_at);
  const decision = input.fixed_hours_request_decision || null;
  const requestedHours = numberOrNull(input.fixed_hours_request_requested_hours_per_pay_period);
  const decisionDeadline = submittedAt ? addDays(submittedAt, 7) : null;
  const evidence = calculateFixedHoursRequestEvidence(input);

  if (!isCallAgreement && hasRequestContext) {
    warnings.push('Verzoek vaste arbeidsduur is opgegeven buiten een oproepovereenkomstcontext; handmatige CAO-review vereist.');
  }
  if (!submittedAt && hasRequestContext) {
    warnings.push('Datum schriftelijk verzoek vaste arbeidsduur ontbreekt; reactietermijn van 1 week kan niet worden bepaald.');
  }
  if (submittedAt && evidence.status === 'manual_review_required') {
    warnings.push('Bewijs voor 13 weken regelmatig en structureel meer werken ontbreekt; handmatige review vereist.');
  }

  const eligible = evidence.status === 'eligible';
  const overdue = eligible && submittedAt && !decisionSentAt && referenceDate && referenceDate > decisionDeadline;
  const decisionTooLate = eligible && submittedAt && decisionSentAt && decisionSentAt > decisionDeadline;

  if (eligible && submittedAt && !decisionSentAt) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0399',
      severity: overdue ? 'high' : 'medium',
      message: overdue
        ? `Werkgever heeft niet binnen 1 week schriftelijk beslist op verzoek vaste arbeidsduur; deadline was ${decisionDeadline}.`
        : `Werkgever moet uiterlijk ${decisionDeadline} schriftelijk beslissen op verzoek vaste arbeidsduur.`
    });
  }

  if (decisionTooLate) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0399',
      severity: 'high',
      message: `Werkgever heeft te laat beslist op verzoek vaste arbeidsduur (${decisionSentAt} na deadline ${decisionDeadline}).`
    });
  }

  if ((overdue || decisionTooLate) && requestedHours !== null) {
    payrollEntitlements.push({
      rule_id: 'CAO-PB-2024-R0399',
      type: 'automatic_fixed_hours_adjustment_due_employee_request',
      requested_hours_per_pay_period: requestedHours,
      message: 'Niet tijdig schriftelijk beslist: arbeidsduur moet automatisch volgens aanvraag worden aangepast.'
    });
  } else if ((overdue || decisionTooLate) && requestedHours === null) {
    warnings.push('Verzoek vaste arbeidsduur is te laat beantwoord/niet beantwoord, maar aangevraagde uren ontbreken; payrollcorrectie vereist handmatige berekening.');
  }

  const manualReviewRequired = evidence.manual_review_required ||
    (!isCallAgreement && hasRequestContext) ||
    ((overdue || decisionTooLate) && requestedHours === null);

  return {
    source_rule_ids: sourceRuleIds,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    warnings,
    manual_review_required: manualReviewRequired,
    employee_fixed_hours_request: {
      status: !hasRequestContext
        ? 'not_requested'
        : manualReviewRequired
        ? 'manual_review_required'
        : payrollEntitlements.length > 0
        ? 'automatic_adjustment_due'
        : decision
        ? `decision_${decision}`
        : eligible
        ? overdue ? 'decision_overdue' : 'decision_due'
        : 'not_eligible',
      submitted_at: submittedAt,
      decision_sent_at: decisionSentAt,
      decision,
      decision_deadline_at: decisionDeadline,
      requested_hours_per_pay_period: requestedHours,
      evidence
    }
  };
}

function inferInternshipType(input) {
  const explicit = input.internship_type || input.stage_type || input.internship_source || null;
  if (explicit && explicit !== 'unknown') return explicit;
  if (input.uwv_trial_placement === true) return 'uwv_trial_placement';
  if (input.reintegration_measure === true) return 'reintegration_measure';
  if (input.second_track_reintegration === true) return 'second_track_reintegration';
  if (input.bol_internship === true) return 'bol';
  if (input.contract_form === 'stage') return 'unknown';
  return 'not_applicable';
}

function addMissingInternshipEvidence(target, condition, ruleId, message, field) {
  if (condition) return;
  target.push({
    rule_id: ruleId,
    field,
    message
  });
}

function evaluateInternshipContractRules(input) {
  const internshipType = inferInternshipType(input);
  const isInternship = input.contract_form === 'stage' ||
    !['not_applicable', null, undefined].includes(internshipType);

  if (!isInternship) {
    return {
      is_internship: false,
      internship_type: 'not_applicable',
      internship_rule_status: 'not_applicable',
      internship_compliant: true,
      manual_review_required: false,
      source_rule_ids: [],
      warnings: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      recommended_contract_update: null,
      internship_rule_profile: null
    };
  }

  const sourceRuleIds = [
    'CAO-PB-2024-R0401', 'CAO-PB-2024-R0402', 'CAO-PB-2024-R0403',
    'CAO-PB-2024-R0404', 'CAO-PB-2024-R0405', 'CAO-PB-2024-R0407',
    'CAO-PB-2024-R0408', 'CAO-PB-2024-R0409', 'CAO-PB-2024-R0410',
    'CAO-PB-2024-R0411', 'CAO-PB-2024-R0412', 'CAO-PB-2024-R0414',
    'CAO-PB-2024-R0415', 'CAO-PB-2024-R0417', 'CAO-PB-2024-R0418',
    'CAO-PB-2024-R0419', 'CAO-PB-2024-R0420', 'CAO-PB-2024-R0421',
    'CAO-PB-2024-R0422'
  ];
  const warnings = [];
  const violations = [];
  const payrollEntitlements = [];
  const missingEvidence = [];
  const duration = calculateContractDurationBoundaryForMonths(input.contract_start_date, input.contract_end_date, 2);

  if (input.contract_form !== 'stage') {
    violations.push({
      rule_id: 'CAO-PB-2024-R0414',
      severity: 'high',
      message: 'Stagecontext is opgegeven, maar contract_form is geen stage. Een stagiair krijgt volgens de CAO een stage-overeenkomst, geen arbeidsovereenkomst.'
    });
  }

  if (booleanOrNull(input.internship_has_employment_contract) === true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0414',
      severity: 'high',
      message: 'Stagiair is gemarkeerd met een arbeidsovereenkomst; artikel 14 schrijft een stage-overeenkomst voor.'
    });
  }

  if (internshipType === 'unknown') {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0402',
      field: 'internship_type',
      message: 'Type stage ontbreekt: BOL, UWV-proefplaatsing, reintegratiemaatregel of tweede spoor moet worden vastgelegd.'
    });
  }

  if (internshipType === 'uwv_trial_placement') {
    if (duration.warning) {
      warnings.push(`UWV-proefplaatsing: ${duration.warning}`);
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0403',
        field: 'contract_start_date/contract_end_date',
        message: 'Start- en einddatum zijn nodig om de maximale UWV-proefplaatsing van 2 maanden te controleren.'
      });
    } else if (duration.exceeds_boundary === true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0403',
        severity: 'high',
        message: `UWV-proefplaatsing duurt langer dan maximaal 2 maanden. Laatste toegestane dag is ${duration.exact_last_day}.`,
        contract_duration_months: duration.contract_duration_months,
        max_duration_months: 2,
        two_month_boundary_date: duration.boundary_date,
        two_month_exact_last_day: duration.exact_last_day
      });
    }
  }

  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_supervision_confirmed) === true,
    'CAO-PB-2024-R0401',
    'Bevestig dat de stagiair onder begeleiding relevante praktijkervaring opdoet.',
    'internship_supervision_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_relevant_practical_experience_confirmed) === true,
    'CAO-PB-2024-R0401',
    'Bevestig dat de stage relevante praktijkervaring als beveiliger betreft.',
    'internship_relevant_practical_experience_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_above_strength_confirmed) === true,
    'CAO-PB-2024-R0407',
    'Bevestig dat de stagiair boven de sterkte wordt ingezet en niet in plaats van een gediplomeerde beveiliger.',
    'internship_above_strength_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_not_customer_billed_confirmed) === true,
    'CAO-PB-2024-R0408',
    'Bevestig dat de stagiair niet aan de klant wordt doorberekend.',
    'internship_not_customer_billed_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_rostered_confirmed) === true,
    'CAO-PB-2024-R0409',
    'Bevestig dat de stagiair in het rooster wordt opgenomen.',
    'internship_rostered_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    !!(input.internship_practice_trainer_personnel_id || input.internship_mentor_personnel_id || input.internship_mentor_name),
    'CAO-PB-2024-R0410',
    'Leg per stagiair een praktijkopleider/mentor vast.',
    'internship_practice_trainer_personnel_id'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_one_to_one_guidance_confirmed) === true,
    'CAO-PB-2024-R0411',
    'Bevestig 1-op-1 begeleiding: per dag evenveel stagiairs als praktijkopleiders.',
    'internship_one_to_one_guidance_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_uniform_label_confirmed) === true,
    'CAO-PB-2024-R0412',
    'Bevestig dat de stagiair herkenbaar is als stagiair op het uniform.',
    'internship_uniform_label_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_agreement_with_institution_confirmed) === true,
    'CAO-PB-2024-R0415',
    'Bevestig dat de stage-overeenkomst ook met onderwijsinstelling of re-integratie-instelling is gesloten.',
    'internship_agreement_with_institution_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    !!input.contract_start_date && !!input.contract_end_date,
    'CAO-PB-2024-R0417',
    'Leg begin- en einddatum van de stage vast.',
    'contract_start_date/contract_end_date'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    !!input.internship_assignment_description,
    'CAO-PB-2024-R0418',
    'Leg vast welke werkzaamheden voor de stage-opdracht worden gedaan.',
    'internship_assignment_description'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    !!(input.internship_mentor_personnel_id || input.internship_mentor_name || input.internship_practice_trainer_personnel_id),
    'CAO-PB-2024-R0419',
    'Leg vast wie de mentor is.',
    'internship_mentor_personnel_id'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_working_times_documented) === true,
    'CAO-PB-2024-R0420',
    'Leg de werktijden in de stage-overeenkomst vast.',
    'internship_working_times_documented'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_evaluation_agreement_documented) === true,
    'CAO-PB-2024-R0421',
    'Leg vast wanneer en hoe de stage wordt geevalueerd.',
    'internship_evaluation_agreement_documented'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.internship_compensation_documented) === true,
    'CAO-PB-2024-R0422',
    'Leg vast of een stagevergoeding geldt en zo ja hoe hoog die is.',
    'internship_compensation_documented'
  );

  if (booleanOrNull(input.internship_compensation_applies) === true) {
    const compensationAmount = numberOrNull(input.internship_compensation_amount);
    if (compensationAmount === null) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0422',
        field: 'internship_compensation_amount',
        message: 'Stagevergoeding is van toepassing, maar de hoogte is niet vastgelegd.'
      });
    } else {
      payrollEntitlements.push({
        rule_id: 'CAO-PB-2024-R0422',
        type: 'internship_compensation_due_if_agreed',
        amount: compensationAmount,
        message: 'Stagevergoeding is contractueel vastgelegd en moet volgens de stage-overeenkomst worden meegenomen.'
      });
    }
  }

  if (booleanOrNull(input.internship_counts_toward_required_staffing) === true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0407',
      severity: 'high',
      field: 'internship_counts_toward_required_staffing',
      message: 'Stagiair mag niet in plaats van een gediplomeerde beveiliger worden ingezet.'
    });
  }
  if (booleanOrNull(input.internship_customer_billed) === true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0408',
      severity: 'high',
      field: 'internship_customer_billed',
      message: 'Stagiair mag niet aan de klant worden doorberekend.'
    });
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    is_internship: true,
    internship_type: internshipType,
    internship_rule_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    internship_compliant: !hasBlockingViolation && !manualReviewRequired,
    manual_review_required: manualReviewRequired,
    source_rule_ids: [...new Set(sourceRuleIds)],
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    recommended_contract_update: {
      internship_type: internshipType,
      internship_roster_required: true,
      internship_only_chapter_3_applies: true,
      internship_has_employment_contract: false
    },
    internship_rule_profile: {
      apply_only_chapter_3: true,
      apply_wage_scales: false,
      apply_chapter_4_allowances: false,
      apply_chapter_5_reimbursements: false,
      must_be_rostered: true,
      must_be_above_strength: true,
      customer_billing_allowed: false,
      one_to_one_guidance_required: true,
      visible_as_intern_required: true
    },
    duration_check: {
      contract_duration_months: duration.contract_duration_months,
      max_duration_months: internshipType === 'uwv_trial_placement' ? 2 : null,
      two_month_boundary_date: internshipType === 'uwv_trial_placement' ? duration.boundary_date : null,
      two_month_exact_last_day: internshipType === 'uwv_trial_placement' ? duration.exact_last_day : null,
      exceeds_two_months: internshipType === 'uwv_trial_placement' ? duration.exceeds_boundary : null
    }
  };
}

function inferHiredWorkerType(input) {
  const explicit = input.hired_worker_type || input.external_worker_type || null;
  if (explicit && explicit !== 'unknown') return explicit;
  if (input.contract_form === 'uitzend') return 'agency_worker';
  if (input.contract_form === 'payroll') return 'payroll_worker';
  if (input.is_agency_worker === true) return 'agency_worker';
  if (input.is_payroll_worker === true) return 'payroll_worker';
  return 'not_applicable';
}

function evaluateHiredWorkerContractRules(input) {
  const hiredWorkerType = inferHiredWorkerType(input);
  const isHiredWorker = ['agency_worker', 'payroll_worker'].includes(hiredWorkerType);

  if (!isHiredWorker) {
    return {
      is_hired_worker: false,
      hired_worker_type: 'not_applicable',
      hired_worker_rule_status: 'not_applicable',
      hired_worker_compliant: true,
      manual_review_required: false,
      source_rule_ids: [],
      warnings: [],
      missing_evidence: [],
      contract_rule_violations: [],
      payroll_entitlements: [],
      recommended_contract_update: null,
      hired_worker_rule_profile: null
    };
  }

  const sourceRuleIds = [
    'CAO-PB-2024-R0423', 'CAO-PB-2024-R0424', 'CAO-PB-2024-R0425',
    'CAO-PB-2024-R0426', 'CAO-PB-2024-R0427', 'CAO-PB-2024-R0428',
    'CAO-PB-2024-R0429', 'CAO-PB-2024-R0430', 'CAO-PB-2024-R0431',
    'CAO-PB-2024-R0432', 'CAO-PB-2024-R0433', 'CAO-PB-2024-R0434',
    'CAO-PB-2024-R0435', 'CAO-PB-2024-R0436', 'CAO-PB-2024-R0437',
    'CAO-PB-2024-R0438'
  ];
  const warnings = [];
  const missingEvidence = [];
  const violations = [];
  const payrollEntitlements = [];

  if (input.contract_form === 'uitzend' && hiredWorkerType !== 'agency_worker') {
    violations.push({
      rule_id: 'CAO-PB-2024-R0424',
      severity: 'high',
      message: `Contractvorm uitzend is gecombineerd met hired_worker_type=${hiredWorkerType}. Dit moet agency_worker zijn.`
    });
  }
  if (input.contract_form === 'payroll' && hiredWorkerType !== 'payroll_worker') {
    violations.push({
      rule_id: 'CAO-PB-2024-R0435',
      severity: 'high',
      message: `Contractvorm payroll is gecombineerd met hired_worker_type=${hiredWorkerType}. Dit moet payroll_worker zijn.`
    });
  }

  const equalFunctionEvidence = !!(
    input.hired_worker_equal_function_reference_contract_id ||
    input.hired_worker_equal_function_reference_personnel_id ||
    input.hired_worker_equal_function_description ||
    input.cao_function_group ||
    input.cao_function_level ||
    input.cao_scale ||
    input.cao_period
  );

  if (hiredWorkerType === 'agency_worker') {
    addMissingInternshipEvidence(
      missingEvidence,
      booleanOrNull(input.hired_worker_inlenersbeloning_confirmed) === true,
      'CAO-PB-2024-R0424',
      'Bevestig dat de uitzendkracht vanaf de eerste werkdag de inlenersbeloning ontvangt.',
      'hired_worker_inlenersbeloning_confirmed'
    );
  }

  if (hiredWorkerType === 'payroll_worker') {
    addMissingInternshipEvidence(
      missingEvidence,
      booleanOrNull(input.hired_worker_equal_conditions_confirmed) === true,
      'CAO-PB-2024-R0435',
      'Bevestig dat de payroller vanaf de eerste werkdag dezelfde arbeidsvoorwaarden krijgt als werknemers in gelijke/gelijkwaardige functie.',
      'hired_worker_equal_conditions_confirmed'
    );
  }

  addMissingInternshipEvidence(
    missingEvidence,
    equalFunctionEvidence,
    hiredWorkerType === 'payroll_worker' ? 'CAO-PB-2024-R0435' : 'CAO-PB-2024-R0425',
    'Leg de gelijke/gelijkwaardige functie of schaal/periodiek vast waarmee inlenersbeloning wordt bepaald.',
    'hired_worker_equal_function_reference_contract_id'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_salary_scale_period_confirmed) === true,
    'CAO-PB-2024-R0425',
    'Bevestig de toepasselijke schaalperiode voor de ingehuurde arbeidskracht.',
    'hired_worker_salary_scale_period_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_allowances_confirmed) === true,
    'CAO-PB-2024-R0426',
    'Bevestig dat overwerk-, verschoven uren-, bijzondere uren- en feestdagentoeslagen worden toegepast.',
    'hired_worker_allowances_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_consignation_allowance_confirmed) === true,
    'CAO-PB-2024-R0427',
    'Bevestig dat consignatietoeslagen worden toegepast als consignatiedienst voorkomt.',
    'hired_worker_consignation_allowance_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_wage_increases_confirmed) === true,
    'CAO-PB-2024-R0428',
    'Bevestig dat cao-loonsverhogingen voor de ingehuurde arbeidskracht worden toegepast.',
    'hired_worker_wage_increases_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_periodics_confirmed) === true,
    'CAO-PB-2024-R0429',
    'Bevestig dat periodieken volgens de cao-salarisschalen worden toegepast.',
    'hired_worker_periodics_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_one_off_payments_confirmed) === true,
    'CAO-PB-2024-R0430',
    'Bevestig dat eenmalige uitkeringen bij overeengekomen loonsverhogingen worden toegepast wanneer de arbeidskracht op ingangsdatum in dienst is bij het uitzendbureau.',
    'hired_worker_one_off_payments_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_year_end_bonus_confirmed) === true,
    'CAO-PB-2024-R0431',
    'Bevestig vaste eenmalige uitkeringen/eindejaarsuitkering met grondslag basisuurloon plus vakantiebijslag.',
    'hired_worker_year_end_bonus_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_reimbursements_confirmed) === true,
    'CAO-PB-2024-R0432',
    'Bevestig kostenvergoedingen die vrij van loonheffing/premies kunnen worden betaald.',
    'hired_worker_reimbursements_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_travel_reimbursement_confirmed) === true,
    'CAO-PB-2024-R0433',
    'Bevestig reiskosten/reisvergoeding voor de ingehuurde arbeidskracht.',
    'hired_worker_travel_reimbursement_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_function_costs_confirmed) === true,
    'CAO-PB-2024-R0434',
    'Bevestig andere noodzakelijke kosten voor goede functie-uitvoering.',
    'hired_worker_function_costs_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_external_employer_pays_wages_confirmed) === true,
    'CAO-PB-2024-R0436',
    'Bevestig dat uitzendbureau/payrollonderneming loon en vergoedingen volgens de cao betaalt.',
    'hired_worker_external_employer_pays_wages_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_hirer_verification_confirmed) === true,
    'CAO-PB-2024-R0436',
    'Bevestig dat de inlenende werkgever zich ervan heeft verzekerd dat loon, vergoedingen en arbeidstijdregels juist worden toegepast.',
    'hired_worker_hirer_verification_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_working_time_rules_confirmed) === true,
    'CAO-PB-2024-R0437',
    'Bevestig toepassing van algemene arbeids- en rusttijden voor uitzendkracht/payroller.',
    'hired_worker_working_time_rules_confirmed'
  );
  addMissingInternshipEvidence(
    missingEvidence,
    booleanOrNull(input.hired_worker_roster_rules_confirmed) === true,
    'CAO-PB-2024-R0438',
    'Bevestig toepassing van overwerk, rusttijden, nachtdiensten, pauzes, vakantie, feestdagen en aanvullende roosterregels uit hoofdstuk 3.',
    'hired_worker_roster_rules_confirmed'
  );

  if (booleanOrNull(input.hired_worker_paid_below_inlenersbeloning) === true) {
    violations.push({
      rule_id: hiredWorkerType === 'payroll_worker' ? 'CAO-PB-2024-R0435' : 'CAO-PB-2024-R0424',
      severity: 'high',
      message: 'Ingehuurde arbeidskracht is gemarkeerd als betaald onder inlenersbeloning/equivalente arbeidsvoorwaarden.'
    });
  }

  payrollEntitlements.push({
    rule_id: hiredWorkerType === 'payroll_worker' ? 'CAO-PB-2024-R0435' : 'CAO-PB-2024-R0424',
    type: hiredWorkerType === 'payroll_worker'
      ? 'payroll_worker_equal_employment_conditions_due_from_day_one'
      : 'agency_worker_hirer_reward_due_from_day_one',
    message: hiredWorkerType === 'payroll_worker'
      ? 'Payroller: vanaf eerste werkdag dezelfde arbeidsvoorwaarden als werknemers in gelijke/gelijkwaardige functie.'
      : 'Uitzendkracht: vanaf eerste werkdag inlenersbeloning.'
  });

  warnings.push('Artikel 15: de inlener betaalt niet zelf per se het loon, maar moet wel kunnen bewijzen dat uitzendbureau/payrollonderneming de CAO-beloning, vergoedingen en arbeidstijdregels toepast.');

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    is_hired_worker: true,
    hired_worker_type: hiredWorkerType,
    hired_worker_rule_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    hired_worker_compliant: !hasBlockingViolation && !manualReviewRequired,
    manual_review_required: manualReviewRequired,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    recommended_contract_update: {
      hired_worker_type: hiredWorkerType,
      hired_worker_inlenersbeloning_required: hiredWorkerType === 'agency_worker',
      hired_worker_equal_conditions_required: hiredWorkerType === 'payroll_worker',
      hired_worker_agency_or_payroll_pays_wages: true,
      hired_worker_hirer_must_verify_payment: true,
      hired_worker_chapter_3_rules_apply: true
    },
    hired_worker_rule_profile: {
      apply_from_first_workday: true,
      apply_hirer_reward: hiredWorkerType === 'agency_worker',
      apply_equal_employment_conditions: hiredWorkerType === 'payroll_worker',
      apply_cao_scale_period: true,
      apply_overtime_shift_special_hours_holiday_allowances: true,
      apply_consignation_allowance: true,
      apply_initial_wage_increases: true,
      apply_periodics: true,
      apply_one_off_wage_increase_payments_if_employed_at_effective_date: true,
      apply_year_end_bonus_basis_hourly_wage_plus_vacation_allowance: true,
      apply_reimbursements: true,
      apply_travel_reimbursement: true,
      apply_other_function_costs: true,
      external_employer_pays_wages_and_reimbursements: true,
      hirer_must_verify_compliance: true,
      apply_general_working_and_rest_times: true,
      apply_chapter_3_roster_rules: true
    }
  };
}

function normalizeContractModel(value) {
  const normalized = String(value || '').toLowerCase();
  const aliases = {
    fulltime: 'fulltime',
    full_time: 'fulltime',
    voltijd: 'fulltime',
    parttime_fixed: 'parttime_fixed',
    parttime_vast: 'parttime_fixed',
    vast_model: 'parttime_fixed',
    fixed: 'parttime_fixed',
    parttime_growth: 'parttime_growth',
    parttime_groei: 'parttime_growth',
    groeimodel: 'parttime_growth',
    growth: 'parttime_growth',
    oproep: 'call_agreement',
    call: 'call_agreement',
    zero_hours: 'call_agreement',
    min_max: 'call_agreement',
    stage: 'internship',
    internship: 'internship',
    uitzend: 'hired_worker',
    payroll: 'hired_worker',
    zzp: 'zzp'
  };
  return aliases[normalized] || null;
}

function resolveContractHoursPerPayPeriod(input) {
  const periodHours = numberOrNull(input.contract_hours_per_pay_period) ??
    numberOrNull(input.fixed_hours_per_pay_period);
  if (periodHours !== null) {
    return { hours: periodHours, source: 'contract_hours_per_pay_period' };
  }

  const weeklyHours = numberOrNull(input.contract_hours_per_week);
  if (weeklyHours !== null) {
    return {
      hours: Math.round(weeklyHours * 4 * 100) / 100,
      source: 'contract_hours_per_week_x4',
      contract_hours_per_week: weeklyHours
    };
  }

  return { hours: null, source: 'missing' };
}

function evaluateEmploymentContractModelRules(input, callAgreement, internship, hiredWorker) {
  const sourceRuleIds = [
    'CAO-PB-2024-R0309', 'CAO-PB-2024-R0310',
    'CAO-PB-2024-R0337', 'CAO-PB-2024-R0339',
    'CAO-PB-2024-R0342', 'CAO-PB-2024-R0343',
    'CAO-PB-2024-R0345', 'CAO-PB-2024-R0347',
    'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359'
  ];
  const warnings = [];
  const violations = [];
  const missingEvidence = [];
  const recommendedContractUpdate = {};
  const contractForm = input.contract_form || 'unknown';
  const explicitModel = normalizeContractModel(
    input.employment_contract_model ||
    input.contract_model ||
    input.parttime_contract_model ||
    input.contract_type
  );
  const hoursInfo = resolveContractHoursPerPayPeriod(input);
  const hours = hoursInfo.hours;
  const isCall = callAgreement?.is_call_agreement === true || contractForm === 'oproep';
  const isInternship = internship?.is_internship === true || contractForm === 'stage';
  const isHiredWorker = hiredWorker?.is_hired_worker === true || ['uitzend', 'payroll'].includes(contractForm);

  let model = explicitModel;
  if (!model) {
    if (isCall) model = 'call_agreement';
    else if (isInternship) model = 'internship';
    else if (isHiredWorker) model = 'hired_worker';
    else if (contractForm === 'zzp') model = 'zzp';
    else if (hours === 144) model = 'fulltime';
    else if (hours !== null && hours < 144) model = null;
    else model = 'unknown';
  }

  if (!['bepaalde_tijd', 'onbepaalde_tijd', 'oproep', 'stage', 'uitzend', 'payroll', 'zzp'].includes(contractForm)) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0310',
      field: 'contract_form',
      message: 'Contractvorm ontbreekt of is onbekend; arbeidsovereenkomst voor bepaalde/onbepaalde tijd of bijzondere contractvorm moet expliciet zijn.'
    });
  }

  if (model === 'call_agreement' || model === 'internship' || model === 'hired_worker' || model === 'zzp') {
    recommendedContractUpdate.employment_contract_model = model;
    return {
      employment_contract_model: model,
      parttime_contract_model: 'not_applicable',
      contract_hours_per_pay_period_resolved: hours,
      contract_hours_source: hoursInfo.source,
      employment_contract_model_status: missingEvidence.length > 0 ? 'manual_review_required' : 'not_applicable',
      employment_contract_model_compliant: missingEvidence.length === 0,
      source_rule_ids: [...new Set(sourceRuleIds)],
      warnings,
      missing_evidence: missingEvidence,
      contract_rule_violations: violations,
      payroll_entitlements: [],
      manual_review_required: missingEvidence.length > 0,
      recommended_contract_update: recommendedContractUpdate
    };
  }

  if (hours === null) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0337',
      field: 'contract_hours_per_pay_period',
      message: 'Contractuele arbeidsduur per loonperiode ontbreekt; fulltime/parttime-model kan niet definitief worden bepaald.'
    });
  } else {
    recommendedContractUpdate.contract_hours_per_pay_period = hours;
  }

  if (hours !== null && hours > 144) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0337',
      severity: 'high',
      message: `Contractuele arbeidsduur is ${hours} uur per loonperiode; fulltime is 144 uur. Hogere uren moeten via meeruren/overuren of aparte CAO-review lopen.`,
      contract_hours_per_pay_period: hours,
      fulltime_hours_per_pay_period: 144
    });
  }

  if (model === 'fulltime') {
    if (hours !== null && hours !== 144) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0337',
        severity: 'high',
        message: `Contract is als fulltime gemarkeerd, maar arbeidsduur is ${hours} uur per loonperiode in plaats van 144.`,
        contract_hours_per_pay_period: hours,
        required_hours_per_pay_period: 144
      });
    }
    recommendedContractUpdate.employment_contract_model = 'fulltime';
  } else if (model === 'parttime_fixed' || model === 'parttime_growth' || (hours !== null && hours < 144)) {
    if (hours !== null && hours >= 144) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0342',
        severity: 'high',
        message: `Parttime arbeidsovereenkomst moet minder dan 144 uur per loonperiode zijn; opgegeven: ${hours}.`,
        contract_hours_per_pay_period: hours
      });
    }

    const parttimeModel = model === 'parttime_fixed' || model === 'parttime_growth' ? model : null;
    if (!parttimeModel) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0347',
        field: 'employment_contract_model',
        message: 'Parttime arbeidsovereenkomst moet bij sluiten expliciet vast model of groeimodel zijn.'
      });
    } else {
      recommendedContractUpdate.employment_contract_model = parttimeModel;
      recommendedContractUpdate.parttime_contract_model = parttimeModel === 'parttime_fixed' ? 'fixed' : 'growth';
    }

    if (parttimeModel === 'parttime_fixed' && hours === null) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0358',
        field: 'fixed_hours_per_pay_period',
        message: 'Parttime vast model vereist een vast aantal uren per loonperiode in de arbeidsovereenkomst.'
      });
    }

    const maxHours = numberOrNull(input.max_hours_per_pay_period);
    if (parttimeModel === 'parttime_growth' && maxHours !== null && maxHours > 144) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0345',
        severity: 'high',
        message: `Groeimodel mag werknemer niet verplichten boven fulltime arbeidsduur te werken (${maxHours} > 144 uur per loonperiode).`,
        max_hours_per_pay_period: maxHours,
        fulltime_hours_per_pay_period: 144
      });
    }
  } else if (model === 'unknown') {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0337',
      field: 'employment_contract_model',
      message: 'Arbeidsovereenkomstmodel onbekend; kies fulltime, parttime vast, parttime groeimodel of oproep.'
    });
  } else if (model) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0347',
      field: 'employment_contract_model',
      message: `Arbeidsovereenkomstmodel "${model}" wordt niet herkend voor reguliere CAO PB contractvalidatie.`
    });
  }

  if (hoursInfo.source === 'contract_hours_per_week_x4') {
    warnings.push('Arbeidsduur per loonperiode is afgeleid uit contract_hours_per_week x 4; leg bij voorkeur contract_hours_per_pay_period expliciet vast.');
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    employment_contract_model: model || (hours !== null && hours < 144 ? 'parttime_unknown_model' : 'unknown'),
    parttime_contract_model: model === 'parttime_fixed'
      ? 'fixed'
      : model === 'parttime_growth'
      ? 'growth'
      : hours !== null && hours < 144
      ? 'unknown'
      : 'not_applicable',
    contract_hours_per_pay_period_resolved: hours,
    contract_hours_source: hoursInfo.source,
    fulltime_hours_per_pay_period: 144,
    fulltime_hours_per_week: 36,
    employment_contract_model_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    employment_contract_model_compliant: !hasBlockingViolation && !manualReviewRequired,
    source_rule_ids: [...new Set(sourceRuleIds)],
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: [],
    manual_review_required: manualReviewRequired,
    recommended_contract_update: recommendedContractUpdate
  };
}

function evaluateParttimeWorkloadChangeRules(input, employmentContractModel) {
  const sourceRuleIds = [
    'CAO-PB-2024-R0349', 'CAO-PB-2024-R0350', 'CAO-PB-2024-R0351',
    'CAO-PB-2024-R0352', 'CAO-PB-2024-R0353', 'CAO-PB-2024-R0354',
    'CAO-PB-2024-R0355', 'CAO-PB-2024-R0356', 'CAO-PB-2024-R0357',
    'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359', 'CAO-PB-2024-R0360',
    'CAO-PB-2024-R0361', 'CAO-PB-2024-R0362', 'CAO-PB-2024-R0363',
    'CAO-PB-2024-R0364', 'CAO-PB-2024-R0365', 'CAO-PB-2024-R0367',
    'CAO-PB-2024-R0368', 'CAO-PB-2024-R0369'
  ];
  const warnings = [];
  const violations = [];
  const missingEvidence = [];
  const payrollEntitlements = [];
  const recommendedContractUpdate = {};
  const model = employmentContractModel?.employment_contract_model || 'unknown';
  const parttimeModel = employmentContractModel?.parttime_contract_model || 'unknown';
  const isParttime = ['parttime_fixed', 'parttime_growth', 'parttime_unknown_model'].includes(model) ||
    ['fixed', 'growth', 'unknown'].includes(parttimeModel);
  const isFulltime = model === 'fulltime';
  const currentHours = employmentContractModel?.contract_hours_per_pay_period_resolved ?? resolveContractHoursPerPayPeriod(input).hours;
  const referenceDate = asIsoDate(input.reference_date || new Date().toISOString());

  const requestedParttimeModel = normalizeContractModel(
    input.requested_parttime_contract_model ||
    input.parttime_model_change_requested_model
  );
  const parttimeModelChangeRequestedAt = asIsoDate(input.parttime_model_change_requested_at);
  const parttimeModelChangeEffectiveDate = asIsoDate(input.parttime_model_change_effective_date);
  const parttimeModelChangePayPeriod = numberOrNull(input.parttime_model_change_effective_pay_period_number);
  const hasParttimeModelChangeContext = !!(
    requestedParttimeModel ||
    parttimeModelChangeRequestedAt ||
    parttimeModelChangeEffectiveDate ||
    parttimeModelChangePayPeriod !== null ||
    input.parttime_model_change_decision
  );
  let parttimeModelChange = null;
  if (hasParttimeModelChangeContext) {
    parttimeModelChange = {
      requested_at: parttimeModelChangeRequestedAt,
      effective_date: parttimeModelChangeEffectiveDate,
      effective_pay_period_number: parttimeModelChangePayPeriod,
      requested_parttime_contract_model: requestedParttimeModel,
      decision: input.parttime_model_change_decision || null,
      rejection_reason: input.parttime_model_change_rejection_reason || null,
      weighty_business_reason_confirmed: booleanOrNull(input.parttime_model_change_weighty_business_reason_confirmed)
    };

    if (!isParttime) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0349',
        field: 'employment_contract_model',
        message: 'Parttime modelwijziging is opgegeven, maar contract is niet aantoonbaar parttime.'
      });
    }
    if (!requestedParttimeModel || !['parttime_fixed', 'parttime_growth'].includes(requestedParttimeModel)) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0349',
        field: 'requested_parttime_contract_model',
        message: 'Geef aan of werknemer naar parttime vast model of groeimodel wil wijzigen.'
      });
    }
    if (!parttimeModelChangeRequestedAt || !parttimeModelChangeEffectiveDate) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0351',
        field: 'parttime_model_change_requested_at/parttime_model_change_effective_date',
        message: 'Voor parttime modelwijziging zijn aanvraagdatum en gewenste ingangsdatum nodig.'
      });
    } else {
      const earliestEffectiveDate = addCalendarMonths(parttimeModelChangeRequestedAt, 1);
      parttimeModelChange.earliest_effective_date = earliestEffectiveDate;
      if (parttimeModelChangeEffectiveDate < earliestEffectiveDate) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0351',
          severity: 'high',
          message: `Parttime modelwijziging is minder dan 1 maand vooraf aangekondigd (${parttimeModelChangeRequestedAt} -> ${parttimeModelChangeEffectiveDate}).`,
          requested_at: parttimeModelChangeRequestedAt,
          effective_date: parttimeModelChangeEffectiveDate,
          earliest_effective_date: earliestEffectiveDate
        });
      }
    }

    if (model === 'parttime_growth' && requestedParttimeModel === 'parttime_fixed') {
      if (parttimeModelChangePayPeriod === null) {
        missingEvidence.push({
          rule_id: 'CAO-PB-2024-R0350',
          field: 'parttime_model_change_effective_pay_period_number',
          message: 'Wijziging van groeimodel naar vast model mag alleen per loonperiode 1 of 7; loonperiode ontbreekt.'
        });
      } else if (![1, 7].includes(parttimeModelChangePayPeriod)) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0350',
          severity: 'high',
          message: `Wijziging van groeimodel naar vast model mag alleen per loonperiode 1 of 7; opgegeven loonperiode ${parttimeModelChangePayPeriod}.`,
          effective_pay_period_number: parttimeModelChangePayPeriod
        });
      }
    }

    if (input.parttime_model_change_decision === 'rejected') {
      if (!input.parttime_model_change_rejection_reason || booleanOrNull(input.parttime_model_change_weighty_business_reason_confirmed) !== true) {
        missingEvidence.push({
          rule_id: 'CAO-PB-2024-R0353',
          field: 'parttime_model_change_rejection_reason',
          message: 'Afwijzing van parttime modelkeuze vereist zwaarwegend organisatorisch/bedrijfsbelang en schriftelijke toelichting.'
        });
      }
      warnings.push('Bij afwijzing van parttime modelkeuze moet werkgever het verzoek zo snel mogelijk alsnog accepteren zodra de zwaarwegende reden vervalt.');
    } else if (input.parttime_model_change_decision === 'approved' && requestedParttimeModel) {
      recommendedContractUpdate.employment_contract_model = requestedParttimeModel;
      recommendedContractUpdate.parttime_contract_model = requestedParttimeModel === 'parttime_fixed' ? 'fixed' : 'growth';
    }
  }

  const temporaryExtraHoursAgreed = booleanOrNull(input.temporary_extra_hours_agreed);
  const hasTemporaryExtraHoursContext = temporaryExtraHoursAgreed === true ||
    !!(input.temporary_extra_hours_start_date || input.temporary_extra_hours_end_date || input.temporary_extra_hours_per_pay_period);
  let temporaryExtraHours = null;
  if (hasTemporaryExtraHoursContext) {
    const start = asIsoDate(input.temporary_extra_hours_start_date);
    const end = asIsoDate(input.temporary_extra_hours_end_date);
    const hours = numberOrNull(input.temporary_extra_hours_per_pay_period);
    temporaryExtraHours = {
      agreed: temporaryExtraHoursAgreed === true,
      start_date: start,
      end_date: end,
      temporary_extra_hours_per_pay_period: hours
    };
    if (!isParttime) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0359',
        field: 'employment_contract_model',
        message: 'Tijdelijke extra uren zijn opgegeven, maar contract is niet aantoonbaar parttime.'
      });
    }
    if (temporaryExtraHoursAgreed !== true || !start || !end || hours === null) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0359',
        field: 'temporary_extra_hours_agreed/start/end/hours',
        message: 'Leg voor tijdelijke extra parttime uren vast dat dit is afgesproken, voor welke periode en hoeveel uren per loonperiode.'
      });
    } else {
      payrollEntitlements.push({
        rule_id: 'CAO-PB-2024-R0359',
        type: 'temporary_extra_parttime_hours_agreed',
        temporary_extra_hours_per_pay_period: hours,
        start_date: start,
        end_date: end,
        message: 'Parttimer mag tijdelijk meer werken dan vaste contracturen; payroll moet deze extra uren in de afgesproken periode meenemen zonder contracturen structureel te wijzigen.'
      });
    }
  }

  const parttimeHoursRequestSubmittedAt = asIsoDate(
    input.parttime_contract_hours_adjustment_requested_at ||
    input.parttime_hours_request_submitted_at
  );
  const hasParttimeHoursRequestContext = !!(
    parttimeHoursRequestSubmittedAt ||
    input.parttime_hours_request_regular_13_weeks_confirmed === true ||
    normalizeArray(input.parttime_hours_request_worked_weeks || input.parttime_hours_request_weekly_evidence).length > 0 ||
    numberOrNull(input.parttime_hours_request_requested_hours_per_pay_period) !== null
  );
  let parttimeHoursRequest = null;
  if (hasParttimeHoursRequestContext) {
    const regular13WeeksConfirmed = booleanOrNull(input.parttime_hours_request_regular_13_weeks_confirmed) === true;
    const evidence = calculateFixedHoursRequestEvidence({
      ...input,
      fixed_hours_request_regular_13_weeks_confirmed: regular13WeeksConfirmed,
      fixed_hours_request_qualifying_weeks: input.parttime_hours_request_qualifying_weeks ?? (regular13WeeksConfirmed ? 13 : null),
      fixed_hours_request_worked_weeks: input.parttime_hours_request_worked_weeks,
      fixed_hours_request_weekly_evidence: input.parttime_hours_request_weekly_evidence,
      worked_weeks_evidence: input.parttime_hours_request_weekly_evidence || input.parttime_hours_request_worked_weeks,
      contract_hours_per_week: input.contract_hours_per_week
    });
    const decisionSentAt = asIsoDate(input.parttime_hours_request_decision_sent_at);
    const decision = input.parttime_hours_request_decision || null;
    const requestedHours = numberOrNull(input.parttime_hours_request_requested_hours_per_pay_period);
    const decisionDeadline = parttimeHoursRequestSubmittedAt ? addDays(parttimeHoursRequestSubmittedAt, 7) : null;
    const eligible = evidence.status === 'eligible';
    const overdue = eligible && parttimeHoursRequestSubmittedAt && !decisionSentAt && referenceDate && referenceDate > decisionDeadline;
    const decisionTooLate = eligible && decisionSentAt && decisionDeadline && decisionSentAt > decisionDeadline;

    parttimeHoursRequest = {
      status: !isParttime
        ? 'manual_review_required'
        : evidence.manual_review_required
        ? 'manual_review_required'
        : (overdue || decisionTooLate) && requestedHours !== null
        ? 'automatic_adjustment_due'
        : decision
        ? `decision_${decision}`
        : eligible
        ? overdue ? 'decision_overdue' : 'decision_due'
        : 'not_eligible',
      submitted_at: parttimeHoursRequestSubmittedAt,
      decision_sent_at: decisionSentAt,
      decision,
      decision_deadline_at: decisionDeadline,
      requested_hours_per_pay_period: requestedHours,
      current_hours_per_pay_period: currentHours,
      evidence
    };

    if (!isParttime) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0361',
        field: 'employment_contract_model',
        message: 'Parttime contracturen-aanpassingsverzoek is opgegeven, maar contract is niet aantoonbaar parttime.'
      });
    }
    if (!parttimeHoursRequestSubmittedAt) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0361',
        field: 'parttime_contract_hours_adjustment_requested_at',
        message: 'Datum van schriftelijk verzoek om parttime contracturen aan te passen ontbreekt.'
      });
    }
    if (evidence.status === 'manual_review_required') {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0362',
        field: 'parttime_hours_request_worked_weeks',
        message: 'Bewijs voor 13 aaneengesloten weken regelmatig meer werken dan contracturen ontbreekt.'
      });
    }
    if (eligible && !decisionSentAt) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0365',
        severity: overdue ? 'high' : 'medium',
        message: overdue
          ? `Werkgever heeft niet binnen 1 week schriftelijk beslist op parttime contracturenverzoek; deadline was ${decisionDeadline}.`
          : `Werkgever moet uiterlijk ${decisionDeadline} schriftelijk beslissen op parttime contracturenverzoek.`
      });
    }
    if (decisionTooLate) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0365',
        severity: 'high',
        message: `Werkgever heeft te laat beslist op parttime contracturenverzoek (${decisionSentAt} na deadline ${decisionDeadline}).`
      });
    }
    if ((overdue || decisionTooLate) && requestedHours !== null) {
      payrollEntitlements.push({
        rule_id: 'CAO-PB-2024-R0365',
        type: 'automatic_parttime_contract_hours_adjustment_due',
        requested_hours_per_pay_period: requestedHours,
        message: 'Niet tijdig schriftelijk beslist: arbeidsduur moet automatisch volgens aanvraag worden aangepast.'
      });
      recommendedContractUpdate.contract_hours_per_pay_period = requestedHours;
    } else if ((overdue || decisionTooLate) && requestedHours === null) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0365',
        field: 'parttime_hours_request_requested_hours_per_pay_period',
        message: 'Werkgever heeft te laat/niet beslist, maar aangevraagde uren ontbreken; automatische aanpassing kan niet worden geboekt.'
      });
    } else if (decision === 'approved' && requestedHours !== null) {
      recommendedContractUpdate.contract_hours_per_pay_period = requestedHours;
    }
  }

  const fulltimeToParttimeSubmittedAt = asIsoDate(input.fulltime_to_parttime_request_submitted_at);
  const hasFulltimeToParttimeContext = !!(
    fulltimeToParttimeSubmittedAt ||
    numberOrNull(input.fulltime_to_parttime_requested_hours_per_pay_period) !== null ||
    input.fulltime_to_parttime_decision
  );
  let fulltimeToParttimeRequest = null;
  if (hasFulltimeToParttimeContext) {
    const requestedHours = numberOrNull(input.fulltime_to_parttime_requested_hours_per_pay_period);
    const decision = input.fulltime_to_parttime_decision || null;
    fulltimeToParttimeRequest = {
      submitted_at: fulltimeToParttimeSubmittedAt,
      requested_hours_per_pay_period: requestedHours,
      decision,
      rejection_reason: input.fulltime_to_parttime_rejection_reason || null,
      requested_parttime_contract_model: normalizeContractModel(input.fulltime_to_parttime_requested_parttime_model) || null,
      weighty_business_reason_confirmed: booleanOrNull(input.fulltime_to_parttime_weighty_business_reason_confirmed),
      status: decision ? `decision_${decision}` : 'pending'
    };
    if (!isFulltime) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0367',
        field: 'employment_contract_model',
        message: 'Fulltime-naar-parttime verzoek is opgegeven, maar contract is niet aantoonbaar fulltime.'
      });
    }
    if (!fulltimeToParttimeSubmittedAt || requestedHours === null || requestedHours >= 144) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0367',
        field: 'fulltime_to_parttime_request_submitted_at/requested_hours',
        message: 'Leg schriftelijk fulltime-naar-parttime verzoek en gewenste uren onder 144 uur per loonperiode vast.'
      });
    }
    if (decision === 'rejected' && (!input.fulltime_to_parttime_rejection_reason || booleanOrNull(input.fulltime_to_parttime_weighty_business_reason_confirmed) !== true)) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0367',
        field: 'fulltime_to_parttime_rejection_reason',
        message: 'Afwijzing fulltime-naar-parttime vereist schriftelijke toelichting met zwaarwegend bedrijfs- of dienstbelang.'
      });
    }
    if (decision === 'approved' && requestedHours !== null && requestedHours < 144) {
      recommendedContractUpdate.contract_hours_per_pay_period = requestedHours;
      recommendedContractUpdate.employment_contract_model = normalizeContractModel(input.fulltime_to_parttime_requested_parttime_model) || 'parttime_fixed';
      recommendedContractUpdate.parttime_contract_model = recommendedContractUpdate.employment_contract_model === 'parttime_growth' ? 'growth' : 'fixed';
    }
  }

  const hasParttimeUpwardWfwContext = !!(
    input.parttime_upward_wfw_request_submitted_at ||
    numberOrNull(input.parttime_upward_wfw_requested_hours_per_pay_period) !== null
  );
  let parttimeUpwardWfwRequest = null;
  if (hasParttimeUpwardWfwContext) {
    parttimeUpwardWfwRequest = {
      submitted_at: asIsoDate(input.parttime_upward_wfw_request_submitted_at),
      requested_hours_per_pay_period: numberOrNull(input.parttime_upward_wfw_requested_hours_per_pay_period),
      decision: input.parttime_upward_wfw_decision || null,
      external_law_review_required: true
    };
    warnings.push('Parttime arbeidsduur naar boven aanpassen valt onder Wet flexibel werken; definitieve beoordeling vereist HR/juridische workflow buiten de CAO-engine.');
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0368',
      field: 'parttime_upward_wfw_review',
      message: 'Wet flexibel werken toets moet buiten de CAO-engine worden vastgelegd voordat contracturen definitief wijzigen.'
    });
  }

  const hasRejectedRequest = input.parttime_model_change_decision === 'rejected' ||
    input.parttime_hours_request_decision === 'rejected' ||
    input.fulltime_to_parttime_decision === 'rejected' ||
    input.parttime_upward_wfw_decision === 'rejected';
  let socialCommitteeAdvice = null;
  if (hasRejectedRequest) {
    socialCommitteeAdvice = {
      advice_available: true,
      advice_requested: booleanOrNull(input.social_committee_advice_requested),
      advice_reference: input.social_committee_advice_reference || null
    };
    warnings.push('Bij afwijzing van arbeidsduur-/parttimeverzoek kan werknemer de Sociale Commissie om advies vragen.');
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0 ||
    parttimeUpwardWfwRequest !== null ||
    payrollEntitlements.some(e => e.type === 'automatic_parttime_contract_hours_adjustment_due');

  return {
    parttime_workload_change_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    parttime_workload_change_compliant: !hasBlockingViolation && !manualReviewRequired,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    manual_review_required: manualReviewRequired,
    parttime_model_change: parttimeModelChange,
    temporary_extra_hours: temporaryExtraHours,
    parttime_hours_request: parttimeHoursRequest,
    fulltime_to_parttime_request: fulltimeToParttimeRequest,
    parttime_upward_wfw_request: parttimeUpwardWfwRequest,
    social_committee_advice: socialCommitteeAdvice,
    recommended_contract_update: recommendedContractUpdate
  };
}

function evaluateContractClauseRules(input, caoScope) {
  const sourceRuleIds = ['CAO-PB-2024-R0236', 'CAO-PB-2024-R0311'];
  const warnings = [];
  const violations = [];
  const missingEvidence = [];
  const normalizedScope = normalizeScope(caoScope);
  const securityRole = input.security_role_status || 'unknown';
  const isSecurityWorker = normalizedScope.applies_full_security_rules === true ||
    ['aspirant_beveiliger', 'beveiliger', 'leidinggevende'].includes(securityRole);
  const isScopeUnknown = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(normalizedScope.cao_scope_profile);
  const writtenContractConfirmed = booleanOrNull(input.written_contract_model_terms_confirmed);
  const nonCompetePresent = booleanOrNull(input.non_compete_clause_present ?? input.has_non_compete_clause);
  const nonCompeteAbsentConfirmed = booleanOrNull(input.non_compete_clause_absent_confirmed);

  if (writtenContractConfirmed !== true) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0236',
      field: 'written_contract_model_terms_confirmed',
      message: 'Bevestig dat de schriftelijke arbeidsovereenkomst alle onderdelen uit de modelarbeidsovereenkomst bevat.'
    });
  }

  if (isSecurityWorker && nonCompetePresent === true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0311',
      severity: 'high',
      field: 'non_compete_clause_present',
      message: 'Concurrentiebeding is niet toegestaan in een arbeidsovereenkomst van een beveiliger.'
    });
  } else if (isSecurityWorker && nonCompetePresent !== false && nonCompeteAbsentConfirmed !== true) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0311',
      field: 'non_compete_clause_absent_confirmed',
      message: 'Bevestig expliciet dat er geen concurrentiebeding in het beveiligerscontract staat.'
    });
  } else if (!isSecurityWorker && isScopeUnknown && nonCompetePresent === true) {
    missingEvidence.push({
      rule_id: 'CAO-PB-2024-R0311',
      field: 'cao_scope_profile',
      message: 'Concurrentiebeding is aanwezig, maar CAO-scope/functie is onzeker; handmatige review vereist.'
    });
  } else if (!isSecurityWorker && nonCompetePresent === true) {
    warnings.push('Concurrentiebeding is aanwezig, maar artikel 9 lid 1c is alleen automatisch geblokkeerd voor beveiligers; controleer overige arbeidsrechtelijke eisen handmatig.');
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0;

  return {
    contract_clause_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    contract_clause_compliant: !hasBlockingViolation && !manualReviewRequired,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: [],
    manual_review_required: manualReviewRequired,
    recommended_contract_update: {
      written_contract_model_terms_confirmed: writtenContractConfirmed === true,
      non_compete_clause_absent_confirmed: isSecurityWorker ? nonCompetePresent === false || nonCompeteAbsentConfirmed === true : nonCompeteAbsentConfirmed === true,
      non_compete_clause_present: nonCompetePresent === true
    }
  };
}

function resolveTerminationNoticeRequirement(input) {
  const form = input.contract_form || 'unknown';
  const aowContext = booleanOrNull(input.works_after_aow) === true ||
    booleanOrNull(input.employee_already_receives_aow) === true;
  const learningCompanyLossContext = booleanOrNull(input.mbo_security_practice_experience) === true &&
    !!(input.learning_company_recognition_lost_at || input.learning_company_recognition_lost_date);

  if (learningCompanyLossContext && String(input.termination_initiator || '').toLowerCase() === 'employee') {
    return {
      required_notice_weeks: 0,
      source_rule_id: 'CAO-PB-2024-R0335',
      reason: 'employee_resignation_after_learning_company_recognition_loss'
    };
  }
  if (aowContext) {
    return {
      required_notice_weeks: 4,
      source_rule_id: 'CAO-PB-2024-R0334',
      reason: 'post_aow_or_already_receives_aow'
    };
  }
  if (form === 'bepaalde_tijd') {
    return {
      required_notice_weeks: 4,
      source_rule_id: 'CAO-PB-2024-R0328',
      reason: 'fixed_term_interim_termination'
    };
  }
  if (form === 'onbepaalde_tijd') {
    const mutualLongerWeeks = numberOrNull(input.mutual_longer_notice_weeks);
    return {
      required_notice_weeks: Math.max(8, mutualLongerWeeks || 8),
      source_rule_id: 'CAO-PB-2024-R0331',
      reason: mutualLongerWeeks && mutualLongerWeeks > 8 ? 'mutual_longer_notice_period' : 'indefinite_term_termination'
    };
  }
  return {
    required_notice_weeks: null,
    source_rule_id: null,
    reason: 'not_applicable_or_unknown_contract_form'
  };
}

function evaluateContractTerminationRules(input) {
  const sourceRuleIds = [
    'CAO-PB-2024-R0323', 'CAO-PB-2024-R0324', 'CAO-PB-2024-R0325',
    'CAO-PB-2024-R0326', 'CAO-PB-2024-R0327', 'CAO-PB-2024-R0328',
    'CAO-PB-2024-R0329', 'CAO-PB-2024-R0330', 'CAO-PB-2024-R0331',
    'CAO-PB-2024-R0332', 'CAO-PB-2024-R0333', 'CAO-PB-2024-R0334',
    'CAO-PB-2024-R0335'
  ];
  const warnings = [];
  const violations = [];
  const missingEvidence = [];
  const payrollEntitlements = [];
  const recommendedContractUpdate = {};
  const contractForm = input.contract_form || 'unknown';
  const startDate = asIsoDate(input.contract_start_date);
  const endDate = asIsoDate(input.contract_end_date);
  const referenceDate = asIsoDate(input.reference_date || new Date().toISOString());
  const noticeSentAt = asIsoDate(input.fixed_term_end_notice_sent_at || input.end_of_fixed_term_notice_sent_at);
  const terminationNoticeGivenAt = asIsoDate(input.termination_notice_given_at || input.contract_termination_notice_given_at);
  const terminationEffectiveDate = asIsoDate(input.termination_effective_date || input.contract_termination_effective_date);
  const aowDate = asIsoDate(input.employee_aow_date || input.aow_reached_date);
  const learningCompanyLossDate = asIsoDate(input.learning_company_recognition_lost_at || input.learning_company_recognition_lost_date);

  let fixedTermEndNotice = null;
  if (contractForm === 'bepaalde_tijd') {
    if (!endDate) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0324',
        field: 'contract_end_date',
        message: 'Bepaalde tijd vereist een afgesproken einddatum; contracteinde van rechtswege kan anders niet worden vastgesteld.'
      });
    } else {
      const deadline = addCalendarMonths(endDate, -1);
      const noticeDue = referenceDate >= deadline;
      const noticeLate = noticeSentAt && noticeSentAt > deadline;
      fixedTermEndNotice = {
        contract_end_date: endDate,
        automatic_end_by_operation_of_law: true,
        written_notice_deadline_date: deadline,
        written_notice_sent_at: noticeSentAt,
        notice_due: noticeDue,
        notice_late: !!noticeLate,
        status: noticeLate
          ? 'late'
          : noticeSentAt
          ? 'sent'
          : noticeDue
          ? 'missing_due'
          : 'not_due'
      };
      recommendedContractUpdate.fixed_term_end_notice_deadline_at = deadline;
      recommendedContractUpdate.fixed_term_end_notice_status = fixedTermEndNotice.status;
      if (noticeLate) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0325',
          severity: 'high',
          message: `Schriftelijke aanzegging voor contracteinde is te laat verstuurd (${noticeSentAt}; deadline ${deadline}).`,
          fixed_term_end_notice_sent_at: noticeSentAt,
          fixed_term_end_notice_deadline_at: deadline
        });
        payrollEntitlements.push({
          rule_id: 'CAO-PB-2024-R0326',
          type: 'late_fixed_term_notice_manual_extension_review',
          message: 'Niet tijdige aanzegging kan leiden tot automatische verlenging of omzetting naar onbepaalde tijd; juridische/HR review vereist voor planning en payroll.'
        });
      } else if (!noticeSentAt && noticeDue) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0325',
          severity: 'high',
          message: `Schriftelijke aanzegging voor contracteinde ontbreekt terwijl de deadline (${deadline}) is bereikt/verstreken.`,
          fixed_term_end_notice_deadline_at: deadline
        });
        payrollEntitlements.push({
          rule_id: 'CAO-PB-2024-R0326',
          type: 'missing_fixed_term_notice_manual_extension_review',
          message: 'Ontbrekende tijdige aanzegging kan leiden tot automatische verlenging of omzetting naar onbepaalde tijd; blokkeer definitieve contract-/payrollafloop tot review.'
        });
      }
    }
  }

  const hasTerminationContext = !!(terminationNoticeGivenAt || terminationEffectiveDate || input.termination_initiator || input.termination_reason);
  let terminationNotice = null;
  if (hasTerminationContext) {
    const requirement = resolveTerminationNoticeRequirement(input);
    const requiredWeeks = requirement.required_notice_weeks;
    const requiredDays = requiredWeeks === null ? null : requiredWeeks * 7;
    const actualDays = terminationNoticeGivenAt && terminationEffectiveDate ? daysBetween(terminationEffectiveDate, terminationNoticeGivenAt) : null;
    terminationNotice = {
      termination_notice_given_at: terminationNoticeGivenAt,
      termination_effective_date: terminationEffectiveDate,
      termination_initiator: input.termination_initiator || null,
      required_notice_weeks: requiredWeeks,
      required_notice_days: requiredDays,
      actual_notice_days: actualDays,
      source_rule_id: requirement.source_rule_id,
      reason: requirement.reason,
      can_terminate_any_day: ['CAO-PB-2024-R0329', 'CAO-PB-2024-R0332', 'CAO-PB-2024-R0334'].includes(
        contractForm === 'bepaalde_tijd' ? 'CAO-PB-2024-R0329' : requirement.source_rule_id === 'CAO-PB-2024-R0334' ? 'CAO-PB-2024-R0334' : 'CAO-PB-2024-R0332'
      )
    };

    if (!terminationNoticeGivenAt) {
      missingEvidence.push({
        rule_id: requirement.source_rule_id || 'CAO-PB-2024-R0327',
        field: 'termination_notice_given_at',
        message: 'Opzeggingsdatum ontbreekt; opzegtermijn kan niet worden getoetst.'
      });
    }
    if (!terminationEffectiveDate) {
      missingEvidence.push({
        rule_id: requirement.source_rule_id || 'CAO-PB-2024-R0327',
        field: 'termination_effective_date',
        message: 'Beoogde einddatum ontbreekt; opzegtermijn kan niet worden getoetst.'
      });
    }
    if (requiredDays === null) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0327',
        field: 'contract_form',
        message: 'Contractvorm is onvoldoende bekend om de opzegtermijn te bepalen.'
      });
    } else if (actualDays !== null && actualDays < requiredDays) {
      violations.push({
        rule_id: requirement.source_rule_id,
        severity: 'high',
        message: `Opzegtermijn is ${actualDays} dagen, maar CAO vereist ${requiredDays} dagen (${requiredWeeks} weken).`,
        actual_notice_days: actualDays,
        required_notice_days: requiredDays
      });
    }
  }

  let aowTermination = null;
  if (aowDate) {
    aowTermination = {
      employee_aow_date: aowDate,
      automatic_end_date: aowDate,
      works_after_aow: booleanOrNull(input.works_after_aow),
      employee_already_receives_aow: booleanOrNull(input.employee_already_receives_aow)
    };
    if (endDate && endDate > aowDate && booleanOrNull(input.works_after_aow) !== true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0333',
        severity: 'high',
        message: `Contracteinddatum (${endDate}) ligt na AOW-datum (${aowDate}) zonder bevestiging dat werknemer na AOW doorwerkt.`,
        contract_end_date: endDate,
        employee_aow_date: aowDate
      });
    }
  }

  let learningCompanyRecognitionLoss = null;
  if (learningCompanyLossDate || booleanOrNull(input.mbo_security_practice_experience) === true) {
    learningCompanyRecognitionLoss = {
      mbo_security_practice_experience: booleanOrNull(input.mbo_security_practice_experience),
      learning_company_recognition_lost_at: learningCompanyLossDate,
      employee_can_resign_immediately_without_notice: !!learningCompanyLossDate
    };
    if (booleanOrNull(input.mbo_security_practice_experience) === true && !learningCompanyLossDate) {
      missingEvidence.push({
        rule_id: 'CAO-PB-2024-R0335',
        field: 'learning_company_recognition_lost_at',
        message: 'MBO-praktijkervaring is gemarkeerd; leg vast of/wanneer erkenning als leerbedrijf is verloren.'
      });
    }
    if (learningCompanyLossDate) {
      warnings.push('Verlies erkenning leerbedrijf: werkgever moet wettelijke regels volgen voor einde arbeidsovereenkomst; werknemer kan per direct zonder opzegtermijn opzeggen.');
    }
  }

  if (startDate && endDate && endDate < startDate) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0324',
      severity: 'high',
      message: 'Contracteinddatum ligt voor startdatum.',
      contract_start_date: startDate,
      contract_end_date: endDate
    });
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = missingEvidence.length > 0 || payrollEntitlements.length > 0;

  return {
    contract_termination_status: hasBlockingViolation
      ? 'blocked'
      : manualReviewRequired
      ? 'manual_review_required'
      : 'compliant',
    contract_termination_compliant: !hasBlockingViolation && !manualReviewRequired,
    source_rule_ids: sourceRuleIds,
    warnings,
    missing_evidence: missingEvidence,
    contract_rule_violations: violations,
    payroll_entitlements: payrollEntitlements,
    manual_review_required: manualReviewRequired,
    fixed_term_end_notice: fixedTermEndNotice,
    termination_notice: terminationNotice,
    aow_termination: aowTermination,
    learning_company_recognition_loss: learningCompanyRecognitionLoss,
    recommended_contract_update: recommendedContractUpdate
  };
}

function buildFullContractRuleResult(input, caoScope) {
  const probation = calculateProbationPeriod(input, caoScope);
  const callAgreement = evaluateCallAgreementRules(input);
  const internship = evaluateInternshipContractRules(input);
  const hiredWorker = evaluateHiredWorkerContractRules(input);
  const employmentContractModel = evaluateEmploymentContractModelRules(input, callAgreement, internship, hiredWorker);
  const parttimeWorkloadChange = evaluateParttimeWorkloadChangeRules(input, employmentContractModel);
  const contractClauses = evaluateContractClauseRules(input, caoScope);
  const contractTermination = evaluateContractTerminationRules(input);
  const sourceRuleIds = [...new Set([
    ...(employmentContractModel.source_rule_ids || []),
    ...(parttimeWorkloadChange.source_rule_ids || []),
    ...(contractClauses.source_rule_ids || []),
    ...(contractTermination.source_rule_ids || []),
    ...(probation.source_rule_ids || []),
    ...(callAgreement.source_rule_ids || []),
    ...(internship.source_rule_ids || []),
    ...(hiredWorker.source_rule_ids || [])
  ])];
  const warnings = [
    ...(employmentContractModel.warnings || []),
    ...(parttimeWorkloadChange.warnings || []),
    ...(contractClauses.warnings || []),
    ...(contractTermination.warnings || []),
    ...(probation.warnings || []),
    ...(callAgreement.warnings || []),
    ...(internship.warnings || []),
    ...(hiredWorker.warnings || [])
  ];
  const scopeWarnings = probation.scope_warnings || [];
  const contractRuleViolations = [
    ...(employmentContractModel.contract_rule_violations || []),
    ...(parttimeWorkloadChange.contract_rule_violations || []),
    ...(contractClauses.contract_rule_violations || []),
    ...(contractTermination.contract_rule_violations || []),
    ...(probation.contract_rule_violations || []),
    ...(callAgreement.contract_rule_violations || []),
    ...(internship.contract_rule_violations || []),
    ...(hiredWorker.contract_rule_violations || [])
  ];
  const payrollEntitlements = [
    ...(employmentContractModel.payroll_entitlements || []),
    ...(parttimeWorkloadChange.payroll_entitlements || []),
    ...(contractClauses.payroll_entitlements || []),
    ...(contractTermination.payroll_entitlements || []),
    ...(callAgreement.payroll_entitlements || []),
    ...(internship.payroll_entitlements || []),
    ...(hiredWorker.payroll_entitlements || [])
  ];
  const hasBlockingViolation = contractRuleViolations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = probation.manual_review_required === true ||
    employmentContractModel.employment_contract_model_status === 'manual_review_required' ||
    parttimeWorkloadChange.parttime_workload_change_status === 'manual_review_required' ||
    contractClauses.contract_clause_status === 'manual_review_required' ||
    contractTermination.contract_termination_status === 'manual_review_required' ||
    callAgreement.call_agreement_status === 'manual_review_required' ||
    internship.internship_rule_status === 'manual_review_required' ||
    hiredWorker.hired_worker_rule_status === 'manual_review_required';
  const contractRuleStatus = hasBlockingViolation ||
    employmentContractModel.employment_contract_model_status === 'blocked' ||
    parttimeWorkloadChange.parttime_workload_change_status === 'blocked' ||
    contractClauses.contract_clause_status === 'blocked' ||
    contractTermination.contract_termination_status === 'blocked' ||
    probation.contract_rule_status === 'blocked' ||
    callAgreement.call_agreement_status === 'blocked' ||
    internship.internship_rule_status === 'blocked' ||
    hiredWorker.hired_worker_rule_status === 'blocked'
    ? 'blocked'
    : manualReviewRequired
    ? 'manual_review_required'
    : probation.probation_compliant === true &&
      employmentContractModel.employment_contract_model_compliant === true &&
      parttimeWorkloadChange.parttime_workload_change_compliant === true &&
      contractClauses.contract_clause_compliant === true &&
      contractTermination.contract_termination_compliant === true &&
      callAgreement.call_agreement_compliant === true &&
      internship.internship_compliant === true &&
      hiredWorker.hired_worker_compliant === true
    ? 'compliant'
    : 'calculated';

  return {
    ...probation,
    employment_contract_model_rule_result: employmentContractModel,
    parttime_workload_change_rule_result: parttimeWorkloadChange,
    contract_clause_rule_result: contractClauses,
    contract_termination_rule_result: contractTermination,
    employment_contract_model: {
      employment_contract_model: employmentContractModel.employment_contract_model,
      parttime_contract_model: employmentContractModel.parttime_contract_model,
      contract_hours_per_pay_period_resolved: employmentContractModel.contract_hours_per_pay_period_resolved,
      contract_hours_source: employmentContractModel.contract_hours_source,
      employment_contract_model_status: employmentContractModel.employment_contract_model_status,
      employment_contract_model_compliant: employmentContractModel.employment_contract_model_compliant,
      missing_evidence: employmentContractModel.missing_evidence || []
    },
    parttime_workload_change: {
      parttime_workload_change_status: parttimeWorkloadChange.parttime_workload_change_status,
      parttime_workload_change_compliant: parttimeWorkloadChange.parttime_workload_change_compliant,
      parttime_model_change: parttimeWorkloadChange.parttime_model_change,
      temporary_extra_hours: parttimeWorkloadChange.temporary_extra_hours,
      parttime_hours_request: parttimeWorkloadChange.parttime_hours_request,
      fulltime_to_parttime_request: parttimeWorkloadChange.fulltime_to_parttime_request,
      parttime_upward_wfw_request: parttimeWorkloadChange.parttime_upward_wfw_request,
      social_committee_advice: parttimeWorkloadChange.social_committee_advice,
      missing_evidence: parttimeWorkloadChange.missing_evidence || []
    },
    contract_clauses: {
      contract_clause_status: contractClauses.contract_clause_status,
      contract_clause_compliant: contractClauses.contract_clause_compliant,
      missing_evidence: contractClauses.missing_evidence || []
    },
    contract_termination: {
      contract_termination_status: contractTermination.contract_termination_status,
      contract_termination_compliant: contractTermination.contract_termination_compliant,
      fixed_term_end_notice: contractTermination.fixed_term_end_notice,
      termination_notice: contractTermination.termination_notice,
      aow_termination: contractTermination.aow_termination,
      learning_company_recognition_loss: contractTermination.learning_company_recognition_loss,
      missing_evidence: contractTermination.missing_evidence || []
    },
    probation_rule_result: {
      probation_period_months: probation.probation_period_months,
      requested_probation_period_months: probation.requested_probation_period_months,
      probation_validation_status: probation.probation_validation_status,
      probation_compliant: probation.probation_compliant,
      contract_duration_months: probation.contract_duration_months,
      longer_than_six_months: probation.longer_than_six_months,
      six_month_boundary_date: probation.six_month_boundary_date,
      six_month_exact_last_day: probation.six_month_exact_last_day,
      probation_contract_form: probation.probation_contract_form,
      underlying_contract_form: probation.underlying_contract_form,
      call_agreement_type: probation.call_agreement_type,
      source_rule_ids: probation.source_rule_ids,
      manual_review_required: probation.manual_review_required,
      warnings: probation.warnings,
      scope_warnings: probation.scope_warnings,
      contract_rule_violations: probation.contract_rule_violations,
      rule_engine_notes: probation.rule_engine_notes
    },
    call_agreement_rule_result: callAgreement,
    internship_rule_result: internship,
    hired_worker_rule_result: hiredWorker,
    call_agreement: {
      is_call_agreement: callAgreement.is_call_agreement,
      call_agreement_type: callAgreement.call_agreement_type,
      call_agreement_status: callAgreement.call_agreement_status,
      call_agreement_compliant: callAgreement.call_agreement_compliant,
      call_notice_days: callAgreement.call_notice_days,
      employee_notice_days: callAgreement.employee_notice_days,
      fixed_hours_offer: callAgreement.fixed_hours_offer,
      employee_fixed_hours_request: callAgreement.employee_fixed_hours_request,
      call_notice_validation: callAgreement.call_notice_validation
    },
    internship: {
      is_internship: internship.is_internship,
      internship_type: internship.internship_type,
      internship_rule_status: internship.internship_rule_status,
      internship_compliant: internship.internship_compliant,
      missing_evidence: internship.missing_evidence || [],
      duration_check: internship.duration_check || null,
      internship_rule_profile: internship.internship_rule_profile || null
    },
    hired_worker: {
      is_hired_worker: hiredWorker.is_hired_worker,
      hired_worker_type: hiredWorker.hired_worker_type,
      hired_worker_rule_status: hiredWorker.hired_worker_rule_status,
      hired_worker_compliant: hiredWorker.hired_worker_compliant,
      missing_evidence: hiredWorker.missing_evidence || [],
      hired_worker_rule_profile: hiredWorker.hired_worker_rule_profile || null
    },
    source_rule_ids: sourceRuleIds,
    warnings,
    scope_warnings: scopeWarnings,
    contract_rule_violations: contractRuleViolations,
    payroll_entitlements: payrollEntitlements,
    manual_review_required: manualReviewRequired,
    contract_rule_status: contractRuleStatus,
    recommended_contract_update: {
      ...(employmentContractModel.recommended_contract_update || {}),
      ...(parttimeWorkloadChange.recommended_contract_update || {}),
      ...(contractClauses.recommended_contract_update || {}),
      ...(contractTermination.recommended_contract_update || {}),
      ...(probation.recommended_contract_update || {}),
      ...(callAgreement.recommended_contract_update || {}),
      ...(internship.recommended_contract_update || {}),
      ...(hiredWorker.recommended_contract_update || {})
    }
  };
}

function getProbationSourceRuleId(result) {
  if (result.probation_rule_result) {
    return result.probation_rule_result.source_rule_ids?.[0] || null;
  }
  return result.source_rule_ids?.[0] || null;
}

function buildContractRuleInput(body, personnel, contract) {
  const hasContractContext = !!contract;
  return {
    contract_form: pickFirst(body.contract_form, contract?.contract_form, personnel?.contract_form),
    underlying_contract_form: pickFirst(
      body.underlying_contract_form,
      body.call_underlying_contract_form,
      contract?.underlying_contract_form,
      contract?.call_underlying_contract_form,
      null
    ),
    contract_start_date: pickFirst(body.contract_start_date, contract?.contract_start_date, personnel?.contract_start_date),
    contract_end_date: pickFirst(body.contract_end_date, contract?.contract_end_date, personnel?.contract_end_date),
    reference_date: pickFirst(body.reference_date, null),
    written_contract_model_terms_confirmed: pickFirst(body.written_contract_model_terms_confirmed, contract?.written_contract_model_terms_confirmed, null),
    non_compete_clause_present: pickFirst(body.non_compete_clause_present, body.has_non_compete_clause, contract?.non_compete_clause_present, null),
    has_non_compete_clause: pickFirst(body.has_non_compete_clause, null),
    non_compete_clause_absent_confirmed: pickFirst(body.non_compete_clause_absent_confirmed, contract?.non_compete_clause_absent_confirmed, null),
    fixed_term_end_notice_sent_at: pickFirst(body.fixed_term_end_notice_sent_at, body.end_of_fixed_term_notice_sent_at, contract?.fixed_term_end_notice_sent_at, null),
    end_of_fixed_term_notice_sent_at: pickFirst(body.end_of_fixed_term_notice_sent_at, null),
    fixed_term_renewal_decision: pickFirst(body.fixed_term_renewal_decision, contract?.fixed_term_renewal_decision, null),
    termination_notice_given_at: pickFirst(body.termination_notice_given_at, body.contract_termination_notice_given_at, null),
    contract_termination_notice_given_at: pickFirst(body.contract_termination_notice_given_at, null),
    termination_effective_date: pickFirst(body.termination_effective_date, body.contract_termination_effective_date, null),
    contract_termination_effective_date: pickFirst(body.contract_termination_effective_date, null),
    termination_initiator: pickFirst(body.termination_initiator, null),
    termination_reason: pickFirst(body.termination_reason, null),
    mutual_longer_notice_weeks: pickFirst(body.mutual_longer_notice_weeks, contract?.mutual_longer_notice_weeks, null),
    employee_aow_date: pickFirst(body.employee_aow_date, contract?.employee_aow_date, personnel?.employee_aow_date, null),
    aow_reached_date: pickFirst(body.aow_reached_date, null),
    works_after_aow: pickFirst(body.works_after_aow, contract?.works_after_aow, null),
    employee_already_receives_aow: pickFirst(body.employee_already_receives_aow, contract?.employee_already_receives_aow, null),
    mbo_security_practice_experience: pickFirst(body.mbo_security_practice_experience, contract?.mbo_security_practice_experience, null),
    learning_company_recognition_lost_at: pickFirst(body.learning_company_recognition_lost_at, body.learning_company_recognition_lost_date, null),
    learning_company_recognition_lost_date: pickFirst(body.learning_company_recognition_lost_date, null),
    requested_parttime_contract_model: pickFirst(body.requested_parttime_contract_model, body.parttime_model_change_requested_model, contract?.parttime_model_change_requested_model, null),
    parttime_model_change_requested_model: pickFirst(body.parttime_model_change_requested_model, contract?.parttime_model_change_requested_model, null),
    parttime_model_change_requested_at: pickFirst(body.parttime_model_change_requested_at, contract?.parttime_model_change_requested_at, null),
    parttime_model_change_effective_date: pickFirst(body.parttime_model_change_effective_date, contract?.parttime_model_change_effective_date, null),
    parttime_model_change_effective_pay_period_number: pickFirst(body.parttime_model_change_effective_pay_period_number, contract?.parttime_model_change_effective_pay_period_number, null),
    parttime_model_change_decision: pickFirst(body.parttime_model_change_decision, contract?.parttime_model_change_decision, null),
    parttime_model_change_rejection_reason: pickFirst(body.parttime_model_change_rejection_reason, contract?.parttime_model_change_rejection_reason, null),
    parttime_model_change_weighty_business_reason_confirmed: pickFirst(body.parttime_model_change_weighty_business_reason_confirmed, contract?.parttime_model_change_weighty_business_reason_confirmed, null),
    temporary_extra_hours_agreed: pickFirst(body.temporary_extra_hours_agreed, contract?.temporary_extra_hours_agreed, null),
    temporary_extra_hours_start_date: pickFirst(body.temporary_extra_hours_start_date, contract?.temporary_extra_hours_start_date, null),
    temporary_extra_hours_end_date: pickFirst(body.temporary_extra_hours_end_date, contract?.temporary_extra_hours_end_date, null),
    temporary_extra_hours_per_pay_period: pickFirst(body.temporary_extra_hours_per_pay_period, contract?.temporary_extra_hours_per_pay_period, null),
    parttime_contract_hours_adjustment_requested_at: pickFirst(body.parttime_contract_hours_adjustment_requested_at, body.parttime_hours_request_submitted_at, contract?.parttime_contract_hours_adjustment_requested_at, null),
    parttime_hours_request_submitted_at: pickFirst(body.parttime_hours_request_submitted_at, null),
    parttime_hours_request_decision_sent_at: pickFirst(body.parttime_hours_request_decision_sent_at, contract?.parttime_hours_request_decision_sent_at, null),
    parttime_hours_request_decision: pickFirst(body.parttime_hours_request_decision, contract?.parttime_hours_request_decision, null),
    parttime_hours_request_requested_hours_per_pay_period: pickFirst(body.parttime_hours_request_requested_hours_per_pay_period, contract?.parttime_hours_request_requested_hours_per_pay_period, null),
    parttime_hours_request_regular_13_weeks_confirmed: pickFirst(body.parttime_hours_request_regular_13_weeks_confirmed, contract?.parttime_hours_request_regular_13_weeks_confirmed, null),
    parttime_hours_request_qualifying_weeks: pickFirst(body.parttime_hours_request_qualifying_weeks, contract?.parttime_hours_request_qualifying_weeks, null),
    parttime_hours_request_worked_weeks: pickFirst(body.parttime_hours_request_worked_weeks, body.parttime_hours_request_weekly_evidence, null),
    parttime_hours_request_weekly_evidence: pickFirst(body.parttime_hours_request_weekly_evidence, null),
    fulltime_to_parttime_request_submitted_at: pickFirst(body.fulltime_to_parttime_request_submitted_at, contract?.fulltime_to_parttime_request_submitted_at, null),
    fulltime_to_parttime_requested_hours_per_pay_period: pickFirst(body.fulltime_to_parttime_requested_hours_per_pay_period, contract?.fulltime_to_parttime_requested_hours_per_pay_period, null),
    fulltime_to_parttime_requested_parttime_model: pickFirst(body.fulltime_to_parttime_requested_parttime_model, contract?.fulltime_to_parttime_requested_parttime_model, null),
    fulltime_to_parttime_decision: pickFirst(body.fulltime_to_parttime_decision, contract?.fulltime_to_parttime_decision, null),
    fulltime_to_parttime_rejection_reason: pickFirst(body.fulltime_to_parttime_rejection_reason, contract?.fulltime_to_parttime_rejection_reason, null),
    fulltime_to_parttime_weighty_business_reason_confirmed: pickFirst(body.fulltime_to_parttime_weighty_business_reason_confirmed, contract?.fulltime_to_parttime_weighty_business_reason_confirmed, null),
    parttime_upward_wfw_request_submitted_at: pickFirst(body.parttime_upward_wfw_request_submitted_at, contract?.parttime_upward_wfw_request_submitted_at, null),
    parttime_upward_wfw_requested_hours_per_pay_period: pickFirst(body.parttime_upward_wfw_requested_hours_per_pay_period, contract?.parttime_upward_wfw_requested_hours_per_pay_period, null),
    parttime_upward_wfw_decision: pickFirst(body.parttime_upward_wfw_decision, contract?.parttime_upward_wfw_decision, null),
    social_committee_advice_requested: pickFirst(body.social_committee_advice_requested, contract?.social_committee_advice_requested, null),
    social_committee_advice_reference: pickFirst(body.social_committee_advice_reference, contract?.social_committee_advice_reference, null),
    security_role_status: pickFirst(body.security_role_status, contract?.security_role_status, personnel?.security_role_status, 'unknown'),
    function_type: pickFirst(body.function_type, contract?.function_type, personnel?.function_type, null),
    performs_security_work: pickFirst(body.performs_security_work, contract?.performs_security_work, personnel?.performs_security_work, null),
    security_work_percentage: pickFirst(body.security_work_percentage, contract?.security_work_percentage, personnel?.security_work_percentage, null),
    works_airport_schiphol: pickFirst(body.works_airport_schiphol, contract?.works_airport_schiphol, personnel?.works_airport_schiphol, null),
    works_cash_value_logistics: pickFirst(body.works_cash_value_logistics, contract?.works_cash_value_logistics, personnel?.works_cash_value_logistics, null),
    works_event_or_hospitality_security: pickFirst(body.works_event_or_hospitality_security, contract?.works_event_or_hospitality_security, personnel?.works_event_or_hospitality_security, null),
    event_hospitality_cao_applies: pickFirst(body.event_hospitality_cao_applies, contract?.event_hospitality_cao_applies, personnel?.event_hospitality_cao_applies, null),
    cao_scope_profile: pickFirst(body.cao_scope_profile, contract?.cao_scope_profile, personnel?.cao_scope_profile, null),
    cao_applicable_rule_profile: pickFirst(body.cao_applicable_rule_profile, contract?.cao_applicable_rule_profile, personnel?.cao_applicable_rule_profile, null),
    cao_excluded_rule_ids: pickFirst(body.cao_excluded_rule_ids, contract?.cao_excluded_rule_ids, personnel?.cao_excluded_rule_ids, []),
    cao_excluded_articles: pickFirst(body.cao_excluded_articles, contract?.cao_excluded_articles, personnel?.cao_excluded_articles, []),
    cao_excluded_chapters: pickFirst(body.cao_excluded_chapters, contract?.cao_excluded_chapters, personnel?.cao_excluded_chapters, []),
    cao_function_group: pickFirst(body.cao_function_group, contract?.cao_function_group, personnel?.cao_function_group, null),
    cao_function_level: pickFirst(body.cao_function_level, contract?.cao_function_level, personnel?.cao_function_level, null),
    cao_scale: pickFirst(body.cao_scale, contract?.cao_scale, personnel?.cao_scale, null),
    cao_period: pickFirst(body.cao_period, contract?.cao_period, personnel?.cao_period, null),
    employment_contract_model: pickFirst(body.employment_contract_model, contract?.employment_contract_model, null),
    contract_model: pickFirst(body.contract_model, body.employment_contract_model, contract?.contract_model, contract?.employment_contract_model, null),
    parttime_contract_model: pickFirst(body.parttime_contract_model, contract?.parttime_contract_model, null),
    contract_type: pickFirst(body.contract_type, contract?.contract_type, personnel?.contract_type, null),
    call_agreement_type: pickFirst(body.call_agreement_type, contract?.call_agreement_type, null),
    contract_hours_per_week: pickFirst(body.contract_hours_per_week, contract?.contract_hours_per_week, null),
    contract_hours_per_pay_period: pickFirst(body.contract_hours_per_pay_period, contract?.contract_hours_per_pay_period, null),
    fixed_hours_per_pay_period: pickFirst(body.fixed_hours_per_pay_period, contract?.fixed_hours_per_pay_period, null),
    min_hours_per_pay_period: pickFirst(body.min_hours_per_pay_period, contract?.min_hours_per_pay_period, null),
    max_hours_per_pay_period: pickFirst(body.max_hours_per_pay_period, contract?.max_hours_per_pay_period, null),
    min_hours_per_week: pickFirst(body.min_hours_per_week, contract?.min_hours_per_week, null),
    max_hours_per_week: pickFirst(body.max_hours_per_week, contract?.max_hours_per_week, null),
    annualized_hours_with_bandwidth: pickFirst(body.annualized_hours_with_bandwidth, contract?.annualized_hours_with_bandwidth, null),
    annual_contract_hours: pickFirst(body.annual_contract_hours, contract?.annual_contract_hours, null),
    no_work_no_pay_first_6_months: pickFirst(body.no_work_no_pay_first_6_months, contract?.no_work_no_pay_first_6_months, null),
    call_created_at: pickFirst(body.call_created_at, body.call_notified_at, null),
    shift_start_datetime: pickFirst(body.shift_start_datetime, null),
    shift_end_datetime: pickFirst(body.shift_end_datetime, null),
    call_change_type: pickFirst(body.call_change_type, body.call_action, null),
    call_cancelled_at: pickFirst(body.call_cancelled_at, null),
    call_changed_at: pickFirst(body.call_changed_at, null),
    call_change_datetime: pickFirst(body.call_change_datetime, null),
    original_shift_start_datetime: pickFirst(body.original_shift_start_datetime, null),
    original_shift_end_datetime: pickFirst(body.original_shift_end_datetime, null),
    original_call_hours: pickFirst(body.original_call_hours, null),
    fixed_hours_offer_sent_at: pickFirst(body.fixed_hours_offer_sent_at, contract?.fixed_hours_offer_sent_at, null),
    fixed_hours_offer_accepted_at: pickFirst(body.fixed_hours_offer_accepted_at, contract?.fixed_hours_offer_accepted_at, null),
    fixed_hours_offer_acceptance_deadline_date: pickFirst(body.fixed_hours_offer_acceptance_deadline_date, contract?.fixed_hours_offer_acceptance_deadline_date, null),
    average_hours_last_12_months: pickFirst(body.average_hours_last_12_months, contract?.average_hours_last_12_months, null),
    fixed_hours_request_submitted_at: pickFirst(body.fixed_hours_request_submitted_at, contract?.fixed_hours_request_submitted_at, null),
    employee_fixed_hours_request_submitted_at: pickFirst(body.employee_fixed_hours_request_submitted_at, null),
    fixed_hours_request_decision_sent_at: pickFirst(body.fixed_hours_request_decision_sent_at, contract?.fixed_hours_request_decision_sent_at, null),
    fixed_hours_request_decision: pickFirst(body.fixed_hours_request_decision, contract?.fixed_hours_request_decision, null),
    fixed_hours_request_requested_hours_per_pay_period: pickFirst(body.fixed_hours_request_requested_hours_per_pay_period, contract?.fixed_hours_request_requested_hours_per_pay_period, null),
    fixed_hours_request_regular_13_weeks_confirmed: pickFirst(body.fixed_hours_request_regular_13_weeks_confirmed, contract?.fixed_hours_request_regular_13_weeks_confirmed, null),
    fixed_hours_request_qualifying_weeks: pickFirst(body.fixed_hours_request_qualifying_weeks, contract?.fixed_hours_request_qualifying_weeks, null),
    fixed_hours_request_worked_weeks: pickFirst(body.fixed_hours_request_worked_weeks, body.fixed_hours_request_weekly_evidence, null),
    fixed_hours_request_weekly_evidence: pickFirst(body.fixed_hours_request_weekly_evidence, null),
    worked_weeks_evidence: pickFirst(body.worked_weeks_evidence, null),
    internship_type: pickFirst(body.internship_type, body.stage_type, contract?.internship_type, null),
    stage_type: pickFirst(body.stage_type, null),
    internship_source: pickFirst(body.internship_source, null),
    bol_internship: pickFirst(body.bol_internship, contract?.bol_internship, null),
    uwv_trial_placement: pickFirst(body.uwv_trial_placement, contract?.uwv_trial_placement, null),
    reintegration_measure: pickFirst(body.reintegration_measure, contract?.reintegration_measure, null),
    second_track_reintegration: pickFirst(body.second_track_reintegration, contract?.second_track_reintegration, null),
    internship_has_employment_contract: pickFirst(body.internship_has_employment_contract, contract?.internship_has_employment_contract, null),
    internship_supervision_confirmed: pickFirst(body.internship_supervision_confirmed, contract?.internship_supervision_confirmed, null),
    internship_relevant_practical_experience_confirmed: pickFirst(body.internship_relevant_practical_experience_confirmed, contract?.internship_relevant_practical_experience_confirmed, null),
    internship_above_strength_confirmed: pickFirst(body.internship_above_strength_confirmed, contract?.internship_above_strength_confirmed, null),
    internship_not_customer_billed_confirmed: pickFirst(body.internship_not_customer_billed_confirmed, contract?.internship_not_customer_billed_confirmed, null),
    internship_counts_toward_required_staffing: pickFirst(body.internship_counts_toward_required_staffing, null),
    internship_customer_billed: pickFirst(body.internship_customer_billed, null),
    internship_rostered_confirmed: pickFirst(body.internship_rostered_confirmed, contract?.internship_rostered_confirmed, null),
    internship_practice_trainer_personnel_id: pickFirst(body.internship_practice_trainer_personnel_id, contract?.internship_practice_trainer_personnel_id, null),
    internship_mentor_personnel_id: pickFirst(body.internship_mentor_personnel_id, contract?.internship_mentor_personnel_id, null),
    internship_mentor_name: pickFirst(body.internship_mentor_name, contract?.internship_mentor_name, null),
    internship_one_to_one_guidance_confirmed: pickFirst(body.internship_one_to_one_guidance_confirmed, contract?.internship_one_to_one_guidance_confirmed, null),
    internship_uniform_label_confirmed: pickFirst(body.internship_uniform_label_confirmed, contract?.internship_uniform_label_confirmed, null),
    internship_agreement_with_institution_confirmed: pickFirst(body.internship_agreement_with_institution_confirmed, contract?.internship_agreement_with_institution_confirmed, null),
    internship_institution_name: pickFirst(body.internship_institution_name, contract?.internship_institution_name, null),
    internship_assignment_description: pickFirst(body.internship_assignment_description, contract?.internship_assignment_description, null),
    internship_working_times_documented: pickFirst(body.internship_working_times_documented, contract?.internship_working_times_documented, null),
    internship_evaluation_agreement_documented: pickFirst(body.internship_evaluation_agreement_documented, contract?.internship_evaluation_agreement_documented, null),
    internship_compensation_documented: pickFirst(body.internship_compensation_documented, contract?.internship_compensation_documented, null),
    internship_compensation_applies: pickFirst(body.internship_compensation_applies, contract?.internship_compensation_applies, null),
    internship_compensation_amount: pickFirst(body.internship_compensation_amount, contract?.internship_compensation_amount, null),
    hired_worker_type: pickFirst(body.hired_worker_type, body.external_worker_type, contract?.hired_worker_type, null),
    external_worker_type: pickFirst(body.external_worker_type, null),
    is_agency_worker: pickFirst(body.is_agency_worker, contract?.is_agency_worker, null),
    is_payroll_worker: pickFirst(body.is_payroll_worker, contract?.is_payroll_worker, null),
    hired_worker_inlenersbeloning_confirmed: pickFirst(body.hired_worker_inlenersbeloning_confirmed, contract?.hired_worker_inlenersbeloning_confirmed, null),
    hired_worker_equal_conditions_confirmed: pickFirst(body.hired_worker_equal_conditions_confirmed, contract?.hired_worker_equal_conditions_confirmed, null),
    hired_worker_equal_function_reference_contract_id: pickFirst(body.hired_worker_equal_function_reference_contract_id, contract?.hired_worker_equal_function_reference_contract_id, null),
    hired_worker_equal_function_reference_personnel_id: pickFirst(body.hired_worker_equal_function_reference_personnel_id, contract?.hired_worker_equal_function_reference_personnel_id, null),
    hired_worker_equal_function_description: pickFirst(body.hired_worker_equal_function_description, contract?.hired_worker_equal_function_description, null),
    hired_worker_salary_scale_period_confirmed: pickFirst(body.hired_worker_salary_scale_period_confirmed, contract?.hired_worker_salary_scale_period_confirmed, null),
    hired_worker_allowances_confirmed: pickFirst(body.hired_worker_allowances_confirmed, contract?.hired_worker_allowances_confirmed, null),
    hired_worker_consignation_allowance_confirmed: pickFirst(body.hired_worker_consignation_allowance_confirmed, contract?.hired_worker_consignation_allowance_confirmed, null),
    hired_worker_wage_increases_confirmed: pickFirst(body.hired_worker_wage_increases_confirmed, contract?.hired_worker_wage_increases_confirmed, null),
    hired_worker_periodics_confirmed: pickFirst(body.hired_worker_periodics_confirmed, contract?.hired_worker_periodics_confirmed, null),
    hired_worker_one_off_payments_confirmed: pickFirst(body.hired_worker_one_off_payments_confirmed, contract?.hired_worker_one_off_payments_confirmed, null),
    hired_worker_year_end_bonus_confirmed: pickFirst(body.hired_worker_year_end_bonus_confirmed, contract?.hired_worker_year_end_bonus_confirmed, null),
    hired_worker_reimbursements_confirmed: pickFirst(body.hired_worker_reimbursements_confirmed, contract?.hired_worker_reimbursements_confirmed, null),
    hired_worker_travel_reimbursement_confirmed: pickFirst(body.hired_worker_travel_reimbursement_confirmed, contract?.hired_worker_travel_reimbursement_confirmed, null),
    hired_worker_function_costs_confirmed: pickFirst(body.hired_worker_function_costs_confirmed, contract?.hired_worker_function_costs_confirmed, null),
    hired_worker_external_employer_pays_wages_confirmed: pickFirst(body.hired_worker_external_employer_pays_wages_confirmed, contract?.hired_worker_external_employer_pays_wages_confirmed, null),
    hired_worker_hirer_verification_confirmed: pickFirst(body.hired_worker_hirer_verification_confirmed, contract?.hired_worker_hirer_verification_confirmed, null),
    hired_worker_working_time_rules_confirmed: pickFirst(body.hired_worker_working_time_rules_confirmed, contract?.hired_worker_working_time_rules_confirmed, null),
    hired_worker_roster_rules_confirmed: pickFirst(body.hired_worker_roster_rules_confirmed, contract?.hired_worker_roster_rules_confirmed, null),
    hired_worker_paid_below_inlenersbeloning: pickFirst(body.hired_worker_paid_below_inlenersbeloning, null),
    requested_probation_period_months: pickFirst(
      body.requested_probation_period_months,
      body.probation_period_months,
      contract?.probation_period_months,
      hasContractContext ? null : personnel?.probation_period_months
    ),
    current_probation_period_months: pickFirst(contract?.probation_period_months, hasContractContext ? null : personnel?.probation_period_months)
  };
}

function buildContractRulePersistence(result) {
  const recommendedContractUpdate = result.recommended_contract_update || {};
  const contractBasis = result.contract_basis || null;
  const contractContextMissingFields = contractBasis
    ? (contractBasis.missing_evidence || []).map(item => item.field || item.rule_id).filter(Boolean)
    : undefined;
  return {
    contract_context_status: contractBasis?.status ?? undefined,
    contract_context_missing_fields: contractContextMissingFields,
    contract_context_checked_at: contractBasis ? new Date().toISOString() : undefined,
    planning_allowed: contractBasis ? result.contract_final_allowed === true : undefined,
    contract_final_allowed: result.contract_final_allowed ?? undefined,
    payroll_final_allowed: result.payroll_final_allowed ?? undefined,
    employment_contract_model: recommendedContractUpdate.employment_contract_model ?? result.employment_contract_model?.employment_contract_model ?? undefined,
    parttime_contract_model: recommendedContractUpdate.parttime_contract_model ?? result.employment_contract_model?.parttime_contract_model ?? undefined,
    employment_contract_model_rule_status: result.employment_contract_model?.employment_contract_model_status ?? undefined,
    employment_contract_model_manual_review_required: result.employment_contract_model
      ? result.employment_contract_model.employment_contract_model_status === 'manual_review_required'
      : undefined,
    contract_hours_per_pay_period: recommendedContractUpdate.contract_hours_per_pay_period ?? result.employment_contract_model?.contract_hours_per_pay_period_resolved ?? undefined,
    parttime_workload_change_rule_status: result.parttime_workload_change?.parttime_workload_change_status ?? undefined,
    parttime_workload_change_manual_review_required: result.parttime_workload_change
      ? result.parttime_workload_change.parttime_workload_change_status === 'manual_review_required'
      : undefined,
    parttime_model_change_requested_at: result.parttime_workload_change?.parttime_model_change?.requested_at ?? undefined,
    parttime_model_change_requested_model: result.parttime_workload_change?.parttime_model_change?.requested_parttime_contract_model ?? undefined,
    parttime_model_change_effective_date: result.parttime_workload_change?.parttime_model_change?.effective_date ?? undefined,
    parttime_model_change_effective_pay_period_number: result.parttime_workload_change?.parttime_model_change?.effective_pay_period_number ?? undefined,
    parttime_model_change_decision: result.parttime_workload_change?.parttime_model_change?.decision ?? undefined,
    parttime_model_change_rejection_reason: result.parttime_workload_change?.parttime_model_change?.rejection_reason ?? undefined,
    parttime_model_change_weighty_business_reason_confirmed: result.parttime_workload_change?.parttime_model_change?.weighty_business_reason_confirmed ?? undefined,
    temporary_extra_hours_agreed: result.parttime_workload_change?.temporary_extra_hours?.agreed ?? undefined,
    temporary_extra_hours_start_date: result.parttime_workload_change?.temporary_extra_hours?.start_date ?? undefined,
    temporary_extra_hours_end_date: result.parttime_workload_change?.temporary_extra_hours?.end_date ?? undefined,
    temporary_extra_hours_per_pay_period: result.parttime_workload_change?.temporary_extra_hours?.temporary_extra_hours_per_pay_period ?? undefined,
    parttime_contract_hours_adjustment_requested_at: result.parttime_workload_change?.parttime_hours_request?.submitted_at ?? undefined,
    parttime_hours_request_decision_sent_at: result.parttime_workload_change?.parttime_hours_request?.decision_sent_at ?? undefined,
    parttime_hours_request_decision: result.parttime_workload_change?.parttime_hours_request?.decision ?? undefined,
    parttime_hours_request_decision_deadline_at: result.parttime_workload_change?.parttime_hours_request?.decision_deadline_at ?? undefined,
    parttime_hours_request_requested_hours_per_pay_period: result.parttime_workload_change?.parttime_hours_request?.requested_hours_per_pay_period ?? undefined,
    parttime_hours_request_qualifying_weeks: result.parttime_workload_change?.parttime_hours_request?.evidence?.qualifying_weeks ?? undefined,
    fulltime_to_parttime_request_submitted_at: result.parttime_workload_change?.fulltime_to_parttime_request?.submitted_at ?? undefined,
    fulltime_to_parttime_requested_hours_per_pay_period: result.parttime_workload_change?.fulltime_to_parttime_request?.requested_hours_per_pay_period ?? undefined,
    fulltime_to_parttime_requested_parttime_model: result.parttime_workload_change?.fulltime_to_parttime_request?.requested_parttime_contract_model ?? undefined,
    fulltime_to_parttime_decision: result.parttime_workload_change?.fulltime_to_parttime_request?.decision ?? undefined,
    fulltime_to_parttime_rejection_reason: result.parttime_workload_change?.fulltime_to_parttime_request?.rejection_reason ?? undefined,
    fulltime_to_parttime_weighty_business_reason_confirmed: result.parttime_workload_change?.fulltime_to_parttime_request?.weighty_business_reason_confirmed ?? undefined,
    parttime_upward_wfw_request_submitted_at: result.parttime_workload_change?.parttime_upward_wfw_request?.submitted_at ?? undefined,
    parttime_upward_wfw_requested_hours_per_pay_period: result.parttime_workload_change?.parttime_upward_wfw_request?.requested_hours_per_pay_period ?? undefined,
    parttime_upward_wfw_decision: result.parttime_workload_change?.parttime_upward_wfw_request?.decision ?? undefined,
    social_committee_advice_requested: result.parttime_workload_change?.social_committee_advice?.advice_requested ?? undefined,
    social_committee_advice_reference: result.parttime_workload_change?.social_committee_advice?.advice_reference ?? undefined,
    written_contract_model_terms_confirmed: result.contract_clause_rule_result?.recommended_contract_update?.written_contract_model_terms_confirmed ?? undefined,
    non_compete_clause_absent_confirmed: result.contract_clause_rule_result?.recommended_contract_update?.non_compete_clause_absent_confirmed ?? undefined,
    non_compete_clause_present: result.contract_clause_rule_result?.recommended_contract_update?.non_compete_clause_present ?? undefined,
    contract_clause_rule_status: result.contract_clauses?.contract_clause_status ?? undefined,
    contract_clause_manual_review_required: result.contract_clauses
      ? result.contract_clauses.contract_clause_status === 'manual_review_required'
      : undefined,
    fixed_term_end_notice_sent_at: result.contract_termination?.fixed_term_end_notice?.written_notice_sent_at ?? undefined,
    fixed_term_end_notice_deadline_at: result.contract_termination?.fixed_term_end_notice?.written_notice_deadline_date ?? undefined,
    fixed_term_end_notice_status: result.contract_termination?.fixed_term_end_notice?.status ?? undefined,
    contract_termination_rule_status: result.contract_termination?.contract_termination_status ?? undefined,
    contract_termination_manual_review_required: result.contract_termination
      ? result.contract_termination.contract_termination_status === 'manual_review_required'
      : undefined,
    contract_duration_months: result.contract_duration_months,
    probation_period_months: result.probation_period_months,
    probation_period_source_rule_id: getProbationSourceRuleId(result),
    probation_period_manual_review_required: result.probation_rule_result?.manual_review_required ?? result.manual_review_required,
    probation_period_validation_status: result.probation_validation_status,
    underlying_contract_form: result.probation_rule_result?.underlying_contract_form ?? undefined,
    is_call_agreement: result.call_agreement?.is_call_agreement ?? false,
    call_agreement_type: result.call_agreement?.call_agreement_type || null,
    call_agreement_rule_status: result.call_agreement?.call_agreement_status || null,
    call_agreement_manual_review_required: result.call_agreement?.call_agreement_status === 'manual_review_required',
    call_notice_days: result.call_agreement?.call_notice_days ?? null,
    employee_notice_days: result.call_agreement?.employee_notice_days ?? null,
    payslip_call_agreement_indicator_required: result.call_agreement?.is_call_agreement === true,
    fixed_hours_offer_status: result.call_agreement?.fixed_hours_offer?.status || null,
    fixed_hours_offer_due_at: result.call_agreement?.fixed_hours_offer?.twelve_month_completed_date || null,
    fixed_hours_offer_deadline_at: result.call_agreement?.fixed_hours_offer?.offer_deadline_date || null,
    fixed_hours_request_status: result.call_agreement?.employee_fixed_hours_request?.status || null,
    fixed_hours_request_submitted_at: result.call_agreement?.employee_fixed_hours_request?.submitted_at || null,
    fixed_hours_request_decision_sent_at: result.call_agreement?.employee_fixed_hours_request?.decision_sent_at || null,
    fixed_hours_request_decision_deadline_at: result.call_agreement?.employee_fixed_hours_request?.decision_deadline_at || null,
    fixed_hours_request_requested_hours_per_pay_period: result.call_agreement?.employee_fixed_hours_request?.requested_hours_per_pay_period ?? null,
    fixed_hours_request_qualifying_weeks: result.call_agreement?.employee_fixed_hours_request?.evidence?.qualifying_weeks ?? null,
    fixed_hours_request_manual_review_required: result.call_agreement?.employee_fixed_hours_request?.status === 'manual_review_required',
    internship_type: result.internship?.internship_type || null,
    internship_rule_status: result.internship?.internship_rule_status || null,
    internship_manual_review_required: result.internship?.internship_rule_status === 'manual_review_required',
    internship_roster_required: result.internship?.is_internship === true,
    internship_only_chapter_3_applies: result.internship?.is_internship === true,
    internship_duration_months: result.internship?.duration_check?.contract_duration_months ?? null,
    internship_max_duration_months: result.internship?.duration_check?.max_duration_months ?? null,
    internship_two_month_boundary_date: result.internship?.duration_check?.two_month_boundary_date || null,
    internship_two_month_exact_last_day: result.internship?.duration_check?.two_month_exact_last_day || null,
    hired_worker_type: result.hired_worker?.hired_worker_type || null,
    hired_worker_rule_status: result.hired_worker?.hired_worker_rule_status || null,
    hired_worker_manual_review_required: result.hired_worker?.hired_worker_rule_status === 'manual_review_required',
    hired_worker_inlenersbeloning_required: result.hired_worker?.hired_worker_rule_profile?.apply_hirer_reward === true,
    hired_worker_equal_conditions_required: result.hired_worker?.hired_worker_rule_profile?.apply_equal_employment_conditions === true,
    hired_worker_chapter_3_rules_apply: result.hired_worker?.hired_worker_rule_profile?.apply_chapter_3_roster_rules === true,
    hired_worker_agency_or_payroll_pays_wages: result.hired_worker?.hired_worker_rule_profile?.external_employer_pays_wages_and_reimbursements === true,
    hired_worker_hirer_must_verify_payment: result.hired_worker?.hired_worker_rule_profile?.hirer_must_verify_compliance === true,
    cao_contract_rule_status: result.contract_rule_status,
    cao_contract_rule_checked_at: new Date().toISOString(),
    cao_contract_rule_source_rule_ids: result.source_rule_ids,
    cao_contract_rule_results: {
      probation: result.probation_rule_result || {
        probation_period_months: result.probation_period_months,
        requested_probation_period_months: result.requested_probation_period_months,
        probation_validation_status: result.probation_validation_status,
        probation_compliant: result.probation_compliant,
        contract_duration_months: result.contract_duration_months,
        longer_than_six_months: result.longer_than_six_months,
        six_month_boundary_date: result.six_month_boundary_date,
        six_month_exact_last_day: result.six_month_exact_last_day,
        source_rule_ids: result.source_rule_ids,
        manual_review_required: result.manual_review_required,
        warnings: result.warnings,
        scope_warnings: result.scope_warnings,
        contract_rule_violations: result.contract_rule_violations
      },
      employment_contract_model: result.employment_contract_model_rule_result || null,
      parttime_workload_change: result.parttime_workload_change_rule_result || null,
      contract_clauses: result.contract_clause_rule_result || null,
      contract_termination: result.contract_termination_rule_result || null,
      call_agreement: result.call_agreement_rule_result || null,
      internship: result.internship_rule_result || null,
      hired_worker: result.hired_worker_rule_result || null
    }
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, contract_id, force_cao_sync } = body;
    let { personnel_id } = body;

    let contract = body.contract || null;
    if (contract_id) {
      contract = await base44.entities.PersonnelContract.get(contract_id).catch(() => null);
      if (!contract) return Response.json({ error: `Arbeidscontract niet gevonden: ${contract_id}` }, { status: 404 });
      personnel_id = personnel_id || contract.personnel_id || null;
    }

    let personnel = body.personnel || null;
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id).catch(() => null);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }

    const contractCaoResolution = resolveContractCaoRequest({
      explicitCaoKey: body.cao_key || null,
      contract,
      personnel
    });
    if (contractCaoResolution.status.startsWith('blocked_')) {
      return Response.json({
        error: contractCaoResolution.blocking_reason,
        action: action || 'evaluate_contract_rules',
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        cao_key: contractCaoResolution.cao_key,
        contract_cao_resolution: contractCaoResolution,
        manual_review_required: true,
        payroll_final_allowed: false,
        contract_final_allowed: false,
        contract_rule_status: contractCaoResolution.status
      }, { status: 400 });
    }
    const targetCaoKey = contractCaoResolution.cao_key;

    const syncResult = await lazySyncCao(base44, !!force_cao_sync, targetCaoKey);
    const syncWarnings = [];
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'skipped_unsupported_cao_sync') syncWarnings.push('CAO Cloudflare lazy-sync overgeslagen: deze runtime ondersteunt alleen CAO Particuliere Beveiliging.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    const contractRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'applyCaoContractRules');
    if (!contractRuntimeSupport.supported) {
      return Response.json({
        error: contractRuntimeSupport.message,
        action: action || 'evaluate_contract_rules',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Contractregels geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        cao_key: targetCaoKey,
        contract_cao_resolution: contractCaoResolution,
        cao_runtime_support: contractRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        contract_final_allowed: false,
        contract_rule_status: contractRuntimeSupport.status
      }, { status: 422 });
    }

    // ── CAO-toepassingscheck (scope eerst resolven) ──
    let caoScope = null;
    if (targetCaoKey === CAO_PB_KEY && personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          contract,
          cao_key: targetCaoKey
        });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    } else if (targetCaoKey === CAO_PB_KEY && personnel) {
      // Inline personnel meegegeven (geen opgeslagen ID)
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel,
          contract,
          cao_key: targetCaoKey
        });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    const isUnknownOrMixed = caoScope && ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope?.cao_scope_profile);

    if (action === 'calculate_probation') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const contractBasis = await evaluateContractBasis(base44, {
        body,
        personnel,
        contract,
        targetCaoKey
      });
      const result = calculateProbationPeriod(ruleInput, caoScope);
      const combinedWarnings = [
        ...(syncWarnings || []),
        ...(contractBasis.warnings || []),
        ...(result.warnings || [])
      ];
      const combinedManualReviewRequired = contractBasis.manual_review_required === true ||
        result.manual_review_required === true ||
        isUnknownOrMixed === true;

      const shouldPersistContract = contract_id && body.save === true && result.probation_period_months !== null;
      if (shouldPersistContract) {
        await base44.entities.PersonnelContract.update(contract_id, {
          ...buildContractRulePersistence(result),
          contract_context_status: contractBasis.status,
          contract_context_missing_fields: (contractBasis.missing_evidence || []).map(item => item.field || item.rule_id).filter(Boolean),
          contract_context_checked_at: new Date().toISOString()
        });
      }

      // Backwards compatible: oude medewerkerkaart alleen bij legacy-aanroep automatisch vullen.
      if (!contract_id && personnel_id && result.probation_period_months !== null && !result.manual_review_required) {
        await base44.entities.Personnel.update(personnel_id, {
          probation_period_months: result.probation_period_months,
          probation_period_source_rule_id: result.source_rule_ids[0] || null
        });
      }

      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: combinedWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        contract_cao_resolution: contractCaoResolution,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        contract_basis: contractBasis,
        persisted_to_contract: !!shouldPersistContract,
        ...result,
        manual_review_required: combinedManualReviewRequired
      });
    }

    if (action === 'validate_call_agreement' || action === 'validate_call_notice') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const result = evaluateCallAgreementRules(ruleInput);
      return Response.json({
        success: result.contract_rule_violations.filter(v => v.severity === 'high' || v.severity === 'critical').length === 0,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: syncWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        contract_cao_resolution: contractCaoResolution,
        manual_review_required: result.call_agreement_status === 'manual_review_required',
        ...result
      });
    }

    if (action === 'validate_contract' || action === 'evaluate_contract_rules') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const contractBasis = await evaluateContractBasis(base44, {
        body,
        personnel,
        contract,
        targetCaoKey
      });
      const result = buildFullContractRuleResult(ruleInput, caoScope);
      const combinedViolations = [
        ...(contractBasis.violations || []),
        ...(result.contract_rule_violations || [])
      ];
      const combinedWarnings = [
        ...(syncWarnings || []),
        ...(contractBasis.warnings || []),
        ...(result.warnings || [])
      ];
      const combinedManualReviewRequired = contractBasis.manual_review_required === true ||
        result.manual_review_required === true ||
        isUnknownOrMixed === true;
      const combinedStatus = contractBasis.status === 'blocked' ||
        result.contract_rule_status === 'blocked' ||
        combinedViolations.some(violation => ['high', 'critical'].includes(violation.severity))
        ? 'blocked'
        : combinedManualReviewRequired
        ? 'manual_review_required'
        : result.contract_rule_status === 'compliant' && contractBasis.status === 'compliant'
        ? 'compliant'
        : result.contract_rule_status;
      const contractFinalAllowed = combinedStatus === 'compliant' &&
        contractBasis.contract_final_allowed === true &&
        !combinedManualReviewRequired;
      const responsePayload = {
        success: combinedStatus !== 'blocked',
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: combinedWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        contract_cao_resolution: contractCaoResolution,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        ...result,
        contract_basis: contractBasis,
        warnings: [...new Set(combinedWarnings.map(String))],
        contract_rule_violations: combinedViolations,
        missing_evidence: [
          ...(contractBasis.missing_evidence || []),
          ...(result.missing_evidence || [])
        ],
        manual_review_required: combinedManualReviewRequired,
        contract_rule_status: combinedStatus,
        contract_final_allowed: contractFinalAllowed,
        payroll_final_allowed: contractFinalAllowed,
        recommended_contract_update: {
          ...(contractBasis.recommended_contract_update || {}),
          ...(result.recommended_contract_update || {})
        }
      };

      const shouldPersistContract = contract_id && body.save === true;
      if (shouldPersistContract) {
        await base44.entities.PersonnelContract.update(contract_id, buildContractRulePersistence(responsePayload));
      }

      return Response.json({
        persisted_to_contract: !!shouldPersistContract,
        ...responsePayload
      });
    }

    if (action === 'validate_dismissal') {
      let baseHourlyRate = body.base_hourly_rate || null;
      if (personnel_id && !baseHourlyRate) {
        const personnel = await base44.entities.Personnel.get(personnel_id);
        if (personnel?.employee_type === 'loondienst' && targetCaoKey === CAO_PB_KEY) {
          try {
            const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
              personnel_id,
              contract,
              cao_key: targetCaoKey
            });
            const classification = classRes?.data || null;
            if (classification?.appendix_2_applies === false && Number(personnel.custom_hourly_rate || 0) > 0) {
              baseHourlyRate = Number(personnel.custom_hourly_rate);
            } else if (
              classification?.appendix_2_applies === true &&
              classification?.payroll_final_allowed === true &&
              classification?.wage_rate_found === true &&
              Number(classification?.hourly_rate || 0) > 0
            ) {
              baseHourlyRate = Number(classification.hourly_rate);
            } else {
              syncWarnings.push('Basisuurloon voor proeftijdvergoeding kon niet definitief worden bepaald; geen fallback naar schaal/periodiek toegepast.');
            }
          } catch {
            syncWarnings.push('Functie-indeling voor basisuurloon kon niet worden bepaald; geen fallback naar schaal/periodiek toegepast.');
          }
        } else if (Number(personnel?.custom_hourly_rate || 0) > 0) {
          baseHourlyRate = Number(personnel.custom_hourly_rate);
        }
      }
      const result = validateProbationDismissal({ ...body, base_hourly_rate: baseHourlyRate });
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: syncWarnings,
        contract_cao_resolution: contractCaoResolution,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: isUnknownOrMixed,
        ...result
      });
    }

    if (action === 'validate_suspension') {
      let baseHourlyRate = body.base_hourly_rate || null;
      if (personnel_id && !baseHourlyRate) {
        const personnel = await base44.entities.Personnel.get(personnel_id);
        if (personnel?.employee_type === 'loondienst' && targetCaoKey === CAO_PB_KEY) {
          try {
            const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
              personnel_id,
              contract,
              cao_key: targetCaoKey
            });
            const classification = classRes?.data || null;
            if (classification?.appendix_2_applies === false && Number(personnel.custom_hourly_rate || 0) > 0) {
              baseHourlyRate = Number(personnel.custom_hourly_rate);
            } else if (
              classification?.appendix_2_applies === true &&
              classification?.payroll_final_allowed === true &&
              classification?.wage_rate_found === true &&
              Number(classification?.hourly_rate || 0) > 0
            ) {
              baseHourlyRate = Number(classification.hourly_rate);
            } else {
              syncWarnings.push('Basisuurloon voor schorsingsdoorbetaling kon niet definitief worden bepaald; geen fallback naar schaal/periodiek toegepast.');
            }
          } catch {
            syncWarnings.push('Functie-indeling voor schorsingsbasisuurloon kon niet worden bepaald; geen fallback naar schaal/periodiek toegepast.');
          }
        } else if (Number(personnel?.custom_hourly_rate || 0) > 0) {
          baseHourlyRate = Number(personnel.custom_hourly_rate);
        }
      }

      const result = evaluateSuspensionRules({ ...body, base_hourly_rate: baseHourlyRate });
      let createdEvent = null;
      if (body.save_event === true && personnel_id) {
        createdEvent = await base44.asServiceRole.entities.PersonnelCaoEmploymentEvent.create({
          personnel_id,
          company_id: body.company_id || contract?.company_id || personnel?.primary_company_id || null,
          personnel_contract_id: contract_id || contract?.id || null,
          cao_key: targetCaoKey,
          cao_configuration_id: contract?.cao_configuration_id || body.cao_configuration_id || null,
          event_type: 'suspension',
          event_start_date: result.recommended_event_update.suspension_start_date,
          event_end_date: result.recommended_event_update.suspension_end_date,
          event_datetime: body.suspension_notified_at || body.employee_notified_at || null,
          reason: body.suspension_reason || body.reason || null,
          employee_notified_at: body.suspension_notified_at || body.employee_notified_at || null,
          written_notice_file_url: body.written_notice_file_url || null,
          base_hourly_rate: baseHourlyRate ?? null,
          scheduled_hours: result.payroll_entitlements?.[0]?.suspended_scheduled_hours ?? body.suspension_scheduled_hours ?? null,
          cao_rule_status: result.suspension_rule_status,
          manual_review_required: result.manual_review_required || isUnknownOrMixed || false,
          payroll_impact: true,
          payroll_final_allowed: result.payroll_final_allowed === true && !isUnknownOrMixed,
          source_rule_ids: result.source_rule_ids,
          rule_result_snapshot: result,
          payroll_entitlements: result.payroll_entitlements,
          violations: result.contract_rule_violations,
          warnings: result.warnings.map(w => ({ message: String(w) })),
          notes: body.notes || null
        });
      }
      return Response.json({
        success: result.suspension_rule_status !== 'blocked',
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: syncWarnings,
        personnel_id: personnel_id || null,
        contract_cao_resolution: contractCaoResolution,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: result.manual_review_required || isUnknownOrMixed,
        persisted_event_id: createdEvent?.id || null,
        ...result
      });
    }

    if (action === 'validate_contract_transfer') {
      const result = evaluateContractTransferRules(body);
      let createdEvent = null;
      if (body.save_event === true && personnel_id) {
        createdEvent = await base44.asServiceRole.entities.PersonnelCaoEmploymentEvent.create({
          personnel_id,
          company_id: body.acquiring_employer_id || body.company_id || contract?.company_id || personnel?.primary_company_id || null,
          personnel_contract_id: contract_id || contract?.id || null,
          cao_key: targetCaoKey,
          cao_configuration_id: contract?.cao_configuration_id || body.cao_configuration_id || null,
          event_type: 'contract_transfer',
          event_start_date: result.transfer_date,
          event_end_date: result.transfer_date,
          event_datetime: body.contract_transfer_datetime || null,
          reason: body.contract_transfer_reason || body.reason || null,
          employee_notified_at: body.employee_notified_at || null,
          written_notice_file_url: body.written_notice_file_url || body.mutation_list_file_url || null,
          base_hourly_rate: body.offered_base_hourly_rate ?? body.previous_base_hourly_rate ?? null,
          scheduled_hours: result.annual_contract_hours ?? null,
          cao_rule_status: result.contract_transfer_rule_status,
          manual_review_required: result.manual_review_required || isUnknownOrMixed || false,
          payroll_impact: true,
          payroll_final_allowed: result.payroll_final_allowed === true && !isUnknownOrMixed,
          source_rule_ids: result.source_rule_ids,
          rule_result_snapshot: result,
          payroll_entitlements: result.payroll_entitlements,
          violations: result.contract_rule_violations,
          warnings: result.warnings.map(w => ({ message: String(w) })),
          notes: body.notes || null
        });
      }
      return Response.json({
        success: result.contract_transfer_rule_status !== 'blocked',
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_runtime_support: contractRuntimeSupport,
        calculation_warnings: syncWarnings,
        personnel_id: personnel_id || null,
        contract_cao_resolution: contractCaoResolution,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: result.manual_review_required || isUnknownOrMixed,
        persisted_event_id: createdEvent?.id || null,
        ...result
      });
    }

    // Default: volledige contractregel-evaluatie
    const ruleInput = buildContractRuleInput(body, personnel, contract);
    const contractBasis = await evaluateContractBasis(base44, {
      body,
      personnel,
      contract,
      targetCaoKey
    });
    const result = buildFullContractRuleResult(ruleInput, caoScope);
    const combinedViolations = [
      ...(contractBasis.violations || []),
      ...(result.contract_rule_violations || [])
    ];
    const combinedWarnings = [
      ...(syncWarnings || []),
      ...(contractBasis.warnings || []),
      ...(result.warnings || [])
    ];
    const combinedManualReviewRequired = contractBasis.manual_review_required === true ||
      result.manual_review_required === true ||
      isUnknownOrMixed === true;
    const combinedStatus = contractBasis.status === 'blocked' ||
      result.contract_rule_status === 'blocked' ||
      combinedViolations.some(violation => ['high', 'critical'].includes(violation.severity))
      ? 'blocked'
      : combinedManualReviewRequired
      ? 'manual_review_required'
      : result.contract_rule_status === 'compliant' && contractBasis.status === 'compliant'
      ? 'compliant'
      : result.contract_rule_status;
    const contractFinalAllowed = combinedStatus === 'compliant' &&
      contractBasis.contract_final_allowed === true &&
      !combinedManualReviewRequired;

    const responsePayload = {
      success: combinedStatus !== 'blocked',
      cao_sync_status: caoSyncStatus,
      cao_key: targetCaoKey,
      cao_runtime_support: contractRuntimeSupport,
      contract_id: contract_id || contract?.id || null,
      personnel_id: personnel_id || null,
      contract_cao_resolution: contractCaoResolution,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      ...result,
      contract_basis: contractBasis,
      calculation_warnings: combinedWarnings,
      warnings: [...new Set(combinedWarnings.map(String))],
      contract_rule_violations: combinedViolations,
      missing_evidence: [
        ...(contractBasis.missing_evidence || []),
        ...(result.missing_evidence || [])
      ],
      manual_review_required: combinedManualReviewRequired,
      contract_rule_status: combinedStatus,
      contract_final_allowed: contractFinalAllowed,
      payroll_final_allowed: contractFinalAllowed,
      recommended_contract_update: {
        ...(contractBasis.recommended_contract_update || {}),
        ...(result.recommended_contract_update || {})
      }
    };

    const shouldPersistContract = contract_id && body.save === true;
    if (shouldPersistContract) {
      await base44.entities.PersonnelContract.update(contract_id, buildContractRulePersistence(responsePayload));
    }

    return Response.json({
      persisted_to_contract: !!shouldPersistContract,
      ...responsePayload
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

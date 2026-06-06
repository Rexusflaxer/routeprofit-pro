import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function lazySyncCao(base44, forceCaoSync = false) {
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
    rule_engine_notes: partial.rule_engine_notes || []
  };
}

function calculateProbationPeriod(input, caoScope) {
  const {
    contract_form,
    contract_start_date,
    contract_end_date,
    security_role_status
  } = input;

  const warnings = [];
  const source_rule_ids = [];
  const scope_warnings = [];

  const normalizedScope = normalizeScope(caoScope);
  const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(normalizedScope.cao_scope_profile);
  const scopeBlocksAspirant = normalizedScope.applies_full_security_rules === false;
  const duration = calculateContractDurationBoundary(contract_start_date, contract_end_date);

  // Aspirant-beveiliger regel (CAO-PB-2024-R0317): ALLEEN als full-security scope
  if (security_role_status === 'aspirant_beveiliger') {
    if (scopeBlocksAspirant) {
      scope_warnings.push({
        rule_id: 'CAO-PB-2024-R0317',
        message: `Aspirant-beveiliger proeftijdregel (R0317) NIET toegepast: medewerker valt onder artikel 3 lid 2 of scope is onbekend/gemengd (profiel: ${normalizedScope.cao_scope_profile}). Reguliere proeftijdregels gelden.`
      });
      // Doorgaan met reguliere berekening hieronder
    } else if (normalizedScope.cao_scope_profile !== 'unknown_manual_review' && normalizedScope.applies_full_security_rules) {
      // Full-security scope: aspirant-regel mag worden toegepast
      if (duration.longer_than_six_months === true) {
        source_rule_ids.push('CAO-PB-2024-R0317');
        return finalizeProbationResult(input, {
          probation_period_months: 2,
          source_rule_ids,
          warnings,
          scope_warnings,
          manual_review_required: isUnknownOrMixed
        }, duration, normalizedScope);
      }
    }
  }

  // Onbepaalde tijd → 2 maanden (CAO-PB-2024-R0316)
  if (contract_form === 'onbepaalde_tijd') {
    source_rule_ids.push('CAO-PB-2024-R0316');
    return finalizeProbationResult(input, {
      probation_period_months: 2,
      source_rule_ids,
      warnings,
      scope_warnings,
      manual_review_required: isUnknownOrMixed
    }, {
      contract_duration_months: null,
      longer_than_six_months: null,
      six_month_boundary_date: null,
      six_month_exact_last_day: null,
      warning: null
    }, normalizedScope);
  }

  // Bepaalde tijd (CAO-PB-2024-R0315)
  if (contract_form === 'bepaalde_tijd') {
    if (duration.longer_than_six_months === null) {
      return finalizeProbationResult(input, {
        probation_period_months: null,
        source_rule_ids: ['CAO-PB-2024-R0315'],
        warnings,
        scope_warnings,
        manual_review_required: true
      }, duration, normalizedScope);
    }
    if (duration.longer_than_six_months === true) {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return finalizeProbationResult(input, {
        probation_period_months: 1,
        source_rule_ids,
        warnings,
        scope_warnings,
        manual_review_required: isUnknownOrMixed
      }, duration, normalizedScope);
    } else {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return finalizeProbationResult(input, {
        probation_period_months: 0,
        source_rule_ids,
        warnings: [...warnings, 'Contract korter dan of gelijk aan 6 maanden: geen proeftijd van toepassing.'],
        scope_warnings,
        manual_review_required: isUnknownOrMixed
      }, duration, normalizedScope);
    }
  }

  // Oproep/0-uren/stage/uitzend/zzp: geen CAO-proeftijdregels
  if (['oproep', 'stage', 'uitzend', 'zzp'].includes(contract_form)) {
    return finalizeProbationResult(input, {
      probation_period_months: 0,
      source_rule_ids: [],
      warnings: [`Proeftijdregel niet van toepassing op contractvorm: ${contract_form}`],
      scope_warnings,
      manual_review_required: false
    }, duration, normalizedScope);
  }

  return finalizeProbationResult(input, {
    probation_period_months: null,
    source_rule_ids: [],
    warnings: ['Contractvorm niet herkend; proeftijd kan niet worden berekend.'],
    scope_warnings,
    manual_review_required: true
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

function hasFixedPayPeriodHours(input) {
  return numberOrNull(input.contract_hours_per_pay_period) !== null ||
    numberOrNull(input.fixed_hours_per_pay_period) !== null;
}

function inferCallAgreementType(input) {
  const explicit = input.call_agreement_type || input.call_contract_type || null;
  if (explicit && explicit !== 'unknown') return explicit;

  const minPayPeriod = numberOrNull(input.min_hours_per_pay_period);
  const maxPayPeriod = numberOrNull(input.max_hours_per_pay_period);
  const minWeek = numberOrNull(input.min_hours_per_week);
  const maxWeek = numberOrNull(input.max_hours_per_week);
  if ((minPayPeriod !== null && maxPayPeriod !== null) || (minWeek !== null && maxWeek !== null)) return 'min_max';
  if (input.annualized_hours_with_bandwidth === true || numberOrNull(input.annual_contract_hours) !== null) return 'annualized_bandwidth';
  if (input.no_work_no_pay_first_6_months === true) return 'no_work_no_pay_first_6_months';
  if (input.contract_form === 'oproep') return 'zero_hours';
  if (!hasFixedPayPeriodHours(input)) return 'zero_hours';
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

function buildFullContractRuleResult(input, caoScope) {
  const probation = calculateProbationPeriod(input, caoScope);
  const callAgreement = evaluateCallAgreementRules(input);
  const internship = evaluateInternshipContractRules(input);
  const sourceRuleIds = [...new Set([
    ...(probation.source_rule_ids || []),
    ...(callAgreement.source_rule_ids || []),
    ...(internship.source_rule_ids || [])
  ])];
  const warnings = [
    ...(probation.warnings || []),
    ...(callAgreement.warnings || []),
    ...(internship.warnings || [])
  ];
  const scopeWarnings = probation.scope_warnings || [];
  const contractRuleViolations = [
    ...(probation.contract_rule_violations || []),
    ...(callAgreement.contract_rule_violations || []),
    ...(internship.contract_rule_violations || [])
  ];
  const payrollEntitlements = [
    ...(callAgreement.payroll_entitlements || []),
    ...(internship.payroll_entitlements || [])
  ];
  const hasBlockingViolation = contractRuleViolations.some(v => v.severity === 'high' || v.severity === 'critical');
  const manualReviewRequired = probation.manual_review_required === true ||
    callAgreement.call_agreement_status === 'manual_review_required' ||
    internship.internship_rule_status === 'manual_review_required';
  const contractRuleStatus = hasBlockingViolation ||
    probation.contract_rule_status === 'blocked' ||
    callAgreement.call_agreement_status === 'blocked' ||
    internship.internship_rule_status === 'blocked'
    ? 'blocked'
    : manualReviewRequired
    ? 'manual_review_required'
    : probation.probation_compliant === true && callAgreement.call_agreement_compliant === true && internship.internship_compliant === true
    ? 'compliant'
    : 'calculated';

  return {
    ...probation,
    probation_rule_result: {
      probation_period_months: probation.probation_period_months,
      requested_probation_period_months: probation.requested_probation_period_months,
      probation_validation_status: probation.probation_validation_status,
      probation_compliant: probation.probation_compliant,
      contract_duration_months: probation.contract_duration_months,
      longer_than_six_months: probation.longer_than_six_months,
      six_month_boundary_date: probation.six_month_boundary_date,
      six_month_exact_last_day: probation.six_month_exact_last_day,
      source_rule_ids: probation.source_rule_ids,
      manual_review_required: probation.manual_review_required,
      warnings: probation.warnings,
      scope_warnings: probation.scope_warnings,
      contract_rule_violations: probation.contract_rule_violations
    },
    call_agreement_rule_result: callAgreement,
    internship_rule_result: internship,
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
    source_rule_ids: sourceRuleIds,
    warnings,
    scope_warnings: scopeWarnings,
    contract_rule_violations: contractRuleViolations,
    payroll_entitlements: payrollEntitlements,
    manual_review_required: manualReviewRequired,
    contract_rule_status: contractRuleStatus,
    recommended_contract_update: {
      ...(probation.recommended_contract_update || {}),
      ...(callAgreement.recommended_contract_update || {}),
      ...(internship.recommended_contract_update || {})
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
    contract_start_date: pickFirst(body.contract_start_date, contract?.contract_start_date, personnel?.contract_start_date),
    contract_end_date: pickFirst(body.contract_end_date, contract?.contract_end_date, personnel?.contract_end_date),
    security_role_status: pickFirst(body.security_role_status, contract?.security_role_status, personnel?.security_role_status, 'unknown'),
    call_agreement_type: pickFirst(body.call_agreement_type, contract?.call_agreement_type, null),
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
    reference_date: pickFirst(body.reference_date, null),
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
  return {
    contract_duration_months: result.contract_duration_months,
    probation_period_months: result.probation_period_months,
    probation_period_source_rule_id: getProbationSourceRuleId(result),
    probation_period_manual_review_required: result.probation_rule_result?.manual_review_required ?? result.manual_review_required,
    probation_period_validation_status: result.probation_validation_status,
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
      call_agreement: result.call_agreement_rule_result || null,
      internship: result.internship_rule_result || null
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

    const syncResult = await lazySyncCao(base44, !!force_cao_sync);
    const syncWarnings = [];
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

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

    // ── CAO-toepassingscheck (scope eerst resolven) ──
    let caoScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id, contract });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    } else if (personnel) {
      // Inline personnel meegegeven (geen opgeslagen ID)
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel, contract });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    const isUnknownOrMixed = caoScope && ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope?.cao_scope_profile);

    if (action === 'calculate_probation') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const result = calculateProbationPeriod(ruleInput, caoScope);

      const shouldPersistContract = contract_id && body.save === true && result.probation_period_months !== null;
      if (shouldPersistContract) {
        await base44.entities.PersonnelContract.update(contract_id, buildContractRulePersistence(result));
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
        calculation_warnings: syncWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: result.manual_review_required || isUnknownOrMixed,
        persisted_to_contract: !!shouldPersistContract,
        ...result
      });
    }

    if (action === 'validate_call_agreement' || action === 'validate_call_notice') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const result = evaluateCallAgreementRules(ruleInput);
      return Response.json({
        success: result.contract_rule_violations.filter(v => v.severity === 'high' || v.severity === 'critical').length === 0,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: syncWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        manual_review_required: result.call_agreement_status === 'manual_review_required',
        ...result
      });
    }

    if (action === 'validate_contract' || action === 'evaluate_contract_rules') {
      const ruleInput = buildContractRuleInput(body, personnel, contract);
      const result = buildFullContractRuleResult(ruleInput, caoScope);

      const shouldPersistContract = contract_id && body.save === true;
      if (shouldPersistContract) {
        await base44.entities.PersonnelContract.update(contract_id, buildContractRulePersistence(result));
      }

      return Response.json({
        success: result.contract_rule_status !== 'blocked',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: syncWarnings,
        contract_id: contract_id || contract?.id || null,
        personnel_id: personnel_id || null,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: result.manual_review_required || isUnknownOrMixed,
        persisted_to_contract: !!shouldPersistContract,
        ...result
      });
    }

    if (action === 'validate_dismissal') {
      let baseHourlyRate = body.base_hourly_rate || null;
      if (personnel_id && !baseHourlyRate) {
        const personnel = await base44.entities.Personnel.get(personnel_id);
        if (personnel?.employee_type === 'loondienst' && personnel?.cao === 'cao_particuliere_beveiliging') {
          try {
            const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', { personnel_id });
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
        calculation_warnings: syncWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: isUnknownOrMixed,
        ...result
      });
    }

    // Default: volledige contractregel-evaluatie
    const ruleInput = buildContractRuleInput(body, personnel, contract);
    const result = buildFullContractRuleResult(ruleInput, caoScope);
    return Response.json({
      success: result.contract_rule_status !== 'blocked',
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      contract_id: contract_id || contract?.id || null,
      personnel_id: personnel_id || null,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      manual_review_required: result.manual_review_required || isUnknownOrMixed,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

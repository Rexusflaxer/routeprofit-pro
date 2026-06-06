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

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function buildContractRuleInput(body, personnel, contract) {
  const hasContractContext = !!contract;
  return {
    contract_form: pickFirst(body.contract_form, contract?.contract_form, personnel?.contract_form),
    contract_start_date: pickFirst(body.contract_start_date, contract?.contract_start_date, personnel?.contract_start_date),
    contract_end_date: pickFirst(body.contract_end_date, contract?.contract_end_date, personnel?.contract_end_date),
    security_role_status: pickFirst(body.security_role_status, contract?.security_role_status, personnel?.security_role_status, 'unknown'),
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
    probation_period_source_rule_id: result.source_rule_ids[0] || null,
    probation_period_manual_review_required: result.manual_review_required,
    probation_period_validation_status: result.probation_validation_status,
    cao_contract_rule_status: result.contract_rule_status,
    cao_contract_rule_checked_at: new Date().toISOString(),
    cao_contract_rule_source_rule_ids: result.source_rule_ids,
    cao_contract_rule_results: {
      probation: {
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
      }
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

    if (action === 'calculate_probation' || action === 'validate_contract' || action === 'evaluate_contract_rules') {
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

    // Default: bereken proeftijd
    const ruleInput = buildContractRuleInput(body, personnel, contract);
    const result = calculateProbationPeriod(ruleInput, caoScope);
    return Response.json({
      success: true,
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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : key
      ? `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Verlof-/ziekteregels zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
      : `Runtime ${functionName} mist cao_key. Verlof-/ziekteregels zijn geblokkeerd zodat geen PB-default wordt toegepast.`
  };
}

async function lazySyncCao(base44, forceCaoSync = false, caoKey = null) {
  if (caoKey !== CAO_PB_KEY) {
    return {
      changed: false,
      reason: caoKey ? 'skipped_unsupported_cao_sync' : 'skipped_missing_cao_key',
      cao_key: caoKey,
      note: 'Lazy Cloudflare sync is alleen ingericht voor CAO Particuliere Beveiliging.'
    };
  }
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_leave_sickness',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB verlof- en ziekteberekeningen
 * R0999: vakantieopbouw fulltime 172,8 uur/24 dagen per jaar, 13,3 uur per 4 weken
 * R1149: wachtdag eerste ziektedag bij < 13 loonperioden brancheancienniteit
 * R1159: eerste 6 maanden ziekte 100%
 * R1160: tweede 6 maanden ziekte 90%
 */

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return null;
}

function firstObject(...values) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function parameterSource(field, configuredValue, fallbackValue, fallbackSourceRuleIds) {
  return {
    field,
    source: configuredValue !== null && configuredValue !== undefined ? 'cao_configuration' : 'cao_pb_runtime_default',
    configured_value_present: configuredValue !== null && configuredValue !== undefined,
    value: configuredValue !== null && configuredValue !== undefined ? configuredValue : fallbackValue,
    fallback_source_rule_ids: fallbackSourceRuleIds
  };
}

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

function contractCoversDate(contract, referenceDate) {
  const date = asIsoDate(referenceDate);
  if (!contract || !date) return false;
  const start = asIsoDate(contract.contract_start_date || contract.start_date || contract.employment_start_date);
  const end = asIsoDate(contract.contract_end_date || contract.end_date || contract.employment_end_date) || '9999-12-31';
  if (!start) return false;
  return start <= date && date <= end;
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}

function leaveSicknessReferenceDate(body) {
  return asIsoDate(
    body.reference_date ||
    body.service_date ||
    body.shift_date ||
    body.date ||
    body.period_end_date ||
    body.sickness_start_date ||
    body.vacation_start_date ||
    body.leave_start_date ||
    body.service_context?.service_date ||
    body.service_context?.date ||
    new Date().toISOString()
  );
}

function resolveContractCaoForDate({ explicitCaoKey, contract, contracts = [], referenceDate }) {
  const date = asIsoDate(referenceDate);
  const sourceContracts = contract ? [contract] : (contracts || []).filter(item => contractCoversDate(item, date));
  const contractCaoKeys = uniqueNonEmpty(sourceContracts.map(item => item.cao_key));
  const resolution = {
    reference_date: date,
    selected_contract_ids: sourceContracts.map(item => item.id).filter(Boolean),
    selected_contract_cao_keys: contractCaoKeys,
    cao_key: contractCaoKeys.length === 1 ? contractCaoKeys[0] : null,
    selected_contract: sourceContracts.length === 1 ? sourceContracts[0] : null,
    status: 'resolved'
  };

  if (explicitCaoKey && contractCaoKeys.length === 1 && contractCaoKeys[0] !== explicitCaoKey) {
    return {
      ...resolution,
      status: 'blocked_explicit_cao_contract_mismatch',
      blocking_reason: `Expliciete cao_key ${explicitCaoKey} botst met contract-CAO ${contractCaoKeys[0]} op ${date}.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length > 1) {
    return {
      ...resolution,
      status: 'blocked_ambiguous_contract_cao_key',
      blocking_reason: `Meerdere contract-CAO's actief op ${date}: ${contractCaoKeys.join(', ')}.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length === 0 && sourceContracts.length > 0) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_cao_key',
      manual_review_required: true,
      blocking_reason: `Contract actief op ${date}, maar cao_key ontbreekt op het contract.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length === 0) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_or_explicit_cao_key',
      manual_review_required: true,
      blocking_reason: 'Verlof-/ziekteregels vereisen een expliciete cao_key of een actief arbeidscontract met cao_key. Medewerkerstamdata of PB-default mag niet als bron worden gebruikt.'
    };
  }

  return resolution;
}

function activeCaoConfigurationCandidates(configs, referenceDate) {
  const ref = asIsoDate(referenceDate || new Date().toISOString());
  return (configs || [])
    .filter(config => config.status === 'active' || config.is_active === true)
    .filter(config => !config.valid_from || config.valid_from <= ref)
    .filter(config => !config.valid_until || config.valid_until >= ref)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));
}

async function resolveActiveCaoConfig(base44, referenceDate, caoKey) {
  const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({
    status: 'active',
    cao_key: caoKey
  });
  const candidates = activeCaoConfigurationCandidates(configs, referenceDate);
  const summarizedCandidates = candidates.map(config => ({
    id: config.id,
    name: config.name || config.version_label || null,
    cloudflare_revision: config.cloudflare_revision || null,
    valid_from: config.valid_from || null,
    valid_until: config.valid_until || null
  }));

  if (candidates.length > 1) {
    return {
      config: null,
      candidates: summarizedCandidates,
      status: 'blocked_ambiguous_active_cao_config',
      message: `Meerdere actieve CAO-configuraties gevonden voor ${caoKey} op ${asIsoDate(referenceDate)}; verlof-/ziekteberekening is geblokkeerd om historische CAO-keuze niet te gokken.`
    };
  }
  if (candidates.length === 0) {
    return {
      config: null,
      candidates: [],
      status: 'blocked_missing_active_cao_config',
      message: `Geen actieve CAO-configuratie gevonden voor ${caoKey} op ${asIsoDate(referenceDate)}.`
    };
  }
  return {
    config: candidates[0],
    candidates: summarizedCandidates,
    status: 'resolved',
    message: null
  };
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
    source_coverage_passed: snapshot?.source_coverage?.passed ?? null
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
  const blockingFindings = gate?.blocking_findings || [];

  return {
    ready,
    status: ready ? 'ready' : !registryReady ? 'blocked_missing_rule_registry_fingerprint' : (status || 'unknown'),
    is_payroll_ready: caoConfig?.is_payroll_ready === true,
    gate_present: !!gate,
    rule_registry_fingerprint_present: !!registrySnapshot.fingerprint,
    rule_registry_rule_count: registrySnapshot.rule_count,
    blocking_findings: registryReady
      ? blockingFindings
      : [
        {
          code: 'missing_rule_registry_fingerprint',
          severity: 'critical',
          message: 'CAOConfiguration mist rule_registry_fingerprint; definitieve verlof-/ziekteberekening is niet audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

function daysBetweenInclusive(startDate, endDate) {
  const start = dateFromIso(startDate);
  const end = dateFromIso(endDate);
  if (!start || !end || end < start) return null;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function isCallWorker(input) {
  const callType = input.call_agreement_type || input.call_contract_type || null;
  return input.is_call_worker === true ||
    input.contract_type === '0_uren' ||
    input.contract_type === 'oproep' ||
    input.contract_form === 'oproep' ||
    ['zero_hours', 'min_max', 'pre_agreement', 'annualized_bandwidth', 'no_work_no_pay_first_6_months'].includes(callType);
}

function extraVacationDaysForServiceYears(years) {
  const serviceYears = numberOrNull(years);
  if (serviceYears === null || serviceYears < 5) return 0;
  if (serviceYears >= 40) return 8;
  return Math.floor(serviceYears / 5);
}

function resolveLeaveSicknessParameters(caoConfig) {
  const leaveRules = caoConfig?.leave_rules || {};
  const sicknessRules = caoConfig?.sickness_rules || {};
  const cashValueRules = caoConfig?.cash_value_logistics_rules || {};
  const standardVacation = firstObject(
    leaveRules.standard_vacation,
    leaveRules.article_59,
    leaveRules.vacation_accrual,
    leaveRules.vakantieopbouw
  );
  const callWorkerVacation = firstObject(
    leaveRules.call_worker_vacation,
    leaveRules.call_worker_vacation_payout,
    leaveRules.oproepkracht_vakantie,
    leaveRules.article_59_call_worker
  );
  const cashValueVacation = firstObject(
    leaveRules.cash_value_vacation,
    cashValueRules.vacation_accrual,
    cashValueRules.article_100_vacation
  );

  const standardAnnualHours = firstNumber(standardVacation.fulltime_annual_hours, standardVacation.annual_hours, leaveRules.fulltime_annual_vacation_hours);
  const standardAnnualDays = firstNumber(standardVacation.fulltime_annual_days, standardVacation.annual_days, leaveRules.fulltime_annual_vacation_days);
  const standardPerPeriodHours = firstNumber(standardVacation.fulltime_per_period_hours, standardVacation.per_pay_period_hours, leaveRules.fulltime_vacation_hours_per_pay_period);
  const standardFulltimePeriodHours = firstNumber(standardVacation.fulltime_period_hours, standardVacation.fulltime_hours_per_pay_period, leaveRules.fulltime_hours_per_pay_period);
  const standardWeeklyHours = firstNumber(standardVacation.fulltime_weekly_hours, standardVacation.weekly_hours, leaveRules.fulltime_weekly_hours);
  const standardVacationDayHours = firstNumber(standardVacation.vacation_day_hours, leaveRules.vacation_day_hours);
  const callWorkerPayoutPercentage = firstNumber(callWorkerVacation.payout_percentage, callWorkerVacation.vacation_payout_percentage, leaveRules.call_worker_vacation_payout_percentage);
  const callWorkerMaxHoursPerPeriod = firstNumber(
    callWorkerVacation.max_hours_per_period,
    callWorkerVacation.max_hours_per_pay_period,
    callWorkerVacation.max_paid_hours_per_pay_period,
    leaveRules.call_worker_vacation_max_hours_per_period
  );

  const cashValueAnnualHours = firstNumber(cashValueVacation.fulltime_annual_hours, cashValueVacation.annual_hours);
  const cashValueAnnualDays = firstNumber(cashValueVacation.fulltime_annual_days, cashValueVacation.annual_days);
  const cashValuePerPeriodHours = firstNumber(cashValueVacation.fulltime_per_period_hours, cashValueVacation.per_pay_period_hours);
  const cashValueFulltimePeriodHours = firstNumber(cashValueVacation.fulltime_period_hours, cashValueVacation.fulltime_hours_per_pay_period, standardFulltimePeriodHours);
  const cashValueWeeklyHours = firstNumber(cashValueVacation.fulltime_weekly_hours, cashValueVacation.weekly_hours, standardWeeklyHours);
  const cashValueVacationDayHours = firstNumber(cashValueVacation.vacation_day_hours, standardVacationDayHours);

  const waitingDaySeniorityPeriods = firstNumber(sicknessRules.waiting_day_seniority_periods, sicknessRules.waiting_day_threshold_pay_periods, sicknessRules.article_66_waiting_day_threshold_periods);
  const shortSeniorityPercentage = firstNumber(sicknessRules.short_seniority_payment_percentage, sicknessRules.payment_percentage_under_waiting_day_threshold);
  const callWorkerPercentage = firstNumber(sicknessRules.call_worker_payment_percentage, sicknessRules.call_agreement_payment_percentage);
  const firstSixMonthsPercentage = firstNumber(sicknessRules.first_six_months_percentage, sicknessRules.first_6_months_percentage);
  const secondSixMonthsPercentage = firstNumber(sicknessRules.second_six_months_percentage, sicknessRules.second_6_months_percentage);
  const secondYearPercentage = firstNumber(sicknessRules.second_year_reintegration_percentage, sicknessRules.second_year_percentage);
  const thirdFourthYearSupplementPercentage = firstNumber(sicknessRules.third_fourth_year_supplement_percentage, sicknessRules.wga_supplement_percentage);
  const firstSixMonthsDays = firstNumber(sicknessRules.first_six_months_days, sicknessRules.first_6_months_days);
  const secondSixMonthsDays = firstNumber(sicknessRules.second_six_months_days, sicknessRules.second_6_months_days);
  const secondYearDays = firstNumber(sicknessRules.second_year_days);
  const thirdFourthYearDays = firstNumber(sicknessRules.third_fourth_year_days);

  return {
    standard_vacation: {
      profile: 'standard_article_59',
      fulltimeAnnualHours: standardAnnualHours ?? 172.8,
      fulltimeAnnualDays: standardAnnualDays ?? 24,
      fulltimePerPeriodHours: standardPerPeriodHours ?? 13.3,
      fulltimePeriodHours: standardFulltimePeriodHours ?? 144,
      fulltimeWeeklyHours: standardWeeklyHours ?? 36,
      vacationDayHours: standardVacationDayHours ?? 7.2,
      ruleIds: standardVacation.source_rule_ids || ['CAO-PB-2024-R0999'],
      extraVacationDaysPolicy: standardVacation.extra_vacation_days_policy || 'article_59_lid_4',
      extraVacationDaysManualReviewRequired: standardVacation.extra_vacation_days_manual_review_required === true
    },
    cash_value_vacation: {
      profile: 'cash_value_logistics',
      fulltimeAnnualHours: cashValueAnnualHours ?? 180,
      fulltimeAnnualDays: cashValueAnnualDays ?? 25,
      fulltimePerPeriodHours: cashValuePerPeriodHours ?? 13.85,
      fulltimePeriodHours: cashValueFulltimePeriodHours ?? 144,
      fulltimeWeeklyHours: cashValueWeeklyHours ?? 36,
      vacationDayHours: cashValueVacationDayHours ?? 7.2,
      ruleIds: cashValueVacation.source_rule_ids || ['CAO-PB-2024-R1601', 'CAO-PB-2024-R1602'],
      extraVacationDaysPolicy: cashValueVacation.extra_vacation_days_policy || 'manual_review_article_100_deviates_from_article_59',
      extraVacationDaysManualReviewRequired: cashValueVacation.extra_vacation_days_manual_review_required !== false
    },
    call_worker_vacation_payout_percentage: callWorkerPayoutPercentage ?? 9.24,
    call_worker_vacation_max_hours_per_period: callWorkerMaxHoursPerPeriod ?? 144,
    sickness: {
      waiting_day_seniority_periods: waitingDaySeniorityPeriods ?? 13,
      short_seniority_payment_percentage: shortSeniorityPercentage ?? 70,
      call_worker_payment_percentage: callWorkerPercentage ?? 70,
      first_six_months_days: firstSixMonthsDays ?? 182,
      second_six_months_days: secondSixMonthsDays ?? 183,
      second_year_days: secondYearDays ?? 365,
      third_fourth_year_days: thirdFourthYearDays ?? 730,
      first_six_months_percentage: firstSixMonthsPercentage ?? 100,
      second_six_months_percentage: secondSixMonthsPercentage ?? 90,
      second_year_reintegration_percentage: secondYearPercentage ?? 85,
      third_fourth_year_supplement_percentage: thirdFourthYearSupplementPercentage ?? 10
    },
    provenance: {
      standard_vacation_annual_hours: parameterSource('leave_rules.standard_vacation.fulltime_annual_hours', standardAnnualHours, 172.8, ['CAO-PB-2024-R0999']),
      standard_vacation_per_period_hours: parameterSource('leave_rules.standard_vacation.fulltime_per_period_hours', standardPerPeriodHours, 13.3, ['CAO-PB-2024-R0999']),
      call_worker_vacation_payout_percentage: parameterSource('leave_rules.call_worker_vacation.payout_percentage', callWorkerPayoutPercentage, 9.24, ['CAO-PB-2024-R1016']),
      call_worker_vacation_max_hours_per_period: parameterSource('leave_rules.call_worker_vacation.max_hours_per_period', callWorkerMaxHoursPerPeriod, 144, ['CAO-PB-2024-R1016']),
      waiting_day_seniority_periods: parameterSource('sickness_rules.waiting_day_seniority_periods', waitingDaySeniorityPeriods, 13, ['CAO-PB-2024-R1149']),
      short_seniority_payment_percentage: parameterSource('sickness_rules.short_seniority_payment_percentage', shortSeniorityPercentage, 70, ['CAO-PB-2024-R1148']),
      call_worker_payment_percentage: parameterSource('sickness_rules.call_worker_payment_percentage', callWorkerPercentage, 70, ['CAO-PB-2024-R1172']),
      sickness_first_six_months_percentage: parameterSource('sickness_rules.first_six_months_percentage', firstSixMonthsPercentage, 100, ['CAO-PB-2024-R1159']),
      sickness_second_six_months_percentage: parameterSource('sickness_rules.second_six_months_percentage', secondSixMonthsPercentage, 90, ['CAO-PB-2024-R1160']),
      sickness_second_year_reintegration_percentage: parameterSource('sickness_rules.second_year_reintegration_percentage', secondYearPercentage, 85, ['CAO-PB-2024-R1161'])
    }
  };
}

function getVacationAccrualProfile(input, parameters = resolveLeaveSicknessParameters(null)) {
  if (input?.cao_scope_profile === 'cash_value_logistics' || input?.works_cash_value_logistics === true) {
    return parameters.cash_value_vacation;
  }
  return parameters.standard_vacation;
}

function calculateVacationAccrual(input, parameters = resolveLeaveSicknessParameters(null)) {
  const profile = getVacationAccrualProfile(input, parameters);
  const fulltimeAnnualHours = profile.fulltimeAnnualHours;
  const fulltimeAnnualDays = profile.fulltimeAnnualDays;
  const fulltimePerPeriodHours = profile.fulltimePerPeriodHours;
  const fulltimePeriodHours = profile.fulltimePeriodHours;
  const fulltimeWeeklyHours = profile.fulltimeWeeklyHours;
  const ruleIds = [...profile.ruleIds];
  const warnings = [];
  const missingEvidence = [];
  let manualReviewRequired = false;

  if (isCallWorker(input)) {
    const workedHours = numberOrNull(input.worked_hours) ??
      numberOrNull(input.period_hours) ??
      numberOrNull(input.paid_hours_per_pay_period) ??
      0;
    const maxPayoutHours = parameters.call_worker_vacation_max_hours_per_period ?? fulltimePeriodHours;
    const payoutBaseHours = Math.min(workedHours, maxPayoutHours);
    const hourlyRate = numberOrNull(input.base_hourly_rate) ?? numberOrNull(input.hourly_rate);
    const explicitBaseAmount = numberOrNull(input.vacation_payout_base_amount) ??
      numberOrNull(input.period_gross_wage) ??
      numberOrNull(input.gross_wage_for_vacation);
    const payoutBaseAmount = explicitBaseAmount !== null
      ? explicitBaseAmount
      : hourlyRate !== null
      ? payoutBaseHours * hourlyRate
      : null;

    if (payoutBaseAmount === null) {
      manualReviewRequired = true;
      missingEvidence.push({
        field: 'vacation_payout_base_amount/base_hourly_rate',
        rule_id: 'CAO-PB-2024-R1016',
        message: `Voor oproepkrachten moet de ${parameters.call_worker_vacation_payout_percentage}% vakantietoeslag over het loon van maximaal ${maxPayoutHours} uur per loonperiode worden berekend.`
      });
    }

    return {
      rule_ids: ['CAO-PB-2024-R1014', 'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017'],
      vacation_accrual_type: 'call_worker_paid_in_money',
      vacation_days_takeable: false,
      vacation_payout_percentage: parameters.call_worker_vacation_payout_percentage,
      worked_hours: workedHours,
      payout_base_hours: payoutBaseHours,
      max_payout_hours_per_pay_period: maxPayoutHours,
      capped_at_max_hours_per_pay_period: workedHours > maxPayoutHours,
      capped_at_144_hours_per_pay_period: workedHours > 144,
      payout_base_amount: payoutBaseAmount !== null ? round2(payoutBaseAmount) : null,
      vacation_payout_amount: payoutBaseAmount !== null
        ? round2(payoutBaseAmount * (parameters.call_worker_vacation_payout_percentage / 100))
        : null,
      vacation_hours_accrued_per_period: 0,
      vacation_hours_annual: 0,
      parameter_provenance: {
        vacation_payout_percentage: parameters.provenance.call_worker_vacation_payout_percentage,
        max_payout_hours_per_pay_period: parameters.provenance.call_worker_vacation_max_hours_per_period
      },
      manual_review_required: manualReviewRequired,
      payroll_final_allowed: !manualReviewRequired,
      missing_evidence: missingEvidence,
      warnings,
      note: `Oproepkracht: geen opneembare vakantiedagen; ${parameters.call_worker_vacation_payout_percentage}% uitbetaling per loonperiode over loon van maximaal ${maxPayoutHours} uur.`
    };
  }

  const paidHoursPerPeriod = numberOrNull(input.paid_hours_per_pay_period) ??
    numberOrNull(input.period_hours) ??
    numberOrNull(input.contract_hours_per_pay_period) ??
    (numberOrNull(input.weekly_hours) !== null ? numberOrNull(input.weekly_hours) * 4 : fulltimePeriodHours);
  const cappedPaidHours = Math.min(Math.max(paidHoursPerPeriod, 0), fulltimePeriodHours);
  const parttimeRatio = cappedPaidHours / fulltimePeriodHours;
  const serviceYears = numberOrNull(input.continuous_service_years) ??
    numberOrNull(input.security_industry_service_years) ??
    null;
  const extraVacationDays = profile.extraVacationDaysManualReviewRequired ? 0 : extraVacationDaysForServiceYears(serviceYears);
  const extraVacationHoursAnnual = extraVacationDays * profile.vacationDayHours * parttimeRatio;

  if (serviceYears === null) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'continuous_service_years/security_industry_service_years',
      rule_id: 'CAO-PB-2024-R1019',
      message: 'Dienstjaren ontbreken; extra vakantiedagen vanaf 5 dienstjaren kunnen niet definitief worden vastgesteld.'
    });
  } else {
    ruleIds.push('CAO-PB-2024-R1019', 'CAO-PB-2024-R1022');
  }

  if (profile.extraVacationDaysManualReviewRequired) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'cao_scope_profile',
      rule_id: 'CAO-PB-2024-R1602',
      message: 'Geld- en waardelogistiek gebruikt de afwijkende vakantie-opbouw van art. 100 (180 uur/25 dagen, 13,85 uur per loonperiode); eventuele extra vakantiedagen uit art. 59 blijven handmatige review.'
    });
  }

  if (paidHoursPerPeriod > fulltimePeriodHours) {
    warnings.push('Vakantieopbouw is afgetopt op 144 betaalde uren per loonperiode.');
  }

  return {
    rule_ids: ruleIds,
    vacation_accrual_type: profile.profile === 'cash_value_logistics'
      ? 'cash_value_logistics_time_off_accrual'
      : parttimeRatio < 1 ? 'parttime_time_off_accrual' : 'fulltime_time_off_accrual',
    vacation_entitlement_profile: profile.profile,
    fulltime_reference_hours_per_pay_period: fulltimePeriodHours,
    fulltime_reference_weekly_hours: fulltimeWeeklyHours,
    paid_hours_per_pay_period: paidHoursPerPeriod,
    capped_paid_hours_per_pay_period: cappedPaidHours,
    parttime_ratio: round2(parttimeRatio),
    vacation_hours_accrued_per_period: round2(fulltimePerPeriodHours * parttimeRatio),
    statutory_and_above_statutory_vacation_hours_annual: round2(fulltimeAnnualHours * parttimeRatio),
    statutory_and_above_statutory_vacation_days_annual_fulltime_basis: fulltimeAnnualDays,
    extra_vacation_days_annual_fulltime_basis: extraVacationDays,
    extra_vacation_days_policy: profile.extraVacationDaysPolicy,
    extra_vacation_days_manual_review_required: profile.extraVacationDaysManualReviewRequired,
    extra_vacation_hours_annual: round2(extraVacationHoursAnnual),
    vacation_hours_annual_total: round2((fulltimeAnnualHours * parttimeRatio) + extraVacationHoursAnnual),
    manual_review_required: manualReviewRequired,
    payroll_final_allowed: !manualReviewRequired,
    missing_evidence: missingEvidence,
    warnings,
    note: parttimeRatio < 1
      ? `Parttime vakantieopbouw naar rato over ${cappedPaidHours} betaalde uren per loonperiode.`
      : 'Fulltime vakantieopbouw op basis van 144 uur per loonperiode / 36 uur per week.'
  };
}

function waitingDayExceptionApplies(input) {
  return booleanOrNull(input.company_accident_or_occupational_disease) === true ||
    booleanOrNull(input.pregnancy_or_childbirth_related) === true ||
    booleanOrNull(input.organ_donation_related) === true ||
    booleanOrNull(input.disabled_employee_status) === true;
}

function calculateSicknessPayment(input, parameters = resolveLeaveSicknessParameters(null)) {
  const {
    sickness_start_date,
    sickness_end_date,
    industry_seniority_periods, // brancheancienniteit in loonperioden
    base_gross_salary,
    avg_ort_per_period
  } = input;

  if (!sickness_start_date || !base_gross_salary) {
    return { error: 'sickness_start_date en base_gross_salary zijn verplicht' };
  }

  const warnings = [];
  const missingEvidence = [];
  const ruleIds = ['CAO-PB-2024-R1165', 'CAO-PB-2024-R1166'];
  let manualReviewRequired = false;
  const contractEndDate = asIsoDate(input.contract_end_date || input.employment_end_date);
  const requestedEndDate = asIsoDate(sickness_end_date) || new Date().toISOString().slice(0, 10);
  const effectiveEndDate = contractEndDate && contractEndDate < requestedEndDate ? contractEndDate : requestedEndDate;
  const calendarSicknessDays = daysBetweenInclusive(sickness_start_date, effectiveEndDate);
  if (calendarSicknessDays === null) return { error: 'sickness_start_date/sickness_end_date zijn ongeldig' };
  if (contractEndDate && contractEndDate < requestedEndDate) {
    warnings.push('Ziekteloon is afgekapt op de einddatum van de arbeidsovereenkomst.');
    ruleIds.push('CAO-PB-2024-R1155', 'CAO-PB-2024-R1163');
  }

  const explicitPayableDays = numberOrNull(input.sickness_payable_days) ??
    numberOrNull(input.scheduled_sickness_days) ??
    numberOrNull(input.social_insurance_days);
  const sicknessDays = explicitPayableDays ?? calendarSicknessDays;
  if (explicitPayableDays === null) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'sickness_payable_days/scheduled_sickness_days/social_insurance_days',
      rule_id: 'CAO-PB-2024-R1167',
      message: 'Artikel 67 rekent met ingeroosterde diensten/tijdvakken/sociale-verzekeringsdagen. Zonder die evidence is een kalenderdagberekening conceptmatig.'
    });
  }

  const seniority = numberOrNull(industry_seniority_periods) ?? 0;
  const dailySalary = numberOrNull(input.daily_sickness_salary) ??
    ((numberOrNull(base_gross_salary) + (numberOrNull(avg_ort_per_period) ?? 0)) / (numberOrNull(input.payable_days_per_pay_period) ?? 20));

  const callAgreementType = input.call_agreement_type || input.call_contract_type || null;
  if (isCallWorker(input)) {
    ruleIds.push('CAO-PB-2024-R1172');
    const withinCallPeriod = booleanOrNull(input.sickness_started_during_call_period);
    if (callAgreementType === 'pre_agreement' || callAgreementType === 'zero_hours') {
      ruleIds.push(...(callAgreementType === 'pre_agreement'
        ? ['CAO-PB-2024-R1173', 'CAO-PB-2024-R1174', 'CAO-PB-2024-R1175', 'CAO-PB-2024-R1176']
        : ['CAO-PB-2024-R1177', 'CAO-PB-2024-R1178', 'CAO-PB-2024-R1179', 'CAO-PB-2024-R1180', 'CAO-PB-2024-R1181']));
      if (withinCallPeriod !== true) {
        const zeroHoursAverageClaimAssessed = callAgreementType === 'zero_hours'
          ? booleanOrNull(input.zero_hours_52_week_average_claim_assessed) === true
          : true;
        const outsideCallManualReview = withinCallPeriod === null || !zeroHoursAverageClaimAssessed;
        const outsideCallMissingEvidence = [];
        if (withinCallPeriod === null) {
          outsideCallMissingEvidence.push({
            field: 'sickness_started_during_call_period',
            rule_id: callAgreementType === 'pre_agreement' ? 'CAO-PB-2024-R1174' : 'CAO-PB-2024-R1178',
            message: 'Bij voorovereenkomst/nul-uren moet bekend zijn of ziekte tijdens een oproepperiode is begonnen.'
          });
        }
        if (!zeroHoursAverageClaimAssessed) {
          outsideCallMissingEvidence.push({
            field: 'zero_hours_52_week_average_claim_assessed',
            rule_id: 'CAO-PB-2024-R1181',
            message: 'Bij nul-urencontracten kan buiten de oproepperiode in sommige gevallen een 52-weken aanspraak bestaan; leg vast dat dit is beoordeeld.'
          });
        }
        return {
          rule_ids: ruleIds,
          sickness_days_total: sicknessDays,
          call_agreement_type: callAgreementType,
          sickness_started_during_call_period: withinCallPeriod,
          payment_percentage: 0,
          total_sickness_payment: 0,
          manual_review_required: outsideCallManualReview,
          payroll_final_allowed: !outsideCallManualReview,
          missing_evidence: outsideCallMissingEvidence,
          warnings,
          note: 'Geen ziekengeld buiten of na afloop van de oproepperiode, tenzij 52-weken aanspraak voor nul-uren afzonderlijk is vastgesteld.'
        };
      }
      const callPeriodAmount = numberOrNull(input.agreed_call_period_gross_wage) ?? (dailySalary * sicknessDays);
      return {
        rule_ids: ruleIds,
        sickness_days_total: sicknessDays,
        call_agreement_type: callAgreementType,
        sickness_started_during_call_period: true,
        payment_percentage: parameters.sickness.call_worker_payment_percentage,
        total_sickness_payment: round2(callPeriodAmount * (parameters.sickness.call_worker_payment_percentage / 100)),
        minimum_wage_floor_required: true,
        parameter_provenance: {
          call_worker_payment_percentage: parameters.provenance.call_worker_payment_percentage
        },
        manual_review_required: manualReviewRequired,
        payroll_final_allowed: !manualReviewRequired,
        missing_evidence: missingEvidence,
        warnings,
        note: 'Oproepkracht ziek tijdens oproepperiode: 70% over afgesproken oproepperiode, minimaal minimumloon.'
      };
    }

    if (callAgreementType === 'min_max') {
      ruleIds.push('CAO-PB-2024-R1182', 'CAO-PB-2024-R1183', 'CAO-PB-2024-R1184');
      const guaranteeHours = numberOrNull(input.guarantee_hours_per_pay_period) ??
        numberOrNull(input.min_hours_per_pay_period) ??
        numberOrNull(input.min_hours_per_week);
      if (guaranteeHours === null) {
        manualReviewRequired = true;
        missingEvidence.push({
          field: 'guarantee_hours_per_pay_period/min_hours_per_pay_period',
          rule_id: 'CAO-PB-2024-R1183',
          message: 'Bij min-max ziekte moet het aantal garantie-uren bekend zijn.'
        });
      }
      const guaranteeBaseAmount = numberOrNull(input.guarantee_gross_wage) ??
        (guaranteeHours !== null && numberOrNull(input.base_hourly_rate) !== null ? guaranteeHours * numberOrNull(input.base_hourly_rate) : dailySalary * sicknessDays);
      if (numberOrNull(input.average_hours_52_weeks) !== null && guaranteeHours !== null && numberOrNull(input.average_hours_52_weeks) > guaranteeHours) {
        manualReviewRequired = true;
        warnings.push('Gemiddelde arbeidsduur over 52 weken lijkt hoger dan garantie-uren; artikel 67 kan hogere loondoorbetaling geven. Handmatige review vereist.');
      }
      return {
        rule_ids: ruleIds,
        sickness_days_total: sicknessDays,
        call_agreement_type: callAgreementType,
        guarantee_hours_basis: guaranteeHours,
        payment_percentage: parameters.sickness.call_worker_payment_percentage,
        total_sickness_payment: round2(guaranteeBaseAmount * (parameters.sickness.call_worker_payment_percentage / 100)),
        minimum_wage_floor_required: true,
        parameter_provenance: {
          call_worker_payment_percentage: parameters.provenance.call_worker_payment_percentage
        },
        manual_review_required: manualReviewRequired,
        payroll_final_allowed: !manualReviewRequired,
        missing_evidence: missingEvidence,
        warnings,
        note: 'Min-maxcontract: 70% over garantie-uren, met mogelijke 52-weken aanspraak bij gemiddeld meer werken.'
      };
    }

    manualReviewRequired = true;
    missingEvidence.push({
      field: 'call_agreement_type',
      rule_id: 'CAO-PB-2024-R1172',
      message: 'Type oproepcontract ontbreekt of wordt niet volledig automatisch ondersteund voor ziekte.'
    });
  }

  if (seniority < parameters.sickness.waiting_day_seniority_periods) {
    ruleIds.push('CAO-PB-2024-R1148', 'CAO-PB-2024-R1149');
    const hasWaitingDay = !waitingDayExceptionApplies(input);
    if (!hasWaitingDay) ruleIds.push('CAO-PB-2024-R1150', 'CAO-PB-2024-R1151', 'CAO-PB-2024-R1152', 'CAO-PB-2024-R1153', 'CAO-PB-2024-R1154');
    const paidDays = hasWaitingDay ? Math.max(0, sicknessDays - 1) : sicknessDays;
    return {
      rule_ids: ruleIds,
      sickness_days_total: sicknessDays,
      has_waiting_day: hasWaitingDay,
      waiting_day_unpaid: hasWaitingDay,
      industry_seniority_periods: seniority,
      paid_days_70_percent: paidDays,
      payment_percentage: parameters.sickness.short_seniority_payment_percentage,
      payment_amount: round2(paidDays * dailySalary * (parameters.sickness.short_seniority_payment_percentage / 100)),
      payment_70_percent: round2(paidDays * dailySalary * (parameters.sickness.short_seniority_payment_percentage / 100)),
      total_sickness_payment: round2(paidDays * dailySalary * (parameters.sickness.short_seniority_payment_percentage / 100)),
      minimum_wage_floor_required: true,
      parameter_provenance: {
        waiting_day_seniority_periods: parameters.provenance.waiting_day_seniority_periods,
        short_seniority_payment_percentage: parameters.provenance.short_seniority_payment_percentage
      },
      manual_review_required: manualReviewRequired,
      payroll_final_allowed: !manualReviewRequired,
      missing_evidence: missingEvidence,
      warnings,
      note: hasWaitingDay
        ? 'Minder dan 13 loonperioden brancheancienniteit: 70% ziekengeld en eerste ziektedag wachtdag.'
        : 'Minder dan 13 loonperioden brancheancienniteit: 70% ziekengeld, geen wachtdag wegens CAO-uitzondering.'
    };
  }

  ruleIds.push('CAO-PB-2024-R1157', 'CAO-PB-2024-R1158', 'CAO-PB-2024-R1159', 'CAO-PB-2024-R1160', 'CAO-PB-2024-R1161');
  const firstSixMonthDays = Math.min(sicknessDays, parameters.sickness.first_six_months_days);
  const secondSixMonthDays = Math.min(
    Math.max(0, sicknessDays - parameters.sickness.first_six_months_days),
    parameters.sickness.second_six_months_days
  );
  const secondYearStartDay = parameters.sickness.first_six_months_days + parameters.sickness.second_six_months_days;
  const secondYearDays = Math.min(Math.max(0, sicknessDays - secondYearStartDay), parameters.sickness.second_year_days);
  const reintegrationConfirmed = booleanOrNull(input.active_reintegration_confirmed);
  if (secondYearDays > 0 && reintegrationConfirmed !== true) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'active_reintegration_confirmed',
      rule_id: 'CAO-PB-2024-R1161',
      message: '85% in het tweede ziektejaar geldt als actieve re-integratie binnen mogelijkheden is aangetoond.'
    });
  }
  const thirdFourthYearSupplementEligible = booleanOrNull(input.wga_35_80) === true &&
    booleanOrNull(input.medical_limitations_confirmed) === true &&
    booleanOrNull(input.active_reintegration_confirmed) === true;
  const thirdFourthYearStartDay = secondYearStartDay + parameters.sickness.second_year_days;
  const thirdFourthYearDays = Math.min(Math.max(0, sicknessDays - thirdFourthYearStartDay), parameters.sickness.third_fourth_year_days);
  if (thirdFourthYearDays > 0) {
    ruleIds.push('CAO-PB-2024-R1162');
    if (!thirdFourthYearSupplementEligible) {
      manualReviewRequired = true;
      missingEvidence.push({
        field: 'wga_35_80/medical_limitations_confirmed/active_reintegration_confirmed',
        rule_id: 'CAO-PB-2024-R1162',
        message: 'Aanvulling in ziektejaar 3/4 vereist 35-80% WGA en bewijs van actieve inzet/medische beperkingen.'
      });
    }
  }

  const paymentFirstSixMonths = firstSixMonthDays * dailySalary * (parameters.sickness.first_six_months_percentage / 100);
  const paymentSecondSixMonths = secondSixMonthDays * dailySalary * (parameters.sickness.second_six_months_percentage / 100);
  const paymentSecondYear = reintegrationConfirmed === true
    ? secondYearDays * dailySalary * (parameters.sickness.second_year_reintegration_percentage / 100)
    : 0;
  const supplementThirdFourthYear = thirdFourthYearSupplementEligible
    ? (numberOrNull(input.wga_related_benefit_per_day) ?? dailySalary) * thirdFourthYearDays * (parameters.sickness.third_fourth_year_supplement_percentage / 100)
    : 0;

  return {
    rule_ids: ruleIds,
    sickness_days_total: sicknessDays,
    has_waiting_day: false,
    waiting_day_unpaid: false,
    industry_seniority_periods: seniority,
    days_first_six_months_100_percent: firstSixMonthDays,
    days_second_six_months_90_percent: secondSixMonthDays,
    days_second_year_85_percent: secondYearDays,
    days_third_fourth_year_supplement: thirdFourthYearDays,
    first_six_months_percentage: parameters.sickness.first_six_months_percentage,
    second_six_months_percentage: parameters.sickness.second_six_months_percentage,
    second_year_reintegration_percentage: parameters.sickness.second_year_reintegration_percentage,
    third_fourth_year_supplement_percentage: parameters.sickness.third_fourth_year_supplement_percentage,
    payment_first_six_months: round2(paymentFirstSixMonths),
    payment_second_six_months: round2(paymentSecondSixMonths),
    payment_second_year: round2(paymentSecondYear),
    supplement_third_fourth_year: round2(supplementThirdFourthYear),
    total_sickness_payment: round2(paymentFirstSixMonths + paymentSecondSixMonths + paymentSecondYear + supplementThirdFourthYear),
    ort_included: numberOrNull(avg_ort_per_period) !== null,
    parameter_provenance: {
      first_six_months_percentage: parameters.provenance.sickness_first_six_months_percentage,
      second_six_months_percentage: parameters.provenance.sickness_second_six_months_percentage,
      second_year_reintegration_percentage: parameters.provenance.sickness_second_year_reintegration_percentage
    },
    manual_review_required: manualReviewRequired,
    payroll_final_allowed: !manualReviewRequired,
    missing_evidence: missingEvidence,
    warnings,
    note: 'Minimaal 13 loonperioden brancheancienniteit: 100% eerste 6 maanden, 90% tweede 6 maanden, 85% tweede ziektejaar bij actieve re-integratie.'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, force_cao_sync, personnel_id, contract_id } = body;

    let personnel = body.personnel || null;
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id).catch(() => null);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }

    let contract = body.contract || null;
    if (contract_id && !contract) {
      contract = await base44.entities.PersonnelContract.get(contract_id).catch(() => null);
      if (!contract) return Response.json({ error: `Arbeidscontract niet gevonden: ${contract_id}` }, { status: 404 });
    }
    const contracts = personnel_id
      ? await base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id }).catch(() => [])
      : [];
    const referenceDate = leaveSicknessReferenceDate(body);
    const explicitCaoKey = body.cao_key || body.service_context?.cao_key || null;
    const contractCaoResolution = resolveContractCaoForDate({
      explicitCaoKey,
      contract,
      contracts,
      referenceDate
    });
    if (String(contractCaoResolution.status || '').startsWith('blocked_')) {
      return Response.json({
        error: contractCaoResolution.blocking_reason,
        action: action || 'calculate_leave_sickness',
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: contractCaoResolution.status
      }, { status: 400 });
    }

    const targetCaoKey = explicitCaoKey ||
      contractCaoResolution.cao_key ||
      null;

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
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

    const leaveSicknessRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'calculateCaoLeaveAndSickness');
    if (!leaveSicknessRuntimeSupport.supported) {
      return Response.json({
        error: leaveSicknessRuntimeSupport.message,
        action: action || 'calculate_leave_sickness',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Verlof-/ziekteberekening geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_key: targetCaoKey,
        cao_runtime_support: leaveSicknessRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: leaveSicknessRuntimeSupport.status
      }, { status: 422 });
    }

    const caoConfigResolution = await resolveActiveCaoConfig(base44, referenceDate, targetCaoKey);
    if (!caoConfigResolution.config) {
      return Response.json({
        error: caoConfigResolution.message,
        action: action || 'calculate_leave_sickness',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          caoConfigResolution.message
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        cao_key: targetCaoKey,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: leaveSicknessRuntimeSupport,
        active_cao_configuration_candidates: caoConfigResolution.candidates,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: caoConfigResolution.status
      }, { status: 400 });
    }

    const caoConfig = caoConfigResolution.config;
    const leaveSicknessParameters = resolveLeaveSicknessParameters(caoConfig);
    const caoPayrollReadiness = getCaoPayrollReadiness(caoConfig);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
    if (!caoPayrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}). Definitieve verlof-/ziekteberekening is geblokkeerd totdat de CAO coverage-gate slaagt.`,
        action: action || 'calculate_leave_sickness',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Verlof-/ziekteberekening geblokkeerd: CAO-regeldekking of payrollparameters zijn niet bewezen compleet.'
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: leaveSicknessRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    // ── CAO-toepassingscheck ──
    let rawCaoScope = null;
    if (targetCaoKey === CAO_PB_KEY && personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          cao_key: targetCaoKey,
          contract: contractCaoResolution.selected_contract || contract || null,
          work_context: body.service_context || null
        });
        rawCaoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    // Normaliseer scope: null = fail-closed
    function normalizeCaoScope(scope) {
      if (!scope) {
        return {
          cao_scope_profile: 'unknown_manual_review',
          applies_full_security_rules: false,
          manual_review_required: true,
          payroll_rule_profile: {
            apply_chapter_4: false,
            apply_article_37_wage_increase: true,
            apply_article_38_year_end_bonus: true,
            apply_article_40_special_hours: false,
            apply_article_41_holidays: true,
            apply_article_42_overtime: false,
            apply_article_43_shift_change: false,
            apply_chapter_5_reimbursements: false,
            apply_appendix_2_function_scales: false
          },
          warnings: ['CAO-toepassingsprofiel kon niet worden bepaald. Handmatige review vereist.']
        };
      }
      return scope;
    }
    const caoScope = normalizeCaoScope(rawCaoScope);
    const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    // Scope-context: verlof/ziekte (hoofdstuk 3 / R0999) niet generiek uitgesloten door art. 3 lid 2.
    const scopeWarnings = [];
    if (isUnknownOrMixed) {
      scopeWarnings.push({
        message: `CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): berekeningsresultaten zijn conceptmatig. Handmatige review vereist.`,
        cao_scope_profile: caoScope.cao_scope_profile,
        manual_review_required: true
      });
    }
    // ORT-verlofberekening alleen als toeslagen van toepassing zijn (fail-closed: false als scope unknown)
    const applyOrtVacation = caoScope.payroll_rule_profile?.apply_article_40_special_hours === true;
    const vacationInput = {
      ...body,
      cao_scope_profile: caoScope?.cao_scope_profile || body.cao_scope_profile || null
    };

    if (action === 'calculate_vacation_accrual') {
      const result = calculateVacationAccrual(vacationInput, leaveSicknessParameters);
      const manualReviewRequired = isUnknownOrMixed || result.manual_review_required === true;
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_configuration_id: caoConfig.id || null,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_leave_sickness_parameters: leaveSicknessParameters,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: leaveSicknessRuntimeSupport,
        calculation_warnings: syncWarnings,
        scope_warnings: scopeWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        apply_ort_vacation: applyOrtVacation,
        ...result,
        manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
        payroll_final_allowed: !manualReviewRequired && contractCaoResolution.manual_review_required !== true && result.payroll_final_allowed !== false
      });
    }

    if (action === 'calculate_sickness_payment') {
      const result = calculateSicknessPayment(body, leaveSicknessParameters);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      const manualReviewRequired = isUnknownOrMixed || result.manual_review_required === true;
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_configuration_id: caoConfig.id || null,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_leave_sickness_parameters: leaveSicknessParameters,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: leaveSicknessRuntimeSupport,
        calculation_warnings: syncWarnings,
        scope_warnings: scopeWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        ...result,
        manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
        payroll_final_allowed: !manualReviewRequired && contractCaoResolution.manual_review_required !== true && result.payroll_final_allowed !== false
      });
    }

    // Default: bereken beide
    const vacation = calculateVacationAccrual(vacationInput, leaveSicknessParameters);
    const sickness = body.sickness_start_date ? calculateSicknessPayment(body, leaveSicknessParameters) : null;
    const manualReviewRequired = isUnknownOrMixed ||
      vacation.manual_review_required === true ||
      sickness?.manual_review_required === true;

    return Response.json({
      success: true,
      cao_sync_status: caoSyncStatus,
      cao_key: targetCaoKey,
      cao_configuration_id: caoConfig.id || null,
      cao_version_label: caoConfig.version_label || caoConfig.name || null,
      cao_valid_from: caoConfig.valid_from || null,
      cao_valid_until: caoConfig.valid_until || null,
      cao_payroll_readiness: caoPayrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_leave_sickness_parameters: leaveSicknessParameters,
      contract_id: contract_id || contract?.id || null,
      contract_cao_resolution: {
        ...contractCaoResolution,
        selected_contract: undefined
      },
      cao_runtime_support: leaveSicknessRuntimeSupport,
      calculation_warnings: syncWarnings,
      scope_warnings: scopeWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
      payroll_final_allowed: !manualReviewRequired &&
        contractCaoResolution.manual_review_required !== true &&
        vacation.payroll_final_allowed !== false &&
        (sickness ? sickness.payroll_final_allowed !== false : true),
      apply_ort_vacation: applyOrtVacation,
      vacation_accrual: vacation,
      sickness_payment: sickness
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

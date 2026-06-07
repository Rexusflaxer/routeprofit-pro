import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
// Slaat sync over ALLEEN als cloudflare_revision al overeenkomt. Geen tijdgebaseerde skip.
const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || CAO_PB_KEY;
  const supported = SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : 'blocked_unsupported_cao_runtime',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Payroll-final is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
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
      trigger_source: 'lazy_payroll_calculation',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    // Cloudflare onbereikbaar — stille fallback, waarschuwing wordt hieronder toegevoegd
    return { cloudflare_unavailable: true };
  }
}

// CAO Particuliere Beveiliging - Toeslagberekening
// Feestdagen komen uit CAOConfiguration.holidays — GEEN hardcoded lijsten.
const CAO_TIME_ZONE = 'Europe/Amsterdam';
const AMSTERDAM_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  hourCycle: 'h23'
});

function isHoliday(dateStr, caoConfig) {
  const holidays = (caoConfig && caoConfig.holidays) ? caoConfig.holidays : [];
  return holidays.some(h => h.date === dateStr);
}

function formatterParts(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}

function amsterdamInstantParts(date) {
  const parts = formatterParts(AMSTERDAM_DATE_TIME_FORMATTER, date);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  return {
    date: dateStr,
    hour,
    minute: Number(parts.minute),
    day_of_week: new Date(`${dateStr}T00:00:00Z`).getUTCDay()
  };
}

function parseIsoDateParts(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseClockParts(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return { hours, minutes, total_minutes: hours * 60 + minutes };
}

function addDaysIso(dateStr, days) {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

function lastSundayOfMonthDay(year, monthNumber) {
  const date = new Date(Date.UTC(year, monthNumber, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getUTCDate();
}

function amsterdamDstTransitionDates(year) {
  return {
    spring_date: `${year}-03-${String(lastSundayOfMonthDay(year, 3)).padStart(2, '0')}`,
    fall_date: `${year}-10-${String(lastSundayOfMonthDay(year, 10)).padStart(2, '0')}`
  };
}

function amsterdamLocalTimeIssue(dateStr, time) {
  const parts = parseIsoDateParts(dateStr);
  const clock = parseClockParts(time);
  if (!parts || !clock) return null;
  const transitions = amsterdamDstTransitionDates(parts.year);
  const iso = String(dateStr).slice(0, 10);
  if (iso === transitions.spring_date && clock.total_minutes >= 120 && clock.total_minutes < 180) return 'nonexistent_spring_forward_hour';
  if (iso === transitions.fall_date && clock.total_minutes >= 120 && clock.total_minutes < 180) return 'ambiguous_fall_back_hour';
  return null;
}

function amsterdamOffsetMinutesForLocal(dateStr, time, role = 'start') {
  const parts = parseIsoDateParts(dateStr);
  const clock = parseClockParts(time);
  if (!parts || !clock) return null;
  const iso = String(dateStr).slice(0, 10);
  const transitions = amsterdamDstTransitionDates(parts.year);
  if (iso < transitions.spring_date || iso > transitions.fall_date) return 60;
  if (iso > transitions.spring_date && iso < transitions.fall_date) return 120;
  if (iso === transitions.spring_date) {
    if (clock.total_minutes < 120) return 60;
    if (clock.total_minutes >= 180) return 120;
    return role === 'end' ? 120 : 60;
  }
  if (iso === transitions.fall_date) {
    if (clock.total_minutes < 120) return 120;
    if (clock.total_minutes >= 180) return 60;
    return role === 'end' ? 60 : 120;
  }
  return 60;
}

function amsterdamWallTimeToDate(dateStr, time, role = 'start') {
  const parts = parseIsoDateParts(dateStr);
  const clock = parseClockParts(time);
  const offsetMinutes = amsterdamOffsetMinutesForLocal(dateStr, time, role);
  if (!parts || !clock || offsetMinutes === null) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, clock.hours, clock.minutes, 0) - offsetMinutes * 60000);
}

function buildCaoShiftInterval(dateStr, startTime, endTime, equalEndMeansNextDay = false) {
  const start = amsterdamWallTimeToDate(dateStr, startTime, 'start');
  const startClock = parseClockParts(startTime);
  const endClock = parseClockParts(endTime);
  if (!start || !startClock || !endClock) return null;
  const endDate = endClock.total_minutes < startClock.total_minutes || (equalEndMeansNextDay && endClock.total_minutes === startClock.total_minutes)
    ? addDaysIso(dateStr, 1)
    : dateStr;
  const end = amsterdamWallTimeToDate(endDate, endTime, 'end');
  if (!end) return null;
  return { start, end, end_date: endDate };
}

function wallClockHoursForTimes(startTime, endTime, equalEndMeansNextDay = false) {
  const start = parseClockParts(startTime);
  const end = parseClockParts(endTime);
  if (!start || !end) return null;
  let minutes = end.total_minutes - start.total_minutes;
  if (minutes < 0 || (equalEndMeansNextDay && minutes === 0)) minutes += 24 * 60;
  return minutes / 60;
}

function buildCaoTimeSegments(start, end) {
  const segments = [];
  let current = new Date(start);
  while (current < end) {
    const next = new Date(current);
    next.setUTCHours(next.getUTCHours() + 1);
    const segmentEnd = next <= end ? next : end;
    segments.push({
      start: new Date(current),
      end: segmentEnd,
      hours: (segmentEnd - current) / (1000 * 60 * 60)
    });
    current = segmentEnd;
  }
  return segments;
}

function getDstPayrollInfo(dateStr, startTime, endTime, actualHours, equalEndMeansNextDay = false) {
  const startClock = parseClockParts(startTime);
  const endClock = parseClockParts(endTime);
  const endDate = startClock && endClock && (endClock.total_minutes < startClock.total_minutes || (equalEndMeansNextDay && endClock.total_minutes === startClock.total_minutes))
    ? addDaysIso(dateStr, 1)
    : dateStr;
  const wallClockHours = wallClockHoursForTimes(startTime, endTime, equalEndMeansNextDay);
  const startIssue = amsterdamLocalTimeIssue(dateStr, startTime);
  const endIssue = endDate ? amsterdamLocalTimeIssue(endDate, endTime) : null;
  const delta = wallClockHours === null ? 0 : r2(actualHours - wallClockHours);
  if (!delta && !startIssue && !endIssue) return null;
  return {
    date: dateStr,
    start_time: startTime,
    end_time: endTime,
    end_date: endDate,
    actual_worked_hours: r2(actualHours),
    wall_clock_hours: wallClockHours === null ? null : r2(wallClockHours),
    dst_delta_hours: delta,
    transition_type: delta > 0 ? 'winter_time_extra_hour' : delta < 0 ? 'summer_time_missing_hour' : 'ambiguous_or_nonexistent_local_time',
    start_time_issue: startIssue,
    end_time_issue: endIssue,
    manual_review_required: !!startIssue || !!endIssue,
    source_rule_ids: ['CAO-PB-2024-R0712', 'CAO-PB-2024-R0713']
  };
}

function getSurchargeType(datetime, caoConfig) {
  const parts = amsterdamInstantParts(new Date(datetime));
  const dayOfWeek = parts.day_of_week; // 0=zondag, 6=zaterdag
  const hours = parts.hour;
  const dateStr = parts.date;

  // Oudejaarsdag na 16:00 (hoogste toeslag)
  if (dateStr.endsWith('-12-31') && hours >= 16) {
    return { type: 'new_years_eve', percentage: caoConfig.surcharge_new_years_eve_after_16 || 100 };
  }

  // Feestdagen (50%) — opgehaald uit CAOConfiguration.holidays
  if (isHoliday(dateStr, caoConfig)) {
    return { type: 'holiday', percentage: caoConfig.surcharge_holiday || 50 };
  }

  // Weekend (zaterdag 00:00 - zondag 24:00) = 35%
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { type: 'weekend', percentage: caoConfig.surcharge_weekend || 35 };
  }

  // Nacht ma-vr 00:00 - 07:00 = 20%
  if (hours >= 0 && hours < 7) {
    return { type: 'night', percentage: caoConfig.surcharge_night || 20 };
  }

  // Avond ma-vr 18:00 - 24:00 = 10%
  if (hours >= 18) {
    return { type: 'evening', percentage: caoConfig.surcharge_evening || 10 };
  }

  // Dag = 0%
  return { type: 'day', percentage: 0 };
}

function r2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calculateCallWorkerVacationPayoutArticle59({ baseWageAmount, minimumServiceAmount, baseHourlyRate, paidBaseHours }) {
  const maxHoursPerPayPeriod = 144;
  const percentage = 9.24;
  const paidHours = Math.max(0, numberOrZero(paidBaseHours));
  const uncappedBaseAmount = Math.max(0, numberOrZero(baseWageAmount) + numberOrZero(minimumServiceAmount));
  const hourlyRate = numberOrNull(baseHourlyRate);
  const capped = paidHours > maxHoursPerPayPeriod;
  const cappedBaseAmount = capped && hourlyRate !== null
    ? Math.min(uncappedBaseAmount, hourlyRate * maxHoursPerPayPeriod)
    : uncappedBaseAmount;
  const manualReviewRequired = capped && hourlyRate === null;

  return {
    amount: r2(cappedBaseAmount * (percentage / 100)),
    percentage,
    payout_base_amount: r2(cappedBaseAmount),
    uncapped_payout_base_amount: r2(uncappedBaseAmount),
    payout_base_hours: r2(Math.min(paidHours, maxHoursPerPayPeriod)),
    uncapped_paid_base_hours: r2(paidHours),
    max_hours_per_pay_period: maxHoursPerPayPeriod,
    capped_at_144_hours_per_pay_period: capped,
    manual_review_required: manualReviewRequired,
    source_rule_ids: ['CAO-PB-2024-R1014', 'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017']
  };
}

function isCallAgreementContext(input) {
  if (!input) return false;
  const contractType = input.contract_type || input.employment_contract_type || null;
  const contractForm = input.contract_form || input.employment_contract_form || null;
  const contractModel = input.contract_model || input.employment_contract_model || null;
  const callAgreementType = input.call_agreement_type || input.call_contract_type || null;

  if (input.is_call_agreement === true) return true;
  if (['0_uren', 'oproep', 'min_max'].includes(contractType)) return true;
  if (['oproep', 'zero_hours', 'min_max', 'call'].includes(contractForm)) return true;
  if (['oproep', 'zero_hours', 'min_max', 'call'].includes(contractModel)) return true;
  if (['zero_hours', 'min_max', 'pre_agreement', 'annualized_bandwidth', 'no_work_no_pay_first_6_months'].includes(callAgreementType)) return true;

  const minPayPeriod = numberOrNull(input.min_hours_per_pay_period);
  const maxPayPeriod = numberOrNull(input.max_hours_per_pay_period);
  const minWeek = numberOrNull(input.min_hours_per_week);
  const maxWeek = numberOrNull(input.max_hours_per_week);
  if ((minPayPeriod !== null && maxPayPeriod !== null) || (minWeek !== null && maxWeek !== null)) return true;
  if (input.annualized_hours_with_bandwidth === true || numberOrNull(input.annual_contract_hours) !== null) return true;
  if (input.no_work_no_pay_first_6_months === true) return true;

  return false;
}

function selectedContractsFromResolutionResults(contractResolutionResults) {
  return (contractResolutionResults || [])
    .map(item => item?.contract_resolution?.selected_contract || item?.selected_contract || null)
    .filter(Boolean);
}

function getContractIdentity(contract, index) {
  return contract.id ||
    [
      contract.contract_form || '',
      contract.call_agreement_type || '',
      contract.contract_start_date || '',
      contract.contract_end_date || '',
      contract.min_hours_per_week ?? '',
      contract.max_hours_per_week ?? '',
      contract.min_hours_per_pay_period ?? '',
      contract.max_hours_per_pay_period ?? '',
      index
    ].join('|');
}

function buildCallAgreementContractMix(contractResolutionResults) {
  const uniqueContracts = new Map();
  selectedContractsFromResolutionResults(contractResolutionResults).forEach((contract, index) => {
    uniqueContracts.set(getContractIdentity(contract, index), {
      contract_id: contract.id || null,
      contract_form: contract.contract_form || null,
      contract_type: contract.contract_type || null,
      is_call_agreement: isCallAgreementContext(contract),
      call_agreement_type: contract.call_agreement_type || contract.call_contract_type || null,
      min_hours_per_week: contract.min_hours_per_week ?? null,
      max_hours_per_week: contract.max_hours_per_week ?? null,
      min_hours_per_pay_period: contract.min_hours_per_pay_period ?? null,
      max_hours_per_pay_period: contract.max_hours_per_pay_period ?? null
    });
  });
  const contracts = [...uniqueContracts.values()];
  const hasCallAgreement = contracts.some(contract => contract.is_call_agreement);
  const hasNonCallAgreement = contracts.some(contract => !contract.is_call_agreement);
  return {
    has_mixed_call_agreement_treatment: hasCallAgreement && hasNonCallAgreement,
    has_call_agreement_contract: hasCallAgreement,
    has_non_call_agreement_contract: hasNonCallAgreement,
    contracts
  };
}

function pickFirstNonEmpty(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '') ?? null;
}

function yearsAtReferenceDate(startDate, referenceDate) {
  const startIso = isoDate(startDate);
  const refIso = isoDate(referenceDate);
  if (!startIso || !refIso) return null;
  const start = new Date(`${startIso}T00:00:00`);
  const reference = new Date(`${refIso.slice(0, 4)}-01-01T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(reference.getTime()) || start > reference) return 0;
  let years = reference.getFullYear() - start.getFullYear();
  const anniversary = new Date(reference.getFullYear(), start.getMonth(), start.getDate());
  if (anniversary > reference) years -= 1;
  return Math.max(0, years);
}

function extraVacationDaysForServiceYears(years) {
  const serviceYears = numberOrNull(years);
  if (serviceYears === null || serviceYears < 5) return 0;
  if (serviceYears >= 40) return 8;
  return Math.floor(serviceYears / 5);
}

function buildVacationServiceContext({ personnel, body, contractResolutionResults, referenceDate }) {
  const selectedContract = selectedContractsFromResolutionResults(contractResolutionResults)[0] || {};
  const explicitYears = pickFirstNonEmpty(
    body.vacation_service_years,
    body.continuous_service_years,
    body.security_industry_service_years_for_vacation,
    selectedContract.vacation_service_years,
    selectedContract.continuous_service_years,
    selectedContract.security_industry_service_years_for_vacation,
    personnel.vacation_service_years,
    personnel.continuous_service_years,
    personnel.security_industry_service_years_for_vacation
  );
  const startDate = pickFirstNonEmpty(
    body.vacation_service_start_date,
    body.continuous_service_start_date,
    selectedContract.vacation_service_start_date,
    selectedContract.continuous_service_start_date,
    selectedContract.contract_start_date,
    personnel.vacation_service_start_date,
    personnel.continuous_service_start_date,
    personnel.contract_start_date
  );
  const explicitNumber = numberOrNull(explicitYears);
  if (explicitNumber !== null) {
    return {
      service_years: explicitNumber,
      source: 'explicit_vacation_service_years',
      reference_date: isoDate(referenceDate),
      manual_review_required: false,
      source_rule_ids: ['CAO-PB-2024-R1019', 'CAO-PB-2024-R1021', 'CAO-PB-2024-R1022']
    };
  }
  const calculatedYears = yearsAtReferenceDate(startDate, referenceDate);
  if (calculatedYears !== null) {
    return {
      service_years: calculatedYears,
      source: 'calculated_from_service_start_date',
      service_start_date: isoDate(startDate),
      reference_date: isoDate(referenceDate),
      manual_review_required: false,
      source_rule_ids: ['CAO-PB-2024-R1019', 'CAO-PB-2024-R1021', 'CAO-PB-2024-R1022']
    };
  }
  return {
    service_years: null,
    source: 'missing_service_years',
    reference_date: isoDate(referenceDate),
    manual_review_required: true,
    source_rule_ids: ['CAO-PB-2024-R1019', 'CAO-PB-2024-R1021', 'CAO-PB-2024-R1022']
  };
}

function getVacationEntitlementProfile(caoScopeProfile) {
  if (caoScopeProfile === 'cash_value_logistics') {
    return {
      profile: 'cash_value_logistics',
      fulltimeAnnualHours: 180,
      fulltimeAnnualDays: 25,
      fulltimeVacationHoursPerPeriod: 13.85,
      vacationDayHours: 7.2,
      source_rule_ids: ['CAO-PB-2024-R1601', 'CAO-PB-2024-R1602'],
      extra_vacation_days_policy: 'manual_review_article_100_deviates_from_article_59'
    };
  }
  return {
    profile: 'standard_article_59',
    fulltimeAnnualHours: 172.8,
    fulltimeAnnualDays: 24,
    fulltimeVacationHoursPerPeriod: 13.3,
    vacationDayHours: 7.2,
    source_rule_ids: ['CAO-PB-2024-R0999'],
    extra_vacation_days_policy: 'article_59_lid_4'
  };
}

function calculateVacationEntitlementForPayPeriod({ paidHoursPerPayPeriod, vacationServiceContext, caoScopeProfile = null }) {
  const profile = getVacationEntitlementProfile(caoScopeProfile);
  const fulltimePeriodHours = 144;
  const paidHours = Math.max(0, numberOrZero(paidHoursPerPayPeriod));
  const cappedPaidHours = Math.min(paidHours, fulltimePeriodHours);
  const parttimeRatio = cappedPaidHours / fulltimePeriodHours;
  const usesCashValueProfile = profile.profile === 'cash_value_logistics';
  const extraDays = usesCashValueProfile ? 0 : extraVacationDaysForServiceYears(vacationServiceContext?.service_years);
  const extraHoursPerPeriod = (extraDays * profile.vacationDayHours * parttimeRatio) / 13;

  return {
    vacation_entitlement_profile: profile.profile,
    statutory_and_above_statutory_vacation_hours_annual_fulltime_basis: profile.fulltimeAnnualHours,
    statutory_and_above_statutory_vacation_days_annual_fulltime_basis: profile.fulltimeAnnualDays,
    paid_hours_per_pay_period: r2(paidHours),
    capped_paid_hours_per_pay_period: r2(cappedPaidHours),
    fulltime_reference_hours_per_pay_period: fulltimePeriodHours,
    parttime_ratio: r2(parttimeRatio),
    vacation_hours_base_per_pay_period: r2(profile.fulltimeVacationHoursPerPeriod * parttimeRatio),
    extra_vacation_days_annual_fulltime_basis: extraDays,
    extra_vacation_days_policy: profile.extra_vacation_days_policy,
    extra_vacation_days_manual_review_required: usesCashValueProfile,
    extra_vacation_hours_per_pay_period: r2(extraHoursPerPeriod),
    vacation_hours_accrued_per_pay_period: r2((profile.fulltimeVacationHoursPerPeriod * parttimeRatio) + extraHoursPerPeriod),
    service_years_context: vacationServiceContext,
    capped_at_144_hours_per_pay_period: paidHours > fulltimePeriodHours,
    manual_review_required: vacationServiceContext?.manual_review_required === true || usesCashValueProfile,
    source_rule_ids: [
      ...profile.source_rule_ids, 'CAO-PB-2024-R1002', 'CAO-PB-2024-R1003', 'CAO-PB-2024-R1004',
      'CAO-PB-2024-R1008', 'CAO-PB-2024-R1009', 'CAO-PB-2024-R1010',
      ...(vacationServiceContext?.source_rule_ids || [])
    ]
  };
}

function isCallWorkerForPayroll({ personnel, body, workSchedule, contractResolutionResults }) {
  if (isCallAgreementContext(personnel) || isCallAgreementContext(body)) return true;
  if (selectedContractsFromResolutionResults(contractResolutionResults).some(isCallAgreementContext)) return true;
  return (workSchedule || []).some(shift =>
    isCallAgreementContext(shift) ||
    isCallAgreementContext(shift?.service_context)
  );
}

function getOvertimeRules(caoConfig) {
  const rules = caoConfig?.overtime_rules || {};
  return {
    threshold_hours_per_pay_period: Number(rules.threshold_hours_per_pay_period ?? rules.threshold_hours ?? caoConfig?.overtime_threshold_hours ?? 152),
    surcharge_percentage: Number(rules.surcharge_percentage ?? rules.overtime_surcharge_percentage ?? caoConfig?.overtime_surcharge_percentage ?? 50),
    source_rule_ids: rules.source_rule_ids || ['CAO-PB-2024-R0797']
  };
}

function resolveMinimumServiceCompensation(shift, hoursWorked) {
  const rules = {
    minimum_hours: Number(shift.minimum_service_hours ?? 3),
    source_rule_ids: []
  };
  const result = {
    applies: false,
    paid_hours: hoursWorked,
    top_up_hours: 0,
    amount: 0,
    min_hours_as_worked_hours: 0,
    min_hours_as_minus_or_empty_hours: 0,
    travel_reimbursement_required: false,
    manual_review_required: false,
    review_reason: null,
    source_rule_ids: []
  };

  if (shift.work_meeting === true || shift.is_work_meeting === true || shift.service_type === 'work_meeting') {
    result.source_rule_ids.push('CAO-PB-2024-R0818');
    return result;
  }

  if (shift.mandatory_training_article_55_3 === true || shift.article_55_3_applies === true) {
    result.source_rule_ids.push('CAO-PB-2024-R0817');
    return result;
  }

  if (shift.no_work_on_arrival === true || shift.arrived_but_not_used === true || shift.opgekomen_niet_ingezet === true) {
    result.applies = true;
    result.paid_hours = Math.max(hoursWorked, rules.minimum_hours);
    result.top_up_hours = Math.max(0, result.paid_hours - hoursWorked);
    result.min_hours_as_worked_hours = Math.min(rules.minimum_hours, result.paid_hours);
    result.travel_reimbursement_required = true;
    result.source_rule_ids.push('CAO-PB-2024-R0813');
    return result;
  }

  if (shift.is_broken_shift === true || shift.broken_shift === true || Array.isArray(shift.service_parts)) {
    const parts = Array.isArray(shift.service_parts)
      ? shift.service_parts.map(part => numberOrZero(part.hours ?? part.duration_hours)).filter(hours => hours > 0)
      : [];
    if (parts.length >= 2) {
      const longestPart = Math.max(...parts);
      if (longestPart < rules.minimum_hours) {
        result.applies = true;
        result.top_up_hours = rules.minimum_hours - longestPart;
        result.paid_hours = hoursWorked + result.top_up_hours;
        result.min_hours_as_worked_hours = rules.minimum_hours;
        result.source_rule_ids.push('CAO-PB-2024-R0814', 'CAO-PB-2024-R0816');
      }
      return result;
    }
    result.manual_review_required = true;
    result.review_reason = 'Gebroken dienst zonder service_parts; art. 45 lid 3b kan niet automatisch worden vastgesteld.';
    result.source_rule_ids.push('CAO-PB-2024-R0814', 'CAO-PB-2024-R0816');
    return result;
  }

  const cancelledByEmployer = shift.cancelled_by_employer === true || shift.withdrawn_by_employer === true || shift.cancelled_after_week_schedule === true;
  const cancelledByEmployeeRequest = shift.cancelled_at_employee_request === true || shift.cancelled_by_employee_request === true;
  const scheduledHours = numberOrZero(shift.scheduled_hours ?? shift.planned_hours);
  if (cancelledByEmployer && !cancelledByEmployeeRequest && scheduledHours > 0) {
    result.applies = true;
    result.paid_hours = Math.max(hoursWorked, scheduledHours);
    result.top_up_hours = Math.max(0, result.paid_hours - hoursWorked);
    result.min_hours_as_worked_hours = Math.min(rules.minimum_hours, result.paid_hours);
    result.min_hours_as_minus_or_empty_hours = Math.max(0, result.paid_hours - result.min_hours_as_worked_hours);
    result.source_rule_ids.push('CAO-PB-2024-R0810', 'CAO-PB-2024-R0811');
    return result;
  }

  if (hoursWorked > 0 && hoursWorked < rules.minimum_hours) {
    result.applies = true;
    result.paid_hours = rules.minimum_hours;
    result.top_up_hours = rules.minimum_hours - hoursWorked;
    result.min_hours_as_worked_hours = rules.minimum_hours;
    result.source_rule_ids.push('CAO-PB-2024-R0814', 'CAO-PB-2024-R0815');
    return result;
  }

  return result;
}

function getActingFunctionAllowanceRules(caoConfig) {
  const configured = caoConfig?.allowances?.acting_function_allowance ||
    caoConfig?.allowances?.function_acting ||
    caoConfig?.function_acting_allowance_rates ||
    null;
  const rates = configured?.rates || configured || {};
  const hasConfiguredRates = rates.scale_1 != null || rates.one_scale != null || rates['1'] != null;
  return {
    rates: {
      1: Number(rates.scale_1 ?? rates.one_scale ?? rates['1'] ?? 0.21),
      2: Number(rates.scale_2 ?? rates.two_scales ?? rates['2'] ?? 0.48),
      3: Number(rates.scale_3_or_more ?? rates.three_or_more_scales ?? rates['3_or_more'] ?? rates['3'] ?? 0.79)
    },
    has_configured_rates: hasConfiguredRates,
    max_months: Number(configured?.max_months ?? 6),
    source_rule_ids: configured?.source_rule_ids || [
      'CAO-PB-2024-R0775', 'CAO-PB-2024-R0777', 'CAO-PB-2024-R0778',
      'CAO-PB-2024-R0779', 'CAO-PB-2024-R0780', 'CAO-PB-2024-R0781',
      'CAO-PB-2024-R0782', 'CAO-PB-2024-R0783'
    ]
  };
}

function resolveValueServicesEarlyShiftAllowance(shift, caoScope) {
  const serviceContext = shift?.service_context || {};
  const appliesScope = caoScope?.cao_scope_profile === 'cash_value_logistics' ||
    shift?.works_cash_value_logistics === true ||
    serviceContext.works_cash_value_logistics === true;
  const clock = parseClockParts(shift?.start_time);
  const applies = appliesScope && clock && clock.total_minutes >= 120 && clock.total_minutes < 240;
  return {
    applies: !!applies,
    amount: applies ? 7.50 : 0,
    rate_per_shift: 7.50,
    tax_treatment: 'bruto',
    source_rule_ids: applies ? ['CAO-PB-2024-R1609'] : [],
    note: applies ? 'Geld- en waardelogistiek vroege dienst 02:00-04:00: EUR 7,50 bruto per dienst.' : null
  };
}

function resolveCashValueLateNextDayNoticeAllowance(shift, caoScope, hoursWorked, baseHourlyRate) {
  const serviceContext = shift?.service_context || {};
  const appliesScope = caoScope?.cao_scope_profile === 'cash_value_logistics' ||
    shift?.works_cash_value_logistics === true ||
    serviceContext.works_cash_value_logistics === true;
  const result = {
    applies: false,
    hours: 0,
    percentage: 20,
    amount: 0,
    notice_at: null,
    deadline_at: null,
    manual_review_required: false,
    review_reason: null,
    source_rule_ids: []
  };
  if (!appliesScope) return result;

  if (
    shift.cash_value_next_day_force_majeure_ict_failure === true ||
    shift.next_day_service_force_majeure_ict_failure === true ||
    shift.force_majeure_ict_failure === true ||
    shift.ict_failure_force_majeure === true
  ) {
    result.source_rule_ids.push('CAO-PB-2024-R1618');
    return result;
  }

  const serviceDate = isoDate(shift.date || shift.service_date || shift.shift_date);
  const explicitNextDayService = shift.cash_value_next_day_service === true ||
    shift.value_services_next_day_service === true ||
    shift.next_day_service === true ||
    shift.next_day_service_notice_required === true;
  const noticeAt = pickFirstNonEmpty(
    shift.cash_value_next_day_service_notice_at,
    shift.value_services_next_day_notice_at,
    shift.next_day_service_notice_at,
    shift.cash_value_service_communicated_at,
    shift.service_communicated_at,
    shift.communicated_at,
    shift.planned_service_notified_at,
    shift.shift_notified_at,
    shift.notified_at
  );
  const noticeParts = localDateTimeParts(noticeAt);
  const inferredNextDayService = !!noticeParts && !!serviceDate && addDaysIsoForNoticeDeadline(noticeParts.date, 1) === serviceDate;
  if (!explicitNextDayService && !inferredNextDayService) return result;

  if (!serviceDate || !noticeParts) {
    result.manual_review_required = true;
    result.review_reason = 'Geld- en waardelogistiek volgende-dagdienst mist dienstdatum of communicatiemoment; 20%-toeslag vóór/na 19:00 kan niet definitief worden vastgesteld.';
    result.source_rule_ids.push('CAO-PB-2024-R1613', 'CAO-PB-2024-R1617');
    return result;
  }

  const deadlineDate = addDaysIsoForNoticeDeadline(serviceDate, -1);
  if (!deadlineDate) {
    result.manual_review_required = true;
    result.review_reason = 'Dienstdatum voor geld- en waardelogistiek volgende-dagdienst is ongeldig; 20%-toeslag kan niet definitief worden vastgesteld.';
    result.source_rule_ids.push('CAO-PB-2024-R1613', 'CAO-PB-2024-R1617');
    return result;
  }
  result.notice_at = noticeAt;
  result.deadline_at = `${deadlineDate}T19:00`;
  const isLate = noticeParts.date > deadlineDate ||
    (noticeParts.date === deadlineDate && noticeParts.minutes_after_midnight >= 19 * 60);
  if (!isLate) {
    result.source_rule_ids.push('CAO-PB-2024-R1613');
    return result;
  }

  const hours = Math.max(0, numberOrZero(hoursWorked));
  const rate = numberOrNull(baseHourlyRate);
  if (rate === null) {
    result.manual_review_required = true;
    result.review_reason = 'Basisuurloon ontbreekt; 20%-toeslag voor te laat gecommuniceerde cash-value volgende-dagdienst kan niet worden berekend.';
    result.source_rule_ids.push('CAO-PB-2024-R1617');
    return result;
  }

  result.applies = true;
  result.hours = hours;
  result.amount = hours * rate * 0.20;
  result.source_rule_ids.push('CAO-PB-2024-R1613', 'CAO-PB-2024-R1617');
  return result;
}

function resolveActingFunctionAllowance(shift, personnel, paidHoursForShift, caoConfig) {
  const currentScale = numberOrZero(shift.current_cao_scale ?? personnel.cao_scale);
  const actingScale = numberOrZero(
    shift.acting_cao_scale ??
    shift.acting_function_scale ??
    shift.temporary_function_scale ??
    shift.higher_function_scale
  );
  const explicitScaleDifference = Number.isFinite(Number(shift.acting_scale_difference))
    ? Number(shift.acting_scale_difference)
    : null;
  const isActing = shift.acting_function === true ||
    shift.is_acting_function === true ||
    shift.acting_function_group != null ||
    shift.acting_cao_scale != null ||
    explicitScaleDifference != null;

  const result = {
    applies: false,
    paid_hours: 0,
    scale_difference: explicitScaleDifference,
    rate: 0,
    amount: 0,
    lower_function_keeps_old_scale: false,
    manual_review_required: false,
    review_reason: null,
    source_rule_ids: []
  };

  if (!isActing) return result;

  const rules = getActingFunctionAllowanceRules(caoConfig);
  result.source_rule_ids = rules.source_rule_ids;

  const requestedByEmployer = shift.acting_requested_by_employer === true ||
    shift.employer_requested_acting_function === true ||
    shift.waarneming_op_verzoek_werkgever === true;
  if (!requestedByEmployer) {
    result.manual_review_required = true;
    result.review_reason = 'Functiewaarneming is gemeld, maar niet bevestigd dat de werkgever deze hogere functie heeft gevraagd.';
  }

  const scaleDifference = explicitScaleDifference ?? (actingScale && currentScale ? actingScale - currentScale : null);
  result.scale_difference = scaleDifference;

  if (scaleDifference == null || !Number.isFinite(scaleDifference)) {
    result.manual_review_required = true;
    result.review_reason = result.review_reason || 'Schaalverschil voor functiewaarneming ontbreekt.';
    return result;
  }

  if (scaleDifference <= 0) {
    result.lower_function_keeps_old_scale = scaleDifference < 0;
    result.source_rule_ids.push('CAO-PB-2024-R0783');
    return result;
  }

  if (!rules.has_configured_rates && shift.acting_allowance_rate == null) {
    result.manual_review_required = true;
    result.review_reason = result.review_reason || 'Actuele geindexeerde functiewaarnemingstarieven ontbreken in CAOConfiguration; 2025-bedragen alleen als concept gebruikt.';
  }

  const rateFromShift = shift.acting_allowance_rate != null ? Number(shift.acting_allowance_rate) : null;
  const rate = Number.isFinite(rateFromShift)
    ? rateFromShift
    : scaleDifference === 1
    ? rules.rates[1]
    : scaleDifference === 2
    ? rules.rates[2]
    : rules.rates[3];

  result.applies = true;
  result.paid_hours = paidHoursForShift;
  result.rate = rate;
  result.amount = paidHoursForShift * rate;

  const months = Number(shift.acting_duration_months ?? shift.acting_function_duration_months);
  if (Number.isFinite(months) && months > rules.max_months) {
    result.manual_review_required = true;
    result.review_reason = `Functiewaarneming duurt ${months} maanden; na ${rules.max_months} maanden moet bevordering of terugplaatsing worden beoordeeld.`;
  }

  return result;
}

function timeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function absoluteEndMinutes(startMinutes, endTime) {
  const end = timeToMinutes(endTime);
  if (end === null || startMinutes === null) return null;
  return end <= startMinutes ? end + 24 * 60 : end;
}

function hoursOutsideWindow(startTime, endTime, windowStart, windowEnd) {
  const start = timeToMinutes(startTime);
  const end = absoluteEndMinutes(start, endTime);
  const wStartRaw = timeToMinutes(windowStart);
  const wEnd = absoluteEndMinutes(wStartRaw, windowEnd);
  if (start === null || end === null || wStartRaw === null || wEnd === null) return null;
  let wStart = wStartRaw;
  if (wEnd > 24 * 60 && start < wStart) {
    wStart -= 24 * 60;
  }
  const overlap = Math.max(0, Math.min(end, wEnd) - Math.max(start, wStart));
  return Math.max(0, (end - start - overlap) / 60);
}

function daysBetweenIso(laterDate, earlierDate) {
  const later = new Date(`${isoDate(laterDate)}T00:00:00`);
  const earlier = new Date(`${isoDate(earlierDate)}T00:00:00`);
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) return null;
  return Math.floor((later - earlier) / (24 * 60 * 60 * 1000));
}

function addDaysIsoForNoticeDeadline(dateValue, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate(dateValue) || '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateTimeParts(value) {
  if (!value) return null;
  const str = String(value);
  const date = isoDate(str);
  const match = str.match(/(?:T|\s)(\d{1,2}):(\d{2})/) || str.match(/^(\d{1,2}):(\d{2})$/);
  if (!date || !match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return { date, minutes_after_midnight: hours * 60 + minutes };
}

function resolveShiftChangePercentage(shift) {
  const explicit = numberOrNull(shift.shift_change_allowance_percentage ?? shift.roster_change_allowance_percentage);
  if (explicit !== null) return { percentage: explicit, notice_days: numberOrNull(shift.shift_change_notice_days), source_rule_id: 'CAO-PB-2024-R0800' };

  let noticeDays = numberOrNull(shift.shift_change_notice_days ?? shift.roster_change_notice_days ?? shift.notice_days_before_shift);
  if (noticeDays === null && shift.roster_change_datetime && shift.date) {
    noticeDays = daysBetweenIso(shift.date, shift.roster_change_datetime);
  }
  if (noticeDays === null && shift.shift_change_notified_date && shift.date) {
    noticeDays = daysBetweenIso(shift.date, shift.shift_change_notified_date);
  }
  if (noticeDays === null) return { percentage: null, notice_days: null, source_rule_id: null };
  if (noticeDays >= 8 && noticeDays <= 28) return { percentage: 5, notice_days: noticeDays, source_rule_id: 'CAO-PB-2024-R0801' };
  if (noticeDays >= 2 && noticeDays <= 7) return { percentage: 10, notice_days: noticeDays, source_rule_id: 'CAO-PB-2024-R0802' };
  if (noticeDays >= 0 && noticeDays <= 1) return { percentage: 20, notice_days: noticeDays, source_rule_id: 'CAO-PB-2024-R0803' };
  return { percentage: null, notice_days: noticeDays, source_rule_id: null };
}

function resolveShiftChangeAllowance(shift, personnel, hoursWorked, baseHourlyRate) {
  const result = {
    applies: false,
    hours: 0,
    percentage: 0,
    rate: 0,
    amount: 0,
    notice_days: null,
    manual_review_required: false,
    review_reason: null,
    source_rule_ids: []
  };

  const isOnCall = isCallAgreementContext(personnel) ||
    isCallAgreementContext(shift) ||
    isCallAgreementContext(shift?.service_context);
  if (isOnCall || shift.shift_change_allowance_excluded === true) {
    result.source_rule_ids.push(isOnCall ? 'CAO-PB-2024-R0586' : 'CAO-PB-2024-R0806');
    return result;
  }

  if (shift.shift_exchange === true || shift.exchanged_with_colleague === true || shift.employee_initiated_shift_exchange === true) {
    result.source_rule_ids.push('CAO-PB-2024-R0710');
    return result;
  }

  if (isGeneralReserveAssignment(shift, personnel)) {
    result.source_rule_ids.push('CAO-PB-2024-R0606');
    return result;
  }

  const changed = shift.shift_change_allowance_required === true ||
    shift.changed_after_roster_published === true ||
    !!shift.roster_change_datetime ||
    !!shift.original_time_window_start ||
    !!shift.notified_time_window_start ||
    !!shift.original_start_time;

  if (!changed) {
    const extensionHours = shift.extended_after_roster_published === true || shift.longer_than_10_hours_shift_change === true
      ? Math.max(0, hoursWorked - 10)
      : 0;
    if (extensionHours <= 0) return result;
  }

  const originalWindowStart = shift.original_time_window_start || shift.notified_time_window_start || shift.original_start_time || null;
  const originalWindowEnd = shift.original_time_window_end || shift.notified_time_window_end || shift.original_end_time || null;
  let eligibleHours = numberOrNull(
    shift.shift_change_allowance_hours ??
    shift.shift_change_hours ??
    shift.hours_outside_original_time_window ??
    shift.hours_outside_notified_time_window
  );
  if (eligibleHours === null && originalWindowStart && originalWindowEnd) {
    eligibleHours = hoursOutsideWindow(shift.start_time, shift.end_time, originalWindowStart, originalWindowEnd);
  }

  if ((shift.extended_after_roster_published === true || shift.longer_than_10_hours_shift_change === true) && hoursWorked > 10) {
    eligibleHours = Math.max(numberOrZero(eligibleHours), hoursWorked - 10);
    result.source_rule_ids.push('CAO-PB-2024-R0804');
  }

  if (eligibleHours === null || eligibleHours <= 0) {
    result.manual_review_required = true;
    result.review_reason = 'Verschuiving gemeld, maar uren buiten gepubliceerde tijdvak/dienst ontbreken.';
    result.source_rule_ids.push('CAO-PB-2024-R0799');
    return result;
  }

  const pct = resolveShiftChangePercentage(shift);
  result.notice_days = pct.notice_days;
  if (pct.percentage === null) {
    result.manual_review_required = true;
    result.review_reason = 'Moment waarop werknemer de verschuiving hoorde ontbreekt; percentage 5/10/20% kan niet worden vastgesteld.';
    result.hours = eligibleHours;
    result.source_rule_ids.push('CAO-PB-2024-R0800');
    return result;
  }

  result.applies = true;
  result.hours = eligibleHours;
  result.percentage = pct.percentage;
  result.rate = baseHourlyRate * (pct.percentage / 100);
  result.amount = eligibleHours * result.rate;
  result.source_rule_ids.push('CAO-PB-2024-R0799', 'CAO-PB-2024-R0800', pct.source_rule_id, 'CAO-PB-2024-R0806', 'CAO-PB-2024-R0807');
  result.source_rule_ids = [...new Set(result.source_rule_ids.filter(Boolean))];
  return result;
}

function isGeneralReserveAssignment(shift, personnel) {
  return shift.general_reserve === true ||
    shift.is_general_reserve === true ||
    shift.general_reserve_assignment === true ||
    personnel.general_reserve === true ||
    personnel.is_general_reserve === true ||
    personnel.cao_general_reserve === true ||
    personnel.employee_subtype === 'general_reserve';
}

function resolveGeneralReserveAllowance(shift, personnel, paidHoursForShift, baseHourlyRate) {
  if (!isGeneralReserveAssignment(shift, personnel)) {
    return {
      applies: false,
      hours: 0,
      percentage: 0,
      rate: 0,
      amount: 0,
      source_rule_ids: []
    };
  }
  const percentage = Number(shift.general_reserve_allowance_percentage ?? 10);
  const hours = Math.max(0, paidHoursForShift);
  const rate = baseHourlyRate * (percentage / 100);
  return {
    applies: true,
    hours,
    percentage,
    rate,
    amount: hours * rate,
    source_rule_ids: ['CAO-PB-2024-R0606']
  };
}

async function resolveLoondienstWageBasis({ base44, personnel_id, personnel, caoScope }) {
  if (personnel.employee_type !== 'loondienst') {
    return {
      base_hourly_rate: null,
      wage_basis_type: personnel.employee_type === 'zzp' ? 'zzp_rate' : 'missing',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: personnel.employee_type === 'zzp' ? 'final' : 'not_applicable',
      warnings: [],
      cao_function_classification: null
    };
  }

  if (personnel.cao !== 'cao_particuliere_beveiliging') {
    const customRate = Number(personnel.custom_hourly_rate || 0);
    if (customRate <= 0) {
      return {
        base_hourly_rate: null,
        wage_basis_type: 'missing',
        appendix_2_applies: null,
        payroll_final_allowed: false,
        manual_review_required: true,
        calculation_status: 'blocked_missing_wage_basis',
        warnings: [],
        error: `Geen uurloon gevonden voor medewerker ${personnel.name} (eigen tarief): custom_hourly_rate ontbreekt.`,
        cao_function_classification: null
      };
    }
    return {
      base_hourly_rate: customRate,
      wage_basis_type: 'custom_hourly_rate',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: 'final',
      warnings: [],
      cao_function_classification: null
    };
  }

  let classification = null;
  try {
    const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
      personnel_id,
      work_context: {}
    });
    classification = classRes?.data || null;
  } catch {
    classification = null;
  }

  const profileAppendixApplies = caoScope?.payroll_rule_profile?.apply_appendix_2_function_scales === true;
  const appendixApplies = classification?.appendix_2_applies ?? profileAppendixApplies;
  const isScopeManual = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope?.cao_scope_profile) ||
    caoScope?.manual_review_required === true;

  if (appendixApplies === false) {
    const customRate = Number(personnel.custom_hourly_rate || 0);
    if (customRate <= 0) {
      return {
        base_hourly_rate: null,
        wage_basis_type: 'missing',
        appendix_2_applies: false,
        payroll_final_allowed: false,
        manual_review_required: true,
        calculation_status: 'blocked_missing_wage_basis',
        warnings: [
          ...(classification?.warnings || []),
          'CAO-schaal/periodiek wordt niet gebruikt omdat bijlage 2 niet van toepassing is.'
        ],
        error: 'Loonbasis ontbreekt voor niet-beveiligingspersoneel: custom_hourly_rate ontbreekt. Bijlage 2 loonschaal is niet van toepassing.',
        cao_function_classification: classification
      };
    }

    const manualReview = isScopeManual || classification?.manual_review_required === true;
    return {
      base_hourly_rate: customRate,
      wage_basis_type: 'custom_hourly_rate',
      appendix_2_applies: false,
      payroll_final_allowed: !manualReview && classification?.payroll_final_allowed !== false,
      manual_review_required: manualReview,
      calculation_status: manualReview ? 'concept_manual_review' : 'final',
      warnings: [
        ...(classification?.warnings || []),
        ...(personnel.cao_scale != null || personnel.cao_period != null
          ? ['CAO-schaal/periodiek genegeerd: bijlage 2 is niet van toepassing op dit toepassingsprofiel.']
          : [])
      ],
      cao_function_classification: classification
    };
  }

  if (!classification) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_manual_review',
      warnings: [],
      error: 'Functie-indeling kon niet worden bepaald. Loonberekening is geblokkeerd totdat bijlage-2 schaal en periodiek zijn gevalideerd.',
      cao_function_classification: null
    };
  }

  const classificationOk = classification.classification_status === 'resolved' &&
    classification.payroll_final_allowed === true &&
    classification.scale_valid_for_classification === true &&
    classification.period_valid_for_scale === true &&
    classification.wage_rate_found === true &&
    Number(classification.hourly_rate || 0) > 0;

  if (!classificationOk) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_manual_review',
      warnings: classification.warnings || [],
      error: `Functie-indeling/loonschaal niet definitief gevalideerd voor ${personnel.name}. Loonberekening is geblokkeerd totdat bijlage-2 schaal en periodiek kloppen.`,
      cao_function_classification: classification
    };
  }

  return {
    base_hourly_rate: Number(classification.hourly_rate),
    wage_basis_type: 'cao_appendix_2_scale',
    appendix_2_applies: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    calculation_status: 'final',
    warnings: classification.warnings || [],
    cao_function_classification: classification
  };
}

// Bereken loonheffing op basis van bruto loon
function calculateTaxAmount(taxableAmount, caoConfig, annualSalaryEstimate) {
  // Vereenvoudigde berekening: gebruik gemiddeld percentage op basis van jaarloon
  // In werkelijkheid is dit complexer met staffels en heffingskortingen
  
  const yearlyIncome = annualSalaryEstimate || (taxableAmount * 13); // 13 periodes per jaar
  
  let taxRate = 0;
  if (yearlyIncome <= (caoConfig.tax_bracket_1_limit || 38098)) {
    taxRate = caoConfig.tax_rate_bracket_1 || 36.97;
  } else if (yearlyIncome <= (caoConfig.tax_bracket_2_limit || 75518)) {
    taxRate = caoConfig.tax_rate_bracket_2 || 36.97;
  } else {
    taxRate = caoConfig.tax_rate_bracket_3 || 49.5;
  }
  
  return taxableAmount * (taxRate / 100);
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
          message: 'CAOConfiguration mist rule_registry_fingerprint; definitieve payroll is niet audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
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
    source_coverage_passed: snapshot?.source_coverage?.passed ?? null,
    missing_rule_ids_truncated: snapshot?.missing_rule_ids_truncated ?? false
  };
}

function hasObjectValues(value) {
  return value && typeof value === 'object' &&
    Object.values(value).some(v => v !== null && v !== undefined && v !== '');
}

function shiftHasContractResolutionContext(shift) {
  if (!shift || typeof shift !== 'object') return false;
  return !!(
    shift.contract_id ||
    shift.company_id ||
    shift.route_id ||
    shift.task_id ||
    shift.object_id ||
    shift.function_type ||
    shift.service_function_type ||
    shift.required_function_type ||
    shift.cao_function_group ||
    shift.required_cao_function_group ||
    shift.cao_function_level ||
    shift.required_cao_function_level ||
    shift.security_role_status ||
    shift.required_security_role_status ||
    shift.contract_assignment_policy ||
    shift.cao_key ||
    shift.cao ||
    shift.performs_security_work !== undefined ||
    shift.security_work_percentage !== undefined ||
    shift.works_event_or_hospitality_security !== undefined ||
    shift.event_hospitality_cao_applies !== undefined ||
    shift.works_airport_schiphol !== undefined ||
    shift.works_cash_value_logistics !== undefined ||
    hasObjectValues(shift.service_context)
  );
}

function shouldEnforceContractResolution({ body, workSchedule }) {
  if (body.enforce_contract_resolution === true) return true;
  if (
    body.contract_id ||
    body.company_id ||
    body.route_id ||
    body.task_id ||
    body.object_id ||
    hasObjectValues(body.service_context)
  ) return true;
  return (workSchedule || []).some(shiftHasContractResolutionContext);
}

function firstScheduleCaoKey(workSchedule) {
  for (const shift of workSchedule || []) {
    const shiftContext = shift?.service_context || {};
    const key = shift?.cao_key ||
      shift?.cao ||
      shiftContext.cao_key ||
      shiftContext.cao ||
      null;
    if (key) return key;
  }
  return null;
}

function addUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function collectScheduleCaoKeys(workSchedule) {
  const keys = [];
  for (const shift of workSchedule || []) {
    const shiftContext = shift?.service_context || {};
    const key = shift?.cao_key ||
      shift?.cao ||
      shiftContext.cao_key ||
      shiftContext.cao ||
      null;
    addUnique(keys, key);
  }
  return keys;
}

function collectScheduleObjectIds(workSchedule, body = {}) {
  const ids = [];
  addUnique(ids, body?.object_id);
  addUnique(ids, body?.service_context?.object_id);
  for (const shift of workSchedule || []) {
    addUnique(ids, shift?.object_id);
    addUnique(ids, shift?.service_context?.object_id);
  }
  return ids;
}

async function collectObjectCaoKeys(base44, workSchedule, body = {}) {
  const objectIds = collectScheduleObjectIds(workSchedule, body);
  const keys = [];
  for (const objectId of objectIds) {
    try {
      const object = await base44.asServiceRole.entities.SurveillanceObject.get(objectId);
      addUnique(keys, object?.cao_key || object?.cao || null);
    } catch { /* objectcontext is optioneel */ }
  }
  return keys;
}

function buildShiftContractServiceContext({ body, personnel, shift }) {
  const bodyContext = body.service_context || {};
  const shiftContext = shift.service_context || {};
  const companyId = shift.company_id || body.company_id || shiftContext.company_id || bodyContext.company_id || null;
  const objectId = shift.object_id || body.object_id || shiftContext.object_id || bodyContext.object_id || null;
  return {
    ...bodyContext,
    ...shiftContext,
    service_date: shift.date || shiftContext.service_date || bodyContext.service_date || null,
    cao_key: shift.cao_key ||
      shiftContext.cao_key ||
      bodyContext.cao_key ||
      body.cao_key ||
      null,
    cao: shift.cao ||
      shiftContext.cao ||
      bodyContext.cao ||
      body.cao ||
      null,
    company_id: companyId,
    object_id: objectId,
    function_type: shift.function_type ||
      shift.service_function_type ||
      shift.required_function_type ||
      shiftContext.function_type ||
      bodyContext.function_type ||
      personnel.function_type ||
      null,
    cao_function_group: shift.cao_function_group ||
      shift.required_cao_function_group ||
      shiftContext.cao_function_group ||
      bodyContext.cao_function_group ||
      personnel.cao_function_group ||
      null,
    cao_function_level: shift.cao_function_level ||
      shift.required_cao_function_level ||
      shiftContext.cao_function_level ||
      bodyContext.cao_function_level ||
      personnel.cao_function_level ||
      null,
    security_role_status: shift.required_security_role_status ||
      shift.security_role_status ||
      shiftContext.security_role_status ||
      bodyContext.security_role_status ||
      personnel.security_role_status ||
      null,
    performs_security_work: shift.performs_security_work ??
      shiftContext.performs_security_work ??
      bodyContext.performs_security_work ??
      null,
    security_work_percentage: shift.security_work_percentage ??
      shiftContext.security_work_percentage ??
      bodyContext.security_work_percentage ??
      null,
    works_airport_schiphol: shift.works_airport_schiphol ??
      shiftContext.works_airport_schiphol ??
      bodyContext.works_airport_schiphol ??
      null,
    works_cash_value_logistics: shift.works_cash_value_logistics ??
      shiftContext.works_cash_value_logistics ??
      bodyContext.works_cash_value_logistics ??
      null,
    works_event_or_hospitality_security: shift.works_event_or_hospitality_security ??
      shiftContext.works_event_or_hospitality_security ??
      bodyContext.works_event_or_hospitality_security ??
      null,
    event_hospitality_cao_applies: shift.event_hospitality_cao_applies ??
      shiftContext.event_hospitality_cao_applies ??
      bodyContext.event_hospitality_cao_applies ??
      null,
    contract_assignment_policy: shift.contract_assignment_policy ||
      shiftContext.contract_assignment_policy ||
      bodyContext.contract_assignment_policy ||
      'strict_contract_match'
  };
}

async function resolvePayrollContractContexts(base44, { body, personnel, personnelId, workSchedule }) {
  const results = [];
  const cache = {};
  for (const [index, shift] of (workSchedule || []).entries()) {
    const serviceContext = buildShiftContractServiceContext({ body, personnel, shift });
    const payload = {
      personnel_id: personnelId,
      contract_id: shift.contract_id || body.contract_id || null,
      route_id: shift.route_id || body.route_id || null,
      task_id: shift.task_id || body.task_id || null,
      object_id: serviceContext.object_id || null,
      company_id: serviceContext.company_id || null,
      service_date: serviceContext.service_date,
      service_context: serviceContext
    };
    const cacheKey = JSON.stringify(payload);
    if (!cache[cacheKey]) {
      cache[cacheKey] = base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', payload)
        .then(res => res?.data || {
          status: 'blocked_contract_resolution_empty',
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          blocking_reasons: ['Contractresolver gaf geen resultaat terug.']
        })
        .catch(error => ({
          status: 'blocked_contract_resolution_error',
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          blocking_reasons: [`Contractresolver fout: ${error.message}`]
        }));
    }
    const resolution = await cache[cacheKey];
    results.push({
      shift_index: index,
      date: shift.date || null,
      start_time: shift.start_time || null,
      end_time: shift.end_time || null,
      contract_resolution: resolution
    });
  }
  return results;
}

function contractResolutionBlocksPayroll(result) {
  const resolution = result?.contract_resolution || result || {};
  return resolution.planning_allowed === false ||
    resolution.payroll_final_allowed === false ||
    resolution.manual_review_required === true ||
    String(resolution.status || '').startsWith('blocked');
}

function collectContractResolutionScopeProfiles(results) {
  return [...new Set((results || [])
    .map(item => item?.contract_resolution?.cao_applicability?.cao_scope_profile)
    .filter(Boolean))];
}

function normalizeCorrectionAdjustments(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isOpenCaoPayrollCorrection(correction) {
  return ['queued', 'candidate', 'manual_review_required'].includes(correction?.status) &&
    !correction?.applied_payroll_run_id;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return 0;
}

function extractCaoCorrectionDeltaAmounts(delta = {}) {
  const grossDelta = firstNumber(
    delta.total_gross_delta,
    delta.gross_delta,
    delta.gross_pay_delta,
    delta.bruto_delta,
    delta.bruto_loon_delta
  );
  const employeeDeductionsDelta = firstNumber(
    delta.employee_deductions_delta,
    delta.employee_deductions_total_delta,
    delta.inhoudingen_delta
  );
  const employerCostsDelta = firstNumber(
    delta.employer_costs_delta,
    delta.employer_costs_total_delta,
    delta.werkgeverslasten_delta
  );
  const vacationAllowanceDelta = firstNumber(
    delta.vacation_allowance_delta,
    delta.vakantiegeld_delta
  );
  const yearEndBonusDelta = firstNumber(
    delta.year_end_bonus_delta,
    delta.eindejaarsuitkering_delta
  );
  const netSalaryDelta = firstNumber(
    delta.net_salary_delta,
    delta.net_delta,
    delta.netto_delta,
    delta.netto_loon_delta
  );
  const totalCostEmployerDelta = firstNumber(
    delta.total_cost_employer_delta,
    delta.employer_total_delta,
    delta.totale_werkgeverskosten_delta
  );
  const knownAmountFields = [
    'total_gross_delta', 'gross_delta', 'gross_pay_delta', 'bruto_delta', 'bruto_loon_delta',
    'employee_deductions_delta', 'employee_deductions_total_delta', 'inhoudingen_delta',
    'employer_costs_delta', 'employer_costs_total_delta', 'werkgeverslasten_delta',
    'vacation_allowance_delta', 'vakantiegeld_delta',
    'year_end_bonus_delta', 'eindejaarsuitkering_delta',
    'net_salary_delta', 'net_delta', 'netto_delta', 'netto_loon_delta',
    'total_cost_employer_delta', 'employer_total_delta', 'totale_werkgeverskosten_delta'
  ];
  const hasKnownAmount = knownAmountFields.some(field => numberOrNull(delta[field]) !== null);
  return {
    total_gross_delta: r2(grossDelta),
    employee_deductions_delta: r2(employeeDeductionsDelta),
    employer_costs_delta: r2(employerCostsDelta),
    vacation_allowance_delta: r2(vacationAllowanceDelta),
    year_end_bonus_delta: r2(yearEndBonusDelta),
    net_salary_delta: r2(hasKnownAmount && netSalaryDelta === 0
      ? grossDelta - employeeDeductionsDelta
      : netSalaryDelta),
    total_cost_employer_delta: r2(hasKnownAmount && totalCostEmployerDelta === 0
      ? grossDelta + employerCostsDelta + vacationAllowanceDelta + yearEndBonusDelta
      : totalCostEmployerDelta),
    has_known_payroll_amount: hasKnownAmount
  };
}

async function loadOpenCaoPayrollCorrections(base44, { personnelId, caoKey }) {
  if (!personnelId || !caoKey) return [];
  const corrections = await base44.asServiceRole.entities.CAOPayrollCorrection.filter({
    personnel_id: personnelId,
    cao_key: caoKey
  }).catch(() => []);
  return (corrections || [])
    .filter(isOpenCaoPayrollCorrection)
    .sort((a, b) => String(a.effective_from || '').localeCompare(String(b.effective_from || '')) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function buildCaoCorrectionApplication(corrections, adjustments, shouldApply) {
  const openCorrections = corrections || [];
  const missingAdjustmentIds = shouldApply
    ? openCorrections
      .filter(correction => !adjustments[correction.id]?.delta_snapshot)
      .map(correction => correction.id)
    : [];
  const missingPayrollAmountIds = shouldApply
    ? openCorrections
      .filter(correction => {
        const delta = adjustments[correction.id]?.delta_snapshot;
        return delta && !extractCaoCorrectionDeltaAmounts(delta).has_known_payroll_amount;
      })
      .map(correction => correction.id)
    : [];
  return {
    open_correction_count: openCorrections.length,
    has_open_corrections: openCorrections.length > 0,
    apply_requested: shouldApply === true,
    ready_to_apply: openCorrections.length === 0 ||
      (shouldApply === true && missingAdjustmentIds.length === 0 && missingPayrollAmountIds.length === 0),
    missing_adjustment_ids: missingAdjustmentIds,
    missing_payroll_amount_ids: missingPayrollAmountIds,
    correction_ids: openCorrections.map(correction => correction.id),
    review_ids: [...new Set(openCorrections.map(correction => correction.cao_change_review_id).filter(Boolean))],
    affected_payroll_run_ids: [...new Set(openCorrections.map(correction => correction.affected_payroll_run_id).filter(Boolean))],
    corrections: openCorrections.map(correction => ({
      id: correction.id,
      status: correction.status,
      cao_change_review_id: correction.cao_change_review_id || null,
      affected_payroll_run_id: correction.affected_payroll_run_id || null,
      rule_key: correction.rule_key || null,
      field_path: correction.field_path || null,
      effective_from: correction.effective_from || null,
      effective_until: correction.effective_until || null,
      correction_reason: correction.correction_reason || null,
      pay_period_year: correction.pay_period_year ?? null,
      pay_period_number: correction.pay_period_number ?? null
    }))
  };
}

function buildCaoCorrectionPayrollComponent(corrections, adjustments) {
  const items = [];
  const totals = {
    total_gross_delta: 0,
    employee_deductions_delta: 0,
    employer_costs_delta: 0,
    vacation_allowance_delta: 0,
    year_end_bonus_delta: 0,
    net_salary_delta: 0,
    total_cost_employer_delta: 0
  };

  for (const correction of corrections || []) {
    const adjustment = adjustments[correction.id] || {};
    const amounts = extractCaoCorrectionDeltaAmounts(adjustment.delta_snapshot || {});
    for (const key of Object.keys(totals)) {
      totals[key] += amounts[key] || 0;
    }
    items.push({
      correction_id: correction.id,
      cao_change_review_id: correction.cao_change_review_id || null,
      affected_payroll_run_id: correction.affected_payroll_run_id || null,
      rule_key: correction.rule_key || null,
      field_path: correction.field_path || null,
      effective_from: correction.effective_from || null,
      effective_until: correction.effective_until || null,
      ...amounts
    });
  }

  return {
    applied: items.length > 0,
    correction_count: items.length,
    items,
    total_gross_delta: r2(totals.total_gross_delta),
    employee_deductions_delta: r2(totals.employee_deductions_delta),
    employer_costs_delta: r2(totals.employer_costs_delta),
    vacation_allowance_delta: r2(totals.vacation_allowance_delta),
    year_end_bonus_delta: r2(totals.year_end_bonus_delta),
    net_salary_delta: r2(totals.net_salary_delta),
    total_cost_employer_delta: r2(totals.total_cost_employer_delta)
  };
}

async function markCaoCorrectionsApplied(base44, { corrections, adjustments, payrollRun, responsePayload }) {
  const appliedCorrectionIds = [];
  for (const correction of corrections || []) {
    const adjustment = adjustments[correction.id] || {};
    await base44.asServiceRole.entities.CAOPayrollCorrection.update(correction.id, {
      status: 'applied',
      queued_for_pay_period_year: responsePayload.pay_period_year ?? null,
      queued_for_pay_period_number: responsePayload.pay_period_number ?? null,
      applied_payroll_run_id: payrollRun.id,
      new_calculation_snapshot: adjustment.new_calculation_snapshot || null,
      delta_snapshot: adjustment.delta_snapshot,
      notes: [
        correction.notes || '',
        `Toegepast in payrollrun ${payrollRun.id} (${responsePayload.pay_period_year || 'jaar onbekend'}-${responsePayload.pay_period_number || 'periode onbekend'}).`
      ].filter(Boolean).join('\n')
    });
    appliedCorrectionIds.push(correction.id);
  }
  return appliedCorrectionIds;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      personnel_id,
      work_schedule,
      force_cao_sync,
      enforce_contract_resolution = false,
      contract_id = null,
      company_id = null,
      route_id = null,
      task_id = null,
      object_id = null,
      service_context = null,
      record_payroll_run = false,
      pay_period_year = null,
      pay_period_number = null,
      pay_period_start = null,
      pay_period_end = null,
      payroll_run_status = 'calculated',
      work_schedule_is_full_pay_period = false,
      vacation_hours = 0,
      extraordinary_leave_hours = 0,
      sickness_hours = 0,
      minus_hours = 0,
      empty_run_hours = 0,
      other_paid_work_time_hours = 0,
      paid_absence_hours = 0
    } = body;

    // ── Normaliseer CAO-scope: null = fail-closed (unknown_manual_review) ──
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

    function buildCaoScopeRuntime(scope) {
      const normalizedScope = normalizeCaoScope(scope);
      const warnings = [];
      const unknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(normalizedScope.cao_scope_profile);

      if (unknownOrMixed) {
        warnings.push({
          message: `CAO-toepassingsprofiel onzeker (${normalizedScope.cao_scope_profile}): beveiligingsspecifieke toeslagen (art. 40/42/43) worden NIET automatisch berekend. Handmatige review vereist.`,
          cao_scope_profile: normalizedScope.cao_scope_profile,
          manual_review_required: true
        });
      } else if (!normalizedScope.applies_full_security_rules) {
        const exclusions = [];
        if (normalizedScope.payroll_rule_profile?.apply_article_40_special_hours === false) exclusions.push('avond-/nacht-/weekendtoeslagen (art. 40)');
        if (normalizedScope.payroll_rule_profile?.apply_article_42_overtime === false) exclusions.push('overwerktoeslag (art. 42)');
        if (normalizedScope.payroll_rule_profile?.apply_article_43_shift_change === false) exclusions.push('dienstruilvergoeding (art. 43)');
        if (normalizedScope.payroll_rule_profile?.apply_chapter_5_reimbursements === false) exclusions.push('reiskosten/vergoedingen (hoofdstuk 5)');
        if (exclusions.length > 0) {
          warnings.push({
            message: `Artikel 3 lid 2 CAO PB (${normalizedScope.cao_scope_profile}): niet van toepassing: ${exclusions.join(', ')}. Art. 37/38/41 gelden wel.`,
            cao_scope_profile: normalizedScope.cao_scope_profile,
            excluded_articles: normalizedScope.excluded_articles || []
          });
        }
      }

      return {
        caoScope: normalizedScope,
        scopeWarnings: warnings,
        isUnknownOrMixedScope: unknownOrMixed,
        caoRuleApplication: {
          cao_scope_profile: normalizedScope.cao_scope_profile,
          applied_article_40_special_hours: !unknownOrMixed && (normalizedScope.payroll_rule_profile?.apply_article_40_special_hours === true),
          applied_article_41_holidays: normalizedScope.payroll_rule_profile?.apply_article_41_holidays !== false,
          applied_article_42_overtime: !unknownOrMixed && (normalizedScope.payroll_rule_profile?.apply_article_42_overtime === true),
          applied_chapter_5_reimbursements: !unknownOrMixed && (normalizedScope.payroll_rule_profile?.apply_chapter_5_reimbursements === true),
          manual_review_required: unknownOrMixed || normalizedScope.manual_review_required || false,
          source_rule_ids: normalizedScope.source_rule_ids || []
        }
      };
    }

    // work_schedule format: [{ date: "2025-01-15", start_time: "08:00", end_time: "17:00" }, ...]

    if (!personnel_id || !work_schedule || !Array.isArray(work_schedule)) {
      return Response.json({ error: 'personnel_id en work_schedule zijn verplicht' }, { status: 400 });
    }

    // Haal medewerker op
    const personnel = await base44.entities.Personnel.get(personnel_id);

    // Bepaal referentiedatum op basis van de eerste dienst
    const firstShiftDate = work_schedule[0]?.date || amsterdamInstantParts(new Date()).date;
    const refDate = new Date(firstShiftDate);
    const objectCaoKeys = await collectObjectCaoKeys(base44, work_schedule, body);
    const objectCaoKey = objectCaoKeys[0] || null;
    const targetCaoKey = body.cao_key ||
      service_context?.cao_key ||
      firstScheduleCaoKey(work_schedule) ||
      objectCaoKey ||
      personnel.cao ||
      CAO_PB_KEY;

    const calculationWarnings = [];
    const explicitScheduleCaoKeys = collectScheduleCaoKeys(work_schedule);
    for (const key of objectCaoKeys) addUnique(explicitScheduleCaoKeys, key);
    const conflictingScheduleCaoKeys = explicitScheduleCaoKeys.filter(key => key !== targetCaoKey);
    if (explicitScheduleCaoKeys.length > 1 || conflictingScheduleCaoKeys.length > 0) {
      return Response.json({
        error: 'Definitieve loonberekening geblokkeerd: deze loonrun bevat diensten met meerdere of afwijkende cao_key waarden.',
        calculation_warnings: [
          'Splits de loonrun per cao_key of geef een consistente cao_key mee op alle diensten.'
        ],
        personnel_id,
        cao_key: targetCaoKey,
        schedule_cao_keys: explicitScheduleCaoKeys,
        object_cao_keys: objectCaoKeys,
        cao_runtime_support: getCaoRuntimeSupport(targetCaoKey, 'calculatePersonnelCosts'),
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_mixed_schedule_cao_keys'
      }, { status: 400 });
    }

    // ── CAO-toepassingscheck ──
    // Deze resolver is PB-specifiek. Voor andere cao_key's blokkeert de runtime later fail-closed.
    let rawScope = null;
    if (targetCaoKey === CAO_PB_KEY && personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        rawScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }
    let { caoScope, scopeWarnings, isUnknownOrMixedScope, caoRuleApplication } = buildCaoScopeRuntime(rawScope);

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
    const syncResult = await lazySyncCao(base44, !!force_cao_sync, targetCaoKey);

    if (syncResult?.cloudflare_unavailable) {
      calculationWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    }
    if (syncResult?.reason === 'skipped_unsupported_cao_sync') {
      calculationWarnings.push('CAO Cloudflare lazy-sync overgeslagen: deze runtime ondersteunt alleen CAO Particuliere Beveiliging.');
    }
    if (syncResult?.reason === 'no_cloudflare_current') {
      calculationWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    }
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') {
      calculationWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');
    }

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    // Haal ACTIEVE CAO op basis van cao_key + datum (niet op created_date).
    // Zonder cao_key-filter kan een PB-loonrun per ongeluk een andere actieve CAO pakken.
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
      status: 'active',
      cao_key: targetCaoKey
    });
    const eligibleCaos = allCaos.filter(c => {
      if (c.valid_from && new Date(c.valid_from) > refDate) return false;
      if (c.valid_until && new Date(c.valid_until) < refDate) return false;
      return true;
    });
    eligibleCaos.sort((a, b) => {
      const da = a.valid_from ? new Date(a.valid_from) : new Date(0);
      const db = b.valid_from ? new Date(b.valid_from) : new Date(0);
      return db - da;
    });

    const caoConfig = eligibleCaos[0];
    if (!caoConfig) {
      return Response.json({
        error: `Geen actieve CAO-configuratie gevonden voor ${targetCaoKey} op datum ${firstShiftDate}. Activeer eerst een passende CAO-configuratie.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [...calculationWarnings, `Geen actieve CAO ${targetCaoKey} voor ${firstShiftDate}`],
        cao_key: targetCaoKey,
        cao_runtime_support: getCaoRuntimeSupport(targetCaoKey, 'calculatePersonnelCosts'),
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_missing_active_cao_config'
      }, { status: 400 });
    }

    const payrollReadiness = getCaoPayrollReadiness(caoConfig);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
    const payrollRuntimeSupport = getCaoRuntimeSupport(caoConfig.cao_key || targetCaoKey, 'calculatePersonnelCosts');
    if (!payrollRuntimeSupport.supported) {
      return Response.json({
        error: payrollRuntimeSupport.message,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...calculationWarnings,
          'Payroll geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        personnel_id,
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_valid_from: caoConfig.valid_from,
        cao_payroll_readiness: payrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: payrollRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: payrollRuntimeSupport.status
      }, { status: 422 });
    }
    if (!payrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${payrollReadiness.status}). Definitieve loonberekening is geblokkeerd totdat de CAO coverage-gate slaagt.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...calculationWarnings,
          'Payroll geblokkeerd: CAO-regeldekking of payrollparameters zijn niet bewezen compleet.'
        ],
        cao_configuration_id: caoConfig.id,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_valid_from: caoConfig.valid_from,
        cao_payroll_readiness: payrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: payrollRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    const applyQueuedCaoCorrections = body.apply_queued_cao_corrections === true;
    const caoCorrectionAdjustments = normalizeCorrectionAdjustments(body.cao_correction_adjustments);
    const openCaoPayrollCorrections = await loadOpenCaoPayrollCorrections(base44, {
      personnelId: personnel_id,
      caoKey: caoConfig.cao_key || targetCaoKey
    });
    const caoCorrectionApplication = buildCaoCorrectionApplication(
      openCaoPayrollCorrections,
      caoCorrectionAdjustments,
      applyQueuedCaoCorrections
    );

    if (record_payroll_run === true && caoCorrectionApplication.has_open_corrections) {
      if (!applyQueuedCaoCorrections) {
        return Response.json({
          error: 'Definitieve loonrun geblokkeerd: er staan open retroactieve CAO-correcties klaar voor deze medewerker/CAO.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Voeg apply_queued_cao_corrections=true en cao_correction_adjustments met delta_snapshot per correctie toe, of verwerk de correcties handmatig voordat deze loonrun wordt vastgelegd.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_key: caoConfig.cao_key || targetCaoKey,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          cao_payroll_corrections: caoCorrectionApplication,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_pending_cao_corrections'
        }, { status: 400 });
      }
      if (!caoCorrectionApplication.ready_to_apply) {
        return Response.json({
          error: 'Definitieve loonrun geblokkeerd: niet alle open CAO-correcties hebben een bruikbare financiële delta.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'CAO-correcties mogen niet zonder delta_snapshot én herkenbare bedragvelden als toegepast worden gemarkeerd.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_key: caoConfig.cao_key || targetCaoKey,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          cao_payroll_corrections: caoCorrectionApplication,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_missing_cao_correction_adjustments'
        }, { status: 400 });
      }
    }

    const contractResolutionRequired = shouldEnforceContractResolution({ body, workSchedule: work_schedule });
    let contractResolutionResults = [];
    let callAgreementContractMix = buildCallAgreementContractMix(contractResolutionResults);
    if (contractResolutionRequired) {
      contractResolutionResults = await resolvePayrollContractContexts(base44, {
        body: {
          ...body,
          enforce_contract_resolution,
          contract_id,
          company_id,
          route_id,
          task_id,
          object_id,
          service_context
        },
        personnel,
        personnelId: personnel_id,
        workSchedule: work_schedule
      });
      const blockedContractResolutions = contractResolutionResults.filter(contractResolutionBlocksPayroll);
      if (blockedContractResolutions.length > 0) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: niet alle diensten hebben een geldige contract-/bedrijf-/CAO-koppeling.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Payroll geblokkeerd: contractresolver vereist handmatige review of vond geen passend contract voor een of meer diensten.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          blocked_contract_resolution_count: blockedContractResolutions.length,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_contract_resolution'
        }, { status: 400 });
      }

      const resolvedScopeProfiles = collectContractResolutionScopeProfiles(contractResolutionResults);
      const globalScopeProfile = caoScope?.cao_scope_profile || null;
      if (resolvedScopeProfiles.length > 1) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: deze payrollrun bevat meerdere CAO-toepassingsscopes.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Payroll geblokkeerd: deze runtime berekent toeslagen nog met één CAO-scope per loonrun. Splits de run of implementeer per-dienst CAO-scope voordat definitief mag worden uitbetaald.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          global_cao_scope_profile: globalScopeProfile,
          resolved_contract_cao_scope_profiles: resolvedScopeProfiles,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_contract_scope_mismatch'
        }, { status: 400 });
      }
      if (resolvedScopeProfiles.length === 1 && globalScopeProfile && resolvedScopeProfiles[0] !== globalScopeProfile) {
        const resolvedScope = contractResolutionResults
          .map(item => item?.contract_resolution?.cao_applicability)
          .find(scope => scope?.cao_scope_profile === resolvedScopeProfiles[0]) || null;
        if (resolvedScope) {
          ({ caoScope, scopeWarnings, isUnknownOrMixedScope, caoRuleApplication } = buildCaoScopeRuntime(resolvedScope));
          calculationWarnings.push(`Payroll gebruikt contractspecifieke CAO-scope ${resolvedScope.cao_scope_profile} in plaats van medewerkerstamdata-scope ${globalScopeProfile}.`);
        } else {
          return Response.json({
            error: 'Definitieve loonberekening geblokkeerd: contractscope kon niet betrouwbaar worden toegepast op de payrollruntime.',
            cao_sync_status: caoSyncStatus,
            calculation_warnings: [
              ...calculationWarnings,
              'Payroll geblokkeerd: contractresolver gaf een scope-profiel terug zonder volledige scope-payload.'
            ],
            personnel_id,
            cao_configuration_id: caoConfig.id,
            cao_version_label: caoConfig.version_label || caoConfig.name,
            cao_valid_from: caoConfig.valid_from,
            cao_payroll_readiness: payrollReadiness,
            contract_resolution_required: true,
            contract_resolution_results: contractResolutionResults,
            global_cao_scope_profile: globalScopeProfile,
            resolved_contract_cao_scope_profiles: resolvedScopeProfiles,
            manual_review_required: true,
            payroll_final_allowed: false,
          calculation_status: 'blocked_contract_scope_mismatch'
        }, { status: 400 });
      }
      callAgreementContractMix = buildCallAgreementContractMix(contractResolutionResults);
      if (callAgreementContractMix.has_mixed_call_agreement_treatment) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: deze loonrun bevat zowel oproepovereenkomst-diensten als normale contractdiensten.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Splits de loonrun per contract/payoutbehandeling. Artikel 59 oproepkracht-uitbetaling mag niet worden gemengd met normale reserveringsregels in één berekening.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          call_agreement_contract_mix: callAgreementContractMix,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_mixed_call_agreement_contracts'
        }, { status: 400 });
      }
    }

    let totalHours = 0;
    let hoursByType = {
      day: 0,
      evening: 0,
      night: 0,
      weekend: 0,
      holiday: 0,
      new_years_eve: 0
    };

    // Check of dit een oproepkracht is, inclusief min-max en contractresolver-context.
    const isCallWorker = isCallWorkerForPayroll({ personnel, body, workSchedule: work_schedule, contractResolutionResults });
    
    // Breakdown zoals op loonstrook
    let payslip = {
      // Bruto componenten
      base_salary: 0,
      vacation_hours_call_worker: 0, // Compatibel veld: artikel 59 vakantiedagenuitbetaling oproepkracht
      vacation_pay_call_worker_article_59: {
        amount: 0,
        percentage: 9.24,
        payout_base_amount: 0,
        uncapped_payout_base_amount: 0,
        payout_base_hours: 0,
        uncapped_paid_base_hours: 0,
        max_hours_per_pay_period: 144,
        capped_at_144_hours_per_pay_period: false,
        manual_review_required: false,
        source_rule_ids: ['CAO-PB-2024-R1014', 'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017']
      },
      vacation_paid: 0, // Doorbetaling verlof
      surcharges: {
        evening_10: { hours: 0, rate: 0, amount: 0 },
        night_20: { hours: 0, rate: 0, amount: 0 },
        weekend_35: { hours: 0, rate: 0, amount: 0 },
        holiday_50: { hours: 0, rate: 0, amount: 0 },
        new_years_eve_100: { hours: 0, rate: 0, amount: 0 }
      },
      overtime_50: {
        hours: 0,
        rate: 0,
        amount: 0,
        threshold_hours_per_pay_period: null,
        arbeidstijd_hours_for_overtime: 0,
        applied: false,
        source_rule_ids: ['CAO-PB-2024-R0797']
      },
      minimum_service_compensation: {
        paid_hours: 0,
        top_up_hours: 0,
        amount: 0,
        min_hours_as_worked_hours: 0,
        min_hours_as_minus_or_empty_hours: 0,
        travel_reimbursement_required: false,
        source_rule_ids: []
      },
      acting_function_allowance: {
        paid_hours: 0,
        amount: 0,
        source_rule_ids: []
      },
      shift_change_allowance: {
        hours: 0,
        amount: 0,
        source_rule_ids: []
      },
      general_reserve_allowance: {
        hours: 0,
        amount: 0,
        source_rule_ids: []
      },
      value_services_early_shift_allowance: {
        shift_count: 0,
        amount: 0,
        rate_per_shift: 7.50,
        tax_treatment: 'bruto',
        details: [],
        source_rule_ids: []
      },
      cash_value_late_next_day_notice_allowance: {
        shift_count: 0,
        hours: 0,
        percentage: 20,
        amount: 0,
        details: [],
        source_rule_ids: []
      },
      cao_retroactive_corrections: {
        applied: false,
        correction_count: 0,
        items: [],
        total_gross_delta: 0,
        employee_deductions_delta: 0,
        employer_costs_delta: 0,
        vacation_allowance_delta: 0,
        year_end_bonus_delta: 0,
        net_salary_delta: 0,
        total_cost_employer_delta: 0
      },
      total_gross: 0,
      
      // Werknemersbijdragen (inhoudingen)
      employee_deductions: {
        premium_sfpb: 0,
        premium_paww: 0,
        pension_premium: 0,
        premium_wga: 0,
        tax_withheld: 0,
        total: 0
      },
      
      // Pensioengrondslag berekening
      pension_base: 0,
      
      // Reserveringen (voor normale werknemers) of direct uitbetaald (voor oproepkrachten)
      accruals: {
        vacation_allowance: 0,
        year_end_bonus: 0
      },
      vacation_entitlement: null,
      year_end_bonus_basis: {
        eligible_base_wage: 0,
        vacation_allowance_on_eligible_base_wage: 0,
        eligible_amount_including_vacation_allowance: 0,
        excluded_overtime_amount: 0,
        excluded_special_hours_allowances: 0,
        excluded_acting_function_allowance: 0,
        excluded_shift_change_allowance: 0,
        excluded_general_reserve_allowance: 0,
        source_rule_ids: ['CAO-PB-2024-R0770', 'CAO-PB-2024-R0771', 'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773']
      },
      
      // Werkgeverslasten (niet zichtbaar voor werknemer, maar wel kosten)
      employer_costs: {
        pension_premium: 0,
        premium_awf: 0,
        premium_ww: 0,
        premium_wia: 0,
        premium_wga: 0,
        premium_zw: 0,
        total: 0
      },
      
      // Totalen
      net_salary: 0,
      total_cost_employer: 0,
      
      // Details per shift
      shift_details: [],
      
      // Metadata
      is_call_worker: isCallWorker
    };

    // ── Bepaal loonbasis via CAO-scope + functieclassificatie ──
    const wageBasis = await resolveLoondienstWageBasis({ base44, personnel_id, personnel, caoScope });
    const functionClassificationResult = wageBasis.cao_function_classification;
    const payrollFinalAllowed = wageBasis.payroll_final_allowed;
    const wageBasisType = wageBasis.wage_basis_type;
    const calculationStatus = wageBasis.calculation_status;
    calculationWarnings.push(...(wageBasis.warnings || []));

    if (wageBasis.error) {
      return Response.json({
        error: wageBasis.error,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: calculationWarnings,
        cao_function_classification: functionClassificationResult,
        wage_basis_type: wageBasisType,
        calculation_status: calculationStatus,
        manual_review_required: wageBasis.manual_review_required,
        payroll_final_allowed: false
      }, { status: 400 });
    }

    const baseHourlyRate = wageBasis.base_hourly_rate || 0;
    let runtimePayrollFinalAllowed = payrollFinalAllowed;
    let runtimeCalculationStatus = calculationStatus;
    const payrollRuntimeReviewItems = [];
    let minimumServiceTopUpHoursForOvertime = 0;
    if (caoCorrectionApplication.has_open_corrections && !applyQueuedCaoCorrections) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = 'blocked_pending_cao_corrections';
      calculationWarnings.push('Open retroactieve CAO-correcties gevonden; deze berekening is niet payroll-final totdat correcties met delta-bewijs zijn verwerkt.');
      payrollRuntimeReviewItems.push({
        rule_id: 'cao_payroll_corrections',
        domain: 'retroactive_cao_corrections',
        message: 'Open retroactieve CAO-correcties moeten in de loonrun worden verwerkt.',
        correction_ids: caoCorrectionApplication.correction_ids
      });
    }

    // Bereken per werkdag
    for (const shift of work_schedule) {
      const { date, start_time, end_time } = shift;
      
      if (!date || !start_time || !end_time) {
        return Response.json({ error: 'Elke dienst moet een datum, starttijd en eindtijd hebben' }, { status: 400 });
      }

      const shiftInterval = buildCaoShiftInterval(date, start_time, end_time, false);

      if (!shiftInterval || Number.isNaN(shiftInterval.start.getTime()) || Number.isNaN(shiftInterval.end.getTime())) {
        return Response.json({ error: 'Ongeldige datum of tijd ingevuld' }, { status: 400 });
      }
      
      // CAO-tijdzone: betaal werkelijke uren in Europe/Amsterdam, inclusief zomer-/wintertijd.
      const startDate = shiftInterval.start;
      const endDate = shiftInterval.end;
      const hoursWorked = Math.max(0, (endDate - startDate) / (1000 * 60 * 60));
      const dstPayrollInfo = getDstPayrollInfo(date, start_time, end_time, hoursWorked, false);
      if (dstPayrollInfo?.manual_review_required) {
        payrollRuntimeReviewItems.push({
          rule_id: 'CAO-PB-2024-R0712',
          domain: 'dst_actual_worked_hours',
          message: 'Dienst gebruikt een lokaal tijdstip in het ontbrekende of dubbele DST-uur; bevestig de werkelijk gemaakte uren.',
          field: 'start_time/end_time'
        });
        runtimePayrollFinalAllowed = false;
        runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
      }
      
      totalHours += hoursWorked;

      if (personnel.employee_type === 'zzp') {
        // ZZP berekening (vereenvoudigd, zonder alle details)
        let zzpRate = personnel.zzp_hourly_rate_excl_vat || 0;
        
        const startSurchargeType = getSurchargeType(startDate, caoConfig).type;
        
        if (['holiday', 'new_years_eve'].includes(startSurchargeType) && personnel.zzp_holiday_rate) {
          zzpRate = personnel.zzp_holiday_rate;
        } else if (startSurchargeType === 'weekend' && personnel.zzp_weekend_rate) {
          zzpRate = personnel.zzp_weekend_rate;
        } else if (startSurchargeType === 'night' && personnel.zzp_night_rate) {
          zzpRate = personnel.zzp_night_rate;
        } else if (startSurchargeType === 'evening' && personnel.zzp_evening_rate) {
          zzpRate = personnel.zzp_evening_rate;
        }
        
        const hourCostExclVat = zzpRate * hoursWorked;
        const vatAmount = hourCostExclVat * 0.21;
        
        payslip.base_salary += hourCostExclVat + vatAmount;
        
        payslip.shift_details.push({
          date,
          hours: hoursWorked,
          rate_excl_vat: zzpRate,
          vat: vatAmount,
          type: 'zzp',
          total: hourCostExclVat + vatAmount,
          dst_payroll_info: dstPayrollInfo
        });
        
      } else {
        // CAO-scope gate: bijzondere uren ALLEEN als expliciet true (fail-closed)
        const applySpecialHours = !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_40_special_hours === true);
        // Feestdagtoeslag: aan tenzij expliciet uitgesloten
        const applyHolidays = caoScope.payroll_rule_profile?.apply_article_41_holidays !== false;

        // Loondienst berekening - verwerk dienst per uur voor correcte toeslagberekening
        const timeSegments = buildCaoTimeSegments(startDate, endDate);
        for (const segment of timeSegments) {
          const hoursThisSegment = segment.hours;
          const surchargeInfo = getSurchargeType(segment.start, caoConfig);
          let surchargeType = surchargeInfo.type;
          let surchargePercentage = surchargeInfo.percentage;

          // Pas scope-gates toe: bijzondere uren en weekendtoeslagen alleen bij full_security/art.40
          if (!applySpecialHours && ['evening', 'night', 'weekend'].includes(surchargeType)) {
            surchargeType = 'day';
            surchargePercentage = 0;
          }
          // Feestdagtoeslag altijd als applyHolidays
          if (!applyHolidays && surchargeType === 'holiday') {
            surchargeType = 'day';
            surchargePercentage = 0;
          }
          
          hoursByType[surchargeType] += hoursThisSegment;
          
          const grossWageThisSegment = baseHourlyRate * hoursThisSegment;
          payslip.base_salary += grossWageThisSegment;
          
          // Bereken toeslag bedrag
          const surchargeAmount = grossWageThisSegment * (surchargePercentage / 100);
          const surchargeRatePerHour = baseHourlyRate * (surchargePercentage / 100);
          
          // Categoriseer toeslagen
          if (surchargeType === 'evening') {
            payslip.surcharges.evening_10.hours += hoursThisSegment;
            payslip.surcharges.evening_10.rate = surchargeRatePerHour;
            payslip.surcharges.evening_10.amount += surchargeAmount;
          } else if (surchargeType === 'night') {
            payslip.surcharges.night_20.hours += hoursThisSegment;
            payslip.surcharges.night_20.rate = surchargeRatePerHour;
            payslip.surcharges.night_20.amount += surchargeAmount;
          } else if (surchargeType === 'weekend') {
            payslip.surcharges.weekend_35.hours += hoursThisSegment;
            payslip.surcharges.weekend_35.rate = surchargeRatePerHour;
            payslip.surcharges.weekend_35.amount += surchargeAmount;
          } else if (surchargeType === 'holiday') {
            payslip.surcharges.holiday_50.hours += hoursThisSegment;
            payslip.surcharges.holiday_50.rate = surchargeRatePerHour;
            payslip.surcharges.holiday_50.amount += surchargeAmount;
          } else if (surchargeType === 'new_years_eve') {
            payslip.surcharges.new_years_eve_100.hours += hoursThisSegment;
            payslip.surcharges.new_years_eve_100.rate = surchargeRatePerHour;
            payslip.surcharges.new_years_eve_100.amount += surchargeAmount;
          }
        }

        const minimumService = resolveMinimumServiceCompensation(shift, hoursWorked);
        if (minimumService.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: minimumService.source_rule_ids[0] || 'CAO-PB-2024-R0816',
            domain: 'minimum_service_compensation',
            message: minimumService.review_reason || 'Minimumvergoeding per dienst vereist handmatige beoordeling.',
            field: 'service_parts'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (minimumService.applies && minimumService.top_up_hours > 0) {
          minimumService.amount = minimumService.top_up_hours * baseHourlyRate;
          payslip.minimum_service_compensation.paid_hours += minimumService.paid_hours;
          payslip.minimum_service_compensation.top_up_hours += minimumService.top_up_hours;
          payslip.minimum_service_compensation.amount += minimumService.amount;
          payslip.minimum_service_compensation.min_hours_as_worked_hours += minimumService.min_hours_as_worked_hours;
          payslip.minimum_service_compensation.min_hours_as_minus_or_empty_hours += minimumService.min_hours_as_minus_or_empty_hours;
          payslip.minimum_service_compensation.travel_reimbursement_required ||= minimumService.travel_reimbursement_required;
          payslip.minimum_service_compensation.source_rule_ids = [
            ...new Set([
              ...payslip.minimum_service_compensation.source_rule_ids,
              ...minimumService.source_rule_ids
            ])
          ];
          minimumServiceTopUpHoursForOvertime += minimumService.top_up_hours;
        }

        const paidHoursForActingAllowance = minimumService.applies ? minimumService.paid_hours : hoursWorked;
        const generalReserveAllowance = resolveGeneralReserveAllowance(shift, personnel, paidHoursForActingAllowance, baseHourlyRate);
        if (generalReserveAllowance.applies && generalReserveAllowance.amount > 0) {
          payslip.general_reserve_allowance.hours += generalReserveAllowance.hours;
          payslip.general_reserve_allowance.amount += generalReserveAllowance.amount;
          payslip.general_reserve_allowance.source_rule_ids = [
            ...new Set([
              ...payslip.general_reserve_allowance.source_rule_ids,
              ...generalReserveAllowance.source_rule_ids
            ])
          ];
        }

        const actingAllowance = resolveActingFunctionAllowance(shift, personnel, paidHoursForActingAllowance, caoConfig);
        if (actingAllowance.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: actingAllowance.source_rule_ids[0] || 'CAO-PB-2024-R0775',
            domain: 'acting_function_allowance',
            message: actingAllowance.review_reason || 'Functiewaarneming vereist handmatige beoordeling.',
            field: 'acting_function'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (actingAllowance.applies && actingAllowance.amount > 0) {
          payslip.acting_function_allowance.paid_hours += actingAllowance.paid_hours;
          payslip.acting_function_allowance.amount += actingAllowance.amount;
          payslip.acting_function_allowance.source_rule_ids = [
            ...new Set([
              ...payslip.acting_function_allowance.source_rule_ids,
              ...actingAllowance.source_rule_ids
            ])
          ];
        }

        const shiftChangeAllowance = resolveShiftChangeAllowance(shift, personnel, hoursWorked, baseHourlyRate);
        if (shiftChangeAllowance.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: shiftChangeAllowance.source_rule_ids[0] || 'CAO-PB-2024-R0799',
            domain: 'shift_change_allowance',
            message: shiftChangeAllowance.review_reason || 'Verschuivingstoeslag vereist handmatige beoordeling.',
            field: 'shift_change_allowance_hours/shift_change_notice_days'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (shiftChangeAllowance.applies && shiftChangeAllowance.amount > 0) {
          payslip.shift_change_allowance.hours += shiftChangeAllowance.hours;
          payslip.shift_change_allowance.amount += shiftChangeAllowance.amount;
          payslip.shift_change_allowance.source_rule_ids = [
            ...new Set([
              ...payslip.shift_change_allowance.source_rule_ids,
              ...shiftChangeAllowance.source_rule_ids
            ])
          ];
        }

        const valueServicesEarlyShiftAllowance = resolveValueServicesEarlyShiftAllowance(shift, caoScope);
        if (valueServicesEarlyShiftAllowance.applies) {
          payslip.value_services_early_shift_allowance.shift_count += 1;
          payslip.value_services_early_shift_allowance.amount += valueServicesEarlyShiftAllowance.amount;
          payslip.value_services_early_shift_allowance.details.push({
            date,
            start_time,
            amount: valueServicesEarlyShiftAllowance.amount,
            tax_treatment: valueServicesEarlyShiftAllowance.tax_treatment,
            source_rule_ids: valueServicesEarlyShiftAllowance.source_rule_ids
          });
          payslip.value_services_early_shift_allowance.source_rule_ids = [
            ...new Set([
              ...payslip.value_services_early_shift_allowance.source_rule_ids,
              ...valueServicesEarlyShiftAllowance.source_rule_ids
            ])
          ];
        }

        const cashValueLateNextDayNoticeAllowance = resolveCashValueLateNextDayNoticeAllowance(shift, caoScope, hoursWorked, baseHourlyRate);
        if (cashValueLateNextDayNoticeAllowance.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: cashValueLateNextDayNoticeAllowance.source_rule_ids[0] || 'CAO-PB-2024-R1617',
            domain: 'cash_value_late_next_day_notice_allowance',
            message: cashValueLateNextDayNoticeAllowance.review_reason || 'Geld- en waardelogistiek volgende-dagdienst vereist handmatige beoordeling.',
            field: 'cash_value_next_day_service_notice_at/service_communicated_at'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (cashValueLateNextDayNoticeAllowance.applies) {
          payslip.cash_value_late_next_day_notice_allowance.shift_count += 1;
          payslip.cash_value_late_next_day_notice_allowance.hours += cashValueLateNextDayNoticeAllowance.hours;
          payslip.cash_value_late_next_day_notice_allowance.amount += cashValueLateNextDayNoticeAllowance.amount;
          payslip.cash_value_late_next_day_notice_allowance.details.push({
            date,
            start_time,
            end_time,
            hours: cashValueLateNextDayNoticeAllowance.hours,
            percentage: cashValueLateNextDayNoticeAllowance.percentage,
            amount: cashValueLateNextDayNoticeAllowance.amount,
            notice_at: cashValueLateNextDayNoticeAllowance.notice_at,
            deadline_at: cashValueLateNextDayNoticeAllowance.deadline_at,
            source_rule_ids: cashValueLateNextDayNoticeAllowance.source_rule_ids
          });
          payslip.cash_value_late_next_day_notice_allowance.source_rule_ids = [
            ...new Set([
              ...payslip.cash_value_late_next_day_notice_allowance.source_rule_ids,
              ...cashValueLateNextDayNoticeAllowance.source_rule_ids
            ])
          ];
        }
        
        payslip.shift_details.push({
          date,
          start_time,
          end_time,
          hours: hoursWorked,
          dst_payroll_info: dstPayrollInfo,
          base_rate: baseHourlyRate,
          minimum_service_compensation: {
            applies: minimumService.applies,
            paid_hours: r2(minimumService.paid_hours),
            top_up_hours: r2(minimumService.top_up_hours),
            amount: r2(minimumService.amount),
            travel_reimbursement_required: minimumService.travel_reimbursement_required,
            manual_review_required: minimumService.manual_review_required,
            source_rule_ids: minimumService.source_rule_ids
          },
          general_reserve_allowance: {
            applies: generalReserveAllowance.applies,
            hours: r2(generalReserveAllowance.hours),
            percentage: generalReserveAllowance.percentage,
            rate: r2(generalReserveAllowance.rate),
            amount: r2(generalReserveAllowance.amount),
            source_rule_ids: generalReserveAllowance.source_rule_ids
          },
          acting_function_allowance: {
            applies: actingAllowance.applies,
            paid_hours: r2(actingAllowance.paid_hours),
            scale_difference: actingAllowance.scale_difference,
            rate: r2(actingAllowance.rate),
            amount: r2(actingAllowance.amount),
            lower_function_keeps_old_scale: actingAllowance.lower_function_keeps_old_scale,
            manual_review_required: actingAllowance.manual_review_required,
            source_rule_ids: actingAllowance.source_rule_ids
          },
          shift_change_allowance: {
            applies: shiftChangeAllowance.applies,
            hours: r2(shiftChangeAllowance.hours),
            percentage: shiftChangeAllowance.percentage,
            rate: r2(shiftChangeAllowance.rate),
            amount: r2(shiftChangeAllowance.amount),
            notice_days: shiftChangeAllowance.notice_days,
            manual_review_required: shiftChangeAllowance.manual_review_required,
            source_rule_ids: shiftChangeAllowance.source_rule_ids
          },
          value_services_early_shift_allowance: {
            applies: valueServicesEarlyShiftAllowance.applies,
            amount: r2(valueServicesEarlyShiftAllowance.amount),
            rate_per_shift: valueServicesEarlyShiftAllowance.rate_per_shift,
            tax_treatment: valueServicesEarlyShiftAllowance.tax_treatment,
            source_rule_ids: valueServicesEarlyShiftAllowance.source_rule_ids
          },
          cash_value_late_next_day_notice_allowance: {
            applies: cashValueLateNextDayNoticeAllowance.applies,
            hours: r2(cashValueLateNextDayNoticeAllowance.hours),
            percentage: cashValueLateNextDayNoticeAllowance.percentage,
            amount: r2(cashValueLateNextDayNoticeAllowance.amount),
            notice_at: cashValueLateNextDayNoticeAllowance.notice_at,
            deadline_at: cashValueLateNextDayNoticeAllowance.deadline_at,
            manual_review_required: cashValueLateNextDayNoticeAllowance.manual_review_required,
            source_rule_ids: cashValueLateNextDayNoticeAllowance.source_rule_ids
          }
        });
      }
    }

    if (personnel.employee_type === 'zzp') {
      // ZZP: totaal is inclusief BTW
      payslip.total_gross = payslip.base_salary;
      payslip.net_salary = payslip.base_salary;
      payslip.total_cost_employer = payslip.base_salary;
      
    } else {
      // Loondienst: Bereken alle componenten
      const profile = caoScope?.payroll_rule_profile || {};
      const applyOvertime = !isUnknownOrMixedScope && profile.apply_article_42_overtime === true;
      const overtimeRules = getOvertimeRules(caoConfig);
      const explicitPaidAbsenceHours =
        numberOrZero(paid_absence_hours) +
        numberOrZero(vacation_hours) +
        numberOrZero(extraordinary_leave_hours) +
        numberOrZero(sickness_hours) +
        numberOrZero(minus_hours) +
        numberOrZero(empty_run_hours) +
        numberOrZero(other_paid_work_time_hours);
      const arbeidstijdHoursForOvertime = totalHours + minimumServiceTopUpHoursForOvertime + explicitPaidAbsenceHours;
      const representsFullPayPeriod = work_schedule_is_full_pay_period === true ||
        record_payroll_run === true ||
        (!!pay_period_number && !!pay_period_start && !!pay_period_end);

      payslip.overtime_50.threshold_hours_per_pay_period = overtimeRules.threshold_hours_per_pay_period;
      payslip.overtime_50.arbeidstijd_hours_for_overtime = arbeidstijdHoursForOvertime;
      payslip.overtime_50.source_rule_ids = overtimeRules.source_rule_ids;

      if (applyOvertime) {
        if (!representsFullPayPeriod && arbeidstijdHoursForOvertime <= overtimeRules.threshold_hours_per_pay_period) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R0797',
            domain: 'overtime',
            message: 'Overwerktoeslag kan alleen definitief worden vastgesteld op basis van de volledige loonperiode. Geef work_schedule_is_full_pay_period=true of loonperiodegegevens mee.',
            field: 'work_schedule_is_full_pay_period'
          });
          calculationWarnings.push('Overwerk niet definitief vastgesteld: work_schedule lijkt geen volledige loonperiode te bevatten.');
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        } else {
          const overtimeHours = Math.max(0, arbeidstijdHoursForOvertime - overtimeRules.threshold_hours_per_pay_period);
          payslip.overtime_50.hours = overtimeHours;
          payslip.overtime_50.rate = baseHourlyRate * (overtimeRules.surcharge_percentage / 100);
          payslip.overtime_50.amount = overtimeHours * baseHourlyRate * (overtimeRules.surcharge_percentage / 100);
          payslip.overtime_50.applied = overtimeHours > 0;
        }
      } else if (arbeidstijdHoursForOvertime > overtimeRules.threshold_hours_per_pay_period) {
        calculationWarnings.push(`Meer dan ${overtimeRules.threshold_hours_per_pay_period} uur arbeidstijd gesignaleerd, maar art. 42 overwerktoeslag is niet van toepassing op dit CAO-profiel.`);
      }
      
      // Totaal bruto loon = basis + artikel 59 vakantiedagenuitbetaling oproep + toeslagen
      const totalSurcharges = 
        payslip.surcharges.evening_10.amount +
        payslip.surcharges.night_20.amount +
        payslip.surcharges.weekend_35.amount +
        payslip.surcharges.holiday_50.amount +
        payslip.surcharges.new_years_eve_100.amount;
      const overtimeAmount = payslip.overtime_50.amount;
      const minimumServiceAmount = payslip.minimum_service_compensation.amount;
      const actingFunctionAllowanceAmount = payslip.acting_function_allowance.amount;
      const shiftChangeAllowanceAmount = payslip.shift_change_allowance.amount;
      const generalReserveAllowanceAmount = payslip.general_reserve_allowance.amount;
      const valueServicesEarlyShiftAllowanceAmount = payslip.value_services_early_shift_allowance.amount;
      const cashValueLateNextDayNoticeAllowanceAmount = payslip.cash_value_late_next_day_notice_allowance.amount;
      if (isCallWorker) {
        const callWorkerVacationPayout = calculateCallWorkerVacationPayoutArticle59({
          baseWageAmount: payslip.base_salary,
          minimumServiceAmount,
          baseHourlyRate,
          paidBaseHours: totalHours + payslip.minimum_service_compensation.top_up_hours
        });
        payslip.vacation_pay_call_worker_article_59 = callWorkerVacationPayout;
        payslip.vacation_hours_call_worker = callWorkerVacationPayout.amount;
        if (callWorkerVacationPayout.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R1016',
            domain: 'call_worker_vacation_payout',
            message: 'Vakantiedagenuitbetaling oproepkracht is afgetopt op 144 uur, maar de basisuurloon-context ontbreekt voor definitieve cap-berekening.',
            field: 'base_hourly_rate'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
      }
      const yearEndBonusEligibleBaseWage = payslip.base_salary + minimumServiceAmount;
      const yearEndBonusEligibleVacationAllowance = yearEndBonusEligibleBaseWage * ((caoConfig.vacation_allowance || 8) / 100);
      const yearEndBonusBasisAmount = yearEndBonusEligibleBaseWage + yearEndBonusEligibleVacationAllowance;
      payslip.year_end_bonus_basis = {
        eligible_base_wage: yearEndBonusEligibleBaseWage,
        vacation_allowance_on_eligible_base_wage: yearEndBonusEligibleVacationAllowance,
        eligible_amount_including_vacation_allowance: yearEndBonusBasisAmount,
        excluded_overtime_amount: overtimeAmount,
        excluded_special_hours_allowances: totalSurcharges,
        excluded_acting_function_allowance: actingFunctionAllowanceAmount,
        excluded_shift_change_allowance: shiftChangeAllowanceAmount,
        excluded_general_reserve_allowance: generalReserveAllowanceAmount,
        excluded_value_services_early_shift_allowance: valueServicesEarlyShiftAllowanceAmount,
        excluded_cash_value_late_next_day_notice_allowance: cashValueLateNextDayNoticeAllowanceAmount,
        source_rule_ids: ['CAO-PB-2024-R0770', 'CAO-PB-2024-R0771', 'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773']
      };
      
      // Bereken gemiddelde ORT per uur (voor ORT verlof berekening)
      const avgOrtPerHour = totalHours > 0 ? totalSurcharges / totalHours : 0;
      
      // Voor oproepkrachten: vakantiegeld en eindejaarsuitkering direct uitbetaald
      if (isCallWorker) {
        // Bereken vakantiegeld en eindejaarsuitkering als percentage van basis + toeslagen
        const baseForAllowances = payslip.base_salary + minimumServiceAmount + totalSurcharges;

        payslip.accruals.vacation_allowance = baseForAllowances * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = yearEndBonusBasisAmount * ((caoConfig.year_end_bonus || 2.01) / 100);
        payslip.vacation_paid = 0;
        
        // Voor oproepkrachten wordt dit direct uitbetaald, niet gereserveerd
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + payslip.vacation_hours_call_worker + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + generalReserveAllowanceAmount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount + payslip.accruals.vacation_allowance + payslip.accruals.year_end_bonus + payslip.vacation_paid;
      } else {
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + generalReserveAllowanceAmount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount;
      }
      
      // Bereken pensioengrondslag (bruto loon - vakantiegeld/eindejaarsuitkering - franchise)
      // Voor oproepkrachten: basis + toeslagen (zonder vakantiegeld/eindejaarsuitkering)
      const pensionBaseAmount = isCallWorker 
        ? (payslip.base_salary + totalSurcharges + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount)
        : payslip.total_gross;
      
      // Franchise op jaarbasis, hier naar periode omrekenen (4-wekelijks = 13 periodes)
      const franchiseThisPeriod = (caoConfig.pension_base_salary_threshold || 16164) / 13;
      let pensionBase = Math.max(0, pensionBaseAmount - franchiseThisPeriod);
      
      // Voor lage inkomens: zorg dat er altijd minimaal pensioen wordt opgebouwd
      // Als pensioengrondslag te laag is, neem een minimale basis aan
      if (pensionBase > 0 && pensionBase < 100) {
        pensionBase = Math.max(pensionBase, pensionBaseAmount * 0.1); // minimaal 10% van het loon
      }
      
      payslip.pension_base = pensionBase;
      
      // Werknemersbijdragen - basis is altijd bruto loon exclusief vakantiegeld/eindejaarsuitkering voor oproepkrachten
      const basisForPremiums = isCallWorker ? (payslip.base_salary + payslip.vacation_hours_call_worker + totalSurcharges + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount) : payslip.total_gross;
      
      payslip.employee_deductions.premium_sfpb = basisForPremiums * ((caoConfig.premium_sfpb || 0.061) / 100);
      payslip.employee_deductions.premium_paww = basisForPremiums * ((caoConfig.premium_paww_employee || 0.1) / 100);
      
      // Pensioenpremie werknemer (40% van totaal)
      const totalPensionPremium = pensionBase * ((caoConfig.pension_premium_rate_total || 24.1) / 100);
      payslip.employee_deductions.pension_premium = totalPensionPremium * ((caoConfig.pension_premium_employee || 40) / 100);
      
      payslip.employee_deductions.premium_wga = basisForPremiums * ((caoConfig.premium_wga_employee || 0.81) / 100);
      
      // Belastingberekening
      const taxableIncome = payslip.total_gross - payslip.employee_deductions.pension_premium;
      
      // Schat jaarloon - voor oproepkrachten conservatief schatten
      const estimatedAnnualSalary = basisForPremiums * 13;
      
      // Als jaarloon te laag is (onder grens), geen loonheffing
      if (estimatedAnnualSalary < 12000) {
        payslip.employee_deductions.tax_withheld = 0;
      } else {
        payslip.employee_deductions.tax_withheld = calculateTaxAmount(taxableIncome, caoConfig, estimatedAnnualSalary);
      }
      
      payslip.employee_deductions.total = 
        payslip.employee_deductions.premium_sfpb +
        payslip.employee_deductions.premium_paww +
        payslip.employee_deductions.pension_premium +
        payslip.employee_deductions.premium_wga +
        payslip.employee_deductions.tax_withheld;
      
      // Reserveringen - voor normale werknemers
      if (!isCallWorker) {
        // Bereken gemiddelde ORT per uur (voor ORT verlof berekening)
        const avgOrtPerHour = totalHours > 0 ? totalSurcharges / totalHours : 0;
        const paidHoursForVacationAccrual =
          totalHours +
          payslip.minimum_service_compensation.top_up_hours +
          numberOrZero(vacation_hours) +
          numberOrZero(extraordinary_leave_hours) +
          numberOrZero(sickness_hours) +
          numberOrZero(other_paid_work_time_hours) +
          numberOrZero(paid_absence_hours);
        const vacationServiceContext = buildVacationServiceContext({
          personnel,
          body,
          contractResolutionResults,
          referenceDate: pay_period_start || firstShiftDate
        });
        const vacationEntitlement = calculateVacationEntitlementForPayPeriod({
          paidHoursPerPayPeriod: paidHoursForVacationAccrual,
          vacationServiceContext,
          caoScopeProfile: caoScope?.cao_scope_profile || null
        });
        payslip.vacation_entitlement = vacationEntitlement;

        if (vacationServiceContext.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R1019',
            domain: 'vacation_entitlement',
            message: 'Dienstjarencontext voor extra vakantiedagen ontbreekt; vakantie-/ORT-verlofbasis kan niet definitief worden vastgesteld.',
            field: 'vacation_service_years/vacation_service_start_date'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (vacationEntitlement.extra_vacation_days_manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R1602',
            domain: 'vacation_entitlement',
            message: 'Geld- en waardelogistiek gebruikt de afwijkende vakantie-opbouw van art. 100 (180 uur/25 dagen, 13,85 uur per loonperiode); eventuele extra vakantiedagen uit art. 59 blijven handmatige review.',
            field: 'cao_scope_profile'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }
        if (work_schedule_is_full_pay_period !== true) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R1010',
            domain: 'vacation_entitlement',
            message: 'Werkrooster is niet bevestigd als volledige loonperiode; vakantieopbouw over alle betaalde uren tot maximaal 144 uur kan alleen als concept worden berekend.',
            field: 'work_schedule_is_full_pay_period'
          });
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        }

        const ortVerlofReservation = vacationEntitlement.vacation_hours_accrued_per_pay_period * avgOrtPerHour;
        
        payslip.accruals.vacation_allowance = payslip.total_gross * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = yearEndBonusBasisAmount * ((caoConfig.year_end_bonus || 2.01) / 100);
        
        // Voeg ORT verlof reservering toe
        payslip.vacation_paid = ortVerlofReservation;
      }
      
      // Netto loon
      payslip.net_salary = payslip.total_gross - payslip.employee_deductions.total;
      
      // Werkgeverslasten - basis is altijd exclusief vakantiegeld/eindejaarsuitkering
      payslip.employer_costs.pension_premium = totalPensionPremium * ((caoConfig.pension_premium_employer || 60) / 100);
      payslip.employer_costs.premium_awf = basisForPremiums * ((caoConfig.premium_awf_employer || 2.64) / 100);
      payslip.employer_costs.premium_ww = basisForPremiums * (((caoConfig.premium_ww_employer_fixed || 0) + (caoConfig.premium_ww_employer_variable || 1.5)) / 100);
      payslip.employer_costs.premium_wia = basisForPremiums * ((caoConfig.premium_wia_employer || 0.72) / 100);
      payslip.employer_costs.premium_wga = basisForPremiums * ((caoConfig.premium_wga_employer || 1.5) / 100);
      payslip.employer_costs.premium_zw = basisForPremiums * ((caoConfig.premium_zw_employer || 0) / 100);
      
      payslip.employer_costs.total = 
        payslip.employer_costs.pension_premium +
        payslip.employer_costs.premium_awf +
        payslip.employer_costs.premium_ww +
        payslip.employer_costs.premium_wia +
        payslip.employer_costs.premium_wga +
        payslip.employer_costs.premium_zw;
      
      // Totale kosten werkgever
      if (isCallWorker) {
        // Voor oproepkrachten: alles al in bruto opgenomen
        payslip.total_cost_employer = payslip.total_gross + payslip.employer_costs.total;
      } else {
        // Voor normale werknemers: bruto + werkgeverslasten + reserveringen + ORT verlof
        payslip.total_cost_employer = 
          payslip.total_gross +
          payslip.employer_costs.total +
          payslip.accruals.vacation_allowance +
          payslip.accruals.year_end_bonus +
          payslip.vacation_paid;
      }
    }

    if (applyQueuedCaoCorrections && caoCorrectionApplication.has_open_corrections) {
      const correctionComponent = buildCaoCorrectionPayrollComponent(openCaoPayrollCorrections, caoCorrectionAdjustments);
      payslip.cao_retroactive_corrections = correctionComponent;
      payslip.total_gross += correctionComponent.total_gross_delta;
      payslip.employee_deductions.total += correctionComponent.employee_deductions_delta;
      payslip.net_salary += correctionComponent.net_salary_delta;
      payslip.employer_costs.total += correctionComponent.employer_costs_delta;
      payslip.accruals.vacation_allowance += correctionComponent.vacation_allowance_delta;
      payslip.accruals.year_end_bonus += correctionComponent.year_end_bonus_delta;
      payslip.total_cost_employer += correctionComponent.total_cost_employer_delta;
    }

    const responsePayload = {
      personnel_id,
      personnel_name: personnel.name,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: scopeWarnings,
      manual_review_required: isUnknownOrMixedScope || !runtimePayrollFinalAllowed,
      payroll_final_allowed: runtimePayrollFinalAllowed,
      wage_basis_type: wageBasisType,
      calculation_status: runtimeCalculationStatus,
      cao_function_classification: functionClassificationResult,
      cao_rule_application: caoRuleApplication,
      contract_resolution_required: contractResolutionRequired,
      contract_resolution_results: contractResolutionResults,
      call_agreement_contract_mix: callAgreementContractMix,
      cao_payroll_corrections: caoCorrectionApplication,
      payroll_runtime_review_items: payrollRuntimeReviewItems,
      employee_type: personnel.employee_type,
      cao_scale: personnel.cao_scale,
      cao_period: personnel.cao_period,
      base_hourly_rate: baseHourlyRate,
      // CAO metadata
      cao_configuration_id: caoConfig.id,
      cao_key: caoConfig.cao_key || targetCaoKey,
      cao_version_label: caoConfig.version_label || caoConfig.name,
      cao_revision: caoConfig.cloudflare_revision || null,
      cao_valid_from: caoConfig.valid_from,
      cao_payroll_readiness: payrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_runtime_support: payrollRuntimeSupport,
      pay_period_year: pay_period_year || refDate.getFullYear(),
      pay_period_number: pay_period_number || null,
      pay_period_start: pay_period_start || work_schedule[0]?.date || null,
      pay_period_end: pay_period_end || work_schedule[work_schedule.length - 1]?.date || null,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: calculationWarnings,
      total_hours: Math.round(totalHours * 100) / 100,
      hours_by_type: hoursByType,
      payslip: {
        // Bruto onderdeel
        base_salary: Math.round(payslip.base_salary * 100) / 100,
        vacation_hours_call_worker: Math.round(payslip.vacation_hours_call_worker * 100) / 100,
        vacation_pay_call_worker_article_59: {
          amount: r2(payslip.vacation_pay_call_worker_article_59.amount),
          percentage: payslip.vacation_pay_call_worker_article_59.percentage,
          payout_base_amount: r2(payslip.vacation_pay_call_worker_article_59.payout_base_amount),
          uncapped_payout_base_amount: r2(payslip.vacation_pay_call_worker_article_59.uncapped_payout_base_amount),
          payout_base_hours: r2(payslip.vacation_pay_call_worker_article_59.payout_base_hours),
          uncapped_paid_base_hours: r2(payslip.vacation_pay_call_worker_article_59.uncapped_paid_base_hours),
          max_hours_per_pay_period: payslip.vacation_pay_call_worker_article_59.max_hours_per_pay_period,
          capped_at_144_hours_per_pay_period: payslip.vacation_pay_call_worker_article_59.capped_at_144_hours_per_pay_period,
          manual_review_required: payslip.vacation_pay_call_worker_article_59.manual_review_required,
          source_rule_ids: payslip.vacation_pay_call_worker_article_59.source_rule_ids
        },
        vacation_paid: Math.round(payslip.vacation_paid * 100) / 100,
        surcharges: {
          evening_10: {
            hours: Math.round(payslip.surcharges.evening_10.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.evening_10.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.evening_10.amount * 100) / 100
          },
          night_20: {
            hours: Math.round(payslip.surcharges.night_20.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.night_20.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.night_20.amount * 100) / 100
          },
          weekend_35: {
            hours: Math.round(payslip.surcharges.weekend_35.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.weekend_35.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.weekend_35.amount * 100) / 100
          },
          holiday_50: {
            hours: Math.round(payslip.surcharges.holiday_50.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.holiday_50.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.holiday_50.amount * 100) / 100
          },
          new_years_eve_100: {
            hours: Math.round(payslip.surcharges.new_years_eve_100.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.new_years_eve_100.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.new_years_eve_100.amount * 100) / 100
          }
        },
        overtime_50: {
          hours: r2(payslip.overtime_50.hours),
          rate: r2(payslip.overtime_50.rate),
          amount: r2(payslip.overtime_50.amount),
          threshold_hours_per_pay_period: payslip.overtime_50.threshold_hours_per_pay_period,
          arbeidstijd_hours_for_overtime: r2(payslip.overtime_50.arbeidstijd_hours_for_overtime),
          applied: payslip.overtime_50.applied,
          source_rule_ids: payslip.overtime_50.source_rule_ids
        },
        minimum_service_compensation: {
          paid_hours: r2(payslip.minimum_service_compensation.paid_hours),
          top_up_hours: r2(payslip.minimum_service_compensation.top_up_hours),
          amount: r2(payslip.minimum_service_compensation.amount),
          min_hours_as_worked_hours: r2(payslip.minimum_service_compensation.min_hours_as_worked_hours),
          min_hours_as_minus_or_empty_hours: r2(payslip.minimum_service_compensation.min_hours_as_minus_or_empty_hours),
          travel_reimbursement_required: payslip.minimum_service_compensation.travel_reimbursement_required,
          source_rule_ids: payslip.minimum_service_compensation.source_rule_ids
        },
        acting_function_allowance: {
          paid_hours: r2(payslip.acting_function_allowance.paid_hours),
          amount: r2(payslip.acting_function_allowance.amount),
          source_rule_ids: payslip.acting_function_allowance.source_rule_ids
        },
        shift_change_allowance: {
          hours: r2(payslip.shift_change_allowance.hours),
          amount: r2(payslip.shift_change_allowance.amount),
          source_rule_ids: payslip.shift_change_allowance.source_rule_ids
        },
        general_reserve_allowance: {
          hours: r2(payslip.general_reserve_allowance.hours),
          amount: r2(payslip.general_reserve_allowance.amount),
          source_rule_ids: payslip.general_reserve_allowance.source_rule_ids
        },
        value_services_early_shift_allowance: {
          shift_count: payslip.value_services_early_shift_allowance.shift_count,
          amount: r2(payslip.value_services_early_shift_allowance.amount),
          rate_per_shift: payslip.value_services_early_shift_allowance.rate_per_shift,
          tax_treatment: payslip.value_services_early_shift_allowance.tax_treatment,
          details: payslip.value_services_early_shift_allowance.details.map(item => ({
            ...item,
            amount: r2(item.amount)
          })),
          source_rule_ids: payslip.value_services_early_shift_allowance.source_rule_ids
        },
        cash_value_late_next_day_notice_allowance: {
          shift_count: payslip.cash_value_late_next_day_notice_allowance.shift_count,
          hours: r2(payslip.cash_value_late_next_day_notice_allowance.hours),
          percentage: payslip.cash_value_late_next_day_notice_allowance.percentage,
          amount: r2(payslip.cash_value_late_next_day_notice_allowance.amount),
          details: payslip.cash_value_late_next_day_notice_allowance.details.map(item => ({
            ...item,
            hours: r2(item.hours),
            amount: r2(item.amount)
          })),
          source_rule_ids: payslip.cash_value_late_next_day_notice_allowance.source_rule_ids
        },
        cao_retroactive_corrections: payslip.cao_retroactive_corrections,
        total_gross: Math.round(payslip.total_gross * 100) / 100,
        is_call_worker: payslip.is_call_worker,
        
        // Werknemersbijdragen
        employee_deductions: {
          premium_sfpb: Math.round(payslip.employee_deductions.premium_sfpb * 100) / 100,
          premium_paww: Math.round(payslip.employee_deductions.premium_paww * 100) / 100,
          pension_premium: Math.round(payslip.employee_deductions.pension_premium * 100) / 100,
          premium_wga: Math.round(payslip.employee_deductions.premium_wga * 100) / 100,
          tax_withheld: Math.round(payslip.employee_deductions.tax_withheld * 100) / 100,
          total: Math.round(payslip.employee_deductions.total * 100) / 100
        },
        
        pension_base: Math.round(payslip.pension_base * 100) / 100,
        
        // Reserveringen
        accruals: {
          vacation_allowance: Math.round(payslip.accruals.vacation_allowance * 100) / 100,
          year_end_bonus: Math.round(payslip.accruals.year_end_bonus * 100) / 100
        },
        vacation_entitlement: payslip.vacation_entitlement,
        year_end_bonus_basis: {
          eligible_base_wage: r2(payslip.year_end_bonus_basis.eligible_base_wage),
          vacation_allowance_on_eligible_base_wage: r2(payslip.year_end_bonus_basis.vacation_allowance_on_eligible_base_wage),
          eligible_amount_including_vacation_allowance: r2(payslip.year_end_bonus_basis.eligible_amount_including_vacation_allowance),
          excluded_overtime_amount: r2(payslip.year_end_bonus_basis.excluded_overtime_amount),
          excluded_special_hours_allowances: r2(payslip.year_end_bonus_basis.excluded_special_hours_allowances),
          excluded_acting_function_allowance: r2(payslip.year_end_bonus_basis.excluded_acting_function_allowance),
          excluded_shift_change_allowance: r2(payslip.year_end_bonus_basis.excluded_shift_change_allowance),
          excluded_general_reserve_allowance: r2(payslip.year_end_bonus_basis.excluded_general_reserve_allowance),
          excluded_value_services_early_shift_allowance: r2(payslip.year_end_bonus_basis.excluded_value_services_early_shift_allowance || 0),
          excluded_cash_value_late_next_day_notice_allowance: r2(payslip.year_end_bonus_basis.excluded_cash_value_late_next_day_notice_allowance || 0),
          source_rule_ids: payslip.year_end_bonus_basis.source_rule_ids
        },
        
        // Werkgeverslasten
        employer_costs: {
          pension_premium: Math.round(payslip.employer_costs.pension_premium * 100) / 100,
          premium_awf: Math.round(payslip.employer_costs.premium_awf * 100) / 100,
          premium_ww: Math.round(payslip.employer_costs.premium_ww * 100) / 100,
          premium_wia: Math.round(payslip.employer_costs.premium_wia * 100) / 100,
          premium_wga: Math.round(payslip.employer_costs.premium_wga * 100) / 100,
          premium_zw: Math.round(payslip.employer_costs.premium_zw * 100) / 100,
          total: Math.round(payslip.employer_costs.total * 100) / 100
        },
        
        // Totalen
        net_salary: Math.round(payslip.net_salary * 100) / 100,
        total_cost_employer: Math.round(payslip.total_cost_employer * 100) / 100,
        avg_cost_per_hour: totalHours > 0 ? Math.round((payslip.total_cost_employer / totalHours) * 100) / 100 : 0
      },
      shift_details: payslip.shift_details
    };

    if (record_payroll_run === true) {
      if (!responsePayload.pay_period_number) {
        return Response.json({
          error: 'pay_period_number is verplicht als record_payroll_run=true.',
          calculation: responsePayload
        }, { status: 400 });
      }
      const run = await base44.asServiceRole.entities.PayrollCalculationRun.create({
        personnel_id,
        route_id: null,
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_payroll_readiness_status: caoConfig.payroll_readiness_status || null,
        cao_rule_registry_fingerprint: caoRuleRegistrySnapshot.fingerprint,
        cao_rule_registry_rule_count: caoRuleRegistrySnapshot.rule_count,
        cao_rule_registry_verified_at: caoRuleRegistrySnapshot.verified_at,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        correction_run_for_review_ids: applyQueuedCaoCorrections
          ? caoCorrectionApplication.review_ids
          : [],
        supersedes_payroll_run_ids: applyQueuedCaoCorrections
          ? caoCorrectionApplication.affected_payroll_run_ids
          : [],
        pay_period_year: responsePayload.pay_period_year,
        pay_period_number: responsePayload.pay_period_number,
        pay_period_start: responsePayload.pay_period_start,
        pay_period_end: responsePayload.pay_period_end,
        payroll_run_status,
        payroll_exported_at: null,
        payroll_paid_at: null,
        requires_cao_recalculation: false,
        cao_recalculation_reason_ids: [],
        calculation_input: {
          personnel_id,
          work_schedule,
          enforce_contract_resolution: contractResolutionRequired,
          contract_id,
          company_id,
          route_id,
          task_id,
          object_id,
          service_context,
          contract_resolution_results: contractResolutionResults,
          apply_queued_cao_corrections: applyQueuedCaoCorrections,
          cao_payroll_correction_ids: caoCorrectionApplication.correction_ids,
          cao_payroll_correction_review_ids: caoCorrectionApplication.review_ids,
          supersedes_payroll_run_ids: caoCorrectionApplication.affected_payroll_run_ids,
          work_schedule_is_full_pay_period,
          paid_absence_hours,
          vacation_hours,
          extraordinary_leave_hours,
          sickness_hours,
          minus_hours,
          empty_run_hours,
          other_paid_work_time_hours,
          pay_period_year: responsePayload.pay_period_year,
          pay_period_number: responsePayload.pay_period_number,
          pay_period_start: responsePayload.pay_period_start,
          pay_period_end: responsePayload.pay_period_end,
          cao_configuration_id: caoConfig.id,
          cao_key: caoConfig.cao_key || targetCaoKey,
          cao_revision: caoConfig.cloudflare_revision || null,
          cao_rule_registry_fingerprint: caoRuleRegistrySnapshot.fingerprint,
          cao_rule_registry_verified_at: caoRuleRegistrySnapshot.verified_at
        },
        calculation_output: responsePayload,
        warnings: calculationWarnings.map(message => ({ message })),
        created_at: new Date().toISOString(),
        created_by_function: 'calculatePersonnelCosts'
      });
      responsePayload.payroll_calculation_run_id = run.id;
      if (applyQueuedCaoCorrections && caoCorrectionApplication.has_open_corrections) {
        const appliedCorrectionIds = await markCaoCorrectionsApplied(base44, {
          corrections: openCaoPayrollCorrections,
          adjustments: caoCorrectionAdjustments,
          payrollRun: run,
          responsePayload
        });
        responsePayload.applied_cao_payroll_correction_ids = appliedCorrectionIds;
        responsePayload.cao_payroll_corrections = {
          ...responsePayload.cao_payroll_corrections,
          applied_correction_ids: appliedCorrectionIds
        };
      }
      await base44.asServiceRole.entities.PayrollCalculationRun.update(run.id, {
        calculation_output: responsePayload
      });
    }

    return Response.json(responsePayload);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

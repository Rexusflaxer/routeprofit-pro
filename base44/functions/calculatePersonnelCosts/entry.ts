import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
// Slaat sync over ALLEEN als cloudflare_revision al overeenkomt. Geen tijdgebaseerde skip.
const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EVENT_HOSPITALITY_SECURITY_KEY = 'cao_evenementen_horecabeveiliging';
const SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_PAYROLL_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : !key
      ? `Runtime ${functionName} mist cao_key. Payroll-final is geblokkeerd zodat geen PB-default wordt toegepast.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Payroll-final is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
  };
}

function booleanTrue(value) {
  return value === true || value === 'true' || value === 'yes' || value === 'ja';
}

function normalizeCaoSignalText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '_')
    .trim();
}

function eventHospitalityCaoSignal(source, context = {}) {
  const caoText = normalizeCaoSignalText(context.cao || context.cao_key || context.default_cao_key || '');
  const worksEvent = context.works_event_or_hospitality_security ??
    context.default_works_event_or_hospitality_security ??
    null;
  const eventCaoApplies = context.event_hospitality_cao_applies ??
    context.default_event_hospitality_cao_applies ??
    null;

  if (caoText.includes('evenement') || caoText.includes('horeca')) {
    return {
      source,
      cao_key: CAO_EVENT_HOSPITALITY_SECURITY_KEY,
      status: 'inferred_external_cao',
      reason: 'cao_text_event_hospitality'
    };
  }
  if (booleanTrue(worksEvent) && booleanTrue(eventCaoApplies)) {
    return {
      source,
      cao_key: CAO_EVENT_HOSPITALITY_SECURITY_KEY,
      status: 'inferred_external_cao',
      reason: 'event_hospitality_scope_confirmed'
    };
  }
  if (booleanTrue(worksEvent) && eventCaoApplies !== false) {
    return {
      source,
      cao_key: null,
      status: 'ambiguous_external_cao_scope',
      suggested_cao_keys: [CAO_EVENT_HOSPITALITY_SECURITY_KEY],
      reason: 'event_hospitality_scope_requires_confirmation',
      message: 'Dienst lijkt evenementen-/horecabeveiliging, maar event_hospitality_cao_applies is niet expliciet bevestigd.'
    };
  }
  return null;
}

function addExternalCaoSignal(signals, signal) {
  if (!signal) return;
  const key = `${signal.source}:${signal.status}:${signal.cao_key || ''}:${signal.reason || ''}`;
  if (!signals.some(existing => `${existing.source}:${existing.status}:${existing.cao_key || ''}:${existing.reason || ''}` === key)) {
    signals.push(signal);
  }
}

function collectInlineExternalCaoSignals(workSchedule = [], body = {}) {
  const signals = [];
  addExternalCaoSignal(signals, eventHospitalityCaoSignal('body', body));
  addExternalCaoSignal(signals, eventHospitalityCaoSignal('body.service_context', body.service_context || {}));
  for (const [index, shift] of (workSchedule || []).entries()) {
    addExternalCaoSignal(signals, eventHospitalityCaoSignal(`shift[${index}]`, shift || {}));
    addExternalCaoSignal(signals, eventHospitalityCaoSignal(`shift[${index}].service_context`, shift?.service_context || {}));
  }
  return signals;
}

function buildExternalCaoScopeGate({ targetCaoKey, signals }) {
  const activeSignals = signals || [];
  const inferredKeys = [...new Set(activeSignals.map(signal => signal.cao_key).filter(Boolean))];
  const ambiguousSignals = activeSignals.filter(signal => signal.status === 'ambiguous_external_cao_scope');
  const suggestedKeys = [...new Set(activeSignals.flatMap(signal => signal.suggested_cao_keys || []).filter(Boolean))];

  if (ambiguousSignals.length > 0) {
    return {
      passed: false,
      status: 'blocked_ambiguous_external_cao_scope',
      message: 'Loonrun geblokkeerd: een of meer diensten lijken onder een andere CAO te vallen, maar de cao_key is niet expliciet bevestigd.',
      signals: activeSignals,
      inferred_cao_keys: inferredKeys,
      suggested_cao_keys: suggestedKeys
    };
  }

  if (inferredKeys.length > 1) {
    return {
      passed: false,
      status: 'blocked_mixed_external_cao_scope',
      message: 'Loonrun geblokkeerd: diensten wijzen naar meerdere externe CAO-scope signalen. Splits de loonrun per CAO.',
      signals: activeSignals,
      inferred_cao_keys: inferredKeys
    };
  }

  if (inferredKeys.length === 1 && targetCaoKey && inferredKeys[0] !== targetCaoKey) {
    return {
      passed: false,
      status: 'blocked_cao_scope_signal_mismatch',
      message: `Loonrun geblokkeerd: dienstcontext wijst naar ${inferredKeys[0]}, maar payroll zou ${targetCaoKey} gebruiken.`,
      signals: activeSignals,
      inferred_cao_keys: inferredKeys
    };
  }

  return {
    passed: true,
    status: 'ok',
    signals: activeSignals,
    inferred_cao_key: inferredKeys[0] || null,
    suggested_cao_keys: suggestedKeys
  };
}

async function lazySyncCao(base44, forceCaoSync = false, caoKey = null) {
  if (!caoKey) {
    return {
      changed: false,
      reason: 'skipped_missing_cao_key',
      cao_key: null,
      note: 'Lazy Cloudflare sync overgeslagen: cao_key ontbreekt.'
    };
  }
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

function booleanOrNull(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'ja' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'no' || value === 'nee' || value === 0 || value === '0') return false;
  return null;
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

function resolvePayrollCaoParameters(caoConfig) {
  const leaveRules = caoConfig?.leave_rules || {};
  const allowances = caoConfig?.allowances || {};
  const cashValueRules = caoConfig?.cash_value_logistics_rules || {};
  const pensionRules = caoConfig?.pension_rules || {};
  const fundRules = caoConfig?.fund_rules || {};
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
  const valueServices = firstObject(
    cashValueRules.value_services_early_shift_allowance,
    cashValueRules.early_shift_allowance,
    allowances.value_services_early_shift,
    allowances.cash_value_early_shift,
    allowances.article_103
  );
  const pensionScheme = firstObject(
    pensionRules.scheme,
    pensionRules.pension_scheme,
    pensionRules.article_71,
    pensionRules.pension
  );
  const eightyNinetyHundredRules = firstObject(
    pensionRules.eighty_ninety_hundred,
    pensionRules.article_72,
    pensionRules.older_worker_80_90_100,
    caoConfig?.older_worker_rules?.eighty_ninety_hundred
  );
  const sfpbRules = firstObject(fundRules.sfpb, fundRules.security_fund, pensionRules.sfpb);
  const pawwRules = firstObject(fundRules.paww, pensionRules.paww);

  const standardAnnualHours = firstNumber(standardVacation.fulltime_annual_hours, standardVacation.annual_hours, leaveRules.fulltime_annual_vacation_hours);
  const standardAnnualDays = firstNumber(standardVacation.fulltime_annual_days, standardVacation.annual_days, leaveRules.fulltime_annual_vacation_days);
  const standardPerPeriodHours = firstNumber(standardVacation.fulltime_per_period_hours, standardVacation.per_pay_period_hours, leaveRules.fulltime_vacation_hours_per_pay_period);
  const standardFulltimePeriodHours = firstNumber(standardVacation.fulltime_period_hours, standardVacation.fulltime_hours_per_pay_period, leaveRules.fulltime_hours_per_pay_period);
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
  const cashValueVacationDayHours = firstNumber(cashValueVacation.vacation_day_hours, standardVacationDayHours);
  const earlyShiftAmount = firstNumber(valueServices.amount, valueServices.rate_per_shift, valueServices.value_services_early_shift);
  const pensionFranchiseAnnual = firstNumber(
    pensionScheme.franchise_annual,
    pensionScheme.annual_franchise,
    pensionScheme.pension_base_salary_threshold,
    pensionRules.pension_base_salary_threshold,
    caoConfig?.pension_base_salary_threshold
  );
  const pensionPremiumTotal = firstNumber(
    pensionScheme.premium_rate_total,
    pensionScheme.total_premium_percentage,
    pensionRules.premium_rate_total,
    caoConfig?.pension_premium_rate_total
  );
  const pensionEmployerShare = firstNumber(
    pensionScheme.employer_share_percentage,
    pensionScheme.employer_percentage,
    pensionRules.employer_share_percentage,
    caoConfig?.pension_premium_employer
  );
  const pensionEmployeeShare = firstNumber(
    pensionScheme.employee_share_percentage,
    pensionScheme.employee_percentage,
    pensionRules.employee_share_percentage,
    caoConfig?.pension_premium_employee
  );
  const payPeriodsPerYear = firstNumber(pensionScheme.pay_periods_per_year, pensionRules.pay_periods_per_year, caoConfig?.pay_periods_per_year);
  const sfpbEmployeePercentage = firstNumber(sfpbRules.employee_percentage, sfpbRules.premium_employee_percentage, fundRules.premium_sfpb, caoConfig?.premium_sfpb);
  const pawwEmployeePercentage = firstNumber(pawwRules.employee_percentage, pawwRules.premium_employee_percentage, fundRules.premium_paww_employee, caoConfig?.premium_paww_employee);
  const wgaEmployeePercentage = firstNumber(fundRules.wga_employee_percentage, fundRules.premium_wga_employee, caoConfig?.premium_wga_employee);

  return {
    standard_vacation: {
      profile: 'standard_article_59',
      fulltimeAnnualHours: standardAnnualHours ?? 172.8,
      fulltimeAnnualDays: standardAnnualDays ?? 24,
      fulltimeVacationHoursPerPeriod: standardPerPeriodHours ?? 13.3,
      fulltimePeriodHours: standardFulltimePeriodHours ?? 144,
      vacationDayHours: standardVacationDayHours ?? 7.2,
      source_rule_ids: standardVacation.source_rule_ids || ['CAO-PB-2024-R0999'],
      extra_vacation_days_policy: standardVacation.extra_vacation_days_policy || 'article_59_lid_4'
    },
    cash_value_vacation: {
      profile: 'cash_value_logistics',
      fulltimeAnnualHours: cashValueAnnualHours ?? 180,
      fulltimeAnnualDays: cashValueAnnualDays ?? 25,
      fulltimeVacationHoursPerPeriod: cashValuePerPeriodHours ?? 13.85,
      fulltimePeriodHours: cashValueFulltimePeriodHours ?? 144,
      vacationDayHours: cashValueVacationDayHours ?? 7.2,
      source_rule_ids: cashValueVacation.source_rule_ids || ['CAO-PB-2024-R1601', 'CAO-PB-2024-R1602'],
      extra_vacation_days_policy: cashValueVacation.extra_vacation_days_policy || 'manual_review_article_100_deviates_from_article_59'
    },
    call_worker_vacation_payout_percentage: callWorkerPayoutPercentage ?? 9.24,
    call_worker_vacation_max_hours_per_period: callWorkerMaxHoursPerPeriod ?? 144,
    value_services_early_shift_amount: earlyShiftAmount ?? 7.50,
    value_services_early_shift_source_rule_ids: valueServices.source_rule_ids || ['CAO-PB-2024-R1609'],
    pension: {
      profile: 'article_71_pension',
      franchiseAnnual: pensionFranchiseAnnual ?? 16164,
      premiumRateTotalPercentage: pensionPremiumTotal ?? 24.1,
      employerSharePercentage: pensionEmployerShare ?? 60,
      employeeSharePercentage: pensionEmployeeShare ?? 40,
      payPeriodsPerYear: payPeriodsPerYear ?? 13,
      fulltimeHoursPerPayPeriod: standardFulltimePeriodHours ?? 144,
      source_rule_ids: pensionScheme.source_rule_ids || ['CAO-PB-2024-R1210', 'CAO-PB-2024-R1211']
    },
    funds: {
      profile: 'article_71_related_funds',
      sfpbEmployeePercentage: sfpbEmployeePercentage ?? 0.061,
      pawwEmployeePercentage: pawwEmployeePercentage ?? 0.1,
      wgaEmployeePercentage: wgaEmployeePercentage ?? 0.81,
      source_rule_ids: [
        ...(sfpbRules.source_rule_ids || []),
        ...(pawwRules.source_rule_ids || [])
      ]
    },
    eighty_ninety_hundred: {
      profile: 'article_72_80_90_100',
      minimumIndustryServiceYears: firstNumber(eightyNinetyHundredRules.minimum_industry_service_years, eightyNinetyHundredRules.minimum_service_years) ?? 5,
      applicationNoticeMonths: firstNumber(eightyNinetyHundredRules.application_notice_months, eightyNinetyHundredRules.notice_months) ?? 3,
      hoursPercentage: firstNumber(eightyNinetyHundredRules.hours_percentage, eightyNinetyHundredRules.work_percentage) ?? 80,
      salaryPercentage: firstNumber(eightyNinetyHundredRules.salary_percentage, eightyNinetyHundredRules.pay_percentage) ?? 90,
      pensionPercentage: firstNumber(eightyNinetyHundredRules.pension_percentage, eightyNinetyHundredRules.pension_build_up_percentage) ?? 100,
      minimumParttimePercentageAfterStart: firstNumber(eightyNinetyHundredRules.minimum_parttime_percentage_after_start, eightyNinetyHundredRules.minimum_parttime_percentage) ?? 55,
      source_rule_ids: eightyNinetyHundredRules.source_rule_ids || [
        'CAO-PB-2024-R1214', 'CAO-PB-2024-R1215', 'CAO-PB-2024-R1217', 'CAO-PB-2024-R1218',
        'CAO-PB-2024-R1221', 'CAO-PB-2024-R1222', 'CAO-PB-2024-R1223', 'CAO-PB-2024-R1224',
        'CAO-PB-2024-R1225', 'CAO-PB-2024-R1226', 'CAO-PB-2024-R1227', 'CAO-PB-2024-R1229',
        'CAO-PB-2024-R1230', 'CAO-PB-2024-R1231', 'CAO-PB-2024-R1232', 'CAO-PB-2024-R1233',
        'CAO-PB-2024-R1234', 'CAO-PB-2024-R1235', 'CAO-PB-2024-R1237'
      ]
    },
    provenance: {
      standard_vacation_annual_hours: parameterSource('leave_rules.standard_vacation.fulltime_annual_hours', standardAnnualHours, 172.8, ['CAO-PB-2024-R0999']),
      standard_vacation_per_period_hours: parameterSource('leave_rules.standard_vacation.fulltime_per_period_hours', standardPerPeriodHours, 13.3, ['CAO-PB-2024-R0999']),
      call_worker_vacation_payout_percentage: parameterSource('leave_rules.call_worker_vacation.payout_percentage', callWorkerPayoutPercentage, 9.24, ['CAO-PB-2024-R1016']),
      call_worker_vacation_max_hours_per_period: parameterSource('leave_rules.call_worker_vacation.max_hours_per_period', callWorkerMaxHoursPerPeriod, 144, ['CAO-PB-2024-R1016']),
      value_services_early_shift_amount: parameterSource('cash_value_logistics_rules.value_services_early_shift_allowance.amount', earlyShiftAmount, 7.50, ['CAO-PB-2024-R1609']),
      pension_franchise_annual: parameterSource('pension_rules.scheme.franchise_annual', pensionFranchiseAnnual, 16164, ['CAO-PB-2024-R1210']),
      pension_premium_rate_total: parameterSource('pension_rules.scheme.premium_rate_total', pensionPremiumTotal, 24.1, ['CAO-PB-2024-R1210']),
      pension_employer_share_percentage: parameterSource('pension_rules.scheme.employer_share_percentage', pensionEmployerShare, 60, ['CAO-PB-2024-R1210']),
      pension_employee_share_percentage: parameterSource('pension_rules.scheme.employee_share_percentage', pensionEmployeeShare, 40, ['CAO-PB-2024-R1210']),
      premium_sfpb_employee_percentage: parameterSource('fund_rules.sfpb.employee_percentage', sfpbEmployeePercentage, 0.061, ['CAO-PB-2024-R1211']),
      premium_paww_employee_percentage: parameterSource('fund_rules.paww.employee_percentage', pawwEmployeePercentage, 0.1, ['CAO-PB-2024-R1211'])
    }
  };
}

function calculateCallWorkerVacationPayoutArticle59({
  baseWageAmount,
  minimumServiceAmount,
  baseHourlyRate,
  paidBaseHours,
  vacationPayoutPercentage = 9.24,
  maxHoursPerPayPeriod = 144,
  parameterProvenance = null
}) {
  const percentage = vacationPayoutPercentage;
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
    capped_at_max_hours_per_pay_period: capped,
    capped_at_144_hours_per_pay_period: paidHours > 144,
    parameter_provenance: parameterProvenance,
    manual_review_required: manualReviewRequired,
    source_rule_ids: ['CAO-PB-2024-R1014', 'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017']
  };
}

function caoRuleId(number) {
  return `CAO-PB-2024-R${String(number).padStart(4, '0')}`;
}

function caoRuleIds(...numbers) {
  return numbers.map(caoRuleId);
}

function caoRuleRange(start, end) {
  const ids = [];
  for (let number = start; number <= end; number += 1) ids.push(caoRuleId(number));
  return ids;
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

function uniqueSelectedContractsFromResolutionResults(contractResolutionResults) {
  const unique = new Map();
  selectedContractsFromResolutionResults(contractResolutionResults).forEach((contract, index) => {
    unique.set(getContractIdentity(contract, index), contract);
  });
  return [...unique.values()];
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

function buildSingleContractClassificationContext(contractResolutionResults) {
  const contracts = uniqueSelectedContractsFromResolutionResults(contractResolutionResults);
  const warnings = [];
  if (contracts.length === 0) {
    return {
      contract: null,
      work_context: {},
      warnings,
      blocking_reason: null
    };
  }
  if (contracts.length > 1) {
    return {
      contract: null,
      work_context: {},
      warnings,
      blocking_reason: 'Deze loonrun bevat meerdere geselecteerde contracten. De loonbasis moet per contract worden gesplitst voordat payroll definitief mag zijn.'
    };
  }

  const contexts = (contractResolutionResults || [])
    .map(item => item?.contract_resolution?.service_context)
    .filter(context => context && typeof context === 'object');
  const contextFields = [
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
    'cao_key',
    'cao'
  ];
  const workContext = {};
  const conflicts = [];

  for (const field of contextFields) {
    const values = [...new Set(contexts
      .map(context => context[field])
      .filter(value => value !== null && value !== undefined && value !== '')
      .map(value => String(value)))];
    if (values.length === 1) {
      workContext[field] = values[0];
    } else if (values.length > 1) {
      conflicts.push({ field, values });
    }
  }

  if (conflicts.length > 0) {
    return {
      contract: contracts[0],
      work_context: workContext,
      warnings,
      blocking_reason: `Deze loonrun bevat conflicterende dienstcontext voor loonbasisvelden: ${conflicts.map(item => item.field).join(', ')}. Splits de loonrun of bereken per dienst/contract.`
    };
  }

  warnings.push('Loonbasis/functieclassificatie gebruikt contractscope uit de contractresolver.');
  return {
    contract: contracts[0],
    work_context: workContext,
    warnings,
    blocking_reason: null
  };
}

function pickFirstNonEmpty(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '') ?? null;
}

function pickPolicyValue(fields, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      if (source[field] !== null && source[field] !== undefined && source[field] !== '') return source[field];
    }
  }
  return null;
}

function normalizePolicyText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '_')
    .trim();
}

function payrollPeriodRef(year, number) {
  const periodYear = numberOrNull(year);
  const periodNumber = numberOrNull(number);
  if (periodYear === null || periodNumber === null) return null;
  return {
    year: periodYear,
    number: periodNumber
  };
}

function nextPayrollPeriodRef(period) {
  if (!period) return null;
  return period.number >= 13
    ? { year: period.year + 1, number: 1 }
    : { year: period.year, number: period.number + 1 };
}

function comparePayrollPeriodRef(left, right) {
  if (!left || !right) return null;
  if (left.year !== right.year) return left.year - right.year;
  return left.number - right.number;
}

function formatPayrollPeriodRef(period) {
  return period ? `${period.year}-P${String(period.number).padStart(2, '0')}` : null;
}

function defaultArticle37WageIncreaseSchedule(configured) {
  const schedule = Array.isArray(configured?.schedule)
    ? configured.schedule
    : Array.isArray(configured)
    ? configured
    : [];
  if (schedule.length > 0) return schedule;
  return [
    {
      effective_year: 2025,
      effective_pay_period_number: 1,
      percentage: 4.5,
      method: 'fixed_percentage',
      source_rule_ids: caoRuleIds(760, 761)
    },
    {
      effective_year: 2026,
      effective_pay_period_number: 1,
      method: 'cpi_formula',
      base_percentage: 0.5,
      cpi_minimum_percentage: 2,
      cpi_maximum_percentage: 4.5,
      total_minimum_percentage: 2.5,
      total_maximum_percentage: 5,
      cpi_reference_period: '1_october_through_30_september_previous_year',
      source_rule_ids: caoRuleIds(762, 764, 765, 766, 767)
    }
  ];
}

function selectApplicableWageIncrease(schedule, currentPeriod) {
  if (!currentPeriod) return null;
  return schedule
    .map(item => ({
      ...item,
      effective_period: payrollPeriodRef(
        item.effective_year ?? item.year,
        item.effective_pay_period_number ?? item.pay_period_number ?? item.period
      )
    }))
    .filter(item => item.effective_period && comparePayrollPeriodRef(item.effective_period, currentPeriod) <= 0)
    .sort((a, b) => comparePayrollPeriodRef(b.effective_period, a.effective_period))[0] || null;
}

function resolveArticle37WageIncrease({ body, selectedContract, personnel, caoConfig, payrollPeriod, baseHourlyRate }) {
  const currentPeriod = payrollPeriodRef(
    body.pay_period_year ?? payrollPeriod?.period_start?.slice(0, 4),
    body.pay_period_number
  );
  const configured = caoConfig?.wage_increase_rules || caoConfig?.wage_increases || {};
  const schedule = defaultArticle37WageIncreaseSchedule(configured);
  const selected = selectApplicableWageIncrease(schedule, currentPeriod);
  const sourceRuleIds = caoRuleIds(760, 761, 762, 764, 765, 766, 767);
  const result = {
    applies: !!selected,
    current_pay_period: formatPayrollPeriodRef(currentPeriod),
    selected_effective_pay_period: formatPayrollPeriodRef(selected?.effective_period || null),
    method: selected?.method || null,
    active_resolved_hourly_rate: numberOrNull(baseHourlyRate),
    mutates_base_hourly_rate: false,
    wage_table_must_already_include_approved_article_37_changes: true,
    applicable_increase_percentage: null,
    current_wage_before_increase: firstNumber(
      body.current_wage_before_article_37_increase,
      body.wage_before_article_37_increase,
      selectedContract.current_wage_before_article_37_increase,
      personnel.current_wage_before_article_37_increase
    ),
    cpi_reference_period: selected?.cpi_reference_period || null,
    concept_wage_after_increase: null,
    cpi_year_mutation_percentage: null,
    manual_review_required: false,
    manual_review_items: [],
    source_rule_ids: sourceRuleIds
  };

  if (!currentPeriod) {
    result.manual_review_required = true;
    result.manual_review_items.push({
      rule_id: 'CAO-PB-2024-R0760',
      domain: 'article_37_wage_increase',
      field: 'pay_period_year/pay_period_number',
      message: 'Loonperiode ontbreekt; CAO-loonsverhoging per loonperiode kan niet definitief worden vastgesteld.'
    });
    return result;
  }
  if (!selected) return result;

  if (selected.method === 'cpi_formula') {
    const cpi = firstNumber(
      body.cpi_year_mutation_percentage,
      body.article_37_cpi_year_mutation_percentage,
      caoConfig?.cpi_year_mutation_percentage,
      configured.cpi_year_mutation_percentage,
      selected.cpi_year_mutation_percentage
    );
    result.cpi_year_mutation_percentage = cpi;
    if (cpi === null) {
      result.manual_review_required = true;
      result.manual_review_items.push({
        rule_id: 'CAO-PB-2024-R0764',
        domain: 'article_37_wage_increase',
        field: 'cpi_year_mutation_percentage',
        message: 'CAO-loonsverhoging 2026 gebruikt CPI-formule; CPI jaarmutatie ontbreekt in request/CAOConfiguration.'
      });
    } else {
      const cappedCpi = Math.max(
        Number(selected.cpi_minimum_percentage ?? 2),
        Math.min(Number(selected.cpi_maximum_percentage ?? 4.5), cpi)
      );
      const total = Number(selected.base_percentage ?? 0.5) + cappedCpi;
      result.applicable_increase_percentage = Math.max(
        Number(selected.total_minimum_percentage ?? 2.5),
        Math.min(Number(selected.total_maximum_percentage ?? 5), total)
      );
    }
  } else {
    result.applicable_increase_percentage = Number(selected.percentage ?? selected.increase_percentage ?? 0);
  }

  if (result.applicable_increase_percentage !== null && result.current_wage_before_increase !== null) {
    result.concept_wage_after_increase = r2(result.current_wage_before_increase * (1 + result.applicable_increase_percentage / 100));
  }
  return result;
}

function resolveArticle36PromotionPolicy({ body, selectedContract, personnel, classification, payrollPeriod }) {
  const sourceRuleIds = caoRuleIds(748, 749, 750, 751, 752, 753, 755, 757);
  const promotionSignal = pickPolicyValue(
    ['promotion_type', 'promotion_event', 'cao_promotion_type', 'article_36_promotion_type'],
    body,
    selectedContract,
    personnel,
    classification
  );
  const promoted = booleanOrNull(pickPolicyValue(
    ['promoted', 'cao_promoted', 'article_36_promotion_applies'],
    body,
    selectedContract,
    personnel
  )) === true;
  const temporaryHigherFunction = booleanOrNull(pickPolicyValue(
    ['temporary_higher_function', 'temporary_appointment_higher_function', 'temporary_function_assignment'],
    body,
    selectedContract,
    personnel
  )) === true;
  const promotionActive = promoted || !!promotionSignal || temporaryHigherFunction;
  const manualReviewItems = [];
  const currentPeriodics = firstNumber(
    body.current_periodics_built_up,
    body.current_cao_period,
    selectedContract.current_periodics_built_up,
    selectedContract.cao_period,
    personnel.cao_period,
    classification?.period
  );
  const newPeriodics = firstNumber(
    body.new_cao_period,
    body.promoted_cao_period,
    selectedContract.new_cao_period,
    selectedContract.promoted_cao_period,
    personnel.promoted_cao_period
  );
  const promotionPayPeriod = payrollPeriodRef(
    pickPolicyValue(['promotion_pay_period_year', 'article_36_promotion_pay_period_year'], body, selectedContract),
    pickPolicyValue(['promotion_pay_period_number', 'article_36_promotion_pay_period_number'], body, selectedContract)
  );
  const diplomaProvidedPeriod = payrollPeriodRef(
    pickPolicyValue(['diploma_provided_pay_period_year', 'diploma_submitted_pay_period_year'], body, selectedContract),
    pickPolicyValue(['diploma_provided_pay_period_number', 'diploma_submitted_pay_period_number'], body, selectedContract)
  );
  const promotionType = normalizePolicyText(promotionSignal);
  const diplomaRequired = promotionType.includes('diploma') ||
    booleanOrNull(pickPolicyValue(['promotion_requires_diploma', 'diploma_required_for_promotion'], body, selectedContract, personnel)) === true;
  const effectivePeriod = diplomaRequired
    ? nextPayrollPeriodRef(diplomaProvidedPeriod)
    : promotionPayPeriod;

  if (promotionActive && currentPeriodics !== null && newPeriodics !== null && newPeriodics < currentPeriodics) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0752',
      domain: 'article_36_promotion',
      field: 'new_cao_period/current_periodics_built_up',
      message: 'Bij bevordering mogen opgebouwde periodieken niet lager worden vastgesteld dan al opgebouwd.'
    });
  }
  if (promotionActive && !effectivePeriod) {
    manualReviewItems.push({
      rule_id: diplomaRequired ? 'CAO-PB-2024-R0750' : 'CAO-PB-2024-R0749',
      domain: 'article_36_promotion',
      field: diplomaRequired ? 'diploma_provided_pay_period_number' : 'promotion_pay_period_number',
      message: diplomaRequired
        ? 'Diploma-afhankelijke bevordering mist de loonperiode waarin het diploma aan werkgever is verstrekt.'
        : 'Bevordering mist de loonperiode waarin de hogere functie is ingegaan.'
    });
  }

  const temporaryMonths = firstNumber(
    body.temporary_higher_function_months,
    body.temporary_appointment_months,
    selectedContract.temporary_higher_function_months,
    personnel.temporary_higher_function_months
  );
  if (temporaryHigherFunction && temporaryMonths !== null && temporaryMonths > 6) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0755',
      domain: 'article_36_promotion',
      field: 'temporary_higher_function_months',
      message: 'Tijdelijke hogere functie duurt langer dan 6 maanden; beoordeel bevordering/terugplaatsing in plaats van alleen art. 39 waarneming.'
    });
  }

  return {
    applies: promotionActive,
    promotion_type: promotionSignal || null,
    diploma_required_for_promotion: diplomaRequired,
    promotion_effective_pay_period: formatPayrollPeriodRef(effectivePeriod),
    periodic_increase_same_time_allowed: true,
    current_periodics_built_up: currentPeriodics,
    new_periodics_after_promotion: newPeriodics,
    built_periodics_preserved: currentPeriodics === null || newPeriodics === null ? null : newPeriodics >= currentPeriodics,
    temporary_higher_function: temporaryHigherFunction,
    temporary_higher_function_months: temporaryMonths,
    temporary_higher_function_pay_policy: temporaryHigherFunction ? 'article_39_acting_function_allowance_until_max_6_month_review' : null,
    manual_review_required: manualReviewItems.length > 0,
    manual_review_items: manualReviewItems,
    source_rule_ids: sourceRuleIds
  };
}

function resolveArticle40And41SurchargeMatrix({ caoConfig, isCallWorker, applySpecialHours, applyHolidays }) {
  return {
    apply_article_40_special_hours: applySpecialHours,
    apply_article_41_holidays: applyHolidays,
    special_hours: {
      evening_18_00_24_00_monday_friday_percentage: Number(caoConfig?.surcharge_evening ?? 10),
      night_00_00_07_00_monday_friday_percentage: Number(caoConfig?.surcharge_night ?? 20),
      weekend_saturday_sunday_percentage: Number(caoConfig?.surcharge_weekend ?? 35),
      new_years_eve_after_16_00_percentage: Number(caoConfig?.surcharge_new_years_eve_after_16 ?? 100)
    },
    holidays: {
      standard_employee_percentage: Number(caoConfig?.surcharge_holiday ?? 50),
      call_worker_percentage: Number(caoConfig?.surcharge_holiday_call_worker ?? 100),
      applied_holiday_percentage: isCallWorker ? Number(caoConfig?.surcharge_holiday_call_worker ?? 100) : Number(caoConfig?.surcharge_holiday ?? 50),
      article_40_stacks_with_article_41_for_this_employee: !isCallWorker
    },
    is_call_worker: isCallWorker,
    source_rule_ids: [...caoRuleRange(785, 790), ...caoRuleRange(792, 795)]
  };
}

function resolveArticle46PhaseOutPolicy({ body, selectedContract, personnel, caoConfig }) {
  const phaseOutConfig = caoConfig?.phase_out_rules || caoConfig?.income_structure_phase_out_rules || {};
  const sourceRuleIds = caoRuleRange(820, 836);
  const oldIncome = firstNumber(
    body.old_fixed_income_per_period,
    body.previous_fixed_income_per_period,
    body.old_structural_income_per_period,
    selectedContract.old_fixed_income_per_period,
    personnel.old_fixed_income_per_period
  );
  const newIncome = firstNumber(
    body.new_fixed_income_per_period,
    body.current_fixed_income_per_period,
    body.new_structural_income_per_period,
    selectedContract.new_fixed_income_per_period,
    personnel.new_fixed_income_per_period
  );
  const oldStructurePeriods = firstNumber(
    body.fixed_income_structure_periods_before_change,
    body.old_fixed_income_structure_periods,
    selectedContract.fixed_income_structure_periods_before_change,
    personnel.fixed_income_structure_periods_before_change
  );
  const explicitYears = firstNumber(
    body.fixed_income_structure_years_before_change,
    selectedContract.fixed_income_structure_years_before_change,
    personnel.fixed_income_structure_years_before_change
  );
  const structureYears = explicitYears !== null
    ? explicitYears
    : oldStructurePeriods !== null
    ? oldStructurePeriods / 13
    : null;
  const reason = normalizePolicyText(pickPolicyValue(
    ['income_structure_change_reason', 'fixed_income_change_reason', 'phase_out_reason'],
    body,
    selectedContract,
    personnel
  ));
  const outsideEmployeeFault = booleanOrNull(pickPolicyValue(
    ['income_structure_change_outside_employee_fault', 'outside_employee_fault', 'not_employee_fault'],
    body,
    selectedContract,
    personnel
  ));
  const fixedIncomeChanged = booleanOrNull(pickPolicyValue(
    ['fixed_income_structure_changed', 'income_structure_changed'],
    body,
    selectedContract,
    personnel
  ));
  const changeReasonCovered = fixedIncomeChanged === true ||
    ['function', 'functie', 'roster', 'schedule', 'rooster', 'times', 'tijdstippen', 'working_times'].some(value => reason.includes(value));
  const changeSignal = oldIncome !== null ||
    newIncome !== null ||
    outsideEmployeeFault !== null ||
    fixedIncomeChanged !== null ||
    !!reason;
  const manualReviewItems = [];
  const thresholdAmount = firstNumber(
    phaseOutConfig.threshold_amount,
    phaseOutConfig.minimum_loss_threshold_amount,
    caoConfig?.phase_out_threshold_amount
  ) ?? 22.69;

  if (changeSignal && outsideEmployeeFault !== true) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0820',
      domain: 'article_46_phase_out',
      field: 'income_structure_change_outside_employee_fault',
      message: 'Afbouwregeling geldt alleen als de structurele inkomensdaling buiten schuld van werknemer ligt; bevestiging ontbreekt.'
    });
  }
  if (changeSignal && !changeReasonCovered) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0821',
      domain: 'article_46_phase_out',
      field: 'income_structure_change_reason',
      message: 'Afbouwregeling vereist wijziging van functie, rooster of tijdstippen; reden ontbreekt of valt buiten de automatische matrix.'
    });
  }
  if (changeSignal && (oldIncome === null || newIncome === null)) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0823',
      domain: 'article_46_phase_out',
      field: 'old_fixed_income_per_period/new_fixed_income_per_period',
      message: 'Oude en nieuwe vaste inkomenscomponenten per loonperiode ontbreken; afbouwbedrag kan niet worden berekend.'
    });
  }
  if (changeSignal && structureYears === null) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0826',
      domain: 'article_46_phase_out',
      field: 'fixed_income_structure_periods_before_change',
      message: 'Duur van oude vaste inkomensstructuur ontbreekt; afbouwduur 6/9/12 loonperioden kan niet worden bepaald.'
    });
  }

  const incomeLoss = oldIncome !== null && newIncome !== null ? Math.max(0, oldIncome - newIncome) : null;
  const eligibleLoss = incomeLoss !== null ? Math.max(0, incomeLoss - thresholdAmount) : null;
  const enoughHistory = structureYears !== null ? structureYears >= 1 : null;
  const applies = outsideEmployeeFault === true &&
    changeReasonCovered &&
    incomeLoss !== null &&
    incomeLoss > thresholdAmount &&
    enoughHistory === true;
  let durationPayPeriods = null;
  if (applies) {
    durationPayPeriods = structureYears >= 4 ? 12 : structureYears >= 2 ? 9 : 6;
  }
  const incomeIncreaseAmount = firstNumber(
    body.phase_out_income_increase_amount,
    body.non_article_37_income_increase_amount,
    selectedContract.phase_out_income_increase_amount,
    personnel.phase_out_income_increase_amount
  ) ?? 0;
  const increaseIsArticle37 = booleanOrNull(pickPolicyValue(
    ['phase_out_income_increase_is_article_37', 'income_increase_is_article_37'],
    body,
    selectedContract,
    personnel
  )) === true;
  const reduction = increaseIsArticle37 ? 0 : incomeIncreaseAmount;
  const currentAmount = applies ? Math.max(0, (eligibleLoss || 0) - reduction) : 0;

  return {
    applies,
    change_signal_present: changeSignal,
    old_fixed_income_per_period: oldIncome !== null ? r2(oldIncome) : null,
    new_fixed_income_per_period: newIncome !== null ? r2(newIncome) : null,
    income_loss_per_period: incomeLoss !== null ? r2(incomeLoss) : null,
    threshold_amount_per_period: thresholdAmount,
    eligible_loss_above_threshold: eligibleLoss !== null ? r2(eligibleLoss) : null,
    fixed_income_structure_years_before_change: structureYears !== null ? r2(structureYears) : null,
    enough_history_for_phase_out: enoughHistory,
    duration_pay_periods: durationPayPeriods,
    non_article_37_income_increase_reduction: r2(reduction),
    article_37_increase_ignored_for_reduction: increaseIsArticle37,
    current_phase_out_amount_per_period: r2(currentAmount),
    manual_review_required: manualReviewItems.length > 0,
    manual_review_items: manualReviewItems,
    source_rule_ids: sourceRuleIds
  };
}

function resolvePayrollWageAllowancePolicy({
  body,
  personnel,
  caoConfig,
  payrollPeriod,
  baseHourlyRate,
  isCallWorker,
  caoScope,
  contractResolutionResults,
  functionClassificationResult
}) {
  const selectedContract = selectedContractsFromResolutionResults(contractResolutionResults)[0] || {};
  const profile = caoScope?.payroll_rule_profile || {};
  const isUnknownOrMixedScope = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope?.cao_scope_profile);
  const applySpecialHours = !isUnknownOrMixedScope && profile.apply_article_40_special_hours === true;
  const applyHolidays = profile.apply_article_41_holidays !== false;
  const article36 = resolveArticle36PromotionPolicy({
    body,
    selectedContract,
    personnel,
    classification: functionClassificationResult,
    payrollPeriod
  });
  const article37 = resolveArticle37WageIncrease({
    body,
    selectedContract,
    personnel,
    caoConfig,
    payrollPeriod,
    baseHourlyRate
  });
  const article40And41 = resolveArticle40And41SurchargeMatrix({
    caoConfig,
    isCallWorker,
    applySpecialHours,
    applyHolidays
  });
  const article46 = resolveArticle46PhaseOutPolicy({
    body,
    selectedContract,
    personnel,
    caoConfig
  });
  const manualReviewItems = [
    ...(article36.manual_review_items || []),
    ...(article37.manual_review_items || []),
    ...(article46.manual_review_items || [])
  ];
  return {
    article_35_36_wage_scale_and_promotion: article36,
    article_37_wage_increase: article37,
    article_40_41_special_hours_and_holiday_surcharges: article40And41,
    article_46_income_structure_phase_out: article46,
    manual_review_required: manualReviewItems.length > 0,
    manual_review_items: manualReviewItems,
    source_rule_ids: [
      ...article36.source_rule_ids,
      ...article37.source_rule_ids,
      ...article40And41.source_rule_ids,
      ...article46.source_rule_ids
    ]
  };
}

function buildCaoPayslipTemplateCompliance({
  body,
  personnel,
  selectedContract,
  payslip,
  totalHours,
  baseHourlyRate,
  payrollPeriod,
  caoConfig,
  functionClassificationResult
}) {
  const sourceRuleIds = [
    'CAO-PB-2024-R1740', 'CAO-PB-2024-R1742', 'CAO-PB-2024-R1744',
    'CAO-PB-2024-R1745', 'CAO-PB-2024-R1746', 'CAO-PB-2024-R1747',
    'CAO-PB-2024-R1749', 'CAO-PB-2024-R1750'
  ];
  const statutoryMinimumWagePeriodAmount = firstNumber(
    body.statutory_minimum_wage_period_amount,
    body.minimum_wage_period_amount,
    selectedContract.statutory_minimum_wage_period_amount,
    selectedContract.minimum_wage_period_amount,
    personnel.statutory_minimum_wage_period_amount,
    personnel.minimum_wage_period_amount,
    caoConfig.statutory_minimum_wage_period_amount
  );
  const agreedArbeidsduur = firstNumber(
    body.contract_hours_per_pay_period,
    body.agreed_hours_per_pay_period,
    selectedContract.contract_hours_per_pay_period,
    selectedContract.hours_per_pay_period,
    selectedContract.min_hours_per_pay_period,
    personnel.contract_hours_per_pay_period,
    personnel.hours_per_pay_period
  );
  const missingOrExternalFields = [];
  if (statutoryMinimumWagePeriodAmount === null) {
    missingOrExternalFields.push({
      field: 'statutory_minimum_wage_period_amount',
      rule_id: 'CAO-PB-2024-R1742',
      message: 'Wettelijk minimumloon over de uitbetalingstermijn ontbreekt; koppel hiervoor een externe WML-parameterbron per peildatum.'
    });
  }

  const wageComposition = {
    base_wage: r2(payslip.base_salary),
    overtime_surcharge: r2(payslip.overtime_50?.amount),
    special_hours_surcharges: r2(
      (payslip.surcharges?.evening_10?.amount || 0) +
      (payslip.surcharges?.night_20?.amount || 0) +
      (payslip.surcharges?.weekend_35?.amount || 0) +
      (payslip.surcharges?.holiday_50?.amount || 0) +
      (payslip.surcharges?.new_years_eve_100?.amount || 0)
    ),
    minimum_service_compensation: r2(payslip.minimum_service_compensation?.amount),
    acting_function_allowance: r2(payslip.acting_function_allowance?.amount),
    shift_change_allowance: r2(payslip.shift_change_allowance?.amount),
    general_reserve_allowance: r2(payslip.general_reserve_allowance?.amount),
    value_services_early_shift_allowance: r2(payslip.value_services_early_shift_allowance?.amount),
    cash_value_late_next_day_notice_allowance: r2(payslip.cash_value_late_next_day_notice_allowance?.amount),
    schiphol_object_allowance_included_in_base_wage: r2(payslip.schiphol_allowances?.object_allowance?.amount),
    schiphol_early_start_allowance: r2(payslip.schiphol_allowances?.early_start_allowance?.amount),
    schiphol_historical_summer_allowance_2022: r2(payslip.schiphol_allowances?.historical_summer_allowance_2022?.amount),
    schiphol_historical_labor_market_allowance_2022_2023: r2(payslip.schiphol_allowances?.historical_labor_market_allowance_2022_2023?.amount),
    travel_and_other_reimbursements_external: true
  };

  return {
    source_rule_ids: sourceRuleIds,
    payroll_period: {
      start_date: payrollPeriod?.period_start || null,
      end_date: payrollPeriod?.period_end || null
    },
    required_fields: {
      arbeidsduur: {
        value_hours_per_pay_period: agreedArbeidsduur !== null ? r2(agreedArbeidsduur) : r2(totalHours),
        source: agreedArbeidsduur !== null ? 'contract' : 'calculated_paid_hours_in_run',
        rule_id: 'CAO-PB-2024-R1740'
      },
      statutory_minimum_wage_period_amount: {
        amount: statutoryMinimumWagePeriodAmount !== null ? r2(statutoryMinimumWagePeriodAmount) : null,
        rule_id: 'CAO-PB-2024-R1742'
      },
      vacation_hours_accrued: {
        hours: payslip.vacation_entitlement?.vacation_hours_accrued_per_pay_period !== undefined
          ? r2(payslip.vacation_entitlement.vacation_hours_accrued_per_pay_period)
          : null,
        rule_id: 'CAO-PB-2024-R1744'
      },
      vacation_allowance_accrued: {
        amount: r2(payslip.accruals?.vacation_allowance),
        rule_id: 'CAO-PB-2024-R1745'
      },
      gross_wage_amount: {
        amount: r2(payslip.total_gross),
        base_hourly_rate: r2(baseHourlyRate),
        rule_id: 'CAO-PB-2024-R1746'
      },
      wage_composition: {
        ...wageComposition,
        rule_id: 'CAO-PB-2024-R1747'
      },
      employee_deductions: {
        premium_sfpb: r2(payslip.employee_deductions?.premium_sfpb),
        premium_paww: r2(payslip.employee_deductions?.premium_paww),
        pension_premium: r2(payslip.employee_deductions?.pension_premium),
        premium_wga: r2(payslip.employee_deductions?.premium_wga),
        tax_withheld: r2(payslip.employee_deductions?.tax_withheld),
        total: r2(payslip.employee_deductions?.total),
        rule_id: 'CAO-PB-2024-R1749'
      },
      salary_scale: {
        cao_scale: functionClassificationResult?.scale ?? personnel.cao_scale ?? selectedContract.cao_scale ?? null,
        cao_period: functionClassificationResult?.period ?? personnel.cao_period ?? selectedContract.cao_period ?? null,
        wage_basis_type: functionClassificationResult?.wage_basis_type || null,
        rule_id: 'CAO-PB-2024-R1750'
      }
    },
    missing_or_external_fields: missingOrExternalFields,
    manual_review_required: missingOrExternalFields.length > 0,
    export_control_ready: missingOrExternalFields.length === 0
  };
}

function localWindowOverlapHours(interval, dateStr, windowStart, windowEnd) {
  if (!interval?.start || !interval?.end || !dateStr) return 0;
  const window = buildCaoShiftInterval(dateStr, windowStart, windowEnd, true);
  if (!window?.start || !window?.end) return 0;
  const start = Math.max(interval.start.getTime(), window.start.getTime());
  const end = Math.min(interval.end.getTime(), window.end.getTime());
  return Math.max(0, (end - start) / (1000 * 60 * 60));
}

function shiftOverlapsDateTimeRange(interval, startIso, endIsoExclusive) {
  if (!interval?.start || !interval?.end) return false;
  const start = new Date(startIso).getTime();
  const end = new Date(endIsoExclusive).getTime();
  return interval.start.getTime() < end && interval.end.getTime() > start;
}

function shiftWorksAirportSchiphol(shift = {}, body = {}, caoScope = {}) {
  return caoScope?.cao_scope_profile === 'airport_schiphol' ||
    booleanOrNull(shift.works_airport_schiphol ?? shift.schiphol_service ?? shift.airport_schiphol_service) === true ||
    booleanOrNull(body.works_airport_schiphol ?? body.schiphol_service ?? body.airport_schiphol_service) === true;
}

function schipholTenderScopeConfirmed(shift = {}, body = {}) {
  return booleanOrNull(
    shift.schiphol_tender_security_operation_confirmed ??
    shift.schiphol_object_allowance_eligible ??
    body.schiphol_tender_security_operation_confirmed ??
    body.schiphol_object_allowance_eligible
  ) === true;
}

function resolveSchipholShiftPayrollComponents({ shift, body, caoScope, shiftInterval, hoursWorked, baseHourlyRate }) {
  const sourceRuleIds = [
    'CAO-PB-2024-R1576', 'CAO-PB-2024-R1577', 'CAO-PB-2024-R1578',
    'CAO-PB-2024-R1579', 'CAO-PB-2024-R1580', 'CAO-PB-2024-R1583',
    'CAO-PB-2024-R1584', 'CAO-PB-2024-R1585', 'CAO-PB-2024-R1586',
    'CAO-PB-2024-R1973', 'CAO-PB-2024-R1975', 'CAO-PB-2024-R1976',
    'CAO-PB-2024-R1977', 'CAO-PB-2024-R1978', 'CAO-PB-2024-R1982',
    'CAO-PB-2024-R2039', 'CAO-PB-2024-R2040', 'CAO-PB-2024-R2041',
    'CAO-PB-2024-R2042', 'CAO-PB-2024-R2043', 'CAO-PB-2024-R2044',
    'CAO-PB-2024-R2045', 'CAO-PB-2024-R2046', 'CAO-PB-2024-R2064',
    'CAO-PB-2024-R2065', 'CAO-PB-2024-R2067', 'CAO-PB-2024-R2068',
    'CAO-PB-2024-R2069', 'CAO-PB-2024-R2070', 'CAO-PB-2024-R2071',
    'CAO-PB-2024-R2072'
  ];
  const appliesAirport = shiftWorksAirportSchiphol(shift, body, caoScope);
  const date = isoDate(shift.date || shift.service_date);
  const manualReviewItems = [];
  const base = {
    applies: appliesAirport,
    source_rule_ids: sourceRuleIds,
    object_allowance: { applies: false, hours: 0, rate: 2.5, amount: 0, included_in_base_salary: true },
    early_start_allowance: { applies: false, hours: 0, percentage: 35, base_rate_including_object_allowance: r2(baseHourlyRate), amount: 0 },
    historical_summer_allowance_2022: { applies: false, hours: 0, rate: 5.25, amount: 0, excluded_from_vacation_pension_year_end_and_ort_basis: true },
    historical_labor_market_allowance_2022_2023: { applies: false, hours: 0, rate: 1.4, amount: 0, excluded_from_vacation_pension_year_end_and_ort_basis: true },
    manual_review_required: false,
    manual_review_items: []
  };
  if (!appliesAirport || !date || !shiftInterval) return base;

  const tenderConfirmed = schipholTenderScopeConfirmed(shift, body);
  if (!tenderConfirmed) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R2040',
      domain: 'airport_schiphol_object_allowance',
      field: 'schiphol_tender_security_operation_confirmed',
      message: 'Schiphol objecttoeslag vereist bevestiging dat werknemer beveiligingswerk verricht op/in opdracht van Schiphol binnen de Schipholtender/operatie.'
    });
  }

  const structuralEffective = date >= '2022-11-01';
  if (structuralEffective) {
    const allowanceHours = firstNumber(
      shift.schiphol_contract_hours,
      shift.schiphol_object_allowance_hours,
      shift.contract_hours,
      hoursWorked
    ) || 0;
    base.object_allowance = {
      applies: allowanceHours > 0,
      hours: r2(allowanceHours),
      rate: 2.5,
      amount: r2(allowanceHours * 2.5),
      included_in_base_salary: true,
      source_rule_ids: ['CAO-PB-2024-R1583', 'CAO-PB-2024-R1584', 'CAO-PB-2024-R2040', 'CAO-PB-2024-R2041', 'CAO-PB-2024-R2042', 'CAO-PB-2024-R2069', 'CAO-PB-2024-R2070']
    };

    const startMinutes = parseClockParts(shift.start_time)?.total_minutes ?? null;
    const startsInEarlyWindow = startMinutes !== null && startMinutes >= 0 && startMinutes <= (5 * 60 + 30);
    const earlyHours = startsInEarlyWindow
      ? localWindowOverlapHours(shiftInterval, date, '00:00', '06:00') + localWindowOverlapHours(shiftInterval, addDaysIso(date, 1), '00:00', '06:00')
      : 0;
    const earlyRateBase = baseHourlyRate + 2.5;
    base.early_start_allowance = {
      applies: earlyHours > 0,
      hours: r2(earlyHours),
      percentage: 35,
      base_rate_including_object_allowance: r2(earlyRateBase),
      amount: r2(earlyHours * earlyRateBase * 0.35),
      source_rule_ids: ['CAO-PB-2024-R1585', 'CAO-PB-2024-R1586', 'CAO-PB-2024-R2043', 'CAO-PB-2024-R2044', 'CAO-PB-2024-R2045']
    };
  }

  const workedHours = Math.max(0, hoursWorked || 0);
  const isActualWorkedHours = ![
    shift.is_vacation,
    shift.is_sickness,
    shift.is_training,
    shift.is_paid_absence
  ].some(value => booleanOrNull(value) === true);
  const summerApplies = isActualWorkedHours && (
    shiftOverlapsDateTimeRange(shiftInterval, '2022-04-23T00:00:00+02:00', '2022-05-09T00:00:00+02:00') ||
    shiftOverlapsDateTimeRange(shiftInterval, '2022-06-01T00:00:00+02:00', '2022-09-05T00:00:00+02:00')
  );
  if (summerApplies) {
    base.historical_summer_allowance_2022 = {
      applies: true,
      hours: r2(workedHours),
      rate: 5.25,
      amount: r2(workedHours * 5.25),
      payout_deadline: '2022-09-30',
      excluded_from_vacation_pension_year_end_and_ort_basis: true,
      source_rule_ids: ['CAO-PB-2024-R1576', 'CAO-PB-2024-R1577', 'CAO-PB-2024-R1973', 'CAO-PB-2024-R1975', 'CAO-PB-2024-R1976', 'CAO-PB-2024-R1977', 'CAO-PB-2024-R1978']
    };
  }
  const laborMarketApplies = isActualWorkedHours &&
    shiftOverlapsDateTimeRange(shiftInterval, '2022-09-05T00:00:00+02:00', '2023-09-01T00:00:00+02:00');
  if (laborMarketApplies) {
    base.historical_labor_market_allowance_2022_2023 = {
      applies: true,
      hours: r2(workedHours),
      rate: 1.4,
      amount: r2(workedHours * 1.4),
      payout_months: ['2022-11', '2023-03', '2023-06', '2023-09'],
      excluded_from_vacation_pension_year_end_and_ort_basis: true,
      source_rule_ids: ['CAO-PB-2024-R1578', 'CAO-PB-2024-R1579', 'CAO-PB-2024-R1580', 'CAO-PB-2024-R1982']
    };
  }

  base.manual_review_required = manualReviewItems.length > 0;
  base.manual_review_items = manualReviewItems;
  return base;
}

function resolveCaoTrainingEducationPolicy({ body, workSchedule }) {
  const sourceRuleIds = [
    'CAO-PB-2024-R0950', 'CAO-PB-2024-R0953', 'CAO-PB-2024-R0956',
    'CAO-PB-2024-R0957', 'CAO-PB-2024-R0958', 'CAO-PB-2024-R0959',
    'CAO-PB-2024-R0962', 'CAO-PB-2024-R0966', 'CAO-PB-2024-R0968',
    'CAO-PB-2024-R0971', 'CAO-PB-2024-R0976', 'CAO-PB-2024-R0979',
    'CAO-PB-2024-R0980', 'CAO-PB-2024-R0981', 'CAO-PB-2024-R0982',
    'CAO-PB-2024-R0991'
  ];
  const manualReviewItems = [];
  const shiftPolicies = (workSchedule || []).map((shift, index) => {
    const serviceType = normalizePolicyText(shift.service_type || shift.task_type || shift.training_type || '');
    const mandatoryTraining = booleanOrNull(pickPolicyValue(
      ['mandatory_training', 'is_mandatory_training', 'required_training', 'verplichte_opleiding', 'mandatory_training_article_55_3'],
      shift,
      shift.service_context || {}
    )) === true || serviceType.includes('mandatory_training') || serviceType.includes('verplichte_opleiding');
    const practiceAgreement = booleanOrNull(pickPolicyValue(
      ['practice_agreement_training', 'web_practice_agreement', 'mbo_practice_agreement', 'praktijkovereenkomst'],
      shift,
      shift.service_context || {},
      body
    )) === true;
    const ehboBhv = booleanOrNull(pickPolicyValue(
      ['ehbo_bhv_training', 'first_aid_bhv_training'],
      shift,
      shift.service_context || {}
    )) === true || serviceType.includes('ehbo') || serviceType.includes('bhv');
    const employerRequiredEhboBhv = booleanOrNull(pickPolicyValue(
      ['employer_required_ehbo_bhv', 'mandatory_ehbo_bhv', 'bhv_required_by_employer'],
      shift,
      shift.service_context || {},
      body
    )) === true;
    const voluntaryEhbo = ehboBhv && !employerRequiredEhboBhv && booleanOrNull(pickPolicyValue(
      ['voluntary_ehbo_bhv', 'voluntary_ehbo_training'],
      shift,
      shift.service_context || {},
      body
    )) !== false;
    const practiceWeek = firstNumber(
      shift.practice_training_week_number,
      shift.training_week_number,
      shift.service_context?.practice_training_week_number,
      body.practice_training_week_number
    );
    let baseWagePercentage = mandatoryTraining || employerRequiredEhboBhv ? 100 : null;
    let paidWorkTime = mandatoryTraining || employerRequiredEhboBhv;
    if (practiceAgreement) {
      if (practiceWeek === null) {
        manualReviewItems.push({
          rule_id: 'CAO-PB-2024-R0957',
          domain: 'training_education',
          field: `work_schedule[${index}].practice_training_week_number`,
          message: 'Praktijkovereenkomst/WEB-opleiding mist opleidingsweek; 50% eerste 4 weken of 100% daarna kan niet definitief worden toegepast.'
        });
      }
      baseWagePercentage = practiceWeek !== null && practiceWeek <= 4 ? 50 : 100;
      paidWorkTime = true;
    }
    if (voluntaryEhbo) {
      baseWagePercentage = 0;
      paidWorkTime = false;
    }
    const hasTrainingSignal = mandatoryTraining || practiceAgreement || ehboBhv;
    return {
      shift_index: index,
      date: shift.date || null,
      has_training_signal: hasTrainingSignal,
      mandatory_training: mandatoryTraining,
      practice_agreement_training: practiceAgreement,
      practice_training_week_number: practiceWeek,
      ehbo_bhv_training: ehboBhv,
      employer_required_ehbo_bhv: employerRequiredEhboBhv,
      voluntary_ehbo_bhv: voluntaryEhbo,
      paid_work_time: paidWorkTime,
      roster_and_rest_rules_apply: mandatoryTraining || practiceAgreement || employerRequiredEhboBhv,
      employer_pays_mandatory_training_costs: mandatoryTraining || employerRequiredEhboBhv,
      base_wage_percentage: baseWagePercentage,
      nonstandard_payroll_multiplier_requires_review: hasTrainingSignal && baseWagePercentage !== null && baseWagePercentage !== 100,
      source_rule_ids: hasTrainingSignal ? sourceRuleIds : []
    };
  });
  const nonstandardPolicies = shiftPolicies.filter(item => item.nonstandard_payroll_multiplier_requires_review);
  if (nonstandardPolicies.length > 0 && booleanOrNull(body.training_payroll_adjustment_applied) !== true) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0957',
      domain: 'training_education',
      field: 'training_payroll_adjustment_applied',
      message: 'Opleiding/EHBO-BHV bevat 50% of 0% loonbeleid; bevestig training_payroll_adjustment_applied=true nadat de looncomponent is gesplitst/toegepast.'
    });
  }
  return {
    applies: shiftPolicies.some(item => item.has_training_signal) ||
      booleanOrNull(body.voluntary_training_requested) === true,
    voluntary_training_request_policy: {
      requested: booleanOrNull(body.voluntary_training_requested) === true,
      employer_response_deadline_months: 1,
      written_denial_reason_required: booleanOrNull(body.voluntary_training_denied) === true,
      study_cost_repayment_agreement_manual_review_required: booleanOrNull(body.study_cost_repayment_agreement_present) === true,
      source_rule_ids: ['CAO-PB-2024-R0971', 'CAO-PB-2024-R0976']
    },
    shift_policies: shiftPolicies,
    manual_review_required: manualReviewItems.length > 0,
    manual_review_items: manualReviewItems,
    source_rule_ids: sourceRuleIds
  };
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

function dateOrNull(value) {
  const iso = isoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageYearsAt(dateOfBirth, referenceDate) {
  const birth = dateOrNull(dateOfBirth);
  const reference = dateOrNull(referenceDate);
  if (!birth || !reference) return null;
  let years = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) years -= 1;
  return years;
}

function ageMonthsAt(dateOfBirth, referenceDate) {
  const birth = dateOrNull(dateOfBirth);
  const reference = dateOrNull(referenceDate);
  if (!birth || !reference) return null;
  let months = (reference.getFullYear() - birth.getFullYear()) * 12 + (reference.getMonth() - birth.getMonth());
  if (reference.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function monthsUntilDate(fromDate, toDate) {
  const from = dateOrNull(fromDate);
  const to = dateOrNull(toDate);
  if (!from || !to || to < from) return null;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function addMonthsIso(dateValue, months) {
  const date = dateOrNull(dateValue);
  if (!date) return null;
  const target = new Date(date.getTime());
  target.setMonth(target.getMonth() + months);
  return isoDate(target.toISOString());
}

function resolve80_90_100AgeEligibility({ dateOfBirth, aowDate, referenceDate, explicitEligible }) {
  if (explicitEligible === true) {
    return { eligible: true, method: 'explicit_eligibility_confirmed', manual_review_required: false };
  }
  const refIso = isoDate(referenceDate);
  const refYear = refIso ? Number(refIso.slice(0, 4)) : null;
  const monthsToAow = monthsUntilDate(referenceDate, aowDate);
  if (refYear !== null && refYear >= 2023 && monthsToAow !== null) {
    return {
      eligible: monthsToAow <= 60,
      method: 'within_5_years_before_aow',
      months_to_aow: monthsToAow,
      manual_review_required: false
    };
  }
  const ageMonths = ageMonthsAt(dateOfBirth, referenceDate);
  if (ageMonths !== null) {
    if (refYear === 2021) {
      return {
        eligible: ageMonths >= (64 * 12 + 4),
        method: '2021_transition_age_64y4m',
        age_months: ageMonths,
        manual_review_required: false
      };
    }
    if (refYear === 2022) {
      return {
        eligible: ageMonths >= (62 * 12 + 7),
        method: '2022_transition_age_62y7m',
        age_months: ageMonths,
        manual_review_required: false
      };
    }
  }
  return {
    eligible: false,
    method: refYear !== null && refYear >= 2023 ? 'missing_aow_date' : 'missing_birth_date_or_aow_date',
    manual_review_required: true
  };
}

function buildEightyNinetyHundredArrangement({
  personnel,
  body,
  contractResolutionResults,
  referenceDate,
  payrollCaoParameters
}) {
  const selectedContract = selectedContractsFromResolutionResults(contractResolutionResults)[0] || {};
  const params = payrollCaoParameters.eighty_ninety_hundred || resolvePayrollCaoParameters(null).eighty_ninety_hundred;
  const active = booleanOrNull(pickFirstNonEmpty(
    body.eighty_ninety_hundred_active,
    body['80_90_100_active'],
    selectedContract.eighty_ninety_hundred_active,
    selectedContract['80_90_100_active'],
    personnel.eighty_ninety_hundred_active,
    personnel['80_90_100_active']
  )) === true;
  const requested = active || booleanOrNull(pickFirstNonEmpty(
    body.eighty_ninety_hundred_requested,
    body['80_90_100_requested'],
    selectedContract.eighty_ninety_hundred_requested,
    personnel.eighty_ninety_hundred_requested
  )) === true;

  const sourceRuleIds = params.source_rule_ids || [];
  if (!active && !requested) {
    return {
      applies: false,
      active: false,
      requested: false,
      source_rule_ids: sourceRuleIds
    };
  }

  const manualReviewItems = [];
  const blockingReasons = [];
  const dateOfBirth = pickFirstNonEmpty(
    body.date_of_birth,
    body.employee_date_of_birth,
    selectedContract.date_of_birth,
    personnel.date_of_birth
  );
  const aowDate = pickFirstNonEmpty(
    body.aow_date,
    body.statutory_pension_date,
    selectedContract.aow_date,
    personnel.aow_date,
    personnel.statutory_pension_date
  );
  const explicitEligible = booleanOrNull(pickFirstNonEmpty(
    body.eighty_ninety_hundred_eligibility_confirmed,
    body['80_90_100_eligibility_confirmed'],
    selectedContract.eighty_ninety_hundred_eligibility_confirmed,
    personnel.eighty_ninety_hundred_eligibility_confirmed
  ));
  const ageEligibility = resolve80_90_100AgeEligibility({
    dateOfBirth,
    aowDate,
    referenceDate,
    explicitEligible
  });
  if (ageEligibility.manual_review_required) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1218',
      domain: 'eighty_ninety_hundred_age_eligibility',
      field: 'aow_date/date_of_birth',
      message: '80-90-100 leeftijds-/AOW-venster kan niet automatisch worden vastgesteld.'
    });
  } else if (!ageEligibility.eligible) {
    blockingReasons.push('80-90-100 leeftijds-/AOW-venster is nog niet bereikt.');
  }

  const industryServiceYears = firstNumber(
    body.security_industry_service_years,
    body.industry_service_years,
    body.continuous_security_industry_service_years,
    selectedContract.security_industry_service_years,
    selectedContract.industry_service_years,
    personnel.security_industry_service_years,
    personnel.industry_service_years
  );
  if (industryServiceYears === null) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1215',
      domain: 'eighty_ninety_hundred_service_years',
      field: 'security_industry_service_years',
      message: '80-90-100 vereist minimaal 5 aaneengesloten jaren in de branche; dienstjaren ontbreken.'
    });
  } else if (industryServiceYears < params.minimumIndustryServiceYears) {
    blockingReasons.push(`80-90-100 vereist minimaal ${params.minimumIndustryServiceYears} branchejaren; vastgelegd is ${industryServiceYears}.`);
  }

  const applicationDate = pickFirstNonEmpty(
    body.eighty_ninety_hundred_application_date,
    body['80_90_100_application_date'],
    selectedContract.eighty_ninety_hundred_application_date,
    personnel.eighty_ninety_hundred_application_date
  );
  const startDate = pickFirstNonEmpty(
    body.eighty_ninety_hundred_start_date,
    body['80_90_100_start_date'],
    selectedContract.eighty_ninety_hundred_start_date,
    personnel.eighty_ninety_hundred_start_date
  );
  const earliestStartDate = addMonthsIso(applicationDate, params.applicationNoticeMonths);
  if (!applicationDate || !startDate) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1221',
      domain: 'eighty_ninety_hundred_application_notice',
      field: 'eighty_ninety_hundred_application_date/start_date',
      message: '80-90-100 aanvraagdatum en ingangsdatum ontbreken of zijn onvolledig; aanvraag moet 3 maanden vooraf worden gedaan.'
    });
  } else if (earliestStartDate && isoDate(startDate) < earliestStartDate) {
    blockingReasons.push(`80-90-100 aanvraag is minder dan ${params.applicationNoticeMonths} maanden voor ingang gedaan.`);
  }

  const preSchemeHours = firstNumber(
    body.pre_80_90_100_hours_per_pay_period,
    body.eighty_ninety_hundred_previous_hours_per_pay_period,
    selectedContract.pre_80_90_100_hours_per_pay_period,
    personnel.pre_80_90_100_hours_per_pay_period
  );
  const currentHours = firstNumber(
    body.contract_hours_per_pay_period,
    body.hours_per_pay_period,
    selectedContract.contract_hours_per_pay_period,
    selectedContract.hours_per_pay_period,
    selectedContract.min_hours_per_pay_period,
    personnel.contract_hours_per_pay_period
  );
  const preSchemeBaseSalary = firstNumber(
    body.pre_80_90_100_base_salary_per_pay_period,
    body.pre_80_90_100_salary_per_pay_period,
    selectedContract.pre_80_90_100_base_salary_per_pay_period,
    personnel.pre_80_90_100_base_salary_per_pay_period
  );
  const preSchemePensionBase = firstNumber(
    body.pre_80_90_100_pension_base_amount_per_period,
    body.eighty_ninety_hundred_pension_base_amount_per_period,
    selectedContract.pre_80_90_100_pension_base_amount_per_period,
    personnel.pre_80_90_100_pension_base_amount_per_period,
    preSchemeBaseSalary
  );
  const expectedCurrentHours = preSchemeHours !== null ? preSchemeHours * (params.hoursPercentage / 100) : null;
  const expectedPaidSalary = preSchemeBaseSalary !== null ? preSchemeBaseSalary * (params.salaryPercentage / 100) : null;
  if (active && preSchemeHours === null) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1230',
      domain: 'eighty_ninety_hundred_hours',
      field: 'pre_80_90_100_hours_per_pay_period',
      message: '80-90-100 is actief, maar de oorspronkelijke arbeidsduur ontbreekt; 80%-arbeidsduur kan niet worden getoetst.'
    });
  }
  if (active && preSchemePensionBase === null) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1233',
      domain: 'eighty_ninety_hundred_pension',
      field: 'pre_80_90_100_pension_base_amount_per_period',
      message: '80-90-100 is actief, maar de oorspronkelijke pensioengrondslag ontbreekt; 100% pensioenopbouw kan niet definitief worden berekend.'
    });
  }
  if (active && currentHours !== null && expectedCurrentHours !== null && Math.abs(currentHours - expectedCurrentHours) > 0.25) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1230',
      domain: 'eighty_ninety_hundred_hours',
      field: 'contract_hours_per_pay_period',
      message: `80-90-100 verwacht ${r2(expectedCurrentHours)} uur per loonperiode, maar contractcontext bevat ${r2(currentHours)} uur.`
    });
  }
  const minimumParttimeHours = (payrollCaoParameters.pension?.fulltimeHoursPerPayPeriod || 144) * (params.minimumParttimePercentageAfterStart / 100);
  if (active && currentHours !== null && currentHours < minimumParttimeHours) {
    blockingReasons.push(`80-90-100 parttime-omvang na ingang is ${r2(currentHours)} uur; minimum is ${r2(minimumParttimeHours)} uur per loonperiode.`);
  }
  const sideWorkAfterStart = booleanOrNull(pickFirstNonEmpty(
    body.eighty_ninety_hundred_paid_side_work_after_start,
    body.paid_side_work_after_80_90_100_start,
    selectedContract.eighty_ninety_hundred_paid_side_work_after_start,
    personnel.eighty_ninety_hundred_paid_side_work_after_start
  )) === true;
  const sideWorkExisting = booleanOrNull(pickFirstNonEmpty(
    body.eighty_ninety_hundred_side_work_existing_before_start,
    body.paid_side_work_existing_before_80_90_100,
    selectedContract.eighty_ninety_hundred_side_work_existing_before_start,
    personnel.eighty_ninety_hundred_side_work_existing_before_start
  )) === true;
  if (active && sideWorkAfterStart && !sideWorkExisting) {
    blockingReasons.push('80-90-100 staat nieuwe betaalde nevenwerkzaamheden na ingang niet toe.');
  }
  if (booleanOrNull(body.eighty_ninety_hundred_denied_for_business_interest) === true && !body.eighty_ninety_hundred_denial_written_reason) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R1225',
      domain: 'eighty_ninety_hundred_denial',
      field: 'eighty_ninety_hundred_denial_written_reason',
      message: 'Afwijzing 80-90-100 wegens zwaarwegend bedrijfsbelang mist schriftelijke motivering.'
    });
  }

  return {
    applies: true,
    active,
    requested,
    reference_date: isoDate(referenceDate),
    application_date: isoDate(applicationDate),
    start_date: isoDate(startDate),
    age_at_reference_date: ageYearsAt(dateOfBirth, referenceDate),
    aow_date: isoDate(aowDate),
    age_eligibility: ageEligibility,
    industry_service_years: industryServiceYears,
    pre_scheme_hours_per_pay_period: preSchemeHours !== null ? r2(preSchemeHours) : null,
    expected_hours_per_pay_period: expectedCurrentHours !== null ? r2(expectedCurrentHours) : null,
    current_contract_hours_per_pay_period: currentHours !== null ? r2(currentHours) : null,
    pre_scheme_base_salary_per_pay_period: preSchemeBaseSalary !== null ? r2(preSchemeBaseSalary) : null,
    expected_paid_base_salary_per_pay_period: expectedPaidSalary !== null ? r2(expectedPaidSalary) : null,
    pension_base_override_amount_per_period: active && preSchemePensionBase !== null ? r2(preSchemePensionBase) : null,
    hours_percentage: params.hoursPercentage,
    salary_percentage: params.salaryPercentage,
    pension_build_up_percentage: params.pensionPercentage,
    minimum_parttime_hours_per_pay_period_after_start: r2(minimumParttimeHours),
    atv_article_73_excluded: active,
    blocking_reasons: blockingReasons,
    manual_review_items: manualReviewItems,
    manual_review_required: manualReviewItems.length > 0 || blockingReasons.length > 0,
    source_rule_ids: sourceRuleIds
  };
}

function getVacationEntitlementProfile(caoScopeProfile, payrollCaoParameters = resolvePayrollCaoParameters(null)) {
  if (caoScopeProfile === 'cash_value_logistics') {
    return payrollCaoParameters.cash_value_vacation;
  }
  return payrollCaoParameters.standard_vacation;
}

function calculateVacationEntitlementForPayPeriod({
  paidHoursPerPayPeriod,
  vacationServiceContext,
  caoScopeProfile = null,
  payrollCaoParameters = resolvePayrollCaoParameters(null)
}) {
  const profile = getVacationEntitlementProfile(caoScopeProfile, payrollCaoParameters);
  const fulltimePeriodHours = profile.fulltimePeriodHours ?? 144;
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
    parameter_provenance: {
      standard_vacation_annual_hours: payrollCaoParameters.provenance.standard_vacation_annual_hours,
      standard_vacation_per_period_hours: payrollCaoParameters.provenance.standard_vacation_per_period_hours
    },
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

function resolveValueServicesEarlyShiftAllowance(shift, caoScope, payrollCaoParameters = resolvePayrollCaoParameters(null)) {
  const serviceContext = shift?.service_context || {};
  const appliesScope = caoScope?.cao_scope_profile === 'cash_value_logistics' ||
    shift?.works_cash_value_logistics === true ||
    serviceContext.works_cash_value_logistics === true;
  const clock = parseClockParts(shift?.start_time);
  const applies = appliesScope && clock && clock.total_minutes >= 120 && clock.total_minutes < 240;
  const rate = payrollCaoParameters.value_services_early_shift_amount;
  return {
    applies: !!applies,
    amount: applies ? rate : 0,
    rate_per_shift: rate,
    tax_treatment: 'bruto',
    source_rule_ids: applies ? payrollCaoParameters.value_services_early_shift_source_rule_ids : [],
    parameter_provenance: {
      value_services_early_shift_amount: payrollCaoParameters.provenance.value_services_early_shift_amount
    },
    note: applies ? `Geld- en waardelogistiek vroege dienst 02:00-04:00: EUR ${rate} bruto per dienst.` : null
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

async function resolveLoondienstWageBasis({ base44, personnel_id, personnel, caoScope, contractResolutionResults = [] }) {
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

  const contractClassificationContext = buildSingleContractClassificationContext(contractResolutionResults);
  if (contractClassificationContext.blocking_reason) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: null,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_contract_wage_basis_scope',
      warnings: contractClassificationContext.warnings,
      error: contractClassificationContext.blocking_reason,
      cao_function_classification: null
    };
  }

  let classification = null;
  try {
    const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
      personnel_id,
      contract: contractClassificationContext.contract || undefined,
      work_context: contractClassificationContext.work_context || {},
      cao_key: contractClassificationContext.contract?.cao_key ||
        contractClassificationContext.work_context?.cao_key ||
        contractClassificationContext.work_context?.cao ||
        null
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
          ...contractClassificationContext.warnings,
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
        ...contractClassificationContext.warnings,
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
      warnings: contractClassificationContext.warnings,
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
      warnings: [
        ...contractClassificationContext.warnings,
        ...(classification.warnings || [])
      ],
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
    warnings: [
      ...contractClassificationContext.warnings,
      ...(classification.warnings || [])
    ],
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
    shift.operating_company_id ||
    shift.route_id ||
    shift.task_type ||
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
    shift.customer_billable !== undefined ||
    shift.counts_toward_required_staffing !== undefined ||
    shift.internship_practice_trainer_personnel_id ||
    shift.internship_mentor_personnel_id ||
    shift.internship_one_to_one_guidance_confirmed !== undefined ||
    shift.internship_uniform_label_confirmed !== undefined ||
    hasObjectValues(shift.service_context)
  );
}

function shouldEnforceContractResolution({ body, workSchedule }) {
  if (body.enforce_contract_resolution === true) return true;
  if (body.record_payroll_run === true) return true;
  if (
    body.contract_id ||
    body.company_id ||
    body.operating_company_id ||
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

function collectScheduleTaskIds(workSchedule, body = {}) {
  const ids = [];
  addUnique(ids, body?.task_id);
  addUnique(ids, body?.service_context?.task_id);
  for (const shift of workSchedule || []) {
    addUnique(ids, shift?.task_id);
    addUnique(ids, shift?.service_context?.task_id);
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

async function collectReferencedExternalCaoSignals(base44, workSchedule, body = {}) {
  const signals = [];
  for (const taskId of collectScheduleTaskIds(workSchedule, body)) {
    try {
      const task = await base44.asServiceRole.entities.Task.get(taskId);
      addExternalCaoSignal(signals, eventHospitalityCaoSignal(`task:${taskId}`, task || {}));
    } catch { /* taakcontext is optioneel */ }
  }
  for (const objectId of collectScheduleObjectIds(workSchedule, body)) {
    try {
      const object = await base44.asServiceRole.entities.SurveillanceObject.get(objectId);
      addExternalCaoSignal(signals, eventHospitalityCaoSignal(`object:${objectId}`, object || {}));
    } catch { /* objectcontext is optioneel */ }
  }
  return signals;
}

function collectWorkScheduleDates(workSchedule) {
  return [...new Set((workSchedule || [])
    .map(shift => isoDate(shift?.date || shift?.service_date))
    .filter(Boolean))]
    .sort();
}

function resolvePayrollCalculationPeriod(workSchedule, { payPeriodStart, payPeriodEnd, fallbackDate }) {
  const scheduleDates = collectWorkScheduleDates(workSchedule);
  const explicitStart = isoDate(payPeriodStart);
  const explicitEnd = isoDate(payPeriodEnd);
  const periodStart = explicitStart || scheduleDates[0] || fallbackDate || amsterdamInstantParts(new Date()).date;
  const periodEnd = explicitEnd || scheduleDates[scheduleDates.length - 1] || periodStart;
  const outOfPeriodDates = scheduleDates.filter(date =>
    (explicitStart && date < explicitStart) ||
    (explicitEnd && date > explicitEnd)
  );

  return {
    period_start: periodStart,
    period_end: periodEnd,
    schedule_dates: scheduleDates,
    explicit_pay_period_start: explicitStart,
    explicit_pay_period_end: explicitEnd,
    invalid_range: !!(periodStart && periodEnd && periodEnd < periodStart),
    out_of_period_dates: outOfPeriodDates
  };
}

function caoConfigSummary(config) {
  return {
    id: config?.id || null,
    name: config?.name || config?.version_label || null,
    cloudflare_revision: config?.cloudflare_revision || null,
    valid_from: config?.valid_from || null,
    valid_until: config?.valid_until || null
  };
}

function caoConfigOverlapsPeriod(config, periodStart, periodEnd) {
  if (!config) return false;
  if (config.valid_from && config.valid_from > periodEnd) return false;
  if (config.valid_until && config.valid_until < periodStart) return false;
  return true;
}

function caoConfigCoversPeriod(config, periodStart, periodEnd) {
  if (!config) return false;
  if (config.valid_from && config.valid_from > periodStart) return false;
  if (config.valid_until && config.valid_until < periodEnd) return false;
  return true;
}

function resolvePayrollCaoConfiguration(configs, { caoKey, periodStart, periodEnd }) {
  const eligible = (configs || [])
    .filter(config => caoConfigOverlapsPeriod(config, periodStart, periodEnd))
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));

  if (eligible.length === 0) {
    return {
      config: null,
      status: 'blocked_missing_active_cao_config',
      candidates: [],
      message: `Geen actieve CAO-configuratie gevonden voor ${caoKey} in loonperiode ${periodStart} t/m ${periodEnd}.`
    };
  }

  if (eligible.length > 1) {
    return {
      config: null,
      status: 'blocked_payroll_period_spans_multiple_cao_configs',
      candidates: eligible.map(caoConfigSummary),
      message: `Loonperiode ${periodStart} t/m ${periodEnd} raakt meerdere actieve CAO-configuraties voor ${caoKey}. Splits de loonrun per CAO-geldigheidsperiode.`
    };
  }

  const config = eligible[0];
  if (!caoConfigCoversPeriod(config, periodStart, periodEnd)) {
    return {
      config: null,
      status: 'blocked_cao_config_not_covering_payroll_period',
      candidates: [caoConfigSummary(config)],
      message: `Actieve CAO-configuratie ${config.id} dekt loonperiode ${periodStart} t/m ${periodEnd} niet volledig.`
    };
  }

  return {
    config,
    status: 'resolved',
    candidates: [caoConfigSummary(config)],
    message: null
  };
}

function buildShiftContractServiceContext({ body, shift }) {
  const bodyContext = body.service_context || {};
  const shiftContext = shift.service_context || {};
  const companyId = shift.company_id ||
    shift.operating_company_id ||
    body.company_id ||
    body.operating_company_id ||
    shiftContext.company_id ||
    shiftContext.operating_company_id ||
    bodyContext.company_id ||
    bodyContext.operating_company_id ||
    null;
  const routeId = shift.route_id || shiftContext.route_id || body.route_id || bodyContext.route_id || null;
  const taskId = shift.task_id || shiftContext.task_id || body.task_id || bodyContext.task_id || null;
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
    operating_company_id: companyId,
    route_id: routeId,
    task_id: taskId,
    object_id: objectId,
    task_type: shift.task_type ||
      shiftContext.task_type ||
      bodyContext.task_type ||
      null,
    function_type: shift.function_type ||
      shift.service_function_type ||
      shift.required_function_type ||
      shiftContext.function_type ||
      bodyContext.function_type ||
      null,
    cao_function_group: shift.cao_function_group ||
      shift.required_cao_function_group ||
      shiftContext.cao_function_group ||
      bodyContext.cao_function_group ||
      null,
    cao_function_level: shift.cao_function_level ||
      shift.required_cao_function_level ||
      shiftContext.cao_function_level ||
      bodyContext.cao_function_level ||
      null,
    security_role_status: shift.required_security_role_status ||
      shift.security_role_status ||
      shiftContext.security_role_status ||
      bodyContext.security_role_status ||
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
    customer_billable: shift.customer_billable ??
      shiftContext.customer_billable ??
      bodyContext.customer_billable ??
      null,
    counts_toward_required_staffing: shift.counts_toward_required_staffing ??
      shiftContext.counts_toward_required_staffing ??
      bodyContext.counts_toward_required_staffing ??
      null,
    internship_practice_trainer_personnel_id: shift.internship_practice_trainer_personnel_id ||
      shiftContext.internship_practice_trainer_personnel_id ||
      bodyContext.internship_practice_trainer_personnel_id ||
      null,
    internship_mentor_personnel_id: shift.internship_mentor_personnel_id ||
      shiftContext.internship_mentor_personnel_id ||
      bodyContext.internship_mentor_personnel_id ||
      null,
    internship_one_to_one_guidance_confirmed: shift.internship_one_to_one_guidance_confirmed ??
      shiftContext.internship_one_to_one_guidance_confirmed ??
      bodyContext.internship_one_to_one_guidance_confirmed ??
      null,
    internship_uniform_label_confirmed: shift.internship_uniform_label_confirmed ??
      shiftContext.internship_uniform_label_confirmed ??
      bodyContext.internship_uniform_label_confirmed ??
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
    const serviceContext = buildShiftContractServiceContext({ body, shift });
    const payload = {
      personnel_id: personnelId,
      contract_id: shift.contract_id || body.contract_id || null,
      route_id: serviceContext.route_id || null,
      task_id: serviceContext.task_id || null,
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

function collectContractResolutionCaoReferences(results) {
  return (results || [])
    .map(item => {
      const resolution = item?.contract_resolution || {};
      return {
        shift_index: item?.shift_index ?? null,
        date: item?.date || null,
        start_time: item?.start_time || null,
        end_time: item?.end_time || null,
        contract_id: resolution.contract_id || resolution.selected_contract?.id || null,
        company_id: resolution.company_id ||
          resolution.selected_contract?.company_id ||
          resolution.service_context?.company_id ||
          resolution.service_context?.operating_company_id ||
          null,
        cao_configuration_id: resolution.cao_configuration_id || null,
        cao_key: resolution.cao_key || null,
        cao_resolution_source: resolution.cao_resolution_source || null,
        candidate_configuration_ids: resolution.cao_resolution_candidate_configuration_ids || [],
        candidate_company_cao_assignment_ids: resolution.cao_resolution_candidate_company_cao_assignment_ids || []
      };
    })
    .filter(ref =>
      ref.cao_configuration_id ||
      ref.cao_key ||
      ref.company_id ||
      ref.contract_id ||
      ref.cao_resolution_source ||
      ref.candidate_configuration_ids.length > 0 ||
      ref.candidate_company_cao_assignment_ids.length > 0
    );
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value].filter(Boolean);
}

function appendUnique(target, values) {
  for (const value of normalizeArray(values)) {
    if (value && !target.includes(value)) target.push(value);
  }
}

function shouldRequirePayrollScheduleValidation({ body = {}, recordPayrollRun = false }) {
  return recordPayrollRun === true ||
    body.require_schedule_validation === true ||
    body.require_payroll_final === true ||
    body.payroll_final === true ||
    body.final_validation === true ||
    body.final_planning === true ||
    body.finalize_planning === true ||
    body.approve_planning === true ||
    body.approve_schedule === true;
}

function buildPayrollScheduleValidationGate(scheduleValidation, { required = false } = {}) {
  if (!required) {
    return {
      required: false,
      status: 'not_required_for_concept_payroll',
      planning_allowed: null,
      payroll_final_allowed: null,
      manual_review_required: false,
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: []
    };
  }

  if (!scheduleValidation) {
    return {
      required: true,
      status: 'blocked_missing_schedule_validation',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      blocking_reasons: ['Definitieve loonrun mist roosterregelvalidatie. Voer validateCaoScheduleRules uit voordat payroll-final wordt toegestaan.'],
      manual_review_reasons: [],
      warnings: []
    };
  }

  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const highSeverityViolations = normalizeArray(scheduleValidation.violations)
    .filter(item => item?.severity === 'high')
    .map(item => item.message || String(item));
  const contractViolations = normalizeArray(scheduleValidation.contract_violations)
    .map(item => item.message || String(item));

  if (scheduleValidation.planning_allowed !== true || scheduleValidation.payroll_final_allowed !== true) {
    blockingReasons.push('Roosterregelvalidatie staat payroll-final niet toe.');
  }
  appendUnique(blockingReasons, highSeverityViolations);
  appendUnique(blockingReasons, contractViolations);
  appendUnique(blockingReasons, scheduleValidation.blocking_reasons);
  appendUnique(manualReviewReasons, scheduleValidation.manual_review_reasons);
  appendUnique(warnings, scheduleValidation.warnings);
  appendUnique(warnings, scheduleValidation.calculation_warnings);
  appendUnique(warnings, normalizeArray(scheduleValidation.contract_warnings).map(item => item.message || String(item)));

  return {
    required: true,
    status: blockingReasons.length > 0
      ? 'blocked'
      : manualReviewReasons.length > 0 || scheduleValidation.manual_review_required === true
      ? 'manual_review_required'
      : 'validated',
    planning_allowed: scheduleValidation.planning_allowed === true,
    payroll_final_allowed: scheduleValidation.payroll_final_allowed === true &&
      blockingReasons.length === 0 &&
      manualReviewReasons.length === 0 &&
      scheduleValidation.manual_review_required !== true,
    manual_review_required: blockingReasons.length > 0 ||
      manualReviewReasons.length > 0 ||
      scheduleValidation.manual_review_required === true,
    blocking_reasons: [...new Set(blockingReasons)],
    manual_review_reasons: [...new Set(manualReviewReasons)],
    warnings: [...new Set(warnings)],
    calculation_status: scheduleValidation.calculation_status || scheduleValidation.status || null,
    period_start: scheduleValidation.period_start || null,
    period_end: scheduleValidation.period_end || null,
    cao_key: scheduleValidation.cao_key || null,
    cao_configuration_id: scheduleValidation.cao_configuration_id || null,
    source_rule_ids: scheduleValidation.source_rule_ids || []
  };
}

async function validatePayrollScheduleGate(base44, {
  body,
  personnelId,
  workSchedule,
  payrollPeriod,
  targetCaoKey,
  forceCaoSync,
  contractResolutionRequired,
  recordPayrollRun
}) {
  const required = shouldRequirePayrollScheduleValidation({ body, recordPayrollRun });
  if (!required) {
    return {
      gate: buildPayrollScheduleValidationGate(null, { required: false }),
      schedule_validation: null
    };
  }

  try {
    const res = await base44.asServiceRole.functions.invoke('validateCaoScheduleRules', {
      ...body,
      personnel_id: personnelId,
      cao_key: targetCaoKey,
      shifts: workSchedule,
      period_start: payrollPeriod.period_start,
      period_end: payrollPeriod.period_end,
      force_cao_sync: !!forceCaoSync,
      enforce_contract_resolution: contractResolutionRequired === true,
      enforce_task_planning_context: true,
      require_payroll_final: true,
      payroll_final: true,
      record_payroll_run: recordPayrollRun === true
    });
    const scheduleValidation = res?.data || res || null;
    return {
      gate: buildPayrollScheduleValidationGate(scheduleValidation, { required: true }),
      schedule_validation: scheduleValidation
    };
  } catch (error) {
    const scheduleValidation = {
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_schedule_validation_error',
      blocking_reasons: [`Roosterregelvalidatie fout: ${error.message || String(error)}`]
    };
    return {
      gate: buildPayrollScheduleValidationGate(scheduleValidation, { required: true }),
      schedule_validation: scheduleValidation
    };
  }
}

function collectPayrollRunRouteIds(workSchedule, body = {}) {
  const ids = [];
  addUnique(ids, body.route_id);
  addUnique(ids, body.service_context?.route_id);
  for (const shift of workSchedule || []) {
    addUnique(ids, shift?.route_id);
    addUnique(ids, shift?.service_context?.route_id);
  }
  return ids;
}

function collectPayrollRunCompanyIds({ body = {}, workSchedule = [], contractReferences = [] }) {
  const ids = [];
  for (const ref of contractReferences || []) addUnique(ids, ref.company_id);
  addUnique(ids, body.company_id);
  addUnique(ids, body.operating_company_id);
  addUnique(ids, body.service_context?.company_id);
  addUnique(ids, body.service_context?.operating_company_id);
  for (const shift of workSchedule || []) {
    addUnique(ids, shift?.company_id);
    addUnique(ids, shift?.operating_company_id);
    addUnique(ids, shift?.service_context?.company_id);
    addUnique(ids, shift?.service_context?.operating_company_id);
  }
  return ids;
}

function collectPayrollRunContractIds({ body = {}, contractReferences = [] }) {
  const ids = [];
  addUnique(ids, body.contract_id);
  addUnique(ids, body.service_context?.contract_id);
  for (const ref of contractReferences || []) addUnique(ids, ref.contract_id);
  return ids;
}

function buildPayrollRunContractSummary({ body = {}, workSchedule = [], contractResolutionResults = [] }) {
  const contractReferences = collectContractResolutionCaoReferences(contractResolutionResults);
  const routeIds = collectPayrollRunRouteIds(workSchedule, body);
  const companyIds = collectPayrollRunCompanyIds({ body, workSchedule, contractReferences });
  const contractIds = collectPayrollRunContractIds({ body, contractReferences });
  const caoKeys = [...new Set(contractReferences.map(ref => ref.cao_key).filter(Boolean))];
  const caoConfigurationIds = [...new Set(contractReferences.map(ref => ref.cao_configuration_id).filter(Boolean))];
  const resultCount = (contractResolutionResults || []).length;
  const payrollFinalCount = (contractResolutionResults || [])
    .filter(item => item?.contract_resolution?.payroll_final_allowed === true)
    .length;
  const blockedCount = (contractResolutionResults || [])
    .filter(contractResolutionBlocksPayroll)
    .length;

  return {
    route_id: routeIds.length === 1 ? routeIds[0] : null,
    route_ids: routeIds,
    company_id: companyIds.length === 1 ? companyIds[0] : null,
    company_ids: companyIds,
    contract_ids: contractIds,
    contract_resolution_summary: {
      contract_resolution_required: resultCount > 0,
      contract_resolution_count: resultCount,
      payroll_final_contract_resolution_count: payrollFinalCount,
      blocked_contract_resolution_count: blockedCount,
      route_ids: routeIds,
      company_ids: companyIds,
      contract_ids: contractIds,
      cao_keys: caoKeys,
      cao_configuration_ids: caoConfigurationIds,
      mixed_routes: routeIds.length > 1,
      mixed_companies: companyIds.length > 1,
      mixed_contracts: contractIds.length > 1,
      mixed_cao_keys: caoKeys.length > 1,
      mixed_cao_configurations: caoConfigurationIds.length > 1,
      references: contractReferences
    }
  };
}

function normalizeCorrectionAdjustments(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isOpenCaoPayrollCorrection(correction) {
  return ['queued', 'candidate', 'manual_review_required'].includes(correction?.status) &&
    !correction?.applied_payroll_run_id;
}

function firstCorrectionDeltaNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return 0;
}

function extractCaoCorrectionDeltaAmounts(delta = {}) {
  const grossDelta = firstCorrectionDeltaNumber(
    delta.total_gross_delta,
    delta.gross_delta,
    delta.gross_pay_delta,
    delta.bruto_delta,
    delta.bruto_loon_delta
  );
  const employeeDeductionsDelta = firstCorrectionDeltaNumber(
    delta.employee_deductions_delta,
    delta.employee_deductions_total_delta,
    delta.inhoudingen_delta
  );
  const employerCostsDelta = firstCorrectionDeltaNumber(
    delta.employer_costs_delta,
    delta.employer_costs_total_delta,
    delta.werkgeverslasten_delta
  );
  const vacationAllowanceDelta = firstCorrectionDeltaNumber(
    delta.vacation_allowance_delta,
    delta.vakantiegeld_delta
  );
  const yearEndBonusDelta = firstCorrectionDeltaNumber(
    delta.year_end_bonus_delta,
    delta.eindejaarsuitkering_delta
  );
  const netSalaryDelta = firstCorrectionDeltaNumber(
    delta.net_salary_delta,
    delta.net_delta,
    delta.netto_delta,
    delta.netto_loon_delta
  );
  const totalCostEmployerDelta = firstCorrectionDeltaNumber(
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
  const [personnelCorrections, caoCorrections] = await Promise.all([
    base44.asServiceRole.entities.CAOPayrollCorrection.filter({
      personnel_id: personnelId,
      cao_key: caoKey
    }).catch(() => []),
    base44.asServiceRole.entities.CAOPayrollCorrection.filter({
      cao_key: caoKey
    }).catch(() => [])
  ]);
  const correctionsById = new Map();
  for (const correction of [...(personnelCorrections || []), ...(caoCorrections || [])]) {
    if (!correction?.id) continue;
    const isPersonnelCorrection = correction.personnel_id === personnelId;
    const isGlobalUnscopedCorrection = !correction.personnel_id && !correction.affected_payroll_run_id;
    if (isPersonnelCorrection || isGlobalUnscopedCorrection) {
      correctionsById.set(correction.id, correction);
    }
  }
  return [...correctionsById.values()]
    .filter(isOpenCaoPayrollCorrection)
    .sort((a, b) => String(a.effective_from || '').localeCompare(String(b.effective_from || '')) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function buildCaoCorrectionApplication(corrections, adjustments, shouldApply) {
  const openCorrections = corrections || [];
  const manualReviewCorrections = openCorrections.filter(correction =>
    correction.status === 'manual_review_required'
  );
  const globalUnscopedCorrections = openCorrections.filter(correction =>
    !correction.personnel_id && !correction.affected_payroll_run_id
  );
  const autoApplicableCorrections = openCorrections.filter(correction =>
    correction.status !== 'manual_review_required'
  );
  const missingAdjustmentIds = shouldApply
    ? autoApplicableCorrections
      .filter(correction => !adjustments[correction.id]?.delta_snapshot)
      .map(correction => correction.id)
    : [];
  const missingPayrollAmountIds = shouldApply
    ? autoApplicableCorrections
      .filter(correction => {
        const delta = adjustments[correction.id]?.delta_snapshot;
        return delta && !extractCaoCorrectionDeltaAmounts(delta).has_known_payroll_amount;
      })
      .map(correction => correction.id)
    : [];
  return {
    open_correction_count: openCorrections.length,
    has_open_corrections: openCorrections.length > 0,
    manual_review_required_correction_ids: manualReviewCorrections.map(correction => correction.id),
    has_unresolved_manual_review_corrections: manualReviewCorrections.length > 0,
    global_unscoped_correction_ids: globalUnscopedCorrections.map(correction => correction.id),
    has_global_unscoped_corrections: globalUnscopedCorrections.length > 0,
    apply_requested: shouldApply === true,
    ready_to_apply: openCorrections.length === 0 ||
      (
        shouldApply === true &&
        manualReviewCorrections.length === 0 &&
        missingAdjustmentIds.length === 0 &&
        missingPayrollAmountIds.length === 0
      ),
    missing_adjustment_ids: missingAdjustmentIds,
    missing_payroll_amount_ids: missingPayrollAmountIds,
    correction_ids: openCorrections.map(correction => correction.id),
    auto_applicable_correction_ids: autoApplicableCorrections.map(correction => correction.id),
    review_ids: [...new Set(openCorrections.map(correction => correction.cao_change_review_id).filter(Boolean))],
    affected_payroll_run_ids: [...new Set(openCorrections.map(correction => correction.affected_payroll_run_id).filter(Boolean))],
    corrections: openCorrections.map(correction => ({
      id: correction.id,
      status: correction.status,
      personnel_id: correction.personnel_id || null,
      cao_change_review_id: correction.cao_change_review_id || null,
      affected_payroll_run_id: correction.affected_payroll_run_id || null,
      rule_key: correction.rule_key || null,
      field_path: correction.field_path || null,
      effective_from: correction.effective_from || null,
      effective_until: correction.effective_until || null,
      affected_overlap_start: correction.affected_overlap_start || null,
      affected_overlap_end: correction.affected_overlap_end || null,
      affected_overlap_days: correction.affected_overlap_days ?? null,
      correction_match_type: correction.correction_match_type || null,
      correction_match_evidence: correction.correction_match_evidence || null,
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
      affected_overlap_start: correction.affected_overlap_start || null,
      affected_overlap_end: correction.affected_overlap_end || null,
      affected_overlap_days: correction.affected_overlap_days ?? null,
      correction_match_type: correction.correction_match_type || null,
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
    await markAffectedPayrollRunCorrectionApplied(base44, {
      correction,
      correctionPayrollRunId: payrollRun.id
    });
    appliedCorrectionIds.push(correction.id);
  }
  return appliedCorrectionIds;
}

async function markAffectedPayrollRunCorrectionApplied(base44, { correction, correctionPayrollRunId }) {
  if (!correction?.affected_payroll_run_id || !correctionPayrollRunId) return null;
  const affectedRun = await base44.asServiceRole.entities.PayrollCalculationRun
    .get(correction.affected_payroll_run_id)
    .catch(() => null);
  if (!affectedRun) return null;

  const existingReasonIds = Array.isArray(affectedRun.cao_recalculation_reason_ids)
    ? affectedRun.cao_recalculation_reason_ids
    : [];
  const remainingReasonIds = existingReasonIds.filter(id => id !== correction.cao_change_review_id);
  const correctedByIds = [
    ...new Set([
      ...(Array.isArray(affectedRun.corrected_by_payroll_run_ids) ? affectedRun.corrected_by_payroll_run_ids : []),
      correctionPayrollRunId
    ])
  ];
  const finalizedStatuses = ['approved', 'exported', 'paid', 'corrected'];
  const updates = {
    corrected_by_payroll_run_ids: correctedByIds,
    cao_correction_applied_at: new Date().toISOString(),
    cao_recalculation_reason_ids: remainingReasonIds,
    requires_cao_recalculation: remainingReasonIds.length > 0
  };
  if (remainingReasonIds.length === 0 && finalizedStatuses.includes(affectedRun.payroll_run_status || 'calculated')) {
    updates.payroll_run_status = 'corrected';
  }
  await base44.asServiceRole.entities.PayrollCalculationRun.update(affectedRun.id, updates);
  return {
    affected_payroll_run_id: affectedRun.id,
    corrected_by_payroll_run_ids: correctedByIds,
    remaining_cao_recalculation_reason_ids: remainingReasonIds,
    payroll_run_status: updates.payroll_run_status || affectedRun.payroll_run_status || null
  };
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

    // Bepaal referentieperiode op basis van expliciete loonperiode of alle diensten.
    const firstShiftDate = isoDate(work_schedule[0]?.date || work_schedule[0]?.service_date) || amsterdamInstantParts(new Date()).date;
    const payrollPeriod = resolvePayrollCalculationPeriod(work_schedule, {
      payPeriodStart: pay_period_start,
      payPeriodEnd: pay_period_end,
      fallbackDate: firstShiftDate
    });
    const refDate = new Date(`${payrollPeriod.period_start}T00:00:00`);
    if (payrollPeriod.invalid_range) {
      return Response.json({
        error: `Definitieve loonberekening geblokkeerd: pay_period_end (${payrollPeriod.period_end}) ligt voor pay_period_start (${payrollPeriod.period_start}).`,
        personnel_id,
        pay_period_start: payrollPeriod.period_start,
        pay_period_end: payrollPeriod.period_end,
        work_schedule_dates: payrollPeriod.schedule_dates,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_invalid_payroll_period'
      }, { status: 400 });
    }
    if (payrollPeriod.out_of_period_dates.length > 0) {
      return Response.json({
        error: 'Definitieve loonberekening geblokkeerd: work_schedule bevat diensten buiten de opgegeven loonperiode.',
        personnel_id,
        pay_period_start: payrollPeriod.period_start,
        pay_period_end: payrollPeriod.period_end,
        work_schedule_dates: payrollPeriod.schedule_dates,
        out_of_period_dates: payrollPeriod.out_of_period_dates,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_work_schedule_outside_pay_period'
      }, { status: 400 });
    }
    const objectCaoKeys = await collectObjectCaoKeys(base44, work_schedule, body);
    const objectCaoKey = objectCaoKeys[0] || null;
    const externalCaoSignals = [
      ...collectInlineExternalCaoSignals(work_schedule, body),
      ...await collectReferencedExternalCaoSignals(base44, work_schedule, body)
    ];
    const inferredExternalCaoKeys = [...new Set(externalCaoSignals.map(signal => signal.cao_key).filter(Boolean))];
    const inferredExternalCaoKey = inferredExternalCaoKeys.length === 1 ? inferredExternalCaoKeys[0] : null;
    const contractResolutionRequired = shouldEnforceContractResolution({ body, workSchedule: work_schedule });
    let contractResolutionResults = [];
    const calculationWarnings = [];
    let targetCaoKey = body.cao_key ||
      service_context?.cao_key ||
      firstScheduleCaoKey(work_schedule) ||
      objectCaoKey ||
      inferredExternalCaoKey ||
      null;

    if (!targetCaoKey && contractResolutionRequired) {
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
          error: 'Definitieve loonberekening geblokkeerd: cao_key kan niet uit contracten worden afgeleid omdat niet alle diensten een geldige contract-/bedrijf-/CAO-koppeling hebben.',
          calculation_warnings: [
            'Payroll geblokkeerd: geef expliciet cao_key mee of herstel contract/bedrijf/functie-koppelingen voordat deze loonrun definitief mag zijn.'
          ],
          personnel_id,
          pay_period_start: payrollPeriod.period_start,
          pay_period_end: payrollPeriod.period_end,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          blocked_contract_resolution_count: blockedContractResolutions.length,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_contract_resolution_before_cao_selection'
        }, { status: 400 });
      }

      const contractResolutionCaoReferences = collectContractResolutionCaoReferences(contractResolutionResults);
      const resolvedCaoKeys = [...new Set(contractResolutionCaoReferences
        .map(ref => ref.cao_key)
        .filter(Boolean))];

      if (resolvedCaoKeys.length !== 1) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: cao_key kan niet eenduidig uit contractresolutie worden afgeleid.',
          calculation_warnings: [
            'Payroll mag niet standaard naar CAO PB vallen. Geef cao_key expliciet mee of splits/herstel de contracten zodat elke dienst dezelfde cao_key bewijst.'
          ],
          personnel_id,
          pay_period_start: payrollPeriod.period_start,
          pay_period_end: payrollPeriod.period_end,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          contract_resolution_cao_references: contractResolutionCaoReferences,
          resolved_cao_keys: resolvedCaoKeys,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: resolvedCaoKeys.length > 1
            ? 'blocked_mixed_contract_cao_keys_before_cao_selection'
            : 'blocked_missing_contract_cao_key_before_cao_selection'
        }, { status: 400 });
      }

      targetCaoKey = resolvedCaoKeys[0];
      calculationWarnings.push(`Payroll cao_key ${targetCaoKey} is afgeleid uit contractresolutie; geen PB-default toegepast.`);
    }

    if (!targetCaoKey) {
      return Response.json({
        error: 'Definitieve loonberekening geblokkeerd: cao_key ontbreekt.',
        calculation_warnings: [
          'Geef cao_key mee op loonrun/dienst/object of zorg dat contractresolutie verplicht is en exact één cao_key oplevert.'
        ],
        personnel_id,
        pay_period_start: payrollPeriod.period_start,
        pay_period_end: payrollPeriod.period_end,
        schedule_cao_keys: collectScheduleCaoKeys(work_schedule),
        object_cao_keys: objectCaoKeys,
        external_cao_signals: externalCaoSignals,
        contract_resolution_required: contractResolutionRequired,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_missing_cao_key'
      }, { status: 400 });
    }

    const externalCaoScopeGate = buildExternalCaoScopeGate({
      targetCaoKey,
      signals: externalCaoSignals
    });
    if (!externalCaoScopeGate.passed) {
      return Response.json({
        error: externalCaoScopeGate.message,
        calculation_warnings: [
          'Payroll geblokkeerd: bepaal expliciet de juiste cao_key voordat deze loonrun definitief mag zijn.'
        ],
        personnel_id,
        cao_key: targetCaoKey,
        schedule_cao_keys: collectScheduleCaoKeys(work_schedule),
        object_cao_keys: objectCaoKeys,
        external_cao_scope_gate: externalCaoScopeGate,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: externalCaoScopeGate.status
      }, { status: 400 });
    }

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
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          cao_key: targetCaoKey
        });
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

    // Haal ACTIEVE CAO op basis van cao_key + volledige loonperiode (niet op created_date).
    // Zonder cao_key-filter kan een PB-loonrun per ongeluk een andere actieve CAO pakken.
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
      status: 'active',
      cao_key: targetCaoKey
    });
    const caoConfigResolution = resolvePayrollCaoConfiguration(allCaos, {
      caoKey: targetCaoKey,
      periodStart: payrollPeriod.period_start,
      periodEnd: payrollPeriod.period_end
    });

    if (!caoConfigResolution.config) {
      return Response.json({
        error: caoConfigResolution.message,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...calculationWarnings,
          caoConfigResolution.message
        ],
        personnel_id,
        pay_period_start: payrollPeriod.period_start,
        pay_period_end: payrollPeriod.period_end,
        work_schedule_dates: payrollPeriod.schedule_dates,
        cao_key: targetCaoKey,
        active_cao_configuration_candidates: caoConfigResolution.candidates,
        cao_runtime_support: getCaoRuntimeSupport(targetCaoKey, 'calculatePersonnelCosts'),
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: caoConfigResolution.status
      }, { status: 400 });
    }

    const caoConfig = caoConfigResolution.config;
    const payrollCaoParameters = resolvePayrollCaoParameters(caoConfig);

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

    const payrollScheduleValidationResult = await validatePayrollScheduleGate(base44, {
      body,
      personnelId: personnel_id,
      workSchedule: work_schedule,
      payrollPeriod,
      targetCaoKey: caoConfig.cao_key || targetCaoKey,
      forceCaoSync: false,
      contractResolutionRequired,
      recordPayrollRun: record_payroll_run === true
    });
    const payrollScheduleValidationGate = payrollScheduleValidationResult.gate;
    const payrollScheduleValidation = payrollScheduleValidationResult.schedule_validation;
    calculationWarnings.push(...(payrollScheduleValidationGate.warnings || []));
    if (payrollScheduleValidationGate.required && payrollScheduleValidationGate.payroll_final_allowed !== true) {
      return Response.json({
        error: 'Definitieve loonrun geblokkeerd: roosterregelvalidatie is niet payroll-final toegestaan.',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...calculationWarnings,
          'Payroll-final vereist een geslaagde validateCaoScheduleRules-controle over de volledige loon-/roosterperiode.'
        ],
        personnel_id,
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_valid_from: caoConfig.valid_from,
        cao_payroll_readiness: payrollReadiness,
        cao_runtime_support: payrollRuntimeSupport,
        payroll_schedule_validation_gate: payrollScheduleValidationGate,
        payroll_schedule_validation: payrollScheduleValidation,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: payrollScheduleValidationGate.status === 'manual_review_required'
          ? 'blocked_schedule_manual_review'
          : 'blocked_schedule_validation'
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
      if (caoCorrectionApplication.has_unresolved_manual_review_corrections) {
        return Response.json({
          error: 'Definitieve loonrun geblokkeerd: er staan CAO-correcties met handmatige review open.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Los manual_review_required CAO-correcties eerst op via beheerder/Codex voordat payroll definitief mag worden vastgelegd.'
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
          calculation_status: 'blocked_manual_review_cao_corrections'
        }, { status: 400 });
      }
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

    let callAgreementContractMix = buildCallAgreementContractMix(contractResolutionResults);
    if (contractResolutionRequired) {
      if (contractResolutionResults.length === 0) {
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
      }
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

      const contractResolutionCaoReferences = collectContractResolutionCaoReferences(contractResolutionResults);
      const resolvedCaoConfigurationIds = [...new Set(contractResolutionCaoReferences
        .map(ref => ref.cao_configuration_id)
        .filter(Boolean))];
      const resolvedCaoKeys = [...new Set(contractResolutionCaoReferences
        .map(ref => ref.cao_key)
        .filter(Boolean))];
      const expectedCaoKey = caoConfig.cao_key || targetCaoKey;

      if (resolvedCaoConfigurationIds.length > 1) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: diensten binnen deze loonrun resolven naar meerdere CAO-configuraties.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Splits de loonrun per CAO-configuratie. Een loonrun mag geen verschillende CAO-revisies of geldigheidsperioden mengen.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_key: expectedCaoKey,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          contract_resolution_cao_references: contractResolutionCaoReferences,
          resolved_cao_configuration_ids: resolvedCaoConfigurationIds,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_mixed_contract_cao_configurations'
        }, { status: 400 });
      }

      if (resolvedCaoConfigurationIds.length === 1 && caoConfig.id && resolvedCaoConfigurationIds[0] !== caoConfig.id) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: contractresolver en loonrun gebruiken niet dezelfde CAO-configuratie.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            `Payroll selecteerde ${caoConfig.id}, maar contractresolutie selecteerde ${resolvedCaoConfigurationIds[0]}.`
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_key: expectedCaoKey,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          contract_resolution_cao_references: contractResolutionCaoReferences,
          resolved_cao_configuration_ids: resolvedCaoConfigurationIds,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_contract_cao_configuration_mismatch'
        }, { status: 400 });
      }

      if (resolvedCaoKeys.length > 1 || (resolvedCaoKeys.length === 1 && expectedCaoKey && resolvedCaoKeys[0] !== expectedCaoKey)) {
        return Response.json({
          error: 'Definitieve loonberekening geblokkeerd: contractresolver en loonrun gebruiken niet dezelfde cao_key.',
          cao_sync_status: caoSyncStatus,
          calculation_warnings: [
            ...calculationWarnings,
            'Splits de loonrun per cao_key of herstel de contract-/dienstcontext voordat definitieve payroll wordt vastgelegd.'
          ],
          personnel_id,
          cao_configuration_id: caoConfig.id,
          cao_key: expectedCaoKey,
          cao_version_label: caoConfig.version_label || caoConfig.name,
          cao_valid_from: caoConfig.valid_from,
          cao_payroll_readiness: payrollReadiness,
          contract_resolution_required: true,
          contract_resolution_results: contractResolutionResults,
          contract_resolution_cao_references: contractResolutionCaoReferences,
          resolved_cao_keys: resolvedCaoKeys,
          manual_review_required: true,
          payroll_final_allowed: false,
          calculation_status: 'blocked_contract_cao_key_mismatch'
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
      income_structure_phase_out_allowance: {
        applies: false,
        amount: 0,
        duration_pay_periods: null,
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
        rate_per_shift: payrollCaoParameters.value_services_early_shift_amount,
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
      schiphol_allowances: {
        object_allowance: {
          hours: 0,
          rate: 2.5,
          amount: 0,
          included_in_base_salary: true,
          details: [],
          source_rule_ids: []
        },
        early_start_allowance: {
          hours: 0,
          percentage: 35,
          amount: 0,
          details: [],
          source_rule_ids: []
        },
        historical_summer_allowance_2022: {
          hours: 0,
          rate: 5.25,
          amount: 0,
          details: [],
          excluded_from_vacation_pension_year_end_and_ort_basis: true,
          source_rule_ids: []
        },
        historical_labor_market_allowance_2022_2023: {
          hours: 0,
          rate: 1.4,
          amount: 0,
          details: [],
          excluded_from_vacation_pension_year_end_and_ort_basis: true,
          source_rule_ids: []
        },
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
      is_call_worker: isCallWorker,
      payroll_wage_allowance_policy: null,
      training_education_policy: null,
      older_worker_arrangements: null,
      pension_calculation: null
    };

    // ── Bepaal loonbasis via CAO-scope + functieclassificatie ──
    const wageBasis = await resolveLoondienstWageBasis({
      base44,
      personnel_id,
      personnel,
      caoScope,
      contractResolutionResults
    });
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
    const trainingEducationPolicy = resolveCaoTrainingEducationPolicy({
      body,
      workSchedule: work_schedule
    });
    payslip.training_education_policy = trainingEducationPolicy;
    for (const item of trainingEducationPolicy.manual_review_items || []) {
      payrollRuntimeReviewItems.push(item);
    }
    if (trainingEducationPolicy.manual_review_required) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
    }
    const payrollWageAllowancePolicy = resolvePayrollWageAllowancePolicy({
      body,
      personnel,
      caoConfig,
      payrollPeriod,
      baseHourlyRate,
      isCallWorker,
      caoScope,
      contractResolutionResults,
      functionClassificationResult
    });
    payslip.payroll_wage_allowance_policy = payrollWageAllowancePolicy;
    payslip.income_structure_phase_out_allowance = {
      applies: payrollWageAllowancePolicy.article_46_income_structure_phase_out.applies,
      amount: payrollWageAllowancePolicy.article_46_income_structure_phase_out.current_phase_out_amount_per_period || 0,
      duration_pay_periods: payrollWageAllowancePolicy.article_46_income_structure_phase_out.duration_pay_periods,
      source_rule_ids: payrollWageAllowancePolicy.article_46_income_structure_phase_out.source_rule_ids
    };
    for (const item of payrollWageAllowancePolicy.manual_review_items || []) {
      payrollRuntimeReviewItems.push(item);
    }
    if (payrollWageAllowancePolicy.manual_review_required) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
    }
    if (caoCorrectionApplication.has_unresolved_manual_review_corrections) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = 'blocked_manual_review_cao_corrections';
      calculationWarnings.push('Open CAO-correcties met handmatige review gevonden; deze berekening is niet payroll-final totdat beheerder/Codex deze heeft opgelost.');
      payrollRuntimeReviewItems.push({
        rule_id: 'cao_payroll_corrections',
        domain: 'retroactive_cao_corrections',
        message: 'Manual-review CAO-correcties blokkeren definitieve payroll.',
        correction_ids: caoCorrectionApplication.manual_review_required_correction_ids,
        global_unscoped_correction_ids: caoCorrectionApplication.global_unscoped_correction_ids
      });
    } else if (caoCorrectionApplication.has_open_corrections && !applyQueuedCaoCorrections) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = 'blocked_pending_cao_corrections';
      calculationWarnings.push('Open retroactieve CAO-correcties gevonden; deze berekening is niet payroll-final totdat correcties met delta-bewijs zijn verwerkt.');
      payrollRuntimeReviewItems.push({
        rule_id: 'cao_payroll_corrections',
        domain: 'retroactive_cao_corrections',
        message: 'Open retroactieve CAO-correcties moeten in de loonrun worden verwerkt.',
        correction_ids: caoCorrectionApplication.correction_ids
      });
    } else if (caoCorrectionApplication.has_open_corrections && applyQueuedCaoCorrections && !caoCorrectionApplication.ready_to_apply) {
      runtimePayrollFinalAllowed = false;
      runtimeCalculationStatus = 'blocked_missing_cao_correction_adjustments';
      calculationWarnings.push('Open retroactieve CAO-correcties zijn niet volledig voorzien van financiële delta-bewijzen.');
      payrollRuntimeReviewItems.push({
        rule_id: 'cao_payroll_corrections',
        domain: 'retroactive_cao_corrections',
        message: 'Niet alle CAO-correcties hebben een bruikbare delta_snapshot met herkenbare bedragvelden.',
        correction_ids: caoCorrectionApplication.correction_ids,
        missing_adjustment_ids: caoCorrectionApplication.missing_adjustment_ids,
        missing_payroll_amount_ids: caoCorrectionApplication.missing_payroll_amount_ids
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
          if (isCallWorker && surchargeType === 'holiday') {
            surchargePercentage = payrollWageAllowancePolicy.article_40_41_special_hours_and_holiday_surcharges.holidays.applied_holiday_percentage;
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

        const valueServicesEarlyShiftAllowance = resolveValueServicesEarlyShiftAllowance(shift, caoScope, payrollCaoParameters);
        if (valueServicesEarlyShiftAllowance.applies) {
          payslip.value_services_early_shift_allowance.shift_count += 1;
          payslip.value_services_early_shift_allowance.amount += valueServicesEarlyShiftAllowance.amount;
          payslip.value_services_early_shift_allowance.details.push({
            date,
            start_time,
            amount: valueServicesEarlyShiftAllowance.amount,
            rate_per_shift: valueServicesEarlyShiftAllowance.rate_per_shift,
            tax_treatment: valueServicesEarlyShiftAllowance.tax_treatment,
            source_rule_ids: valueServicesEarlyShiftAllowance.source_rule_ids,
            parameter_provenance: valueServicesEarlyShiftAllowance.parameter_provenance
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

        const schipholShiftAllowances = resolveSchipholShiftPayrollComponents({
          shift,
          body,
          caoScope,
          shiftInterval,
          hoursWorked,
          baseHourlyRate
        });
        if (schipholShiftAllowances.applies) {
          if (schipholShiftAllowances.manual_review_required) {
            for (const item of schipholShiftAllowances.manual_review_items || []) payrollRuntimeReviewItems.push(item);
            runtimePayrollFinalAllowed = false;
            runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
          }
          const objectAllowance = schipholShiftAllowances.object_allowance;
          if (objectAllowance.amount > 0) {
            payslip.base_salary += objectAllowance.amount;
            payslip.schiphol_allowances.object_allowance.hours += objectAllowance.hours;
            payslip.schiphol_allowances.object_allowance.amount += objectAllowance.amount;
            payslip.schiphol_allowances.object_allowance.details.push({
              date,
              hours: r2(objectAllowance.hours),
              rate: objectAllowance.rate,
              amount: r2(objectAllowance.amount)
            });
            payslip.schiphol_allowances.object_allowance.source_rule_ids = [
              ...new Set([
                ...payslip.schiphol_allowances.object_allowance.source_rule_ids,
                ...(objectAllowance.source_rule_ids || [])
              ])
            ];
          }
          const earlyStartAllowance = schipholShiftAllowances.early_start_allowance;
          if (earlyStartAllowance.amount > 0) {
            payslip.schiphol_allowances.early_start_allowance.hours += earlyStartAllowance.hours;
            payslip.schiphol_allowances.early_start_allowance.amount += earlyStartAllowance.amount;
            payslip.schiphol_allowances.early_start_allowance.details.push({
              date,
              hours: r2(earlyStartAllowance.hours),
              percentage: earlyStartAllowance.percentage,
              base_rate_including_object_allowance: earlyStartAllowance.base_rate_including_object_allowance,
              amount: r2(earlyStartAllowance.amount)
            });
            payslip.schiphol_allowances.early_start_allowance.source_rule_ids = [
              ...new Set([
                ...payslip.schiphol_allowances.early_start_allowance.source_rule_ids,
                ...(earlyStartAllowance.source_rule_ids || [])
              ])
            ];
          }
          for (const [key, component] of [
            ['historical_summer_allowance_2022', schipholShiftAllowances.historical_summer_allowance_2022],
            ['historical_labor_market_allowance_2022_2023', schipholShiftAllowances.historical_labor_market_allowance_2022_2023]
          ]) {
            if (!component?.amount) continue;
            payslip.schiphol_allowances[key].hours += component.hours;
            payslip.schiphol_allowances[key].amount += component.amount;
            payslip.schiphol_allowances[key].details.push({
              date,
              hours: r2(component.hours),
              rate: component.rate,
              amount: r2(component.amount)
            });
            payslip.schiphol_allowances[key].source_rule_ids = [
              ...new Set([
                ...payslip.schiphol_allowances[key].source_rule_ids,
                ...(component.source_rule_ids || [])
              ])
            ];
          }
          payslip.schiphol_allowances.source_rule_ids = [
            ...new Set([
              ...payslip.schiphol_allowances.source_rule_ids,
              ...(schipholShiftAllowances.source_rule_ids || [])
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
          },
          schiphol_allowances: schipholShiftAllowances
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
        payslip.surcharges.new_years_eve_100.amount +
        payslip.schiphol_allowances.early_start_allowance.amount;
      const overtimeAmount = payslip.overtime_50.amount;
      const minimumServiceAmount = payslip.minimum_service_compensation.amount;
      const actingFunctionAllowanceAmount = payslip.acting_function_allowance.amount;
      const shiftChangeAllowanceAmount = payslip.shift_change_allowance.amount;
      const incomeStructurePhaseOutAllowanceAmount = payslip.income_structure_phase_out_allowance.amount;
      const generalReserveAllowanceAmount = payslip.general_reserve_allowance.amount;
      const valueServicesEarlyShiftAllowanceAmount = payslip.value_services_early_shift_allowance.amount;
      const cashValueLateNextDayNoticeAllowanceAmount = payslip.cash_value_late_next_day_notice_allowance.amount;
      const schipholHistoricalAllowanceAmount =
        payslip.schiphol_allowances.historical_summer_allowance_2022.amount +
        payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.amount;
      if (isCallWorker) {
        const callWorkerVacationPayout = calculateCallWorkerVacationPayoutArticle59({
          baseWageAmount: payslip.base_salary,
          minimumServiceAmount,
          baseHourlyRate,
          paidBaseHours: totalHours + payslip.minimum_service_compensation.top_up_hours,
          vacationPayoutPercentage: payrollCaoParameters.call_worker_vacation_payout_percentage,
          maxHoursPerPayPeriod: payrollCaoParameters.call_worker_vacation_max_hours_per_period,
          parameterProvenance: {
            vacation_payout_percentage: payrollCaoParameters.provenance.call_worker_vacation_payout_percentage,
            max_hours_per_pay_period: payrollCaoParameters.provenance.call_worker_vacation_max_hours_per_period
          }
        });
        payslip.vacation_pay_call_worker_article_59 = callWorkerVacationPayout;
        payslip.vacation_hours_call_worker = callWorkerVacationPayout.amount;
        if (callWorkerVacationPayout.manual_review_required) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R1016',
            domain: 'call_worker_vacation_payout',
            message: `Vakantiedagenuitbetaling oproepkracht is afgetopt op ${payrollCaoParameters.call_worker_vacation_max_hours_per_period} uur, maar de basisuurloon-context ontbreekt voor definitieve cap-berekening.`,
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
        const baseForAllowances = payslip.base_salary + minimumServiceAmount + incomeStructurePhaseOutAllowanceAmount + totalSurcharges;

        payslip.accruals.vacation_allowance = baseForAllowances * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = yearEndBonusBasisAmount * ((caoConfig.year_end_bonus || 2.01) / 100);
        payslip.vacation_paid = 0;
        
        // Voor oproepkrachten wordt dit direct uitbetaald, niet gereserveerd
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + payslip.vacation_hours_call_worker + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + incomeStructurePhaseOutAllowanceAmount + generalReserveAllowanceAmount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount + schipholHistoricalAllowanceAmount + payslip.accruals.vacation_allowance + payslip.accruals.year_end_bonus + payslip.vacation_paid;
      } else {
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + incomeStructurePhaseOutAllowanceAmount + generalReserveAllowanceAmount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount + schipholHistoricalAllowanceAmount;
      }
      
      const olderWorkerArrangements = {
        eighty_ninety_hundred: buildEightyNinetyHundredArrangement({
          personnel,
          body,
          contractResolutionResults,
          referenceDate: payrollPeriod.period_start,
          payrollCaoParameters
        })
      };
      payslip.older_worker_arrangements = olderWorkerArrangements;
      for (const item of olderWorkerArrangements.eighty_ninety_hundred.manual_review_items || []) {
        payrollRuntimeReviewItems.push(item);
      }
      for (const reason of olderWorkerArrangements.eighty_ninety_hundred.blocking_reasons || []) {
        payrollRuntimeReviewItems.push({
          rule_id: 'CAO-PB-2024-R1214',
          domain: 'eighty_ninety_hundred',
          message: reason,
          manual_review_required: true
        });
      }
      if (olderWorkerArrangements.eighty_ninety_hundred.manual_review_required) {
        runtimePayrollFinalAllowed = false;
        runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
      }

      const pensionParameters = payrollCaoParameters.pension;
      const fundParameters = payrollCaoParameters.funds;
      const eightyNinetyHundredPensionBase = numberOrNull(
        olderWorkerArrangements.eighty_ninety_hundred.pension_base_override_amount_per_period
      );

      // Bereken pensioengrondslag. Bij actieve 80-90-100 blijft de pensioenopbouw 100% op de oude grondslag.
      const pensionBaseAmount = eightyNinetyHundredPensionBase !== null
        ? eightyNinetyHundredPensionBase
        : isCallWorker
        ? (payslip.base_salary + totalSurcharges + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount)
        : payslip.total_gross;
      
      // Franchise op jaarbasis, hier naar periode omrekenen (4-wekelijks = 13 periodes)
      const franchiseThisPeriod = pensionParameters.franchiseAnnual / pensionParameters.payPeriodsPerYear;
      let pensionBase = Math.max(0, pensionBaseAmount - franchiseThisPeriod);
      
      // Voor lage inkomens: zorg dat er altijd minimaal pensioen wordt opgebouwd
      // Als pensioengrondslag te laag is, neem een minimale basis aan
      if (pensionBase > 0 && pensionBase < 100) {
        pensionBase = Math.max(pensionBase, pensionBaseAmount * 0.1); // minimaal 10% van het loon
      }
      
      payslip.pension_base = pensionBase;
      
      // Werknemersbijdragen - basis is altijd bruto loon exclusief vakantiegeld/eindejaarsuitkering voor oproepkrachten
      const basisForPremiums = isCallWorker ? (payslip.base_salary + payslip.vacation_hours_call_worker + totalSurcharges + incomeStructurePhaseOutAllowanceAmount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount) : Math.max(0, payslip.total_gross - schipholHistoricalAllowanceAmount);
      
      payslip.employee_deductions.premium_sfpb = basisForPremiums * (fundParameters.sfpbEmployeePercentage / 100);
      payslip.employee_deductions.premium_paww = basisForPremiums * (fundParameters.pawwEmployeePercentage / 100);
      
      // Pensioenpremie werknemer (40% van totaal)
      const totalPensionPremium = pensionBase * (pensionParameters.premiumRateTotalPercentage / 100);
      payslip.employee_deductions.pension_premium = totalPensionPremium * (pensionParameters.employeeSharePercentage / 100);
      
      payslip.employee_deductions.premium_wga = basisForPremiums * (fundParameters.wgaEmployeePercentage / 100);
      payslip.pension_calculation = {
        pensionable_wage_amount_per_period: r2(pensionBaseAmount),
        pension_base_override_applied: eightyNinetyHundredPensionBase !== null,
        pension_base_override_reason: eightyNinetyHundredPensionBase !== null ? 'article_72_80_90_100_100_percent_pension_build_up' : null,
        franchise_per_pay_period: r2(franchiseThisPeriod),
        pension_base_after_franchise: r2(pensionBase),
        total_pension_premium: r2(totalPensionPremium),
        employee_share_percentage: pensionParameters.employeeSharePercentage,
        employer_share_percentage: pensionParameters.employerSharePercentage,
        premium_rate_total_percentage: pensionParameters.premiumRateTotalPercentage,
        parameter_provenance: {
          pension_franchise_annual: payrollCaoParameters.provenance.pension_franchise_annual,
          pension_premium_rate_total: payrollCaoParameters.provenance.pension_premium_rate_total,
          pension_employee_share_percentage: payrollCaoParameters.provenance.pension_employee_share_percentage,
          pension_employer_share_percentage: payrollCaoParameters.provenance.pension_employer_share_percentage,
          premium_sfpb_employee_percentage: payrollCaoParameters.provenance.premium_sfpb_employee_percentage,
          premium_paww_employee_percentage: payrollCaoParameters.provenance.premium_paww_employee_percentage
        },
        source_rule_ids: [
          ...(pensionParameters.source_rule_ids || []),
          ...(olderWorkerArrangements.eighty_ninety_hundred.active ? ['CAO-PB-2024-R1232', 'CAO-PB-2024-R1233'] : [])
        ]
      };
      
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
          referenceDate: payrollPeriod.period_start
        });
        const vacationEntitlement = calculateVacationEntitlementForPayPeriod({
          paidHoursPerPayPeriod: paidHoursForVacationAccrual,
          vacationServiceContext,
          caoScopeProfile: caoScope?.cao_scope_profile || null,
          payrollCaoParameters
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
      payslip.employer_costs.pension_premium = totalPensionPremium * (pensionParameters.employerSharePercentage / 100);
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

    if (applyQueuedCaoCorrections && caoCorrectionApplication.has_open_corrections && caoCorrectionApplication.ready_to_apply) {
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

    const selectedPayrollContract = selectedContractsFromResolutionResults(contractResolutionResults)[0] || {};
    const payslipTemplateCompliance = buildCaoPayslipTemplateCompliance({
      body,
      personnel,
      selectedContract: selectedPayrollContract,
      payslip,
      totalHours,
      baseHourlyRate,
      payrollPeriod,
      caoConfig,
      functionClassificationResult
    });

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
      payroll_schedule_validation_gate: payrollScheduleValidationGate,
      payroll_schedule_validation: payrollScheduleValidation,
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
      cao_payroll_parameters: payrollCaoParameters,
      payroll_wage_allowance_policy: payrollWageAllowancePolicy,
      training_education_policy: trainingEducationPolicy,
      pay_period_year: pay_period_year || refDate.getFullYear(),
      pay_period_number: pay_period_number || null,
      pay_period_start: payrollPeriod.period_start,
      pay_period_end: payrollPeriod.period_end,
      work_schedule_dates: payrollPeriod.schedule_dates,
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
          parameter_provenance: payslip.vacation_pay_call_worker_article_59.parameter_provenance,
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
        income_structure_phase_out_allowance: {
          applies: payslip.income_structure_phase_out_allowance.applies,
          amount: r2(payslip.income_structure_phase_out_allowance.amount),
          duration_pay_periods: payslip.income_structure_phase_out_allowance.duration_pay_periods,
          source_rule_ids: payslip.income_structure_phase_out_allowance.source_rule_ids
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
          parameter_provenance: {
            value_services_early_shift_amount: payrollCaoParameters.provenance.value_services_early_shift_amount
          },
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
        schiphol_allowances: {
          object_allowance: {
            hours: r2(payslip.schiphol_allowances.object_allowance.hours),
            rate: payslip.schiphol_allowances.object_allowance.rate,
            amount: r2(payslip.schiphol_allowances.object_allowance.amount),
            included_in_base_salary: true,
            details: payslip.schiphol_allowances.object_allowance.details.map(item => ({
              ...item,
              hours: r2(item.hours),
              amount: r2(item.amount)
            })),
            source_rule_ids: payslip.schiphol_allowances.object_allowance.source_rule_ids
          },
          early_start_allowance: {
            hours: r2(payslip.schiphol_allowances.early_start_allowance.hours),
            percentage: payslip.schiphol_allowances.early_start_allowance.percentage,
            amount: r2(payslip.schiphol_allowances.early_start_allowance.amount),
            details: payslip.schiphol_allowances.early_start_allowance.details.map(item => ({
              ...item,
              hours: r2(item.hours),
              amount: r2(item.amount)
            })),
            source_rule_ids: payslip.schiphol_allowances.early_start_allowance.source_rule_ids
          },
          historical_summer_allowance_2022: {
            hours: r2(payslip.schiphol_allowances.historical_summer_allowance_2022.hours),
            rate: payslip.schiphol_allowances.historical_summer_allowance_2022.rate,
            amount: r2(payslip.schiphol_allowances.historical_summer_allowance_2022.amount),
            excluded_from_vacation_pension_year_end_and_ort_basis: true,
            details: payslip.schiphol_allowances.historical_summer_allowance_2022.details.map(item => ({
              ...item,
              hours: r2(item.hours),
              amount: r2(item.amount)
            })),
            source_rule_ids: payslip.schiphol_allowances.historical_summer_allowance_2022.source_rule_ids
          },
          historical_labor_market_allowance_2022_2023: {
            hours: r2(payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.hours),
            rate: payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.rate,
            amount: r2(payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.amount),
            excluded_from_vacation_pension_year_end_and_ort_basis: true,
            details: payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.details.map(item => ({
              ...item,
              hours: r2(item.hours),
              amount: r2(item.amount)
            })),
            source_rule_ids: payslip.schiphol_allowances.historical_labor_market_allowance_2022_2023.source_rule_ids
          },
          source_rule_ids: payslip.schiphol_allowances.source_rule_ids
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
        pension_calculation: payslip.pension_calculation,
        payroll_wage_allowance_policy: payslip.payroll_wage_allowance_policy,
        training_education_policy: payslip.training_education_policy,
        older_worker_arrangements: payslip.older_worker_arrangements,
        payslip_template_compliance: payslipTemplateCompliance,
        
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
    const payrollRunContractSummary = buildPayrollRunContractSummary({
      body: {
        ...body,
        contract_id,
        company_id,
        route_id,
        task_id,
        object_id,
        service_context
      },
      workSchedule: work_schedule,
      contractResolutionResults
    });
    responsePayload.payroll_run_contract_summary = payrollRunContractSummary;

    if (record_payroll_run === true) {
      if (responsePayload.payroll_final_allowed !== true) {
        return Response.json({
          error: 'Definitieve loonrun geblokkeerd: berekening is niet payroll-final en mag niet als PayrollCalculationRun worden vastgelegd.',
          calculation: responsePayload
        }, { status: 400 });
      }
      if (!responsePayload.pay_period_number) {
        return Response.json({
          error: 'pay_period_number is verplicht als record_payroll_run=true.',
          calculation: responsePayload
        }, { status: 400 });
      }
      const run = await base44.asServiceRole.entities.PayrollCalculationRun.create({
        personnel_id,
        route_id: payrollRunContractSummary.route_id,
        route_ids: payrollRunContractSummary.route_ids,
        company_id: payrollRunContractSummary.company_id,
        company_ids: payrollRunContractSummary.company_ids,
        contract_ids: payrollRunContractSummary.contract_ids,
        contract_resolution_summary: payrollRunContractSummary.contract_resolution_summary,
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
        corrected_by_payroll_run_ids: [],
        cao_correction_applied_at: null,
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
          payroll_run_contract_summary: payrollRunContractSummary,
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

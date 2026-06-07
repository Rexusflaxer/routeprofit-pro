import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
      ? `Runtime ${functionName} mist cao_key. Routekosten voor payrollbasis zijn geblokkeerd zodat geen PB-default wordt toegepast.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Routekosten voor payrollbasis zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
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
      message: 'Route/dienst lijkt evenementen-/horecabeveiliging, maar event_hospitality_cao_applies is niet expliciet bevestigd.'
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

function collectRouteExternalCaoSignals(route = {}, serviceSources = {}) {
  const signals = [];
  addExternalCaoSignal(signals, eventHospitalityCaoSignal('route', route || {}));
  addExternalCaoSignal(signals, eventHospitalityCaoSignal('route.service_context', route?.service_context || {}));
  const objectById = serviceSources?.objectById || {};
  for (const task of serviceSources?.tasks || []) {
    addExternalCaoSignal(signals, eventHospitalityCaoSignal(`task:${task.id || 'unknown'}`, task || {}));
    const object = task?.object_id ? objectById[task.object_id] : null;
    addExternalCaoSignal(signals, eventHospitalityCaoSignal(`object:${task.object_id || 'unknown'}`, object || {}));
  }
  return signals;
}

function collectRouteExplicitCaoKeys(route = {}, serviceSources = {}) {
  const keys = [];
  keys.push(route?.cao_key, route?.cao);
  const objectById = serviceSources?.objectById || {};
  for (const task of serviceSources?.tasks || []) {
    const object = task?.object_id ? objectById[task.object_id] : null;
    keys.push(task?.cao_key, task?.cao, object?.cao_key, object?.cao);
  }
  return uniqueNonEmpty(keys);
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
      message: 'Routekosten geblokkeerd: een of meer routes/taken lijken onder een andere CAO te vallen, maar de cao_key is niet expliciet bevestigd.',
      signals: activeSignals,
      inferred_cao_keys: inferredKeys,
      suggested_cao_keys: suggestedKeys
    };
  }

  if (inferredKeys.length > 1) {
    return {
      passed: false,
      status: 'blocked_mixed_external_cao_scope',
      message: 'Routekosten geblokkeerd: route/taken wijzen naar meerdere externe CAO-scope signalen. Splits de routekostencontrole per CAO.',
      signals: activeSignals,
      inferred_cao_keys: inferredKeys
    };
  }

  if (inferredKeys.length === 1 && targetCaoKey && inferredKeys[0] !== targetCaoKey) {
    return {
      passed: false,
      status: 'blocked_cao_scope_signal_mismatch',
      message: `Routekosten geblokkeerd: route-/taakcontext wijst naar ${inferredKeys[0]}, maar routekosten zouden ${targetCaoKey} gebruiken.`,
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
      trigger_source: 'lazy_route_cost_calculation',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

function isHoliday(dateStr, caoConfig) {
  const holidays = (caoConfig && caoConfig.holidays) ? caoConfig.holidays : [];
  return holidays.some(h => h.date === dateStr);
}

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

function formatterParts(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}

function amsterdamInstantParts(date) {
  const parts = formatterParts(AMSTERDAM_DATE_TIME_FORMATTER, date);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date: dateStr,
    hour: Number(parts.hour),
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
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)).toISOString().slice(0, 10);
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

function buildCaoShiftInterval(dateStr, startTime, endTime, equalEndMeansNextDay = true) {
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

function wallClockHoursForTimes(startTime, endTime, equalEndMeansNextDay = true) {
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

function getSurchargeType(datetime, caoConfig) {
  const parts = amsterdamInstantParts(new Date(datetime));
  const dayOfWeek = parts.day_of_week;
  const hours = parts.hour;
  const dateStr = parts.date;
  if (dateStr.endsWith('-12-31') && hours >= 16) return { type: 'new_years_eve', percentage: caoConfig.surcharge_new_years_eve_after_16 || 100 };
  if (isHoliday(dateStr, caoConfig)) return { type: 'holiday', percentage: caoConfig.surcharge_holiday || 50 };
  if (dayOfWeek === 0 || dayOfWeek === 6) return { type: 'weekend', percentage: caoConfig.surcharge_weekend || 35 };
  if (hours >= 0 && hours < 7) return { type: 'night', percentage: caoConfig.surcharge_night || 20 };
  if (hours >= 18) return { type: 'evening', percentage: caoConfig.surcharge_evening || 10 };
  return { type: 'day', percentage: 0 };
}

function getNextDateForWeekday(routeWeekday) {
  const jsDay = routeWeekday === 7 ? 0 : routeWeekday;
  const todayIso = amsterdamInstantParts(new Date()).date;
  const currentDay = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  let daysUntil = jsDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  return addDaysIso(todayIso, daysUntil);
}

function r2(n) { return Math.round(n * 100) / 100; }
function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function uniqueNonEmpty(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}
function uniqueBooleanValues(values) {
  return [...new Set((values || []).filter(value => value === true || value === false))];
}
function singleValueOrConflict(values, fieldLabel, blockingReasons) {
  const unique = uniqueNonEmpty(values);
  if (unique.length > 1) {
    blockingReasons.push(`Route bevat meerdere waarden voor ${fieldLabel}: ${unique.join(', ')}. Splits de route of valideer per taaksegment.`);
    return null;
  }
  return unique[0] ?? null;
}
function singleBooleanOrConflict(values, fieldLabel, blockingReasons) {
  const unique = uniqueBooleanValues(values);
  if (unique.length > 1) {
    blockingReasons.push(`Route bevat zowel true als false voor ${fieldLabel}. Splits de route of valideer per taaksegment.`);
    return null;
  }
  return unique.length === 1 ? unique[0] : null;
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
function isCallWorkerForRouteCost(personnel, contractResolution) {
  return isCallAgreementContext(personnel) ||
    isCallAgreementContext(contractResolution?.selected_contract) ||
    isCallAgreementContext(contractResolution?.contract);
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
function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
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
function buildVacationServiceContext(personnel, contractResolution, referenceDate) {
  const selectedContract = contractResolution?.selected_contract || {};
  const explicitYears = pickFirstNonEmpty(
    selectedContract.vacation_service_years,
    selectedContract.continuous_service_years,
    selectedContract.security_industry_service_years_for_vacation,
    personnel.vacation_service_years,
    personnel.continuous_service_years,
    personnel.security_industry_service_years_for_vacation
  );
  const startDate = pickFirstNonEmpty(
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

function resolveValueServicesEarlyShiftAllowance({ date, startTime, shift = null, caoScope }) {
  const serviceContext = shift?.service_context || {};
  const appliesScope = caoScope?.cao_scope_profile === 'cash_value_logistics' ||
    shift?.works_cash_value_logistics === true ||
    serviceContext.works_cash_value_logistics === true;
  const clock = parseClockParts(startTime || shift?.start_time);
  const applies = appliesScope && clock && clock.total_minutes >= 120 && clock.total_minutes < 240;
  return {
    applies: !!applies,
    date,
    start_time: startTime || shift?.start_time || null,
    amount: applies ? 7.50 : 0,
    rate_per_shift: 7.50,
    tax_treatment: 'bruto',
    source_rule_ids: applies ? ['CAO-PB-2024-R1609'] : [],
    note: applies ? 'Geld- en waardelogistiek vroege dienst 02:00-04:00: EUR 7,50 bruto per dienst.' : null
  };
}

function resolveCashValueLateNextDayNoticeAllowance({ date, shift = null, caoScope, hoursWorked, baseHourlyRate }) {
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
    shift?.cash_value_next_day_force_majeure_ict_failure === true ||
    shift?.next_day_service_force_majeure_ict_failure === true ||
    shift?.force_majeure_ict_failure === true ||
    shift?.ict_failure_force_majeure === true
  ) {
    result.source_rule_ids.push('CAO-PB-2024-R1618');
    return result;
  }

  const serviceDate = isoDate(shift?.date || shift?.service_date || shift?.shift_date || date);
  const explicitNextDayService = shift?.cash_value_next_day_service === true ||
    shift?.value_services_next_day_service === true ||
    shift?.next_day_service === true ||
    shift?.next_day_service_notice_required === true;
  const noticeAt = pickFirstNonEmpty(
    shift?.cash_value_next_day_service_notice_at,
    shift?.value_services_next_day_notice_at,
    shift?.next_day_service_notice_at,
    shift?.cash_value_service_communicated_at,
    shift?.service_communicated_at,
    shift?.communicated_at,
    shift?.planned_service_notified_at,
    shift?.shift_notified_at,
    shift?.notified_at
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

function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(m) {
  const total = ((m % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
function getAbsoluteEndMinutes(startMinutes, endTime) {
  let endMinutes = timeToMinutes(endTime);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes;
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
          message: 'CAOConfiguration mist rule_registry_fingerprint; definitieve route-payrollbasis is niet audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

/**
 * Scope-aware shift cost berekening.
 * @param {object} personnel - Personeelsrecord
 * @param {string} date - Datum (YYYY-MM-DD)
 * @param {string} startTime - Starttijd (HH:MM)
 * @param {string} endTime - Eindtijd (HH:MM)
 * @param {object} caoConfig - Actieve CAO-configuratie
 * @param {object|null} caoScope - Resultaat van resolveCaoApplicability (of null als onbekend)
 */
// Normaliseer CAO-scope: null = fail-closed (unknown_manual_review)
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

function resolveShiftWageBasis(personnel, caoScope, classification) {
  if (personnel.employee_type === 'zzp') {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'zzp_rate',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: 'final',
      warnings: []
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
        error: `Geen uurloon gevonden voor medewerker ${personnel.name} (geen CAO en geen custom_hourly_rate).`
      };
    }
    return {
      base_hourly_rate: customRate,
      wage_basis_type: 'custom_hourly_rate',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: 'final',
      warnings: []
    };
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
        error: 'Loonbasis ontbreekt voor niet-beveiligingspersoneel: custom_hourly_rate ontbreekt. Bijlage 2 loonschaal is niet van toepassing.'
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
      ]
    };
  }

  const classificationOk = classification?.classification_status === 'resolved' &&
    classification?.payroll_final_allowed === true &&
    classification?.scale_valid_for_classification === true &&
    classification?.period_valid_for_scale === true &&
    classification?.wage_rate_found === true &&
    Number(classification?.hourly_rate || 0) > 0;

  if (!classificationOk) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_manual_review',
      warnings: classification?.warnings || [],
      error: `Functie-indeling/loonschaal niet definitief gevalideerd voor ${personnel.name}.`
    };
  }

  return {
    base_hourly_rate: Number(classification.hourly_rate),
    wage_basis_type: 'cao_appendix_2_scale',
    appendix_2_applies: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    calculation_status: 'final',
    warnings: classification.warnings || []
  };
}

function calculateShiftHours(date, startTime, endTime) {
  const interval = buildCaoShiftInterval(date, startTime, endTime, true);
  if (!interval) return 0;
  return (interval.end - interval.start) / (1000 * 60 * 60);
}

function getRouteDstCalculationInfo(dateStr, startTime, endTime, actualHours) {
  const startClock = parseClockParts(startTime);
  const endClock = parseClockParts(endTime);
  const endDate = startClock && endClock && (endClock.total_minutes < startClock.total_minutes || endClock.total_minutes === startClock.total_minutes)
    ? addDaysIso(dateStr, 1)
    : dateStr;
  const wallClockHours = wallClockHoursForTimes(startTime, endTime, true);
  const startIssue = amsterdamLocalTimeIssue(dateStr, startTime);
  const endIssue = endDate ? amsterdamLocalTimeIssue(endDate, endTime) : null;
  const delta = wallClockHours === null ? 0 : r2(actualHours - wallClockHours);
  if (!delta && !startIssue && !endIssue) return null;
  return {
    date: dateStr,
    start_time: startTime,
    end_time: endTime,
    end_date: endDate,
    actual_hours: r2(actualHours),
    wall_clock_hours: wallClockHours === null ? null : r2(wallClockHours),
    dst_delta_hours: delta,
    transition_type: delta > 0 ? 'winter_time_extra_hour' : delta < 0 ? 'summer_time_missing_hour' : 'ambiguous_or_nonexistent_local_time',
    manual_review_required: !!startIssue || !!endIssue,
    start_time_issue: startIssue,
    end_time_issue: endIssue,
    source_rule_ids: ['CAO-PB-2024-R0712', 'CAO-PB-2024-R0713']
  };
}

function routeAssignedTaskIds(route) {
  return uniqueNonEmpty((route?.assigned_tasks || []).map(item => item?.task_id));
}

async function loadRouteServiceSources(base44, route) {
  const taskIds = routeAssignedTaskIds(route);
  const taskResults = await Promise.all(taskIds.map(async taskId => {
    try {
      return await base44.asServiceRole.entities.Task.get(taskId);
    } catch {
      return null;
    }
  }));
  const tasks = taskResults.filter(Boolean);
  const missing_task_ids = taskIds.filter(taskId => !tasks.some(task => task.id === taskId));
  const objectIds = uniqueNonEmpty(tasks.map(task => task.object_id));
  const objectResults = await Promise.all(objectIds.map(async objectId => {
    try {
      return await base44.asServiceRole.entities.SurveillanceObject.get(objectId);
    } catch {
      return null;
    }
  }));
  const objectById = {};
  for (const object of objectResults.filter(Boolean)) objectById[object.id] = object;
  const missing_object_ids = objectIds.filter(objectId => !objectById[objectId]);
  return { task_ids: taskIds, tasks, objectById, missing_task_ids, missing_object_ids };
}

function buildRouteServiceRequirement({ route, serviceSources, targetCaoKey }) {
  const tasks = serviceSources?.tasks || [];
  const objectById = serviceSources?.objectById || {};
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];

  if ((serviceSources?.missing_task_ids || []).length > 0) {
    blockingReasons.push(`Route verwijst naar ontbrekende taken: ${serviceSources.missing_task_ids.join(', ')}.`);
  }
  if ((serviceSources?.missing_object_ids || []).length > 0) {
    manualReviewReasons.push(`Niet alle objectdefaults konden worden geladen: ${serviceSources.missing_object_ids.join(', ')}.`);
  }
  if (tasks.length === 0) {
    manualReviewReasons.push('Route heeft geen geladen taken; dienstfunctie en CAO-context kunnen niet audit-proof uit route/object worden afgeleid.');
  }

  const entries = tasks.map(task => {
    const object = objectById[task.object_id] || {};
    return {
      task,
      object,
      task_type: task.task_type || null,
      cao_key: task.cao_key || object.cao_key || null,
      function_type: task.service_function_type || object.default_service_function_type || null,
      cao_function_group: task.required_cao_function_group || object.default_cao_function_group || null,
      cao_function_level: task.required_cao_function_level || object.default_cao_function_level || null,
      security_role_status: task.required_security_role_status || object.default_security_role_status || null,
      performs_security_work: task.performs_security_work ?? object.default_performs_security_work ?? null,
      security_work_percentage: task.security_work_percentage ?? object.default_security_work_percentage ?? null,
      works_event_or_hospitality_security: task.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? null,
      event_hospitality_cao_applies: task.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? null,
      works_airport_schiphol: task.works_airport_schiphol ?? object.default_works_airport_schiphol ?? null,
      works_cash_value_logistics: task.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? null,
      customer_billable: task.customer_billable ?? object.default_customer_billable ?? null,
      counts_toward_required_staffing: task.counts_toward_required_staffing ?? object.default_counts_toward_required_staffing ?? null,
      operating_company_id: task.operating_company_id || object.default_operating_company_id || object.operating_company_id || null,
      contract_assignment_policy: task.contract_assignment_policy || object.contract_assignment_policy || null
    };
  });

  const taskTypeValues = uniqueNonEmpty(entries.map(entry => entry.task_type));
  if (taskTypeValues.length > 1) {
    manualReviewReasons.push(`Route bevat meerdere taaktypes (${taskTypeValues.join(', ')}); definitieve planning moet per taak controleren of het contract alle taaktypes toestaat.`);
  }

  const serviceContext = {
    cao_key: singleValueOrConflict([
      route.cao_key,
      route.cao,
      targetCaoKey,
      ...entries.map(entry => entry.cao_key)
    ], 'cao_key', blockingReasons) || targetCaoKey || null,
    cao: route.cao || null,
    task_type: taskTypeValues.length === 1 ? taskTypeValues[0] : null,
    function_type: singleValueOrConflict(entries.map(entry => entry.function_type), 'dienstfunctie/functietype', blockingReasons),
    cao_function_group: singleValueOrConflict(entries.map(entry => entry.cao_function_group), 'CAO-functiegroep', blockingReasons),
    cao_function_level: singleValueOrConflict(entries.map(entry => entry.cao_function_level), 'CAO-functieniveau', blockingReasons),
    security_role_status: singleValueOrConflict(entries.map(entry => entry.security_role_status), 'beveiligingsstatus', blockingReasons),
    performs_security_work: singleBooleanOrConflict(entries.map(entry => entry.performs_security_work), 'performs_security_work', blockingReasons),
    works_event_or_hospitality_security: singleBooleanOrConflict(entries.map(entry => entry.works_event_or_hospitality_security), 'works_event_or_hospitality_security', blockingReasons),
    event_hospitality_cao_applies: singleBooleanOrConflict(entries.map(entry => entry.event_hospitality_cao_applies), 'event_hospitality_cao_applies', blockingReasons),
    works_airport_schiphol: singleBooleanOrConflict(entries.map(entry => entry.works_airport_schiphol), 'works_airport_schiphol', blockingReasons),
    works_cash_value_logistics: singleBooleanOrConflict(entries.map(entry => entry.works_cash_value_logistics), 'works_cash_value_logistics', blockingReasons),
    customer_billable: singleBooleanOrConflict(entries.map(entry => entry.customer_billable), 'customer_billable', blockingReasons),
    counts_toward_required_staffing: singleBooleanOrConflict(entries.map(entry => entry.counts_toward_required_staffing), 'counts_toward_required_staffing', blockingReasons),
    operating_company_id: singleValueOrConflict([
      route.operating_company_id,
      ...entries.map(entry => entry.operating_company_id)
    ], 'operating_company_id', blockingReasons) || null,
    contract_assignment_policy: singleValueOrConflict(entries.map(entry => entry.contract_assignment_policy), 'contract_assignment_policy', blockingReasons) || 'strict_contract_match'
  };
  serviceContext.company_id = serviceContext.operating_company_id;

  const securityWorkPercentages = uniqueNonEmpty(entries.map(entry => entry.security_work_percentage));
  if (securityWorkPercentages.length > 1) {
    blockingReasons.push(`Route bevat meerdere percentages beveiligingswerk (${securityWorkPercentages.join(', ')}). Splits de route of valideer per taaksegment.`);
  } else if (securityWorkPercentages.length === 1) {
    serviceContext.security_work_percentage = securityWorkPercentages[0];
  }

  const hasExplicitServiceFunctionContext = !!(
    serviceContext.function_type ||
    serviceContext.cao_function_group ||
    serviceContext.cao_function_level ||
    serviceContext.security_role_status ||
    serviceContext.performs_security_work !== null ||
    serviceContext.works_cash_value_logistics !== null ||
    serviceContext.works_airport_schiphol !== null ||
    serviceContext.works_event_or_hospitality_security !== null
  );
  if (!hasExplicitServiceFunctionContext) {
    manualReviewReasons.push('Route mist expliciete dienstfunctie/CAO-scope op taak of object; payroll-final is geblokkeerd totdat de gevraagde functie vastligt.');
  }

  if (serviceContext.event_hospitality_cao_applies === true && serviceContext.cao_key === CAO_PB_KEY) {
    blockingReasons.push('Dienstcontext geeft evenementen-/horecabeveiligings-CAO aan, maar cao_key staat nog op CAO PB.');
  }

  return {
    service_context: serviceContext,
    task_ids: serviceSources?.task_ids || [],
    task_count: tasks.length,
    object_ids: uniqueNonEmpty(tasks.map(task => task.object_id)),
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons,
    warnings,
    manual_review_required: manualReviewReasons.length > 0 || blockingReasons.length > 0,
    payroll_final_allowed: blockingReasons.length === 0 && manualReviewReasons.length === 0
  };
}

function applyRouteServiceRequirementReview(contractResolution, routeServiceRequirement) {
  const blockingReasons = routeServiceRequirement?.blocking_reasons || [];
  const manualReviewReasons = routeServiceRequirement?.manual_review_reasons || [];
  if (blockingReasons.length === 0 && manualReviewReasons.length === 0) {
    return {
      ...(contractResolution || {}),
      route_service_requirement: routeServiceRequirement || null
    };
  }
  return {
    ...(contractResolution || {}),
    status: blockingReasons.length > 0
      ? 'blocked_route_service_context'
      : (contractResolution?.status === 'resolved' ? 'manual_review_route_service_context' : contractResolution?.status || 'manual_review_route_service_context'),
    planning_allowed: blockingReasons.length > 0 ? false : contractResolution?.planning_allowed !== false,
    payroll_final_allowed: false,
    manual_review_required: true,
    blocking_reasons: [
      ...((contractResolution && contractResolution.blocking_reasons) || []),
      ...blockingReasons
    ],
    manual_review_reasons: [
      ...((contractResolution && contractResolution.manual_review_reasons) || []),
      ...manualReviewReasons
    ],
    route_service_requirement: routeServiceRequirement || null
  };
}

async function resolveRouteContractContext(base44, personnel, route, shiftDate, routeServiceRequirement = {}, options = {}) {
  const serviceContext = routeServiceRequirement?.service_context || {};
  const operatingCompanyId = route.operating_company_id ||
    serviceContext.operating_company_id ||
    serviceContext.company_id ||
    null;
  if (!operatingCompanyId) {
    if (options.allow_legacy_companyless_route_costing === true) {
      return applyRouteServiceRequirementReview({
        status: 'legacy_companyless_route_concept_only',
        planning_allowed: true,
        payroll_final_allowed: false,
        manual_review_required: true,
        company_id: null,
        contract_id: null,
        note: 'Route heeft geen operating_company_id; legacy routekostenflow is alleen concept en nooit payroll-final.',
        manual_review_reasons: ['Koppel de route aan een uitvoerend bedrijf voordat planning/payroll definitief mag worden.']
      }, routeServiceRequirement);
    }
    return applyRouteServiceRequirementReview({
      status: 'blocked_missing_operating_company',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      company_id: null,
      contract_id: null,
      blocking_reasons: ['Route heeft geen operating_company_id; uitvoerend bedrijf is verplicht om contract en CAO-context te bepalen.']
    }, routeServiceRequirement);
  }

  try {
    const res = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
      personnel_id: personnel.id,
      route_id: route.id,
      company_id: operatingCompanyId,
      operating_company_id: operatingCompanyId,
      service_date: shiftDate,
      service_context: {
        ...serviceContext,
        company_id: serviceContext.company_id || operatingCompanyId,
        operating_company_id: serviceContext.operating_company_id || operatingCompanyId,
        cao_key: serviceContext.cao_key || route.cao_key || route.cao || null,
        cao: serviceContext.cao || route.cao || null,
        contract_assignment_policy: serviceContext.contract_assignment_policy || 'strict_contract_match'
      }
    });
    const resolution = res?.data || {
      status: 'blocked_contract_resolution_empty',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      blocking_reasons: ['Contractresolver gaf geen resultaat terug.']
    };
    return applyRouteServiceRequirementReview(resolution, routeServiceRequirement);
  } catch (error) {
    return applyRouteServiceRequirementReview({
      status: 'blocked_contract_resolution_error',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      blocking_reasons: [`Contractresolver fout: ${error.message}`]
    }, routeServiceRequirement);
  }
}

function routeContractCaoMismatch(contractResolution, caoConfig, targetCaoKey) {
  if (!contractResolution || !caoConfig) return null;
  const expectedConfigId = caoConfig.id || null;
  const expectedCaoKey = caoConfig.cao_key || targetCaoKey || null;
  const resolvedConfigId = contractResolution.cao_configuration_id || null;
  const resolvedCaoKey = contractResolution.cao_key || null;

  if (resolvedConfigId && expectedConfigId && resolvedConfigId !== expectedConfigId) {
    return {
      status: 'blocked_route_contract_cao_configuration_mismatch',
      message: `Routekosten selecteerden CAO-configuratie ${expectedConfigId}, maar contractresolutie selecteerde ${resolvedConfigId}.`,
      expected_cao_configuration_id: expectedConfigId,
      resolved_cao_configuration_id: resolvedConfigId
    };
  }

  if (resolvedCaoKey && expectedCaoKey && resolvedCaoKey !== expectedCaoKey) {
    return {
      status: 'blocked_route_contract_cao_key_mismatch',
      message: `Routekosten gebruiken cao_key ${expectedCaoKey}, maar contractresolutie gebruikt ${resolvedCaoKey}.`,
      expected_cao_key: expectedCaoKey,
      resolved_cao_key: resolvedCaoKey
    };
  }

  return null;
}

function enforceRouteContractCaoMatch(contractResolution, caoConfig, targetCaoKey) {
  const mismatch = routeContractCaoMismatch(contractResolution, caoConfig, targetCaoKey);
  if (!mismatch) return contractResolution;
  return {
    ...(contractResolution || {}),
    status: mismatch.status,
    planning_allowed: false,
    payroll_final_allowed: false,
    manual_review_required: true,
    blocking_reasons: [
      ...((contractResolution && contractResolution.blocking_reasons) || []),
      mismatch.message
    ],
    cao_configuration_mismatch: mismatch
  };
}

function collectRouteContractResolutionCaoReferences(contractResults) {
  return (contractResults || []).map(item => {
    const resolution = item?.contract_resolution || {};
    return {
      personnel_id: item?.id || null,
      contract_id: resolution.contract_id || resolution.selected_contract?.id || null,
      cao_configuration_id: resolution.cao_configuration_id || null,
      cao_key: resolution.cao_key || null,
      cao_resolution_source: resolution.cao_resolution_source || null,
      candidate_configuration_ids: resolution.cao_resolution_candidate_configuration_ids || [],
      candidate_company_cao_assignment_ids: resolution.cao_resolution_candidate_company_cao_assignment_ids || [],
      status: resolution.status || null
    };
  }).filter(ref =>
    ref.cao_configuration_id ||
    ref.cao_key ||
    ref.cao_resolution_source ||
    ref.candidate_configuration_ids.length > 0 ||
    ref.candidate_company_cao_assignment_ids.length > 0 ||
    ref.status
  );
}

function buildBlockedContractCost(personnel, date, startTime, endTime, rawScope, contractResolution) {
  const caoScope = normalizeCaoScope(rawScope);
  const totalHours = calculateShiftHours(date, startTime, endTime);
  const reasons = [
    ...(contractResolution?.blocking_reasons || []),
    ...(contractResolution?.manual_review_reasons || [])
  ];

  return {
    base_hourly_rate: null,
    total_hours: totalHours,
    base_salary: 0,
    surcharges_total: 0,
    surcharge_details: [],
    total_gross: 0,
    employer_costs_total: 0,
    employer_costs: {},
    accruals_total: 0,
    accruals: {},
    total_cost_employer: 0,
    cost_per_hour: 0,
    cao_scope_profile: caoScope?.cao_scope_profile || null,
    scope_warnings: [
      ...(caoScope?.warnings || []),
      ...reasons,
      'Route is gekoppeld aan een uitvoerend bedrijf; geldig contract is verplicht voor definitieve routekosten.'
    ],
    wage_basis_type: 'blocked_contract_resolution',
    payroll_final_allowed: false,
    manual_review_required: true,
    calculation_status: 'blocked_contract_resolution',
    cao_function_classification: null,
    contract_resolution: contractResolution || null,
    cao_rule_application: {
      cao_scope_profile: caoScope.cao_scope_profile,
      manual_review_required: true,
      source_rule_ids: caoScope.source_rule_ids || []
    }
  };
}

// Composite cache fingerprint
function buildRouteCostCacheFingerprint({ route, weekday, caoConfig, personnelList }) {
  return JSON.stringify({
    engine_version: 'cao-wage-basis-v2',
    weekday,
    cao: caoConfig.cloudflare_revision || caoConfig.id,
    route: {
      start: route.time_window_start,
      end: route.time_window_end,
      minutes: route.total_route_minutes,
      alarm: !!route.alarm_standby,
      operating_company_id: route.operating_company_id || null,
      vehicle_id: route.vehicle_id || null
    },
    personnel: personnelList
      .map(p => ({
        id: p.id,
        updated_date: p.updated_date || null,
        scope: p.cao_scope_profile || null,
        scope_resolved_at: p.cao_applicability_resolved_at || null,
        scale: p.cao_scale || null,
        period: p.cao_period || null,
        contract_type: p.contract_type || null,
        contract_form: p.contract_form || null,
        is_call_agreement: p.is_call_agreement === true,
        call_agreement_type: p.call_agreement_type || null,
        min_hours_per_week: p.min_hours_per_week ?? p.min_hours ?? null,
        max_hours_per_week: p.max_hours_per_week ?? p.max_hours ?? null,
        min_hours_per_pay_period: p.min_hours_per_pay_period ?? null,
        max_hours_per_pay_period: p.max_hours_per_pay_period ?? null,
        custom_rate: p.custom_hourly_rate || null,
        function_group: p.cao_function_group || null,
        function_level: p.cao_function_level || null,
        classification_status: p.cao_function_classification_status || null,
        scale_validation_status: p.cao_scale_validation_status || null,
        payroll_final_allowed: p.payroll_final_allowed === true,
        classification_resolved_at: p.cao_wage_rate_resolved_at || null
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
}

function calculateShiftCost(personnel, date, startTime, endTime, caoConfig, rawScope, rawClassification, contractResolution = null, shiftContext = null) {
  const caoScope = normalizeCaoScope(rawScope);
  const classification = rawClassification || null;
  const shiftInterval = buildCaoShiftInterval(date, startTime, endTime, true);
  if (!shiftInterval || Number.isNaN(shiftInterval.start.getTime()) || Number.isNaN(shiftInterval.end.getTime())) {
    return {
      base_hourly_rate: null,
      total_hours: 0,
      base_salary: 0,
      surcharges_total: 0,
      surcharge_details: [],
      total_gross: 0,
      employer_costs_total: 0,
      employer_costs: {},
      accruals_total: 0,
      accruals: {},
      total_cost_employer: 0,
      cost_per_hour: 0,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: ['Ongeldige datum of tijd in routekostenberekening.'],
      wage_basis_type: 'invalid_shift_time',
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_invalid_shift_time',
      cao_function_classification: classification,
      cao_rule_application: {
        cao_scope_profile: caoScope.cao_scope_profile,
        manual_review_required: true,
        source_rule_ids: caoScope.source_rule_ids || []
      }
    };
  }
  const startDate = shiftInterval.start;
  const endDate = shiftInterval.end;
  const totalHours = (endDate - startDate) / (1000 * 60 * 60);
  const dstCalculationInfo = getRouteDstCalculationInfo(date, startTime, endTime, totalHours);

  const profile = caoScope.payroll_rule_profile;
  const isScopeUnknown = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);
  // Fail-closed: bijzondere uren ALLEEN als expliciet true en scope niet unknown/mixed
  const applySpecialHours = !isScopeUnknown && (profile.apply_article_40_special_hours === true);
  const applyHolidays = profile.apply_article_41_holidays !== false;
  const applyOvertimeAccrual = !isScopeUnknown && (profile.apply_article_42_overtime === true);

  const scopeWarnings = [];
  if (isScopeUnknown) {
    scopeWarnings.push(`CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): handmatige review vereist. Bijzondere-urentoeslagen NIET toegepast.`);
  } else if (!applySpecialHours) {
    scopeWarnings.push(`Artikel 3 lid 2 CAO PB (${caoScope.cao_scope_profile}): avond-/nacht-/weekendtoeslagen niet toegepast.`);
  }
  if (dstCalculationInfo?.manual_review_required) {
    scopeWarnings.push('Dienst gebruikt een lokaal tijdstip in het ontbrekende of dubbele DST-uur; bevestig de werkelijke route-/diensturen.');
  }

  const caoRuleApplication = {
    cao_scope_profile: caoScope.cao_scope_profile,
    applied_article_40_special_hours: applySpecialHours,
    applied_article_41_holidays: applyHolidays,
    applied_article_42_overtime: applyOvertimeAccrual,
    applied_chapter_5_reimbursements: !isScopeUnknown && (profile.apply_chapter_5_reimbursements === true),
    manual_review_required: isScopeUnknown || caoScope.manual_review_required || dstCalculationInfo?.manual_review_required || false,
    source_rule_ids: caoScope.source_rule_ids || []
  };

  if (personnel.employee_type === 'zzp') {
    let zzpRate = personnel.zzp_hourly_rate_excl_vat || 0;
    const startSurchargeType = getSurchargeType(startDate, caoConfig).type;
    if (['holiday', 'new_years_eve'].includes(startSurchargeType) && personnel.zzp_holiday_rate) zzpRate = personnel.zzp_holiday_rate;
    else if (startSurchargeType === 'weekend' && personnel.zzp_weekend_rate) zzpRate = personnel.zzp_weekend_rate;
    else if (startSurchargeType === 'night' && personnel.zzp_night_rate) zzpRate = personnel.zzp_night_rate;
    else if (startSurchargeType === 'evening' && personnel.zzp_evening_rate) zzpRate = personnel.zzp_evening_rate;
    const costExclVat = zzpRate * totalHours;
    const vatAmount = costExclVat * 0.21;
    const totalCost = costExclVat + vatAmount;
    return {
      base_hourly_rate: zzpRate, total_hours: totalHours,
      base_salary: r2(costExclVat), surcharges_total: 0, surcharge_details: [],
      total_gross: r2(costExclVat), employer_costs_total: r2(vatAmount),
      employer_costs: { vat_21: r2(vatAmount) },
      accruals_total: 0, accruals: {},
      total_cost_employer: r2(totalCost), cost_per_hour: r2(totalHours > 0 ? totalCost / totalHours : 0),
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: scopeWarnings,
      wage_basis_type: 'zzp_rate',
      payroll_final_allowed: !dstCalculationInfo?.manual_review_required,
      manual_review_required: !!dstCalculationInfo?.manual_review_required,
      calculation_status: dstCalculationInfo?.manual_review_required ? 'concept_manual_review' : 'final',
      cao_function_classification: null,
      cao_rule_application: caoRuleApplication,
      dst_calculation_info: dstCalculationInfo
    };
  }

  const wageBasis = resolveShiftWageBasis(personnel, caoScope, classification);
  const baseHourlyRate = wageBasis.base_hourly_rate;
  if (wageBasis.error) {
    return {
      base_hourly_rate: null,
      total_hours: totalHours,
      base_salary: 0,
      surcharges_total: 0,
      surcharge_details: [],
      total_gross: 0,
      employer_costs_total: 0,
      employer_costs: {},
      accruals_total: 0,
      accruals: {},
      total_cost_employer: 0,
      cost_per_hour: 0,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: [...scopeWarnings, ...(wageBasis.warnings || []), wageBasis.error],
      wage_basis_type: wageBasis.wage_basis_type,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: wageBasis.calculation_status,
      cao_function_classification: classification,
      cao_rule_application: {
        ...caoRuleApplication,
        manual_review_required: true
      }
    };
  }

  let baseSalary = 0;
  const surchargeAmounts = { evening: 0, night: 0, weekend: 0, holiday: 0, new_years_eve: 0 };

  for (const segment of buildCaoTimeSegments(startDate, endDate)) {
    const segHours = segment.hours;
    const surchargeInfo = getSurchargeType(segment.start, caoConfig);
    let surchargeType = surchargeInfo.type;
    let surchargePercentage = surchargeInfo.percentage;

    // Scope gate: bijzondere uren (art. 40) alleen bij full-security
    if (!applySpecialHours && ['evening', 'night', 'weekend'].includes(surchargeType)) {
      surchargeType = 'day';
      surchargePercentage = 0;
    }
    // Feestdagtoeslag (art. 41): altijd als applyHolidays
    if (!applyHolidays && ['holiday', 'new_years_eve'].includes(surchargeType)) {
      surchargeType = 'day';
      surchargePercentage = 0;
    }
    // Scope onbekend: geen bijzondere uren
    if (isScopeUnknown && surchargeType !== 'day') {
      surchargeType = 'day';
      surchargePercentage = 0;
    }

    baseSalary += baseHourlyRate * segHours;
    if (surchargeType !== 'day') {
      surchargeAmounts[surchargeType] += baseHourlyRate * segHours * (surchargePercentage / 100);
    }
  }

  const surchargeLabels = {
    evening: 'Avondtoeslag 10%', night: 'Nachttoeslag 20%',
    weekend: 'Weekendtoeslag 35%', holiday: 'Feestdagtoeslag 50%', new_years_eve: 'Oudejaarsdag 100%'
  };
  const surchargeDetails = Object.entries(surchargeAmounts)
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ label: surchargeLabels[type], amount: r2(amount) }));
  const surchargesTotal = Object.values(surchargeAmounts).reduce((a, b) => a + b, 0);
  const isCallWorker = isCallWorkerForRouteCost(personnel, contractResolution);
  const valueServicesEarlyShiftAllowance = resolveValueServicesEarlyShiftAllowance({
    date,
    startTime,
    shift: shiftContext,
    caoScope
  });
  const cashValueLateNextDayNoticeAllowance = resolveCashValueLateNextDayNoticeAllowance({
    date,
    shift: shiftContext,
    caoScope,
    hoursWorked: totalHours,
    baseHourlyRate
  });
  const grossBeforeDirectPayouts = baseSalary + surchargesTotal;
  const callWorkerVacationPayout = isCallWorker
    ? calculateCallWorkerVacationPayoutArticle59({
      baseWageAmount: baseSalary,
      minimumServiceAmount: 0,
      baseHourlyRate,
      paidBaseHours: totalHours
    })
    : {
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
    };
  const vacationAllowance = grossBeforeDirectPayouts * ((caoConfig.vacation_allowance || 8) / 100);
  const yearEndBonusEligibleBaseWage = baseSalary;
  const yearEndBonusEligibleVacationAllowance = yearEndBonusEligibleBaseWage * ((caoConfig.vacation_allowance || 8) / 100);
  const yearEndBonusBasisAmount = yearEndBonusEligibleBaseWage + yearEndBonusEligibleVacationAllowance;
  const yearEndBonus = yearEndBonusBasisAmount * ((caoConfig.year_end_bonus || 2.01) / 100);
  const directCallWorkerAllowancePayouts = isCallWorker ? vacationAllowance + yearEndBonus : 0;
  const valueServicesEarlyShiftAllowanceAmount = valueServicesEarlyShiftAllowance.amount;
  const cashValueLateNextDayNoticeAllowanceAmount = cashValueLateNextDayNoticeAllowance.amount;
  const totalGross = grossBeforeDirectPayouts + callWorkerVacationPayout.amount + directCallWorkerAllowancePayouts + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount;
  const premiumBasis = isCallWorker
    ? grossBeforeDirectPayouts + callWorkerVacationPayout.amount + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount
    : totalGross;

  const franchisePerPeriod = (caoConfig.pension_base_salary_threshold || 16164) / 13;
  const pensionBaseAmount = isCallWorker ? grossBeforeDirectPayouts + valueServicesEarlyShiftAllowanceAmount + cashValueLateNextDayNoticeAllowanceAmount : totalGross;
  const pensionBase = Math.max(0, pensionBaseAmount - franchisePerPeriod);
  const totalPensionPremium = pensionBase * ((caoConfig.pension_premium_rate_total || 24.1) / 100);
  const employerPension = totalPensionPremium * ((caoConfig.pension_premium_employer || 60) / 100);
  const premiumAWF = premiumBasis * ((caoConfig.premium_awf_employer || 2.64) / 100);
  const premiumWW = premiumBasis * (((caoConfig.premium_ww_employer_fixed || 0) + (caoConfig.premium_ww_employer_variable || 1.5)) / 100);
  const premiumWIA = premiumBasis * ((caoConfig.premium_wia_employer || 0.72) / 100);
  const premiumWGA = premiumBasis * ((caoConfig.premium_wga_employer || 1.5) / 100);
  const employerCostsTotal = employerPension + premiumAWF + premiumWW + premiumWIA + premiumWGA;

  // ORT-vakantie-reservering: 0 als geen toeslagen toegepast zijn
  const avgOrtPerHour = (totalHours > 0 && surchargesTotal > 0) ? surchargesTotal / totalHours : 0;
  const vacationServiceContext = buildVacationServiceContext(personnel, contractResolution, date);
  const vacationEntitlement = calculateVacationEntitlementForPayPeriod({
    paidHoursPerPayPeriod: totalHours,
    vacationServiceContext,
    caoScopeProfile: caoScope?.cao_scope_profile || null
  });
  const ortVacationReservation = !isCallWorker && applySpecialHours
    ? vacationEntitlement.vacation_hours_accrued_per_pay_period * avgOrtPerHour
    : 0;
  const accrualsTotal = isCallWorker ? 0 : vacationAllowance + yearEndBonus + ortVacationReservation;
  const totalCostEmployer = totalGross + employerCostsTotal + accrualsTotal;
  const callWorkerManualReview = callWorkerVacationPayout.manual_review_required === true;
  if (callWorkerManualReview) {
    scopeWarnings.push('Oproepkracht-vakantiedagenuitbetaling art. 59 vereist handmatige review: 144-uurscap kon niet definitief worden berekend.');
  }
  if (!isCallWorker && vacationServiceContext.manual_review_required) {
    scopeWarnings.push('Vakantie-/ORT-verlofbasis vereist handmatige review: dienstjarencontext voor extra vakantiedagen ontbreekt.');
  }
  if (!isCallWorker && vacationEntitlement.extra_vacation_days_manual_review_required) {
    scopeWarnings.push('Geld- en waardelogistiek gebruikt afwijkende vakantie-opbouw art. 100; eventuele extra vakantiedagen uit art. 59 blijven handmatige review.');
  }
  if (cashValueLateNextDayNoticeAllowance.manual_review_required) {
    scopeWarnings.push(cashValueLateNextDayNoticeAllowance.review_reason || 'Geld- en waardelogistiek volgende-dagdienst vereist handmatige review.');
  }
  const vacationEntitlementManualReview = !isCallWorker && vacationEntitlement.manual_review_required === true;
  const cashValueLateNextDayNoticeManualReview = cashValueLateNextDayNoticeAllowance.manual_review_required === true;

  return {
    base_hourly_rate: baseHourlyRate, total_hours: totalHours,
    base_salary: r2(baseSalary), surcharges_total: r2(surchargesTotal), surcharge_details: surchargeDetails,
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
    total_gross: r2(totalGross),
    employer_costs_total: r2(employerCostsTotal),
    employer_costs: {
      pension_premium: r2(employerPension), premium_awf: r2(premiumAWF),
      premium_ww: r2(premiumWW), premium_wia: r2(premiumWIA), premium_wga: r2(premiumWGA)
    },
    accruals_total: r2(accrualsTotal),
    accruals: {
      vacation_allowance: r2(vacationAllowance),
      year_end_bonus: r2(yearEndBonus),
      year_end_bonus_basis: {
        eligible_base_wage: r2(yearEndBonusEligibleBaseWage),
        vacation_allowance_on_eligible_base_wage: r2(yearEndBonusEligibleVacationAllowance),
        eligible_amount_including_vacation_allowance: r2(yearEndBonusBasisAmount),
        excluded_special_hours_allowances: r2(surchargesTotal),
        excluded_value_services_early_shift_allowance: r2(valueServicesEarlyShiftAllowanceAmount),
        excluded_cash_value_late_next_day_notice_allowance: r2(cashValueLateNextDayNoticeAllowanceAmount),
        source_rule_ids: ['CAO-PB-2024-R0770', 'CAO-PB-2024-R0771', 'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773']
      },
      ort_vacation_reservation: r2(ortVacationReservation),
      vacation_entitlement: vacationEntitlement,
      direct_payout_total: r2(isCallWorker ? directCallWorkerAllowancePayouts : 0),
      reserved_total: r2(accrualsTotal)
    },
    vacation_pay_call_worker_article_59: callWorkerVacationPayout,
    is_call_worker: isCallWorker,
    total_cost_employer: r2(totalCostEmployer),
    cost_per_hour: r2(totalHours > 0 ? totalCostEmployer / totalHours : 0),
    cao_scope_profile: caoScope?.cao_scope_profile || null,
    scope_warnings: [...scopeWarnings, ...(wageBasis.warnings || [])],
    wage_basis_type: wageBasis.wage_basis_type,
    payroll_final_allowed: wageBasis.payroll_final_allowed && !dstCalculationInfo?.manual_review_required && !callWorkerManualReview && !vacationEntitlementManualReview && !cashValueLateNextDayNoticeManualReview,
    manual_review_required: wageBasis.manual_review_required || !!dstCalculationInfo?.manual_review_required || callWorkerManualReview || vacationEntitlementManualReview || cashValueLateNextDayNoticeManualReview,
    calculation_status: (dstCalculationInfo?.manual_review_required || callWorkerManualReview || vacationEntitlementManualReview || cashValueLateNextDayNoticeManualReview) && wageBasis.calculation_status === 'final'
      ? 'concept_manual_review'
      : wageBasis.calculation_status,
    cao_function_classification: classification,
    cao_rule_application: caoRuleApplication,
    dst_calculation_info: dstCalculationInfo
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      route_id,
      weekday,
      force_recalculate,
      force_cao_sync,
      allow_legacy_companyless_route_costing = false
    } = body;

    if (!route_id) return Response.json({ error: 'route_id is required' }, { status: 400 });

    const routes = await base44.entities.Route.list();
    const route = routes.find(r => r.id === route_id);
    if (!route) return Response.json({ error: 'Route not found' }, { status: 404 });

    const targetWeekday = weekday || route.weekdays?.[0] || 1;
    const shiftDate = getNextDateForWeekday(targetWeekday);
    const routeServiceSources = await loadRouteServiceSources(base44, route);
    const routeServiceCaoKeys = collectRouteExplicitCaoKeys(route, routeServiceSources);
    const externalCaoSignals = collectRouteExternalCaoSignals(route, routeServiceSources);
    const inferredExternalCaoKeys = [...new Set(externalCaoSignals.map(signal => signal.cao_key).filter(Boolean))];
    const inferredExternalCaoKey = inferredExternalCaoKeys.length === 1 ? inferredExternalCaoKeys[0] : null;
    const explicitRouteServiceCaoKey = routeServiceCaoKeys.length === 1 ? routeServiceCaoKeys[0] : null;

    if (routeServiceCaoKeys.length > 1 || (body.cao_key && routeServiceCaoKeys.some(key => key !== body.cao_key))) {
      return Response.json({
        error: 'Routekosten geblokkeerd: route, taken of objecten bevatten meerdere of afwijkende cao_key waarden.',
        calculation_warnings: [
          'Splits de routekostencontrole per cao_key of geef een consistente cao_key mee op route, taken en objecten.'
        ],
        route_id,
        shift_date: shiftDate,
        weekday: targetWeekday,
        requested_cao_key: body.cao_key || null,
        route_service_cao_keys: routeServiceCaoKeys,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_mixed_route_service_cao_keys'
      }, { status: 400 });
    }

    const targetCaoKey = body.cao_key ||
      explicitRouteServiceCaoKey ||
      inferredExternalCaoKey ||
      null;

    if (!targetCaoKey) {
      return Response.json({
        error: 'Routekosten geblokkeerd: cao_key ontbreekt op route, taken en objecten.',
        calculation_warnings: [
          'Routekosten mogen niet standaard naar CAO PB vallen. Leg de toepasselijke cao_key vast op route, taak of object voordat deze berekening payroll-final mag zijn.'
        ],
        route_id,
        shift_date: shiftDate,
        weekday: targetWeekday,
        route_service_cao_keys: routeServiceCaoKeys,
        external_cao_scope_gate: {
          passed: false,
          status: 'blocked_missing_cao_key',
          signals: externalCaoSignals
        },
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
          'Routekosten geblokkeerd: bepaal expliciet de juiste cao_key op route, taak of object voordat deze berekening payroll-final mag zijn.'
        ],
        route_id,
        shift_date: shiftDate,
        weekday: targetWeekday,
        cao_key: targetCaoKey,
        route_cao_key: route.cao_key || route.cao || null,
        route_service_cao_keys: routeServiceCaoKeys,
        external_cao_scope_gate: externalCaoScopeGate,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: externalCaoScopeGate.status
      }, { status: 400 });
    }

    const syncResult = await lazySyncCao(base44, !!force_cao_sync, targetCaoKey);
    const syncWarnings = [];
    if (!body.cao_key && explicitRouteServiceCaoKey) {
      syncWarnings.push(`Routekosten cao_key ${targetCaoKey} is afgeleid uit route/taak/object-context; geen PB-default toegepast.`);
    }
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'skipped_unsupported_cao_sync') syncWarnings.push('CAO Cloudflare lazy-sync overgeslagen: deze runtime ondersteunt alleen CAO Particuliere Beveiliging.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    const shiftDateRef = new Date(shiftDate);
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
      status: 'active',
      cao_key: targetCaoKey
    });
    const eligibleCaos = allCaos.filter(c => {
      if (c.valid_from && new Date(c.valid_from) > shiftDateRef) return false;
      if (c.valid_until && new Date(c.valid_until) < shiftDateRef) return false;
      return true;
    });
    eligibleCaos.sort((a, b) => {
      const da = a.valid_from ? new Date(a.valid_from) : new Date(0);
      const db = b.valid_from ? new Date(b.valid_from) : new Date(0);
      return db - da;
    });
    if (eligibleCaos.length > 1) {
      return Response.json({
        error: `Meerdere actieve CAO-configuraties gevonden voor ${targetCaoKey} op datum ${shiftDate}; routekosten voor payrollbasis zijn geblokkeerd om historische CAO-keuze niet te gokken.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          `Ambigue actieve CAO-configuraties voor ${targetCaoKey} op ${shiftDate}: ${eligibleCaos.map(c => c.id).join(', ')}`
        ],
        cao_key: targetCaoKey,
        active_cao_configuration_candidates: eligibleCaos.map(c => ({
          id: c.id,
          name: c.name || c.version_label || null,
          cloudflare_revision: c.cloudflare_revision || null,
          valid_from: c.valid_from || null,
          valid_until: c.valid_until || null
        })),
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_ambiguous_active_cao_config'
      }, { status: 400 });
    }
    const caoConfig = eligibleCaos[0];
    if (!caoConfig) {
      return Response.json({
        error: `Geen actieve CAO-configuratie gevonden voor ${targetCaoKey} op datum ${shiftDate}. Activeer eerst een passende CAO-configuratie.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [...syncWarnings, `Geen actieve CAO ${targetCaoKey} voor ${shiftDate}`],
        cao_key: targetCaoKey,
        cao_runtime_support: getCaoRuntimeSupport(targetCaoKey, 'calculateRoutePersonnelCosts'),
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_missing_active_cao_config'
      }, { status: 400 });
    }
    const payrollReadiness = getCaoPayrollReadiness(caoConfig);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
    const routeRuntimeSupport = getCaoRuntimeSupport(caoConfig.cao_key || targetCaoKey, 'calculateRoutePersonnelCosts');
    if (!routeRuntimeSupport.supported) {
      return Response.json({
        error: routeRuntimeSupport.message,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Routekosten geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_payroll_readiness: payrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: routeRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: routeRuntimeSupport.status
      }, { status: 422 });
    }
    if (!payrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${payrollReadiness.status}). Route-loonkosten voor payrollbasis zijn geblokkeerd totdat de CAO coverage-gate slaagt.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Routekosten geblokkeerd: CAO-regeldekking of payrollparameters zijn niet bewezen compleet.'
        ],
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_payroll_readiness: payrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: routeRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    const allPersonnel = await base44.entities.Personnel.list();
    const surveillants = allPersonnel.filter(p => p.function_type === 'surveillant' && p.is_active !== false);
    const binnendienst = allPersonnel.filter(p => p.function_type === 'binnendienst' && p.is_active !== false);

    if (surveillants.length === 0) {
      return Response.json({ error: 'Geen actieve surveillanten gevonden' }, { status: 404 });
    }

    // Cache-check na laden van personeel (fingerprint vereist personnelList)
    // Wordt later gedaan nadat personnelList beschikbaar is

    const startTime = route.time_window_start || '08:00';
    const plannedEndTime = route.time_window_end || '17:00';
    let endTime = plannedEndTime;
    let actualShiftNote = null;

    if (!route.alarm_standby) {
      const routeStartMinutes = timeToMinutes(startTime);
      const plannedEndMinutes = getAbsoluteEndMinutes(routeStartMinutes, plannedEndTime);
      const plannedWindowMinutes = plannedEndMinutes - routeStartMinutes;
      const routeDuration = route.total_route_minutes || plannedWindowMinutes;
      const actualEndMinutes = routeStartMinutes + routeDuration;

      if (actualEndMinutes < plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route eindigt ${plannedEndMinutes - actualEndMinutes} min eerder dan gepland (${endTime} i.p.v. ${plannedEndTime})`;
      } else if (actualEndMinutes > plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route loopt ${actualEndMinutes - plannedEndMinutes} min uit (${endTime} i.p.v. ${plannedEndTime})`;
      }
    }

    const routeServiceRequirement = buildRouteServiceRequirement({
      route,
      serviceSources: routeServiceSources,
      targetCaoKey
    });
    const routeOperatingCompanyId = routeServiceRequirement.service_context?.operating_company_id ||
      routeServiceRequirement.service_context?.company_id ||
      route.operating_company_id ||
      null;

    // ── Fingerprint-gebaseerde cache check (na laden personeel) ──
    const allPersonnelForCache = [...surveillants, ...binnendienst];
    const fingerprint = buildRouteCostCacheFingerprint({
      route, weekday: targetWeekday, caoConfig, personnelList: allPersonnelForCache
    });
    const cacheKey = `${targetWeekday}`;
    const usesContractResolution = !!routeOperatingCompanyId || allow_legacy_companyless_route_costing !== true;
    if (!force_recalculate && !usesContractResolution && route.cached_personnel_costs?.[cacheKey]) {
      const cached = route.cached_personnel_costs[cacheKey];
      if (cached._cache_fingerprint === fingerprint) {
        return Response.json(cached);
      }
    }

    // Resolve CAO-scope per medewerker (parallel voor surveillanten)
    const scopePromises = surveillants.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
        personnel_id: p.id,
        cao_key: targetCaoKey,
        work_context: routeServiceRequirement.service_context
      })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );
    const binnendienstScopePromises = binnendienst.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
        personnel_id: p.id,
        cao_key: targetCaoKey,
        work_context: routeServiceRequirement.service_context
      })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );
    const classificationPromises = allPersonnelForCache.map(p => {
      if (p.employee_type !== 'loondienst' || targetCaoKey !== CAO_PB_KEY) {
        return Promise.resolve({ id: p.id, classification: null });
      }
      return base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
        personnel_id: p.id,
        cao_key: targetCaoKey,
        work_context: routeServiceRequirement.service_context
      })
        .then(r => ({ id: p.id, classification: r?.data || null }))
        .catch(() => ({ id: p.id, classification: null }));
    });
    const contractPromises = allPersonnelForCache.map(p =>
      resolveRouteContractContext(base44, p, route, shiftDate, routeServiceRequirement, { allow_legacy_companyless_route_costing })
        .then(contractResolution => ({ id: p.id, contract_resolution: contractResolution }))
        .catch(error => ({
          id: p.id,
          contract_resolution: {
            status: 'blocked_contract_resolution_error',
            planning_allowed: false,
            payroll_final_allowed: false,
            manual_review_required: true,
            blocking_reasons: [`Contractresolver fout: ${error.message}`]
          }
        }))
    );

    const [scopeResults, binnendienstScopeResults, classificationResults, contractResults] = await Promise.all([
      Promise.all(scopePromises),
      Promise.all(binnendienstScopePromises),
      Promise.all(classificationPromises),
      Promise.all(contractPromises)
    ]);
    const scopeById = {};
    for (const s of scopeResults) scopeById[s.id] = s.scope;
    for (const s of binnendienstScopeResults) scopeById[s.id] = s.scope;
    const classificationById = {};
    for (const c of classificationResults) classificationById[c.id] = c.classification;
    const contractById = {};
    for (const c of contractResults) {
      contractById[c.id] = enforceRouteContractCaoMatch(c.contract_resolution, caoConfig, targetCaoKey);
      c.contract_resolution = contractById[c.id];
    }
    const contractResolutionCaoReferences = collectRouteContractResolutionCaoReferences(contractResults);

    const results = surveillants.map(p => {
      const scope = scopeById[p.id] || null;
      const classification = classificationById[p.id] || null;
      const contractResolution = contractById[p.id] || null;
      const effectiveScope = contractResolution?.cao_applicability || scope;
      if (contractResolution?.planning_allowed === false || contractResolution?.payroll_final_allowed === false) {
        const blockedCost = buildBlockedContractCost(p, shiftDate, startTime, endTime, effectiveScope, contractResolution);
        return {
          personnel_id: p.id, name: p.name,
          employee_type: p.employee_type, contract_type: p.contract_type,
          cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
          ...blockedCost
        };
      }
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, effectiveScope, classification, contractResolution, route);
      return {
        personnel_id: p.id, name: p.name,
        employee_type: p.employee_type, contract_type: p.contract_type,
        cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
        contract_resolution: contractResolution,
        ...cost
      };
    });

    const isCosted = r => !String(r.calculation_status || '').startsWith('blocked');
    const costedResults = results.filter(isCosted);
    costedResults.sort((a, b) => b.total_cost_employer - a.total_cost_employer);
    results.sort((a, b) => {
      if (isCosted(a) && !isCosted(b)) return -1;
      if (!isCosted(a) && isCosted(b)) return 1;
      return (b.total_cost_employer || 0) - (a.total_cost_employer || 0);
    });

    const count = costedResults.length;
    const mostExpensive = costedResults[0] || null;
    const cheapest = costedResults[costedResults.length - 1] || null;
    const average = count > 0 ? {
      total_cost_employer: r2(costedResults.reduce((s, r) => s + r.total_cost_employer, 0) / count),
      cost_per_hour: r2(costedResults.reduce((s, r) => s + r.cost_per_hour, 0) / count),
      total_hours: costedResults[0]?.total_hours || 0,
      base_salary: r2(costedResults.reduce((s, r) => s + r.base_salary, 0) / count),
      surcharges_total: r2(costedResults.reduce((s, r) => s + r.surcharges_total, 0) / count),
      total_gross: r2(costedResults.reduce((s, r) => s + r.total_gross, 0) / count),
      employer_costs_total: r2(costedResults.reduce((s, r) => s + r.employer_costs_total, 0) / count),
      accruals_total: r2(costedResults.reduce((s, r) => s + r.accruals_total, 0) / count),
      count
    } : {
      total_cost_employer: 0,
      cost_per_hour: 0,
      total_hours: 0,
      base_salary: 0,
      surcharges_total: 0,
      total_gross: 0,
      employer_costs_total: 0,
      accruals_total: 0,
      count: 0,
      calculation_status: 'blocked_no_costed_personnel'
    };

    // Voertuigkosten
    let vehicleCosts = null;
    if (route.vehicle_id) {
      const vehicles = await base44.entities.Vehicle.list();
      const vehicle = vehicles.find(v => v.id === route.vehicle_id);
      if (vehicle) {
        const routesWithVehicle = routes.filter(r => r.vehicle_id === route.vehicle_id);
        const totalServicesPerWeek = routesWithVehicle.reduce((sum, r) => sum + (r.weekdays?.length || 1), 0);
        const totalServicesPerYear = totalServicesPerWeek * 52;
        let depreciationPerYear = 0, depreciationLabel = '';
        if (vehicle.acquisition_type === 'lease' || vehicle.acquisition_type === 'private_lease') {
          depreciationPerYear = (vehicle.monthly_lease_cost || 0) * 12;
          depreciationLabel = `Leasekosten (€${(vehicle.monthly_lease_cost || 0).toFixed(2)}/mnd × 12)`;
        } else if (vehicle.acquisition_type === 'banklening') {
          depreciationPerYear = (vehicle.monthly_loan_payment || 0) * 12;
          depreciationLabel = `Aflossing banklening (€${(vehicle.monthly_loan_payment || 0).toFixed(2)}/mnd × 12)`;
        } else {
          const purchase = vehicle.purchase_price || 0, residual = vehicle.residual_value || 0, years = vehicle.depreciation_years || 5;
          depreciationPerYear = (purchase - residual) / years;
          depreciationLabel = `Afschrijving ((€${purchase.toFixed(2)} - €${residual.toFixed(2)}) / ${years} jaar)`;
        }
        const kmPerService = route.total_distance_km || 0;
        const fuelCostPerService = kmPerService * (vehicle.fuel_cost_per_km || 0);
        let maintenanceCostPerService = 0, maintenanceCostPerYear = 0;
        if (vehicle.maintenance_type === 'per_km') { maintenanceCostPerService = kmPerService * (vehicle.maintenance_cost || 0); maintenanceCostPerYear = maintenanceCostPerService * totalServicesPerYear; }
        else if (vehicle.maintenance_type === 'per_year') { maintenanceCostPerYear = vehicle.maintenance_cost || 0; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.maintenance_type === 'per_month') { maintenanceCostPerYear = (vehicle.maintenance_cost || 0) * 12; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.maintenance_type === 'per_quarter') { maintenanceCostPerYear = (vehicle.maintenance_cost || 0) * 4; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        let tireCostPerService = 0, tireCostPerYear = 0;
        if (vehicle.tire_type === 'per_km') { tireCostPerService = kmPerService * (vehicle.tire_cost || 0); tireCostPerYear = tireCostPerService * totalServicesPerYear; }
        else if (vehicle.tire_type === 'per_year') { tireCostPerYear = vehicle.tire_cost || 0; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.tire_type === 'per_month') { tireCostPerYear = (vehicle.tire_cost || 0) * 12; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.tire_type === 'per_quarter') { tireCostPerYear = (vehicle.tire_cost || 0) * 4; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        const insurancePerYear = (vehicle.insurance_per_month || 0) * 12;
        const insuranceCostPerService = totalServicesPerYear > 0 ? insurancePerYear / totalServicesPerYear : 0;
        const depreciationPerService = totalServicesPerYear > 0 ? depreciationPerYear / totalServicesPerYear : 0;
        const totalPerService = r2(depreciationPerService + fuelCostPerService + maintenanceCostPerService + tireCostPerService + insuranceCostPerService);
        vehicleCosts = {
          vehicle_id: vehicle.id,
          vehicle_label: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim(),
          acquisition_type: vehicle.acquisition_type,
          km_per_service: r2(kmPerService),
          total_services_per_week: totalServicesPerWeek,
          total_services_per_year: totalServicesPerYear,
          routes_with_vehicle: routesWithVehicle.length,
          depreciation_per_year: r2(depreciationPerYear),
          depreciation_label: depreciationLabel,
          depreciation_per_service: r2(depreciationPerService),
          fuel_cost_per_service: r2(fuelCostPerService),
          fuel_cost_per_km: vehicle.fuel_cost_per_km || 0,
          maintenance_cost_per_service: r2(maintenanceCostPerService),
          tire_cost_per_service: r2(tireCostPerService),
          insurance_per_year: r2(insurancePerYear),
          insurance_per_service: r2(insuranceCostPerService),
          total_per_service: totalPerService
        };
      }
    }

    const binnendienstResults = binnendienst.map(p => {
      const scope = scopeById[p.id] || null;
      const classification = classificationById[p.id] || null;
      const contractResolution = contractById[p.id] || null;
      const effectiveScope = contractResolution?.cao_applicability || scope;
      if (contractResolution?.planning_allowed === false || contractResolution?.payroll_final_allowed === false) {
        const blockedCost = buildBlockedContractCost(p, shiftDate, startTime, endTime, effectiveScope, contractResolution);
        return {
          personnel_id: p.id, name: p.name,
          employee_type: p.employee_type, contract_type: p.contract_type,
          cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
          ...blockedCost
        };
      }
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, effectiveScope, classification, contractResolution, route);
      return {
        personnel_id: p.id, name: p.name,
        employee_type: p.employee_type, contract_type: p.contract_type,
        cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
        contract_resolution: contractResolution,
        ...cost
      };
    });
    const allCostResults = [...results, ...binnendienstResults];
    const blockedResults = allCostResults.filter(r => String(r.calculation_status || '').startsWith('blocked'));
    const manualReviewResults = allCostResults.filter(r => r.manual_review_required === true || r.payroll_final_allowed === false);
    const routePayrollFinalAllowed = blockedResults.length === 0 && manualReviewResults.length === 0;

    const resultPayload = {
      shift_date: shiftDate, weekday: targetWeekday,
      start_time: startTime, end_time: endTime,
      planned_end_time: plannedEndTime,
      alarm_standby: !!route.alarm_standby,
      operating_company_id: routeOperatingCompanyId,
      contract_resolution_required: usesContractResolution,
      route_service_requirement: routeServiceRequirement,
      contract_resolution_cao_references: contractResolutionCaoReferences,
      actual_shift_note: actualShiftNote,
      total_surveillants: results.length,
      most_expensive: mostExpensive, cheapest, average,
      all_personnel: results,
      binnendienst: binnendienstResults,
      vehicle_costs: vehicleCosts,
      payroll_final_allowed: routePayrollFinalAllowed,
      manual_review_required: manualReviewResults.length > 0,
      calculation_status: routePayrollFinalAllowed
        ? 'final'
        : blockedResults.length > 0
        ? 'blocked_manual_review'
        : 'concept_manual_review',
      cao_configuration_id: caoConfig.id,
      cao_key: caoConfig.cao_key || targetCaoKey,
      cao_version_label: caoConfig.version_label || caoConfig.name,
      cao_revision: caoConfig.cloudflare_revision || null,
      cao_payroll_readiness: payrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_runtime_support: routeRuntimeSupport,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: [
        ...syncWarnings,
        ...(routeServiceRequirement.blocking_reasons || []),
        ...(routeServiceRequirement.manual_review_reasons || []),
        ...blockedResults.map(r => `${r.name}: ${r.scope_warnings?.slice(-1)?.[0] || 'loonbasis/functie-indeling geblokkeerd'}`),
        ...manualReviewResults
          .filter(r => !blockedResults.includes(r))
          .map(r => `${r.name}: handmatige review vereist voor definitieve payroll.`)
      ],
      _cache_revision: caoConfig.cloudflare_revision || null,
      _cache_fingerprint: fingerprint,
      _cache_is_final_payroll_basis: routePayrollFinalAllowed,
      _cache_skipped_reason: usesContractResolution ? 'contract_resolution_depends_on_separate_contract_records' : null
    };

    if (routePayrollFinalAllowed && !usesContractResolution) {
      const existingCache = route.cached_personnel_costs || {};
      existingCache[cacheKey] = resultPayload;
      await base44.entities.Route.update(route_id, {
        cached_personnel_costs: existingCache,
        personnel_costs_calculated_at: new Date().toISOString()
      });
    }

    return Response.json(resultPayload);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

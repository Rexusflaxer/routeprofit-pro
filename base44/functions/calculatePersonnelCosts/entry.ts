import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
// Slaat sync over ALLEEN als cloudflare_revision al overeenkomt. Geen tijdgebaseerde skip.
async function lazySyncCao(base44, forceCaoSync = false) {
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

  const isOnCall = ['0_uren', 'oproep', 'min_max'].includes(personnel.contract_type) ||
    ['oproep', 'zero_hours', 'min_max', 'call'].includes(shift.contract_model);
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
  const ready = caoConfig?.is_payroll_ready === true &&
    status === 'ready' &&
    gate?.passed === true;

  return {
    ready,
    status: status || 'unknown',
    is_payroll_ready: caoConfig?.is_payroll_ready === true,
    gate_present: !!gate,
    blocking_findings: gate?.blocking_findings || [],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      personnel_id,
      work_schedule,
      force_cao_sync,
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
    } = await req.json();

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

    // ── CAO-toepassingscheck ──
    let rawScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        rawScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }
    const caoScope = normalizeCaoScope(rawScope);
    const scopeWarnings = [];
    const isUnknownOrMixedScope = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    if (isUnknownOrMixedScope) {
      scopeWarnings.push({
        message: `CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): beveiligingsspecifieke toeslagen (art. 40/42/43) worden NIET automatisch berekend. Handmatige review vereist.`,
        cao_scope_profile: caoScope.cao_scope_profile,
        manual_review_required: true
      });
    } else if (!caoScope.applies_full_security_rules) {
      const exclusions = [];
      if (caoScope.payroll_rule_profile?.apply_article_40_special_hours === false) exclusions.push('avond-/nacht-/weekendtoeslagen (art. 40)');
      if (caoScope.payroll_rule_profile?.apply_article_42_overtime === false) exclusions.push('overwerktoeslag (art. 42)');
      if (caoScope.payroll_rule_profile?.apply_article_43_shift_change === false) exclusions.push('dienstruilvergoeding (art. 43)');
      if (caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements === false) exclusions.push('reiskosten/vergoedingen (hoofdstuk 5)');
      if (exclusions.length > 0) {
        scopeWarnings.push({
          message: `Artikel 3 lid 2 CAO PB (${caoScope.cao_scope_profile}): niet van toepassing: ${exclusions.join(', ')}. Art. 37/38/41 gelden wel.`,
          cao_scope_profile: caoScope.cao_scope_profile,
          excluded_articles: caoScope.excluded_articles || []
        });
      }
    }

    // cao_rule_application metadata voor output
    const caoRuleApplication = {
      cao_scope_profile: caoScope.cao_scope_profile,
      applied_article_40_special_hours: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_40_special_hours === true),
      applied_article_41_holidays: caoScope.payroll_rule_profile?.apply_article_41_holidays !== false,
      applied_article_42_overtime: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_42_overtime === true),
      applied_chapter_5_reimbursements: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements === true),
      manual_review_required: isUnknownOrMixedScope || caoScope.manual_review_required || false,
      source_rule_ids: caoScope.source_rule_ids || []
    };

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
    const syncResult = await lazySyncCao(base44, !!force_cao_sync);

    const calculationWarnings = [];
    if (syncResult?.cloudflare_unavailable) {
      calculationWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
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

    // work_schedule format: [{ date: "2025-01-15", start_time: "08:00", end_time: "17:00" }, ...]

    if (!personnel_id || !work_schedule || !Array.isArray(work_schedule)) {
      return Response.json({ error: 'personnel_id en work_schedule zijn verplicht' }, { status: 400 });
    }

    // Haal medewerker op
    const personnel = await base44.entities.Personnel.get(personnel_id);
    
    // Bepaal referentiedatum op basis van de eerste dienst
    const firstShiftDate = work_schedule[0]?.date || amsterdamInstantParts(new Date()).date;
    const refDate = new Date(firstShiftDate);

    // Haal ACTIEVE CAO op op basis van datum (niet op created_date)
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({ status: 'active' });
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
        error: `Geen actieve CAO-configuratie gevonden voor datum ${firstShiftDate}. Activeer eerst een CAO-configuratie.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [...calculationWarnings, `Geen actieve CAO voor ${firstShiftDate}`]
      }, { status: 400 });
    }

    const payrollReadiness = getCaoPayrollReadiness(caoConfig);
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
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
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

    // Check of dit een oproepkracht is
    const isCallWorker = personnel.contract_type === '0_uren' || personnel.contract_type === 'oproep';
    
    // Breakdown zoals op loonstrook
    let payslip = {
      // Bruto componenten
      base_salary: 0,
      vacation_hours_call_worker: 0, // Vakantie-uren oproep (8% extra uren)
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
      
      // Voor oproepkrachten: bereken vakantie-uren (8% extra uren die uitbetaald worden)
      if (isCallWorker) {
        const vacationHours = totalHours * 0.08;
        payslip.vacation_hours_call_worker = vacationHours * baseHourlyRate;
      }
      
      // Totaal bruto loon = basis + vakantie-uren oproep + toeslagen
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
        source_rule_ids: ['CAO-PB-2024-R0770', 'CAO-PB-2024-R0771', 'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773']
      };
      
      // Bereken gemiddelde ORT per uur (voor ORT verlof berekening)
      const avgOrtPerHour = totalHours > 0 ? totalSurcharges / totalHours : 0;
      
      // Voor oproepkrachten: vakantiegeld en eindejaarsuitkering direct uitbetaald
      if (isCallWorker) {
        // Bereken vakantiegeld en eindejaarsuitkering als percentage van basis + toeslagen
        const baseForAllowances = payslip.base_salary + minimumServiceAmount + totalSurcharges;
        
        // Bereken ORT verlof: vakantie-uren * gemiddelde ORT per uur
        const vacationHours = totalHours * 0.08;
        const ortVerlof = vacationHours * avgOrtPerHour;
        
        payslip.accruals.vacation_allowance = baseForAllowances * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = yearEndBonusBasisAmount * ((caoConfig.year_end_bonus || 2.01) / 100);
        
        // Voeg ORT verlof toe aan doorbetaling verlof
        payslip.vacation_paid = ortVerlof;
        
        // Voor oproepkrachten wordt dit direct uitbetaald, niet gereserveerd
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + payslip.vacation_hours_call_worker + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + generalReserveAllowanceAmount + payslip.accruals.vacation_allowance + payslip.accruals.year_end_bonus + payslip.vacation_paid;
      } else {
        payslip.total_gross = payslip.base_salary + minimumServiceAmount + totalSurcharges + overtimeAmount + actingFunctionAllowanceAmount + shiftChangeAllowanceAmount + generalReserveAllowanceAmount;
      }
      
      // Bereken pensioengrondslag (bruto loon - vakantiegeld/eindejaarsuitkering - franchise)
      // Voor oproepkrachten: basis + toeslagen (zonder vakantiegeld/eindejaarsuitkering)
      const pensionBaseAmount = isCallWorker 
        ? (payslip.base_salary + totalSurcharges)
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
      const basisForPremiums = isCallWorker ? (payslip.base_salary + payslip.vacation_hours_call_worker + totalSurcharges) : payslip.total_gross;
      
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
        
        // Schat jaarlijkse vakantie-uren (bijv. 25 dagen * 8 uur = 200 uur)
        const estimatedAnnualVacationHours = 200;
        const ortVerlofReservation = (estimatedAnnualVacationHours / 13) * avgOrtPerHour; // per 4 weken
        
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
      payroll_runtime_review_items: payrollRuntimeReviewItems,
      employee_type: personnel.employee_type,
      cao_scale: personnel.cao_scale,
      cao_period: personnel.cao_period,
      base_hourly_rate: baseHourlyRate,
      // CAO metadata
      cao_configuration_id: caoConfig.id,
      cao_version_label: caoConfig.version_label || caoConfig.name,
      cao_revision: caoConfig.cloudflare_revision || null,
      cao_valid_from: caoConfig.valid_from,
      cao_payroll_readiness: payrollReadiness,
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
        year_end_bonus_basis: {
          eligible_base_wage: r2(payslip.year_end_bonus_basis.eligible_base_wage),
          vacation_allowance_on_eligible_base_wage: r2(payslip.year_end_bonus_basis.vacation_allowance_on_eligible_base_wage),
          eligible_amount_including_vacation_allowance: r2(payslip.year_end_bonus_basis.eligible_amount_including_vacation_allowance),
          excluded_overtime_amount: r2(payslip.year_end_bonus_basis.excluded_overtime_amount),
          excluded_special_hours_allowances: r2(payslip.year_end_bonus_basis.excluded_special_hours_allowances),
          excluded_acting_function_allowance: r2(payslip.year_end_bonus_basis.excluded_acting_function_allowance),
          excluded_shift_change_allowance: r2(payslip.year_end_bonus_basis.excluded_shift_change_allowance),
          excluded_general_reserve_allowance: r2(payslip.year_end_bonus_basis.excluded_general_reserve_allowance),
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
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_payroll_readiness_status: caoConfig.payroll_readiness_status || null,
        correction_run_for_review_ids: [],
        supersedes_payroll_run_ids: [],
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
          pay_period_end: responsePayload.pay_period_end
        },
        calculation_output: responsePayload,
        warnings: calculationWarnings.map(message => ({ message })),
        created_at: new Date().toISOString(),
        created_by_function: 'calculatePersonnelCosts'
      });
      responsePayload.payroll_calculation_run_id = run.id;
    }

    return Response.json(responsePayload);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

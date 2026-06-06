import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_schedule_validation',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB planning-validator
 * Bronregels: R0547-R0549 en R0560-R0679 (rooster, tijdvakken, roosterwijziging, overwerkbasis, minuren, algemene reserve, maximale arbeidstijd, rusttijd, nachtdienst, pauze en jeugdige werknemer)
 *
 * Scope-bewust:
 * - Artikel 3 lid 2 sluit uit: art. 10, art. 9 lid 1 sub c, hfdst. 4 (behalve 37/38/41), hfdst. 5, bijlage 2.
 * - Artikel 3 lid 2 sluit NIET heel hoofdstuk 3 uit.
 * - R0562 (max tijdvakken), R0564 (vrije dagen), R0561 (roosterplanning) zijn hoofdstuk 3/algemene regels → gelden ook voor non-security.
 * - R0590 (overwerk art. 42) → alleen bij full-security (hoofdstuk 4).
 */

// Regels die onder art. 42 / hoofdstuk 4 vallen (uitgesloten bij non-security)
const CHAPTER4_OVERTIME_RULES = ['CAO-PB-2024-R0590'];
const ARTICLE_30_EXCLUDED_RULE_IDS = new Set([
  'CAO-PB-2024-R0588', 'CAO-PB-2024-R0589', 'CAO-PB-2024-R0590', 'CAO-PB-2024-R0591',
  ...Array.from({ length: 15 }, (_, i) => `CAO-PB-2024-R${String(625 + i).padStart(4, '0')}`),
  ...Array.from({ length: 7 }, (_, i) => `CAO-PB-2024-R${String(640 + i).padStart(4, '0')}`),
  ...Array.from({ length: 21 }, (_, i) => `CAO-PB-2024-R${String(647 + i).padStart(4, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `CAO-PB-2024-R${String(668 + i).padStart(4, '0')}`)
]);

// Normaliseer scope: null = fail-closed (unknown → conservatief, maar planning hoofdstuk 3 geldt altijd)
function normalizeCaoScope(scope) {
  if (!scope) {
    return {
      cao_scope_profile: 'unknown_manual_review',
      applies_full_security_rules: false,
      manual_review_required: true,
      payroll_rule_profile: {
        apply_chapter_4: false, apply_article_37_wage_increase: true, apply_article_38_year_end_bonus: true,
        apply_article_40_special_hours: false, apply_article_41_holidays: true, apply_article_42_overtime: false,
        apply_article_43_shift_change: false, apply_chapter_5_reimbursements: false, apply_appendix_2_function_scales: false
      },
      excluded_articles: [], excluded_chapters: [], excluded_rule_ids: [],
      warnings: ['CAO-toepassingsprofiel kon niet worden bepaald. Handmatige review vereist.']
    };
  }
  return scope;
}

function isRuleApplicable(ruleId, caoScope) {
  // Bij onbekende scope: planning-regels (hoofdstuk 3) gelden wel, alleen art. 42 overwerk valt weg
  if (caoScope.applies_full_security_rules === true) return true;
  const excludedArticles = caoScope.excluded_articles || [];
  const excludedChapters = caoScope.excluded_chapters || [];
  const excludedRuleIds = caoScope.excluded_rule_ids || [];

  if (excludedRuleIds.includes(ruleId)) return false;
  // Overwerk (art. 42) niet van toepassing bij non-security
  if (CHAPTER4_OVERTIME_RULES.includes(ruleId) && excludedChapters.some(c => c.includes('chapter_4'))) return false;
  return true;
}

function getWeekday(dateStr) { return new Date(dateStr).getDay(); }
function isWeekend(dateStr) { const dow = getWeekday(dateStr); return dow === 0 || dow === 6; }
function getIsoWeekKey(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function startOfIsoWeekDate(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWeekendBlock(day1, day2) {
  const d1 = new Date(day1), d2 = new Date(day2);
  const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
  if (diffDays !== 1) return false;
  return (d1.getDay() === 6 && d2.getDay() === 0);
}

function calculateShiftHours(shift) {
  const start = new Date(`${shift.date}T${shift.start_time || '00:00'}:00`);
  let end = new Date(`${shift.date}T${shift.end_time || '00:00'}:00`);
  if (end <= start) end.setDate(end.getDate() + 1);
  return (end - start) / (1000 * 60 * 60);
}

function asIsoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

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

function parseClockMinutes(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  return hours * 60 + minutes;
}

function durationHoursForTimes(startTime, endTime) {
  const start = parseClockMinutes(startTime);
  let end = parseClockMinutes(endTime);
  if (start === null || end === null) return null;
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

function isWholeHour(value) {
  const minutes = parseClockMinutes(value);
  return minutes !== null && minutes % 60 === 0;
}

function dateFromIso(value) {
  const iso = asIsoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatIsoDateLocal(date)}T${hours}:${minutes}:00`;
}

function calculateAgeAt(dateOfBirth, referenceDate) {
  const birth = dateFromIso(dateOfBirth);
  const reference = dateFromIso(referenceDate);
  if (!birth || !reference) return null;
  let age = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) age--;
  return age;
}

function resolveYouthWorkerArticle30(body, periodStart) {
  const explicitUnder18 = booleanOrNull(
    body.is_under_18 ??
    body.under_18 ??
    body.is_minor_employee ??
    body.minor_employee ??
    body.youth_worker_under_18
  );
  const explicitAge = numberOrNull(body.employee_age ?? body.personnel_age ?? body.age);
  const dateOfBirth = asIsoDate(body.date_of_birth ?? body.employee_date_of_birth ?? body.personnel_date_of_birth);
  const ageAtPeriodStart = explicitAge !== null ? explicitAge : calculateAgeAt(dateOfBirth, periodStart);
  const isUnder18 = explicitUnder18 !== null ? explicitUnder18 : ageAtPeriodStart !== null ? ageAtPeriodStart < 18 : false;
  return {
    is_under_18: isUnder18 === true,
    source_rule_ids: ['CAO-PB-2024-R0678', 'CAO-PB-2024-R0679'],
    age_at_period_start: ageAtPeriodStart,
    date_of_birth: dateOfBirth,
    reference_date: asIsoDate(periodStart),
    evidence: explicitUnder18 !== null
      ? 'explicit_under_18_flag'
      : explicitAge !== null
      ? 'explicit_age'
      : dateOfBirth
      ? 'date_of_birth'
      : 'not_provided',
    atw_youth_rules_required: isUnder18 === true
  };
}

function isArticle30ExcludedRuleId(ruleId) {
  return ARTICLE_30_EXCLUDED_RULE_IDS.has(ruleId);
}

function removeArticle30ExcludedItems(items) {
  const removed = [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (isArticle30ExcludedRuleId(items[i]?.rule_id)) {
      removed.push(items[i]);
      items.splice(i, 1);
    }
  }
  return removed.reverse();
}

function daysBetween(later, earlier) {
  const laterDate = dateFromIso(later);
  const earlierDate = dateFromIso(earlier);
  if (!laterDate || !earlierDate) return null;
  return Math.round((laterDate - earlierDate) / 86400000);
}

function addDays(dateStr, days) {
  const date = dateFromIso(dateStr);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return formatIsoDateLocal(date);
}

function nextThursdayOnOrAfter(dateStr) {
  const date = dateFromIso(dateStr);
  if (!date) return null;
  const day = date.getDay();
  const delta = (4 - day + 7) % 7;
  date.setDate(date.getDate() + delta);
  return formatIsoDateLocal(date);
}

function isThursday(value) {
  const date = dateFromIso(value);
  return !!date && date.getDay() === 4;
}

function normalizePercentage(value) {
  const n = numberOrNull(value);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function uniqueSortedIsoDates(values) {
  return [...new Set(values.map(asIsoDate).filter(Boolean))].sort();
}

function analyzeFreeDayBlocks(dates) {
  const freeDates = uniqueSortedIsoDates(dates);
  let consecutiveBlocks = 0;
  let weekendBlockFound = false;
  for (let i = 0; i < freeDates.length - 1; i++) {
    const d1 = freeDates[i], d2 = freeDates[i + 1];
    if (new Date(d2) - new Date(d1) === 86400000) {
      consecutiveBlocks++;
      if (isWeekendBlock(d1, d2)) weekendBlockFound = true;
    }
  }
  return {
    free_dates: freeDates,
    consecutive_blocks: consecutiveBlocks,
    weekend_block_found: weekendBlockFound
  };
}

function getRosterTimeWindows(body, periodStart, periodEnd, periodShifts) {
  const bodyWindows = normalizeArray(body.time_windows || body.roster_time_windows);
  const shiftWindows = periodShifts.filter(shift =>
    shift.is_time_window === true ||
    shift.roster_block_type === 'time_window' ||
    shift.block_type === 'time_window'
  );
  return [...bodyWindows, ...shiftWindows]
    .filter(window => {
      const date = asIsoDate(window.date || window.start_date || window.service_date);
      return date && date >= periodStart && date <= periodEnd;
    })
    .map((window, index) => ({
      ...window,
      id: window.id || window.time_window_id || null,
      index,
      date: asIsoDate(window.date || window.start_date || window.service_date),
      start_time: window.start_time || window.time_window_start || window.window_start || null,
      end_time: window.end_time || window.time_window_end || window.window_end || null
    }));
}

function getBreakDurationHours(breakItem) {
  const explicitHours = numberOrNull(breakItem.hours ?? breakItem.duration_hours);
  if (explicitHours !== null) return explicitHours;
  const minutes = numberOrNull(breakItem.minutes ?? breakItem.duration_minutes);
  if (minutes !== null) return minutes / 60;
  return durationHoursForTimes(
    breakItem.start_time || breakItem.start,
    breakItem.end_time || breakItem.end
  );
}

function getBreakStartTime(breakItem) {
  return breakItem.start_time || breakItem.start || breakItem.break_start_time || breakItem.from || null;
}

function getBreakEndTime(breakItem) {
  return breakItem.end_time || breakItem.end || breakItem.break_end_time || breakItem.to || null;
}

function normalizeShiftBreaks(shift) {
  const breaks = normalizeArray(shift.breaks || shift.unpaid_breaks || shift.pause_blocks || shift.break_items);
  return breaks.map((item, index) => {
    const durationHours = getBreakDurationHours(item);
    return {
      raw: item,
      index,
      id: item.id || item.break_id || item.pause_id || null,
      paid: booleanOrNull(item.paid ?? item.is_paid),
      duration_hours: durationHours,
      start_time: getBreakStartTime(item),
      end_time: getBreakEndTime(item),
      counts_for_cao_break: durationHours !== null && durationHours >= 0.25 && durationHours <= 1
    };
  });
}

function getUnpaidBreakHours(shift) {
  const breaks = normalizeShiftBreaks(shift);
  let total = 0;
  let found = false;
  for (const item of breaks) {
    if (item.paid === true) continue;
    const hours = item.duration_hours;
    if (hours !== null) {
      total += hours;
      found = true;
    }
  }
  return found ? total : 0;
}

function breakIntervalWithinShift(shift, breakItem) {
  const shiftInterval = shiftDateTime(shift);
  const date = asIsoDate(shift.date || shift.service_date);
  const startTime = breakItem.start_time;
  const endTime = breakItem.end_time;
  if (!shiftInterval || !date || !startTime || !endTime) return null;
  let start = new Date(`${date}T${startTime}:00`);
  let end = new Date(`${date}T${endTime}:00`);
  if (start < shiftInterval.start) start.setDate(start.getDate() + 1);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function breakPlacementViolation(shift, breakItem) {
  const shiftInterval = shiftDateTime(shift);
  const breakInterval = breakIntervalWithinShift(shift, breakItem);
  if (!shiftInterval || !breakInterval) return null;
  const shiftHours = hoursBetweenDates(shiftInterval.end, shiftInterval.start);
  const edgeHours = shiftHours >= 8 ? 3 : 2;
  const earliestAllowed = new Date(shiftInterval.start);
  earliestAllowed.setTime(earliestAllowed.getTime() + edgeHours * 3600000);
  const latestAllowedEnd = new Date(shiftInterval.end);
  latestAllowedEnd.setTime(latestAllowedEnd.getTime() - edgeHours * 3600000);
  return breakInterval.start < earliestAllowed || breakInterval.end > latestAllowedEnd
    ? {
      edge_hours: edgeHours,
      break_start: formatLocalDateTime(breakInterval.start),
      break_end: formatLocalDateTime(breakInterval.end),
      earliest_allowed_start: formatLocalDateTime(earliestAllowed),
      latest_allowed_end: formatLocalDateTime(latestAllowedEnd)
    }
    : null;
}

function textLooksLikeAny(text, needles) {
  return needles.some(needle => text.includes(needle));
}

function shiftFunctionText(shift, body = {}) {
  return [
    shift.service_type,
    shift.service_function_type,
    shift.function_type,
    shift.cao_function_name,
    shift.required_function_name,
    shift.cao_function_group,
    shift.required_cao_function_group,
    shift.task_type,
    shift.role,
    body.service_type,
    body.function_type,
    body.cao_function_name,
    body.required_function_name
  ].filter(Boolean).join(' ').toLowerCase();
}

function shiftLooksObjectGuardOrReceptionist(shift, body = {}) {
  const text = shiftFunctionText(shift, body);
  return textLooksLikeAny(text, [
    'objectbeveiliger',
    'objectbeveilig',
    'receptionist',
    'receptie',
    'reception'
  ]);
}

function shiftLooksSecurityGuard(shift, body = {}) {
  const explicit = booleanOrNull(
    shift.is_security_guard ??
    shift.security_guard ??
    body.is_security_guard ??
    body.security_guard
  );
  if (explicit !== null) return explicit;
  const text = shiftFunctionText(shift, body);
  return textLooksLikeAny(text, ['beveiliger', 'beveilig', 'security', 'surveillance']);
}

function shiftHasNoBreakException(shift, body = {}) {
  return booleanOrNull(
    shift.no_break_due_no_reliever ??
    shift.no_break_no_reliever ??
    shift.cannot_be_relieved_for_break ??
    shift.no_reliever_available_for_break ??
    body.no_break_due_no_reliever ??
    body.no_break_no_reliever ??
    body.cannot_be_relieved_for_break ??
    body.no_reliever_available_for_break
  ) === true;
}

function shiftDateTime(shift, fieldPrefix = '') {
  const date = asIsoDate(shift.date || shift.service_date);
  const startTime = shift[`${fieldPrefix}start_time`] || shift.start_time;
  const endTime = shift[`${fieldPrefix}end_time`] || shift.end_time;
  if (!date || !startTime || !endTime) return null;
  const start = new Date(`${date}T${startTime}:00`);
  let end = new Date(`${date}T${endTime}:00`);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function serviceIntervalsFromShifts(shifts) {
  return shifts
    .map(shift => {
      const interval = shiftDateTime(shift);
      if (!interval) return null;
      return {
        shift,
        shift_id: shift.id || null,
        date: asIsoDate(shift.date || shift.service_date),
        start: interval.start,
        end: interval.end,
        hours: calculateShiftHours({ ...shift, date: asIsoDate(shift.date || shift.service_date) })
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function hoursBetweenDates(later, earlier) {
  return (later - earlier) / 3600000;
}

function intervalOverlapsWindow(interval, windowStart, windowEnd) {
  return interval.end > windowStart && interval.start < windowEnd;
}

function intervalOverlapsIsoDate(interval, isoDate) {
  const dayStart = dateFromIso(isoDate);
  if (!dayStart) return false;
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return intervalOverlapsWindow(interval, dayStart, dayEnd);
}

function intervalWithinWindowByStart(interval, windowStart, windowEnd) {
  return interval.start >= windowStart && interval.start < windowEnd;
}

function nightHoursBetweenDates(interval, windowStart, windowEnd) {
  const overlapStart = new Date(Math.max(interval.start.getTime(), windowStart.getTime()));
  const overlapEnd = new Date(Math.min(interval.end.getTime(), windowEnd.getTime()));
  if (overlapEnd <= overlapStart) return 0;
  let totalMs = 0;
  const cursor = dateFromIso(formatIsoDateLocal(overlapStart));
  while (cursor < overlapEnd) {
    const nightStart = new Date(cursor);
    const nightEnd = new Date(cursor);
    nightEnd.setHours(6, 0, 0, 0);
    const start = Math.max(overlapStart.getTime(), nightStart.getTime());
    const end = Math.min(overlapEnd.getTime(), nightEnd.getTime());
    if (end > start) totalMs += end - start;
    cursor.setDate(cursor.getDate() + 1);
  }
  return totalMs / 3600000;
}

function nightHoursWithinWindow(intervals, windowStart, windowEnd) {
  return intervals.reduce((sum, interval) => sum + nightHoursBetweenDates(interval, windowStart, windowEnd), 0);
}

function maxContinuousRestHoursWithinWindow(intervals, windowStart, windowEnd) {
  const points = [windowStart.getTime(), windowEnd.getTime()];
  for (const interval of intervals) {
    if (!intervalOverlapsWindow(interval, windowStart, windowEnd)) continue;
    points.push(Math.max(interval.start.getTime(), windowStart.getTime()));
    points.push(Math.min(interval.end.getTime(), windowEnd.getTime()));
  }
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  let maxRestMs = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const segmentStart = new Date(start);
    const segmentEnd = new Date(end);
    const hasWork = intervals.some(interval => intervalOverlapsWindow(interval, segmentStart, segmentEnd));
    if (!hasWork) maxRestMs = Math.max(maxRestMs, end - start);
  }
  return maxRestMs / 3600000;
}

function restBlocksWithinWindow(intervals, windowStart, windowEnd) {
  const points = [windowStart.getTime(), windowEnd.getTime()];
  for (const interval of intervals) {
    if (!intervalOverlapsWindow(interval, windowStart, windowEnd)) continue;
    points.push(Math.max(interval.start.getTime(), windowStart.getTime()));
    points.push(Math.min(interval.end.getTime(), windowEnd.getTime()));
  }
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const blocks = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const segmentStart = new Date(start);
    const segmentEnd = new Date(end);
    const hasWork = intervals.some(interval => intervalOverlapsWindow(interval, segmentStart, segmentEnd));
    if (!hasWork) {
      const previous = blocks[blocks.length - 1];
      if (previous && previous.end.getTime() === start) {
        previous.end = segmentEnd;
        previous.hours = hoursBetweenDates(previous.end, previous.start);
      } else {
        blocks.push({ start: segmentStart, end: segmentEnd, hours: hoursBetweenDates(segmentEnd, segmentStart) });
      }
    }
  }
  return blocks;
}

function dateRange(periodStart, periodEnd) {
  const start = dateFromIso(periodStart);
  const end = dateFromIso(periodEnd);
  const dates = [];
  if (!start || !end) return dates;
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatIsoDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function dateBoundsFromIntervals(intervals, fallbackStart, fallbackEnd) {
  const starts = intervals.map(interval => interval.start).filter(Boolean).sort((a, b) => a - b);
  const ends = intervals.map(interval => interval.end).filter(Boolean).sort((a, b) => a - b);
  return {
    start: asIsoDate(fallbackStart) || (starts[0] ? formatIsoDateLocal(starts[0]) : null),
    end: asIsoDate(fallbackEnd) || (ends.length ? formatIsoDateLocal(ends[ends.length - 1]) : null)
  };
}

function isoWeekRowsBetween(periodStart, periodEnd) {
  const start = dateFromIso(periodStart);
  const end = dateFromIso(periodEnd);
  if (!start || !end) return [];
  const cursor = startOfIsoWeekDate(start);
  const last = startOfIsoWeekDate(end);
  const rows = [];
  while (cursor <= last) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    rows.push({
      week_key: getIsoWeekKey(formatIsoDateLocal(weekStart)),
      start: weekStart,
      end_exclusive: weekEnd
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return rows;
}

function rollingWeekWindows(weekRows, windowSize) {
  const windows = [];
  if (weekRows.length < windowSize) return windows;
  for (let i = 0; i <= weekRows.length - windowSize; i++) {
    const rows = weekRows.slice(i, i + windowSize);
    windows.push({
      week_keys: rows.map(row => row.week_key),
      start: rows[0].start,
      end_exclusive: rows[rows.length - 1].end_exclusive
    });
  }
  return windows;
}

function shiftStartsBetween00And06(shift) {
  const start = parseClockMinutes(shift.start_time);
  return start !== null && start >= 0 && start < 360;
}

function shiftEndsOnOrBefore0200(shift) {
  const end = parseClockMinutes(shift.end_time);
  return end !== null && end <= 120;
}

function shiftLooksMobileSurveillance(shift, body = {}) {
  const explicit = booleanOrNull(
    shift.mobile_surveillance_night_work ??
    shift.is_mobile_surveillance ??
    shift.mobile_surveillance ??
    body.mobile_surveillance_night_work ??
    body.night_shift_mainly_mobile_surveillance
  );
  if (explicit !== null) return explicit;
  const text = [
    shift.service_type,
    shift.service_function_type,
    shift.function_type,
    shift.cao_function_name,
    shift.required_function_name,
    shift.task_type,
    body.service_type,
    body.function_type
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('mobiele surveillance') || text.includes('mobile surveillance') || text.includes('mobile_surveillance');
}

function nightShiftDetailsFromIntervals(intervals, body = {}) {
  return intervals
    .map(interval => {
      const shift = interval.shift || {};
      const nightHours = nightWorkHoursBetween00And06({ ...shift, date: asIsoDate(shift.date || shift.service_date) });
      const explicitNightShift = booleanOrNull(shift.is_night_shift ?? shift.night_shift);
      const isNightShift = nightHours > 1 || explicitNightShift === true;
      if (!isNightShift) return null;
      return {
        ...interval,
        night_hours_00_06: round2(nightHours),
        starts_between_00_06: shiftStartsBetween00And06(shift),
        ends_on_or_before_0200: shiftEndsOnOrBefore0200(shift),
        mobile_surveillance: shiftLooksMobileSurveillance(shift, body),
        week_key: getIsoWeekKey(interval.date)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function shiftsWithinWindowByStart(details, windowStart, windowEnd) {
  return details.filter(detail => intervalWithinWindowByStart(detail, windowStart, windowEnd));
}

function nightShiftSequenceGroups(details) {
  const groups = [];
  for (const detail of details) {
    const previousGroup = groups[groups.length - 1];
    const previous = previousGroup?.[previousGroup.length - 1];
    if (previous && daysBetween(detail.date, previous.date) <= 1) {
      previousGroup.push(detail);
    } else {
      groups.push([detail]);
    }
  }
  return groups;
}

function overlapsAfterClock(shift, dateStr, clockTime) {
  const date = asIsoDate(shift.date || shift.service_date);
  if (date !== dateStr) return false;
  const interval = shiftDateTime(shift);
  if (!interval) return false;
  const boundary = new Date(`${dateStr}T${clockTime}:00`);
  return interval.end > boundary;
}

function shiftWithinWindow(shift, windowStartTime, windowEndTime) {
  const date = asIsoDate(shift.date || shift.service_date);
  if (!date || !windowStartTime || !windowEndTime) return null;
  const shiftStart = parseClockMinutes(shift.start_time);
  let shiftEnd = parseClockMinutes(shift.end_time);
  const windowStart = parseClockMinutes(windowStartTime);
  let windowEnd = parseClockMinutes(windowEndTime);
  if ([shiftStart, shiftEnd, windowStart, windowEnd].some(v => v === null)) return null;
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
  if (windowEnd <= windowStart) windowEnd += 24 * 60;
  return shiftStart >= windowStart && shiftEnd <= windowEnd;
}

function hasContractModel(body, shift, names) {
  const values = [
    body.contract_model, body.contract_type, body.employment_contract_model,
    shift.contract_model, shift.contract_type, shift.employment_contract_model
  ].filter(Boolean).map(v => String(v).toLowerCase());
  return values.some(value => names.some(name => value.includes(name)));
}

function isGeneralReserveEmployee(body) {
  return booleanOrNull(
    body.is_general_reserve_employee ??
    body.general_reserve_employee ??
    body.general_reserve_2013_choice_confirmed ??
    body.employee_general_reserve_status
  ) === true;
}

function addManualReview(manualReviewItems, ruleId, domain, message, field = null) {
  manualReviewItems.push({
    rule_id: ruleId,
    domain,
    message,
    field,
    manual_review_required: true
  });
}

function resolveAgreedPeriodHours(body) {
  return numberOrNull(
    body.contract_hours_per_period ??
    body.agreed_hours_per_period ??
    body.arbeidsduur_per_loonperiode ??
    body.period_contract_hours ??
    body.contract_period_hours
  );
}

function maxMinusHoursBalanceForPeriod(periodStart) {
  const year = Number(String(periodStart || '').slice(0, 4));
  if (!Number.isFinite(year)) {
    return {
      max_balance: 40,
      source_rule_id: 'CAO-PB-2024-R0602',
      schedule_year: null
    };
  }
  if (year <= 2018) return { max_balance: 80, source_rule_id: 'CAO-PB-2024-R0598', schedule_year: year };
  if (year === 2019) return { max_balance: 70, source_rule_id: 'CAO-PB-2024-R0599', schedule_year: year };
  if (year === 2020) return { max_balance: 60, source_rule_id: 'CAO-PB-2024-R0600', schedule_year: year };
  if (year === 2021) return { max_balance: 50, source_rule_id: 'CAO-PB-2024-R0601', schedule_year: year };
  return { max_balance: 40, source_rule_id: 'CAO-PB-2024-R0602', schedule_year: year };
}

function buildReferenceShifts(body, serviceShifts) {
  const referenceShifts = [
    ...normalizeArray(body.reference_shifts),
    ...normalizeArray(body.rolling_reference_shifts),
    ...normalizeArray(body.historical_shifts),
    ...serviceShifts
  ];
  const seen = new Set();
  return referenceShifts.filter(shift => {
    const key = shift.id || `${shift.date || shift.service_date || ''}|${shift.start_time || ''}|${shift.end_time || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !!(shift.date || shift.service_date);
  });
}

function weeklyHoursFromShifts(shifts) {
  const weekly = {};
  for (const shift of shifts) {
    const date = asIsoDate(shift.date || shift.service_date);
    if (!date) continue;
    const key = getIsoWeekKey(date);
    weekly[key] = (weekly[key] || 0) + calculateShiftHours({ ...shift, date });
  }
  return weekly;
}

function maxRollingWeeklyAverage(weeklyHours, windowSize) {
  const keys = Object.keys(weeklyHours).sort();
  if (keys.length < windowSize) return null;
  let maxAverage = 0;
  let maxWindow = [];
  for (let i = 0; i <= keys.length - windowSize; i++) {
    const windowKeys = keys.slice(i, i + windowSize);
    const total = windowKeys.reduce((sum, key) => sum + (weeklyHours[key] || 0), 0);
    const average = total / windowSize;
    if (average > maxAverage) {
      maxAverage = average;
      maxWindow = windowKeys;
    }
  }
  return {
    average_hours_per_week: round2(maxAverage),
    week_keys: maxWindow
  };
}

function nightWorkHoursBetween00And06(shift) {
  const start = parseClockMinutes(shift.start_time);
  let end = parseClockMinutes(shift.end_time);
  if (start === null || end === null) return 0;
  if (end <= start) end += 24 * 60;
  let total = 0;
  const maxOffset = Math.ceil(end / 1440);
  for (let offset = 0; offset <= maxOffset; offset++) {
    const nightStart = offset * 1440;
    const nightEnd = nightStart + 360;
    const overlap = Math.min(end, nightEnd) - Math.max(start, nightStart);
    if (overlap > 0) total += overlap / 60;
  }
  return total;
}

function shiftHasContractContext(shift) {
  return !!(
    shift.company_id ||
    shift.route_id ||
    shift.task_id ||
    shift.service_context ||
    shift.service_function_type ||
    shift.function_type ||
    shift.cao_function_group ||
    shift.required_cao_function_group ||
    shift.cao_function_level ||
    shift.required_cao_function_level ||
    shift.task_type ||
    shift.customer_billable !== undefined ||
    shift.counts_toward_required_staffing !== undefined ||
    shift.internship_practice_trainer_personnel_id ||
    shift.internship_mentor_personnel_id ||
    shift.internship_one_to_one_guidance_confirmed !== undefined ||
    shift.internship_uniform_label_confirmed !== undefined ||
    shift.contract_assignment_policy
  );
}

function validateSchedule(shifts, periodStart, periodEnd, caoScope, body = {}) {
  const violations = [];
  const warnings = [];
  const skippedRules = [];
  const payrollEntitlements = [];
  const payrollAdjustments = [];
  const manualReviewItems = [];
  const missingEvidence = [];
  const caoEvidenceMode = body.cao_evidence_mode || (body.enforce_cao_evidence === true ? 'strict' : 'advisory');

  const periodShifts = shifts.filter(s => s.date >= periodStart && s.date <= periodEnd);
  const serviceShifts = periodShifts.filter(s => !(s.is_time_window === true || s.roster_block_type === 'time_window' || s.block_type === 'time_window'));
  const referenceServiceShifts = buildReferenceShifts(body, serviceShifts);
  const serviceIntervals = serviceIntervalsFromShifts(serviceShifts);
  const referenceServiceIntervals = serviceIntervalsFromShifts(referenceServiceShifts);
  const serviceNightShiftDetails = nightShiftDetailsFromIntervals(serviceIntervals, body);
  const referenceNightShiftDetails = nightShiftDetailsFromIntervals(referenceServiceIntervals, body);
  const timeWindows = getRosterTimeWindows(body, periodStart, periodEnd, periodShifts);
  const periodDistance = daysBetween(periodEnd, periodStart);
  const periodDayCount = periodDistance !== null ? periodDistance + 1 : null;
  const schedulePublishedAt = body.schedule_published_at || body.roster_published_at || body.roster_publication_datetime || null;
  const weeklySchedulePublishedAt = body.weekly_schedule_published_at || body.weekly_roster_published_at || null;
  const isGeneralReserve = isGeneralReserveEmployee(body);
  const youthWorkerSummary = resolveYouthWorkerArticle30(body, periodStart);
  const breakSummaryRows = [];
  let noBreakExceptionApplied = false;
  let noBreakSixteenWeekAverage = null;

  if (isGeneralReserve) {
    skippedRules.push({
      rule_id: 'CAO-PB-2024-R0605',
      reason: 'Werknemer algemene reserve: artikel 21 is niet van toepassing; artikel 25-roosterregels gelden in plaats daarvan.'
    });
  }

  if (!isGeneralReserve && isRuleApplicable('CAO-PB-2024-R0561', caoScope)) {
    if (!periodShifts.length && !timeWindows.length) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0561', severity: 'medium',
        message: 'Geen tijdvakken of arbeidstijd ingepland voor deze loonperiode.',
        affected_shift_ids: [], payroll_impact: false, manual_review_required: false
      });
    }
    if (!schedulePublishedAt) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0561', 'roster_publication', 'Leg vast wanneer het 28-dagenrooster is gepubliceerd; de CAO vereist publicatie op donderdag.', 'schedule_published_at');
      missingEvidence.push({ rule_id: 'CAO-PB-2024-R0561', field: 'schedule_published_at' });
    } else if (!isThursday(schedulePublishedAt)) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0561',
        severity: 'medium',
        message: 'Het 28-dagenrooster is niet op donderdag gepubliceerd.',
        schedule_published_at: schedulePublishedAt,
        payroll_impact: false,
        manual_review_required: true
      });
    }
    if (periodDayCount !== null && periodDayCount !== 28) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0561',
        severity: 'medium',
        message: `Deze roostercontrole beslaat ${periodDayCount} dagen; artikel 21 gaat uit van een 28-dagenrooster/loonperiode.`,
        payroll_impact: false,
        manual_review_required: true
      });
    }
  }

  if (!isGeneralReserve && weeklySchedulePublishedAt && !isThursday(weeklySchedulePublishedAt)) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0568',
      severity: 'medium',
      message: 'De weekindeling/diensten voor de komende week zijn niet op donderdag gepubliceerd.',
      weekly_schedule_published_at: weeklySchedulePublishedAt,
      payroll_impact: false,
      manual_review_required: true
    });
  } else if (!isGeneralReserve && !weeklySchedulePublishedAt) {
    addManualReview(manualReviewItems, 'CAO-PB-2024-R0568', 'weekly_roster_publication', 'Leg vast wanneer de weekindeling met diensten is gepubliceerd.', 'weekly_schedule_published_at');
    missingEvidence.push({ rule_id: 'CAO-PB-2024-R0568', field: 'weekly_schedule_published_at' });
  }

  let totalHours = 0, totalShifts = 0;
  const shiftIds = [];
  for (const shift of serviceShifts) {
    totalHours += calculateShiftHours(shift);
    totalShifts++;
    if (shift.id) shiftIds.push(shift.id);
  }

  let totalTimeWindowHours = 0;
  const timeWindowIds = [];
  for (const window of timeWindows) {
    const hours = durationHoursForTimes(window.start_time, window.end_time);
    if (hours !== null) totalTimeWindowHours += hours;
    if (window.id) timeWindowIds.push(window.id);

    if (isGeneralReserve) continue;

    const affected = window.id ? [window.id] : [];
    if (!isWholeHour(window.start_time)) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0563',
        severity: 'high',
        message: `Tijdvak ${window.date || ''} start niet op een heel uur (${window.start_time || 'onbekend'}).`,
        affected_shift_ids: affected,
        payroll_impact: false,
        manual_review_required: false
      });
    }
    if (hours === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0563', 'time_window', 'Tijdvakduur kan niet worden gecontroleerd omdat start- of eindtijd ontbreekt.', 'time_window_start/end');
    } else if (hours > 10) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0563',
        severity: 'high',
        message: `Tijdvak ${window.date} duurt ${round2(hours)} uur; maximaal 10 uur toegestaan.`,
        affected_shift_ids: affected,
        payroll_impact: false,
        time_window_hours: round2(hours),
        manual_review_required: false
      });
    }
  }

  const rosterBlockCount = totalShifts + timeWindows.length;
  const rosterBlockHours = totalHours + totalTimeWindowHours;

  if (!isGeneralReserve && isRuleApplicable('CAO-PB-2024-R0562', caoScope)) {
    if (rosterBlockCount > 20) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0562', severity: 'high',
        message: `${rosterBlockCount} tijdvakken en/of arbeidstijdblokken ingepland; maximaal 20 per loonperiode.`,
        affected_shift_ids: [...shiftIds, ...timeWindowIds], payroll_impact: true, manual_review_required: true
      });
    }
  }

  const parttimePercentage = normalizePercentage(body.parttime_percentage ?? body.contract_parttime_percentage ?? body.contract_percentage);
  const isParttimeFixedModel = hasContractModel(body, {}, ['parttime_fixed', 'parttime_vast', 'vast_model']);
  if (!isGeneralReserve && isParttimeFixedModel) {
    if (parttimePercentage === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0565', 'parttime_fixed_model', 'Parttime vast model herkend, maar parttimepercentage ontbreekt voor de max-urencontrole.', 'parttime_percentage');
      missingEvidence.push({ rule_id: 'CAO-PB-2024-R0565', field: 'parttime_percentage' });
    } else {
      const maxRosterHours = parttimePercentage * 200;
      if (rosterBlockHours > maxRosterHours) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0565',
          severity: 'high',
          message: `Parttime vast model overschrijdt maximum tijdvakken/arbeidstijd (${round2(rosterBlockHours)}u > ${round2(maxRosterHours)}u).`,
          affected_shift_ids: [...shiftIds, ...timeWindowIds],
          payroll_impact: true,
          roster_block_hours: round2(rosterBlockHours),
          max_roster_block_hours: round2(maxRosterHours),
          manual_review_required: false
        });
      }
    }
  }

  if (totalHours > 144 && booleanOrNull(body.employee_over_144_hours_consent_confirmed ?? body.employee_overtime_consent_confirmed) !== true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0588',
      severity: 'high',
      message: `${round2(totalHours)} uur arbeidstijd in deze loonperiode; boven 144 uur mag alleen met instemming van de werknemer.`,
      affected_shift_ids: shiftIds,
      payroll_impact: true,
      total_hours: round2(totalHours),
      required_consent_field: 'employee_over_144_hours_consent_confirmed',
      manual_review_required: true
    });
  }

  const overtimeHours = Math.max(0, totalHours - 152);
  if (isRuleApplicable('CAO-PB-2024-R0590', caoScope)) {
    if (overtimeHours > 0) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0590', severity: 'high',
        message: `${Math.round(overtimeHours * 10) / 10} uur overwerk boven 152 uur per loonperiode. Toeslag 50% vereist (art. 42).`,
        affected_shift_ids: shiftIds, payroll_impact: true,
        overtime_hours: Math.round(overtimeHours * 10) / 10, manual_review_required: false
      });
      if (booleanOrNull(body.overtime_highest_necessity_limited_confirmed) !== true) {
        addManualReview(manualReviewItems, 'CAO-PB-2024-R0591', 'overtime_policy', 'Leg vast dat overwerk tot het hoogst noodzakelijke is beperkt.', 'overtime_highest_necessity_limited_confirmed');
      }
    }
  } else if (overtimeHours > 0) {
    skippedRules.push({
      rule_id: 'CAO-PB-2024-R0590',
      reason: 'Overwerktoeslag (art. 42 / hoofdstuk 4) niet van toepassing: medewerker valt onder artikel 3 lid 2 CAO PB.',
      note: `${Math.round(overtimeHours * 10) / 10} uur boven 152h gesignaleerd - geen automatische toeslag.`
    });
    warnings.push(`${Math.round(overtimeHours * 10) / 10} uur boven 152h in deze periode. Overwerktoeslag (art. 42) niet van toepassing (art. 3 lid 2).`);
  }

  const agreedPeriodHours = resolveAgreedPeriodHours(body);
  const previousMinusHoursBalance = numberOrNull(body.previous_minus_hours_balance ?? body.minus_hours_balance_before_period) ?? 0;
  const recoveredMinusHours = numberOrNull(
    body.recovered_minus_hours_this_period ??
    body.minus_hours_recovered_this_period ??
    body.minus_hours_makeup_hours
  ) ?? 0;
  const baseHourlyRate = numberOrNull(body.base_hourly_rate ?? body.base_hourly_wage ?? body.hourly_wage);
  const minusHoursGenerated = agreedPeriodHours !== null ? Math.max(0, agreedPeriodHours - totalHours) : null;
  const minusHoursBalanceInfo = maxMinusHoursBalanceForPeriod(periodStart);
  const minusHoursBalanceAfterPeriod = minusHoursGenerated !== null
    ? Math.max(0, previousMinusHoursBalance + minusHoursGenerated - recoveredMinusHours)
    : null;

  if (agreedPeriodHours === null) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0593',
      'minus_hours',
      'Contractuele arbeidsduur per loonperiode ontbreekt; minuren kunnen niet worden vastgesteld.',
      'contract_hours_per_period'
    );
    missingEvidence.push({ rule_id: 'CAO-PB-2024-R0593', field: 'contract_hours_per_period' });
  } else if (minusHoursGenerated > 0) {
    payrollEntitlements.push({
      rule_id: 'CAO-PB-2024-R0593',
      type: 'minus_hours_paid_current_period',
      agreed_period_hours: round2(agreedPeriodHours),
      worked_period_hours: round2(totalHours),
      minus_hours: round2(minusHoursGenerated),
      base_hourly_rate: baseHourlyRate,
      amount: baseHourlyRate !== null ? round2(minusHoursGenerated * baseHourlyRate) : null,
      message: 'Minuren ontstaan in deze loonperiode en moeten in deze loonperiode worden betaald.'
    });
    if (minusHoursGenerated > 24) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0597',
        severity: 'high',
        message: `${round2(minusHoursGenerated)} minuren opgebouwd in deze loonperiode; maximaal 24 minuren per loonperiode toegestaan.`,
        payroll_impact: true,
        minus_hours: round2(minusHoursGenerated),
        max_minus_hours_per_period: 24,
        manual_review_required: false
      });
    }
  }

  if (recoveredMinusHours > 0) {
    payrollAdjustments.push({
      rule_id: 'CAO-PB-2024-R0595',
      type: 'minus_hours_recovery_no_second_payment',
      recovered_minus_hours: round2(recoveredMinusHours),
      message: 'Ingehaalde minuren worden niet nog eens betaald, omdat ze in de ontstaanperiode al zijn betaald.'
    });
    if (totalHours >= 144 && booleanOrNull(body.minus_hours_recovery_consultation_confirmed) !== true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0596',
        severity: 'medium',
        message: `Inhalen van minuren vanaf 144 uur per loonperiode vereist overleg; ${round2(totalHours)} uur arbeidstijd gepland.`,
        payroll_impact: true,
        total_hours: round2(totalHours),
        recovered_minus_hours: round2(recoveredMinusHours),
        manual_review_required: true
      });
    }
    if (isParttimeFixedModel && booleanOrNull(body.parttime_fixed_minus_hours_recovery_consent_confirmed) !== true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0603',
        severity: 'high',
        message: 'Parttimer met vast model mag minuren alleen inhalen als werknemer daarmee instemt.',
        payroll_impact: true,
        recovered_minus_hours: round2(recoveredMinusHours),
        required_consent_field: 'parttime_fixed_minus_hours_recovery_consent_confirmed',
        manual_review_required: true
      });
    }
  }

  if (minusHoursBalanceAfterPeriod !== null && minusHoursBalanceAfterPeriod > minusHoursBalanceInfo.max_balance) {
    violations.push({
      rule_id: minusHoursBalanceInfo.source_rule_id,
      severity: 'high',
      message: `Minurensaldo na deze loonperiode is ${round2(minusHoursBalanceAfterPeriod)} uur; maximaal ${minusHoursBalanceInfo.max_balance} uur toegestaan voor ${minusHoursBalanceInfo.schedule_year || 'deze periode'}.`,
      payroll_impact: true,
      previous_minus_hours_balance: round2(previousMinusHoursBalance),
      generated_minus_hours: round2(minusHoursGenerated),
      recovered_minus_hours: round2(recoveredMinusHours),
      minus_hours_balance_after_period: round2(minusHoursBalanceAfterPeriod),
      max_minus_hours_balance: minusHoursBalanceInfo.max_balance,
      manual_review_required: false
    });
  }

  const specialWorkingTimeException = booleanOrNull(
    body.special_working_time_exception_confirmed ??
    body.special_circumstances_working_time_exception_confirmed
  ) === true;
  if (specialWorkingTimeException && !body.special_working_time_exception_reason && !body.unexpected_incidental_circumstance_reason && !body.nature_of_work_short_term_necessity_reason) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0630',
      'working_time_exception',
      'Bijzondere omstandigheden zijn aangevinkt, maar de grondslag ontbreekt: onverwachte incidentele wijziging of aard van het werk voor korte tijd noodzakelijk.',
      'special_working_time_exception_reason'
    );
  }

  const weeklyHours = weeklyHoursFromShifts(referenceServiceShifts);
  const weeklyHourRows = Object.entries(weeklyHours).map(([week_key, hours]) => ({ week_key, hours: round2(hours) }));
  for (const row of weeklyHourRows) {
    if (row.hours > 60) {
      violations.push({
        rule_id: specialWorkingTimeException ? 'CAO-PB-2024-R0635' : 'CAO-PB-2024-R0626',
        severity: 'high',
        message: `${row.hours} uur gepland in ${row.week_key}; maximaal 60 uur per week toegestaan.`,
        payroll_impact: true,
        week_key: row.week_key,
        week_hours: row.hours,
        max_week_hours: 60,
        manual_review_required: false
      });
    }
  }

  for (const shift of serviceShifts) {
    const hours = calculateShiftHours(shift);
    const maxShiftHours = specialWorkingTimeException ? 12 : 10;
    if (hours > maxShiftHours) {
      violations.push({
        rule_id: specialWorkingTimeException ? 'CAO-PB-2024-R0634' : 'CAO-PB-2024-R0625',
        severity: 'high',
        message: `Dienst ${shift.date} duurt ${round2(hours)} uur; maximaal ${maxShiftHours} uur toegestaan${specialWorkingTimeException ? ' bij bijzondere omstandigheden' : ''}.`,
        affected_shift_ids: shift.id ? [shift.id] : [],
        payroll_impact: true,
        shift_hours: round2(hours),
        max_shift_hours: maxShiftHours,
        manual_review_required: false
      });
    }
    const nightHours = nightWorkHoursBetween00And06(shift);
    if (nightHours > 0 && hours > 10) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0638',
        severity: 'high',
        message: `Dienst ${shift.date} raakt de nachtperiode en duurt ${round2(hours)} uur; maximaal 10 uur per nachtdienst volgens artikel 26.`,
        affected_shift_ids: shift.id ? [shift.id] : [],
        payroll_impact: true,
        shift_hours: round2(hours),
        night_hours_00_06: round2(nightHours),
        max_night_shift_hours: 10,
        manual_review_required: false
      });
    }
  }

  const explicitAverage4 = numberOrNull(body.average_hours_4_week_reference ?? body.max_average_hours_4_week_reference);
  const rollingAverage4 = explicitAverage4 !== null
    ? { average_hours_per_week: explicitAverage4, week_keys: [] }
    : maxRollingWeeklyAverage(weeklyHours, 4);
  if (!specialWorkingTimeException) {
    if (rollingAverage4 === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0627', 'working_time_average', 'Lever 4 aaneengesloten weken referentieuren aan om gemiddeld maximaal 55 uur per week te controleren.', 'reference_shifts');
    } else if (rollingAverage4.average_hours_per_week > 55) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0627',
        severity: 'high',
        message: `Gemiddelde arbeidstijd is ${round2(rollingAverage4.average_hours_per_week)} uur per week in 4 weken; maximaal 55 uur toegestaan.`,
        payroll_impact: true,
        average_hours_per_week: round2(rollingAverage4.average_hours_per_week),
        max_average_hours_per_week: 55,
        week_keys: rollingAverage4.week_keys,
        manual_review_required: false
      });
    }
  }

  const explicitAverage16 = numberOrNull(body.average_hours_16_week_reference ?? body.max_average_hours_16_week_reference);
  const rollingAverage16 = explicitAverage16 !== null
    ? { average_hours_per_week: explicitAverage16, week_keys: [] }
    : maxRollingWeeklyAverage(weeklyHours, 16);
  if (!specialWorkingTimeException) {
    if (rollingAverage16 === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0628', 'working_time_average', 'Lever 16 aaneengesloten weken referentieuren aan om gemiddeld maximaal 48 uur per week te controleren.', 'rolling_16_week_reference_shifts');
    } else if (rollingAverage16.average_hours_per_week > 48) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0628',
        severity: 'high',
        message: `Gemiddelde arbeidstijd is ${round2(rollingAverage16.average_hours_per_week)} uur per week in 16 weken; maximaal 48 uur toegestaan.`,
        payroll_impact: true,
        average_hours_per_week: round2(rollingAverage16.average_hours_per_week),
        max_average_hours_per_week: 48,
        week_keys: rollingAverage16.week_keys,
        manual_review_required: false
      });
    }
  }

  const explicitAverage13 = numberOrNull(body.average_hours_13_week_reference ?? body.max_average_hours_13_week_reference);
  const rollingAverage13 = explicitAverage13 !== null
    ? { average_hours_per_week: explicitAverage13, week_keys: [] }
    : maxRollingWeeklyAverage(weeklyHours, 13);
  if (specialWorkingTimeException) {
    if (rollingAverage13 === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0636', 'working_time_exception', 'Lever 13 aaneengesloten weken referentieuren aan om de bijzondere-omstandighedenlimiet van gemiddeld 48 uur te controleren.', 'rolling_13_week_reference_shifts');
    } else if (rollingAverage13.average_hours_per_week > 48) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0636',
        severity: 'high',
        message: `Bij bijzondere omstandigheden is het gemiddelde ${round2(rollingAverage13.average_hours_per_week)} uur per week in 13 weken; maximaal 48 uur toegestaan.`,
        payroll_impact: true,
        average_hours_per_week: round2(rollingAverage13.average_hours_per_week),
        max_average_hours_per_week: 48,
        week_keys: rollingAverage13.week_keys,
        manual_review_required: false
      });
    }
  }

  const hasNightWork = referenceNightShiftDetails.length > 0;
  const explicitNightAverage13 = numberOrNull(body.night_average_hours_13_week_reference ?? body.average_hours_13_week_night_reference);
  const nightAverage13 = explicitNightAverage13 !== null
    ? { average_hours_per_week: explicitNightAverage13, week_keys: [] }
    : rollingAverage13;
  if (hasNightWork) {
    if (nightAverage13 === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0639', 'night_working_time_average', 'Lever 13 weken referentieuren aan om de nachtdienstlimiet van gemiddeld 38 uur per week te controleren.', 'night_average_hours_13_week_reference');
    } else if (nightAverage13.average_hours_per_week > 38) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0639',
        severity: 'high',
        message: `Bij nachtdiensten is het gemiddelde ${round2(nightAverage13.average_hours_per_week)} uur per week in 13 weken; maximaal 38 uur toegestaan.`,
        payroll_impact: true,
        average_hours_per_week: round2(nightAverage13.average_hours_per_week),
        max_average_hours_per_week: 38,
        week_keys: nightAverage13.week_keys,
        manual_review_required: false
      });
    }
  }

  for (const detail of serviceNightShiftDetails) {
    const nightShiftMaxHours = specialWorkingTimeException ? 10 : 9;
    const employeeConsentForLongNightShift = booleanOrNull(
      detail.shift.night_shift_over_9_hours_employee_consent_confirmed ??
      detail.shift.employee_long_night_shift_consent_confirmed ??
      body.night_shift_over_9_hours_employee_consent_confirmed ??
      body.employee_long_night_shift_consent_confirmed
    ) === true;
    const mayExceedNineByConsent = !specialWorkingTimeException &&
      detail.starts_between_00_06 &&
      employeeConsentForLongNightShift;

    if (detail.hours > nightShiftMaxHours && !mayExceedNineByConsent) {
      violations.push({
        rule_id: specialWorkingTimeException ? 'CAO-PB-2024-R0666' : 'CAO-PB-2024-R0649',
        severity: 'high',
        message: specialWorkingTimeException
          ? `Nachtdienst ${detail.date} duurt ${round2(detail.hours)} uur; bij bijzondere omstandigheden is maximaal 10 uur per nachtdienst toegestaan.`
          : `Nachtdienst ${detail.date} duurt ${round2(detail.hours)} uur; maximaal 9 uur toegestaan, tenzij een nachtdienst die tussen 00.00 en 06.00 begint vrijwillig langer wordt gewerkt.`,
        affected_shift_ids: detail.shift_id ? [detail.shift_id] : [],
        payroll_impact: true,
        shift_hours: round2(detail.hours),
        night_hours_00_06: round2(detail.night_hours_00_06),
        max_night_shift_hours: nightShiftMaxHours,
        starts_between_00_06: detail.starts_between_00_06,
        employee_consent_confirmed: employeeConsentForLongNightShift,
        manual_review_required: detail.starts_between_00_06 && !employeeConsentForLongNightShift
      });
    }
  }

  const inferredNightBounds = dateBoundsFromIntervals(
    referenceServiceIntervals,
    body.night_reference_period_start || body.working_time_reference_period_start || body.rolling_reference_period_start,
    body.night_reference_period_end || body.working_time_reference_period_end || body.rolling_reference_period_end
  );
  const nightBounds = {
    start: inferredNightBounds.start || periodStart,
    end: inferredNightBounds.end || periodEnd
  };
  const nightWeekRows = isoWeekRowsBetween(nightBounds.start, nightBounds.end);
  const nightSixteenWeekWindows = rollingWeekWindows(nightWeekRows, 16).map(window => {
    const details = shiftsWithinWindowByStart(referenceNightShiftDetails, window.start, window.end_exclusive);
    const hours = weeklyHourRows
      .filter(row => window.week_keys.includes(row.week_key))
      .reduce((sum, row) => sum + row.hours, 0);
    return {
      week_keys: window.week_keys,
      night_shift_count: details.length,
      average_hours_per_week: round2(hours / 16),
      compliant: details.length < 16 || hours / 16 <= 38
    };
  });
  const failingNightSixteenWeekWindows = nightSixteenWeekWindows.filter(row => !row.compliant);
  if (hasNightWork && nightSixteenWeekWindows.length === 0) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0650',
      'night_shift_average_16_weeks',
      'Lever 16 aaneengesloten weken referentieuren aan om de 38 uur/week grens bij 16 of meer nachtdiensten te controleren.',
      'night_reference_period/reference_shifts'
    );
  } else if (failingNightSixteenWeekWindows.length > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0650',
      severity: 'high',
      message: 'Bij minimaal 16 nachtdiensten in 16 weken is de gemiddelde arbeidstijd hoger dan 38 uur per week.',
      payroll_impact: true,
      failing_16_week_windows: failingNightSixteenWeekWindows.slice(0, 5),
      manual_review_required: false
    });
  }

  const nightTwoWeekWindows = rollingWeekWindows(nightWeekRows, 2).map(window => ({
    week_keys: window.week_keys,
    start: formatIsoDateLocal(window.start),
    end_exclusive: formatIsoDateLocal(window.end_exclusive),
    night_hours_00_06: round2(nightHoursWithinWindow(referenceServiceIntervals, window.start, window.end_exclusive))
  }));
  const nightThirteenWeekWindows = rollingWeekWindows(nightWeekRows, 13).map(window => {
    const details = shiftsWithinWindowByStart(referenceNightShiftDetails, window.start, window.end_exclusive);
    const relevantTwoWeekWindows = nightTwoWeekWindows.filter(row => window.week_keys.some(key => row.week_keys.includes(key)));
    const maxTwoWeekNightHours = relevantTwoWeekWindows.reduce((max, row) => Math.max(max, row.night_hours_00_06), 0);
    const allEndOnOrBefore0200 = details.length > 0 && details.every(detail => detail.ends_on_or_before_0200);
    const mobileNightCount = details.filter(detail => detail.mobile_surveillance).length;
    const mobileDominant = booleanOrNull(body.night_shift_mainly_mobile_surveillance ?? body.mobile_surveillance_night_work) === true ||
      (details.length > 0 && mobileNightCount / details.length >= 0.5);
    return {
      week_keys: window.week_keys,
      night_shift_count: details.length,
      all_night_shifts_end_on_or_before_0200: allEndOnOrBefore0200,
      mobile_surveillance_dominant: mobileDominant,
      max_two_week_night_hours_00_06: round2(maxTwoWeekNightHours),
      compliant_regular: details.length <= 32 || (allEndOnOrBefore0200 && details.length <= 52) || maxTwoWeekNightHours <= 20,
      compliant_mobile_surveillance: details.length <= 35 || maxTwoWeekNightHours <= 38
    };
  });

  if (hasNightWork && nightThirteenWeekWindows.length === 0) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0652',
      'night_shift_count_13_weeks',
      'Lever 13 aaneengesloten weken referentiegegevens aan om nachtdienstenaantallen en 2-weken-nachturen te controleren.',
      'night_reference_period/reference_shifts'
    );
  }
  const failingRegularNightWindows = nightThirteenWeekWindows
    .filter(row => !row.mobile_surveillance_dominant && !row.compliant_regular);
  if (failingRegularNightWindows.length > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0652',
      severity: 'high',
      message: 'Nachtdiensten overschrijden de artikel 28-limieten: meer dan 32 nachtdiensten per 13 weken, geen geldige 02.00 uur-uitwijk en meer dan 20 nachturen per 2 weken.',
      payroll_impact: true,
      related_rule_ids: ['CAO-PB-2024-R0653', 'CAO-PB-2024-R0654'],
      failing_13_week_windows: failingRegularNightWindows.slice(0, 5),
      manual_review_required: false
    });
  }
  const failingMobileNightWindows = nightThirteenWeekWindows
    .filter(row => row.mobile_surveillance_dominant && !row.compliant_mobile_surveillance);
  if (failingMobileNightWindows.length > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0656',
      severity: 'high',
      message: 'Mobiele-surveillance nachtdiensten overschrijden de artikel 28-limieten: meer dan 35 nachtdiensten per 13 weken en meer dan 38 nachturen per 2 weken.',
      payroll_impact: true,
      related_rule_ids: ['CAO-PB-2024-R0655', 'CAO-PB-2024-R0657'],
      failing_13_week_windows: failingMobileNightWindows.slice(0, 5),
      manual_review_required: false
    });
  }

  for (const detail of serviceNightShiftDetails) {
    const currentIndex = referenceServiceIntervals.findIndex(interval =>
      interval.shift_id === detail.shift_id ||
      (interval.date === detail.date && interval.start.getTime() === detail.start.getTime() && interval.end.getTime() === detail.end.getTime())
    );
    const next = referenceServiceIntervals
      .slice(Math.max(0, currentIndex + 1))
      .find(interval => interval.start >= detail.end);
    if (!next) continue;
    const restHours = hoursBetweenDates(next.start, detail.end);
    const minRestHours = detail.ends_on_or_before_0200 ? 11 : 14;
    if (restHours < minRestHours) {
      violations.push({
        rule_id: detail.ends_on_or_before_0200 ? 'CAO-PB-2024-R0659' : 'CAO-PB-2024-R0660',
        severity: 'high',
        message: `Rust na nachtdienst ${detail.date} is ${round2(restHours)} uur; minimaal ${minRestHours} uur onafgebroken rust vereist en inkorten is niet toegestaan.`,
        affected_shift_ids: [detail.shift_id, next.shift_id].filter(Boolean),
        payroll_impact: false,
        rest_hours: round2(restHours),
        min_rest_after_night_shift_hours: minRestHours,
        related_rule_ids: ['CAO-PB-2024-R0661'],
        manual_review_required: false
      });
    }
  }

  const nightSequences = nightShiftSequenceGroups(referenceNightShiftDetails);
  for (const sequence of nightSequences) {
    const intersectsPeriod = sequence.some(detail => detail.date >= periodStart && detail.date <= periodEnd);
    if (!intersectsPeriod) continue;
    if (sequence.length > 7) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0663',
        severity: 'high',
        message: `${sequence.length} nachtdiensten aaneengesloten ingepland; maximaal 7 toegestaan.`,
        affected_shift_ids: sequence.map(detail => detail.shift_id).filter(Boolean),
        payroll_impact: false,
        consecutive_night_shift_count: sequence.length,
        manual_review_required: false
      });
      continue;
    }
    if (sequence.length >= 3) {
      const last = sequence[sequence.length - 1];
      const next = referenceServiceIntervals.find(interval => interval.start >= last.end);
      if (!next) continue;
      const restHours = hoursBetweenDates(next.start, last.end);
      if (restHours < 48) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0662',
          severity: 'high',
          message: `Na ${sequence.length} aaneengesloten nachtdiensten is ${round2(restHours)} uur rust gepland; minimaal 48 uur vereist.`,
          affected_shift_ids: [...sequence.map(detail => detail.shift_id), next.shift_id].filter(Boolean),
          payroll_impact: false,
          consecutive_night_shift_count: sequence.length,
          rest_hours: round2(restHours),
          min_rest_after_consecutive_night_shifts_hours: 48,
          manual_review_required: false
        });
      }
    }
  }

  for (let i = 0; i < serviceIntervals.length - 1; i++) {
    const current = serviceIntervals[i];
    const next = serviceIntervals[i + 1];
    const restHours = hoursBetweenDates(next.start, current.end);
    if (restHours < 11) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0641',
        severity: 'high',
        message: `Dagelijkse rust tussen diensten is ${round2(restHours)} uur; minimaal 11 uur onafgebroken rust vereist.`,
        affected_shift_ids: [current.shift_id, next.shift_id].filter(Boolean),
        payroll_impact: false,
        rest_hours: round2(restHours),
        min_daily_rest_hours: 11,
        manual_review_required: false
      });
    }
  }

  const referencePeriodStart = asIsoDate(body.rest_reference_period_start || body.working_time_reference_period_start || periodStart);
  const referencePeriodEnd = asIsoDate(body.rest_reference_period_end || body.working_time_reference_period_end || periodEnd);
  const restReferenceDates = dateRange(referencePeriodStart, referencePeriodEnd);
  const sevenDayRestResults = [];
  const fourteenDayRestResults = [];
  for (let i = 0; i <= restReferenceDates.length - 7; i++) {
    const windowStartIso = restReferenceDates[i];
    const windowEndIso = addDays(windowStartIso, 7);
    const windowStart = dateFromIso(windowStartIso);
    const windowEnd = dateFromIso(windowEndIso);
    const maxRest = maxContinuousRestHoursWithinWindow(referenceServiceIntervals, windowStart, windowEnd);
    const ok = maxRest >= 36;
    sevenDayRestResults.push({ window_start: windowStartIso, window_end_exclusive: windowEndIso, max_continuous_rest_hours: round2(maxRest), compliant: ok });
  }
  for (let i = 0; i <= restReferenceDates.length - 14; i++) {
    const windowStartIso = restReferenceDates[i];
    const windowEndIso = addDays(windowStartIso, 14);
    const windowStart = dateFromIso(windowStartIso);
    const windowEnd = dateFromIso(windowEndIso);
    const blocks = restBlocksWithinWindow(referenceServiceIntervals, windowStart, windowEnd);
    const totalRest = blocks.reduce((sum, block) => sum + block.hours, 0);
    const maxRestBlock = blocks.reduce((max, block) => Math.max(max, block.hours), 0);
    const eligibleSplitRest = blocks
      .filter(block => block.hours >= 32)
      .reduce((sum, block) => sum + block.hours, 0);
    fourteenDayRestResults.push({
      window_start: windowStartIso,
      window_end_exclusive: windowEndIso,
      total_rest_hours: round2(totalRest),
      max_continuous_rest_hours: round2(maxRestBlock),
      eligible_split_rest_hours: round2(eligibleSplitRest),
      rest_block_hours: blocks.map(block => round2(block.hours)),
      compliant: maxRestBlock >= 72 || eligibleSplitRest >= 72
    });
  }
  const failingSevenDayWindows = sevenDayRestResults.filter(row => !row.compliant);
  const failingFourteenDayWindows = fourteenDayRestResults.filter(row => !row.compliant);
  if (restReferenceDates.length < 7) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0643',
      'weekly_rest',
      'Lever minimaal 7 dagen referentierooster aan om de 36 uur rust per 7 dagen te controleren.',
      'reference_shifts/rest_reference_period'
    );
  } else if (failingSevenDayWindows.length > 0 && restReferenceDates.length < 14) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0643',
      'weekly_rest',
      'Een 7-daags rustvenster haalt geen 36 uur; lever minimaal 14 dagen referentierooster aan om de 72 uur per 14 dagen-uitwijk te controleren.',
      'reference_shifts/rest_reference_period'
    );
  } else if (failingSevenDayWindows.length > 0 && failingFourteenDayWindows.length > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0643',
      severity: 'high',
      message: 'Geen geldige wekelijkse rust gevonden: ten minste 36 uur rust per 7 dagen ontbreekt en de 72 uur per 14 dagen-uitwijk voldoet ook niet.',
      payroll_impact: false,
      failing_7_day_windows: failingSevenDayWindows.slice(0, 5),
      failing_14_day_windows: failingFourteenDayWindows.slice(0, 5),
      manual_review_required: false
    });
  } else if (failingSevenDayWindows.length > 0 && failingFourteenDayWindows.length === 0) {
    warnings.push('Artikel 27: enkele 7-daagse vensters halen geen 36 uur rust, maar 14-daagse rust van ten minste 72 uur voldoet.');
  }
  const fourteenDaySplitViolations = fourteenDayRestResults.filter(row =>
    row.total_rest_hours >= 72 &&
    row.max_continuous_rest_hours < 72 &&
    row.eligible_split_rest_hours < 72
  );
  if (fourteenDaySplitViolations.length > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0645',
      severity: 'high',
      message: '14-daagse rust is opgesplitst in perioden korter dan 32 uur; dat is niet toegestaan.',
      payroll_impact: false,
      failing_14_day_windows: fourteenDaySplitViolations.slice(0, 5),
      manual_review_required: false
    });
  }

  const sundaysInPeriod = dateRange(periodStart, periodEnd).filter(date => dateFromIso(date)?.getDay() === 0);
  const workedSundaysThisPeriod = sundaysInPeriod.filter(date =>
    serviceIntervals.some(interval => intervalOverlapsIsoDate(interval, date))
  );
  const freeSundaysThisPeriod = sundaysInPeriod.filter(date => !workedSundaysThisPeriod.includes(date));
  const freeSundaysYtdBefore = numberOrNull(body.free_sundays_year_to_date_before_period ?? body.free_sundays_ytd_before_period);
  const freeSundaysYtd = numberOrNull(body.free_sundays_year_to_date ?? body.free_sundays_ytd);
  const freeSundaysAfterPeriod = freeSundaysYtd !== null
    ? freeSundaysYtd
    : freeSundaysYtdBefore !== null
    ? freeSundaysYtdBefore + freeSundaysThisPeriod.length
    : null;
  if (sundaysInPeriod.length > 0 && freeSundaysThisPeriod.length < 1) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0646',
      severity: 'medium',
      message: 'Deze loonperiode bevat geen vrije zondag; artikel 27 vereist minimaal 1 vrije zondag per loonperiode als onderdeel van het vrije weekend.',
      payroll_impact: false,
      sundays_in_period: sundaysInPeriod,
      worked_sundays_this_period: workedSundaysThisPeriod,
      manual_review_required: true
    });
  }
  if (freeSundaysAfterPeriod === null) {
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0646',
      'free_sundays',
      'Lever vrije-zondagen saldo jaar-tot-datum aan om minimaal 16 vrije zondagen per jaar te bewaken.',
      'free_sundays_year_to_date'
    );
  } else if (freeSundaysAfterPeriod < 16 && booleanOrNull(body.year_end_period) === true) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0646',
      severity: 'high',
      message: `Aantal vrije zondagen dit jaar is ${freeSundaysAfterPeriod}; minimaal 16 vereist.`,
      payroll_impact: false,
      free_sundays_year_to_date: freeSundaysAfterPeriod,
      min_free_sundays_per_year: 16,
      manual_review_required: false
    });
  }

  const start = new Date(periodStart), end = new Date(periodEnd);
  const allDates = [];
  let cur = new Date(start);
  while (cur <= end) { allDates.push(formatIsoDateLocal(cur)); cur.setDate(cur.getDate() + 1); }
  const occupiedDates = new Set([
    ...serviceShifts.map(s => asIsoDate(s.date || s.service_date)).filter(Boolean),
    ...timeWindows.map(w => asIsoDate(w.date)).filter(Boolean)
  ]);
  const freeDates = allDates.filter(d => !occupiedDates.has(d));
  const freeDaysCount = freeDates.length;

  if (!isGeneralReserve && isRuleApplicable('CAO-PB-2024-R0564', caoScope)) {
    if (freeDaysCount < 8) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0564', severity: 'high',
        message: `Slechts ${freeDaysCount} vrije dagen in deze loonperiode; minimaal 8 vereist.`,
        affected_shift_ids: [], payroll_impact: false, free_days_count: freeDaysCount, manual_review_required: true
      });
    } else {
      let consecutiveBlocks = 0, weekendBlockFound = false;
      for (let i = 0; i < freeDates.length - 1; i++) {
        const d1 = freeDates[i], d2 = freeDates[i + 1];
        if (new Date(d2) - new Date(d1) === 1000 * 60 * 60 * 24) {
          consecutiveBlocks++;
          if (isWeekendBlock(d1, d2)) weekendBlockFound = true;
        }
      }
      if (consecutiveBlocks < 2) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0564', severity: 'medium',
          message: `Onvoldoende blokken van 2 aaneengesloten vrije dagen (${consecutiveBlocks} gevonden, 2 vereist).`,
          affected_shift_ids: [], payroll_impact: false, manual_review_required: true
        });
      }
      if (!weekendBlockFound) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0564', severity: 'medium',
          message: 'Geen weekendblok (zaterdag + zondag vrij) gevonden in deze loonperiode.',
          affected_shift_ids: [], payroll_impact: false, manual_review_required: true
        });
      }
    }
  }

  if (isGeneralReserve) {
    payrollEntitlements.push({
      rule_id: 'CAO-PB-2024-R0606',
      type: 'general_reserve_allowance',
      allowance_percentage: 10,
      worked_period_hours: round2(totalHours),
      base_hourly_rate: baseHourlyRate,
      amount: baseHourlyRate !== null ? round2(totalHours * baseHourlyRate * 0.10) : null,
      message: 'Werknemer algemene reserve heeft recht op 10% toeslag op het basisuurloon en geen recht op verschuivingstoeslag.'
    });
    if (baseHourlyRate === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0606', 'general_reserve_allowance', 'Basisuurloon ontbreekt; 10% algemene-reservetoeslag kan niet definitief worden berekend.', 'base_hourly_rate');
    }

    const fixedFreeDays = uniqueSortedIsoDates(body.general_reserve_fixed_free_days || body.employer_fixed_free_days || body.general_reserve_employer_fixed_free_days);
    const fixedFreeDaysPublishedAt = asIsoDate(body.general_reserve_fixed_free_days_published_at || body.employer_fixed_free_days_published_at);
    const fixedFreeDaysDeadline = addDays(periodStart, -28);
    if (fixedFreeDays.length < 4) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0608',
        severity: 'medium',
        message: `Algemene reserve: werkgever moet 4 van de 8 vrije dagen vaststellen; ${fixedFreeDays.length} vastgelegd.`,
        payroll_impact: false,
        fixed_free_days_count: fixedFreeDays.length,
        manual_review_required: true
      });
    }
    if (!fixedFreeDaysPublishedAt) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0609', 'general_reserve_free_days', 'Leg vast wanneer de 4 door werkgever vastgestelde vrije dagen zijn meegedeeld.', 'general_reserve_fixed_free_days_published_at');
    } else if (fixedFreeDaysDeadline && fixedFreeDaysPublishedAt > fixedFreeDaysDeadline) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0609',
        severity: 'medium',
        message: `Algemene reserve: vaste vrije dagen zijn meegedeeld op ${fixedFreeDaysPublishedAt}; uiterlijk ${fixedFreeDaysDeadline} vereist.`,
        payroll_impact: false,
        manual_review_required: true
      });
    }

    const generalReservePreferenceRequests = normalizeArray(body.general_reserve_free_day_preference_requests || body.general_reserve_free_day_preference_request);
    for (const request of generalReservePreferenceRequests) {
      const requestDate = asIsoDate(request.request_date || request.submitted_at || request.created_at);
      const responseDate = asIsoDate(request.response_date || request.responded_at);
      const responseStatus = String(request.response_status || request.status || '').toLowerCase();
      const requestDeadline = addDays(periodStart, -35);
      const responseDeadline = addDays(periodStart, -28);
      if (!requestDate) {
        addManualReview(manualReviewItems, 'CAO-PB-2024-R0611', 'general_reserve_free_day_preference', 'Voorkeur voor 4 vrije dagen mist indieningsdatum.', 'general_reserve_free_day_preference_request_date');
      } else if (requestDeadline && requestDate > requestDeadline) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0611',
          severity: 'medium',
          message: `Algemene reserve: voorkeur vrije dagen ingediend op ${requestDate}; uiterlijk ${requestDeadline} vereist.`,
          payroll_impact: false,
          manual_review_required: true
        });
      }
      if (booleanOrNull(request.written_message_confirmed) !== true) {
        addManualReview(manualReviewItems, 'CAO-PB-2024-R0612', 'general_reserve_free_day_preference', 'Bevestig dat de voorkeur schriftelijk is gestuurd.', 'written_message_confirmed');
      }
      if (!responseDate || (responseDeadline && responseDate > responseDeadline)) {
        payrollEntitlements.push({
          rule_id: 'CAO-PB-2024-R0615',
          type: 'general_reserve_requested_free_days_definitive',
          request_date: requestDate,
          response_date: responseDate || null,
          response_deadline_date: responseDeadline,
          message: 'Werkgever reageerde niet tijdig; aangevraagde vrije dagen gelden voor algemene reserve als vrije dagen.'
        });
      }
      if ((responseStatus.includes('reject') || responseStatus.includes('afgewezen') || responseStatus.includes('objection') || responseStatus.includes('bezwaar')) &&
        normalizeArray(request.alternative_free_days).length < 1) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0614',
          severity: 'medium',
          message: 'Algemene reserve: bezwaar tegen vrije-dagenvoorkeur mist gelijktijdig aangewezen alternatieve vrije dagen.',
          payroll_impact: false,
          manual_review_required: true
        });
      }
    }

    const remainingFreeDays = uniqueSortedIsoDates(
      body.general_reserve_remaining_free_days ||
      body.general_reserve_other_free_days ||
      freeDates.filter(date => !fixedFreeDays.includes(date))
    );
    const remainingFreeDayBlocks = analyzeFreeDayBlocks(remainingFreeDays);
    if (remainingFreeDays.length < 4) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0616',
        severity: 'medium',
        message: `Algemene reserve: 4 overige vrije dagen moeten worden vastgesteld; ${remainingFreeDays.length} gevonden.`,
        payroll_impact: false,
        manual_review_required: true
      });
    }
    if (remainingFreeDayBlocks.consecutive_blocks < 2) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0617',
        severity: 'medium',
        message: `Algemene reserve: overige vrije dagen moeten 2 blokken van 2 aaneengesloten vrije dagen vormen; ${remainingFreeDayBlocks.consecutive_blocks} blokken gevonden.`,
        payroll_impact: false,
        manual_review_required: true
      });
    }
    if (!remainingFreeDayBlocks.weekend_block_found) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0618',
        severity: 'medium',
        message: 'Algemene reserve: onder de vrije-dagenblokken moet 1 vrij weekend zitten.',
        payroll_impact: false,
        manual_review_required: true
      });
    }

    const shiftedFreeDays = normalizeArray(body.general_reserve_shifted_free_days);
    for (const change of shiftedFreeDays) {
      const replacementDate = asIsoDate(change.replacement_date || change.new_free_day);
      if (!replacementDate || replacementDate < periodStart || replacementDate > periodEnd || booleanOrNull(change.consultation_confirmed) !== true) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0620',
          severity: 'medium',
          message: 'Algemene reserve: verschoven vrije dag vereist overleg en een vervangende vrije dag in dezelfde loonperiode.',
          payroll_impact: false,
          manual_review_required: true
        });
      }
    }
    const withdrawnFreeDays = normalizeArray(body.general_reserve_withdrawn_free_days);
    if (withdrawnFreeDays.length > 1) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0621',
        severity: 'high',
        message: `Algemene reserve: werkgever mag maximaal 1 van de 8 vrije dagen intrekken; ${withdrawnFreeDays.length} ingetrokken.`,
        payroll_impact: false,
        withdrawn_free_days_count: withdrawnFreeDays.length,
        manual_review_required: false
      });
    }
  } else {
    const freeDayPreferenceRequests = normalizeArray(body.free_day_preference_requests || body.free_day_preference_request);
    for (const request of freeDayPreferenceRequests) {
      const requestDate = asIsoDate(request.request_date || request.submitted_at || request.created_at);
      const responseDate = asIsoDate(request.response_date || request.responded_at);
      const responseStatus = String(request.response_status || request.status || '').toLowerCase();
      const deadline = addDays(periodStart, -35);
      const responseDeadline = requestDate ? nextThursdayOnOrAfter(requestDate) : null;
      if (!requestDate) {
        addManualReview(manualReviewItems, 'CAO-PB-2024-R0567', 'free_day_preference', 'Vrije-dagenvoorkeur mist indieningsdatum.', 'free_day_preference_request_date');
      } else if (deadline && requestDate > deadline) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0567',
          severity: 'medium',
          message: `Vrije-dagenvoorkeur is ingediend op ${requestDate}; uiterlijk ${deadline} vereist.`,
          payroll_impact: false,
          manual_review_required: true
        });
      }
      if (!responseDate || (responseDeadline && responseDate > responseDeadline)) {
        payrollEntitlements.push({
          rule_id: 'CAO-PB-2024-R0567',
          type: 'free_day_preference_definitive',
          request_date: requestDate,
          response_date: responseDate || null,
          response_deadline_date: responseDeadline,
          message: 'Werkgever reageerde niet tijdig; aangevraagde vrije dagen gelden als definitief vastgesteld.'
        });
      }
      if ((responseStatus.includes('reject') || responseStatus.includes('afgewezen')) && !request.rejection_reason && !request.reason) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0567',
          severity: 'medium',
          message: 'Afwijzing van vrije-dagenvoorkeur mist een reden.',
          payroll_impact: false,
          manual_review_required: true
        });
      }
    }
  }

  if (!isGeneralReserve) {
    for (const shift of serviceShifts) {
      const shiftHours = calculateShiftHours(shift);
      const shiftBreaks = normalizeShiftBreaks(shift);
      const qualifyingBreaks = shiftBreaks.filter(item => item.counts_for_cao_break);
      const qualifyingBreakHours = qualifyingBreaks.reduce((sum, item) => sum + item.duration_hours, 0);
      const longestQualifyingBreakHours = qualifyingBreaks.reduce((max, item) => Math.max(max, item.duration_hours), 0);
      const unpaidBreakHours = getUnpaidBreakHours(shift);
      const objectGuardOrReceptionist = shiftLooksObjectGuardOrReceptionist(shift, body);
      const noBreakException = shiftHasNoBreakException(shift, body);
      noBreakExceptionApplied = noBreakExceptionApplied || noBreakException;

      const row = {
        shift_id: shift.id || null,
        date: asIsoDate(shift.date || shift.service_date),
        shift_hours: round2(shiftHours),
        break_count: shiftBreaks.length,
        qualifying_break_count: qualifyingBreaks.length,
        qualifying_break_hours: round2(qualifyingBreakHours),
        longest_qualifying_break_hours: round2(longestQualifyingBreakHours),
        unpaid_break_hours: round2(unpaidBreakHours),
        paid_work_hours_after_unpaid_breaks: round2(Math.max(0, shiftHours - unpaidBreakHours)),
        object_guard_or_receptionist: objectGuardOrReceptionist,
        no_break_exception: noBreakException
      };
      breakSummaryRows.push(row);

      if (unpaidBreakHours > 0) {
        payrollAdjustments.push({
          rule_id: 'CAO-PB-2024-R0669',
          type: 'unpaid_break_excluded_from_paid_work_time',
          shift_id: shift.id || null,
          date: row.date,
          gross_shift_hours: round2(shiftHours),
          unpaid_break_hours: round2(unpaidBreakHours),
          paid_work_hours_after_unpaid_breaks: row.paid_work_hours_after_unpaid_breaks,
          message: 'Onbetaalde pauze telt niet als arbeidstijd en hoort niet als salarisdragende werktijd te worden meegenomen.'
        });
      }

      for (const breakItem of shiftBreaks) {
        if (breakItem.duration_hours === null) {
          addManualReview(
            manualReviewItems,
            'CAO-PB-2024-R0669',
            'break_duration',
            'Pauzeduur ontbreekt; artikel 29 vereist een pauze van minimaal 15 minuten en maximaal 1 uur.',
            'breaks.duration_minutes'
          );
          continue;
        }
        if (breakItem.duration_hours < 0.25 || breakItem.duration_hours > 1) {
          violations.push({
            rule_id: 'CAO-PB-2024-R0669',
            severity: 'medium',
            message: `Pauze in dienst ${row.date} duurt ${round2(breakItem.duration_hours)} uur; een pauze moet minimaal 15 minuten en maximaal 1 uur duren.`,
            affected_shift_ids: shift.id ? [shift.id] : [],
            payroll_impact: breakItem.paid !== true,
            break_hours: round2(breakItem.duration_hours),
            min_break_hours: 0.25,
            max_break_hours: 1,
            manual_review_required: false
          });
        }

        const placement = breakPlacementViolation(shift, breakItem);
        if (placement) {
          violations.push({
            rule_id: 'CAO-PB-2024-R0674',
            severity: 'medium',
            message: `Pauze in dienst ${row.date} valt in de eerste of laatste ${placement.edge_hours} uur van de dienst; dat is volgens artikel 29 niet toegestaan.`,
            affected_shift_ids: shift.id ? [shift.id] : [],
            payroll_impact: false,
            ...placement,
            manual_review_required: false
          });
        } else if (shiftHours > 5.5 && breakItem.duration_hours !== null && (!breakItem.start_time || !breakItem.end_time)) {
          addManualReview(
            manualReviewItems,
            'CAO-PB-2024-R0674',
            'break_placement',
            'Pauze heeft wel duur maar geen begin/eindtijd; ligging buiten eerste/laatste 2 of 3 uur kan niet worden gecontroleerd.',
            'breaks.start_time/end_time'
          );
        }
      }

      if (unpaidBreakHours > 1) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0569',
          severity: 'high',
          message: `Dienst ${row.date} heeft ${round2(unpaidBreakHours)} uur onbetaalde pauze/onderbreking; maximaal 1 uur binnen een dienst.`,
          affected_shift_ids: shift.id ? [shift.id] : [],
          payroll_impact: true,
          unpaid_break_hours: round2(unpaidBreakHours),
          manual_review_required: false
        });
      }

      if (noBreakException) {
        if (!shiftLooksSecurityGuard(shift, body)) {
          addManualReview(
            manualReviewItems,
            'CAO-PB-2024-R0676',
            'break_exception',
            'Geen-pauze uitzondering is gebruikt, maar de functie is niet duidelijk als beveiliger herkend.',
            'function_type/is_security_guard'
          );
        }
        continue;
      }

      if (shiftHours > 5.5 && shiftHours <= 8) {
        if (objectGuardOrReceptionist) {
          if (qualifyingBreaks.length < 2 || qualifyingBreaks.reduce((sum, item) => sum + item.duration_hours, 0) < 0.5) {
            violations.push({
              rule_id: 'CAO-PB-2024-R0671',
              severity: 'medium',
              message: `Objectbeveiliger/receptionist in dienst ${row.date} heeft recht op minimaal 2 pauzes van minimaal 15 minuten bij een dienst langer dan 5,5 uur en maximaal 8 uur.`,
              affected_shift_ids: shift.id ? [shift.id] : [],
              payroll_impact: false,
              break_summary: row,
              manual_review_required: false
            });
          }
        } else if (longestQualifyingBreakHours < 0.5) {
          violations.push({
            rule_id: 'CAO-PB-2024-R0671',
            severity: 'medium',
            message: `Dienst ${row.date} duurt ${round2(shiftHours)} uur; vereist is een pauze van een half uur achter elkaar.`,
            affected_shift_ids: shift.id ? [shift.id] : [],
            payroll_impact: false,
            break_summary: row,
            manual_review_required: false
          });
        }
      } else if (shiftHours > 8 && shiftHours <= 10) {
        if (qualifyingBreakHours < 0.75 || longestQualifyingBreakHours < 0.5) {
          violations.push({
            rule_id: 'CAO-PB-2024-R0672',
            severity: 'medium',
            message: `Dienst ${row.date} duurt ${round2(shiftHours)} uur; vereist is 45 minuten pauze totaal, waarvan 1 pauze minimaal 30 minuten.`,
            affected_shift_ids: shift.id ? [shift.id] : [],
            payroll_impact: false,
            break_summary: row,
            manual_review_required: false
          });
        }
      } else if (shiftHours > 10) {
        if (qualifyingBreakHours < 1 || longestQualifyingBreakHours < 0.5) {
          violations.push({
            rule_id: 'CAO-PB-2024-R0673',
            severity: 'medium',
            message: `Dienst ${row.date} duurt ${round2(shiftHours)} uur; vereist is 1 uur pauze totaal, waarvan 1 pauze minimaal 30 minuten.`,
            affected_shift_ids: shift.id ? [shift.id] : [],
            payroll_impact: false,
            break_summary: row,
            manual_review_required: false
          });
        }
      }
    }
  }

  if (noBreakExceptionApplied) {
    const explicitNoBreakAverage16 = numberOrNull(
      body.no_break_average_hours_16_week_reference ??
      body.break_exception_average_hours_16_week_reference ??
      body.average_hours_16_week_no_break_reference
    );
    noBreakSixteenWeekAverage = explicitNoBreakAverage16 !== null
      ? { average_hours_per_week: explicitNoBreakAverage16, week_keys: [] }
      : rollingAverage16;
    if (noBreakSixteenWeekAverage === null) {
      addManualReview(
        manualReviewItems,
        'CAO-PB-2024-R0677',
        'break_exception_average',
        'Geen-pauze uitzondering toegepast; lever 16 weken referentieuren aan om gemiddeld maximaal 38 uur per week te controleren.',
        'no_break_average_hours_16_week_reference/reference_shifts'
      );
    } else if (noBreakSixteenWeekAverage.average_hours_per_week > 38) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0677',
        severity: 'high',
        message: `Bij geen-pauze uitzondering is het gemiddelde ${round2(noBreakSixteenWeekAverage.average_hours_per_week)} uur per week in 16 weken; maximaal 38 uur toegestaan.`,
        payroll_impact: true,
        average_hours_per_week: round2(noBreakSixteenWeekAverage.average_hours_per_week),
        max_average_hours_per_week: 38,
        week_keys: noBreakSixteenWeekAverage.week_keys || [],
        manual_review_required: false
      });
    }
  }

  if (!isGeneralReserve) {
    for (const shift of serviceShifts) {
      const hours = calculateShiftHours(shift);
      if (hours > 10 && booleanOrNull(shift.voluntary_long_shift_confirmed ?? body.voluntary_long_shift_confirmed) !== true) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0571',
          severity: 'high',
          message: `Dienst ${shift.date} duurt ${round2(hours)} uur; langer dan 10 uur mag alleen vrijwillig.`,
          affected_shift_ids: shift.id ? [shift.id] : [],
          payroll_impact: true,
          shift_hours: round2(hours),
          manual_review_required: true
        });
      }
    }
  }

  const specialHolidayCategories = new Set();
  if (!isGeneralReserve) {
    for (const shift of serviceShifts) {
      const date = asIsoDate(shift.date || shift.service_date);
      if (!date) continue;
      if (date.endsWith('-12-25')) specialHolidayCategories.add('christmas_day_1');
      if (date.endsWith('-12-26')) specialHolidayCategories.add('christmas_day_2');
      if (date.endsWith('-01-01')) specialHolidayCategories.add('new_years_day');
      if (date.endsWith('-12-31') && overlapsAfterClock(shift, date, '16:00')) specialHolidayCategories.add('new_years_eve_after_16');
    }
  }
  if (!isGeneralReserve && specialHolidayCategories.size === 4) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0572',
      severity: 'medium',
      message: 'Werknemer is op alle CAO-genoemde feestmomenten ingepland; werkgever moet aantoonbaar inspanning leveren dit te voorkomen.',
      payroll_impact: false,
      holiday_categories: [...specialHolidayCategories],
      manual_review_required: true
    });
  }

  const careRequests = normalizeArray(body.care_schedule_adjustment_requests || body.care_schedule_adjustment_request);
  for (const request of careRequests) {
    const status = String(request.status || request.response_status || '').toLowerCase();
    const careRuleId = isGeneralReserve ? 'CAO-PB-2024-R0622' : 'CAO-PB-2024-R0573';
    if ((status.includes('reject') || status.includes('afgewezen')) &&
      !request.rejection_reason &&
      booleanOrNull(request.organizationally_impossible_confirmed) !== true) {
      violations.push({
        rule_id: careRuleId,
        severity: 'medium',
        message: 'Afwijzing van roosterverzoek voor opvoedingstaken mist reden of organisatorische onmogelijkheid.',
        payroll_impact: false,
        manual_review_required: true
      });
    }
  }

  const forcedOutsideWindowShifts = serviceShifts.filter(shift =>
    booleanOrNull(shift.forced_outside_time_window_without_consent ?? shift.employer_forced_outside_time_window_without_consent) === true
  );
  const forcedCountYtd = numberOrNull(body.forced_outside_time_window_count_year_to_date);
  const forcedCountBefore = numberOrNull(body.forced_outside_time_window_count_year_to_date_before_period);
  const totalForcedOutsideWindowCount = forcedCountYtd !== null
    ? forcedCountYtd
    : (forcedCountBefore || 0) + forcedOutsideWindowShifts.length;
  if (!isGeneralReserve && totalForcedOutsideWindowCount > 8) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0580',
      severity: 'high',
      message: `Werkgever heeft ${totalForcedOutsideWindowCount} verplichte verschuivingen buiten tijdvak/arbeidstijd zonder instemming gebruikt; maximaal 8 per jaar toegestaan.`,
      affected_shift_ids: forcedOutsideWindowShifts.map(s => s.id).filter(Boolean),
      payroll_impact: true,
      forced_outside_time_window_count_year_to_date: totalForcedOutsideWindowCount,
      manual_review_required: false
    });
  }

  for (const shift of serviceShifts) {
    if (isGeneralReserve) {
      if (booleanOrNull(shift.changed_after_roster_published) === true ||
        !!shift.roster_change_datetime ||
        !!shift.original_start_time ||
        !!shift.original_time_window_start ||
        !!shift.notified_time_window_start) {
        skippedRules.push({
          rule_id: 'CAO-PB-2024-R0606',
          reason: 'Werknemer algemene reserve heeft geen recht op verschuivingstoeslag volgens artikel 43.',
          affected_shift_ids: shift.id ? [shift.id] : []
        });
      }
      continue;
    }
    const changedAfterRoster = booleanOrNull(shift.changed_after_roster_published) === true ||
      !!shift.roster_change_datetime ||
      !!shift.original_start_time ||
      !!shift.original_time_window_start ||
      !!shift.notified_time_window_start;
    if (!changedAfterRoster) continue;

    const originalWindowStart = shift.original_time_window_start || shift.notified_time_window_start || shift.original_start_time || null;
    const originalWindowEnd = shift.original_time_window_end || shift.notified_time_window_end || shift.original_end_time || null;
    const withinOriginalWindow = shiftWithinWindow(shift, originalWindowStart, originalWindowEnd);
    const explicitOutside = booleanOrNull(shift.outside_original_time_window ?? shift.outside_notified_time_window);
    const outsideOriginalWindow = explicitOutside === true || withinOriginalWindow === false;

    if (withinOriginalWindow === null && explicitOutside === null) {
      addManualReview(manualReviewItems, 'CAO-PB-2024-R0578', 'roster_change', 'Roosterwijziging mist oorspronkelijke tijdvak/arbeidstijd; verschuivingstoeslag kan niet worden beoordeeld.', 'original_time_window_start/end');
      continue;
    }
    if (!outsideOriginalWindow) continue;

    const isForcedWithoutConsent = booleanOrNull(shift.forced_outside_time_window_without_consent ?? shift.employer_forced_outside_time_window_without_consent) === true;
    const isOnCall = hasContractModel(body, shift, ['oproep', 'zero_hours', 'min_max', 'call']);
    const isParttimeFixedShift = hasContractModel(body, shift, ['parttime_fixed', 'parttime_vast', 'vast_model']);
    const isExtraParttimeService = booleanOrNull(shift.extra_service ?? shift.extra_shift ?? shift.parttime_extra_service) === true;

    if (isOnCall) {
      skippedRules.push({
        rule_id: 'CAO-PB-2024-R0586',
        reason: 'Oproepkracht heeft vanwege flexibele aard van het contract geen recht op verschuivingstoeslag.',
        affected_shift_ids: shift.id ? [shift.id] : []
      });
      continue;
    }

    if (isForcedWithoutConsent && totalForcedOutsideWindowCount <= 8) {
      skippedRules.push({
        rule_id: 'CAO-PB-2024-R0580',
        reason: 'Verplichte verschuiving buiten tijdvak valt binnen de 8 jaarlijkse gevallen zonder instemming; geen verschuivingstoeslag.',
        affected_shift_ids: shift.id ? [shift.id] : [],
        forced_outside_time_window_count_year_to_date: totalForcedOutsideWindowCount
      });
      continue;
    }

    payrollEntitlements.push({
      rule_id: isParttimeFixedShift && isExtraParttimeService ? 'CAO-PB-2024-R0585' : 'CAO-PB-2024-R0576',
      type: 'shift_change_allowance_required',
      affected_shift_ids: shift.id ? [shift.id] : [],
      date: shift.date,
      original_time_window_start: originalWindowStart,
      original_time_window_end: originalWindowEnd,
      new_start_time: shift.start_time,
      new_end_time: shift.end_time,
      message: isParttimeFixedShift && isExtraParttimeService
        ? 'Parttimer werkt extra dienst buiten vastgestelde tijdvakken/arbeidstijd: verschuivingstoeslag volgens artikel 43 vereist.'
        : 'Rooster na publicatie gewijzigd buiten medegedeeld tijdvak/arbeidstijd: verschuivingstoeslag volgens artikel 43 vereist.'
    });
  }

  if (!isGeneralReserve) {
    const blockingRequests = normalizeArray(body.outside_time_window_block_requests || body.roster_blocking_requests);
    if (blockingRequests.length > 4) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0583',
        severity: 'high',
        message: `${blockingRequests.length} blokkadedagen opgegeven; werknemer mag maximaal 4 dagen per jaar aanwijzen.`,
        payroll_impact: false,
        manual_review_required: false
      });
    }
    for (const request of blockingRequests) {
      const targetDate = asIsoDate(request.date || request.target_date || request.time_window_date);
      const requestDate = asIsoDate(request.request_date || request.submitted_at || request.created_at);
      const noticeDays = targetDate && requestDate ? daysBetween(targetDate, requestDate) : null;
      if (noticeDays === null) {
        addManualReview(manualReviewItems, 'CAO-PB-2024-R0584', 'roster_blocking_request', 'Blokkadeverzoek mist datum of indieningsdatum.', 'outside_time_window_block_requests');
      } else if (noticeDays < 21 || noticeDays > 28) {
        violations.push({
          rule_id: 'CAO-PB-2024-R0584',
          severity: 'medium',
          message: `Blokkadeverzoek is ${noticeDays} dagen vooraf gedaan; vereist is 28 tot 21 dagen voor ingang tijdvak/arbeidstijd.`,
          payroll_impact: false,
          manual_review_required: true
        });
      }
    }
  }

  if (youthWorkerSummary.is_under_18) {
    const removedViolations = removeArticle30ExcludedItems(violations);
    const removedManualReviewItems = removeArticle30ExcludedItems(manualReviewItems);
    const removedMissingEvidence = removeArticle30ExcludedItems(missingEvidence);
    const removedPayrollEntitlements = removeArticle30ExcludedItems(payrollEntitlements);
    const removedPayrollAdjustments = removeArticle30ExcludedItems(payrollAdjustments);
    youthWorkerSummary.excluded_cao_rule_ids = Array.from(ARTICLE_30_EXCLUDED_RULE_IDS).sort();
    youthWorkerSummary.removed_runtime_items = {
      violations: removedViolations.map(item => item.rule_id),
      manual_review_items: removedManualReviewItems.map(item => item.rule_id),
      missing_evidence: removedMissingEvidence.map(item => item.rule_id),
      payroll_entitlements: removedPayrollEntitlements.map(item => item.rule_id),
      payroll_adjustments: removedPayrollAdjustments.map(item => item.rule_id)
    };
    skippedRules.push({
      rule_id: 'CAO-PB-2024-R0679',
      reason: 'Werknemer is jonger dan 18 jaar: CAO PB artikelen 23 en 26 tot en met 29 gelden niet; Arbeidstijdenwet voor jeugdige werknemers is leidend.',
      excluded_rule_ids: youthWorkerSummary.excluded_cao_rule_ids
    });
    addManualReview(
      manualReviewItems,
      'CAO-PB-2024-R0679',
      'youth_working_time_law',
      'Werknemer is jonger dan 18 jaar. Controleer en bevestig de toepasselijke Arbeidstijdenwet-regels voor jeugdige werknemers; volwassen CAO-regels artikel 23 en 26 t/m 29 zijn niet toegepast.',
      'arbeidstijdenwet_youth_compliance_confirmed'
    );
  } else {
    youthWorkerSummary.excluded_cao_rule_ids = [];
    youthWorkerSummary.removed_runtime_items = {
      violations: [],
      manual_review_items: [],
      missing_evidence: [],
      payroll_entitlements: [],
      payroll_adjustments: []
    };
  }

  return {
    total_shifts: totalShifts,
    total_hours: Math.round(totalHours * 100) / 100,
    total_time_windows: timeWindows.length,
    total_time_window_hours: round2(totalTimeWindowHours),
    total_roster_blocks: rosterBlockCount,
    total_roster_block_hours: round2(rosterBlockHours),
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    free_days_count: freeDaysCount,
    general_reserve_summary: {
      is_general_reserve: isGeneralReserve,
      article_21_skipped: isGeneralReserve,
      allowance_percentage: isGeneralReserve ? 10 : null,
      shift_change_allowance_excluded: isGeneralReserve
    },
    youth_worker_summary: youthWorkerSummary,
    working_time_summary: {
      special_working_time_exception: specialWorkingTimeException,
      weekly_hours: weeklyHourRows,
      four_week_average: rollingAverage4,
      sixteen_week_average: rollingAverage16,
      thirteen_week_average: rollingAverage13,
      night_thirteen_week_average: hasNightWork ? nightAverage13 : null,
      has_night_work: hasNightWork
    },
    night_shift_summary: {
      has_night_shifts: hasNightWork,
      night_shift_count_this_period: serviceNightShiftDetails.length,
      night_shift_count_reference: referenceNightShiftDetails.length,
      night_reference_period_start: nightBounds.start,
      night_reference_period_end: nightBounds.end,
      sixteen_week_windows: nightSixteenWeekWindows,
      thirteen_week_windows: nightThirteenWeekWindows,
      two_week_night_hour_windows: nightTwoWeekWindows,
      source_rule_ids: [
        'CAO-PB-2024-R0648',
        'CAO-PB-2024-R0649',
        'CAO-PB-2024-R0650',
        'CAO-PB-2024-R0652',
        'CAO-PB-2024-R0653',
        'CAO-PB-2024-R0654',
        'CAO-PB-2024-R0655',
        'CAO-PB-2024-R0656',
        'CAO-PB-2024-R0657',
        'CAO-PB-2024-R0659',
        'CAO-PB-2024-R0660',
        'CAO-PB-2024-R0661',
        'CAO-PB-2024-R0662',
        'CAO-PB-2024-R0663',
        'CAO-PB-2024-R0664',
        'CAO-PB-2024-R0665',
        'CAO-PB-2024-R0666',
        'CAO-PB-2024-R0667'
      ]
    },
    break_summary: {
      shift_breaks: breakSummaryRows,
      no_break_exception_applied: noBreakExceptionApplied,
      no_break_sixteen_week_average: noBreakSixteenWeekAverage,
      source_rule_ids: [
        'CAO-PB-2024-R0669',
        'CAO-PB-2024-R0671',
        'CAO-PB-2024-R0672',
        'CAO-PB-2024-R0673',
        'CAO-PB-2024-R0674',
        'CAO-PB-2024-R0676',
        'CAO-PB-2024-R0677'
      ]
    },
    rest_time_summary: {
      min_daily_rest_hours: 11,
      seven_day_rest_windows: sevenDayRestResults,
      fourteen_day_rest_windows: fourteenDayRestResults,
      sundays_in_period: sundaysInPeriod,
      worked_sundays_this_period: workedSundaysThisPeriod,
      free_sundays_this_period: freeSundaysThisPeriod,
      free_sundays_count_this_period: freeSundaysThisPeriod.length,
      free_sundays_year_to_date: freeSundaysAfterPeriod,
      source_rule_ids: [
        'CAO-PB-2024-R0641',
        'CAO-PB-2024-R0643',
        'CAO-PB-2024-R0644',
        'CAO-PB-2024-R0645',
        'CAO-PB-2024-R0646'
      ]
    },
    minus_hours_summary: {
      agreed_period_hours: agreedPeriodHours === null ? null : round2(agreedPeriodHours),
      worked_period_hours: round2(totalHours),
      generated_minus_hours: minusHoursGenerated === null ? null : round2(minusHoursGenerated),
      recovered_minus_hours: round2(recoveredMinusHours),
      previous_minus_hours_balance: round2(previousMinusHoursBalance),
      minus_hours_balance_after_period: minusHoursBalanceAfterPeriod === null ? null : round2(minusHoursBalanceAfterPeriod),
      max_minus_hours_balance: minusHoursBalanceInfo.max_balance,
      max_minus_hours_balance_source_rule_id: minusHoursBalanceInfo.source_rule_id
    },
    violations,
    warnings,
    payroll_entitlements: payrollEntitlements,
    payroll_adjustments: payrollAdjustments,
    skipped_rules: skippedRules,
    missing_evidence: missingEvidence,
    manual_review_items: manualReviewItems,
    schedule_manual_review_required: manualReviewItems.length > 0 || violations.some(v => v.manual_review_required === true),
    cao_evidence_mode: caoEvidenceMode,
    is_valid: violations.filter(v => v.severity === 'high').length === 0
  };
}

async function validateShiftContractResolution(base44, { shifts, periodStart, periodEnd, personnel_id, body }) {
  const periodShifts = shifts.filter(s =>
    s.date >= periodStart &&
    s.date <= periodEnd &&
    !(s.is_time_window === true || s.roster_block_type === 'time_window' || s.block_type === 'time_window')
  );
  const enforceContractResolution = body.enforce_contract_resolution === true ||
    periodShifts.some(shiftHasContractContext);

  if (!enforceContractResolution) {
    return {
      contract_resolution_required: false,
      contract_resolution_results: [],
      contract_violations: [],
      contract_warnings: [],
      contract_manual_review_required: false,
      contract_payroll_final_allowed: true,
      contract_hours_summary: []
    };
  }

  if (!personnel_id) {
    return {
      contract_resolution_required: true,
      contract_resolution_results: [],
      contract_violations: [{
        rule_id: 'APP-CONTRACT-SERVICE-MATCH',
        severity: 'high',
        message: 'personnel_id is verplicht voor contractbewuste roostercontrole.',
        affected_shift_ids: periodShifts.map(s => s.id).filter(Boolean),
        payroll_impact: true,
        manual_review_required: true
      }],
      contract_warnings: [],
      contract_manual_review_required: true,
      contract_payroll_final_allowed: false,
      contract_hours_summary: []
    };
  }

  const contractResults = await Promise.all(periodShifts.map(async (shift, index) => {
    const serviceContext = shift.service_context || {};
    try {
      const res = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
        personnel_id,
        contract_id: shift.contract_id || body.contract_id || null,
        company_id: shift.company_id || body.company_id || null,
        route_id: shift.route_id || body.route_id || null,
        task_id: shift.task_id || body.task_id || null,
        service_date: shift.date,
        service_context: {
          ...serviceContext,
          task_type: serviceContext.task_type || shift.task_type || null,
          function_type: serviceContext.function_type || shift.service_function_type || shift.function_type || null,
          cao_function_group: serviceContext.cao_function_group || shift.required_cao_function_group || shift.cao_function_group || null,
          cao_function_level: serviceContext.cao_function_level || shift.required_cao_function_level || shift.cao_function_level || null,
          security_role_status: serviceContext.security_role_status || shift.required_security_role_status || shift.security_role_status || null,
          customer_billable: serviceContext.customer_billable ?? shift.customer_billable ?? null,
          counts_toward_required_staffing: serviceContext.counts_toward_required_staffing ?? shift.counts_toward_required_staffing ?? null,
          internship_practice_trainer_personnel_id: serviceContext.internship_practice_trainer_personnel_id || shift.internship_practice_trainer_personnel_id || null,
          internship_mentor_personnel_id: serviceContext.internship_mentor_personnel_id || shift.internship_mentor_personnel_id || null,
          internship_one_to_one_guidance_confirmed: serviceContext.internship_one_to_one_guidance_confirmed ?? shift.internship_one_to_one_guidance_confirmed ?? null,
          internship_uniform_label_confirmed: serviceContext.internship_uniform_label_confirmed ?? shift.internship_uniform_label_confirmed ?? null,
          contract_assignment_policy: serviceContext.contract_assignment_policy || shift.contract_assignment_policy || body.contract_assignment_policy || 'strict_contract_match'
        }
      });
      return {
        shift_index: index,
        shift_id: shift.id || null,
        date: shift.date,
        hours: Math.round(calculateShiftHours(shift) * 100) / 100,
        ...(res?.data || { status: 'blocked', planning_allowed: false, payroll_final_allowed: false, blocking_reasons: ['Contractresolver gaf geen data terug.'] })
      };
    } catch (error) {
      return {
        shift_index: index,
        shift_id: shift.id || null,
        date: shift.date,
        hours: Math.round(calculateShiftHours(shift) * 100) / 100,
        status: 'blocked_contract_resolution_error',
        planning_allowed: false,
        payroll_final_allowed: false,
        manual_review_required: true,
        blocking_reasons: [`Contractresolver fout: ${error.message}`],
        manual_review_reasons: []
      };
    }
  }));

  const contractViolations = [];
  const contractWarnings = [];
  for (const result of contractResults) {
    const affected = result.shift_id ? [result.shift_id] : [];
    if (result.planning_allowed === false || result.status === 'blocked') {
      contractViolations.push({
        rule_id: 'APP-CONTRACT-SERVICE-MATCH',
        severity: 'high',
        message: `Dienst ${result.date} past niet op een geldig arbeidscontract: ${(result.blocking_reasons || []).join(' ') || result.status}`,
        affected_shift_ids: affected,
        shift_index: result.shift_index,
        payroll_impact: true,
        manual_review_required: true,
        contract_resolution: result
      });
    } else if (result.manual_review_required === true || result.payroll_final_allowed === false) {
      contractViolations.push({
        rule_id: 'APP-CONTRACT-SERVICE-MATCH',
        severity: 'medium',
        message: `Dienst ${result.date} vereist handmatige contract/CAO-review: ${(result.manual_review_reasons || []).join(' ') || result.status}`,
        affected_shift_ids: affected,
        shift_index: result.shift_index,
        payroll_impact: true,
        manual_review_required: true,
        contract_resolution: result
      });
    }
  }

  const hoursByContractWeek = {};
  for (const result of contractResults) {
    const contract = result.selected_contract || null;
    if (!contract?.id) continue;
    const weekKey = getIsoWeekKey(result.date);
    const key = `${contract.id}::${weekKey}`;
    if (!hoursByContractWeek[key]) {
      hoursByContractWeek[key] = {
        contract_id: contract.id,
        week_key: weekKey,
        hours: 0,
        contract_hours_per_week: contract.contract_hours_per_week ?? null,
        min_hours_per_week: contract.min_hours_per_week ?? null,
        max_hours_per_week: contract.max_hours_per_week ?? null,
        shift_ids: []
      };
    }
    hoursByContractWeek[key].hours += Number(result.hours || 0);
    if (result.shift_id) hoursByContractWeek[key].shift_ids.push(result.shift_id);
  }

  const contractHoursSummary = Object.values(hoursByContractWeek).map(row => ({
    ...row,
    hours: Math.round(row.hours * 100) / 100
  }));

  for (const row of contractHoursSummary) {
    if (row.max_hours_per_week != null && row.hours > row.max_hours_per_week) {
      contractViolations.push({
        rule_id: 'APP-CONTRACT-WEEKLY-HOURS',
        severity: 'high',
        message: `Contract ${row.contract_id} overschrijdt maximum uren per week (${row.hours}u > ${row.max_hours_per_week}u) in ${row.week_key}.`,
        affected_shift_ids: row.shift_ids,
        payroll_impact: true,
        manual_review_required: false
      });
    }
    if (row.min_hours_per_week != null && row.hours < row.min_hours_per_week) {
      contractWarnings.push({
        rule_id: 'APP-CONTRACT-WEEKLY-HOURS',
        severity: 'medium',
        message: `Contract ${row.contract_id} haalt minimum uren per week nog niet (${row.hours}u < ${row.min_hours_per_week}u) in ${row.week_key}.`,
        affected_shift_ids: row.shift_ids,
        payroll_impact: true,
        manual_review_required: true
      });
    }
  }

  return {
    contract_resolution_required: true,
    contract_resolution_results: contractResults,
    contract_violations: contractViolations,
    contract_warnings: contractWarnings,
    contract_manual_review_required: contractResults.some(r => r.manual_review_required === true) ||
      contractViolations.some(v => v.manual_review_required === true) ||
      contractWarnings.some(w => w.manual_review_required === true),
    contract_payroll_final_allowed: contractResults.every(r => r.payroll_final_allowed === true) &&
      contractViolations.filter(v => v.severity === 'high').length === 0,
    contract_hours_summary: contractHoursSummary
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { shifts, period_start, period_end, personnel_id, force_cao_sync } = body;

    const syncResult = await lazySyncCao(base44, !!force_cao_sync);

    let rawCaoScope = null;
    let personnelContext = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        rawCaoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
      try {
        personnelContext = await base44.entities.Personnel.get(personnel_id);
      } catch { /* geboortedatum is optioneel voor oudere payloads */ }
    }
    const caoScope = normalizeCaoScope(rawCaoScope);

    const syncWarnings = [];
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    if (!Array.isArray(shifts)) return Response.json({ error: 'shifts array is verplicht' }, { status: 400 });

    let pStart = period_start, pEnd = period_end;
    if (!pStart || !pEnd) {
      const now = new Date();
      pStart = formatIsoDateLocal(now);
      const fourWeeksLater = new Date(now);
      fourWeeksLater.setDate(fourWeeksLater.getDate() + 27);
      pEnd = formatIsoDateLocal(fourWeeksLater);
    }

    const scheduleBody = { ...body };
    if (
      personnelContext?.date_of_birth &&
      !scheduleBody.date_of_birth &&
      !scheduleBody.employee_date_of_birth &&
      !scheduleBody.personnel_date_of_birth
    ) {
      scheduleBody.personnel_date_of_birth = personnelContext.date_of_birth;
    }

    const result = validateSchedule(shifts, pStart, pEnd, caoScope, scheduleBody);
    const contractValidation = await validateShiftContractResolution(base44, {
      shifts,
      periodStart: pStart,
      periodEnd: pEnd,
      personnel_id,
      body: scheduleBody
    });

    result.violations = [
      ...(result.violations || []),
      ...(contractValidation.contract_violations || [])
    ];
    result.warnings = [
      ...(result.warnings || []),
      ...(contractValidation.contract_warnings || []).map(w => w.message || String(w))
    ];
    result.is_valid = result.violations.filter(v => v.severity === 'high').length === 0;
    const strictScheduleManualReviewRequired = result.schedule_manual_review_required === true &&
      result.cao_evidence_mode === 'strict';

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    // Scope-context in response
    const scopeWarnings = [];
    const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    if (!caoScope.applies_full_security_rules) {
      // Preciseer welke specifieke uitzonderingen zijn toegepast
      const exclusions = [];
      if (caoScope.excluded_chapters?.some(c => c.includes('chapter_4'))) {
        exclusions.push('Overwerktoeslag art. 42 (hoofdstuk 4) niet van toepassing');
      }
      if (caoScope.excluded_articles?.includes('article_10_fulltime_definition')) {
        exclusions.push('Art. 10 definitie fulltimer niet van toepassing');
      }
      if (exclusions.length > 0) {
        scopeWarnings.push({
          message: `Artikel 3 lid 2 CAO PB: ${exclusions.join('; ')}. Planningregels hoofdstuk 3 (rooster, vrije dagen) gelden onverkort.`,
          cao_scope_profile: caoScope.cao_scope_profile,
          excluded_rule_ids: caoScope.excluded_rule_ids || [],
          applied_exclusions: exclusions
        });
      }
    }

    if (isUnknownOrMixed) {
      scopeWarnings.push({
        message: `CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): alle violations zijn conceptmatig. Handmatige review vereist.`,
        cao_scope_profile: caoScope.cao_scope_profile
      });
      if (result.violations) {
        result.violations = result.violations.map(v => ({ ...v, manual_review_required: true, note: 'Concept: scope onzeker.' }));
      }
    }

    return Response.json({
      success: true,
      period_start: pStart, period_end: pEnd,
      personnel_id: personnel_id || null,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      scope_warnings: scopeWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      applies_full_security_rules: caoScope?.applies_full_security_rules ?? null,
      contract_resolution_required: contractValidation.contract_resolution_required,
      contract_resolution_results: contractValidation.contract_resolution_results,
      contract_hours_summary: contractValidation.contract_hours_summary,
      contract_warning_items: contractValidation.contract_warnings,
      contract_payroll_final_allowed: contractValidation.contract_payroll_final_allowed,
      manual_review_required: isUnknownOrMixed || contractValidation.contract_manual_review_required || strictScheduleManualReviewRequired || false,
      payroll_final_allowed: !isUnknownOrMixed && result.is_valid === true && contractValidation.contract_payroll_final_allowed === true && !strictScheduleManualReviewRequired,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

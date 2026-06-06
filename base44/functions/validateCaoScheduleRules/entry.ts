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
 * Bronregels: R0547-R0549 en R0560-R0591 (rooster, tijdvakken, roosterwijziging, verschuiving en overwerkbasis)
 *
 * Scope-bewust:
 * - Artikel 3 lid 2 sluit uit: art. 10, art. 9 lid 1 sub c, hfdst. 4 (behalve 37/38/41), hfdst. 5, bijlage 2.
 * - Artikel 3 lid 2 sluit NIET heel hoofdstuk 3 uit.
 * - R0562 (max tijdvakken), R0564 (vrije dagen), R0561 (roosterplanning) zijn hoofdstuk 3/algemene regels → gelden ook voor non-security.
 * - R0590 (overwerk art. 42) → alleen bij full-security (hoofdstuk 4).
 */

// Regels die onder art. 42 / hoofdstuk 4 vallen (uitgesloten bij non-security)
const CHAPTER4_OVERTIME_RULES = ['CAO-PB-2024-R0590'];

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
  return date.toISOString().slice(0, 10);
}

function nextThursdayOnOrAfter(dateStr) {
  const date = dateFromIso(dateStr);
  if (!date) return null;
  const day = date.getDay();
  const delta = (4 - day + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
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

function getUnpaidBreakHours(shift) {
  const breaks = normalizeArray(shift.breaks || shift.unpaid_breaks || shift.pause_blocks);
  let total = 0;
  let found = false;
  for (const item of breaks) {
    const paid = booleanOrNull(item.paid);
    if (paid === true) continue;
    const hours = getBreakDurationHours(item);
    if (hours !== null) {
      total += hours;
      found = true;
    }
  }
  return found ? total : 0;
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

function addManualReview(manualReviewItems, ruleId, domain, message, field = null) {
  manualReviewItems.push({
    rule_id: ruleId,
    domain,
    message,
    field,
    manual_review_required: true
  });
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
  const manualReviewItems = [];
  const missingEvidence = [];
  const caoEvidenceMode = body.cao_evidence_mode || (body.enforce_cao_evidence === true ? 'strict' : 'advisory');

  const periodShifts = shifts.filter(s => s.date >= periodStart && s.date <= periodEnd);
  const serviceShifts = periodShifts.filter(s => !(s.is_time_window === true || s.roster_block_type === 'time_window' || s.block_type === 'time_window'));
  const timeWindows = getRosterTimeWindows(body, periodStart, periodEnd, periodShifts);
  const periodDistance = daysBetween(periodEnd, periodStart);
  const periodDayCount = periodDistance !== null ? periodDistance + 1 : null;
  const schedulePublishedAt = body.schedule_published_at || body.roster_published_at || body.roster_publication_datetime || null;
  const weeklySchedulePublishedAt = body.weekly_schedule_published_at || body.weekly_roster_published_at || null;

  if (isRuleApplicable('CAO-PB-2024-R0561', caoScope)) {
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

  if (weeklySchedulePublishedAt && !isThursday(weeklySchedulePublishedAt)) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0568',
      severity: 'medium',
      message: 'De weekindeling/diensten voor de komende week zijn niet op donderdag gepubliceerd.',
      weekly_schedule_published_at: weeklySchedulePublishedAt,
      payroll_impact: false,
      manual_review_required: true
    });
  } else if (!weeklySchedulePublishedAt) {
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

  if (isRuleApplicable('CAO-PB-2024-R0562', caoScope)) {
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
  if (isParttimeFixedModel) {
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

  const start = new Date(periodStart), end = new Date(periodEnd);
  const allDates = [];
  let cur = new Date(start);
  while (cur <= end) { allDates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
  const occupiedDates = new Set([
    ...serviceShifts.map(s => asIsoDate(s.date || s.service_date)).filter(Boolean),
    ...timeWindows.map(w => asIsoDate(w.date)).filter(Boolean)
  ]);
  const freeDates = allDates.filter(d => !occupiedDates.has(d));
  const freeDaysCount = freeDates.length;

  if (isRuleApplicable('CAO-PB-2024-R0564', caoScope)) {
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

  for (const shift of serviceShifts) {
    const unpaidBreakHours = getUnpaidBreakHours(shift);
    if (unpaidBreakHours > 1) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0569',
        severity: 'high',
        message: `Dienst ${shift.date} heeft ${round2(unpaidBreakHours)} uur onbetaalde pauze/onderbreking; maximaal 1 uur binnen een dienst.`,
        affected_shift_ids: shift.id ? [shift.id] : [],
        payroll_impact: true,
        unpaid_break_hours: round2(unpaidBreakHours),
        manual_review_required: false
      });
    }
  }

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

  const specialHolidayCategories = new Set();
  for (const shift of serviceShifts) {
    const date = asIsoDate(shift.date || shift.service_date);
    if (!date) continue;
    if (date.endsWith('-12-25')) specialHolidayCategories.add('christmas_day_1');
    if (date.endsWith('-12-26')) specialHolidayCategories.add('christmas_day_2');
    if (date.endsWith('-01-01')) specialHolidayCategories.add('new_years_day');
    if (date.endsWith('-12-31') && overlapsAfterClock(shift, date, '16:00')) specialHolidayCategories.add('new_years_eve_after_16');
  }
  if (specialHolidayCategories.size === 4) {
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
    if ((status.includes('reject') || status.includes('afgewezen')) &&
      !request.rejection_reason &&
      booleanOrNull(request.organizationally_impossible_confirmed) !== true) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0573',
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
  if (totalForcedOutsideWindowCount > 8) {
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

  return {
    total_shifts: totalShifts,
    total_hours: Math.round(totalHours * 100) / 100,
    total_time_windows: timeWindows.length,
    total_time_window_hours: round2(totalTimeWindowHours),
    total_roster_blocks: rosterBlockCount,
    total_roster_block_hours: round2(rosterBlockHours),
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    free_days_count: freeDaysCount,
    violations,
    warnings,
    payroll_entitlements: payrollEntitlements,
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
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        rawCaoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
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
      pStart = now.toISOString().split('T')[0];
      const fourWeeksLater = new Date(now);
      fourWeeksLater.setDate(fourWeeksLater.getDate() + 27);
      pEnd = fourWeeksLater.toISOString().split('T')[0];
    }

    const result = validateSchedule(shifts, pStart, pEnd, caoScope, body);
    const contractValidation = await validateShiftContractResolution(base44, {
      shifts,
      periodStart: pStart,
      periodEnd: pEnd,
      personnel_id,
      body
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

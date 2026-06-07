import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Routekosten voor payrollbasis zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
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

async function resolveRouteContractContext(base44, personnel, route, shiftDate, functionType, options = {}) {
  if (!route.operating_company_id) {
    if (options.allow_legacy_companyless_route_costing === true) {
      return {
        status: 'legacy_companyless_route_concept_only',
        planning_allowed: true,
        payroll_final_allowed: false,
        manual_review_required: true,
        company_id: null,
        contract_id: null,
        note: 'Route heeft geen operating_company_id; legacy routekostenflow is alleen concept en nooit payroll-final.',
        manual_review_reasons: ['Koppel de route aan een uitvoerend bedrijf voordat planning/payroll definitief mag worden.']
      };
    }
    return {
      status: 'blocked_missing_operating_company',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      company_id: null,
      contract_id: null,
      blocking_reasons: ['Route heeft geen operating_company_id; uitvoerend bedrijf is verplicht om contract en CAO-context te bepalen.']
    };
  }

  try {
    const res = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
      personnel_id: personnel.id,
      route_id: route.id,
      company_id: route.operating_company_id,
      service_date: shiftDate,
      service_context: {
        cao_key: route.cao_key || route.cao || null,
        cao: route.cao || null,
        function_type: functionType || personnel.function_type || null,
        cao_function_group: personnel.cao_function_group || null,
        cao_function_level: personnel.cao_function_level || null,
        security_role_status: personnel.security_role_status || null,
        contract_assignment_policy: 'strict_contract_match'
      }
    });
    return res?.data || {
      status: 'blocked_contract_resolution_empty',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      blocking_reasons: ['Contractresolver gaf geen resultaat terug.']
    };
  } catch (error) {
    return {
      status: 'blocked_contract_resolution_error',
      planning_allowed: false,
      payroll_final_allowed: false,
      manual_review_required: true,
      blocking_reasons: [`Contractresolver fout: ${error.message}`]
    };
  }
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

function calculateShiftCost(personnel, date, startTime, endTime, caoConfig, rawScope, rawClassification) {
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
  const totalGross = baseSalary + surchargesTotal;

  const franchisePerPeriod = (caoConfig.pension_base_salary_threshold || 16164) / 13;
  const pensionBase = Math.max(0, totalGross - franchisePerPeriod);
  const totalPensionPremium = pensionBase * ((caoConfig.pension_premium_rate_total || 24.1) / 100);
  const employerPension = totalPensionPremium * ((caoConfig.pension_premium_employer || 60) / 100);
  const premiumAWF = totalGross * ((caoConfig.premium_awf_employer || 2.64) / 100);
  const premiumWW = totalGross * (((caoConfig.premium_ww_employer_fixed || 0) + (caoConfig.premium_ww_employer_variable || 1.5)) / 100);
  const premiumWIA = totalGross * ((caoConfig.premium_wia_employer || 0.72) / 100);
  const premiumWGA = totalGross * ((caoConfig.premium_wga_employer || 1.5) / 100);
  const employerCostsTotal = employerPension + premiumAWF + premiumWW + premiumWIA + premiumWGA;

  const vacationAllowance = totalGross * ((caoConfig.vacation_allowance || 8) / 100);
  const yearEndBonus = totalGross * ((caoConfig.year_end_bonus || 2.01) / 100);
  // ORT-vakantie-reservering: 0 als geen toeslagen toegepast zijn
  const avgOrtPerHour = (totalHours > 0 && surchargesTotal > 0) ? surchargesTotal / totalHours : 0;
  const estimatedAnnualVacationHours = 200;
  const ortVacationReservation = applySpecialHours
    ? (estimatedAnnualVacationHours / 13) * avgOrtPerHour
    : 0;
  const accrualsTotal = vacationAllowance + yearEndBonus + ortVacationReservation;
  const totalCostEmployer = totalGross + employerCostsTotal + accrualsTotal;

  return {
    base_hourly_rate: baseHourlyRate, total_hours: totalHours,
    base_salary: r2(baseSalary), surcharges_total: r2(surchargesTotal), surcharge_details: surchargeDetails,
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
      ort_vacation_reservation: r2(ortVacationReservation)
    },
    total_cost_employer: r2(totalCostEmployer),
    cost_per_hour: r2(totalHours > 0 ? totalCostEmployer / totalHours : 0),
    cao_scope_profile: caoScope?.cao_scope_profile || null,
    scope_warnings: [...scopeWarnings, ...(wageBasis.warnings || [])],
    wage_basis_type: wageBasis.wage_basis_type,
    payroll_final_allowed: wageBasis.payroll_final_allowed && !dstCalculationInfo?.manual_review_required,
    manual_review_required: wageBasis.manual_review_required || !!dstCalculationInfo?.manual_review_required,
    calculation_status: dstCalculationInfo?.manual_review_required && wageBasis.calculation_status === 'final'
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
    const targetCaoKey = body.cao_key ||
      route.cao_key ||
      route.cao ||
      CAO_PB_KEY;

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

    // ── Fingerprint-gebaseerde cache check (na laden personeel) ──
    const allPersonnelForCache = [...surveillants, ...binnendienst];
    const fingerprint = buildRouteCostCacheFingerprint({
      route, weekday: targetWeekday, caoConfig, personnelList: allPersonnelForCache
    });
    const cacheKey = `${targetWeekday}`;
    const usesContractResolution = !!route.operating_company_id || allow_legacy_companyless_route_costing !== true;
    if (!force_recalculate && !usesContractResolution && route.cached_personnel_costs?.[cacheKey]) {
      const cached = route.cached_personnel_costs[cacheKey];
      if (cached._cache_fingerprint === fingerprint) {
        return Response.json(cached);
      }
    }

    // Resolve CAO-scope per medewerker (parallel voor surveillanten)
    const scopePromises = surveillants.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id: p.id })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );
    const binnendienstScopePromises = binnendienst.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id: p.id })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );
    const classificationPromises = allPersonnelForCache.map(p => {
      if (p.employee_type !== 'loondienst' || p.cao !== 'cao_particuliere_beveiliging') {
        return Promise.resolve({ id: p.id, classification: null });
      }
      return base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', { personnel_id: p.id })
        .then(r => ({ id: p.id, classification: r?.data || null }))
        .catch(() => ({ id: p.id, classification: null }));
    });
    const contractPromises = allPersonnelForCache.map(p =>
      resolveRouteContractContext(base44, p, route, shiftDate, p.function_type, { allow_legacy_companyless_route_costing })
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
    for (const c of contractResults) contractById[c.id] = c.contract_resolution;

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
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, effectiveScope, classification);
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
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, effectiveScope, classification);
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
      operating_company_id: route.operating_company_id || null,
      contract_resolution_required: usesContractResolution,
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

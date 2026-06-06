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
 * Bronregels: R0561 (28-dagenrooster), R0562 (max tijdvakken), R0564 (vrije dagen), R0590 (overwerk)
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

function validateSchedule(shifts, periodStart, periodEnd, caoScope) {
  const violations = [];
  const warnings = [];
  const skippedRules = [];

  const periodShifts = shifts.filter(s => s.date >= periodStart && s.date <= periodEnd);

  // R0561: roosterplanning aanwezig (hoofdstuk 3 — geldt ook voor non-security)
  if (isRuleApplicable('CAO-PB-2024-R0561', caoScope)) {
    if (!periodShifts.length) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0561', severity: 'medium',
        message: 'Geen diensten ingepland voor deze loonperiode.',
        affected_shift_ids: [], payroll_impact: false, manual_review_required: false
      });
    }
  }

  let totalHours = 0, totalShifts = 0;
  const shiftIds = [];
  for (const shift of periodShifts) {
    totalHours += calculateShiftHours(shift);
    totalShifts++;
    if (shift.id) shiftIds.push(shift.id);
  }

  // R0562: max 20 tijdvakken per loonperiode (hoofdstuk 3 — geldt ook voor non-security)
  if (isRuleApplicable('CAO-PB-2024-R0562', caoScope)) {
    if (totalShifts > 20) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0562', severity: 'high',
        message: `${totalShifts} tijdvakken ingepland; maximaal 20 per loonperiode (CAO art. R0562).`,
        affected_shift_ids: shiftIds, payroll_impact: true, manual_review_required: true
      });
    }
  }

  // R0590: overwerk boven 152 uur (artikel 42, hoofdstuk 4 — ALLEEN full-security)
  const overtimeHours = Math.max(0, totalHours - 152);
  if (isRuleApplicable('CAO-PB-2024-R0590', caoScope)) {
    if (overtimeHours > 0) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0590', severity: 'high',
        message: `${Math.round(overtimeHours * 10) / 10} uur overwerk boven 152 uur per loonperiode. Toeslag 50% vereist (art. 42).`,
        affected_shift_ids: shiftIds, payroll_impact: true,
        overtime_hours: Math.round(overtimeHours * 10) / 10, manual_review_required: false
      });
    }
  } else {
    if (overtimeHours > 0) {
      skippedRules.push({
        rule_id: 'CAO-PB-2024-R0590',
        reason: 'Overwerktoeslag (art. 42 / hoofdstuk 4) niet van toepassing: medewerker valt onder artikel 3 lid 2 CAO PB.',
        note: `${Math.round(overtimeHours * 10) / 10} uur boven 152h gesignaleerd — geen automatische toeslag.`
      });
      // Informatieve waarschuwing (geen violation)
      warnings.push(`${Math.round(overtimeHours * 10) / 10} uur boven 152h in deze periode. Overwerktoeslag (art. 42) niet van toepassing (art. 3 lid 2).`);
    }
  }

  // R0564: vrije-dagenregels (hoofdstuk 3 — geldt ook voor non-security)
  const start = new Date(periodStart), end = new Date(periodEnd);
  const allDates = [];
  let cur = new Date(start);
  while (cur <= end) { allDates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
  const workedDates = new Set(periodShifts.map(s => s.date));
  const freeDates = allDates.filter(d => !workedDates.has(d));
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

  const manualReviewItems = [
    { rule_id: 'CAO-PB-2024-R0570', domain: 'rusttijden', message: 'Controleer minimale rusttijden tussen diensten. Handmatige review vereist.', manual_review_required: true },
    { rule_id: 'CAO-PB-2024-R0575', domain: 'nachtdiensten', message: 'Controleer maximale nachtdiensten per week/periode. Handmatige review vereist.', manual_review_required: true },
    { rule_id: 'CAO-PB-2024-R0580', domain: 'consignatie', message: 'Controleer consignatieregels en vergoedingen. Handmatige review vereist.', manual_review_required: true },
    { rule_id: 'CAO-PB-2024-R0585', domain: 'ruilen', message: 'Controleer ruilen van diensten conform CAO. Handmatige review vereist.', manual_review_required: true }
  ];

  return {
    total_shifts: totalShifts,
    total_hours: Math.round(totalHours * 100) / 100,
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    free_days_count: freeDaysCount,
    violations,
    warnings,
    skipped_rules: skippedRules,
    manual_review_items: manualReviewItems,
    is_valid: violations.filter(v => v.severity === 'high').length === 0
  };
}

async function validateShiftContractResolution(base44, { shifts, periodStart, periodEnd, personnel_id, body }) {
  const periodShifts = shifts.filter(s => s.date >= periodStart && s.date <= periodEnd);
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

    const result = validateSchedule(shifts, pStart, pEnd, caoScope);
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
      manual_review_required: isUnknownOrMixed || contractValidation.contract_manual_review_required || false,
      payroll_final_allowed: !isUnknownOrMixed && result.is_valid === true && contractValidation.contract_payroll_final_allowed === true,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

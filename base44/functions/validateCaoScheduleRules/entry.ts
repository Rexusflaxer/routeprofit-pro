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

function isRuleApplicable(ruleId, caoScope) {
  if (!caoScope || caoScope.applies_full_security_rules === true) return true;
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
function isWeekendBlock(day1, day2) {
  const d1 = new Date(day1), d2 = new Date(day2);
  const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
  if (diffDays !== 1) return false;
  return (d1.getDay() === 6 && d2.getDay() === 0);
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
    const start = new Date(`${shift.date}T${shift.start_time || '00:00'}:00`);
    let end = new Date(`${shift.date}T${shift.end_time || '00:00'}:00`);
    if (end <= start) end.setDate(end.getDate() + 1);
    totalHours += (end - start) / (1000 * 60 * 60);
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { shifts, period_start, period_end, personnel_id, force_cao_sync } = body;

    const syncResult = await lazySyncCao(base44, !!force_cao_sync);

    let caoScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

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

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    // Scope-context in response
    const scopeWarnings = [];
    const isUnknownOrMixed = caoScope && ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    if (caoScope && !caoScope.applies_full_security_rules) {
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
      manual_review_required: isUnknownOrMixed || false,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
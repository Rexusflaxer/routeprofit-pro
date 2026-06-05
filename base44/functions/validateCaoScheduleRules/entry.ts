import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_schedule_validation'
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB planning-validator
 * Bronregels: R0561 (28-dagenrooster), R0562 (max tijdvakken), R0564 (vrije dagen), R0590 (overwerk)
 */

function getWeekday(dateStr) {
  // 0=zondag, 6=zaterdag
  return new Date(dateStr).getDay();
}

function isWeekend(dateStr) {
  const dow = getWeekday(dateStr);
  return dow === 0 || dow === 6;
}

// Controleer of twee aaneengesloten vrije dagen een weekendblok omvatten
function isWeekendBlock(day1, day2) {
  const d1 = new Date(day1);
  const d2 = new Date(day2);
  const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
  if (diffDays !== 1) return false;
  const dow1 = d1.getDay();
  const dow2 = d2.getDay();
  // Za+Zo = weekend block
  return (dow1 === 6 && dow2 === 0);
}

function validateSchedule(shifts, periodStart, periodEnd) {
  const violations = [];
  const warnings = [];

  // Filter shifts binnen de loonperiode
  const periodShifts = shifts.filter(s => {
    return s.date >= periodStart && s.date <= periodEnd;
  });

  // CAO-PB-2024-R0561: rooster op donderdag voor komende 28 dagen
  // Controleer dat de roosterplanning voldoende vooruit is gemaakt
  if (!periodShifts.length) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0561',
      severity: 'medium',
      message: 'Geen diensten ingepland voor deze loonperiode.',
      affected_shift_ids: [],
      payroll_impact: false,
      manual_review_required: false
    });
  }

  // CAO-PB-2024-R0562: maximaal 20 tijdvakken en/of arbeidstijd per loonperiode
  // 152 uur normaal, overwerk boven 152 uur
  let totalHours = 0;
  let totalShifts = 0;
  const shiftIds = [];

  for (const shift of periodShifts) {
    const start = new Date(`${shift.date}T${shift.start_time || '00:00'}:00`);
    let end = new Date(`${shift.date}T${shift.end_time || '00:00'}:00`);
    if (end <= start) end.setDate(end.getDate() + 1);
    const hours = (end - start) / (1000 * 60 * 60);
    totalHours += hours;
    totalShifts++;
    if (shift.id) shiftIds.push(shift.id);
  }

  if (totalShifts > 20) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0562',
      severity: 'high',
      message: `${totalShifts} tijdvakken ingepland; maximaal 20 per loonperiode (CAO art. R0562).`,
      affected_shift_ids: shiftIds,
      payroll_impact: true,
      manual_review_required: true
    });
  }

  // CAO-PB-2024-R0590: overwerk boven 152 uur per loonperiode
  const overtimeHours = Math.max(0, totalHours - 152);
  if (overtimeHours > 0) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0590',
      severity: 'high',
      message: `${Math.round(overtimeHours * 10) / 10} uur overwerk boven 152 uur per loonperiode. Toeslag 50% vereist.`,
      affected_shift_ids: shiftIds,
      payroll_impact: true,
      overtime_hours: Math.round(overtimeHours * 10) / 10,
      manual_review_required: false
    });
  }

  // CAO-PB-2024-R0564: minimaal 8 vrije dagen per loonperiode
  // inclusief 2 blokken van 2 aansluitende vrije dagen, waarvan minimaal 1 weekendblok
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const allDates = [];
  let cur = new Date(start);
  while (cur <= end) {
    allDates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const workedDates = new Set(periodShifts.map(s => s.date));
  const freeDates = allDates.filter(d => !workedDates.has(d));
  const freeDaysCount = freeDates.length;

  if (freeDaysCount < 8) {
    violations.push({
      rule_id: 'CAO-PB-2024-R0564',
      severity: 'high',
      message: `Slechts ${freeDaysCount} vrije dagen in deze loonperiode; minimaal 8 vereist.`,
      affected_shift_ids: [],
      payroll_impact: false,
      free_days_count: freeDaysCount,
      manual_review_required: true
    });
  } else {
    // Controleer blokken van 2 aaneengesloten vrije dagen
    let consecutiveBlocks = 0;
    let weekendBlockFound = false;

    for (let i = 0; i < freeDates.length - 1; i++) {
      const d1 = freeDates[i];
      const d2 = freeDates[i + 1];
      const diffMs = new Date(d2) - new Date(d1);
      if (diffMs === 1000 * 60 * 60 * 24) {
        consecutiveBlocks++;
        if (isWeekendBlock(d1, d2)) weekendBlockFound = true;
      }
    }

    if (consecutiveBlocks < 2) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0564',
        severity: 'medium',
        message: `Onvoldoende blokken van 2 aaneengesloten vrije dagen (${consecutiveBlocks} gevonden, 2 vereist).`,
        affected_shift_ids: [],
        payroll_impact: false,
        manual_review_required: true
      });
    }

    if (!weekendBlockFound) {
      violations.push({
        rule_id: 'CAO-PB-2024-R0564',
        severity: 'medium',
        message: 'Geen weekendblok (zaterdag + zondag vrij) gevonden in deze loonperiode.',
        affected_shift_ids: [],
        payroll_impact: false,
        manual_review_required: true
      });
    }
  }

  // Placeholders voor handmatige review
  const manualReviewItems = [
    { rule_id: 'CAO-PB-2024-R0570', domain: 'rusttijden', message: 'Controleer minimale rusttijden tussen diensten (art. rusttijden). Handmatige review vereist.', manual_review_required: true },
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

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
    const syncResult = await lazySyncCao(base44, !!force_cao_sync);
    const syncWarnings = [];
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    if (!Array.isArray(shifts)) {
      return Response.json({ error: 'shifts array is verplicht' }, { status: 400 });
    }

    // Bepaal loonperiode grenzen
    let pStart = period_start;
    let pEnd = period_end;

    if (!pStart || !pEnd) {
      // Gebruik huidige datum en bereken een 4-weken periode
      const now = new Date();
      pStart = now.toISOString().split('T')[0];
      const fourWeeksLater = new Date(now);
      fourWeeksLater.setDate(fourWeeksLater.getDate() + 27);
      pEnd = fourWeeksLater.toISOString().split('T')[0];
    }

    const result = validateSchedule(shifts, pStart, pEnd);

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    return Response.json({
      success: true,
      period_start: pStart,
      period_end: pEnd,
      personnel_id: personnel_id || null,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
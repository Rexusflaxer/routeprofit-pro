import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_leave_sickness',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB verlof- en ziekteberekeningen
 * R0999: vakantieopbouw fulltime 172,8 uur/24 dagen per jaar, 13,3 uur per 4 weken
 * R1149: wachtdag eerste ziektedag bij < 13 loonperioden brancheancienniteit
 * R1159: eerste 6 maanden ziekte 100%
 * R1160: tweede 6 maanden ziekte 90%
 */

function calculateVacationAccrual(input) {
  const { contract_type, weekly_hours, period_hours, is_call_worker } = input;

  // CAO-PB-2024-R0999: fulltime accrual
  const fulltime_annual_hours = 172.8; // 24 days * 7.2 uur
  const fulltime_per_period = 13.3; // 13,3 uur per 4 weken

  if (is_call_worker || contract_type === '0_uren') {
    // Oproepkrachten: 9,24% van gewerkte uren (CAO art. leave_rules)
    const worked_hours = period_hours || 0;
    const vacation_hours = worked_hours * 0.0924;
    const max_hours = 144;
    return {
      rule_id: 'CAO-PB-2024-R0999-CALL',
      vacation_hours_accrued: Math.min(Math.round(vacation_hours * 100) / 100, max_hours),
      capped_at_max: vacation_hours > max_hours,
      max_hours,
      percentage: 9.24,
      note: 'Oproepkracht: 9,24% van gewerkte uren, max 144 uur per jaar'
    };
  }

  // Parttime: naar rato van fulltimepercentage
  const fulltime_weekly = 38;
  const actual_weekly = weekly_hours || fulltime_weekly;
  const parttimeRatio = Math.min(actual_weekly / fulltime_weekly, 1);

  const accrual = fulltime_per_period * parttimeRatio;

  return {
    rule_id: 'CAO-PB-2024-R0999',
    vacation_hours_accrued_per_period: Math.round(accrual * 100) / 100,
    vacation_hours_annual: Math.round(fulltime_annual_hours * parttimeRatio * 100) / 100,
    parttime_ratio: Math.round(parttimeRatio * 1000) / 1000,
    weekly_hours: actual_weekly,
    note: parttimeRatio < 1 ? `Parttime ${actual_weekly}u/week: naar rato` : 'Fulltime 38u/week'
  };
}

function calculateSicknessPayment(input) {
  const {
    sickness_start_date,
    sickness_end_date,
    industry_seniority_periods, // brancheancienniteit in loonperioden
    base_gross_salary,
    avg_ort_per_period
  } = input;

  if (!sickness_start_date || !base_gross_salary) {
    return { error: 'sickness_start_date en base_gross_salary zijn verplicht' };
  }

  const start = new Date(sickness_start_date);
  const end = sickness_end_date ? new Date(sickness_end_date) : new Date();
  const sicknessDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

  // CAO-PB-2024-R1149: wachtdag bij < 13 loonperioden brancheancienniteit
  const seniority = industry_seniority_periods || 0;
  const has_waiting_day = seniority < 13;

  // Eerste dag niet betaald indien wachtdag van toepassing
  const paid_days_first_period = has_waiting_day
    ? Math.max(0, Math.min(sicknessDays, 180) - 1)
    : Math.min(sicknessDays, 180);

  const days_second_period = Math.max(0, sicknessDays - 180);

  // CAO-PB-2024-R1159: eerste 6 maanden 100%
  // CAO-PB-2024-R1160: tweede 6 maanden 90%
  const daily_salary = base_gross_salary / 20; // ca 20 werkdagen per 4 weken
  const daily_ort = (avg_ort_per_period || 0) / 20;

  const payment_first_period = paid_days_first_period * (daily_salary + daily_ort) * 1.0;
  const payment_second_period = days_second_period * (daily_salary + daily_ort) * 0.9;

  return {
    rule_ids: [
      has_waiting_day ? 'CAO-PB-2024-R1149' : null,
      'CAO-PB-2024-R1159',
      days_second_period > 0 ? 'CAO-PB-2024-R1160' : null
    ].filter(Boolean),
    sickness_days_total: sicknessDays,
    has_waiting_day,
    waiting_day_unpaid: has_waiting_day,
    industry_seniority_periods: seniority,
    paid_days_first_period,
    days_second_period,
    payment_first_period: Math.round(payment_first_period * 100) / 100,
    payment_second_period: Math.round(payment_second_period * 100) / 100,
    total_sickness_payment: Math.round((payment_first_period + payment_second_period) * 100) / 100,
    ort_included: !!avg_ort_per_period,
    note: has_waiting_day
      ? 'Eerste ziektedag geldt als wachtdag (< 13 loonperioden brancheancienniteit)'
      : 'Geen wachtdag (>= 13 loonperioden brancheancienniteit)'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, force_cao_sync, personnel_id } = body;

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
    const syncResult = await lazySyncCao(base44, !!force_cao_sync);
    const syncWarnings = [];
    if (syncResult?.cloudflare_unavailable) syncWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'no_cloudflare_current') syncWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') syncWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    // ── CAO-toepassingscheck ──
    let caoScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    if (action === 'calculate_vacation_accrual') {
      const result = calculateVacationAccrual(body);
      return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, ...result });
    }

    if (action === 'calculate_sickness_payment') {
      const result = calculateSicknessPayment(body);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, ...result });
    }

    // Default: bereken beide
    const vacation = calculateVacationAccrual(body);
    const sickness = body.sickness_start_date ? calculateSicknessPayment(body) : null;

    const scopeWarnings = [];
    if (caoScope && !caoScope.applies_full_security_rules) {
      scopeWarnings.push({
        message: 'Medewerker valt onder artikel 3 lid 2 CAO PB — beveiligingsspecifieke verlof-/ziektieregels zijn mogelijk niet van toepassing.',
        cao_scope_profile: caoScope.cao_scope_profile
      });
    }

    return Response.json({
      success: true,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      scope_warnings: scopeWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      vacation_accrual: vacation,
      sickness_payment: sickness
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_reimbursements',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB vergoedingencalculator
 * R0855: reiskosten eigen vervoer EUR 0,23/km (v.a. 9 km)
 * R0878: maaltijdvergoeding max EUR 11,91
 * R1609: value services vroege dienst 02:00-04:00 EUR 7,50 bruto
 */

const REIMBURSEMENT_RATES = {
  travel_cost_per_km: 0.23,          // art. 47 + Bijlage 6: EUR 0,23/km netto
  travel_min_km: 9,                   // minimaal 9 km voor reiskosten
  meal_allowance_max: 11.91,          // art. 48: max EUR 11,91
  value_services_early_shift: 7.50,   // R1609: 02:00-04:00 = EUR 7,50 bruto
  consignment_per_hour: null,         // manual_review_required
  dog_allowance: null,                // manual_review_required
  dry_cleaning_per_period: null,      // manual_review_required
  accommodation_per_night: null,      // manual_review_required
};

function calculateTravelCost(km_one_way, km_driven = null) {
  // R0855: eigen vervoer v.a. 9 km, EUR 0,23/km over alle kilometers
  if (km_one_way < REIMBURSEMENT_RATES.travel_min_km) {
    return {
      rule_id: 'CAO-PB-2024-R0855',
      eligible: false,
      reason: `Afstand ${km_one_way} km is minder dan ${REIMBURSEMENT_RATES.travel_min_km} km; geen reiskosten.`,
      amount: 0,
      km_used: km_one_way
    };
  }

  const km = km_driven !== null ? km_driven : km_one_way * 2; // heen en terug
  const amount = km * REIMBURSEMENT_RATES.travel_cost_per_km;

  return {
    rule_id: 'CAO-PB-2024-R0855',
    eligible: true,
    km_one_way,
    km_total: km,
    rate_per_km: REIMBURSEMENT_RATES.travel_cost_per_km,
    amount: Math.round(amount * 100) / 100,
    tax_treatment: 'netto',
    note: 'EUR 0,23/km netto over alle gereden kilometers (geen drempel)'
  };
}

function calculateMealAllowance(hours_worked, start_time = null) {
  // R0878: maaltijdvergoeding bij diensten van bepaalde duur
  // Exacte drempel: manual_review_required conform CAO art. 48
  const max = REIMBURSEMENT_RATES.meal_allowance_max;

  if (hours_worked >= 10) {
    return {
      rule_id: 'CAO-PB-2024-R0878',
      eligible: true,
      amount: max,
      max_amount: max,
      note: 'Maaltijdvergoeding max EUR 11,91 bij dienst >= 10 uur'
    };
  }

  return {
    rule_id: 'CAO-PB-2024-R0878',
    eligible: false,
    amount: 0,
    max_amount: max,
    manual_review_required: true,
    note: 'Controleer CAO art. 48 voor exacte toepassingsdrempel maaltijdvergoeding.'
  };
}

function calculateValueServicesEarlyShift(shifts) {
  // R1609: value services vroege dienst tussen 02:00 en 04:00 -> EUR 7,50 bruto per dienst
  const eligible = [];

  for (const shift of shifts) {
    const startHour = parseInt((shift.start_time || '00:00').split(':')[0], 10);
    if (startHour >= 2 && startHour < 4) {
      eligible.push({
        rule_id: 'CAO-PB-2024-R1609',
        date: shift.date,
        start_time: shift.start_time,
        amount: REIMBURSEMENT_RATES.value_services_early_shift,
        tax_treatment: 'bruto',
        note: 'Vroege dienst 02:00-04:00: EUR 7,50 bruto per dienst (Value Services)'
      });
    }
  }

  return {
    rule_id: 'CAO-PB-2024-R1609',
    eligible_shifts: eligible.length,
    total_amount: eligible.length * REIMBURSEMENT_RATES.value_services_early_shift,
    details: eligible
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, km_one_way, km_driven, hours_worked, start_time, shifts, force_cao_sync, personnel_id } = body;

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

    // ── CAO-toepassingscheck (hoofdstuk 5 vergoedingen) ──
    let caoScope = null;
    const scopeWarnings = [];
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }
    if (caoScope && !caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements) {
      scopeWarnings.push({
        rule_ids: caoScope.excluded_rule_ids || [],
        message: 'Hoofdstuk 5 vergoedingen zijn niet van toepassing op deze medewerker (artikel 3 lid 2 CAO PB). Reiskosten en maaltijdvergoeding worden niet automatisch berekend.',
        cao_scope_profile: caoScope.cao_scope_profile
      });
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [...syncWarnings],
        scope_warnings: scopeWarnings,
        chapter_5_skipped: true,
        cao_scope_profile: caoScope.cao_scope_profile
      });
    }

    const result = {};

    if (!action || action === 'travel_cost') {
      if (km_one_way !== undefined) {
        result.travel_cost = calculateTravelCost(km_one_way, km_driven);
      }
    }

    if (!action || action === 'meal_allowance') {
      if (hours_worked !== undefined) {
        result.meal_allowance = calculateMealAllowance(hours_worked, start_time);
      }
    }

    if (!action || action === 'value_services') {
      if (Array.isArray(shifts)) {
        result.value_services = calculateValueServicesEarlyShift(shifts);
      }
    }

    // Manual review items
    result.manual_review_required = [
      { rule_id: 'CAO-PB-2024-R0880', domain: 'pauze', message: 'Pauze/beschikbaarheidsvergoeding: handmatige review vereist (CAO art. 49)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0885', domain: 'consignatie', message: 'Consignatie/bereikbaarheidsvergoeding: handmatige review vereist (CAO art. 50)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0890', domain: 'hond', message: 'Hondenvergoeding: handmatige review vereist (CAO art. 51)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0895', domain: 'stomerij', message: 'Stomerij/kledingvergoeding: handmatige review vereist (CAO art. 52)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0900', domain: 'verblijf', message: 'Verblijfsvergoeding: handmatige review vereist (CAO art. 53)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0905', domain: 'jubileum', message: 'Jubileumvergoeding: handmatige review vereist (CAO art. 54)', manual_review_required: true }
    ];

    return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, scope_warnings: scopeWarnings, cao_scope_profile: caoScope?.cao_scope_profile || null, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
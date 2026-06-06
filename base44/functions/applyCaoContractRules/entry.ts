import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_contract_rules',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

/**
 * CAO PB contractvalidatie en proeftijdberekening
 * Bronregels: CAO-PB-2024-R0315 t/m R0322
 */

function calculateProbationPeriod(input) {
  const {
    contract_form,
    contract_start_date,
    contract_end_date,
    security_role_status
  } = input;

  const warnings = [];
  const source_rule_ids = [];

  // Bereken contractduur in maanden
  let contractDurationMonths = null;
  if (contract_start_date && contract_end_date) {
    const start = new Date(contract_start_date);
    const end = new Date(contract_end_date);
    const diffMs = end - start;
    contractDurationMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  }

  // Aspirant-beveiliger met contract langer dan 6 maanden -> 2 maanden proeftijd
  // CAO-PB-2024-R0317
  if (security_role_status === 'aspirant_beveiliger' &&
      contractDurationMonths !== null && contractDurationMonths > 6) {
    source_rule_ids.push('CAO-PB-2024-R0317');
    return {
      probation_period_months: 2,
      source_rule_ids,
      warnings,
      contract_duration_months: Math.round(contractDurationMonths * 10) / 10
    };
  }

  // Onbepaalde tijd -> 2 maanden proeftijd
  // CAO-PB-2024-R0316
  if (contract_form === 'onbepaalde_tijd') {
    source_rule_ids.push('CAO-PB-2024-R0316');
    return {
      probation_period_months: 2,
      source_rule_ids,
      warnings,
      contract_duration_months: null
    };
  }

  // Bepaalde tijd langer dan 6 maanden -> 1 maand proeftijd
  // CAO-PB-2024-R0315
  if (contract_form === 'bepaalde_tijd') {
    if (contractDurationMonths === null) {
      warnings.push('Geen einddatum opgegeven; kan proeftijd niet berekenen voor bepaalde tijd.');
      return {
        probation_period_months: null,
        source_rule_ids: ['CAO-PB-2024-R0315'],
        warnings,
        contract_duration_months: null
      };
    }
    if (contractDurationMonths > 6) {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return {
        probation_period_months: 1,
        source_rule_ids,
        warnings,
        contract_duration_months: Math.round(contractDurationMonths * 10) / 10
      };
    } else {
      // Bepaalde tijd <= 6 maanden: geen proeftijd
      source_rule_ids.push('CAO-PB-2024-R0315');
      return {
        probation_period_months: 0,
        source_rule_ids,
        warnings: ['Contract korter dan of gelijk aan 6 maanden: geen proeftijd van toepassing.'],
        contract_duration_months: Math.round(contractDurationMonths * 10) / 10
      };
    }
  }

  // Oproep/0-uren/stage/uitzend: geen CAO-proeftijdregels van toepassing
  if (['oproep', 'stage', 'uitzend', 'zzp'].includes(contract_form)) {
    return {
      probation_period_months: 0,
      source_rule_ids: [],
      warnings: [`Proeftijdregel niet van toepassing op contractvorm: ${contract_form}`],
      contract_duration_months: contractDurationMonths
    };
  }

  return {
    probation_period_months: null,
    source_rule_ids: [],
    warnings: ['Contractvorm niet herkend; proeftijd kan niet worden berekend.'],
    contract_duration_months: contractDurationMonths
  };
}

function validateProbationDismissal(input) {
  const { probation_dismissal_datetime, next_shift_datetime, base_hourly_rate } = input;
  const violations = [];

  if (!probation_dismissal_datetime || !next_shift_datetime) {
    return { violations: [], compensation: null };
  }

  const dismissalTime = new Date(probation_dismissal_datetime);
  const shiftTime = new Date(next_shift_datetime);
  const hoursNotice = (shiftTime - dismissalTime) / (1000 * 60 * 60);

  // CAO-PB-2024-R0321: minimaal 12 uur voor eerstvolgende dienst
  if (hoursNotice < 12) {
    const compensation = base_hourly_rate ? base_hourly_rate * 8 : null;
    violations.push({
      rule_id: 'CAO-PB-2024-R0321',
      severity: 'high',
      message: `Opzegging in proeftijd te laat: ${Math.round(hoursNotice * 10) / 10} uur voor dienst (minimaal 12 uur vereist).`,
      // CAO-PB-2024-R0322: vergoeding 8 basisuurlonen
      compensation_rule_id: 'CAO-PB-2024-R0322',
      compensation_description: '8 basisuurlonen vergoeding',
      compensation_amount: compensation ? Math.round(compensation * 100) / 100 : null,
      hours_notice: Math.round(hoursNotice * 10) / 10
    });
  }

  return {
    violations,
    compensation: violations[0]?.compensation_amount || null
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, personnel_id, force_cao_sync } = body;

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

    if (action === 'calculate_probation') {
      const result = calculateProbationPeriod(body);

      // Optioneel: sla proeftijdresultaat op bij medewerker
      if (personnel_id && result.probation_period_months !== null) {
        await base44.entities.Personnel.update(personnel_id, {
          probation_period_months: result.probation_period_months,
          probation_period_source_rule_id: result.source_rule_ids[0] || null
        });
      }

      // Aspirant-beveiliger specifieke regels alleen als scope dat ondersteunt
      const scopeWarnings = [];
      if (caoScope && body.security_role_status === 'aspirant_beveiliger' && !caoScope.applies_full_security_rules) {
        scopeWarnings.push({ message: 'Aspirant-beveiliger regels niet van toepassing: medewerker valt onder artikel 3 lid 2 (geen beveiligingswerk).', cao_scope_profile: caoScope.cao_scope_profile });
      }
      return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, scope_warnings: scopeWarnings, cao_scope_profile: caoScope?.cao_scope_profile || null, ...result });
    }

    if (action === 'validate_dismissal') {
      // Ophalen basis uurloon indien personnel_id opgegeven
      let baseHourlyRate = body.base_hourly_rate || null;
      if (personnel_id && !baseHourlyRate) {
        const personnel = await base44.entities.Personnel.get(personnel_id);
        if (personnel?.cao === 'cao_particuliere_beveiliging') {
          const caos = await base44.asServiceRole.entities.CAOConfiguration.filter({ status: 'active' });
          if (caos[0]?.wage_scales_detailed) {
            const scaleKey = String(personnel.cao_scale || 3);
            const periodKey = String(personnel.cao_period || 1);
            baseHourlyRate = caos[0].wage_scales_detailed[scaleKey]?.[periodKey]?.hourly_rate || null;
          }
        }
      }
      const result = validateProbationDismissal({ ...body, base_hourly_rate: baseHourlyRate });
      return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, cao_scope_profile: caoScope?.cao_scope_profile || null, ...result });
    }

    // Default: bereken proeftijd
    const result = calculateProbationPeriod(body);
    return Response.json({ success: true, cao_sync_status: caoSyncStatus, calculation_warnings: syncWarnings, cao_scope_profile: caoScope?.cao_scope_profile || null, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
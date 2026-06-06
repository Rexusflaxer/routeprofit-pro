import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
 *
 * Scope-bewust: aspirant-beveiliger-specifieke proeftijdregel (R0317)
 * wordt niet toegepast als medewerker onder artikel 3 lid 2 valt.
 */

function calculateProbationPeriod(input, caoScope) {
  const {
    contract_form,
    contract_start_date,
    contract_end_date,
    security_role_status
  } = input;

  const warnings = [];
  const source_rule_ids = [];
  const scope_warnings = [];

  // Bepaal of aspirant-beveiliger-specifieke regel mag worden toegepast
  const isUnknownOrMixed = caoScope && ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);
  const scopeBlocksAspirant = caoScope && caoScope.applies_full_security_rules === false;

  // Bereken contractduur in maanden
  let contractDurationMonths = null;
  if (contract_start_date && contract_end_date) {
    const start = new Date(contract_start_date);
    const end = new Date(contract_end_date);
    contractDurationMonths = (end - start) / (1000 * 60 * 60 * 24 * 30.44);
  }

  // Aspirant-beveiliger regel (CAO-PB-2024-R0317): ALLEEN als full-security scope
  if (security_role_status === 'aspirant_beveiliger') {
    if (scopeBlocksAspirant) {
      scope_warnings.push({
        rule_id: 'CAO-PB-2024-R0317',
        message: `Aspirant-beveiliger proeftijdregel (R0317) NIET toegepast: medewerker valt onder artikel 3 lid 2 of scope is onbekend (profiel: ${caoScope?.cao_scope_profile}). Reguliere proeftijdregels gelden.`
      });
      // Doorgaan met reguliere berekening hieronder
    } else if (!caoScope) {
      // Geen scope beschikbaar: conservatief — pas aspirant-regel NIET toe, flag manual review
      scope_warnings.push({
        rule_id: 'CAO-PB-2024-R0317',
        message: 'CAO-toepassingsprofiel onbekend: aspirant-beveiliger proeftijdregel (R0317) niet automatisch toegepast. Handmatige review vereist.'
      });
    } else {
      // Full-security scope: aspirant-regel mag worden toegepast
      if (contractDurationMonths !== null && contractDurationMonths > 6) {
        source_rule_ids.push('CAO-PB-2024-R0317');
        return {
          probation_period_months: 2,
          source_rule_ids,
          warnings,
          scope_warnings,
          manual_review_required: isUnknownOrMixed,
          contract_duration_months: Math.round(contractDurationMonths * 10) / 10
        };
      }
    }
  }

  // Onbepaalde tijd → 2 maanden (CAO-PB-2024-R0316)
  if (contract_form === 'onbepaalde_tijd') {
    source_rule_ids.push('CAO-PB-2024-R0316');
    return {
      probation_period_months: 2,
      source_rule_ids,
      warnings,
      scope_warnings,
      manual_review_required: isUnknownOrMixed,
      contract_duration_months: null
    };
  }

  // Bepaalde tijd (CAO-PB-2024-R0315)
  if (contract_form === 'bepaalde_tijd') {
    if (contractDurationMonths === null) {
      warnings.push('Geen einddatum opgegeven; kan proeftijd niet berekenen voor bepaalde tijd.');
      return {
        probation_period_months: null,
        source_rule_ids: ['CAO-PB-2024-R0315'],
        warnings,
        scope_warnings,
        manual_review_required: true,
        contract_duration_months: null
      };
    }
    if (contractDurationMonths > 6) {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return {
        probation_period_months: 1,
        source_rule_ids,
        warnings,
        scope_warnings,
        manual_review_required: isUnknownOrMixed,
        contract_duration_months: Math.round(contractDurationMonths * 10) / 10
      };
    } else {
      source_rule_ids.push('CAO-PB-2024-R0315');
      return {
        probation_period_months: 0,
        source_rule_ids,
        warnings: [...warnings, 'Contract korter dan of gelijk aan 6 maanden: geen proeftijd van toepassing.'],
        scope_warnings,
        manual_review_required: isUnknownOrMixed,
        contract_duration_months: Math.round(contractDurationMonths * 10) / 10
      };
    }
  }

  // Oproep/0-uren/stage/uitzend/zzp: geen CAO-proeftijdregels
  if (['oproep', 'stage', 'uitzend', 'zzp'].includes(contract_form)) {
    return {
      probation_period_months: 0,
      source_rule_ids: [],
      warnings: [`Proeftijdregel niet van toepassing op contractvorm: ${contract_form}`],
      scope_warnings,
      manual_review_required: false,
      contract_duration_months: contractDurationMonths
    };
  }

  return {
    probation_period_months: null,
    source_rule_ids: [],
    warnings: ['Contractvorm niet herkend; proeftijd kan niet worden berekend.'],
    scope_warnings,
    manual_review_required: true,
    contract_duration_months: contractDurationMonths
  };
}

function validateProbationDismissal(input) {
  const { probation_dismissal_datetime, next_shift_datetime, base_hourly_rate } = input;
  const violations = [];
  if (!probation_dismissal_datetime || !next_shift_datetime) return { violations: [], compensation: null };

  const dismissalTime = new Date(probation_dismissal_datetime);
  const shiftTime = new Date(next_shift_datetime);
  const hoursNotice = (shiftTime - dismissalTime) / (1000 * 60 * 60);

  if (hoursNotice < 12) {
    const compensation = base_hourly_rate ? base_hourly_rate * 8 : null;
    violations.push({
      rule_id: 'CAO-PB-2024-R0321',
      severity: 'high',
      message: `Opzegging in proeftijd te laat: ${Math.round(hoursNotice * 10) / 10} uur voor dienst (minimaal 12 uur vereist).`,
      compensation_rule_id: 'CAO-PB-2024-R0322',
      compensation_description: '8 basisuurlonen vergoeding',
      compensation_amount: compensation ? Math.round(compensation * 100) / 100 : null,
      hours_notice: Math.round(hoursNotice * 10) / 10
    });
  }

  return { violations, compensation: violations[0]?.compensation_amount || null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, personnel_id, force_cao_sync } = body;

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

    // ── CAO-toepassingscheck (scope eerst resolven) ──
    let caoScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    } else if (body.personnel) {
      // Inline personnel meegegeven (geen opgeslagen ID)
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel: body.personnel });
        caoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    const isUnknownOrMixed = caoScope && ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    if (action === 'calculate_probation') {
      const result = calculateProbationPeriod(body, caoScope);

      // Sla resultaat op bij medewerker als er een duidelijke uitkomst is
      if (personnel_id && result.probation_period_months !== null && !result.manual_review_required) {
        await base44.entities.Personnel.update(personnel_id, {
          probation_period_months: result.probation_period_months,
          probation_period_source_rule_id: result.source_rule_ids[0] || null
        });
      }

      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: syncWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: result.manual_review_required || isUnknownOrMixed,
        ...result
      });
    }

    if (action === 'validate_dismissal') {
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
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: syncWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        manual_review_required: isUnknownOrMixed,
        ...result
      });
    }

    // Default: bereken proeftijd
    const result = calculateProbationPeriod(body, caoScope);
    return Response.json({
      success: true,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      manual_review_required: result.manual_review_required || isUnknownOrMixed,
      ...result
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
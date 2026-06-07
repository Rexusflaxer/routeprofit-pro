import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_REIMBURSEMENT_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_REIMBURSEMENT_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_REIMBURSEMENT_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : key
      ? `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Vergoedingen zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
      : `Runtime ${functionName} mist cao_key. Vergoedingen zijn geblokkeerd zodat geen PB-default wordt toegepast.`
  };
}

async function lazySyncCao(base44, forceCaoSync = false, caoKey = null) {
  if (caoKey !== CAO_PB_KEY) {
    return {
      changed: false,
      reason: caoKey ? 'skipped_unsupported_cao_sync' : 'skipped_missing_cao_key',
      cao_key: caoKey,
      note: 'Lazy Cloudflare sync is alleen ingericht voor CAO Particuliere Beveiliging.'
    };
  }
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return null;
}

function firstObject(...values) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function parameterSource(field, configuredValue, fallbackValue, fallbackSourceRuleIds) {
  return {
    field,
    source: configuredValue !== null && configuredValue !== undefined ? 'cao_configuration' : 'cao_pb_runtime_default',
    configured_value_present: configuredValue !== null && configuredValue !== undefined,
    value: configuredValue !== null && configuredValue !== undefined ? configuredValue : fallbackValue,
    fallback_source_rule_ids: fallbackSourceRuleIds
  };
}

function resolveReimbursementParameters(caoConfig) {
  const allowances = caoConfig?.allowances || {};
  const cashValueRules = caoConfig?.cash_value_logistics_rules || {};
  const travel = firstObject(
    allowances.travel_reimbursement,
    allowances.travel,
    allowances.reiskosten,
    allowances.article_47,
    caoConfig?.travel_reimbursement_rules
  );
  const meal = firstObject(
    allowances.meal_allowance,
    allowances.meal,
    allowances.maaltijdvergoeding,
    allowances.article_48
  );
  const valueServices = firstObject(
    cashValueRules.value_services_early_shift_allowance,
    cashValueRules.early_shift_allowance,
    allowances.value_services_early_shift,
    allowances.cash_value_early_shift,
    allowances.article_103
  );

  const configuredTravelRate = firstNumber(
    travel.rate_per_km,
    travel.travel_cost_per_km,
    travel.amount_per_km,
    allowances.travel_cost_per_km
  );
  const configuredTravelMinKm = firstNumber(
    travel.min_km,
    travel.minimum_one_way_km,
    travel.travel_min_km,
    allowances.travel_min_km
  );
  const configuredMealMax = firstNumber(
    meal.max_amount,
    meal.meal_allowance_max,
    meal.amount,
    allowances.meal_allowance_max
  );
  const configuredMealMinHours = firstNumber(
    meal.minimum_shift_hours,
    meal.min_hours_worked,
    meal.eligible_from_hours,
    allowances.meal_allowance_min_hours
  );
  const configuredEarlyShiftAmount = firstNumber(
    valueServices.amount,
    valueServices.rate_per_shift,
    valueServices.value_services_early_shift,
    allowances.value_services_early_shift
  );

  return {
    travel_cost_per_km: configuredTravelRate ?? REIMBURSEMENT_RATES.travel_cost_per_km,
    travel_min_km: configuredTravelMinKm ?? REIMBURSEMENT_RATES.travel_min_km,
    meal_allowance_max: configuredMealMax ?? REIMBURSEMENT_RATES.meal_allowance_max,
    meal_allowance_min_hours: configuredMealMinHours ?? 10,
    value_services_early_shift: configuredEarlyShiftAmount ?? REIMBURSEMENT_RATES.value_services_early_shift,
    value_services_early_shift_amount: configuredEarlyShiftAmount ?? REIMBURSEMENT_RATES.value_services_early_shift,
    source_rule_ids: {
      travel: travel.source_rule_ids || ['CAO-PB-2024-R0855'],
      meal: meal.source_rule_ids || ['CAO-PB-2024-R0878'],
      value_services_early_shift: valueServices.source_rule_ids || ['CAO-PB-2024-R1609']
    },
    provenance: {
      travel_cost_per_km: parameterSource('allowances.travel.rate_per_km', configuredTravelRate, REIMBURSEMENT_RATES.travel_cost_per_km, ['CAO-PB-2024-R0855']),
      travel_min_km: parameterSource('allowances.travel.min_km', configuredTravelMinKm, REIMBURSEMENT_RATES.travel_min_km, ['CAO-PB-2024-R0855']),
      meal_allowance_max: parameterSource('allowances.meal.max_amount', configuredMealMax, REIMBURSEMENT_RATES.meal_allowance_max, ['CAO-PB-2024-R0878']),
      meal_allowance_min_hours: parameterSource('allowances.meal.minimum_shift_hours', configuredMealMinHours, 10, ['CAO-PB-2024-R0878']),
      value_services_early_shift: parameterSource('cash_value_logistics_rules.value_services_early_shift_allowance.amount', configuredEarlyShiftAmount, REIMBURSEMENT_RATES.value_services_early_shift, ['CAO-PB-2024-R1609'])
    }
  };
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function contractCoversDate(contract, referenceDate) {
  const date = isoDate(referenceDate);
  if (!contract || !date) return false;
  const start = isoDate(contract.contract_start_date || contract.start_date || contract.employment_start_date);
  const end = isoDate(contract.contract_end_date || contract.end_date || contract.employment_end_date) || '9999-12-31';
  if (!start) return false;
  return start <= date && date <= end;
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}

function reimbursementReferenceDate(body) {
  return isoDate(
    body.reference_date ||
    body.service_date ||
    body.shift_date ||
    body.date ||
    body.period_end_date ||
    body.service_context?.service_date ||
    body.service_context?.date ||
    (Array.isArray(body.shifts) ? body.shifts.find(shift => shift?.date || shift?.service_date)?.date : null) ||
    (Array.isArray(body.shifts) ? body.shifts.find(shift => shift?.date || shift?.service_date)?.service_date : null) ||
    new Date().toISOString()
  );
}

function resolveContractCaoForDate({ explicitCaoKey, contract, contracts = [], referenceDate }) {
  const date = isoDate(referenceDate);
  const sourceContracts = contract ? [contract] : (contracts || []).filter(item => contractCoversDate(item, date));
  const contractCaoKeys = uniqueNonEmpty(sourceContracts.map(item => item.cao_key));
  const resolution = {
    reference_date: date,
    selected_contract_ids: sourceContracts.map(item => item.id).filter(Boolean),
    selected_contract_cao_keys: contractCaoKeys,
    cao_key: contractCaoKeys.length === 1 ? contractCaoKeys[0] : null,
    selected_contract: sourceContracts.length === 1 ? sourceContracts[0] : null,
    status: 'resolved'
  };

  if (explicitCaoKey && contractCaoKeys.length === 1 && contractCaoKeys[0] !== explicitCaoKey) {
    return {
      ...resolution,
      status: 'blocked_explicit_cao_contract_mismatch',
      blocking_reason: `Expliciete cao_key ${explicitCaoKey} botst met contract-CAO ${contractCaoKeys[0]} op ${date}.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length > 1) {
    return {
      ...resolution,
      status: 'blocked_ambiguous_contract_cao_key',
      blocking_reason: `Meerdere contract-CAO's actief op ${date}: ${contractCaoKeys.join(', ')}.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length === 0 && sourceContracts.length > 0) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_cao_key',
      manual_review_required: true,
      blocking_reason: `Contract actief op ${date}, maar cao_key ontbreekt op het contract.`
    };
  }
  if (!explicitCaoKey && contractCaoKeys.length === 0) {
    return {
      ...resolution,
      status: 'blocked_missing_contract_or_explicit_cao_key',
      manual_review_required: true,
      blocking_reason: 'Vergoedingen vereisen een expliciete cao_key of een actief arbeidscontract met cao_key. Medewerkerstamdata of PB-default mag niet als bron worden gebruikt.'
    };
  }

  return resolution;
}

function activeCaoConfigurationCandidates(configs, referenceDate) {
  const ref = isoDate(referenceDate || new Date().toISOString());
  return (configs || [])
    .filter(config => config.status === 'active' || config.is_active === true)
    .filter(config => !config.valid_from || config.valid_from <= ref)
    .filter(config => !config.valid_until || config.valid_until >= ref)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));
}

async function resolveActiveCaoConfig(base44, referenceDate, caoKey) {
  const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({
    status: 'active',
    cao_key: caoKey
  });
  const candidates = activeCaoConfigurationCandidates(configs, referenceDate);
  const summarizedCandidates = candidates.map(config => ({
    id: config.id,
    name: config.name || config.version_label || null,
    cloudflare_revision: config.cloudflare_revision || null,
    valid_from: config.valid_from || null,
    valid_until: config.valid_until || null
  }));

  if (candidates.length > 1) {
    return {
      config: null,
      candidates: summarizedCandidates,
      status: 'blocked_ambiguous_active_cao_config',
      message: `Meerdere actieve CAO-configuraties gevonden voor ${caoKey} op ${isoDate(referenceDate)}; vergoedingencalculatie is geblokkeerd om historische CAO-keuze niet te gokken.`
    };
  }
  if (candidates.length === 0) {
    return {
      config: null,
      candidates: [],
      status: 'blocked_missing_active_cao_config',
      message: `Geen actieve CAO-configuratie gevonden voor ${caoKey} op ${isoDate(referenceDate)}.`
    };
  }
  return {
    config: candidates[0],
    candidates: summarizedCandidates,
    status: 'resolved',
    message: null
  };
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
    source_coverage_passed: snapshot?.source_coverage?.passed ?? null
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
          message: 'CAOConfiguration mist rule_registry_fingerprint; definitieve vergoedingencalculatie is niet audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

function calculateTravelCost(km_one_way, km_driven = null, parameters = resolveReimbursementParameters(null)) {
  // R0855: eigen vervoer v.a. 9 km, EUR 0,23/km over alle kilometers
  if (km_one_way < parameters.travel_min_km) {
    return {
      rule_id: parameters.source_rule_ids.travel[0] || 'CAO-PB-2024-R0855',
      source_rule_ids: parameters.source_rule_ids.travel,
      eligible: false,
      reason: `Afstand ${km_one_way} km is minder dan ${parameters.travel_min_km} km; geen reiskosten.`,
      amount: 0,
      km_used: km_one_way,
      parameter_provenance: {
        travel_min_km: parameters.provenance.travel_min_km
      }
    };
  }

  const km = km_driven !== null ? km_driven : km_one_way * 2; // heen en terug
  const amount = km * parameters.travel_cost_per_km;

  return {
    rule_id: parameters.source_rule_ids.travel[0] || 'CAO-PB-2024-R0855',
    source_rule_ids: parameters.source_rule_ids.travel,
    eligible: true,
    km_one_way,
    km_total: km,
    rate_per_km: parameters.travel_cost_per_km,
    amount: Math.round(amount * 100) / 100,
    tax_treatment: 'netto',
    parameter_provenance: {
      travel_cost_per_km: parameters.provenance.travel_cost_per_km,
      travel_min_km: parameters.provenance.travel_min_km
    },
    note: `EUR ${parameters.travel_cost_per_km}/km netto over alle gereden kilometers bij minimaal ${parameters.travel_min_km} km enkele reis.`
  };
}

function calculateMealAllowance(hours_worked, start_time = null, parameters = resolveReimbursementParameters(null)) {
  // R0878: maaltijdvergoeding bij diensten van bepaalde duur
  // Exacte drempel: manual_review_required conform CAO art. 48
  const max = parameters.meal_allowance_max;
  const minimumHours = parameters.meal_allowance_min_hours;

  if (hours_worked >= minimumHours) {
    return {
      rule_id: parameters.source_rule_ids.meal[0] || 'CAO-PB-2024-R0878',
      source_rule_ids: parameters.source_rule_ids.meal,
      eligible: true,
      amount: max,
      max_amount: max,
      minimum_shift_hours: minimumHours,
      parameter_provenance: {
        meal_allowance_max: parameters.provenance.meal_allowance_max,
        meal_allowance_min_hours: parameters.provenance.meal_allowance_min_hours
      },
      note: `Maaltijdvergoeding max EUR ${max} bij dienst >= ${minimumHours} uur.`
    };
  }

  return {
    rule_id: parameters.source_rule_ids.meal[0] || 'CAO-PB-2024-R0878',
    source_rule_ids: parameters.source_rule_ids.meal,
    eligible: false,
    amount: 0,
    max_amount: max,
    minimum_shift_hours: minimumHours,
    manual_review_required: true,
    parameter_provenance: {
      meal_allowance_max: parameters.provenance.meal_allowance_max,
      meal_allowance_min_hours: parameters.provenance.meal_allowance_min_hours
    },
    note: 'Controleer CAO art. 48 voor exacte toepassingsdrempel maaltijdvergoeding.'
  };
}

function calculateValueServicesEarlyShift(shifts, parameters = resolveReimbursementParameters(null)) {
  // R1609: value services vroege dienst tussen 02:00 en 04:00 -> EUR 7,50 bruto per dienst
  const eligible = [];

  for (const shift of shifts) {
    const startHour = parseInt((shift.start_time || '00:00').split(':')[0], 10);
    if (startHour >= 2 && startHour < 4) {
      eligible.push({
        rule_id: parameters.source_rule_ids.value_services_early_shift[0] || 'CAO-PB-2024-R1609',
        source_rule_ids: parameters.source_rule_ids.value_services_early_shift,
        date: shift.date,
        start_time: shift.start_time,
        amount: parameters.value_services_early_shift,
        tax_treatment: 'bruto',
        parameter_provenance: {
          value_services_early_shift: parameters.provenance.value_services_early_shift
        },
        note: `Vroege dienst 02:00-04:00: EUR ${parameters.value_services_early_shift} bruto per dienst (Value Services).`
      });
    }
  }

  return {
    rule_id: parameters.source_rule_ids.value_services_early_shift[0] || 'CAO-PB-2024-R1609',
    source_rule_ids: parameters.source_rule_ids.value_services_early_shift,
    eligible_shifts: eligible.length,
    rate_per_shift: parameters.value_services_early_shift,
    total_amount: Math.round(eligible.length * parameters.value_services_early_shift * 100) / 100,
    parameter_provenance: {
      value_services_early_shift: parameters.provenance.value_services_early_shift
    },
    details: eligible
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, km_one_way, km_driven, hours_worked, start_time, shifts, force_cao_sync, personnel_id, contract_id } = body;

    let personnel = body.personnel || null;
    if (personnel_id && !personnel) {
      personnel = await base44.entities.Personnel.get(personnel_id).catch(() => null);
      if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnel_id}` }, { status: 404 });
    }

    let contract = body.contract || null;
    if (contract_id && !contract) {
      contract = await base44.entities.PersonnelContract.get(contract_id).catch(() => null);
      if (!contract) return Response.json({ error: `Arbeidscontract niet gevonden: ${contract_id}` }, { status: 404 });
    }
    const contracts = personnel_id
      ? await base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id }).catch(() => [])
      : [];
    const referenceDate = reimbursementReferenceDate(body);
    const explicitCaoKey = body.cao_key || body.service_context?.cao_key || null;
    const contractCaoResolution = resolveContractCaoForDate({
      explicitCaoKey,
      contract,
      contracts,
      referenceDate
    });
    if (String(contractCaoResolution.status || '').startsWith('blocked_')) {
      return Response.json({
        error: contractCaoResolution.blocking_reason,
        action: action || 'calculate_reimbursements',
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: contractCaoResolution.status
      }, { status: 400 });
    }

    const targetCaoKey = explicitCaoKey ||
      contractCaoResolution.cao_key ||
      null;

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
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

    const reimbursementRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'calculateCaoReimbursements');
    if (!reimbursementRuntimeSupport.supported) {
      return Response.json({
        error: reimbursementRuntimeSupport.message,
        action: action || 'calculate_reimbursements',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Vergoedingencalculator geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_key: targetCaoKey,
        cao_runtime_support: reimbursementRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: reimbursementRuntimeSupport.status
      }, { status: 422 });
    }

    const caoConfigResolution = await resolveActiveCaoConfig(base44, referenceDate, targetCaoKey);
    if (!caoConfigResolution.config) {
      return Response.json({
        error: caoConfigResolution.message,
        action: action || 'calculate_reimbursements',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          caoConfigResolution.message
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        cao_key: targetCaoKey,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: reimbursementRuntimeSupport,
        active_cao_configuration_candidates: caoConfigResolution.candidates,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: caoConfigResolution.status
      }, { status: 400 });
    }

    const caoConfig = caoConfigResolution.config;
    const reimbursementParameters = resolveReimbursementParameters(caoConfig);
    const caoPayrollReadiness = getCaoPayrollReadiness(caoConfig);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
    if (!caoPayrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}). Definitieve vergoedingencalculatie is geblokkeerd totdat de CAO coverage-gate slaagt.`,
        action: action || 'calculate_reimbursements',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Vergoedingencalculatie geblokkeerd: CAO-regeldekking of payrollparameters zijn niet bewezen compleet.'
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        reference_date: referenceDate,
        cao_configuration_id: caoConfig.id,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: reimbursementRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    // ── Normaliseer CAO-scope: null = fail-closed ──
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

    // ── CAO-toepassingscheck (hoofdstuk 5 vergoedingen) ──
    let rawScope = null;
    const scopeWarnings = [];
    if (targetCaoKey === CAO_PB_KEY && personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          cao_key: targetCaoKey,
          contract: contractCaoResolution.selected_contract || contract || null,
          work_context: body.service_context || null
        });
        rawScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }
    // Fail-closed: geen personnel_id of resolve mislukt → unknown_manual_review
    const caoScope = normalizeCaoScope(rawScope);
    const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    // Hoofdstuk 5 alleen als expliciet apply_chapter_5_reimbursements === true
    const applyChapter5 = caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements === true;

    if (!applyChapter5) {
      scopeWarnings.push({
        rule_ids: caoScope.excluded_rule_ids || [],
        message: isUnknownOrMixed
          ? `CAO-toepassingsprofiel ontbreekt of onzeker (${caoScope.cao_scope_profile}); hoofdstuk 5 vergoedingen worden niet automatisch berekend. Handmatige review vereist.`
          : 'Hoofdstuk 5 vergoedingen zijn niet van toepassing op deze medewerker (artikel 3 lid 2 CAO PB). Reiskosten en maaltijdvergoeding worden niet automatisch berekend.',
        cao_scope_profile: caoScope.cao_scope_profile
      });
      return Response.json({
        success: true,
        manual_review_required: true,
        chapter_5_skipped: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        cao_configuration_id: caoConfig.id || null,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: reimbursementRuntimeSupport,
        calculation_warnings: [...syncWarnings],
        scope_warnings: scopeWarnings,
        cao_scope_profile: caoScope.cao_scope_profile,
        payroll_final_allowed: false
      });
    }

    const result = {};

    if (!action || action === 'travel_cost') {
      if (km_one_way !== undefined) {
        result.travel_cost = calculateTravelCost(km_one_way, km_driven, reimbursementParameters);
      }
    }

    if (!action || action === 'meal_allowance') {
      if (hours_worked !== undefined) {
        result.meal_allowance = calculateMealAllowance(hours_worked, start_time, reimbursementParameters);
      }
    }

    if (!action || action === 'value_services') {
      if (Array.isArray(shifts)) {
        result.value_services = calculateValueServicesEarlyShift(shifts, reimbursementParameters);
      }
    }

    // Manual review items
    result.manual_review_items = [
      { rule_id: 'CAO-PB-2024-R0880', domain: 'pauze', message: 'Pauze/beschikbaarheidsvergoeding: handmatige review vereist (CAO art. 49)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0885', domain: 'consignatie', message: 'Consignatie/bereikbaarheidsvergoeding: handmatige review vereist (CAO art. 50)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0890', domain: 'hond', message: 'Hondenvergoeding: handmatige review vereist (CAO art. 51)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0895', domain: 'stomerij', message: 'Stomerij/kledingvergoeding: handmatige review vereist (CAO art. 52)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0900', domain: 'verblijf', message: 'Verblijfsvergoeding: handmatige review vereist (CAO art. 53)', manual_review_required: true },
      { rule_id: 'CAO-PB-2024-R0905', domain: 'jubileum', message: 'Jubileumvergoeding: handmatige review vereist (CAO art. 54)', manual_review_required: true }
    ];

    return Response.json({
      success: true,
      cao_sync_status: caoSyncStatus,
      cao_key: targetCaoKey,
      cao_configuration_id: caoConfig.id || null,
      cao_version_label: caoConfig.version_label || caoConfig.name || null,
      cao_valid_from: caoConfig.valid_from || null,
      cao_valid_until: caoConfig.valid_until || null,
      cao_payroll_readiness: caoPayrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_reimbursement_parameters: reimbursementParameters,
      contract_id: contract_id || contract?.id || null,
      contract_cao_resolution: {
        ...contractCaoResolution,
        selected_contract: undefined
      },
      cao_runtime_support: reimbursementRuntimeSupport,
      calculation_warnings: syncWarnings,
      scope_warnings: scopeWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      ...result,
      manual_review_required: contractCaoResolution.manual_review_required === true || result.manual_review_items.length > 0,
      payroll_final_allowed: contractCaoResolution.manual_review_required !== true && result.manual_review_items.length === 0
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

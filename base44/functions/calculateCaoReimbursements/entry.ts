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
  travel_above_40_rate_per_km: 0.16,  // aanvullende vergoeding boven 40 km enkele reis
  travel_above_40_threshold_km: 40,
  work_work_travel_rate_per_km: 0.27,
  public_transport_class: '2e_klas',
  meal_allowance_max: 11.91,          // art. 48: max EUR 11,91
  break_availability_per_half_hour: 0.43,
  consignment_per_hour: 1.43,
  consignment_weekend_holiday_per_hour: 2.87,
  reachability_per_pay_period: 71.73,
  dog_service_allowance_per_period: 115.24,
  dog_cost_owner_per_period: 144.04,
  dog_cost_employer_owner_per_period: 86.43,
  fulltime_hours_per_pay_period: 144,
  value_services_early_shift: 7.50,   // R1609: 02:00-04:00 = EUR 7,50 bruto
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

function firstString(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return String(value);
  }
  return null;
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
  const breakAvailability = firstObject(
    allowances.break_availability,
    allowances.pause_availability,
    allowances.pauzetoeslag,
    allowances.article_49
  );
  const consignment = firstObject(
    allowances.consignment,
    allowances.consignment_reachability,
    allowances.bereikbaarheidsvergoeding,
    allowances.article_50
  );
  const dog = firstObject(
    allowances.dog,
    allowances.dog_allowance,
    allowances.hondenvergoeding,
    allowances.article_51
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
  const configuredTravelAbove40Rate = firstNumber(
    travel.above_40_rate_per_km,
    travel.additional_rate_per_km,
    allowances.travel_above_40_rate_per_km
  );
  const configuredTravelAbove40Threshold = firstNumber(
    travel.above_40_threshold_km,
    travel.additional_threshold_km,
    allowances.travel_above_40_threshold_km
  );
  const configuredWorkWorkTravelRate = firstNumber(
    travel.work_work_rate_per_km,
    travel.business_rate_per_km,
    allowances.work_work_travel_rate_per_km
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
  const configuredBreakAvailabilityRate = firstNumber(
    breakAvailability.rate_per_half_hour,
    breakAvailability.amount_per_half_hour,
    allowances.break_availability_per_half_hour
  );
  const configuredConsignmentRate = firstNumber(
    consignment.rate_per_hour,
    consignment.consignment_per_hour,
    allowances.consignment_per_hour
  );
  const configuredConsignmentWeekendRate = firstNumber(
    consignment.weekend_holiday_rate_per_hour,
    consignment.weekend_or_holiday_per_hour,
    allowances.consignment_weekend_holiday_per_hour
  );
  const configuredReachabilityPerPeriod = firstNumber(
    consignment.reachability_per_pay_period,
    consignment.piket_per_pay_period,
    allowances.reachability_per_pay_period
  );
  const configuredDogServiceAllowance = firstNumber(
    dog.service_allowance_per_period,
    dog.dog_service_allowance_per_period,
    allowances.dog_service_allowance_per_period
  );
  const configuredDogOwnerCosts = firstNumber(
    dog.owner_cost_per_period,
    dog.dog_cost_owner_per_period,
    allowances.dog_cost_owner_per_period
  );
  const configuredDogEmployerOwnerCosts = firstNumber(
    dog.employer_owner_cost_per_period,
    dog.dog_cost_employer_owner_per_period,
    allowances.dog_cost_employer_owner_per_period
  );
  const configuredFulltimeHours = firstNumber(
    allowances.fulltime_hours_per_pay_period,
    caoConfig?.leave_rules?.standard_vacation?.fulltime_period_hours
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
    travel_above_40_rate_per_km: configuredTravelAbove40Rate ?? REIMBURSEMENT_RATES.travel_above_40_rate_per_km,
    travel_above_40_threshold_km: configuredTravelAbove40Threshold ?? REIMBURSEMENT_RATES.travel_above_40_threshold_km,
    work_work_travel_rate_per_km: configuredWorkWorkTravelRate ?? REIMBURSEMENT_RATES.work_work_travel_rate_per_km,
    public_transport_class: firstString(travel.public_transport_class, REIMBURSEMENT_RATES.public_transport_class),
    meal_allowance_max: configuredMealMax ?? REIMBURSEMENT_RATES.meal_allowance_max,
    meal_allowance_min_hours: configuredMealMinHours ?? 10,
    break_availability_per_half_hour: configuredBreakAvailabilityRate ?? REIMBURSEMENT_RATES.break_availability_per_half_hour,
    consignment_per_hour: configuredConsignmentRate ?? REIMBURSEMENT_RATES.consignment_per_hour,
    consignment_weekend_holiday_per_hour: configuredConsignmentWeekendRate ?? REIMBURSEMENT_RATES.consignment_weekend_holiday_per_hour,
    reachability_per_pay_period: configuredReachabilityPerPeriod ?? REIMBURSEMENT_RATES.reachability_per_pay_period,
    dog_service_allowance_per_period: configuredDogServiceAllowance ?? REIMBURSEMENT_RATES.dog_service_allowance_per_period,
    dog_cost_owner_per_period: configuredDogOwnerCosts ?? REIMBURSEMENT_RATES.dog_cost_owner_per_period,
    dog_cost_employer_owner_per_period: configuredDogEmployerOwnerCosts ?? REIMBURSEMENT_RATES.dog_cost_employer_owner_per_period,
    fulltime_hours_per_pay_period: configuredFulltimeHours ?? REIMBURSEMENT_RATES.fulltime_hours_per_pay_period,
    value_services_early_shift: configuredEarlyShiftAmount ?? REIMBURSEMENT_RATES.value_services_early_shift,
    value_services_early_shift_amount: configuredEarlyShiftAmount ?? REIMBURSEMENT_RATES.value_services_early_shift,
    source_rule_ids: {
      travel: travel.source_rule_ids || ['CAO-PB-2024-R0847', 'CAO-PB-2024-R0855', 'CAO-PB-2024-R0857', 'CAO-PB-2024-R0858'],
      meal: meal.source_rule_ids || ['CAO-PB-2024-R0878', 'CAO-PB-2024-R0880', 'CAO-PB-2024-R0881', 'CAO-PB-2024-R0882'],
      break_availability: breakAvailability.source_rule_ids || ['CAO-PB-2024-R0888', 'CAO-PB-2024-R0891', 'CAO-PB-2024-R0892', 'CAO-PB-2024-R0896'],
      consignment: consignment.source_rule_ids || ['CAO-PB-2024-R0898', 'CAO-PB-2024-R0900', 'CAO-PB-2024-R0901', 'CAO-PB-2024-R0906'],
      dog: dog.source_rule_ids || ['CAO-PB-2024-R0911', 'CAO-PB-2024-R0912', 'CAO-PB-2024-R0920', 'CAO-PB-2024-R0921', 'CAO-PB-2024-R0923'],
      dry_cleaning: ['CAO-PB-2024-R0938'],
      accommodation: ['CAO-PB-2024-R0940'],
      jubilee: ['CAO-PB-2024-R0942', 'CAO-PB-2024-R0943', 'CAO-PB-2024-R0944', 'CAO-PB-2024-R0946'],
      value_services_early_shift: valueServices.source_rule_ids || ['CAO-PB-2024-R1609']
    },
    provenance: {
      travel_cost_per_km: parameterSource('allowances.travel.rate_per_km', configuredTravelRate, REIMBURSEMENT_RATES.travel_cost_per_km, ['CAO-PB-2024-R0855']),
      travel_min_km: parameterSource('allowances.travel.min_km', configuredTravelMinKm, REIMBURSEMENT_RATES.travel_min_km, ['CAO-PB-2024-R0855']),
      travel_above_40_rate_per_km: parameterSource('allowances.travel.above_40_rate_per_km', configuredTravelAbove40Rate, REIMBURSEMENT_RATES.travel_above_40_rate_per_km, ['CAO-PB-2024-R0857']),
      travel_above_40_threshold_km: parameterSource('allowances.travel.above_40_threshold_km', configuredTravelAbove40Threshold, REIMBURSEMENT_RATES.travel_above_40_threshold_km, ['CAO-PB-2024-R0857']),
      work_work_travel_rate_per_km: parameterSource('allowances.travel.work_work_rate_per_km', configuredWorkWorkTravelRate, REIMBURSEMENT_RATES.work_work_travel_rate_per_km, ['CAO-PB-2024-R0858']),
      meal_allowance_max: parameterSource('allowances.meal.max_amount', configuredMealMax, REIMBURSEMENT_RATES.meal_allowance_max, ['CAO-PB-2024-R0878']),
      meal_allowance_min_hours: parameterSource('allowances.meal.minimum_shift_hours', configuredMealMinHours, 10, ['CAO-PB-2024-R0878']),
      break_availability_per_half_hour: parameterSource('allowances.break_availability.rate_per_half_hour', configuredBreakAvailabilityRate, REIMBURSEMENT_RATES.break_availability_per_half_hour, ['CAO-PB-2024-R0892']),
      consignment_per_hour: parameterSource('allowances.consignment.rate_per_hour', configuredConsignmentRate, REIMBURSEMENT_RATES.consignment_per_hour, ['CAO-PB-2024-R0900']),
      consignment_weekend_holiday_per_hour: parameterSource('allowances.consignment.weekend_holiday_rate_per_hour', configuredConsignmentWeekendRate, REIMBURSEMENT_RATES.consignment_weekend_holiday_per_hour, ['CAO-PB-2024-R0901']),
      reachability_per_pay_period: parameterSource('allowances.consignment.reachability_per_pay_period', configuredReachabilityPerPeriod, REIMBURSEMENT_RATES.reachability_per_pay_period, ['CAO-PB-2024-R0906']),
      dog_service_allowance_per_period: parameterSource('allowances.dog.service_allowance_per_period', configuredDogServiceAllowance, REIMBURSEMENT_RATES.dog_service_allowance_per_period, ['CAO-PB-2024-R0912']),
      dog_cost_owner_per_period: parameterSource('allowances.dog.owner_cost_per_period', configuredDogOwnerCosts, REIMBURSEMENT_RATES.dog_cost_owner_per_period, ['CAO-PB-2024-R0920']),
      dog_cost_employer_owner_per_period: parameterSource('allowances.dog.employer_owner_cost_per_period', configuredDogEmployerOwnerCosts, REIMBURSEMENT_RATES.dog_cost_employer_owner_per_period, ['CAO-PB-2024-R0921']),
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

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'ja', '1'].includes(normalized)) return true;
  if (['false', 'no', 'nee', '0'].includes(normalized)) return false;
  return null;
}

function clockMinutes(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function minutesBetween(startTime, endTime) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  if (start === null || end === null) return null;
  return end >= start ? end - start : (24 * 60 - start) + end;
}

function isWeekendDate(value) {
  const iso = isoDate(value);
  if (!iso) return false;
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function manualReview(ruleId, domain, message, extra = {}) {
  return {
    rule_id: ruleId,
    domain,
    message,
    manual_review_required: true,
    ...extra
  };
}

function collectManualReviewItems(value) {
  const items = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.manual_review_required === true && node.rule_id && node.domain && node.message) {
      items.push(node);
    }
    if (Array.isArray(node.manual_review_items)) {
      for (const item of node.manual_review_items) items.push(item);
    }
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') walk(child);
    }
  }
  walk(value);
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.rule_id}|${item.domain}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const oneWayKm = numberOrNull(km_one_way) ?? 0;
  if (oneWayKm < parameters.travel_min_km) {
    return {
      rule_id: parameters.source_rule_ids.travel[0] || 'CAO-PB-2024-R0855',
      source_rule_ids: parameters.source_rule_ids.travel,
      eligible: false,
      reason: `Afstand ${oneWayKm} km is minder dan ${parameters.travel_min_km} km; geen reiskosten.`,
      amount: 0,
      km_used: oneWayKm,
      parameter_provenance: {
        travel_min_km: parameters.provenance.travel_min_km
      }
    };
  }

  const km = numberOrNull(km_driven) !== null ? numberOrNull(km_driven) : oneWayKm * 2; // heen en terug
  const baseAmount = km * parameters.travel_cost_per_km;
  const aboveThresholdOneWayKm = Math.max(0, oneWayKm - parameters.travel_above_40_threshold_km);
  const additionalKm = aboveThresholdOneWayKm * 2;
  const additionalAmount = additionalKm * parameters.travel_above_40_rate_per_km;

  return {
    rule_id: parameters.source_rule_ids.travel[0] || 'CAO-PB-2024-R0855',
    source_rule_ids: parameters.source_rule_ids.travel,
    eligible: true,
    km_one_way: oneWayKm,
    km_total: km,
    rate_per_km: parameters.travel_cost_per_km,
    base_amount: round2(baseAmount),
    above_40_km_one_way: aboveThresholdOneWayKm,
    above_40_km_total: additionalKm,
    above_40_rate_per_km: parameters.travel_above_40_rate_per_km,
    above_40_amount: round2(additionalAmount),
    amount: round2(baseAmount + additionalAmount),
    tax_treatment: 'netto',
    parameter_provenance: {
      travel_cost_per_km: parameters.provenance.travel_cost_per_km,
      travel_min_km: parameters.provenance.travel_min_km,
      travel_above_40_rate_per_km: parameters.provenance.travel_above_40_rate_per_km,
      travel_above_40_threshold_km: parameters.provenance.travel_above_40_threshold_km
    },
    note: `EUR ${parameters.travel_cost_per_km}/km netto over alle gereden kilometers bij minimaal ${parameters.travel_min_km} km enkele reis; boven ${parameters.travel_above_40_threshold_km} km aanvullend EUR ${parameters.travel_above_40_rate_per_km}/km.`
  };
}

function calculateWorkWorkTravelCost(km, parameters = resolveReimbursementParameters(null)) {
  const workWorkKm = Math.max(0, numberOrNull(km) ?? 0);
  return {
    rule_id: 'CAO-PB-2024-R0858',
    source_rule_ids: ['CAO-PB-2024-R0858'],
    eligible: workWorkKm > 0,
    km_total: workWorkKm,
    rate_per_km: parameters.work_work_travel_rate_per_km,
    amount: round2(workWorkKm * parameters.work_work_travel_rate_per_km),
    tax_treatment: 'netto',
    parameter_provenance: {
      work_work_travel_rate_per_km: parameters.provenance.work_work_travel_rate_per_km
    },
    note: 'Werk-werkverkeer wordt vergoed op basis van enkele reisafstand tussen locaties.'
  };
}

function calculatePublicTransportReimbursement(amount, proofProvided, parameters = resolveReimbursementParameters(null)) {
  const costs = Math.max(0, numberOrNull(amount) ?? 0);
  const proof = booleanOrNull(proofProvided);
  return {
    rule_id: 'CAO-PB-2024-R0856',
    source_rule_ids: ['CAO-PB-2024-R0856'],
    eligible: costs > 0,
    amount: round2(costs),
    public_transport_class: parameters.public_transport_class,
    tax_treatment: 'netto',
    manual_review_required: proof !== true,
    manual_review_items: proof === true ? [] : [
      manualReview('CAO-PB-2024-R0856', 'public_transport', 'OV-vergoeding vereist bewijs van 2e klas vervoersbewijzen.', { field: 'public_transport_proof_provided' })
    ],
    note: `Openbaar vervoer: kosten ${parameters.public_transport_class} vergoed; bewijs moet toonbaar zijn.`
  };
}

function calculateDeclaredTravelExpenses(body) {
  const parkingCosts = numberOrNull(body.parking_costs);
  const tollCosts = numberOrNull(body.toll_costs);
  const ferryCosts = numberOrNull(body.ferry_costs);
  const total = round2((parkingCosts ?? 0) + (tollCosts ?? 0) + (ferryCosts ?? 0));
  const publicTransportUnavailable = booleanOrNull(body.parking_no_hourly_public_transport_within_1_5km);
  const noFreeParking = booleanOrNull(body.no_free_parking_within_1_5km);
  const proofProvided = booleanOrNull(body.travel_expense_receipts_provided);
  const manualItems = [];
  if (parkingCosts !== null && (publicTransportUnavailable !== true || noFreeParking !== true)) {
    manualItems.push(manualReview('CAO-PB-2024-R0862', 'parking', 'Parkeerkosten alleen declarabel als geen gratis parkeren en geen passend OV binnen 1,5 km beschikbaar is.', { field: 'parking_conditions' }));
  }
  if (total > 0 && proofProvided !== true) {
    manualItems.push(manualReview('CAO-PB-2024-R0861', 'travel_expenses', 'Tol/veerpont/parkeeronkosten vereisen declaratiebewijs volgens werkgeversregels.', { field: 'travel_expense_receipts_provided' }));
  }
  return {
    rule_id: 'CAO-PB-2024-R0861',
    source_rule_ids: ['CAO-PB-2024-R0861', 'CAO-PB-2024-R0862', 'CAO-PB-2024-R0864'],
    eligible: total > 0,
    parking_costs: round2(parkingCosts ?? 0),
    toll_costs: round2(tollCosts ?? 0),
    ferry_costs: round2(ferryCosts ?? 0),
    amount: total,
    tax_treatment: 'netto',
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function calculateTravelSpecialCases(body, parameters = resolveReimbursementParameters(null)) {
  const manualItems = [];
  const sourceRuleIds = [
    'CAO-PB-2024-R0859', 'CAO-PB-2024-R0860', 'CAO-PB-2024-R0865',
    'CAO-PB-2024-R0866', 'CAO-PB-2024-R0867', 'CAO-PB-2024-R0869',
    'CAO-PB-2024-R0870', 'CAO-PB-2024-R0872', 'CAO-PB-2024-R0873'
  ];

  const brokenServiceTotalKm = numberOrNull(body.broken_service_total_commute_km);
  const brokenServiceOutboundKmTotal = numberOrNull(body.broken_service_outbound_km_total);
  const brokenServiceAmount = brokenServiceTotalKm !== null
    ? round2(brokenServiceTotalKm * parameters.travel_cost_per_km)
    : null;
  if (brokenServiceOutboundKmTotal !== null && brokenServiceTotalKm === null) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0859',
      'travel_broken_service',
      'Gebroken dienst: geef totale woon-werk-kilometers op, of bevestig hoe heenreizen/terugreizen zijn omgerekend.',
      { field: 'broken_service_total_commute_km' }
    ));
  }

  const arboVisitKm = numberOrNull(body.arbo_or_reintegration_visit_km_total);
  const arboVisitAmount = arboVisitKm !== null ? round2(arboVisitKm * parameters.travel_cost_per_km) : null;
  const arboVisitRequired = booleanOrNull(body.arbo_or_reintegration_visit_required);
  if (arboVisitKm !== null && arboVisitRequired !== true) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0860',
      'travel_arbo_reintegration',
      'Reisvergoeding voor arbodienst/re-integratiebedrijf vereist dat het bezoek in dit kader plaatsvindt.',
      { field: 'arbo_or_reintegration_visit_required' }
    ));
  }

  const moved = booleanOrNull(body.employee_moved_after_contract_start);
  const employerWrittenConsent = booleanOrNull(body.relocation_employer_written_consent);
  const oldPostcodeOneWayKm = numberOrNull(body.old_home_postcode_one_way_km);
  const newPostcodeOneWayKm = numberOrNull(body.new_home_postcode_one_way_km);
  const relocationCapApplies = moved === true && employerWrittenConsent !== true;
  const relocationReimbursementOneWayKm = relocationCapApplies && oldPostcodeOneWayKm !== null && newPostcodeOneWayKm !== null
    ? Math.min(oldPostcodeOneWayKm, newPostcodeOneWayKm)
    : null;
  const relocationCompensationOffered = booleanOrNull(body.relocation_lower_reimbursement_compensation_offered);
  if (relocationCapApplies && (oldPostcodeOneWayKm === null || newPostcodeOneWayKm === null)) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0866',
      'travel_relocation',
      'Verhuizing zonder schriftelijke toestemming: oude en nieuwe postcodeafstand zijn nodig om de reiskostenbegrenzing te bepalen.',
      { field: 'old_home_postcode_one_way_km/new_home_postcode_one_way_km' }
    ));
  }
  if (relocationCapApplies && relocationCompensationOffered === false) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0867',
      'travel_relocation',
      'Bij lagere reisvergoeding door verhuizing kan werkgever een compensatie beoordelen; leg besluitvorming vast.',
      { field: 'relocation_lower_reimbursement_compensation_offered' }
    ));
  }

  const salderingApplied = booleanOrNull(body.travel_reimbursement_saldering_applied);
  const period = body.travel_reimbursement_saldering_period || null;
  if (salderingApplied === true && !['service', 'dienst', 'pay_period', 'loonperiode', 'year', 'jaar'].includes(String(period || '').toLowerCase())) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0872',
      'travel_fiscal_saldering',
      'Salderen van vergoedingen moet per dienst, loonperiode of jaar worden ingericht.',
      { field: 'travel_reimbursement_saldering_period' }
    ));
  }
  if (booleanOrNull(body.max_fiscally_favorable_travel_treatment_applied) === false) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R0873',
      'travel_fiscal_saldering',
      'Werkgever moet streven naar de maximaal fiscaal haalbare behandeling van vergoedingen.',
      { field: 'max_fiscally_favorable_travel_treatment_applied' }
    ));
  }

  return {
    rule_id: 'CAO-PB-2024-R0859',
    source_rule_ids: sourceRuleIds,
    broken_service_commute: {
      total_commute_km: brokenServiceTotalKm,
      outbound_km_total_input: brokenServiceOutboundKmTotal,
      rate_per_km: parameters.travel_cost_per_km,
      amount: brokenServiceAmount,
      tax_treatment: 'netto'
    },
    arbo_or_reintegration_visit: {
      required_visit_confirmed: arboVisitRequired === true,
      km_total: arboVisitKm,
      rate_per_km: parameters.travel_cost_per_km,
      amount: arboVisitAmount,
      tax_treatment: 'netto'
    },
    relocation: {
      employee_moved_after_contract_start: moved,
      employer_written_consent: employerWrittenConsent,
      cap_to_old_postcode_applies: relocationCapApplies,
      old_home_postcode_one_way_km: oldPostcodeOneWayKm,
      new_home_postcode_one_way_km: newPostcodeOneWayKm,
      reimbursement_one_way_km: relocationReimbursementOneWayKm,
      lower_reimbursement_compensation_offered: relocationCompensationOffered
    },
    fiscal_saldering: {
      reimbursements_may_be_paid_net_or_gross: true,
      saldering_allowed_for_relevant_travel_reimbursements: true,
      saldering_period: period,
      allowed_periods: ['service', 'pay_period', 'year'],
      max_fiscally_favorable_treatment_required: true
    },
    amount: round2((brokenServiceAmount || 0) + (arboVisitAmount || 0)),
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function calculateSchipholReimbursements(body, caoScope) {
  const worksAirport = caoScope?.cao_scope_profile === 'airport_schiphol' ||
    booleanOrNull(body.works_airport_schiphol ?? body.schiphol_service ?? body.airport_schiphol_service) === true;
  const sourceRuleIds = [
    'CAO-PB-2024-R1539', 'CAO-PB-2024-R1540', 'CAO-PB-2024-R1541',
    'CAO-PB-2024-R1542', 'CAO-PB-2024-R1543', 'CAO-PB-2024-R1544',
    'CAO-PB-2024-R1545', 'CAO-PB-2024-R1546', 'CAO-PB-2024-R1547',
    'CAO-PB-2024-R1548', 'CAO-PB-2024-R1549', 'CAO-PB-2024-R1550',
    'CAO-PB-2024-R1551', 'CAO-PB-2024-R1552', 'CAO-PB-2024-R1553',
    'CAO-PB-2024-R1554'
  ];
  const manualItems = [];
  if (!worksAirport) {
    return {
      applies: false,
      source_rule_ids: sourceRuleIds,
      parking: { eligible: false, amount: 0 },
      shoes: { eligible: false, amount: 0 },
      hearing_protection: { eligible: false, employer_must_provide: false },
      manual_review_required: false,
      manual_review_items: []
    };
  }

  const parkingCosts = numberOrNull(body.schiphol_parking_costs ?? body.parking_costs);
  const monthlySubscriptionRequired = booleanOrNull(body.schiphol_monthly_parking_subscription_required);
  const earlyOrLateService = booleanOrNull(body.schiphol_early_or_late_service ?? body.parking_due_early_or_late_service);
  const designatedParkingUsed = booleanOrNull(body.schiphol_designated_parking_used);
  const parkingEligible = (parkingCosts !== null || monthlySubscriptionRequired === true) &&
    earlyOrLateService === true &&
    designatedParkingUsed === true;
  if ((parkingCosts !== null || monthlySubscriptionRequired === true) && !parkingEligible) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R1540',
      'airport_schiphol_parking',
      'Schiphol parkeervergoeding vereist vroege/late dienst en gebruik van de door werkgever aangewezen parkeervoorziening.',
      { field: 'schiphol_early_or_late_service/schiphol_designated_parking_used' }
    ));
  }

  const probationCompleted = booleanOrNull(body.probation_completed ?? body.proeftijd_afgerond);
  const shoesRequested = booleanOrNull(body.schiphol_shoes_requested ?? body.arbo_shoes_requested);
  const shoesCashRequested = booleanOrNull(body.schiphol_shoes_cash_compensation_requested);
  if (shoesRequested === true && probationCompleted !== true) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R1547',
      'airport_schiphol_shoes',
      'Schiphol arbo-schoenen kunnen pas na afloop van de proeftijd worden aangevraagd.',
      { field: 'probation_completed' }
    ));
  }
  if (shoesCashRequested === true) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R1551',
      'airport_schiphol_shoes',
      'Voor Schiphol arbo-schoenen bestaat geen geldvergoeding in plaats van de aangeboden schoenen.',
      { field: 'schiphol_shoes_cash_compensation_requested' }
    ));
  }

  const hearingProtectionNeeded = booleanOrNull(body.schiphol_hearing_protection_needed);
  const hearingProtectionProvided = booleanOrNull(body.schiphol_hearing_protection_provided);
  if (hearingProtectionNeeded === true && hearingProtectionProvided !== true) {
    manualItems.push(manualReview(
      'CAO-PB-2024-R1553',
      'airport_schiphol_hearing_protection',
      'Als gehoorbescherming nodig is om gehoorschade te voorkomen, moet de werkgever arbo-verantwoorde gehoorbescherming beschikbaar stellen.',
      { field: 'schiphol_hearing_protection_provided' }
    ));
  }

  return {
    applies: true,
    source_rule_ids: sourceRuleIds,
    parking: {
      eligible: parkingEligible,
      amount: parkingEligible ? round2(parkingCosts ?? 0) : 0,
      monthly_subscription_fully_reimbursed_if_required: monthlySubscriptionRequired === true,
      tax_treatment: 'netto'
    },
    shoes: {
      eligible: shoesRequested === true && probationCompleted === true && shoesCashRequested !== true,
      provided_in_kind_only: true,
      replacement_interval_years: 2,
      cash_compensation_allowed: false
    },
    hearing_protection: {
      eligible: hearingProtectionNeeded === true,
      employer_must_provide: hearingProtectionNeeded === true,
      provided: hearingProtectionProvided === true
    },
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function calculateMealAllowance(input, startTimeOrParameters = null, maybeParameters = null) {
  const parameters = maybeParameters || (startTimeOrParameters && typeof startTimeOrParameters === 'object'
    ? startTimeOrParameters
    : resolveReimbursementParameters(null));
  const hours_worked = typeof input === 'object' ? input.hours_worked : input;
  const start_time = typeof input === 'object' ? input.start_time : startTimeOrParameters;
  const end_time = typeof input === 'object' ? input.end_time : null;
  const planned_end_time = typeof input === 'object' ? input.planned_end_time : null;
  const declaredCost = typeof input === 'object' ? numberOrNull(input.meal_declared_costs ?? input.declared_meal_cost) : null;
  // R0878-R0885: maximaal bedrag, declaratiebasis, start < 13:00 en eind > 19:00 of minimaal 2 uur langer dan vastgesteld.
  const max = parameters.meal_allowance_max;
  const minimumHours = parameters.meal_allowance_min_hours;
  const startMinutes = clockMinutes(start_time);
  const endMinutes = clockMinutes(end_time);
  const plannedEndMinutes = clockMinutes(planned_end_time);
  const crossesMealWindow = startMinutes !== null && endMinutes !== null &&
    startMinutes < (13 * 60) &&
    (endMinutes > (19 * 60) || endMinutes < startMinutes);
  const extendedAtLeastTwoHours = endMinutes !== null && plannedEndMinutes !== null &&
    ((endMinutes - plannedEndMinutes + (24 * 60)) % (24 * 60)) >= 120;
  const fallbackEligible = numberOrNull(hours_worked) !== null && Number(hours_worked) >= minimumHours;
  const eligible = crossesMealWindow || extendedAtLeastTwoHours || fallbackEligible;
  const amount = eligible ? Math.min(max, declaredCost ?? max) : 0;
  const manualItems = [];
  if (eligible && declaredCost === null) {
    manualItems.push(manualReview('CAO-PB-2024-R0882', 'meal_allowance', 'Maaltijdvergoeding is op declaratiebasis; werkelijk gedeclareerde kosten ontbreken.', { field: 'meal_declared_costs' }));
  }
  if (!crossesMealWindow && !extendedAtLeastTwoHours && fallbackEligible) {
    manualItems.push(manualReview('CAO-PB-2024-R0880', 'meal_allowance', 'Maaltijdvergoeding is voorlopig toegekend op urendrempel; start/eindtijd of verlenging moet worden bevestigd.', { field: 'start_time/end_time/planned_end_time' }));
  }

  if (eligible) {
    return {
      rule_id: parameters.source_rule_ids.meal[0] || 'CAO-PB-2024-R0878',
      source_rule_ids: parameters.source_rule_ids.meal,
      eligible: true,
      amount: round2(amount),
      max_amount: max,
      minimum_shift_hours: minimumHours,
      declared_costs: declaredCost,
      starts_before_13_and_ends_after_19: crossesMealWindow,
      extended_at_least_two_hours_after_start: extendedAtLeastTwoHours,
      declaration_basis: true,
      manual_review_required: manualItems.length > 0,
      manual_review_items: manualItems,
      parameter_provenance: {
        meal_allowance_max: parameters.provenance.meal_allowance_max,
        meal_allowance_min_hours: parameters.provenance.meal_allowance_min_hours
      },
      note: `Maaltijdvergoeding max EUR ${max}; op declaratiebasis.`
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
    note: 'Geen maaltijdvergoeding op basis van de aangeleverde tijden/uren.'
  };
}

function calculateBreakAvailabilityAllowance(input, parameters = resolveReimbursementParameters(null)) {
  const halfHours = numberOrNull(input.break_availability_half_hours) ??
    (numberOrNull(input.break_availability_minutes) !== null ? Math.ceil(numberOrNull(input.break_availability_minutes) / 30) : null);
  const group = String(input.cao_function_group || input.function_group || '').toLowerCase();
  const eligibleFunction = ['mobiel_surveillant', 'winkelsurveillant'].includes(group) ||
    input.is_mobile_or_retail_surveillance === true;
  const available = booleanOrNull(input.unpaid_break_available_required ?? input.break_availability_required) === true;
  const workedDuringPause = booleanOrNull(input.worked_during_unpaid_break) === true;
  const eligible = eligibleFunction && available && Number(halfHours || 0) > 0;
  const manualItems = [];
  if ((available || Number(halfHours || 0) > 0) && !eligibleFunction) {
    manualItems.push(manualReview('CAO-PB-2024-R0890', 'break_availability', 'Pauzetoeslag geldt alleen voor mobiele surveillant of winkelsurveillant.', { field: 'cao_function_group' }));
  }
  if (workedDuringPause) {
    manualItems.push(manualReview('CAO-PB-2024-R0896', 'break_availability', 'Als tijdens de pauze gewerkt is, moet pauze verschuiven of arbeidstijd worden; verwerk dit in planning/payroll.', { field: 'worked_during_unpaid_break' }));
  }
  return {
    rule_id: 'CAO-PB-2024-R0888',
    source_rule_ids: parameters.source_rule_ids.break_availability,
    eligible,
    half_hours: halfHours ?? 0,
    rate_per_half_hour: parameters.break_availability_per_half_hour,
    amount: eligible ? round2(halfHours * parameters.break_availability_per_half_hour) : 0,
    tax_treatment: 'bruto',
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems,
    parameter_provenance: {
      break_availability_per_half_hour: parameters.provenance.break_availability_per_half_hour
    }
  };
}

function calculateConsignmentAndReachability(input, parameters = resolveReimbursementParameters(null)) {
  const hours = Math.max(0, numberOrNull(input.consignment_hours) ?? 0);
  const weekendHolidayHours = Math.max(0, numberOrNull(input.consignment_weekend_holiday_hours) ?? 0);
  const regularHours = Math.max(0, hours - weekendHolidayHours);
  const reachabilityRequired = booleanOrNull(input.reachability_phone_followup_required ?? input.piket_required) === true;
  const amount = (regularHours * parameters.consignment_per_hour) +
    (weekendHolidayHours * parameters.consignment_weekend_holiday_per_hour) +
    (reachabilityRequired ? parameters.reachability_per_pay_period : 0);
  return {
    rule_id: 'CAO-PB-2024-R0898',
    source_rule_ids: parameters.source_rule_ids.consignment,
    eligible: hours > 0 || reachabilityRequired,
    consignment_hours: hours,
    consignment_regular_hours: regularHours,
    consignment_weekend_holiday_hours: weekendHolidayHours,
    rate_per_hour: parameters.consignment_per_hour,
    weekend_holiday_rate_per_hour: parameters.consignment_weekend_holiday_per_hour,
    reachability_phone_followup_required: reachabilityRequired,
    reachability_per_pay_period: parameters.reachability_per_pay_period,
    amount: round2(amount),
    tax_treatment: 'bruto',
    parameter_provenance: {
      consignment_per_hour: parameters.provenance.consignment_per_hour,
      consignment_weekend_holiday_per_hour: parameters.provenance.consignment_weekend_holiday_per_hour,
      reachability_per_pay_period: parameters.provenance.reachability_per_pay_period
    }
  };
}

function parttimeRatio(input, parameters) {
  const hours = numberOrNull(input.contract_hours_per_pay_period ?? input.paid_hours_per_pay_period ?? input.period_hours);
  if (hours === null) return 1;
  return Math.min(1, Math.max(0, hours / parameters.fulltime_hours_per_pay_period));
}

function calculateDogAllowance(input, parameters = resolveReimbursementParameters(null)) {
  const worksWithDog = booleanOrNull(input.works_with_dog ?? input.dog_service_performed) === true;
  const dogOwner = input.dog_owner || input.dog_ownership || null; // employee | employer
  const employerChoosesDeclarationOnly = booleanOrNull(input.dog_costs_declaration_only) === true;
  const ratio = parttimeRatio(input, parameters);
  const manualItems = [];
  if (worksWithDog && !dogOwner) {
    manualItems.push(manualReview('CAO-PB-2024-R0920', 'dog_allowance', 'Hondeneigendom ontbreekt; kies employee of employer voor de kostenvergoeding.', { field: 'dog_owner' }));
  }
  if (employerChoosesDeclarationOnly) {
    manualItems.push(manualReview('CAO-PB-2024-R0924', 'dog_allowance', 'Werkgever kiest declaratie van werkelijke hondenkosten; forfaitaire kostenvergoeding niet automatisch definitief.', { field: 'dog_costs_declaration_only' }));
  }
  const serviceAllowance = worksWithDog ? parameters.dog_service_allowance_per_period * ratio : 0;
  let dogCostAllowance = 0;
  if (worksWithDog && !employerChoosesDeclarationOnly) {
    if (dogOwner === 'employee') dogCostAllowance = parameters.dog_cost_owner_per_period * ratio;
    if (dogOwner === 'employer') dogCostAllowance = parameters.dog_cost_employer_owner_per_period * ratio;
  }
  const dogTransportCosts = numberOrNull(input.dog_transport_costs);
  const dogTrainingHours = numberOrNull(input.mandatory_dog_training_hours_per_pay_period);
  if (dogTrainingHours !== null && dogTrainingHours >= 11) {
    manualItems.push(manualReview('CAO-PB-2024-R0932', 'dog_training', 'Noodzakelijke/verplichte hondentraining vanaf gemiddeld 11 uur per loonperiode telt als arbeidstijd en kosten moeten worden vergoed.', { field: 'mandatory_dog_training_hours_per_pay_period' }));
  }
  return {
    rule_id: 'CAO-PB-2024-R0911',
    source_rule_ids: parameters.source_rule_ids.dog,
    eligible: worksWithDog,
    parttime_ratio: round2(ratio),
    service_allowance_gross: round2(serviceAllowance),
    dog_cost_allowance_net: round2(dogCostAllowance),
    dog_transport_costs_declared: round2(dogTransportCosts ?? 0),
    amount_gross: round2(serviceAllowance),
    amount_net: round2(dogCostAllowance + (dogTransportCosts ?? 0)),
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems,
    parameter_provenance: {
      dog_service_allowance_per_period: parameters.provenance.dog_service_allowance_per_period,
      dog_cost_owner_per_period: parameters.provenance.dog_cost_owner_per_period,
      dog_cost_employer_owner_per_period: parameters.provenance.dog_cost_employer_owner_per_period
    }
  };
}

function calculateDryCleaningAllowance(input) {
  const costs = numberOrNull(input.dry_cleaning_costs);
  const receipt = booleanOrNull(input.dry_cleaning_receipt_provided);
  return {
    rule_id: 'CAO-PB-2024-R0938',
    source_rule_ids: ['CAO-PB-2024-R0938'],
    eligible: costs !== null && costs > 0,
    amount: round2(costs ?? 0),
    tax_treatment: 'netto',
    minimum_frequency: 'minimaal_1_keer_per_4_weken',
    manual_review_required: costs !== null && receipt !== true,
    manual_review_items: costs !== null && receipt !== true
      ? [manualReview('CAO-PB-2024-R0938', 'dry_cleaning', 'Stomerijkosten zijn declaratiekosten; bon/bewijs ontbreekt.', { field: 'dry_cleaning_receipt_provided' })]
      : []
  };
}

function calculateAccommodationAllowance(input) {
  const required = booleanOrNull(input.overnight_required_by_employer) === true;
  const accommodationCosts = numberOrNull(input.accommodation_costs);
  const mealCosts = numberOrNull(input.overnight_meal_costs);
  const amount = round2((accommodationCosts ?? 0) + (mealCosts ?? 0));
  const manualItems = [];
  if ((accommodationCosts !== null || mealCosts !== null) && !required) {
    manualItems.push(manualReview('CAO-PB-2024-R0940', 'accommodation', 'Verblijfskosten gelden als werkgever overnachting voor werk vraagt; bevestiging ontbreekt.', { field: 'overnight_required_by_employer' }));
  }
  return {
    rule_id: 'CAO-PB-2024-R0940',
    source_rule_ids: ['CAO-PB-2024-R0940'],
    eligible: required && amount > 0,
    accommodation_costs: round2(accommodationCosts ?? 0),
    meal_costs: round2(mealCosts ?? 0),
    amount,
    tax_treatment: 'netto',
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function calculateJubileeAllowance(input) {
  const serviceYears = numberOrNull(input.service_years ?? input.continuous_service_years);
  const periodSalary = numberOrNull(input.period_salary ?? input.base_period_salary);
  const contractTransferYearsIncluded = booleanOrNull(input.contract_transfer_service_years_included) === true;
  const factor = serviceYears !== null && serviceYears >= 40 ? 1 : serviceYears !== null && serviceYears >= 25 ? 0.5 : 0;
  const manualItems = [];
  if (factor > 0 && periodSalary === null) {
    manualItems.push(manualReview('CAO-PB-2024-R0943', 'jubilee', 'Jubileumvergoeding vereist periodeloon als berekeningsbasis.', { field: 'period_salary' }));
  }
  if (factor > 0 && input.contract_change_history_present === true && !contractTransferYearsIncluded) {
    manualItems.push(manualReview('CAO-PB-2024-R0947', 'jubilee', 'Dienstjaren uit contractwissel moeten meetellen voor jubileumdatum.', { field: 'contract_transfer_service_years_included' }));
  }
  return {
    rule_id: 'CAO-PB-2024-R0942',
    source_rule_ids: ['CAO-PB-2024-R0942', 'CAO-PB-2024-R0943', 'CAO-PB-2024-R0944', 'CAO-PB-2024-R0946', 'CAO-PB-2024-R0947'],
    eligible: factor > 0,
    service_years: serviceYears,
    period_salary: periodSalary,
    factor_period_salary: factor,
    amount: periodSalary !== null ? round2(periodSalary * factor) : null,
    pay_in_next_pay_period: factor > 0,
    tax_treatment: 'netto_if_fiscally_allowed',
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
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
        cao_reimbursement_parameters: reimbursementParameters,
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
      if (body.work_work_km !== undefined || body.business_km !== undefined) {
        result.work_work_travel_cost = calculateWorkWorkTravelCost(body.work_work_km ?? body.business_km, reimbursementParameters);
      }
      if (body.public_transport_costs !== undefined) {
        result.public_transport = calculatePublicTransportReimbursement(body.public_transport_costs, body.public_transport_proof_provided, reimbursementParameters);
      }
      if (body.parking_costs !== undefined || body.toll_costs !== undefined || body.ferry_costs !== undefined) {
        result.declared_travel_expenses = calculateDeclaredTravelExpenses(body);
      }
      if (body.broken_service_total_commute_km !== undefined ||
        body.broken_service_outbound_km_total !== undefined ||
        body.arbo_or_reintegration_visit_km_total !== undefined ||
        body.employee_moved_after_contract_start !== undefined ||
        body.travel_reimbursement_saldering_applied !== undefined ||
        body.max_fiscally_favorable_travel_treatment_applied !== undefined) {
        result.travel_special_cases = calculateTravelSpecialCases(body, reimbursementParameters);
      }
    }

    if (action === 'travel_special_cases') {
      result.travel_special_cases = calculateTravelSpecialCases(body, reimbursementParameters);
    }

    if (!action || action === 'meal_allowance') {
      if (hours_worked !== undefined) {
        result.meal_allowance = calculateMealAllowance({
          hours_worked,
          start_time,
          end_time: body.end_time,
          planned_end_time: body.planned_end_time,
          meal_declared_costs: body.meal_declared_costs ?? body.declared_meal_cost
        }, reimbursementParameters);
      }
    }

    if (!action || action === 'break_availability') {
      if (body.break_availability_half_hours !== undefined || body.break_availability_minutes !== undefined || body.unpaid_break_available_required !== undefined) {
        result.break_availability_allowance = calculateBreakAvailabilityAllowance({
          ...body,
          cao_function_group: body.cao_function_group || caoScope?.function_classification?.cao_function_group || personnel?.cao_function_group || contract?.cao_function_group || null
        }, reimbursementParameters);
      }
    }

    if (!action || action === 'consignment' || action === 'reachability') {
      if (body.consignment_hours !== undefined || body.consignment_weekend_holiday_hours !== undefined || body.reachability_phone_followup_required !== undefined || body.piket_required !== undefined) {
        result.consignment_and_reachability = calculateConsignmentAndReachability(body, reimbursementParameters);
      }
    }

    if (!action || action === 'dog_allowance') {
      if (body.works_with_dog !== undefined || body.dog_service_performed !== undefined || body.dog_owner !== undefined || body.dog_transport_costs !== undefined) {
        result.dog_allowance = calculateDogAllowance(body, reimbursementParameters);
      }
    }

    if (!action || action === 'dry_cleaning') {
      if (body.dry_cleaning_costs !== undefined) {
        result.dry_cleaning = calculateDryCleaningAllowance(body);
      }
    }

    if (!action || action === 'accommodation') {
      if (body.overnight_required_by_employer !== undefined || body.accommodation_costs !== undefined || body.overnight_meal_costs !== undefined) {
        result.accommodation = calculateAccommodationAllowance(body);
      }
    }

    if (!action || action === 'jubilee') {
      if (body.service_years !== undefined || body.continuous_service_years !== undefined) {
        result.jubilee = calculateJubileeAllowance(body);
      }
    }

    if (!action || action === 'value_services') {
      if (Array.isArray(shifts)) {
        result.value_services = calculateValueServicesEarlyShift(shifts, reimbursementParameters);
      }
    }

    if (!action || action === 'schiphol' || action === 'airport_schiphol') {
      if (caoScope.cao_scope_profile === 'airport_schiphol' ||
        body.works_airport_schiphol !== undefined ||
        body.schiphol_parking_costs !== undefined ||
        body.schiphol_shoes_requested !== undefined ||
        body.schiphol_hearing_protection_needed !== undefined) {
        result.schiphol_reimbursements = calculateSchipholReimbursements(body, caoScope);
      }
    }

    result.manual_review_items = collectManualReviewItems(result);
    result.reimbursement_totals = {
      gross_amount: round2(
        (result.break_availability_allowance?.amount || 0) +
        (result.consignment_and_reachability?.amount || 0) +
        (result.dog_allowance?.amount_gross || 0) +
        (result.value_services?.total_amount || 0)
      ),
      net_amount: round2(
        (result.travel_cost?.amount || 0) +
        (result.work_work_travel_cost?.amount || 0) +
        (result.public_transport?.amount || 0) +
        (result.declared_travel_expenses?.amount || 0) +
        (result.travel_special_cases?.amount || 0) +
        (result.meal_allowance?.amount || 0) +
        (result.dog_allowance?.amount_net || 0) +
        (result.dry_cleaning?.amount || 0) +
        (result.accommodation?.amount || 0) +
        (result.schiphol_reimbursements?.parking?.amount || 0)
      ),
      jubilee_amount: result.jubilee?.amount ?? null
    };

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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_YEAR_END_BONUS_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || null;
  const supported = SUPPORTED_YEAR_END_BONUS_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : key ? 'blocked_unsupported_cao_runtime' : 'blocked_missing_cao_key',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_YEAR_END_BONUS_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : key
      ? `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Eindejaarsuitkering is geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
      : `Runtime ${functionName} mist cao_key. Eindejaarsuitkering is geblokkeerd zodat geen PB-default wordt toegepast.`
  };
}

const ARTICLE_38_RULE_IDS = [
  'CAO-PB-2024-R0770', 'CAO-PB-2024-R0771', 'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773'
];

function r2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return isoDate(startA) <= isoDate(endB) && isoDate(startB) <= isoDate(endA);
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

function resolveContractCaoForDate({ explicitCaoKey, contracts = [], referenceDate }) {
  const date = isoDate(referenceDate);
  const relevantContracts = (contracts || []).filter(contract => contractCoversDate(contract, date));
  const contractCaoKeys = uniqueNonEmpty(relevantContracts.map(contract => contract.cao_key));
  const resolution = {
    reference_date: date,
    selected_contract_ids: relevantContracts.map(contract => contract.id).filter(Boolean),
    selected_contract_cao_keys: contractCaoKeys,
    cao_key: contractCaoKeys.length === 1 ? contractCaoKeys[0] : null,
    selected_contract: relevantContracts.length === 1 ? relevantContracts[0] : null,
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
  if (!explicitCaoKey && contractCaoKeys.length === 0 && relevantContracts.length > 0) {
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
      blocking_reason: 'Eindejaarsuitkering vereist een expliciete cao_key of een actief arbeidscontract met cao_key. Medewerkerstamdata of PB-default mag niet als bron worden gebruikt.'
    };
  }

  return resolution;
}

function flattenPayPeriods(payPeriods) {
  if (!payPeriods) return [];
  const rows = Array.isArray(payPeriods)
    ? payPeriods
    : Object.entries(payPeriods).flatMap(([year, periods]) =>
        Array.isArray(periods) ? periods.map(p => ({ ...p, year: Number(p.year ?? year) })) : []
      );

  return rows
    .map(p => ({
      year: Number(p.year ?? p.pay_period_year ?? String(p.start_date || '').slice(0, 4)),
      period_number: Number(p.period_number ?? p.pay_period_number),
      start_date: isoDate(p.start_date ?? p.pay_period_start),
      end_date: isoDate(p.end_date ?? p.pay_period_end),
      is_extra_period: p.is_extra_period === true
    }))
    .filter(p => Number.isFinite(p.year) && Number.isFinite(p.period_number) && p.start_date && p.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

function findPeriod(periods, year, periodNumber) {
  return periods.find(p => Number(p.year) === Number(year) && Number(p.period_number) === Number(periodNumber)) || null;
}

function buildLookbackPeriods(periods, payoutYear, payoutPeriodNumber, lookbackPeriods, basisPeriodEndNumber) {
  const basisEnd = findPeriod(periods, payoutYear, basisPeriodEndNumber);
  const payoutPeriod = findPeriod(periods, payoutYear, payoutPeriodNumber);
  if (!basisEnd || !payoutPeriod) {
    return { payout_period: payoutPeriod, basis_end_period: basisEnd, lookback_periods: [], missing_period_table: true };
  }
  const idx = periods.findIndex(p =>
    p.year === basisEnd.year &&
    p.period_number === basisEnd.period_number &&
    p.start_date === basisEnd.start_date
  );
  if (idx < 0) return { payout_period: payoutPeriod, basis_end_period: basisEnd, lookback_periods: [], missing_period_table: true };
  return {
    payout_period: payoutPeriod,
    basis_end_period: basisEnd,
    lookback_periods: periods.slice(Math.max(0, idx - lookbackPeriods + 1), idx + 1),
    missing_period_table: false
  };
}

function isInServiceDuringPeriod(personnel, contracts, period) {
  if (!period) return { in_service: false, evidence: 'missing_payout_period', manual_review_required: true };

  const relevantContracts = (contracts || []).filter(c =>
    rangesOverlap(c.contract_start_date, c.contract_end_date || '9999-12-31', period.start_date, period.end_date)
  );
  if (relevantContracts.length > 0) {
    return { in_service: true, evidence: 'personnel_contract', manual_review_required: false };
  }

  const start = isoDate(personnel.contract_start_date || personnel.employment_start_date || personnel.industry_start_date);
  const end = isoDate(personnel.contract_end_date || personnel.employment_end_date);
  if (start) {
    return {
      in_service: rangesOverlap(start, end || '9999-12-31', period.start_date, period.end_date),
      evidence: 'personnel_dates',
      manual_review_required: false
    };
  }

  return {
    in_service: personnel.status === 'active',
    evidence: 'personnel_status_only',
    manual_review_required: true
  };
}

function wasInServiceDuringLookback(personnel, contracts, period) {
  const result = isInServiceDuringPeriod(personnel, contracts, period);
  return result.in_service || result.manual_review_required;
}

function extractYearEndBonusBasisFromRun(run, vacationAllowancePercent) {
  const output = run.calculation_output || {};
  const payslip = output.payslip || {};
  const stored = payslip.year_end_bonus_basis || output.year_end_bonus_basis || null;
  if (stored && numberOrNull(stored.eligible_amount_including_vacation_allowance) !== null) {
    return {
      run_id: run.id || null,
      pay_period_year: run.pay_period_year,
      pay_period_number: run.pay_period_number,
      basis_source: 'stored_year_end_bonus_basis',
      eligible_base_wage: r2(stored.eligible_base_wage),
      vacation_allowance_on_eligible_base_wage: r2(stored.vacation_allowance_on_eligible_base_wage),
      eligible_amount_including_vacation_allowance: r2(stored.eligible_amount_including_vacation_allowance),
      excluded_overtime_amount: r2(stored.excluded_overtime_amount),
      source_rule_ids: stored.source_rule_ids || ARTICLE_38_RULE_IDS,
      fallback_used: false
    };
  }

  const baseSalary = numberOrNull(payslip.base_salary) ?? 0;
  const minimumServiceAmount = numberOrNull(payslip.minimum_service_compensation?.amount) ?? 0;
  const overtimeAmount = numberOrNull(payslip.overtime_50?.amount) ?? 0;
  const eligibleBaseWage = baseSalary + minimumServiceAmount;
  const vacationAllowance = eligibleBaseWage * (vacationAllowancePercent / 100);
  return {
    run_id: run.id || null,
    pay_period_year: run.pay_period_year,
    pay_period_number: run.pay_period_number,
    basis_source: 'fallback_base_salary_plus_minimum_service',
    eligible_base_wage: r2(eligibleBaseWage),
    vacation_allowance_on_eligible_base_wage: r2(vacationAllowance),
    eligible_amount_including_vacation_allowance: r2(eligibleBaseWage + vacationAllowance),
    excluded_overtime_amount: r2(overtimeAmount),
    source_rule_ids: ARTICLE_38_RULE_IDS,
    fallback_used: true
  };
}

function calculateYearEndBonus({ personnel, contracts, caoConfig, payrollRuns, payoutYear, payoutPeriodNumber = 12, basisPeriodEndNumber = 11, lookbackPeriods = 13 }) {
  const warnings = [];
  const manualReviewItems = [];
  const periods = flattenPayPeriods(caoConfig?.pay_periods);
  const periodWindow = buildLookbackPeriods(periods, payoutYear, payoutPeriodNumber, lookbackPeriods, basisPeriodEndNumber);
  const payoutPeriod = periodWindow.payout_period;
  const vacationAllowancePercent = Number(caoConfig?.vacation_allowance || 8);
  const bonusPercent = Number(caoConfig?.year_end_bonus || 2.01);

  if (!payoutPeriod) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0771',
      domain: 'year_end_bonus_payout_period',
      message: `Loonperiode ${payoutPeriodNumber} ${payoutYear} ontbreekt in CAOConfiguration.pay_periods.`,
      field: 'pay_periods'
    });
  }

  const service = isInServiceDuringPeriod(personnel, contracts, payoutPeriod);
  if (service.manual_review_required) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0770',
      domain: 'year_end_bonus_employment',
      message: 'Niet definitief bewezen of werknemer in loonperiode 12 in dienst is.',
      field: 'contract_start_date/contract_end_date'
    });
  }

  if (!service.in_service && !service.manual_review_required) {
    return {
      success: true,
      applies: false,
      payout_due: false,
      payout_amount: 0,
      reason: 'Werknemer is niet in dienst in loonperiode 12.',
      payout_year: payoutYear,
      payout_period_number: payoutPeriodNumber,
      manual_review_required: false,
      payroll_final_allowed: true,
      source_rule_ids: ARTICLE_38_RULE_IDS
    };
  }

  if (periodWindow.missing_period_table || periodWindow.lookback_periods.length === 0) {
    manualReviewItems.push({
      rule_id: 'CAO-PB-2024-R0772',
      domain: 'year_end_bonus_lookback',
      message: 'De 13-loonperiodenbasis kan niet worden opgebouwd omdat de loonperiodetabel ontbreekt of onvolledig is.',
      field: 'pay_periods'
    });
  }

  const runsByPeriod = new Map();
  for (const run of payrollRuns || []) {
    if (run.payroll_run_status === 'voided' || run.payroll_run_status === 'draft') continue;
    const key = `${Number(run.pay_period_year)}:${Number(run.pay_period_number)}`;
    const existing = runsByPeriod.get(key);
    if (!existing || String(run.created_at || '').localeCompare(String(existing.created_at || '')) > 0) {
      runsByPeriod.set(key, run);
    }
  }

  const periodRows = [];
  for (const period of periodWindow.lookback_periods) {
    const inService = wasInServiceDuringLookback(personnel, contracts, period);
    const run = runsByPeriod.get(`${period.year}:${period.period_number}`) || null;
    if (!run) {
      periodRows.push({
        ...period,
        in_service_or_unknown: inService,
        run_found: false,
        eligible_amount_including_vacation_allowance: 0
      });
      if (inService) {
        manualReviewItems.push({
          rule_id: 'CAO-PB-2024-R0772',
          domain: 'year_end_bonus_history',
          message: `Payrollrun ontbreekt voor loonperiode ${period.period_number} ${period.year}.`,
          field: 'PayrollCalculationRun'
        });
      }
      continue;
    }
    const basis = extractYearEndBonusBasisFromRun(run, vacationAllowancePercent);
    periodRows.push({
      ...period,
      in_service_or_unknown: inService,
      run_found: true,
      payroll_run_id: run.id || null,
      payroll_run_status: run.payroll_run_status || null,
      ...basis
    });
    if (basis.fallback_used) {
      warnings.push(`Fallback eindejaarsgrondslag gebruikt voor loonperiode ${period.period_number} ${period.year}; nieuwe runs slaan year_end_bonus_basis expliciet op.`);
    }
  }

  const basisTotal = periodRows.reduce((sum, row) => sum + Number(row.eligible_amount_including_vacation_allowance || 0), 0);
  const payoutAmount = basisTotal * (bonusPercent / 100);
  const manualReviewRequired = manualReviewItems.length > 0;

  return {
    success: true,
    applies: true,
    payout_due: Number(payoutPeriodNumber) === 12,
    payout_year: Number(payoutYear),
    payout_period_number: Number(payoutPeriodNumber),
    basis_period_end_number: Number(basisPeriodEndNumber),
    lookback_periods: Number(lookbackPeriods),
    payout_period: payoutPeriod,
    basis_end_period: periodWindow.basis_end_period,
    year_end_bonus_percentage: bonusPercent,
    vacation_allowance_percentage: vacationAllowancePercent,
    eligible_basis_total: r2(basisTotal),
    payout_amount: r2(payoutAmount),
    period_basis_rows: periodRows,
    warnings,
    manual_review_required: manualReviewRequired,
    manual_review_items: manualReviewItems,
    payroll_final_allowed: !manualReviewRequired,
    source_rule_ids: ARTICLE_38_RULE_IDS
  };
}

function activeCaoConfigurationCandidates(configs, referenceDate) {
  const ref = isoDate(referenceDate || new Date().toISOString());
  return (configs || [])
    .filter(config => config.status === 'active' || config.is_active === true)
    .filter(config => !config.valid_from || config.valid_from <= ref)
    .filter(config => !config.valid_until || config.valid_until >= ref)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));
}

async function resolveActiveCaoConfig(base44, referenceDate, caoKey = null) {
  const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
    status: 'active',
    cao_key: caoKey
  });
  const candidates = activeCaoConfigurationCandidates(allCaos, referenceDate);
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
      message: `Meerdere actieve CAO-configuraties gevonden voor ${caoKey} op ${isoDate(referenceDate)}; eindejaarsuitkering is geblokkeerd om historische CAO-keuze niet te gokken.`
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

function caoConfigCoversReferenceDate(caoConfig, referenceDate) {
  const ref = isoDate(referenceDate || new Date().toISOString());
  if (!caoConfig || !ref) return false;
  if (caoConfig.valid_from && caoConfig.valid_from > ref) return false;
  if (caoConfig.valid_until && caoConfig.valid_until < ref) return false;
  return true;
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
          message: 'CAOConfiguration mist rule_registry_fingerprint; definitieve eindejaarsuitkering is niet audit-proof.'
        },
        ...blockingFindings
      ],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const personnelId = body.personnel_id;
    if (!personnelId) return Response.json({ error: 'personnel_id is verplicht' }, { status: 400 });

    const payoutYear = Number(body.payout_year || body.pay_period_year || new Date().getFullYear());
    const payoutPeriodNumber = Number(body.payout_period_number || body.pay_period_number || 12);
    const basisPeriodEndNumber = Number(body.basis_period_end_number || 11);
    const lookbackPeriods = Number(body.lookback_periods || 13);

    const [personnel, contracts, payrollRuns] = await Promise.all([
      base44.entities.Personnel.get(personnelId),
      base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id: personnelId }).catch(() => []),
      base44.asServiceRole.entities.PayrollCalculationRun.filter({ personnel_id: personnelId }).catch(() => [])
    ]);
    if (!personnel) return Response.json({ error: `Medewerker niet gevonden: ${personnelId}` }, { status: 404 });

    const referenceDate = body.reference_date || findPeriod(flattenPayPeriods(body.pay_periods), payoutYear, payoutPeriodNumber)?.end_date || `${payoutYear}-12-01`;
    const explicitCaoKey = body.cao_key || body.service_context?.cao_key || null;
    const contractCaoResolution = resolveContractCaoForDate({
      explicitCaoKey,
      contracts,
      referenceDate
    });
    if (String(contractCaoResolution.status || '').startsWith('blocked_')) {
      return Response.json({
        error: contractCaoResolution.blocking_reason,
        personnel_id: personnelId,
        reference_date: referenceDate,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: contractCaoResolution.status,
        source_rule_ids: ARTICLE_38_RULE_IDS
      }, { status: 400 });
    }

    const targetCaoKey = explicitCaoKey ||
      contractCaoResolution.cao_key ||
      null;
    const yearEndBonusRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'calculateCaoYearEndBonus');
    if (!yearEndBonusRuntimeSupport.supported) {
      return Response.json({
        error: yearEndBonusRuntimeSupport.message,
        personnel_id: personnelId,
        cao_key: targetCaoKey,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: yearEndBonusRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: yearEndBonusRuntimeSupport.status,
        source_rule_ids: ARTICLE_38_RULE_IDS
      }, { status: 422 });
    }

    let caoConfig = body.cao_config || null;
    let caoConfigResolution = null;
    if (!caoConfig) {
      caoConfigResolution = await resolveActiveCaoConfig(base44, referenceDate, targetCaoKey);
      caoConfig = caoConfigResolution.config;
    }
    if (!caoConfig) {
      return Response.json({
        error: caoConfigResolution?.message || `Geen actieve CAO-configuratie gevonden voor ${targetCaoKey} op ${referenceDate}.`,
        personnel_id: personnelId,
        cao_key: targetCaoKey,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: yearEndBonusRuntimeSupport,
        active_cao_configuration_candidates: caoConfigResolution?.candidates || [],
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: caoConfigResolution?.status || 'blocked_missing_active_cao_config'
      }, { status: 400 });
    }
    if ((caoConfig.cao_key || targetCaoKey) !== targetCaoKey) {
      return Response.json({
        error: `Meegegeven CAO-configuratie (${caoConfig.cao_key || 'cao_key onbekend'}) hoort niet bij gevraagde cao_key ${targetCaoKey}.`,
        personnel_id: personnelId,
        cao_configuration_id: caoConfig.id || null,
        cao_key: targetCaoKey,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: yearEndBonusRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_config_key_mismatch'
      }, { status: 400 });
    }
    if (!caoConfigCoversReferenceDate(caoConfig, referenceDate)) {
      return Response.json({
        error: `Meegegeven CAO-configuratie (${caoConfig.id || caoConfig.version_label || 'id onbekend'}) is niet geldig op referentiedatum ${referenceDate}.`,
        personnel_id: personnelId,
        cao_configuration_id: caoConfig.id || null,
        cao_key: targetCaoKey,
        reference_date: referenceDate,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: yearEndBonusRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_config_not_valid_on_reference_date'
      }, { status: 400 });
    }

    const caoPayrollReadiness = getCaoPayrollReadiness(caoConfig);
    const caoRuleRegistrySnapshot = getCaoRuleRegistrySnapshot(caoConfig);
    if (!caoPayrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${caoPayrollReadiness.status}). Definitieve eindejaarsuitkering is geblokkeerd totdat de CAO coverage-gate slaagt.`,
        personnel_id: personnelId,
        cao_configuration_id: caoConfig.id || null,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        reference_date: referenceDate,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        cao_runtime_support: yearEndBonusRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    if (personnel.employee_type !== 'loondienst') {
      return Response.json({
        success: true,
        applies: false,
        reason: 'Artikel 38 CAO PB is alleen automatisch ingericht voor werknemers in loondienst.',
        personnel_id: personnelId,
        cao_configuration_id: caoConfig.id || null,
        cao_key: caoConfig.cao_key || targetCaoKey,
        cao_version_label: caoConfig.version_label || caoConfig.name || null,
        cao_valid_from: caoConfig.valid_from || null,
        cao_valid_until: caoConfig.valid_until || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: yearEndBonusRuntimeSupport,
        cao_payroll_readiness: caoPayrollReadiness,
        cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
        payroll_final_allowed: true,
        manual_review_required: false,
        source_rule_ids: ARTICLE_38_RULE_IDS
      });
    }

    const result = calculateYearEndBonus({
      personnel,
      contracts,
      caoConfig,
      payrollRuns,
      payoutYear,
      payoutPeriodNumber,
      basisPeriodEndNumber,
      lookbackPeriods
    });

    return Response.json({
      personnel_id: personnelId,
      personnel_name: personnel.name || null,
      cao_configuration_id: caoConfig.id || null,
      cao_key: caoConfig.cao_key || targetCaoKey,
      contract_cao_resolution: {
        ...contractCaoResolution,
        selected_contract: undefined
      },
      cao_runtime_support: yearEndBonusRuntimeSupport,
      cao_payroll_readiness: caoPayrollReadiness,
      cao_rule_registry_snapshot: caoRuleRegistrySnapshot,
      cao_version_label: caoConfig.version_label || caoConfig.name || null,
      cao_valid_from: caoConfig.valid_from || null,
      cao_valid_until: caoConfig.valid_until || null,
      ...result,
      manual_review_required: result.manual_review_required === true || contractCaoResolution.manual_review_required === true,
      payroll_final_allowed: result.payroll_final_allowed !== false && contractCaoResolution.manual_review_required !== true
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

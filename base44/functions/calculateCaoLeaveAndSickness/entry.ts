import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS = [CAO_PB_KEY];

function getCaoRuntimeSupport(caoKey, functionName) {
  const key = caoKey || CAO_PB_KEY;
  const supported = SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS.includes(key);
  return {
    supported,
    status: supported ? 'supported' : 'blocked_unsupported_cao_runtime',
    cao_key: key,
    function_name: functionName,
    supported_cao_keys: SUPPORTED_LEAVE_SICKNESS_RUNTIME_CAO_KEYS,
    message: supported
      ? `Runtime ${functionName} ondersteunt CAO ${key}.`
      : `Runtime ${functionName} ondersteunt CAO ${key} nog niet. Verlof-/ziekteregels zijn geblokkeerd zodat geen PB-regels op een andere CAO worden toegepast.`
  };
}

async function lazySyncCao(base44, forceCaoSync = false, caoKey = CAO_PB_KEY) {
  if (caoKey !== CAO_PB_KEY) {
    return {
      changed: false,
      reason: 'skipped_unsupported_cao_sync',
      cao_key: caoKey,
      note: 'Lazy Cloudflare sync is alleen ingericht voor CAO Particuliere Beveiliging.'
    };
  }
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function asIsoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function dateFromIso(value) {
  const iso = asIsoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function contractCoversDate(contract, referenceDate) {
  const date = asIsoDate(referenceDate);
  if (!contract || !date) return false;
  const start = asIsoDate(contract.contract_start_date || contract.start_date || contract.employment_start_date);
  const end = asIsoDate(contract.contract_end_date || contract.end_date || contract.employment_end_date) || '9999-12-31';
  if (!start) return false;
  return start <= date && date <= end;
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}

function leaveSicknessReferenceDate(body) {
  return asIsoDate(
    body.reference_date ||
    body.service_date ||
    body.shift_date ||
    body.date ||
    body.period_end_date ||
    body.sickness_start_date ||
    body.vacation_start_date ||
    body.leave_start_date ||
    body.service_context?.service_date ||
    body.service_context?.date ||
    new Date().toISOString()
  );
}

function resolveContractCaoForDate({ explicitCaoKey, contract, contracts = [], referenceDate }) {
  const date = asIsoDate(referenceDate);
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
      status: 'manual_review_missing_contract_cao_key',
      manual_review_required: true,
      warning: `Contract actief op ${date}, maar cao_key ontbreekt op het contract.`
    };
  }

  return resolution;
}

function daysBetweenInclusive(startDate, endDate) {
  const start = dateFromIso(startDate);
  const end = dateFromIso(endDate);
  if (!start || !end || end < start) return null;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function isCallWorker(input) {
  const callType = input.call_agreement_type || input.call_contract_type || null;
  return input.is_call_worker === true ||
    input.contract_type === '0_uren' ||
    input.contract_type === 'oproep' ||
    input.contract_form === 'oproep' ||
    ['zero_hours', 'min_max', 'pre_agreement', 'annualized_bandwidth', 'no_work_no_pay_first_6_months'].includes(callType);
}

function extraVacationDaysForServiceYears(years) {
  const serviceYears = numberOrNull(years);
  if (serviceYears === null || serviceYears < 5) return 0;
  if (serviceYears >= 40) return 8;
  return Math.floor(serviceYears / 5);
}

function getVacationAccrualProfile(input) {
  if (input?.cao_scope_profile === 'cash_value_logistics' || input?.works_cash_value_logistics === true) {
    return {
      profile: 'cash_value_logistics',
      fulltimeAnnualHours: 180,
      fulltimeAnnualDays: 25,
      fulltimePerPeriodHours: 13.85,
      fulltimePeriodHours: 144,
      fulltimeWeeklyHours: 36,
      vacationDayHours: 7.2,
      ruleIds: ['CAO-PB-2024-R1601', 'CAO-PB-2024-R1602'],
      extraVacationDaysPolicy: 'manual_review_article_100_deviates_from_article_59',
      extraVacationDaysManualReviewRequired: true
    };
  }
  return {
    profile: 'standard_article_59',
    fulltimeAnnualHours: 172.8, // 24 dagen * 7,2 uur
    fulltimeAnnualDays: 24,
    fulltimePerPeriodHours: 13.3,
    fulltimePeriodHours: 144,
    fulltimeWeeklyHours: 36,
    vacationDayHours: 7.2,
    ruleIds: ['CAO-PB-2024-R0999'],
    extraVacationDaysPolicy: 'article_59_lid_4',
    extraVacationDaysManualReviewRequired: false
  };
}

function calculateVacationAccrual(input) {
  const profile = getVacationAccrualProfile(input);
  const fulltimeAnnualHours = profile.fulltimeAnnualHours;
  const fulltimeAnnualDays = profile.fulltimeAnnualDays;
  const fulltimePerPeriodHours = profile.fulltimePerPeriodHours;
  const fulltimePeriodHours = profile.fulltimePeriodHours;
  const fulltimeWeeklyHours = profile.fulltimeWeeklyHours;
  const ruleIds = [...profile.ruleIds];
  const warnings = [];
  const missingEvidence = [];
  let manualReviewRequired = false;

  if (isCallWorker(input)) {
    const workedHours = numberOrNull(input.worked_hours) ??
      numberOrNull(input.period_hours) ??
      numberOrNull(input.paid_hours_per_pay_period) ??
      0;
    const payoutBaseHours = Math.min(workedHours, fulltimePeriodHours);
    const hourlyRate = numberOrNull(input.base_hourly_rate) ?? numberOrNull(input.hourly_rate);
    const explicitBaseAmount = numberOrNull(input.vacation_payout_base_amount) ??
      numberOrNull(input.period_gross_wage) ??
      numberOrNull(input.gross_wage_for_vacation);
    const payoutBaseAmount = explicitBaseAmount !== null
      ? explicitBaseAmount
      : hourlyRate !== null
      ? payoutBaseHours * hourlyRate
      : null;

    if (payoutBaseAmount === null) {
      manualReviewRequired = true;
      missingEvidence.push({
        field: 'vacation_payout_base_amount/base_hourly_rate',
        rule_id: 'CAO-PB-2024-R1016',
        message: 'Voor oproepkrachten moet de 9,24% vakantietoeslag over het loon van maximaal 144 uur per loonperiode worden berekend.'
      });
    }

    return {
      rule_ids: ['CAO-PB-2024-R1014', 'CAO-PB-2024-R1015', 'CAO-PB-2024-R1016', 'CAO-PB-2024-R1017'],
      vacation_accrual_type: 'call_worker_paid_in_money',
      vacation_days_takeable: false,
      vacation_payout_percentage: 9.24,
      worked_hours: workedHours,
      payout_base_hours: payoutBaseHours,
      capped_at_144_hours_per_pay_period: workedHours > fulltimePeriodHours,
      payout_base_amount: payoutBaseAmount !== null ? round2(payoutBaseAmount) : null,
      vacation_payout_amount: payoutBaseAmount !== null ? round2(payoutBaseAmount * 0.0924) : null,
      vacation_hours_accrued_per_period: 0,
      vacation_hours_annual: 0,
      manual_review_required: manualReviewRequired,
      payroll_final_allowed: !manualReviewRequired,
      missing_evidence: missingEvidence,
      warnings,
      note: 'Oproepkracht: geen opneembare vakantiedagen; 9,24% uitbetaling per loonperiode over loon van maximaal 144 uur.'
    };
  }

  const paidHoursPerPeriod = numberOrNull(input.paid_hours_per_pay_period) ??
    numberOrNull(input.period_hours) ??
    numberOrNull(input.contract_hours_per_pay_period) ??
    (numberOrNull(input.weekly_hours) !== null ? numberOrNull(input.weekly_hours) * 4 : fulltimePeriodHours);
  const cappedPaidHours = Math.min(Math.max(paidHoursPerPeriod, 0), fulltimePeriodHours);
  const parttimeRatio = cappedPaidHours / fulltimePeriodHours;
  const serviceYears = numberOrNull(input.continuous_service_years) ??
    numberOrNull(input.security_industry_service_years) ??
    null;
  const extraVacationDays = profile.extraVacationDaysManualReviewRequired ? 0 : extraVacationDaysForServiceYears(serviceYears);
  const extraVacationHoursAnnual = extraVacationDays * profile.vacationDayHours * parttimeRatio;

  if (serviceYears === null) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'continuous_service_years/security_industry_service_years',
      rule_id: 'CAO-PB-2024-R1019',
      message: 'Dienstjaren ontbreken; extra vakantiedagen vanaf 5 dienstjaren kunnen niet definitief worden vastgesteld.'
    });
  } else {
    ruleIds.push('CAO-PB-2024-R1019', 'CAO-PB-2024-R1022');
  }

  if (profile.extraVacationDaysManualReviewRequired) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'cao_scope_profile',
      rule_id: 'CAO-PB-2024-R1602',
      message: 'Geld- en waardelogistiek gebruikt de afwijkende vakantie-opbouw van art. 100 (180 uur/25 dagen, 13,85 uur per loonperiode); eventuele extra vakantiedagen uit art. 59 blijven handmatige review.'
    });
  }

  if (paidHoursPerPeriod > fulltimePeriodHours) {
    warnings.push('Vakantieopbouw is afgetopt op 144 betaalde uren per loonperiode.');
  }

  return {
    rule_ids: ruleIds,
    vacation_accrual_type: profile.profile === 'cash_value_logistics'
      ? 'cash_value_logistics_time_off_accrual'
      : parttimeRatio < 1 ? 'parttime_time_off_accrual' : 'fulltime_time_off_accrual',
    vacation_entitlement_profile: profile.profile,
    fulltime_reference_hours_per_pay_period: fulltimePeriodHours,
    fulltime_reference_weekly_hours: fulltimeWeeklyHours,
    paid_hours_per_pay_period: paidHoursPerPeriod,
    capped_paid_hours_per_pay_period: cappedPaidHours,
    parttime_ratio: round2(parttimeRatio),
    vacation_hours_accrued_per_period: round2(fulltimePerPeriodHours * parttimeRatio),
    statutory_and_above_statutory_vacation_hours_annual: round2(fulltimeAnnualHours * parttimeRatio),
    statutory_and_above_statutory_vacation_days_annual_fulltime_basis: fulltimeAnnualDays,
    extra_vacation_days_annual_fulltime_basis: extraVacationDays,
    extra_vacation_days_policy: profile.extraVacationDaysPolicy,
    extra_vacation_days_manual_review_required: profile.extraVacationDaysManualReviewRequired,
    extra_vacation_hours_annual: round2(extraVacationHoursAnnual),
    vacation_hours_annual_total: round2((fulltimeAnnualHours * parttimeRatio) + extraVacationHoursAnnual),
    manual_review_required: manualReviewRequired,
    payroll_final_allowed: !manualReviewRequired,
    missing_evidence: missingEvidence,
    warnings,
    note: parttimeRatio < 1
      ? `Parttime vakantieopbouw naar rato over ${cappedPaidHours} betaalde uren per loonperiode.`
      : 'Fulltime vakantieopbouw op basis van 144 uur per loonperiode / 36 uur per week.'
  };
}

function waitingDayExceptionApplies(input) {
  return booleanOrNull(input.company_accident_or_occupational_disease) === true ||
    booleanOrNull(input.pregnancy_or_childbirth_related) === true ||
    booleanOrNull(input.organ_donation_related) === true ||
    booleanOrNull(input.disabled_employee_status) === true;
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

  const warnings = [];
  const missingEvidence = [];
  const ruleIds = ['CAO-PB-2024-R1165', 'CAO-PB-2024-R1166'];
  let manualReviewRequired = false;
  const contractEndDate = asIsoDate(input.contract_end_date || input.employment_end_date);
  const requestedEndDate = asIsoDate(sickness_end_date) || new Date().toISOString().slice(0, 10);
  const effectiveEndDate = contractEndDate && contractEndDate < requestedEndDate ? contractEndDate : requestedEndDate;
  const calendarSicknessDays = daysBetweenInclusive(sickness_start_date, effectiveEndDate);
  if (calendarSicknessDays === null) return { error: 'sickness_start_date/sickness_end_date zijn ongeldig' };
  if (contractEndDate && contractEndDate < requestedEndDate) {
    warnings.push('Ziekteloon is afgekapt op de einddatum van de arbeidsovereenkomst.');
    ruleIds.push('CAO-PB-2024-R1155', 'CAO-PB-2024-R1163');
  }

  const explicitPayableDays = numberOrNull(input.sickness_payable_days) ??
    numberOrNull(input.scheduled_sickness_days) ??
    numberOrNull(input.social_insurance_days);
  const sicknessDays = explicitPayableDays ?? calendarSicknessDays;
  if (explicitPayableDays === null) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'sickness_payable_days/scheduled_sickness_days/social_insurance_days',
      rule_id: 'CAO-PB-2024-R1167',
      message: 'Artikel 67 rekent met ingeroosterde diensten/tijdvakken/sociale-verzekeringsdagen. Zonder die evidence is een kalenderdagberekening conceptmatig.'
    });
  }

  const seniority = numberOrNull(industry_seniority_periods) ?? 0;
  const dailySalary = numberOrNull(input.daily_sickness_salary) ??
    ((numberOrNull(base_gross_salary) + (numberOrNull(avg_ort_per_period) ?? 0)) / (numberOrNull(input.payable_days_per_pay_period) ?? 20));

  const callAgreementType = input.call_agreement_type || input.call_contract_type || null;
  if (isCallWorker(input)) {
    ruleIds.push('CAO-PB-2024-R1172');
    const withinCallPeriod = booleanOrNull(input.sickness_started_during_call_period);
    if (callAgreementType === 'pre_agreement' || callAgreementType === 'zero_hours') {
      ruleIds.push(...(callAgreementType === 'pre_agreement'
        ? ['CAO-PB-2024-R1173', 'CAO-PB-2024-R1174', 'CAO-PB-2024-R1175', 'CAO-PB-2024-R1176']
        : ['CAO-PB-2024-R1177', 'CAO-PB-2024-R1178', 'CAO-PB-2024-R1179', 'CAO-PB-2024-R1180', 'CAO-PB-2024-R1181']));
      if (withinCallPeriod !== true) {
        const zeroHoursAverageClaimAssessed = callAgreementType === 'zero_hours'
          ? booleanOrNull(input.zero_hours_52_week_average_claim_assessed) === true
          : true;
        const outsideCallManualReview = withinCallPeriod === null || !zeroHoursAverageClaimAssessed;
        const outsideCallMissingEvidence = [];
        if (withinCallPeriod === null) {
          outsideCallMissingEvidence.push({
            field: 'sickness_started_during_call_period',
            rule_id: callAgreementType === 'pre_agreement' ? 'CAO-PB-2024-R1174' : 'CAO-PB-2024-R1178',
            message: 'Bij voorovereenkomst/nul-uren moet bekend zijn of ziekte tijdens een oproepperiode is begonnen.'
          });
        }
        if (!zeroHoursAverageClaimAssessed) {
          outsideCallMissingEvidence.push({
            field: 'zero_hours_52_week_average_claim_assessed',
            rule_id: 'CAO-PB-2024-R1181',
            message: 'Bij nul-urencontracten kan buiten de oproepperiode in sommige gevallen een 52-weken aanspraak bestaan; leg vast dat dit is beoordeeld.'
          });
        }
        return {
          rule_ids: ruleIds,
          sickness_days_total: sicknessDays,
          call_agreement_type: callAgreementType,
          sickness_started_during_call_period: withinCallPeriod,
          payment_percentage: 0,
          total_sickness_payment: 0,
          manual_review_required: outsideCallManualReview,
          payroll_final_allowed: !outsideCallManualReview,
          missing_evidence: outsideCallMissingEvidence,
          warnings,
          note: 'Geen ziekengeld buiten of na afloop van de oproepperiode, tenzij 52-weken aanspraak voor nul-uren afzonderlijk is vastgesteld.'
        };
      }
      const callPeriodAmount = numberOrNull(input.agreed_call_period_gross_wage) ?? (dailySalary * sicknessDays);
      return {
        rule_ids: ruleIds,
        sickness_days_total: sicknessDays,
        call_agreement_type: callAgreementType,
        sickness_started_during_call_period: true,
        payment_percentage: 70,
        total_sickness_payment: round2(callPeriodAmount * 0.7),
        minimum_wage_floor_required: true,
        manual_review_required: manualReviewRequired,
        payroll_final_allowed: !manualReviewRequired,
        missing_evidence: missingEvidence,
        warnings,
        note: 'Oproepkracht ziek tijdens oproepperiode: 70% over afgesproken oproepperiode, minimaal minimumloon.'
      };
    }

    if (callAgreementType === 'min_max') {
      ruleIds.push('CAO-PB-2024-R1182', 'CAO-PB-2024-R1183', 'CAO-PB-2024-R1184');
      const guaranteeHours = numberOrNull(input.guarantee_hours_per_pay_period) ??
        numberOrNull(input.min_hours_per_pay_period) ??
        numberOrNull(input.min_hours_per_week);
      if (guaranteeHours === null) {
        manualReviewRequired = true;
        missingEvidence.push({
          field: 'guarantee_hours_per_pay_period/min_hours_per_pay_period',
          rule_id: 'CAO-PB-2024-R1183',
          message: 'Bij min-max ziekte moet het aantal garantie-uren bekend zijn.'
        });
      }
      const guaranteeBaseAmount = numberOrNull(input.guarantee_gross_wage) ??
        (guaranteeHours !== null && numberOrNull(input.base_hourly_rate) !== null ? guaranteeHours * numberOrNull(input.base_hourly_rate) : dailySalary * sicknessDays);
      if (numberOrNull(input.average_hours_52_weeks) !== null && guaranteeHours !== null && numberOrNull(input.average_hours_52_weeks) > guaranteeHours) {
        manualReviewRequired = true;
        warnings.push('Gemiddelde arbeidsduur over 52 weken lijkt hoger dan garantie-uren; artikel 67 kan hogere loondoorbetaling geven. Handmatige review vereist.');
      }
      return {
        rule_ids: ruleIds,
        sickness_days_total: sicknessDays,
        call_agreement_type: callAgreementType,
        guarantee_hours_basis: guaranteeHours,
        payment_percentage: 70,
        total_sickness_payment: round2(guaranteeBaseAmount * 0.7),
        minimum_wage_floor_required: true,
        manual_review_required: manualReviewRequired,
        payroll_final_allowed: !manualReviewRequired,
        missing_evidence: missingEvidence,
        warnings,
        note: 'Min-maxcontract: 70% over garantie-uren, met mogelijke 52-weken aanspraak bij gemiddeld meer werken.'
      };
    }

    manualReviewRequired = true;
    missingEvidence.push({
      field: 'call_agreement_type',
      rule_id: 'CAO-PB-2024-R1172',
      message: 'Type oproepcontract ontbreekt of wordt niet volledig automatisch ondersteund voor ziekte.'
    });
  }

  if (seniority < 13) {
    ruleIds.push('CAO-PB-2024-R1148', 'CAO-PB-2024-R1149');
    const hasWaitingDay = !waitingDayExceptionApplies(input);
    if (!hasWaitingDay) ruleIds.push('CAO-PB-2024-R1150', 'CAO-PB-2024-R1151', 'CAO-PB-2024-R1152', 'CAO-PB-2024-R1153', 'CAO-PB-2024-R1154');
    const paidDays = hasWaitingDay ? Math.max(0, sicknessDays - 1) : sicknessDays;
    return {
      rule_ids: ruleIds,
      sickness_days_total: sicknessDays,
      has_waiting_day: hasWaitingDay,
      waiting_day_unpaid: hasWaitingDay,
      industry_seniority_periods: seniority,
      paid_days_70_percent: paidDays,
      payment_percentage: 70,
      payment_70_percent: round2(paidDays * dailySalary * 0.7),
      total_sickness_payment: round2(paidDays * dailySalary * 0.7),
      minimum_wage_floor_required: true,
      manual_review_required: manualReviewRequired,
      payroll_final_allowed: !manualReviewRequired,
      missing_evidence: missingEvidence,
      warnings,
      note: hasWaitingDay
        ? 'Minder dan 13 loonperioden brancheancienniteit: 70% ziekengeld en eerste ziektedag wachtdag.'
        : 'Minder dan 13 loonperioden brancheancienniteit: 70% ziekengeld, geen wachtdag wegens CAO-uitzondering.'
    };
  }

  ruleIds.push('CAO-PB-2024-R1157', 'CAO-PB-2024-R1158', 'CAO-PB-2024-R1159', 'CAO-PB-2024-R1160', 'CAO-PB-2024-R1161');
  const firstSixMonthDays = Math.min(sicknessDays, 182);
  const secondSixMonthDays = Math.min(Math.max(0, sicknessDays - 182), 183);
  const secondYearDays = Math.min(Math.max(0, sicknessDays - 365), 365);
  const reintegrationConfirmed = booleanOrNull(input.active_reintegration_confirmed);
  if (secondYearDays > 0 && reintegrationConfirmed !== true) {
    manualReviewRequired = true;
    missingEvidence.push({
      field: 'active_reintegration_confirmed',
      rule_id: 'CAO-PB-2024-R1161',
      message: '85% in het tweede ziektejaar geldt als actieve re-integratie binnen mogelijkheden is aangetoond.'
    });
  }
  const thirdFourthYearSupplementEligible = booleanOrNull(input.wga_35_80) === true &&
    booleanOrNull(input.medical_limitations_confirmed) === true &&
    booleanOrNull(input.active_reintegration_confirmed) === true;
  const thirdFourthYearDays = Math.min(Math.max(0, sicknessDays - 730), 730);
  if (thirdFourthYearDays > 0) {
    ruleIds.push('CAO-PB-2024-R1162');
    if (!thirdFourthYearSupplementEligible) {
      manualReviewRequired = true;
      missingEvidence.push({
        field: 'wga_35_80/medical_limitations_confirmed/active_reintegration_confirmed',
        rule_id: 'CAO-PB-2024-R1162',
        message: 'Aanvulling in ziektejaar 3/4 vereist 35-80% WGA en bewijs van actieve inzet/medische beperkingen.'
      });
    }
  }

  const paymentFirstSixMonths = firstSixMonthDays * dailySalary;
  const paymentSecondSixMonths = secondSixMonthDays * dailySalary * 0.9;
  const paymentSecondYear = reintegrationConfirmed === true ? secondYearDays * dailySalary * 0.85 : 0;
  const supplementThirdFourthYear = thirdFourthYearSupplementEligible
    ? (numberOrNull(input.wga_related_benefit_per_day) ?? dailySalary) * thirdFourthYearDays * 0.1
    : 0;

  return {
    rule_ids: ruleIds,
    sickness_days_total: sicknessDays,
    has_waiting_day: false,
    waiting_day_unpaid: false,
    industry_seniority_periods: seniority,
    days_first_six_months_100_percent: firstSixMonthDays,
    days_second_six_months_90_percent: secondSixMonthDays,
    days_second_year_85_percent: secondYearDays,
    days_third_fourth_year_supplement: thirdFourthYearDays,
    payment_first_six_months: round2(paymentFirstSixMonths),
    payment_second_six_months: round2(paymentSecondSixMonths),
    payment_second_year: round2(paymentSecondYear),
    supplement_third_fourth_year: round2(supplementThirdFourthYear),
    total_sickness_payment: round2(paymentFirstSixMonths + paymentSecondSixMonths + paymentSecondYear + supplementThirdFourthYear),
    ort_included: numberOrNull(avg_ort_per_period) !== null,
    manual_review_required: manualReviewRequired,
    payroll_final_allowed: !manualReviewRequired,
    missing_evidence: missingEvidence,
    warnings,
    note: 'Minimaal 13 loonperioden brancheancienniteit: 100% eerste 6 maanden, 90% tweede 6 maanden, 85% tweede ziektejaar bij actieve re-integratie.'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, force_cao_sync, personnel_id, contract_id } = body;

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
    const referenceDate = leaveSicknessReferenceDate(body);
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
        action: action || 'calculate_leave_sickness',
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
      personnel?.cao ||
      CAO_PB_KEY;

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

    const leaveSicknessRuntimeSupport = getCaoRuntimeSupport(targetCaoKey, 'calculateCaoLeaveAndSickness');
    if (!leaveSicknessRuntimeSupport.supported) {
      return Response.json({
        error: leaveSicknessRuntimeSupport.message,
        action: action || 'calculate_leave_sickness',
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...syncWarnings,
          'Verlof-/ziekteberekening geblokkeerd: CAO-runtime voor deze cao_key is nog niet lokaal geimplementeerd en geverifieerd.'
        ],
        personnel_id: personnel_id || null,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_key: targetCaoKey,
        cao_runtime_support: leaveSicknessRuntimeSupport,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: leaveSicknessRuntimeSupport.status
      }, { status: 422 });
    }

    // ── CAO-toepassingscheck ──
    let rawCaoScope = null;
    if (targetCaoKey === CAO_PB_KEY && personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', {
          personnel_id,
          cao_key: targetCaoKey,
          contract: contractCaoResolution.selected_contract || contract || null,
          work_context: body.service_context || null
        });
        rawCaoScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }

    // Normaliseer scope: null = fail-closed
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
    const caoScope = normalizeCaoScope(rawCaoScope);
    const isUnknownOrMixed = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    // Scope-context: verlof/ziekte (hoofdstuk 3 / R0999) niet generiek uitgesloten door art. 3 lid 2.
    const scopeWarnings = [];
    if (isUnknownOrMixed) {
      scopeWarnings.push({
        message: `CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): berekeningsresultaten zijn conceptmatig. Handmatige review vereist.`,
        cao_scope_profile: caoScope.cao_scope_profile,
        manual_review_required: true
      });
    }
    // ORT-verlofberekening alleen als toeslagen van toepassing zijn (fail-closed: false als scope unknown)
    const applyOrtVacation = caoScope.payroll_rule_profile?.apply_article_40_special_hours === true;
    const vacationInput = {
      ...body,
      cao_scope_profile: caoScope?.cao_scope_profile || body.cao_scope_profile || null
    };

    if (action === 'calculate_vacation_accrual') {
      const result = calculateVacationAccrual(vacationInput);
      const manualReviewRequired = isUnknownOrMixed || result.manual_review_required === true;
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: leaveSicknessRuntimeSupport,
        calculation_warnings: syncWarnings,
        scope_warnings: scopeWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        apply_ort_vacation: applyOrtVacation,
        ...result,
        manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
        payroll_final_allowed: !manualReviewRequired && contractCaoResolution.manual_review_required !== true && result.payroll_final_allowed !== false
      });
    }

    if (action === 'calculate_sickness_payment') {
      const result = calculateSicknessPayment(body);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      const manualReviewRequired = isUnknownOrMixed || result.manual_review_required === true;
      return Response.json({
        success: true,
        cao_sync_status: caoSyncStatus,
        cao_key: targetCaoKey,
        contract_id: contract_id || contract?.id || null,
        contract_cao_resolution: {
          ...contractCaoResolution,
          selected_contract: undefined
        },
        cao_runtime_support: leaveSicknessRuntimeSupport,
        calculation_warnings: syncWarnings,
        scope_warnings: scopeWarnings,
        cao_scope_profile: caoScope?.cao_scope_profile || null,
        ...result,
        manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
        payroll_final_allowed: !manualReviewRequired && contractCaoResolution.manual_review_required !== true && result.payroll_final_allowed !== false
      });
    }

    // Default: bereken beide
    const vacation = calculateVacationAccrual(vacationInput);
    const sickness = body.sickness_start_date ? calculateSicknessPayment(body) : null;
    const manualReviewRequired = isUnknownOrMixed ||
      vacation.manual_review_required === true ||
      sickness?.manual_review_required === true;

    return Response.json({
      success: true,
      cao_sync_status: caoSyncStatus,
      cao_key: targetCaoKey,
      contract_id: contract_id || contract?.id || null,
      contract_cao_resolution: {
        ...contractCaoResolution,
        selected_contract: undefined
      },
      cao_runtime_support: leaveSicknessRuntimeSupport,
      calculation_warnings: syncWarnings,
      scope_warnings: scopeWarnings,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      manual_review_required: manualReviewRequired || contractCaoResolution.manual_review_required === true,
      payroll_final_allowed: !manualReviewRequired &&
        contractCaoResolution.manual_review_required !== true &&
        vacation.payroll_final_allowed !== false &&
        (sickness ? sickness.payroll_final_allowed !== false : true),
      apply_ort_vacation: applyOrtVacation,
      vacation_accrual: vacation,
      sickness_payment: sickness
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

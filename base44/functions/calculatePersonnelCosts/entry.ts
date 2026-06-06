import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Revisie-gebaseerde lazy CAO-sync helper ──
// Slaat sync over ALLEEN als cloudflare_revision al overeenkomt. Geen tijdgebaseerde skip.
async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_payroll_calculation',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    // Cloudflare onbereikbaar — stille fallback, waarschuwing wordt hieronder toegevoegd
    return { cloudflare_unavailable: true };
  }
}

// CAO Particuliere Beveiliging - Toeslagberekening
// Feestdagen komen uit CAOConfiguration.holidays — GEEN hardcoded lijsten.

function isHoliday(dateStr, caoConfig) {
  const holidays = (caoConfig && caoConfig.holidays) ? caoConfig.holidays : [];
  return holidays.some(h => h.date === dateStr);
}

function isNewYearsEveAfter16(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  return month === 12 && day === 31 && hours >= 16;
}

function getSurchargeType(datetime, caoConfig) {
  const date = new Date(datetime);
  const dayOfWeek = date.getDay(); // 0=zondag, 6=zaterdag
  const hours = date.getHours();
  const dateStr = date.toISOString().split('T')[0];

  // Oudejaarsdag na 16:00 (hoogste toeslag)
  if (isNewYearsEveAfter16(date)) {
    return { type: 'new_years_eve', percentage: caoConfig.surcharge_new_years_eve_after_16 || 100 };
  }

  // Feestdagen (50%) — opgehaald uit CAOConfiguration.holidays
  if (isHoliday(dateStr, caoConfig)) {
    return { type: 'holiday', percentage: caoConfig.surcharge_holiday || 50 };
  }

  // Weekend (zaterdag 00:00 - zondag 24:00) = 35%
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { type: 'weekend', percentage: caoConfig.surcharge_weekend || 35 };
  }

  // Nacht ma-vr 00:00 - 07:00 = 20%
  if (hours >= 0 && hours < 7) {
    return { type: 'night', percentage: caoConfig.surcharge_night || 20 };
  }

  // Avond ma-vr 18:00 - 24:00 = 10%
  if (hours >= 18) {
    return { type: 'evening', percentage: caoConfig.surcharge_evening || 10 };
  }

  // Dag = 0%
  return { type: 'day', percentage: 0 };
}

function r2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getOvertimeRules(caoConfig) {
  const rules = caoConfig?.overtime_rules || {};
  return {
    threshold_hours_per_pay_period: Number(rules.threshold_hours_per_pay_period ?? rules.threshold_hours ?? caoConfig?.overtime_threshold_hours ?? 152),
    surcharge_percentage: Number(rules.surcharge_percentage ?? rules.overtime_surcharge_percentage ?? caoConfig?.overtime_surcharge_percentage ?? 50),
    source_rule_ids: rules.source_rule_ids || ['CAO-PB-2024-R0797']
  };
}

async function resolveLoondienstWageBasis({ base44, personnel_id, personnel, caoScope }) {
  if (personnel.employee_type !== 'loondienst') {
    return {
      base_hourly_rate: null,
      wage_basis_type: personnel.employee_type === 'zzp' ? 'zzp_rate' : 'missing',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: personnel.employee_type === 'zzp' ? 'final' : 'not_applicable',
      warnings: [],
      cao_function_classification: null
    };
  }

  if (personnel.cao !== 'cao_particuliere_beveiliging') {
    const customRate = Number(personnel.custom_hourly_rate || 0);
    if (customRate <= 0) {
      return {
        base_hourly_rate: null,
        wage_basis_type: 'missing',
        appendix_2_applies: null,
        payroll_final_allowed: false,
        manual_review_required: true,
        calculation_status: 'blocked_missing_wage_basis',
        warnings: [],
        error: `Geen uurloon gevonden voor medewerker ${personnel.name} (eigen tarief): custom_hourly_rate ontbreekt.`,
        cao_function_classification: null
      };
    }
    return {
      base_hourly_rate: customRate,
      wage_basis_type: 'custom_hourly_rate',
      appendix_2_applies: null,
      payroll_final_allowed: true,
      manual_review_required: false,
      calculation_status: 'final',
      warnings: [],
      cao_function_classification: null
    };
  }

  let classification = null;
  try {
    const classRes = await base44.asServiceRole.functions.invoke('resolveCaoFunctionClassification', {
      personnel_id,
      work_context: {}
    });
    classification = classRes?.data || null;
  } catch {
    classification = null;
  }

  const profileAppendixApplies = caoScope?.payroll_rule_profile?.apply_appendix_2_function_scales === true;
  const appendixApplies = classification?.appendix_2_applies ?? profileAppendixApplies;
  const isScopeManual = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope?.cao_scope_profile) ||
    caoScope?.manual_review_required === true;

  if (appendixApplies === false) {
    const customRate = Number(personnel.custom_hourly_rate || 0);
    if (customRate <= 0) {
      return {
        base_hourly_rate: null,
        wage_basis_type: 'missing',
        appendix_2_applies: false,
        payroll_final_allowed: false,
        manual_review_required: true,
        calculation_status: 'blocked_missing_wage_basis',
        warnings: [
          ...(classification?.warnings || []),
          'CAO-schaal/periodiek wordt niet gebruikt omdat bijlage 2 niet van toepassing is.'
        ],
        error: 'Loonbasis ontbreekt voor niet-beveiligingspersoneel: custom_hourly_rate ontbreekt. Bijlage 2 loonschaal is niet van toepassing.',
        cao_function_classification: classification
      };
    }

    const manualReview = isScopeManual || classification?.manual_review_required === true;
    return {
      base_hourly_rate: customRate,
      wage_basis_type: 'custom_hourly_rate',
      appendix_2_applies: false,
      payroll_final_allowed: !manualReview && classification?.payroll_final_allowed !== false,
      manual_review_required: manualReview,
      calculation_status: manualReview ? 'concept_manual_review' : 'final',
      warnings: [
        ...(classification?.warnings || []),
        ...(personnel.cao_scale != null || personnel.cao_period != null
          ? ['CAO-schaal/periodiek genegeerd: bijlage 2 is niet van toepassing op dit toepassingsprofiel.']
          : [])
      ],
      cao_function_classification: classification
    };
  }

  if (!classification) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_manual_review',
      warnings: [],
      error: 'Functie-indeling kon niet worden bepaald. Loonberekening is geblokkeerd totdat bijlage-2 schaal en periodiek zijn gevalideerd.',
      cao_function_classification: null
    };
  }

  const classificationOk = classification.classification_status === 'resolved' &&
    classification.payroll_final_allowed === true &&
    classification.scale_valid_for_classification === true &&
    classification.period_valid_for_scale === true &&
    classification.wage_rate_found === true &&
    Number(classification.hourly_rate || 0) > 0;

  if (!classificationOk) {
    return {
      base_hourly_rate: null,
      wage_basis_type: 'manual_review',
      appendix_2_applies: true,
      payroll_final_allowed: false,
      manual_review_required: true,
      calculation_status: 'blocked_manual_review',
      warnings: classification.warnings || [],
      error: `Functie-indeling/loonschaal niet definitief gevalideerd voor ${personnel.name}. Loonberekening is geblokkeerd totdat bijlage-2 schaal en periodiek kloppen.`,
      cao_function_classification: classification
    };
  }

  return {
    base_hourly_rate: Number(classification.hourly_rate),
    wage_basis_type: 'cao_appendix_2_scale',
    appendix_2_applies: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    calculation_status: 'final',
    warnings: classification.warnings || [],
    cao_function_classification: classification
  };
}

// Bereken loonheffing op basis van bruto loon
function calculateTaxAmount(taxableAmount, caoConfig, annualSalaryEstimate) {
  // Vereenvoudigde berekening: gebruik gemiddeld percentage op basis van jaarloon
  // In werkelijkheid is dit complexer met staffels en heffingskortingen
  
  const yearlyIncome = annualSalaryEstimate || (taxableAmount * 13); // 13 periodes per jaar
  
  let taxRate = 0;
  if (yearlyIncome <= (caoConfig.tax_bracket_1_limit || 38098)) {
    taxRate = caoConfig.tax_rate_bracket_1 || 36.97;
  } else if (yearlyIncome <= (caoConfig.tax_bracket_2_limit || 75518)) {
    taxRate = caoConfig.tax_rate_bracket_2 || 36.97;
  } else {
    taxRate = caoConfig.tax_rate_bracket_3 || 49.5;
  }
  
  return taxableAmount * (taxRate / 100);
}

function getCaoPayrollReadiness(caoConfig) {
  const gate = caoConfig?.payroll_readiness_gate || null;
  const status = caoConfig?.payroll_readiness_status || null;
  const ready = caoConfig?.is_payroll_ready === true &&
    status === 'ready' &&
    gate?.passed === true;

  return {
    ready,
    status: status || 'unknown',
    is_payroll_ready: caoConfig?.is_payroll_ready === true,
    gate_present: !!gate,
    blocking_findings: gate?.blocking_findings || [],
    open_payroll_critical_rules: gate?.open_payroll_critical_rules || [],
    counts: gate?.counts || null
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      personnel_id,
      work_schedule,
      force_cao_sync,
      record_payroll_run = false,
      pay_period_year = null,
      pay_period_number = null,
      pay_period_start = null,
      pay_period_end = null,
      payroll_run_status = 'calculated',
      work_schedule_is_full_pay_period = false,
      vacation_hours = 0,
      extraordinary_leave_hours = 0,
      sickness_hours = 0,
      minus_hours = 0,
      empty_run_hours = 0,
      other_paid_work_time_hours = 0,
      paid_absence_hours = 0
    } = await req.json();

    // ── Normaliseer CAO-scope: null = fail-closed (unknown_manual_review) ──
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

    // ── CAO-toepassingscheck ──
    let rawScope = null;
    if (personnel_id) {
      try {
        const scopeRes = await base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id });
        rawScope = scopeRes?.data || null;
      } catch { /* stille fallback */ }
    }
    const caoScope = normalizeCaoScope(rawScope);
    const scopeWarnings = [];
    const isUnknownOrMixedScope = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);

    if (isUnknownOrMixedScope) {
      scopeWarnings.push({
        message: `CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): beveiligingsspecifieke toeslagen (art. 40/42/43) worden NIET automatisch berekend. Handmatige review vereist.`,
        cao_scope_profile: caoScope.cao_scope_profile,
        manual_review_required: true
      });
    } else if (!caoScope.applies_full_security_rules) {
      const exclusions = [];
      if (caoScope.payroll_rule_profile?.apply_article_40_special_hours === false) exclusions.push('avond-/nacht-/weekendtoeslagen (art. 40)');
      if (caoScope.payroll_rule_profile?.apply_article_42_overtime === false) exclusions.push('overwerktoeslag (art. 42)');
      if (caoScope.payroll_rule_profile?.apply_article_43_shift_change === false) exclusions.push('dienstruilvergoeding (art. 43)');
      if (caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements === false) exclusions.push('reiskosten/vergoedingen (hoofdstuk 5)');
      if (exclusions.length > 0) {
        scopeWarnings.push({
          message: `Artikel 3 lid 2 CAO PB (${caoScope.cao_scope_profile}): niet van toepassing: ${exclusions.join(', ')}. Art. 37/38/41 gelden wel.`,
          cao_scope_profile: caoScope.cao_scope_profile,
          excluded_articles: caoScope.excluded_articles || []
        });
      }
    }

    // cao_rule_application metadata voor output
    const caoRuleApplication = {
      cao_scope_profile: caoScope.cao_scope_profile,
      applied_article_40_special_hours: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_40_special_hours === true),
      applied_article_41_holidays: caoScope.payroll_rule_profile?.apply_article_41_holidays !== false,
      applied_article_42_overtime: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_42_overtime === true),
      applied_chapter_5_reimbursements: !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_chapter_5_reimbursements === true),
      manual_review_required: isUnknownOrMixedScope || caoScope.manual_review_required || false,
      source_rule_ids: caoScope.source_rule_ids || []
    };

    // Lazy CAO-sync — bewaar resultaat voor cao_sync_status
    const syncResult = await lazySyncCao(base44, !!force_cao_sync);

    const calculationWarnings = [];
    if (syncResult?.cloudflare_unavailable) {
      calculationWarnings.push('CAO Cloudflare sync tijdelijk niet bereikbaar; actieve Base44 CAO gebruikt.');
    }
    if (syncResult?.reason === 'no_cloudflare_current') {
      calculationWarnings.push('Geen Cloudflare CAO-payload beschikbaar; actieve Base44 CAO gebruikt.');
    }
    if (syncResult?.reason === 'cloudflare_unavailable' || syncResult?.reason === 'cloudflare_current_unavailable') {
      calculationWarnings.push('Cloudflare onbereikbaar; actieve Base44 CAO gebruikt.');
    }

    const caoSyncStatus = {
      changed: syncResult?.changed ?? false,
      reason: syncResult?.reason || (syncResult?.cloudflare_unavailable ? 'cloudflare_unavailable' : 'ok'),
      revision: syncResult?.revision || null
    };

    // work_schedule format: [{ date: "2025-01-15", start_time: "08:00", end_time: "17:00" }, ...]

    if (!personnel_id || !work_schedule || !Array.isArray(work_schedule)) {
      return Response.json({ error: 'personnel_id en work_schedule zijn verplicht' }, { status: 400 });
    }

    // Haal medewerker op
    const personnel = await base44.entities.Personnel.get(personnel_id);
    
    // Bepaal referentiedatum op basis van de eerste dienst
    const firstShiftDate = work_schedule[0]?.date || new Date().toISOString().split('T')[0];
    const refDate = new Date(firstShiftDate);

    // Haal ACTIEVE CAO op op basis van datum (niet op created_date)
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({ status: 'active' });
    const eligibleCaos = allCaos.filter(c => {
      if (c.valid_from && new Date(c.valid_from) > refDate) return false;
      if (c.valid_until && new Date(c.valid_until) < refDate) return false;
      return true;
    });
    eligibleCaos.sort((a, b) => {
      const da = a.valid_from ? new Date(a.valid_from) : new Date(0);
      const db = b.valid_from ? new Date(b.valid_from) : new Date(0);
      return db - da;
    });

    const caoConfig = eligibleCaos[0];
    if (!caoConfig) {
      return Response.json({
        error: `Geen actieve CAO-configuratie gevonden voor datum ${firstShiftDate}. Activeer eerst een CAO-configuratie.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [...calculationWarnings, `Geen actieve CAO voor ${firstShiftDate}`]
      }, { status: 400 });
    }

    const payrollReadiness = getCaoPayrollReadiness(caoConfig);
    if (!payrollReadiness.ready) {
      return Response.json({
        error: `Actieve CAO-configuratie is niet payroll-ready (${payrollReadiness.status}). Definitieve loonberekening is geblokkeerd totdat de CAO coverage-gate slaagt.`,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: [
          ...calculationWarnings,
          'Payroll geblokkeerd: CAO-regeldekking of payrollparameters zijn niet bewezen compleet.'
        ],
        cao_configuration_id: caoConfig.id,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_valid_from: caoConfig.valid_from,
        cao_payroll_readiness: payrollReadiness,
        manual_review_required: true,
        payroll_final_allowed: false,
        calculation_status: 'blocked_cao_not_payroll_ready'
      }, { status: 400 });
    }

    let totalHours = 0;
    let hoursByType = {
      day: 0,
      evening: 0,
      night: 0,
      weekend: 0,
      holiday: 0,
      new_years_eve: 0
    };

    // Check of dit een oproepkracht is
    const isCallWorker = personnel.contract_type === '0_uren' || personnel.contract_type === 'oproep';
    
    // Breakdown zoals op loonstrook
    let payslip = {
      // Bruto componenten
      base_salary: 0,
      vacation_hours_call_worker: 0, // Vakantie-uren oproep (8% extra uren)
      vacation_paid: 0, // Doorbetaling verlof
      surcharges: {
        evening_10: { hours: 0, rate: 0, amount: 0 },
        night_20: { hours: 0, rate: 0, amount: 0 },
        weekend_35: { hours: 0, rate: 0, amount: 0 },
        holiday_50: { hours: 0, rate: 0, amount: 0 },
        new_years_eve_100: { hours: 0, rate: 0, amount: 0 }
      },
      overtime_50: {
        hours: 0,
        rate: 0,
        amount: 0,
        threshold_hours_per_pay_period: null,
        arbeidstijd_hours_for_overtime: 0,
        applied: false,
        source_rule_ids: ['CAO-PB-2024-R0797']
      },
      total_gross: 0,
      
      // Werknemersbijdragen (inhoudingen)
      employee_deductions: {
        premium_sfpb: 0,
        premium_paww: 0,
        pension_premium: 0,
        premium_wga: 0,
        tax_withheld: 0,
        total: 0
      },
      
      // Pensioengrondslag berekening
      pension_base: 0,
      
      // Reserveringen (voor normale werknemers) of direct uitbetaald (voor oproepkrachten)
      accruals: {
        vacation_allowance: 0,
        year_end_bonus: 0
      },
      
      // Werkgeverslasten (niet zichtbaar voor werknemer, maar wel kosten)
      employer_costs: {
        pension_premium: 0,
        premium_awf: 0,
        premium_ww: 0,
        premium_wia: 0,
        premium_wga: 0,
        premium_zw: 0,
        total: 0
      },
      
      // Totalen
      net_salary: 0,
      total_cost_employer: 0,
      
      // Details per shift
      shift_details: [],
      
      // Metadata
      is_call_worker: isCallWorker
    };

    // ── Bepaal loonbasis via CAO-scope + functieclassificatie ──
    const wageBasis = await resolveLoondienstWageBasis({ base44, personnel_id, personnel, caoScope });
    const functionClassificationResult = wageBasis.cao_function_classification;
    const payrollFinalAllowed = wageBasis.payroll_final_allowed;
    const wageBasisType = wageBasis.wage_basis_type;
    const calculationStatus = wageBasis.calculation_status;
    calculationWarnings.push(...(wageBasis.warnings || []));

    if (wageBasis.error) {
      return Response.json({
        error: wageBasis.error,
        cao_sync_status: caoSyncStatus,
        calculation_warnings: calculationWarnings,
        cao_function_classification: functionClassificationResult,
        wage_basis_type: wageBasisType,
        calculation_status: calculationStatus,
        manual_review_required: wageBasis.manual_review_required,
        payroll_final_allowed: false
      }, { status: 400 });
    }

    const baseHourlyRate = wageBasis.base_hourly_rate || 0;
    let runtimePayrollFinalAllowed = payrollFinalAllowed;
    let runtimeCalculationStatus = calculationStatus;
    const payrollRuntimeReviewItems = [];

    // Bereken per werkdag
    for (const shift of work_schedule) {
      const { date, start_time, end_time } = shift;
      
      if (!date || !start_time || !end_time) {
        return Response.json({ error: 'Elke dienst moet een datum, starttijd en eindtijd hebben' }, { status: 400 });
      }

      let startDate = new Date(`${date}T${start_time}:00`);
      let endDate = new Date(`${date}T${end_time}:00`);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return Response.json({ error: 'Ongeldige datum of tijd ingevuld' }, { status: 400 });
      }
      
      // Bereken uren - corrigeer voor overnight shifts
      let hoursWorked = (endDate - startDate) / (1000 * 60 * 60);
      if (hoursWorked < 0) {
        // Overnight shift - eindtijd is volgende dag
        endDate = new Date(endDate);
        endDate.setDate(endDate.getDate() + 1);
        hoursWorked = (endDate - startDate) / (1000 * 60 * 60);
      }
      
      totalHours += hoursWorked;

      if (personnel.employee_type === 'zzp') {
        // ZZP berekening (vereenvoudigd, zonder alle details)
        let zzpRate = personnel.zzp_hourly_rate_excl_vat || 0;
        
        const dayOfWeek = startDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHolidayDay = isHoliday(date, caoConfig);
        const hours = startDate.getHours();
        const isNight = hours >= 0 && hours < 7;
        const isEvening = hours >= 18;
        
        if (isHolidayDay && personnel.zzp_holiday_rate) {
          zzpRate = personnel.zzp_holiday_rate;
        } else if (isWeekend && personnel.zzp_weekend_rate) {
          zzpRate = personnel.zzp_weekend_rate;
        } else if (isNight && personnel.zzp_night_rate) {
          zzpRate = personnel.zzp_night_rate;
        } else if (isEvening && personnel.zzp_evening_rate) {
          zzpRate = personnel.zzp_evening_rate;
        }
        
        const hourCostExclVat = zzpRate * hoursWorked;
        const vatAmount = hourCostExclVat * 0.21;
        
        payslip.base_salary += hourCostExclVat + vatAmount;
        
        payslip.shift_details.push({
          date,
          hours: hoursWorked,
          rate_excl_vat: zzpRate,
          vat: vatAmount,
          type: 'zzp',
          total: hourCostExclVat + vatAmount
        });
        
      } else {
        // CAO-scope gate: bijzondere uren ALLEEN als expliciet true (fail-closed)
        const applySpecialHours = !isUnknownOrMixedScope && (caoScope.payroll_rule_profile?.apply_article_40_special_hours === true);
        // Feestdagtoeslag: aan tenzij expliciet uitgesloten
        const applyHolidays = caoScope.payroll_rule_profile?.apply_article_41_holidays !== false;

        // Loondienst berekening - verwerk dienst per uur voor correcte toeslagberekening
        let currentTime = new Date(startDate);
        const endTime = new Date(endDate);
        
        while (currentTime < endTime) {
          const nextHour = new Date(currentTime);
          nextHour.setHours(nextHour.getHours() + 1);
          
          const hoursThisSegment = nextHour <= endTime ? 1 : (endTime - currentTime) / (1000 * 60 * 60);
          
          const surchargeInfo = getSurchargeType(currentTime, caoConfig);
          let surchargeType = surchargeInfo.type;
          let surchargePercentage = surchargeInfo.percentage;

          // Pas scope-gates toe: bijzondere uren en weekendtoeslagen alleen bij full_security/art.40
          if (!applySpecialHours && ['evening', 'night', 'weekend'].includes(surchargeType)) {
            surchargeType = 'day';
            surchargePercentage = 0;
          }
          // Feestdagtoeslag altijd als applyHolidays
          if (!applyHolidays && surchargeType === 'holiday') {
            surchargeType = 'day';
            surchargePercentage = 0;
          }
          
          hoursByType[surchargeType] += hoursThisSegment;
          
          const grossWageThisSegment = baseHourlyRate * hoursThisSegment;
          payslip.base_salary += grossWageThisSegment;
          
          // Bereken toeslag bedrag
          const surchargeAmount = grossWageThisSegment * (surchargePercentage / 100);
          const surchargeRatePerHour = baseHourlyRate * (surchargePercentage / 100);
          
          // Categoriseer toeslagen
          if (surchargeType === 'evening') {
            payslip.surcharges.evening_10.hours += hoursThisSegment;
            payslip.surcharges.evening_10.rate = surchargeRatePerHour;
            payslip.surcharges.evening_10.amount += surchargeAmount;
          } else if (surchargeType === 'night') {
            payslip.surcharges.night_20.hours += hoursThisSegment;
            payslip.surcharges.night_20.rate = surchargeRatePerHour;
            payslip.surcharges.night_20.amount += surchargeAmount;
          } else if (surchargeType === 'weekend') {
            payslip.surcharges.weekend_35.hours += hoursThisSegment;
            payslip.surcharges.weekend_35.rate = surchargeRatePerHour;
            payslip.surcharges.weekend_35.amount += surchargeAmount;
          } else if (surchargeType === 'holiday') {
            payslip.surcharges.holiday_50.hours += hoursThisSegment;
            payslip.surcharges.holiday_50.rate = surchargeRatePerHour;
            payslip.surcharges.holiday_50.amount += surchargeAmount;
          } else if (surchargeType === 'new_years_eve') {
            payslip.surcharges.new_years_eve_100.hours += hoursThisSegment;
            payslip.surcharges.new_years_eve_100.rate = surchargeRatePerHour;
            payslip.surcharges.new_years_eve_100.amount += surchargeAmount;
          }
          
          currentTime = nextHour;
        }
        
        payslip.shift_details.push({
          date,
          start_time,
          end_time,
          hours: hoursWorked,
          base_rate: baseHourlyRate
        });
      }
    }

    if (personnel.employee_type === 'zzp') {
      // ZZP: totaal is inclusief BTW
      payslip.total_gross = payslip.base_salary;
      payslip.net_salary = payslip.base_salary;
      payslip.total_cost_employer = payslip.base_salary;
      
    } else {
      // Loondienst: Bereken alle componenten
      const profile = caoScope?.payroll_rule_profile || {};
      const applyOvertime = !isUnknownOrMixedScope && profile.apply_article_42_overtime === true;
      const overtimeRules = getOvertimeRules(caoConfig);
      const explicitPaidAbsenceHours =
        numberOrZero(paid_absence_hours) +
        numberOrZero(vacation_hours) +
        numberOrZero(extraordinary_leave_hours) +
        numberOrZero(sickness_hours) +
        numberOrZero(minus_hours) +
        numberOrZero(empty_run_hours) +
        numberOrZero(other_paid_work_time_hours);
      const arbeidstijdHoursForOvertime = totalHours + explicitPaidAbsenceHours;
      const representsFullPayPeriod = work_schedule_is_full_pay_period === true ||
        record_payroll_run === true ||
        (!!pay_period_number && !!pay_period_start && !!pay_period_end);

      payslip.overtime_50.threshold_hours_per_pay_period = overtimeRules.threshold_hours_per_pay_period;
      payslip.overtime_50.arbeidstijd_hours_for_overtime = arbeidstijdHoursForOvertime;
      payslip.overtime_50.source_rule_ids = overtimeRules.source_rule_ids;

      if (applyOvertime) {
        if (!representsFullPayPeriod && arbeidstijdHoursForOvertime <= overtimeRules.threshold_hours_per_pay_period) {
          payrollRuntimeReviewItems.push({
            rule_id: 'CAO-PB-2024-R0797',
            domain: 'overtime',
            message: 'Overwerktoeslag kan alleen definitief worden vastgesteld op basis van de volledige loonperiode. Geef work_schedule_is_full_pay_period=true of loonperiodegegevens mee.',
            field: 'work_schedule_is_full_pay_period'
          });
          calculationWarnings.push('Overwerk niet definitief vastgesteld: work_schedule lijkt geen volledige loonperiode te bevatten.');
          runtimePayrollFinalAllowed = false;
          runtimeCalculationStatus = runtimeCalculationStatus === 'final' ? 'concept_manual_review' : runtimeCalculationStatus;
        } else {
          const overtimeHours = Math.max(0, arbeidstijdHoursForOvertime - overtimeRules.threshold_hours_per_pay_period);
          payslip.overtime_50.hours = overtimeHours;
          payslip.overtime_50.rate = baseHourlyRate * (overtimeRules.surcharge_percentage / 100);
          payslip.overtime_50.amount = overtimeHours * baseHourlyRate * (overtimeRules.surcharge_percentage / 100);
          payslip.overtime_50.applied = overtimeHours > 0;
        }
      } else if (arbeidstijdHoursForOvertime > overtimeRules.threshold_hours_per_pay_period) {
        calculationWarnings.push(`Meer dan ${overtimeRules.threshold_hours_per_pay_period} uur arbeidstijd gesignaleerd, maar art. 42 overwerktoeslag is niet van toepassing op dit CAO-profiel.`);
      }
      
      // Voor oproepkrachten: bereken vakantie-uren (8% extra uren die uitbetaald worden)
      if (isCallWorker) {
        const vacationHours = totalHours * 0.08;
        payslip.vacation_hours_call_worker = vacationHours * baseHourlyRate;
      }
      
      // Totaal bruto loon = basis + vakantie-uren oproep + toeslagen
      const totalSurcharges = 
        payslip.surcharges.evening_10.amount +
        payslip.surcharges.night_20.amount +
        payslip.surcharges.weekend_35.amount +
        payslip.surcharges.holiday_50.amount +
        payslip.surcharges.new_years_eve_100.amount;
      const overtimeAmount = payslip.overtime_50.amount;
      
      // Bereken gemiddelde ORT per uur (voor ORT verlof berekening)
      const avgOrtPerHour = totalHours > 0 ? totalSurcharges / totalHours : 0;
      
      // Voor oproepkrachten: vakantiegeld en eindejaarsuitkering direct uitbetaald
      if (isCallWorker) {
        // Bereken vakantiegeld en eindejaarsuitkering als percentage van basis + toeslagen
        const baseForAllowances = payslip.base_salary + totalSurcharges;
        
        // Bereken ORT verlof: vakantie-uren * gemiddelde ORT per uur
        const vacationHours = totalHours * 0.08;
        const ortVerlof = vacationHours * avgOrtPerHour;
        
        payslip.accruals.vacation_allowance = baseForAllowances * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = (baseForAllowances + payslip.accruals.vacation_allowance) * ((caoConfig.year_end_bonus || 2.01) / 100);
        
        // Voeg ORT verlof toe aan doorbetaling verlof
        payslip.vacation_paid = ortVerlof;
        
        // Voor oproepkrachten wordt dit direct uitbetaald, niet gereserveerd
        payslip.total_gross = payslip.base_salary + payslip.vacation_hours_call_worker + totalSurcharges + overtimeAmount + payslip.accruals.vacation_allowance + payslip.accruals.year_end_bonus + payslip.vacation_paid;
      } else {
        payslip.total_gross = payslip.base_salary + totalSurcharges + overtimeAmount;
      }
      
      // Bereken pensioengrondslag (bruto loon - vakantiegeld/eindejaarsuitkering - franchise)
      // Voor oproepkrachten: basis + toeslagen (zonder vakantiegeld/eindejaarsuitkering)
      const pensionBaseAmount = isCallWorker 
        ? (payslip.base_salary + totalSurcharges)
        : payslip.total_gross;
      
      // Franchise op jaarbasis, hier naar periode omrekenen (4-wekelijks = 13 periodes)
      const franchiseThisPeriod = (caoConfig.pension_base_salary_threshold || 16164) / 13;
      let pensionBase = Math.max(0, pensionBaseAmount - franchiseThisPeriod);
      
      // Voor lage inkomens: zorg dat er altijd minimaal pensioen wordt opgebouwd
      // Als pensioengrondslag te laag is, neem een minimale basis aan
      if (pensionBase > 0 && pensionBase < 100) {
        pensionBase = Math.max(pensionBase, pensionBaseAmount * 0.1); // minimaal 10% van het loon
      }
      
      payslip.pension_base = pensionBase;
      
      // Werknemersbijdragen - basis is altijd bruto loon exclusief vakantiegeld/eindejaarsuitkering voor oproepkrachten
      const basisForPremiums = isCallWorker ? (payslip.base_salary + payslip.vacation_hours_call_worker + totalSurcharges) : payslip.total_gross;
      
      payslip.employee_deductions.premium_sfpb = basisForPremiums * ((caoConfig.premium_sfpb || 0.061) / 100);
      payslip.employee_deductions.premium_paww = basisForPremiums * ((caoConfig.premium_paww_employee || 0.1) / 100);
      
      // Pensioenpremie werknemer (40% van totaal)
      const totalPensionPremium = pensionBase * ((caoConfig.pension_premium_rate_total || 24.1) / 100);
      payslip.employee_deductions.pension_premium = totalPensionPremium * ((caoConfig.pension_premium_employee || 40) / 100);
      
      payslip.employee_deductions.premium_wga = basisForPremiums * ((caoConfig.premium_wga_employee || 0.81) / 100);
      
      // Belastingberekening
      const taxableIncome = payslip.total_gross - payslip.employee_deductions.pension_premium;
      
      // Schat jaarloon - voor oproepkrachten conservatief schatten
      const estimatedAnnualSalary = basisForPremiums * 13;
      
      // Als jaarloon te laag is (onder grens), geen loonheffing
      if (estimatedAnnualSalary < 12000) {
        payslip.employee_deductions.tax_withheld = 0;
      } else {
        payslip.employee_deductions.tax_withheld = calculateTaxAmount(taxableIncome, caoConfig, estimatedAnnualSalary);
      }
      
      payslip.employee_deductions.total = 
        payslip.employee_deductions.premium_sfpb +
        payslip.employee_deductions.premium_paww +
        payslip.employee_deductions.pension_premium +
        payslip.employee_deductions.premium_wga +
        payslip.employee_deductions.tax_withheld;
      
      // Reserveringen - voor normale werknemers
      if (!isCallWorker) {
        // Bereken gemiddelde ORT per uur (voor ORT verlof berekening)
        const avgOrtPerHour = totalHours > 0 ? totalSurcharges / totalHours : 0;
        
        // Schat jaarlijkse vakantie-uren (bijv. 25 dagen * 8 uur = 200 uur)
        const estimatedAnnualVacationHours = 200;
        const ortVerlofReservation = (estimatedAnnualVacationHours / 13) * avgOrtPerHour; // per 4 weken
        
        payslip.accruals.vacation_allowance = payslip.total_gross * ((caoConfig.vacation_allowance || 8) / 100);
        const yearEndBonusEligibleWage = payslip.base_salary + totalSurcharges;
        const yearEndBonusEligibleVacationAllowance = yearEndBonusEligibleWage * ((caoConfig.vacation_allowance || 8) / 100);
        payslip.accruals.year_end_bonus = (yearEndBonusEligibleWage + yearEndBonusEligibleVacationAllowance) * ((caoConfig.year_end_bonus || 2.01) / 100);
        
        // Voeg ORT verlof reservering toe
        payslip.vacation_paid = ortVerlofReservation;
      }
      
      // Netto loon
      payslip.net_salary = payslip.total_gross - payslip.employee_deductions.total;
      
      // Werkgeverslasten - basis is altijd exclusief vakantiegeld/eindejaarsuitkering
      payslip.employer_costs.pension_premium = totalPensionPremium * ((caoConfig.pension_premium_employer || 60) / 100);
      payslip.employer_costs.premium_awf = basisForPremiums * ((caoConfig.premium_awf_employer || 2.64) / 100);
      payslip.employer_costs.premium_ww = basisForPremiums * (((caoConfig.premium_ww_employer_fixed || 0) + (caoConfig.premium_ww_employer_variable || 1.5)) / 100);
      payslip.employer_costs.premium_wia = basisForPremiums * ((caoConfig.premium_wia_employer || 0.72) / 100);
      payslip.employer_costs.premium_wga = basisForPremiums * ((caoConfig.premium_wga_employer || 1.5) / 100);
      payslip.employer_costs.premium_zw = basisForPremiums * ((caoConfig.premium_zw_employer || 0) / 100);
      
      payslip.employer_costs.total = 
        payslip.employer_costs.pension_premium +
        payslip.employer_costs.premium_awf +
        payslip.employer_costs.premium_ww +
        payslip.employer_costs.premium_wia +
        payslip.employer_costs.premium_wga +
        payslip.employer_costs.premium_zw;
      
      // Totale kosten werkgever
      if (isCallWorker) {
        // Voor oproepkrachten: alles al in bruto opgenomen
        payslip.total_cost_employer = payslip.total_gross + payslip.employer_costs.total;
      } else {
        // Voor normale werknemers: bruto + werkgeverslasten + reserveringen + ORT verlof
        payslip.total_cost_employer = 
          payslip.total_gross +
          payslip.employer_costs.total +
          payslip.accruals.vacation_allowance +
          payslip.accruals.year_end_bonus +
          payslip.vacation_paid;
      }
    }

    const responsePayload = {
      personnel_id,
      personnel_name: personnel.name,
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: scopeWarnings,
      manual_review_required: isUnknownOrMixedScope || !runtimePayrollFinalAllowed,
      payroll_final_allowed: runtimePayrollFinalAllowed,
      wage_basis_type: wageBasisType,
      calculation_status: runtimeCalculationStatus,
      cao_function_classification: functionClassificationResult,
      cao_rule_application: caoRuleApplication,
      payroll_runtime_review_items: payrollRuntimeReviewItems,
      employee_type: personnel.employee_type,
      cao_scale: personnel.cao_scale,
      cao_period: personnel.cao_period,
      base_hourly_rate: baseHourlyRate,
      // CAO metadata
      cao_configuration_id: caoConfig.id,
      cao_version_label: caoConfig.version_label || caoConfig.name,
      cao_revision: caoConfig.cloudflare_revision || null,
      cao_valid_from: caoConfig.valid_from,
      cao_payroll_readiness: payrollReadiness,
      pay_period_year: pay_period_year || refDate.getFullYear(),
      pay_period_number: pay_period_number || null,
      pay_period_start: pay_period_start || work_schedule[0]?.date || null,
      pay_period_end: pay_period_end || work_schedule[work_schedule.length - 1]?.date || null,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: calculationWarnings,
      total_hours: Math.round(totalHours * 100) / 100,
      hours_by_type: hoursByType,
      payslip: {
        // Bruto onderdeel
        base_salary: Math.round(payslip.base_salary * 100) / 100,
        vacation_hours_call_worker: Math.round(payslip.vacation_hours_call_worker * 100) / 100,
        vacation_paid: Math.round(payslip.vacation_paid * 100) / 100,
        surcharges: {
          evening_10: {
            hours: Math.round(payslip.surcharges.evening_10.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.evening_10.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.evening_10.amount * 100) / 100
          },
          night_20: {
            hours: Math.round(payslip.surcharges.night_20.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.night_20.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.night_20.amount * 100) / 100
          },
          weekend_35: {
            hours: Math.round(payslip.surcharges.weekend_35.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.weekend_35.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.weekend_35.amount * 100) / 100
          },
          holiday_50: {
            hours: Math.round(payslip.surcharges.holiday_50.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.holiday_50.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.holiday_50.amount * 100) / 100
          },
          new_years_eve_100: {
            hours: Math.round(payslip.surcharges.new_years_eve_100.hours * 100) / 100,
            rate: Math.round(payslip.surcharges.new_years_eve_100.rate * 100) / 100,
            amount: Math.round(payslip.surcharges.new_years_eve_100.amount * 100) / 100
          }
        },
        overtime_50: {
          hours: r2(payslip.overtime_50.hours),
          rate: r2(payslip.overtime_50.rate),
          amount: r2(payslip.overtime_50.amount),
          threshold_hours_per_pay_period: payslip.overtime_50.threshold_hours_per_pay_period,
          arbeidstijd_hours_for_overtime: r2(payslip.overtime_50.arbeidstijd_hours_for_overtime),
          applied: payslip.overtime_50.applied,
          source_rule_ids: payslip.overtime_50.source_rule_ids
        },
        total_gross: Math.round(payslip.total_gross * 100) / 100,
        is_call_worker: payslip.is_call_worker,
        
        // Werknemersbijdragen
        employee_deductions: {
          premium_sfpb: Math.round(payslip.employee_deductions.premium_sfpb * 100) / 100,
          premium_paww: Math.round(payslip.employee_deductions.premium_paww * 100) / 100,
          pension_premium: Math.round(payslip.employee_deductions.pension_premium * 100) / 100,
          premium_wga: Math.round(payslip.employee_deductions.premium_wga * 100) / 100,
          tax_withheld: Math.round(payslip.employee_deductions.tax_withheld * 100) / 100,
          total: Math.round(payslip.employee_deductions.total * 100) / 100
        },
        
        pension_base: Math.round(payslip.pension_base * 100) / 100,
        
        // Reserveringen
        accruals: {
          vacation_allowance: Math.round(payslip.accruals.vacation_allowance * 100) / 100,
          year_end_bonus: Math.round(payslip.accruals.year_end_bonus * 100) / 100
        },
        
        // Werkgeverslasten
        employer_costs: {
          pension_premium: Math.round(payslip.employer_costs.pension_premium * 100) / 100,
          premium_awf: Math.round(payslip.employer_costs.premium_awf * 100) / 100,
          premium_ww: Math.round(payslip.employer_costs.premium_ww * 100) / 100,
          premium_wia: Math.round(payslip.employer_costs.premium_wia * 100) / 100,
          premium_wga: Math.round(payslip.employer_costs.premium_wga * 100) / 100,
          premium_zw: Math.round(payslip.employer_costs.premium_zw * 100) / 100,
          total: Math.round(payslip.employer_costs.total * 100) / 100
        },
        
        // Totalen
        net_salary: Math.round(payslip.net_salary * 100) / 100,
        total_cost_employer: Math.round(payslip.total_cost_employer * 100) / 100,
        avg_cost_per_hour: totalHours > 0 ? Math.round((payslip.total_cost_employer / totalHours) * 100) / 100 : 0
      },
      shift_details: payslip.shift_details
    };

    if (record_payroll_run === true) {
      if (!responsePayload.pay_period_number) {
        return Response.json({
          error: 'pay_period_number is verplicht als record_payroll_run=true.',
          calculation: responsePayload
        }, { status: 400 });
      }
      const run = await base44.asServiceRole.entities.PayrollCalculationRun.create({
        personnel_id,
        route_id: null,
        cao_configuration_id: caoConfig.id,
        cao_version_label: caoConfig.version_label || caoConfig.name,
        cao_revision: caoConfig.cloudflare_revision || null,
        cao_payroll_readiness_status: caoConfig.payroll_readiness_status || null,
        correction_run_for_review_ids: [],
        supersedes_payroll_run_ids: [],
        pay_period_year: responsePayload.pay_period_year,
        pay_period_number: responsePayload.pay_period_number,
        pay_period_start: responsePayload.pay_period_start,
        pay_period_end: responsePayload.pay_period_end,
        payroll_run_status,
        payroll_exported_at: null,
        payroll_paid_at: null,
        requires_cao_recalculation: false,
        cao_recalculation_reason_ids: [],
        calculation_input: {
          personnel_id,
          work_schedule,
          work_schedule_is_full_pay_period,
          paid_absence_hours,
          vacation_hours,
          extraordinary_leave_hours,
          sickness_hours,
          minus_hours,
          empty_run_hours,
          other_paid_work_time_hours,
          pay_period_year: responsePayload.pay_period_year,
          pay_period_number: responsePayload.pay_period_number,
          pay_period_start: responsePayload.pay_period_start,
          pay_period_end: responsePayload.pay_period_end
        },
        calculation_output: responsePayload,
        warnings: calculationWarnings.map(message => ({ message })),
        created_at: new Date().toISOString(),
        created_by_function: 'calculatePersonnelCosts'
      });
      responsePayload.payroll_calculation_run_id = run.id;
    }

    return Response.json(responsePayload);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

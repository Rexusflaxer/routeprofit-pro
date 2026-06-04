import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// CAO Particuliere Beveiliging 2026 - Gecontroleerde loonschaaldata
const WAGE_SCALES_2026 = {
  "2": {
    "0": { hourly_rate: 16.63, period_salary_4_weeks: 2395.54 },
    "1": { hourly_rate: 17.00, period_salary_4_weeks: 2448.80 }
  },
  "3": {
    "1": { hourly_rate: 17.37, period_salary_4_weeks: 2501.93 },
    "2": { hourly_rate: 18.11, period_salary_4_weeks: 2608.49 },
    "3": { hourly_rate: 18.49, period_salary_4_weeks: 2663.15 },
    "4": { hourly_rate: 18.87, period_salary_4_weeks: 2717.80 },
    "5": { hourly_rate: 19.25, period_salary_4_weeks: 2772.46 },
    "6": { hourly_rate: 19.63, period_salary_4_weeks: 2827.11 },
    "7": { hourly_rate: 20.00, period_salary_4_weeks: 2880.27 },
    "8": { hourly_rate: 20.38, period_salary_4_weeks: 2934.93 },
    "9": { hourly_rate: 20.76, period_salary_4_weeks: 2989.59 },
    "10": { hourly_rate: 21.14, period_salary_4_weeks: 3044.24 }
  },
  "4": {
    "2": { hourly_rate: 18.49, period_salary_4_weeks: 2663.15 },
    "3": { hourly_rate: 18.87, period_salary_4_weeks: 2717.80 },
    "4": { hourly_rate: 19.25, period_salary_4_weeks: 2772.46 },
    "5": { hourly_rate: 19.63, period_salary_4_weeks: 2827.11 },
    "6": { hourly_rate: 20.00, period_salary_4_weeks: 2880.27 },
    "7": { hourly_rate: 20.38, period_salary_4_weeks: 2934.93 },
    "8": { hourly_rate: 20.76, period_salary_4_weeks: 2989.59 },
    "9": { hourly_rate: 21.14, period_salary_4_weeks: 3044.24 },
    "10": { hourly_rate: 21.44, period_salary_4_weeks: 3087.64 },
    "11": { hourly_rate: 21.82, period_salary_4_weeks: 3142.30 },
    "12": { hourly_rate: 22.20, period_salary_4_weeks: 3196.95 }
  },
  "5": {
    "4": { hourly_rate: 19.63, period_salary_4_weeks: 2827.11 },
    "5": { hourly_rate: 20.00, period_salary_4_weeks: 2880.27 },
    "6": { hourly_rate: 20.38, period_salary_4_weeks: 2934.93 },
    "7": { hourly_rate: 20.76, period_salary_4_weeks: 2989.59 },
    "8": { hourly_rate: 21.14, period_salary_4_weeks: 3044.24 },
    "9": { hourly_rate: 21.51, period_salary_4_weeks: 3097.27 },
    "10": { hourly_rate: 21.89, period_salary_4_weeks: 3151.93 },
    "11": { hourly_rate: 22.27, period_salary_4_weeks: 3206.58 },
    "12": { hourly_rate: 22.65, period_salary_4_weeks: 3261.24 },
    "13": { hourly_rate: 23.03, period_salary_4_weeks: 3315.89 },
    "14": { hourly_rate: 23.29, period_salary_4_weeks: 3353.80 }
  },
  "6": {
    "5": { hourly_rate: 20.38, period_salary_4_weeks: 2934.93 },
    "6": { hourly_rate: 20.76, period_salary_4_weeks: 2989.59 },
    "7": { hourly_rate: 21.14, period_salary_4_weeks: 3044.24 },
    "8": { hourly_rate: 21.51, period_salary_4_weeks: 3097.27 },
    "9": { hourly_rate: 21.89, period_salary_4_weeks: 3151.93 },
    "10": { hourly_rate: 22.27, period_salary_4_weeks: 3206.58 },
    "11": { hourly_rate: 22.65, period_salary_4_weeks: 3261.24 },
    "12": { hourly_rate: 23.03, period_salary_4_weeks: 3315.89 },
    "13": { hourly_rate: 23.41, period_salary_4_weeks: 3370.55 },
    "14": { hourly_rate: 23.79, period_salary_4_weeks: 3425.20 },
    "15": { hourly_rate: 24.17, period_salary_4_weeks: 3479.86 },
    "16": { hourly_rate: 24.80, period_salary_4_weeks: 3571.90 }
  },
  "7": {
    "6": { hourly_rate: 21.51, period_salary_4_weeks: 3097.27 },
    "7": { hourly_rate: 21.89, period_salary_4_weeks: 3151.93 },
    "8": { hourly_rate: 22.27, period_salary_4_weeks: 3206.58 },
    "9": { hourly_rate: 22.65, period_salary_4_weeks: 3261.24 },
    "10": { hourly_rate: 23.03, period_salary_4_weeks: 3315.89 },
    "11": { hourly_rate: 23.41, period_salary_4_weeks: 3370.55 },
    "12": { hourly_rate: 23.79, period_salary_4_weeks: 3425.20 },
    "13": { hourly_rate: 24.17, period_salary_4_weeks: 3479.86 },
    "14": { hourly_rate: 24.80, period_salary_4_weeks: 3571.90 },
    "15": { hourly_rate: 25.19, period_salary_4_weeks: 3627.20 },
    "16": { hourly_rate: 25.57, period_salary_4_weeks: 3681.86 }
  }
};

const PAY_PERIODS_2026 = [
  { year: 2026, period_number: 1, start_date: "2025-12-29", end_date: "2026-01-25", week_range: "53-4", is_extra_period: false },
  { year: 2026, period_number: 2, start_date: "2026-01-26", end_date: "2026-02-22", week_range: "5-8", is_extra_period: false },
  { year: 2026, period_number: 3, start_date: "2026-02-23", end_date: "2026-03-22", week_range: "9-12", is_extra_period: false },
  { year: 2026, period_number: 4, start_date: "2026-03-23", end_date: "2026-04-19", week_range: "13-16", is_extra_period: false },
  { year: 2026, period_number: 5, start_date: "2026-04-20", end_date: "2026-05-17", week_range: "17-20", is_extra_period: false },
  { year: 2026, period_number: 6, start_date: "2026-05-18", end_date: "2026-06-14", week_range: "21-24", is_extra_period: false },
  { year: 2026, period_number: 7, start_date: "2026-06-15", end_date: "2026-07-12", week_range: "25-28", is_extra_period: false },
  { year: 2026, period_number: 8, start_date: "2026-07-13", end_date: "2026-08-09", week_range: "29-32", is_extra_period: false },
  { year: 2026, period_number: 9, start_date: "2026-08-10", end_date: "2026-09-06", week_range: "33-36", is_extra_period: false },
  { year: 2026, period_number: 10, start_date: "2026-09-07", end_date: "2026-10-04", week_range: "37-40", is_extra_period: false },
  { year: 2026, period_number: 11, start_date: "2026-10-05", end_date: "2026-11-01", week_range: "41-44", is_extra_period: false },
  { year: 2026, period_number: 12, start_date: "2026-11-02", end_date: "2026-11-29", week_range: "45-48", is_extra_period: false },
  { year: 2026, period_number: 13, start_date: "2026-11-30", end_date: "2026-12-27", week_range: "49-52", is_extra_period: false },
  { year: 2026, period_number: 14, start_date: "2026-12-28", end_date: "2027-01-03", week_range: "53", is_extra_period: true,
    no_vacation_accrual: true, overtime_rules_differ: true,
    notes: "Geen vakantieopbouw. Overwerk boven 152 uur niet naar rato. Telt niet mee voor structureel overwerk." }
];

const HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "Nieuwjaarsdag", holiday_type: "national", surcharge_policy_key: "holiday_100_new_years" },
  { date: "2026-04-05", name: "Eerste Paasdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-04-06", name: "Tweede Paasdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-04-27", name: "Koningsdag", holiday_type: "national", surcharge_policy_key: "holiday_50" },
  { date: "2026-05-14", name: "Hemelvaartsdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-05-24", name: "Eerste Pinksterdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-05-25", name: "Tweede Pinksterdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-12-25", name: "Eerste Kerstdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" },
  { date: "2026-12-26", name: "Tweede Kerstdag", holiday_type: "religious", surcharge_policy_key: "holiday_50" }
];

// Legacy wage_scales format voor backward compatibility
function buildLegacyWageScales(detailed) {
  const legacy = {};
  for (const [scale, periods] of Object.entries(detailed)) {
    legacy[scale] = {};
    for (const [period, data] of Object.entries(periods)) {
      legacy[scale][period] = data.hourly_rate;
    }
  }
  return legacy;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allowedRoles = ['admin', 'director', 'hr', 'payroll'];
    if (!allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Onvoldoende rechten' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();

    // Controleer of er al een pending_review 2026-configuratie is
    const existing2026 = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: 'cao_particuliere_beveiliging'
    });

    const alreadyPending = existing2026.find(c =>
      (c.status === 'pending_review' || c.status === 'draft') &&
      c.version_label && c.version_label.includes('2026')
    );

    if (alreadyPending && !body.force) {
      return Response.json({
        message: 'Er is al een concept-configuratie voor 2026. Gebruik force=true om opnieuw te extraheren.',
        existing_id: alreadyPending.id
      });
    }

    // Haal actieve configuratie op voor vergelijking
    const activeCao = existing2026.find(c => c.status === 'active');

    // Bouw nieuwe configuratie op
    const newConfig = {
      name: 'CAO Particuliere Beveiliging 2026 (loonperiode 1)',
      cao_key: 'cao_particuliere_beveiliging',
      display_name: 'CAO Particuliere Beveiliging',
      sector: 'Particuliere beveiliging',
      version_label: '2026 loonperiode 1',
      status: 'pending_review',
      is_active: false,
      is_payroll_ready: true,
      payroll_schema_version: 'cao_pb_v1',
      valid_from: '2025-12-29',
      valid_until: '2026-12-27',
      effective_pay_period_year: 2026,
      effective_pay_period_number: 1,
      source_url: 'https://www.beveiligingsbranche.nl/cao/',
      registration_number: '496',
      change_summary: 'Loonsverhoging 3,8% per loonperiode 1 2026. Gecontroleerde loonschaaldata ingevoerd.',
      wage_scales_detailed: WAGE_SCALES_2026,
      wage_scales: buildLegacyWageScales(WAGE_SCALES_2026),
      pay_periods: PAY_PERIODS_2026,
      holidays: HOLIDAYS_2026,
      // Toeslagen conform CAO
      surcharge_weekend: 35,
      surcharge_night: 20,
      surcharge_evening: 10,
      surcharge_holiday: 50,
      surcharge_new_years_eve_after_16: 100,
      surcharges: {
        evening_10: { percentage: 10, applies_to: "maandag-vrijdag 18:00-24:00", article: "art. 40" },
        night_20: { percentage: 20, applies_to: "maandag-vrijdag 00:00-07:00", article: "art. 40" },
        weekend_35: { percentage: 35, applies_to: "zaterdag 00:00 - zondag 24:00", article: "art. 40" },
        holiday_50: { percentage: 50, applies_to: "feestdagen", article: "art. 41" },
        new_years_eve_100: { percentage: 100, applies_to: "oudejaarsdag na 16:00", article: "art. 40" },
        overtime_50: { percentage: 50, applies_to: "overwerk", article: "art. 42", threshold_hours: 152 },
        overtime_100: { percentage: 100, applies_to: "overwerk bijzondere omstandigheden", article: "art. 42", calculation_policy: "manual_review_required" },
        shift_change_5: { percentage: 5, applies_to: "roosterwijziging", article: "art. 43" },
        shift_change_10: { percentage: 10, applies_to: "roosterwijziging korter dan 24 uur", article: "art. 43" },
        shift_change_20: { percentage: 20, applies_to: "roosterwijziging korter dan 4 uur", article: "art. 43" }
      },
      vacation_allowance: 8,
      year_end_bonus: 2.01,
      leave_rules: {
        vacation_accrual_per_period: "conform contract/rooster",
        service_years_leave: { "5_years": 1, "10_years": 2, "15_years": 3 },
        call_worker_vacation_percentage: 9.24,
        call_worker_vacation_max_hours: 144,
        holiday_leave_days: 8,
        atv_days: "conform cao",
        expiry_statutory_days: "6 maanden na jaar van opbouw",
        article: "art. 59-63"
      },
      sickness_rules: {
        waiting_day_threshold_periods: 13,
        waiting_day_applies_below_threshold: true,
        sickness_as_working_hours_excl_waiting_day: true,
        ort_average_reference_periods: 13,
        ort_average_configurable: true,
        article: "art. 64-68"
      },
      minus_hours_rules: {
        max_accrual_per_period: 24,
        max_total_balance: 40,
        paid_in_period_of_accrual: true,
        max_balance_no_salary_deduction: true,
        article: "art. 21-24"
      },
      pension_rules: {
        fund: "Bewakers Pensioen / PFPB",
        employer_share_pct: 60,
        employee_share_pct: 40,
        franchise_annual: 16164,
        premium_rate_total: 24.1,
        regime_80_90_100: { calculation_policy: "manual_review_required", article: "art. 71-73" },
        article: "art. 71"
      },
      fund_rules: {
        sfpb_employer_pct: 0.245,
        sfpb_employee_pct: 0.06125,
        basis: "SV-loon",
        article: "Fonds-CAO",
        review_notes: "Jaarlijks te controleren via Fonds-CAO bronbewaking"
      },
      allowances: {
        travel_cost_km_rates: [0.16, 0.18, 0.19, 0.21, 0.23, 0.27],
        travel_cost_article: "art. 47 + Bijlage 6",
        meal_allowance: { calculation_policy: "manual_review_required", article: "art. 48" },
        break_allowance: { calculation_policy: "manual_review_required", article: "art. 49" },
        consignment_allowance: { calculation_policy: "manual_review_required", article: "art. 50" },
        dog_allowance: { calculation_policy: "manual_review_required", article: "art. 51" },
        dry_cleaning_allowance: { calculation_policy: "manual_review_required", article: "art. 52" },
        accommodation_allowance: { calculation_policy: "manual_review_required", article: "art. 53" },
        anniversary_allowance: { calculation_policy: "manual_review_required", article: "art. 54" },
        airport_schiphol: { calculation_policy: "manual_review_required", article: "art. 92-98" },
        cash_and_valuables: { calculation_policy: "manual_review_required", article: "art. 99-107" }
      },
      premium_sfpb: 0.061,
      premium_paww_employee: 0.1,
      premium_wga_employee: 0.81,
      premium_awf_employer: 2.64,
      premium_ww_employer_fixed: 0,
      premium_ww_employer_variable: 1.5,
      premium_wia_employer: 0.72,
      premium_wga_employer: 1.5,
      premium_zw_employer: 0,
      pension_base_salary_threshold: 16164,
      pension_premium_rate_total: 24.1,
      pension_premium_employer: 60,
      pension_premium_employee: 40,
      tax_rate_bracket_1: 36.97,
      tax_rate_bracket_2: 36.97,
      tax_rate_bracket_3: 49.5,
      tax_bracket_1_limit: 38098,
      tax_bracket_2_limit: 75518,
      labor_tax_credit_max: 5672,
      notes: 'Loonsverhoging 3,8% per 1 januari 2026. Gecontroleerde loonschalen. Fonds-CAO premies te controleren via bronbewaking.'
    };

    let newConfigRecord;
    if (alreadyPending && body.force) {
      await base44.asServiceRole.entities.CAOConfiguration.update(alreadyPending.id, newConfig);
      newConfigRecord = { id: alreadyPending.id, ...newConfig };
    } else {
      newConfigRecord = await base44.asServiceRole.entities.CAOConfiguration.create(newConfig);
    }

    // Genereer CAOChangeReview records voor vergelijking met actieve config
    const reviewIds = [];
    if (activeCao) {
      // Vergelijk loonschalen
      const changes = [];
      for (const [scale, periods] of Object.entries(WAGE_SCALES_2026)) {
        for (const [period, data] of Object.entries(periods)) {
          const oldRate = activeCao.wage_scales?.[scale]?.[period] || null;
          const newRate = data.hourly_rate;
          if (oldRate !== newRate) {
            changes.push({
              field_path: `wage_scales.${scale}.${period}`,
              old_value: oldRate,
              new_value: newRate,
              risk_level: 'low',
              change_type: oldRate === null ? 'added' : 'changed'
            });
          }
        }
      }

      // Maak bulk reviews voor loonwijzigingen
      const importRunId = body.import_run_id || 'manual_extract';
      for (const change of changes.slice(0, 50)) { // max 50 reviews
        const review = await base44.asServiceRole.entities.CAOChangeReview.create({
          import_run_id: importRunId,
          cao_configuration_id: newConfigRecord.id,
          rule_key: `wage_scale_${change.field_path.replace(/\./g, '_')}`,
          field_path: change.field_path,
          old_value: change.old_value,
          new_value: change.new_value,
          source_document_id: null,
          source_reference: 'Salarisschaal loonperiode 1 2026 (PDF)',
          change_type: change.change_type,
          risk_level: change.risk_level,
          status: 'pending',
          review_notes: `Loonsverhoging 3,8% per loonperiode 1 2026`
        });
        reviewIds.push(review.id);
      }
    }

    return Response.json({
      success: true,
      configuration_id: newConfigRecord.id,
      status: 'pending_review',
      version_label: '2026 loonperiode 1',
      wage_scales_imported: Object.keys(WAGE_SCALES_2026).length,
      pay_periods_imported: PAY_PERIODS_2026.length,
      holidays_imported: HOLIDAYS_2026.length,
      change_reviews_created: reviewIds.length,
      message: 'CAO-configuratie 2026 aangemaakt als concept. Goedkeuring vereist voordat deze actief wordt.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
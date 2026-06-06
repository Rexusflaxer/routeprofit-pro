import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function lazySyncCao(base44, forceCaoSync = false) {
  try {
    const res = await base44.asServiceRole.functions.invoke('syncCaoFromCloudflare', {
      force: forceCaoSync,
      trigger_source: 'lazy_route_cost_calculation',
      sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
    });
    return res?.data || {};
  } catch {
    return { cloudflare_unavailable: true };
  }
}

function isHoliday(dateStr, caoConfig) {
  const holidays = (caoConfig && caoConfig.holidays) ? caoConfig.holidays : [];
  return holidays.some(h => h.date === dateStr);
}

function isNewYearsEveAfter16(date) {
  return date.getMonth() === 11 && date.getDate() === 31 && date.getHours() >= 16;
}

function getSurchargeType(datetime, caoConfig) {
  const date = new Date(datetime);
  const dayOfWeek = date.getDay();
  const hours = date.getHours();
  const dateStr = date.toISOString().split('T')[0];
  if (isNewYearsEveAfter16(date)) return { type: 'new_years_eve', percentage: caoConfig.surcharge_new_years_eve_after_16 || 100 };
  if (isHoliday(dateStr, caoConfig)) return { type: 'holiday', percentage: caoConfig.surcharge_holiday || 50 };
  if (dayOfWeek === 0 || dayOfWeek === 6) return { type: 'weekend', percentage: caoConfig.surcharge_weekend || 35 };
  if (hours >= 0 && hours < 7) return { type: 'night', percentage: caoConfig.surcharge_night || 20 };
  if (hours >= 18) return { type: 'evening', percentage: caoConfig.surcharge_evening || 10 };
  return { type: 'day', percentage: 0 };
}

function getCAOHourlyRate(scale, period, caoConfig) {
  const scaleKey = String(scale);
  const periodKey = String(period);
  if (caoConfig.wage_scales_detailed && caoConfig.wage_scales_detailed[scaleKey]) {
    const entry = caoConfig.wage_scales_detailed[scaleKey][periodKey];
    if (entry && entry.hourly_rate) return entry.hourly_rate;
  }
  if (caoConfig.wage_scales && caoConfig.wage_scales[scaleKey]) {
    const rate = caoConfig.wage_scales[scaleKey][periodKey];
    if (rate !== undefined && rate !== null) return rate;
  }
  return null;
}

function getNextDateForWeekday(routeWeekday) {
  const jsDay = routeWeekday === 7 ? 0 : routeWeekday;
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = jsDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);
  return targetDate.toISOString().split('T')[0];
}

function r2(n) { return Math.round(n * 100) / 100; }
function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(m) {
  const total = ((m % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
function getAbsoluteEndMinutes(startMinutes, endTime) {
  let endMinutes = timeToMinutes(endTime);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes;
}

/**
 * Scope-aware shift cost berekening.
 * @param {object} personnel - Personeelsrecord
 * @param {string} date - Datum (YYYY-MM-DD)
 * @param {string} startTime - Starttijd (HH:MM)
 * @param {string} endTime - Eindtijd (HH:MM)
 * @param {object} caoConfig - Actieve CAO-configuratie
 * @param {object|null} caoScope - Resultaat van resolveCaoApplicability (of null als onbekend)
 */
// Normaliseer CAO-scope: null = fail-closed (unknown_manual_review)
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

// Composite cache fingerprint
function buildRouteCostCacheFingerprint({ route, weekday, caoConfig, personnelList }) {
  return JSON.stringify({
    weekday,
    cao: caoConfig.cloudflare_revision || caoConfig.id,
    route: {
      start: route.time_window_start,
      end: route.time_window_end,
      minutes: route.total_route_minutes,
      alarm: !!route.alarm_standby,
      vehicle_id: route.vehicle_id || null
    },
    personnel: personnelList
      .map(p => ({
        id: p.id,
        updated_date: p.updated_date || null,
        scope: p.cao_scope_profile || null,
        scope_resolved_at: p.cao_applicability_resolved_at || null,
        scale: p.cao_scale || null,
        period: p.cao_period || null,
        custom_rate: p.custom_hourly_rate || null,
        function_group: p.cao_function_group || null,
        function_level: p.cao_function_level || null,
        classification_status: p.cao_function_classification_status || null,
        classification_resolved_at: p.cao_wage_rate_resolved_at || null
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
}

function calculateShiftCost(personnel, date, startTime, endTime, caoConfig, rawScope) {
  const caoScope = normalizeCaoScope(rawScope);
  const startDate = new Date(`${date}T${startTime}:00`);
  let endDate = new Date(`${date}T${endTime}:00`);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  const totalHours = (endDate - startDate) / (1000 * 60 * 60);

  const profile = caoScope.payroll_rule_profile;
  const isScopeUnknown = ['unknown_manual_review', 'mixed_security_work_manual_review'].includes(caoScope.cao_scope_profile);
  // Fail-closed: bijzondere uren ALLEEN als expliciet true en scope niet unknown/mixed
  const applySpecialHours = !isScopeUnknown && (profile.apply_article_40_special_hours === true);
  const applyHolidays = profile.apply_article_41_holidays !== false;
  const applyOvertimeAccrual = !isScopeUnknown && (profile.apply_article_42_overtime === true);

  const scopeWarnings = [];
  if (isScopeUnknown) {
    scopeWarnings.push(`CAO-toepassingsprofiel onzeker (${caoScope.cao_scope_profile}): handmatige review vereist. Bijzondere-urentoeslagen NIET toegepast.`);
  } else if (!applySpecialHours) {
    scopeWarnings.push(`Artikel 3 lid 2 CAO PB (${caoScope.cao_scope_profile}): avond-/nacht-/weekendtoeslagen niet toegepast.`);
  }

  const caoRuleApplication = {
    cao_scope_profile: caoScope.cao_scope_profile,
    applied_article_40_special_hours: applySpecialHours,
    applied_article_41_holidays: applyHolidays,
    applied_article_42_overtime: applyOvertimeAccrual,
    applied_chapter_5_reimbursements: !isScopeUnknown && (profile.apply_chapter_5_reimbursements === true),
    manual_review_required: isScopeUnknown || caoScope.manual_review_required || false,
    source_rule_ids: caoScope.source_rule_ids || []
  };

  if (personnel.employee_type === 'zzp') {
    let zzpRate = personnel.zzp_hourly_rate_excl_vat || 0;
    const dow = startDate.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHolidayDay = isHoliday(date, caoConfig);
    const hrs = startDate.getHours();
    if (isHolidayDay && personnel.zzp_holiday_rate) zzpRate = personnel.zzp_holiday_rate;
    else if (isWeekend && personnel.zzp_weekend_rate) zzpRate = personnel.zzp_weekend_rate;
    else if (hrs < 7 && personnel.zzp_night_rate) zzpRate = personnel.zzp_night_rate;
    else if (hrs >= 18 && personnel.zzp_evening_rate) zzpRate = personnel.zzp_evening_rate;
    const costExclVat = zzpRate * totalHours;
    const vatAmount = costExclVat * 0.21;
    const totalCost = costExclVat + vatAmount;
    return {
      base_hourly_rate: zzpRate, total_hours: totalHours,
      base_salary: r2(costExclVat), surcharges_total: 0, surcharge_details: [],
      total_gross: r2(costExclVat), employer_costs_total: r2(vatAmount),
      employer_costs: { vat_21: r2(vatAmount) },
      accruals_total: 0, accruals: {},
      total_cost_employer: r2(totalCost), cost_per_hour: r2(totalHours > 0 ? totalCost / totalHours : 0),
      cao_scope_profile: caoScope?.cao_scope_profile || null,
      scope_warnings: scopeWarnings,
      cao_rule_application: caoRuleApplication
    };
  }

  // Loondienst — geen fallback naar schaal 3/periodiek 0
  let baseHourlyRate;
  if (personnel.cao === 'cao_particuliere_beveiliging') {
    if (personnel.cao_scale == null || personnel.cao_period == null) {
      throw new Error(`CAO-schaal of periodiek niet ingesteld voor ${personnel.name}. Stel cao_scale en cao_period in.`);
    }
    const rate = getCAOHourlyRate(personnel.cao_scale, personnel.cao_period, caoConfig);
    if (rate === null) {
      throw new Error(`Geen uurloon gevonden voor schaal ${personnel.cao_scale}, periodiek ${personnel.cao_period} in CAO "${caoConfig.version_label || caoConfig.name}".`);
    }
    baseHourlyRate = rate;
  } else {
    baseHourlyRate = personnel.custom_hourly_rate || null;
    if (!baseHourlyRate) {
      throw new Error(`Geen uurloon gevonden voor medewerker ${personnel.name} (geen CAO en geen custom_hourly_rate).`);
    }
  }

  let baseSalary = 0;
  const surchargeAmounts = { evening: 0, night: 0, weekend: 0, holiday: 0, new_years_eve: 0 };

  let cur = new Date(startDate);
  while (cur < endDate) {
    const next = new Date(cur);
    next.setHours(next.getHours() + 1);
    const segHours = next <= endDate ? 1 : (endDate - cur) / (1000 * 60 * 60);
    const surchargeInfo = getSurchargeType(cur, caoConfig);
    let surchargeType = surchargeInfo.type;
    let surchargePercentage = surchargeInfo.percentage;

    // Scope gate: bijzondere uren (art. 40) alleen bij full-security
    if (!applySpecialHours && ['evening', 'night', 'weekend'].includes(surchargeType)) {
      surchargeType = 'day';
      surchargePercentage = 0;
    }
    // Feestdagtoeslag (art. 41): altijd als applyHolidays
    if (!applyHolidays && ['holiday', 'new_years_eve'].includes(surchargeType)) {
      surchargeType = 'day';
      surchargePercentage = 0;
    }
    // Scope onbekend: geen bijzondere uren
    if (isScopeUnknown && surchargeType !== 'day') {
      surchargeType = 'day';
      surchargePercentage = 0;
    }

    baseSalary += baseHourlyRate * segHours;
    if (surchargeType !== 'day') {
      surchargeAmounts[surchargeType] += baseHourlyRate * segHours * (surchargePercentage / 100);
    }
    cur = next;
  }

  const surchargeLabels = {
    evening: 'Avondtoeslag 10%', night: 'Nachttoeslag 20%',
    weekend: 'Weekendtoeslag 35%', holiday: 'Feestdagtoeslag 50%', new_years_eve: 'Oudejaarsdag 100%'
  };
  const surchargeDetails = Object.entries(surchargeAmounts)
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ label: surchargeLabels[type], amount: r2(amount) }));
  const surchargesTotal = Object.values(surchargeAmounts).reduce((a, b) => a + b, 0);
  const totalGross = baseSalary + surchargesTotal;

  const franchisePerPeriod = (caoConfig.pension_base_salary_threshold || 16164) / 13;
  const pensionBase = Math.max(0, totalGross - franchisePerPeriod);
  const totalPensionPremium = pensionBase * ((caoConfig.pension_premium_rate_total || 24.1) / 100);
  const employerPension = totalPensionPremium * ((caoConfig.pension_premium_employer || 60) / 100);
  const premiumAWF = totalGross * ((caoConfig.premium_awf_employer || 2.64) / 100);
  const premiumWW = totalGross * (((caoConfig.premium_ww_employer_fixed || 0) + (caoConfig.premium_ww_employer_variable || 1.5)) / 100);
  const premiumWIA = totalGross * ((caoConfig.premium_wia_employer || 0.72) / 100);
  const premiumWGA = totalGross * ((caoConfig.premium_wga_employer || 1.5) / 100);
  const employerCostsTotal = employerPension + premiumAWF + premiumWW + premiumWIA + premiumWGA;

  const vacationAllowance = totalGross * ((caoConfig.vacation_allowance || 8) / 100);
  const yearEndBonus = totalGross * ((caoConfig.year_end_bonus || 2.01) / 100);
  // ORT-vakantie-reservering: 0 als geen toeslagen toegepast zijn
  const avgOrtPerHour = (totalHours > 0 && surchargesTotal > 0) ? surchargesTotal / totalHours : 0;
  const estimatedAnnualVacationHours = 200;
  const ortVacationReservation = applySpecialHours
    ? (estimatedAnnualVacationHours / 13) * avgOrtPerHour
    : 0;
  const accrualsTotal = vacationAllowance + yearEndBonus + ortVacationReservation;
  const totalCostEmployer = totalGross + employerCostsTotal + accrualsTotal;

  return {
    base_hourly_rate: baseHourlyRate, total_hours: totalHours,
    base_salary: r2(baseSalary), surcharges_total: r2(surchargesTotal), surcharge_details: surchargeDetails,
    total_gross: r2(totalGross),
    employer_costs_total: r2(employerCostsTotal),
    employer_costs: {
      pension_premium: r2(employerPension), premium_awf: r2(premiumAWF),
      premium_ww: r2(premiumWW), premium_wia: r2(premiumWIA), premium_wga: r2(premiumWGA)
    },
    accruals_total: r2(accrualsTotal),
    accruals: {
      vacation_allowance: r2(vacationAllowance),
      year_end_bonus: r2(yearEndBonus),
      ort_vacation_reservation: r2(ortVacationReservation)
    },
    total_cost_employer: r2(totalCostEmployer),
    cost_per_hour: r2(totalHours > 0 ? totalCostEmployer / totalHours : 0),
    cao_scope_profile: caoScope?.cao_scope_profile || null,
    scope_warnings: scopeWarnings,
    cao_rule_application: caoRuleApplication
  };
}

// Cache-key bevat revision, scope_profile en updated_date om stale scope te vermijden
function buildCacheKey(weekday, caoConfig, personnel) {
  const revision = caoConfig?.cloudflare_revision || caoConfig?.id || 'unknown';
  const scope = personnel?.cao_scope_profile || 'unknown';
  const updated = personnel?.updated_date || personnel?.cao_applicability_resolved_at || '';
  return `${weekday}_${revision}_${scope}_${updated.slice(0, 10)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { route_id, weekday, force_recalculate, force_cao_sync } = await req.json();

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

    if (!route_id) return Response.json({ error: 'route_id is required' }, { status: 400 });

    const routes = await base44.entities.Route.list();
    const route = routes.find(r => r.id === route_id);
    if (!route) return Response.json({ error: 'Route not found' }, { status: 404 });

    const targetWeekday = weekday || route.weekdays?.[0] || 1;
    const shiftDate = getNextDateForWeekday(targetWeekday);

    const shiftDateRef = new Date(shiftDate);
    const allCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({ status: 'active' });
    const eligibleCaos = allCaos.filter(c => {
      if (c.valid_from && new Date(c.valid_from) > shiftDateRef) return false;
      if (c.valid_until && new Date(c.valid_until) < shiftDateRef) return false;
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
        error: `Geen actieve CAO-configuratie gevonden voor datum ${shiftDate}. Activeer eerst een CAO-configuratie.`
      }, { status: 400 });
    }

    const allPersonnel = await base44.entities.Personnel.list();
    const surveillants = allPersonnel.filter(p => p.function_type === 'surveillant' && p.is_active !== false);
    const binnendienst = allPersonnel.filter(p => p.function_type === 'binnendienst' && p.is_active !== false);

    if (surveillants.length === 0) {
      return Response.json({ error: 'Geen actieve surveillanten gevonden' }, { status: 404 });
    }

    // Cache-check na laden van personeel (fingerprint vereist personnelList)
    // Wordt later gedaan nadat personnelList beschikbaar is

    const startTime = route.time_window_start || '08:00';
    const plannedEndTime = route.time_window_end || '17:00';
    let endTime = plannedEndTime;
    let actualShiftNote = null;

    if (!route.alarm_standby) {
      const routeStartMinutes = timeToMinutes(startTime);
      const plannedEndMinutes = getAbsoluteEndMinutes(routeStartMinutes, plannedEndTime);
      const plannedWindowMinutes = plannedEndMinutes - routeStartMinutes;
      const routeDuration = route.total_route_minutes || plannedWindowMinutes;
      const actualEndMinutes = routeStartMinutes + routeDuration;

      if (actualEndMinutes < plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route eindigt ${plannedEndMinutes - actualEndMinutes} min eerder dan gepland (${endTime} i.p.v. ${plannedEndTime})`;
      } else if (actualEndMinutes > plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route loopt ${actualEndMinutes - plannedEndMinutes} min uit (${endTime} i.p.v. ${plannedEndTime})`;
      }
    }

    // ── Fingerprint-gebaseerde cache check (na laden personeel) ──
    const allPersonnelForCache = [...surveillants, ...binnendienst];
    const fingerprint = buildRouteCostCacheFingerprint({
      route, weekday: targetWeekday, caoConfig, personnelList: allPersonnelForCache
    });
    const cacheKey = `${targetWeekday}`;
    if (!force_recalculate && route.cached_personnel_costs?.[cacheKey]) {
      const cached = route.cached_personnel_costs[cacheKey];
      if (cached._cache_fingerprint === fingerprint) {
        return Response.json(cached);
      }
    }

    // Resolve CAO-scope per medewerker (parallel voor surveillanten)
    const scopePromises = surveillants.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id: p.id })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );
    const binnendienstScopePromises = binnendienst.map(p =>
      base44.asServiceRole.functions.invoke('resolveCaoApplicability', { personnel_id: p.id })
        .then(r => ({ id: p.id, scope: r?.data || null }))
        .catch(() => ({ id: p.id, scope: null }))
    );

    const [scopeResults, binnendienstScopeResults] = await Promise.all([
      Promise.all(scopePromises),
      Promise.all(binnendienstScopePromises)
    ]);
    const scopeById = {};
    for (const s of scopeResults) scopeById[s.id] = s.scope;
    for (const s of binnendienstScopeResults) scopeById[s.id] = s.scope;

    const results = surveillants.map(p => {
      const scope = scopeById[p.id] || null;
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, scope);
      return {
        personnel_id: p.id, name: p.name,
        employee_type: p.employee_type, contract_type: p.contract_type,
        cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
        ...cost
      };
    });

    results.sort((a, b) => b.total_cost_employer - a.total_cost_employer);

    const count = results.length;
    const mostExpensive = results[0];
    const cheapest = results[results.length - 1];
    const average = {
      total_cost_employer: r2(results.reduce((s, r) => s + r.total_cost_employer, 0) / count),
      cost_per_hour: r2(results.reduce((s, r) => s + r.cost_per_hour, 0) / count),
      total_hours: results[0]?.total_hours || 0,
      base_salary: r2(results.reduce((s, r) => s + r.base_salary, 0) / count),
      surcharges_total: r2(results.reduce((s, r) => s + r.surcharges_total, 0) / count),
      total_gross: r2(results.reduce((s, r) => s + r.total_gross, 0) / count),
      employer_costs_total: r2(results.reduce((s, r) => s + r.employer_costs_total, 0) / count),
      accruals_total: r2(results.reduce((s, r) => s + r.accruals_total, 0) / count),
      count
    };

    // Voertuigkosten
    let vehicleCosts = null;
    if (route.vehicle_id) {
      const vehicles = await base44.entities.Vehicle.list();
      const vehicle = vehicles.find(v => v.id === route.vehicle_id);
      if (vehicle) {
        const routesWithVehicle = routes.filter(r => r.vehicle_id === route.vehicle_id);
        const totalServicesPerWeek = routesWithVehicle.reduce((sum, r) => sum + (r.weekdays?.length || 1), 0);
        const totalServicesPerYear = totalServicesPerWeek * 52;
        let depreciationPerYear = 0, depreciationLabel = '';
        if (vehicle.acquisition_type === 'lease' || vehicle.acquisition_type === 'private_lease') {
          depreciationPerYear = (vehicle.monthly_lease_cost || 0) * 12;
          depreciationLabel = `Leasekosten (€${(vehicle.monthly_lease_cost || 0).toFixed(2)}/mnd × 12)`;
        } else if (vehicle.acquisition_type === 'banklening') {
          depreciationPerYear = (vehicle.monthly_loan_payment || 0) * 12;
          depreciationLabel = `Aflossing banklening (€${(vehicle.monthly_loan_payment || 0).toFixed(2)}/mnd × 12)`;
        } else {
          const purchase = vehicle.purchase_price || 0, residual = vehicle.residual_value || 0, years = vehicle.depreciation_years || 5;
          depreciationPerYear = (purchase - residual) / years;
          depreciationLabel = `Afschrijving ((€${purchase.toFixed(2)} - €${residual.toFixed(2)}) / ${years} jaar)`;
        }
        const kmPerService = route.total_distance_km || 0;
        const fuelCostPerService = kmPerService * (vehicle.fuel_cost_per_km || 0);
        let maintenanceCostPerService = 0, maintenanceCostPerYear = 0;
        if (vehicle.maintenance_type === 'per_km') { maintenanceCostPerService = kmPerService * (vehicle.maintenance_cost || 0); maintenanceCostPerYear = maintenanceCostPerService * totalServicesPerYear; }
        else if (vehicle.maintenance_type === 'per_year') { maintenanceCostPerYear = vehicle.maintenance_cost || 0; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.maintenance_type === 'per_month') { maintenanceCostPerYear = (vehicle.maintenance_cost || 0) * 12; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.maintenance_type === 'per_quarter') { maintenanceCostPerYear = (vehicle.maintenance_cost || 0) * 4; maintenanceCostPerService = totalServicesPerYear > 0 ? maintenanceCostPerYear / totalServicesPerYear : 0; }
        let tireCostPerService = 0, tireCostPerYear = 0;
        if (vehicle.tire_type === 'per_km') { tireCostPerService = kmPerService * (vehicle.tire_cost || 0); tireCostPerYear = tireCostPerService * totalServicesPerYear; }
        else if (vehicle.tire_type === 'per_year') { tireCostPerYear = vehicle.tire_cost || 0; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.tire_type === 'per_month') { tireCostPerYear = (vehicle.tire_cost || 0) * 12; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        else if (vehicle.tire_type === 'per_quarter') { tireCostPerYear = (vehicle.tire_cost || 0) * 4; tireCostPerService = totalServicesPerYear > 0 ? tireCostPerYear / totalServicesPerYear : 0; }
        const insurancePerYear = (vehicle.insurance_per_month || 0) * 12;
        const insuranceCostPerService = totalServicesPerYear > 0 ? insurancePerYear / totalServicesPerYear : 0;
        const depreciationPerService = totalServicesPerYear > 0 ? depreciationPerYear / totalServicesPerYear : 0;
        const totalPerService = r2(depreciationPerService + fuelCostPerService + maintenanceCostPerService + tireCostPerService + insuranceCostPerService);
        vehicleCosts = {
          vehicle_id: vehicle.id,
          vehicle_label: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.license_plate})`.trim(),
          acquisition_type: vehicle.acquisition_type,
          km_per_service: r2(kmPerService),
          total_services_per_week: totalServicesPerWeek,
          total_services_per_year: totalServicesPerYear,
          routes_with_vehicle: routesWithVehicle.length,
          depreciation_per_year: r2(depreciationPerYear),
          depreciation_label: depreciationLabel,
          depreciation_per_service: r2(depreciationPerService),
          fuel_cost_per_service: r2(fuelCostPerService),
          fuel_cost_per_km: vehicle.fuel_cost_per_km || 0,
          maintenance_cost_per_service: r2(maintenanceCostPerService),
          tire_cost_per_service: r2(tireCostPerService),
          insurance_per_year: r2(insurancePerYear),
          insurance_per_service: r2(insuranceCostPerService),
          total_per_service: totalPerService
        };
      }
    }

    const binnendienstResults = binnendienst.map(p => {
      const scope = scopeById[p.id] || null;
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig, scope);
      return {
        personnel_id: p.id, name: p.name,
        employee_type: p.employee_type, contract_type: p.contract_type,
        cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
        ...cost
      };
    });

    const resultPayload = {
      shift_date: shiftDate, weekday: targetWeekday,
      start_time: startTime, end_time: endTime,
      planned_end_time: plannedEndTime,
      alarm_standby: !!route.alarm_standby,
      actual_shift_note: actualShiftNote,
      total_surveillants: count,
      most_expensive: mostExpensive, cheapest, average,
      all_personnel: results,
      binnendienst: binnendienstResults,
      vehicle_costs: vehicleCosts,
      cao_sync_status: caoSyncStatus,
      calculation_warnings: syncWarnings,
      _cache_revision: caoConfig.cloudflare_revision || null,
      _cache_fingerprint: fingerprint
    };

    const existingCache = route.cached_personnel_costs || {};
    existingCache[cacheKey] = resultPayload;
    await base44.entities.Route.update(route_id, {
      cached_personnel_costs: existingCache,
      personnel_costs_calculated_at: new Date().toISOString()
    });

    return Response.json(resultPayload);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
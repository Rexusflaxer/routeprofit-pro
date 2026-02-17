import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const HOLIDAYS_2025 = ['2025-01-01', '2025-04-20', '2025-04-21', '2025-04-27', '2025-05-29', '2025-06-08', '2025-06-09', '2025-12-25', '2025-12-26'];
const HOLIDAYS_2026 = ['2026-01-01', '2026-04-05', '2026-04-06', '2026-04-27', '2026-05-14', '2026-05-24', '2026-05-25', '2026-12-25', '2026-12-26'];

function isHoliday(dateStr) {
  return HOLIDAYS_2025.includes(dateStr) || HOLIDAYS_2026.includes(dateStr);
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
  if (isHoliday(dateStr)) return { type: 'holiday', percentage: caoConfig.surcharge_holiday || 50 };
  if (dayOfWeek === 0 || dayOfWeek === 6) return { type: 'weekend', percentage: caoConfig.surcharge_weekend || 35 };
  if (hours >= 0 && hours < 7) return { type: 'night', percentage: caoConfig.surcharge_night || 20 };
  if (hours >= 18) return { type: 'evening', percentage: caoConfig.surcharge_evening || 10 };
  return { type: 'day', percentage: 0 };
}

function getCAOHourlyRate(scale, period, caoConfig) {
  const scaleKey = String(scale);
  const periodKey = String(period);
  if (caoConfig.wage_scales && caoConfig.wage_scales[scaleKey]) {
    return caoConfig.wage_scales[scaleKey][periodKey] || caoConfig.wage_scales[scaleKey]['0'] || 16.02;
  }
  return 16.02;
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
function minutesToTime(m) { const h = Math.floor(m / 60); const min = m % 60; return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`; }

function calculateShiftCost(personnel, date, startTime, endTime, caoConfig) {
  const startDate = new Date(`${date}T${startTime}:00`);
  let endDate = new Date(`${date}T${endTime}:00`);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  const totalHours = (endDate - startDate) / (1000 * 60 * 60);

  if (personnel.employee_type === 'zzp') {
    let zzpRate = personnel.zzp_hourly_rate_excl_vat || 0;
    const dow = startDate.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHolidayDay = isHoliday(date);
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
      total_cost_employer: r2(totalCost), cost_per_hour: r2(totalHours > 0 ? totalCost / totalHours : 0)
    };
  }

  // Loondienst
  const baseHourlyRate = personnel.cao === 'cao_particuliere_beveiliging'
    ? getCAOHourlyRate(personnel.cao_scale || 3, personnel.cao_period || 0, caoConfig)
    : (personnel.custom_hourly_rate || 16);

  let baseSalary = 0;
  const surchargeAmounts = { evening: 0, night: 0, weekend: 0, holiday: 0, new_years_eve: 0 };

  let cur = new Date(startDate);
  while (cur < endDate) {
    const next = new Date(cur);
    next.setHours(next.getHours() + 1);
    const segHours = next <= endDate ? 1 : (endDate - cur) / (1000 * 60 * 60);
    const surcharge = getSurchargeType(cur, caoConfig);
    baseSalary += baseHourlyRate * segHours;
    if (surcharge.type !== 'day') {
      surchargeAmounts[surcharge.type] += baseHourlyRate * segHours * (surcharge.percentage / 100);
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
  const accrualsTotal = vacationAllowance + yearEndBonus;

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
    accruals: { vacation_allowance: r2(vacationAllowance), year_end_bonus: r2(yearEndBonus) },
    total_cost_employer: r2(totalCostEmployer),
    cost_per_hour: r2(totalHours > 0 ? totalCostEmployer / totalHours : 0)
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { route_id, weekday } = await req.json();
    if (!route_id) return Response.json({ error: 'route_id is required' }, { status: 400 });

    const routes = await base44.entities.Route.list();
    const route = routes.find(r => r.id === route_id);
    if (!route) return Response.json({ error: 'Route not found' }, { status: 404 });

    const targetWeekday = weekday || route.weekdays?.[0] || 1;
    const shiftDate = getNextDateForWeekday(targetWeekday);
    const startTime = route.time_window_start || '08:00';
    const plannedEndTime = route.time_window_end || '17:00';

    // Als alarmdienst aan staat loopt de dienst altijd door tot time_window_end.
    // Anders: bereken de werkelijke routeduur via optimizeRoute-logica (via opgeslagen total_route_time).
    // We benaderen de werkelijke eindtijd op basis van de opgeslagen total_route_minutes of
    // de optimalisatieberekening. Voor kostenberekening gebruiken we de werkelijke diensttijd.
    let endTime = plannedEndTime;
    let actualShiftNote = null;

    if (!route.alarm_standby) {
      // Dienst eindigt op basis van werkelijke routetijd
      const routeStartMinutes = timeToMinutes(startTime);
      // Gebruik opgeslagen total_route_minutes als beschikbaar, anders planned window
      const routeDuration = route.total_route_minutes || 
        (timeToMinutes(plannedEndTime) - routeStartMinutes);
      const actualEndMinutes = routeStartMinutes + routeDuration;
      const plannedEndMinutes = timeToMinutes(plannedEndTime);
      
      if (actualEndMinutes < plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route eindigt ${plannedEndMinutes - actualEndMinutes} min eerder dan gepland (${endTime} i.p.v. ${plannedEndTime})`;
      } else if (actualEndMinutes > plannedEndMinutes) {
        endTime = minutesToTime(actualEndMinutes);
        actualShiftNote = `Route loopt ${actualEndMinutes - plannedEndMinutes} min uit (${endTime} i.p.v. ${plannedEndTime})`;
      }
    }

    const allPersonnel = await base44.entities.Personnel.list();
    const surveillants = allPersonnel.filter(p => p.function_type === 'surveillant' && p.is_active !== false);

    if (surveillants.length === 0) {
      return Response.json({ error: 'Geen actieve surveillanten gevonden' }, { status: 404 });
    }

    const caoConfigList = await base44.entities.CAOConfiguration.list('-created_date', 1);
    const caoConfig = caoConfigList[0] || {
      surcharge_weekend: 35, surcharge_night: 20, surcharge_evening: 10,
      surcharge_holiday: 50, surcharge_new_years_eve_after_16: 100,
      vacation_allowance: 8, year_end_bonus: 2.01, pension_premium_rate_total: 24.1,
      pension_premium_employer: 60, pension_base_salary_threshold: 16164,
      premium_awf_employer: 2.64, premium_ww_employer_fixed: 0, premium_ww_employer_variable: 1.5,
      premium_wia_employer: 0.72, premium_wga_employer: 1.5, wage_scales: {}
    };

    const results = surveillants.map(p => {
      const cost = calculateShiftCost(p, shiftDate, startTime, endTime, caoConfig);
      return {
        personnel_id: p.id, name: p.name,
        employee_type: p.employee_type, contract_type: p.contract_type,
        cao: p.cao, cao_scale: p.cao_scale, cao_period: p.cao_period,
        ...cost
      };
    });

    results.sort((a, b) => b.total_cost_employer - a.total_cost_employer);

    const mostExpensive = results[0];
    const cheapest = results[results.length - 1];
    const count = results.length;

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

    return Response.json({
      shift_date: shiftDate, weekday: targetWeekday,
      start_time: startTime, end_time: endTime,
      total_surveillants: count,
      most_expensive: mostExpensive, cheapest, average,
      all_personnel: results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
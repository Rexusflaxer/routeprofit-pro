import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CAO Particuliere Beveiliging - Toeslagberekening
// Artikel 40: Toeslag bijzondere uren
// - 35%: zaterdag 00:00 - zondag 24:00
// - 20%: maandag t/m vrijdag 00:00 - 07:00
// - 10%: maandag t/m vrijdag 18:00 - 24:00
// - 100%: oudejaarsdag na 16:00
// Artikel 41: Feestdagentoeslag 50%

const HOLIDAYS_2025 = ['2025-01-01', '2025-04-20', '2025-04-21', '2025-04-27', '2025-05-29', '2025-06-08', '2025-06-09', '2025-12-25', '2025-12-26'];
const HOLIDAYS_2026 = ['2026-01-01', '2026-04-05', '2026-04-06', '2026-04-27', '2026-05-14', '2026-05-24', '2026-05-25', '2026-12-25', '2026-12-26'];

function isHoliday(dateStr) {
  return HOLIDAYS_2025.includes(dateStr) || HOLIDAYS_2026.includes(dateStr);
}

function isNewYearsEveAfter16(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  return month === 12 && day === 31 && hours >= 16;
}

function getSurcharge(datetime, caoConfig) {
  const date = new Date(datetime);
  const dayOfWeek = date.getDay(); // 0=zondag, 6=zaterdag
  const hours = date.getHours();
  const dateStr = date.toISOString().split('T')[0];

  // Oudejaarsdag na 16:00 (hoogste toeslag)
  if (isNewYearsEveAfter16(date)) {
    return caoConfig.surcharge_new_years_eve_after_16 || 100;
  }

  // Feestdagen (50%)
  if (isHoliday(dateStr)) {
    return caoConfig.surcharge_holiday || 50;
  }

  // Weekend (zaterdag 00:00 - zondag 24:00) = 35%
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return caoConfig.surcharge_weekend || 35;
  }

  // Nacht ma-vr 00:00 - 07:00 = 20%
  if (hours >= 0 && hours < 7) {
    return caoConfig.surcharge_night || 20;
  }

  // Avond ma-vr 18:00 - 24:00 = 10%
  if (hours >= 18) {
    return caoConfig.surcharge_evening || 10;
  }

  // Dag = 0%
  return 0;
}

function getCAOHourlyRate(scale, period, caoConfig) {
  const scaleKey = String(scale);
  const periodKey = String(period);
  
  if (caoConfig.wage_scales && caoConfig.wage_scales[scaleKey]) {
    return caoConfig.wage_scales[scaleKey][periodKey] || caoConfig.wage_scales[scaleKey]['0'] || 16.02;
  }
  
  return 16.02; // Fallback naar schaal 2, periode 0
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { personnel_id, work_schedule } = await req.json();
    
    // work_schedule format: [{ date: "2025-01-15", start_time: "08:00", end_time: "17:00" }, ...]
    
    if (!personnel_id || !work_schedule || !Array.isArray(work_schedule)) {
      return Response.json({ error: 'personnel_id en work_schedule zijn verplicht' }, { status: 400 });
    }

    // Haal medewerker op
    const personnel = await base44.entities.Personnel.get(personnel_id);
    
    // Haal CAO configuratie op (neem de eerste/meest recente)
    const caoConfigs = await base44.entities.CAOConfiguration.list('-created_date', 1);
    const caoConfig = caoConfigs[0] || {
      surcharge_weekend: 35,
      surcharge_night: 20,
      surcharge_evening: 10,
      surcharge_holiday: 50,
      surcharge_new_years_eve_after_16: 100,
      vacation_allowance: 8,
      year_end_bonus: 2.01,
      employer_costs_base: 25,
      wage_scales: {}
    };

    let totalCosts = 0;
    let totalHours = 0;
    let breakdown = {
      base_wage: 0,
      surcharges: 0,
      vacation_allowance: 0,
      year_end_bonus: 0,
      employer_costs: 0,
      total: 0,
      details: []
    };

    // Bereken per werkdag
    for (const shift of work_schedule) {
      const { date, start_time, end_time } = shift;
      
      // Parse start en eind tijden
      const [startHour, startMin] = start_time.split(':').map(Number);
      const [endHour, endMin] = end_time.split(':').map(Number);
      
      const startDate = new Date(`${date}T${start_time}:00`);
      const endDate = new Date(`${date}T${end_time}:00`);
      
      // Bereken uren
      let hoursWorked = (endDate - startDate) / (1000 * 60 * 60);
      if (hoursWorked < 0) hoursWorked += 24; // Overnight shift
      
      totalHours += hoursWorked;

      // Bepaal basis uurloon
      let baseHourlyRate = 0;
      
      if (personnel.employee_type === 'zzp') {
        // ZZP: gebruik opgegeven tarieven
        baseHourlyRate = personnel.zzp_hourly_rate_excl_vat || 0;
        
        // Bepaal welk ZZP tarief van toepassing is
        const dayOfWeek = startDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHolidayDay = isHoliday(date);
        const hours = startDate.getHours();
        const isNight = hours >= 0 && hours < 7;
        const isEvening = hours >= 18;
        
        if (isHolidayDay && personnel.zzp_holiday_rate) {
          baseHourlyRate = personnel.zzp_holiday_rate;
        } else if (isWeekend && personnel.zzp_weekend_rate) {
          baseHourlyRate = personnel.zzp_weekend_rate;
        } else if (isNight && personnel.zzp_night_rate) {
          baseHourlyRate = personnel.zzp_night_rate;
        } else if (isEvening && personnel.zzp_evening_rate) {
          baseHourlyRate = personnel.zzp_evening_rate;
        }
        
        // ZZP: geen extra toeslagen, BTW zit er niet bij
        const hourCost = baseHourlyRate * 1.21; // + BTW
        breakdown.base_wage += hourCost * hoursWorked;
        
        breakdown.details.push({
          date,
          hours: hoursWorked,
          rate_excl_vat: baseHourlyRate,
          rate_incl_vat: hourCost,
          type: 'zzp',
          cost: hourCost * hoursWorked
        });
        
      } else {
        // Loondienst: CAO of eigen tarief
        if (personnel.cao === 'cao_particuliere_beveiliging') {
          baseHourlyRate = getCAOHourlyRate(personnel.cao_scale || 3, personnel.cao_period || 0, caoConfig);
        } else {
          baseHourlyRate = personnel.custom_hourly_rate || 16;
        }
        
        // Bereken gemiddelde toeslag voor deze shift (vereenvoudigd)
        const avgSurcharge = getSurcharge(startDate, caoConfig);
        
        const grossWage = baseHourlyRate * hoursWorked;
        const surchargeAmount = grossWage * (avgSurcharge / 100);
        const vacationAllowance = (grossWage + surchargeAmount) * (caoConfig.vacation_allowance / 100);
        const yearEndBonus = (grossWage + surchargeAmount) * (caoConfig.year_end_bonus / 100);
        const employerCosts = (grossWage + surchargeAmount + vacationAllowance + yearEndBonus) * (caoConfig.employer_costs_base / 100);
        
        const totalShiftCost = grossWage + surchargeAmount + vacationAllowance + yearEndBonus + employerCosts;
        
        breakdown.base_wage += grossWage;
        breakdown.surcharges += surchargeAmount;
        breakdown.vacation_allowance += vacationAllowance;
        breakdown.year_end_bonus += yearEndBonus;
        breakdown.employer_costs += employerCosts;
        
        breakdown.details.push({
          date,
          hours: hoursWorked,
          base_rate: baseHourlyRate,
          surcharge_pct: avgSurcharge,
          gross_wage: grossWage,
          surcharge: surchargeAmount,
          vacation: vacationAllowance,
          bonus: yearEndBonus,
          employer: employerCosts,
          total: totalShiftCost
        });
      }
    }

    // Totaal
    if (personnel.employee_type === 'zzp') {
      breakdown.total = breakdown.base_wage;
    } else {
      breakdown.total = breakdown.base_wage + breakdown.surcharges + breakdown.vacation_allowance + breakdown.year_end_bonus + breakdown.employer_costs;
    }

    return Response.json({
      personnel_id,
      personnel_name: personnel.name,
      employee_type: personnel.employee_type,
      total_hours: totalHours,
      total_costs: breakdown.total,
      avg_cost_per_hour: totalHours > 0 ? breakdown.total / totalHours : 0,
      breakdown
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
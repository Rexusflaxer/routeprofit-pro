import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadFunctionModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  let code = fs.readFileSync(absolutePath, 'utf8');
  code = code.replace(/^import[^\n]+\n/, '');
  code = code.split('\nDeno.serve')[0];
  const context = { console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: relativePath });
  return context;
}

const schedule = loadFunctionModule('base44/functions/validateCaoScheduleRules/entry.ts');
const taskContext = loadFunctionModule('base44/functions/validateTaskPlanningContext/entry.ts');
const contractResolver = loadFunctionModule('base44/functions/resolvePersonnelContractForService/entry.ts');
const contractRules = loadFunctionModule('base44/functions/applyCaoContractRules/entry.ts');
const correctionQueue = loadFunctionModule('base44/functions/queueCaoPayrollCorrections/entry.ts');
const reimbursements = loadFunctionModule('base44/functions/calculateCaoReimbursements/entry.ts');
const leaveSickness = loadFunctionModule('base44/functions/calculateCaoLeaveAndSickness/entry.ts');
const yearEndBonus = loadFunctionModule('base44/functions/calculateCaoYearEndBonus/entry.ts');
const personnelCosts = loadFunctionModule('base44/functions/calculatePersonnelCosts/entry.ts');
const functionClassification = loadFunctionModule('base44/functions/resolveCaoFunctionClassification/entry.ts');

function assertIncludes(values, expected, message) {
  assert.ok(values.includes(expected), `${message}: expected ${expected} in ${JSON.stringify(values)}`);
}

function assertAlmostEqual(actual, expected, message) {
  assert.equal(Math.round(Number(actual) * 100) / 100, expected, message);
}

function assertCleanBooleanField(value, expected, field) {
  assert.equal(value, expected, `${field} should remain ${expected}, not be dropped as an empty value`);
}

function runExternalCaoGateScenarios() {
  const signals = schedule.collectInlineExternalCaoSignals([
    { function_type: 'verkeersregelaar' },
    { service_context: { service_function_type: 'veiligheidsdomein toezichthouder' } },
    { works_event_or_hospitality_security: true, event_hospitality_cao_applies: true }
  ], {});
  const keys = signals.map(signal => signal.cao_key).filter(Boolean);
  assertIncludes(keys, 'cao_verkeersregelaars', 'Traffic-controller CAO signal missing');
  assertIncludes(keys, 'cao_veiligheidsdomein', 'Safety-domain CAO signal missing');
  assertIncludes(keys, 'cao_evenementen_horecabeveiliging', 'Event/hospitality CAO signal missing');

  const trafficSignal = schedule.collectInlineExternalCaoSignals([{ function_type: 'verkeersregelaar' }], {});
  const mismatchGate = schedule.buildExternalCaoScopeGate({
    targetCaoKey: 'cao_particuliere_beveiliging',
    signals: trafficSignal
  });
  assert.equal(mismatchGate.passed, false, 'PB schedule validation must block when service context points to traffic-controller CAO');
  assert.equal(mismatchGate.status, 'blocked_cao_scope_signal_mismatch');

  const supportedPb = schedule.getCaoRuntimeSupport('cao_particuliere_beveiliging', 'validateCaoScheduleRules');
  const unsupportedTraffic = schedule.getCaoRuntimeSupport('cao_verkeersregelaars', 'validateCaoScheduleRules');
  assert.equal(supportedPb.supported, true, 'PB runtime should remain supported');
  assert.equal(unsupportedTraffic.supported, false, 'Traffic-controller runtime must fail closed until implemented');
}

function runPlanningContextScenarios() {
  const nonSecurityService = taskContext.buildServiceContext({
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      function_type: 'klantrelatie',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable'
    },
    task: null,
    object: null,
    route: null
  });
  const readiness = taskContext.evaluateServiceContextReadiness(nonSecurityService);
  assert.equal(nonSecurityService.function_type, 'klantrelatie');
  assertCleanBooleanField(nonSecurityService.performs_security_work, false, 'planning_context.performs_security_work');
  assert.equal(nonSecurityService.security_work_percentage, 0);
  assert.equal(readiness.status, 'planning_context_ready');
  assert.equal(readiness.ready, true);

  const trafficService = taskContext.buildServiceContext({
    body: {
      company_id: 'company-a',
      function_type: 'verkeersregelaar',
      performs_security_work: true,
      security_work_percentage: 100
    },
    task: null,
    object: null,
    route: null
  });
  const trafficReadiness = taskContext.evaluateServiceContextReadiness(trafficService);
  assert.equal(trafficService.cao_key, 'cao_verkeersregelaars');
  assert.equal(trafficReadiness.status, 'manual_review_required');
  assert.ok(
    trafficReadiness.manual_review_reasons.some(reason => reason.includes('cao_verkeersregelaars')),
    'Unsupported inferred traffic-controller CAO must force manual review'
  );
}

function runContractResolverScenarios() {
  const serviceContext = contractResolver.inferServiceContext({
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      function_type: 'klantrelatie',
      cao_function_group: 'non_security_staff',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable',
      contract_assignment_policy: 'strict_contract_match'
    },
    task: null,
    route: null,
    object: null
  });
  const readiness = contractResolver.evaluateServiceContextReadiness(serviceContext);
  assert.equal(readiness.status, 'planning_context_ready');
  assertCleanBooleanField(serviceContext.performs_security_work, false, 'resolver.serviceContext.performs_security_work');

  const nonSecurityContract = {
    function_type: 'klantrelatie',
    allowed_function_types: ['klantrelatie'],
    cao_function_group: 'non_security_staff',
    allowed_cao_function_groups: ['non_security_staff'],
    security_role_status: 'not_applicable',
    allowed_security_role_statuses: ['not_applicable'],
    performs_security_work: false,
    security_work_percentage: 0,
    cao_scope_profile: 'non_security_work_article_3_exception'
  };
  const functionMatch = contractResolver.evaluateFunctionMatch(nonSecurityContract, serviceContext);
  const securityScopeMatch = contractResolver.evaluateSecurityScopeMatch(nonSecurityContract, serviceContext);
  assert.equal(functionMatch.matched, true, 'Non-security service should match non-security contract function scope');
  assert.equal(securityScopeMatch.matched, true, 'Non-security service should match article 3 non-security contract scope');

  const securityOnlyContract = {
    function_type: 'objectbeveiliger',
    allowed_function_types: ['objectbeveiliger'],
    cao_function_group: 'objectbeveiliger_receptionist',
    allowed_cao_function_groups: ['objectbeveiliger_receptionist'],
    security_role_status: 'beveiliger',
    allowed_security_role_statuses: ['beveiliger'],
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scope_profile: 'full_security_worker'
  };
  const blockedScope = contractResolver.evaluateSecurityScopeMatch(securityOnlyContract, serviceContext);
  assert.equal(blockedScope.matched, false, 'Non-security service must not match security-only contract');
  assert.ok(blockedScope.blocking_checks.length > 0, 'Security-only mismatch should be blocking, not merely advisory');
}

async function runContractScopePersistenceScenarios() {
  const result = await contractRules.evaluateContractBasis({ asServiceRole: { entities: {} } }, {
    body: {
      company_id: 'company-a',
      cao_key: 'cao_particuliere_beveiliging',
      contract_form: 'bepaalde_tijd',
      contract_start_date: '2026-01-01',
      contract_end_date: '2026-08-01',
      function_type: 'klantrelatie',
      cao_function_group: 'non_security_staff',
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: 'not_applicable',
      allowed_function_types: ['klantrelatie'],
      allowed_cao_function_groups: ['non_security_staff'],
      allowed_security_role_statuses: ['not_applicable'],
      contract_assignment_policy: 'strict_contract_match'
    },
    personnel: {},
    contract: {},
    targetCaoKey: null
  });
  const update = result.recommended_contract_update || {};
  assert.equal(update.function_type, 'klantrelatie');
  assert.equal(update.cao_function_group, 'non_security_staff');
  assertCleanBooleanField(update.performs_security_work, false, 'recommended_contract_update.performs_security_work');
  assert.equal(update.security_work_percentage, 0);
  assert.equal(update.security_role_status, 'not_applicable');
  assertIncludes(update.allowed_security_role_statuses || [], 'not_applicable', 'not_applicable must be persisted as non-security proof');

  const persistence = contractRules.buildContractRulePersistence({
    contract_basis: result,
    recommended_contract_update: update,
    contract_final_allowed: result.contract_final_allowed,
    payroll_final_allowed: result.payroll_final_allowed,
    source_rule_ids: result.source_rule_ids || []
  });
  assert.equal(persistence.function_type, 'klantrelatie');
  assertCleanBooleanField(persistence.performs_security_work, false, 'persistence.performs_security_work');
  assert.equal(persistence.security_role_status, 'not_applicable');
}

function runProbationScenarios() {
  const fullSecurityScope = {
    cao_scope_profile: 'full_security_worker',
    applies_full_security_rules: true,
    manual_review_required: false,
    payroll_rule_profile: {
      apply_article_40_special_hours: true,
      apply_article_41_holidays: true,
      apply_article_42_overtime: true
    }
  };

  const sevenMonthFixedTerm = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 1,
    security_role_status: 'beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a'
  }, fullSecurityScope);
  assert.equal(sevenMonthFixedTerm.probation_period_months, 1, 'Fixed-term contract longer than 6 months should get 1 month probation');
  assert.equal(sevenMonthFixedTerm.probation_compliant, true);
  assertIncludes(sevenMonthFixedTerm.source_rule_ids, 'CAO-PB-2024-R0315', 'Fixed-term probation source rule missing');

  const aspirantSevenMonth = contractRules.calculateProbationPeriod({
    contract_form: 'bepaalde_tijd',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-08-01',
    requested_probation_period_months: 2,
    security_role_status: 'aspirant_beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'aspirant'
  }, fullSecurityScope);
  assert.equal(aspirantSevenMonth.probation_period_months, 2, 'Aspirant security worker longer than 6 months should get 2 months probation');
  assert.equal(aspirantSevenMonth.probation_compliant, true);
  assertIncludes(aspirantSevenMonth.source_rule_ids, 'CAO-PB-2024-R0317', 'Aspirant probation source rule missing');

  const indefinite = contractRules.calculateProbationPeriod({
    contract_form: 'onbepaalde_tijd',
    contract_start_date: '2026-01-01',
    requested_probation_period_months: 2,
    security_role_status: 'beveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a'
  }, fullSecurityScope);
  assert.equal(indefinite.probation_period_months, 2, 'Indefinite contract should get 2 months probation');
  assert.equal(indefinite.probation_compliant, true);
  assertIncludes(indefinite.source_rule_ids, 'CAO-PB-2024-R0316', 'Indefinite probation source rule missing');
}

function runEffectiveDateCorrectionScenarios() {
  const review = {
    id: 'review-2026-wage',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    import_run_id: 'import-1',
    rule_key: 'wage_scales.2026',
    field_path: 'wage_scales',
    effective_from: '2026-05-10',
    effective_until: null,
    payroll_impact: true,
    status: 'applied'
  };
  const touchedRun = {
    id: 'payroll-2026-05',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    pay_period_year: 2026,
    pay_period_number: 5,
    pay_period_start: '2026-05-01',
    pay_period_end: '2026-05-28',
    payroll_run_status: 'paid',
    calculation_output: { gross: 1000 }
  };
  const beforeRun = {
    id: 'payroll-before-change',
    cao_key: 'cao_particuliere_beveiliging',
    cao_configuration_id: 'cao-config-pb',
    pay_period_year: 2026,
    pay_period_number: 4,
    pay_period_start: '2026-04-12',
    pay_period_end: '2026-05-09',
    payroll_run_status: 'paid'
  };

  assert.equal(correctionQueue.runTouchesReview(touchedRun, review), true);
  assert.equal(correctionQueue.runTouchesReview(beforeRun, review), false, 'Payroll ending before effective_from must not be affected');

  const overlap = correctionQueue.exactOverlapEvidence(touchedRun, review);
  assert.equal(overlap.match_type, 'exact_pay_period_overlap');
  assert.equal(overlap.overlap_start, '2026-05-10');
  assert.equal(overlap.overlap_end, '2026-05-28');
  assert.equal(overlap.overlap_days, 19);

  const inferredDateReview = { ...review, effective_from_inferred: true };
  const manualReason = correctionQueue.effectiveDateManualReviewReason(inferredDateReview);
  assert.ok(manualReason.includes('afgeleide ingangsdatum'), 'Inferred effective date must require manual review before correction matching');

  const config = {
    id: 'cao-config-pb',
    cao_key: 'cao_particuliere_beveiliging',
    pay_periods: {
      2026: [
        { period_number: 5, start_date: '2026-05-29', end_date: '2026-06-25' },
        { period_number: 6, start_date: '2026-06-26', end_date: '2026-07-23' }
      ]
    }
  };
  const queueTarget = correctionQueue.resolveCorrectionQueueTarget({
    review,
    run: touchedRun,
    reviewCaoKey: 'cao_particuliere_beveiliging',
    config,
    payrollRuns: [
      { ...touchedRun },
      {
        id: 'already-final-pay-period-5',
        cao_key: 'cao_particuliere_beveiliging',
        pay_period_year: 2026,
        pay_period_number: 5,
        payroll_run_status: 'paid'
      }
    ],
    configById: {},
    queueReferenceDate: '2026-06-01',
    requestedTarget: null
  });
  assert.equal(queueTarget.match_type, 'next_open_pay_period');
  assert.equal(queueTarget.pay_period_year, 2026);
  assert.equal(queueTarget.pay_period_number, 6, 'Correction must be queued into the first future open pay period');
  assert.equal(queueTarget.manual_review_required, false);

  const correctionData = correctionQueue.buildCorrectionData(
    review,
    touchedRun,
    'queued',
    'Payrollrun is al betaald; correctie moet in de volgende open loonperiode landen.',
    'cao_particuliere_beveiliging',
    overlap,
    queueTarget
  );
  assert.equal(correctionData.effective_from, '2026-05-10');
  assert.equal(correctionData.affected_overlap_start, '2026-05-10');
  assert.equal(correctionData.queued_for_pay_period_number, 6);
  assert.equal(correctionData.queue_target_match_type, 'next_open_pay_period');

  const ehbRun = { ...touchedRun, id: 'ehb-payroll', cao_key: 'cao_evenementen_horecabeveiliging' };
  assert.equal(
    correctionQueue.runMatchesReviewCao(ehbRun, 'cao_particuliere_beveiliging', {}),
    false,
    'Retroactive PB correction must not touch a payroll run calculated under another CAO'
  );
}

function runReimbursementScenarios() {
  const params = reimbursements.resolveReimbursementParameters(null);
  assert.equal(params.travel_cost_per_km, 0.23);
  assert.equal(params.travel_min_km, 9);
  assert.equal(params.travel_above_40_threshold_km, 40);
  assert.equal(params.travel_above_40_rate_per_km, 0.16);
  assert.equal(params.work_work_travel_rate_per_km, 0.27);
  assert.equal(params.meal_allowance_max, 11.91);
  assert.equal(params.break_availability_per_half_hour, 0.43);
  assert.equal(params.consignment_per_hour, 1.43);
  assert.equal(params.consignment_weekend_holiday_per_hour, 2.87);
  assert.equal(params.reachability_per_pay_period, 71.73);

  const shortCommute = reimbursements.calculateTravelCost(8, null, params);
  assert.equal(shortCommute.eligible, false, 'Commute below 9 km one-way must not receive regular travel allowance');
  assert.equal(shortCommute.amount, 0);

  const longCommute = reimbursements.calculateTravelCost(45, null, params);
  assert.equal(longCommute.eligible, true);
  assert.equal(longCommute.km_total, 90);
  assertAlmostEqual(longCommute.base_amount, 20.7, 'Base commute amount must use EUR 0.23/km over return trip');
  assertAlmostEqual(longCommute.above_40_amount, 1.6, 'Above-40km supplement must use EUR 0.16/km over excess return km');
  assertAlmostEqual(longCommute.amount, 22.3, 'Total commute reimbursement mismatch');

  const workWorkTravel = reimbursements.calculateWorkWorkTravelCost(10, params);
  assertAlmostEqual(workWorkTravel.amount, 2.7, 'Work-work travel must use EUR 0.27/km');

  const meal = reimbursements.calculateMealAllowance({
    start_time: '12:00',
    end_time: '20:00',
    meal_declared_costs: 20
  }, params);
  assert.equal(meal.eligible, true);
  assertAlmostEqual(meal.amount, 11.91, 'Meal allowance must be capped at CAO maximum');
  assert.equal(meal.manual_review_required, false);

  const breakAvailability = reimbursements.calculateBreakAvailabilityAllowance({
    cao_function_group: 'mobiel_surveillant',
    break_availability_half_hours: 3,
    unpaid_break_available_required: true
  }, params);
  assert.equal(breakAvailability.eligible, true);
  assertAlmostEqual(breakAvailability.amount, 1.29, 'Break availability allowance must use EUR 0.43 per half hour');

  const invalidBreakAvailability = reimbursements.calculateBreakAvailabilityAllowance({
    cao_function_group: 'objectbeveiliger_receptionist',
    break_availability_half_hours: 2,
    unpaid_break_available_required: true
  }, params);
  assert.equal(invalidBreakAvailability.eligible, false);
  assert.equal(invalidBreakAvailability.manual_review_required, true, 'Break availability outside mobile/retail surveillance must require review');

  const consignment = reimbursements.calculateConsignmentAndReachability({
    consignment_hours: 10,
    consignment_weekend_holiday_hours: 4,
    reachability_phone_followup_required: true
  }, params);
  assertAlmostEqual(consignment.amount, 91.79, 'Consignment and reachability amount mismatch');

  const dogAllowance = reimbursements.calculateDogAllowance({
    works_with_dog: true,
    dog_owner: 'employee',
    contract_hours_per_pay_period: 72
  }, params);
  assertAlmostEqual(dogAllowance.parttime_ratio, 0.5, 'Dog allowance must be prorated for part-time work');
  assertAlmostEqual(dogAllowance.amount_gross, 57.62, 'Dog service allowance gross amount mismatch');
  assertAlmostEqual(dogAllowance.amount_net, 72.02, 'Dog owner cost allowance net amount mismatch');
}

function runLeaveSicknessScenarios() {
  const params = leaveSickness.resolveLeaveSicknessParameters(null);
  assert.equal(params.standard_vacation.fulltimeAnnualHours, 172.8);
  assert.equal(params.standard_vacation.fulltimeAnnualDays, 24);
  assert.equal(params.standard_vacation.fulltimePerPeriodHours, 13.3);
  assert.equal(params.call_worker_vacation_payout_percentage, 9.24);
  assert.equal(params.call_worker_vacation_max_hours_per_period, 144);
  assert.equal(params.sickness.waiting_day_seniority_periods, 13);
  assert.equal(params.sickness.short_seniority_payment_percentage, 70);
  assert.equal(params.sickness.first_six_months_percentage, 100);
  assert.equal(params.sickness.second_six_months_percentage, 90);

  const fulltimeVacation = leaveSickness.calculateVacationAccrual({
    paid_hours_per_pay_period: 144,
    continuous_service_years: 10
  }, params);
  assertAlmostEqual(fulltimeVacation.vacation_hours_accrued_per_period, 13.3, 'Full-time vacation accrual per period mismatch');
  assert.equal(fulltimeVacation.extra_vacation_days_annual_fulltime_basis, 2);
  assertAlmostEqual(fulltimeVacation.vacation_hours_annual_total, 187.2, 'Vacation total with 10 service years must include 2 extra days');
  assert.equal(fulltimeVacation.manual_review_required, false);

  const callWorkerVacation = leaveSickness.calculateVacationAccrual({
    contract_form: 'oproep',
    worked_hours: 160,
    base_hourly_rate: 20
  }, params);
  assert.equal(callWorkerVacation.vacation_accrual_type, 'call_worker_paid_in_money');
  assert.equal(callWorkerVacation.capped_at_144_hours_per_pay_period, true);
  assertAlmostEqual(callWorkerVacation.vacation_payout_amount, 266.11, 'Call-worker vacation payout must be capped at 144 hours and use 9.24%');

  const holidayCredit = leaveSickness.calculateHolidayCredit({
    holiday_dates: ['2026-12-25'],
    is_fulltime: true
  }, {}, params);
  assertAlmostEqual(holidayCredit.total_holiday_credit_hours, 7.2, 'Full-time weekday holiday must create 7.2 hours credit');
  assert.equal(holidayCredit.manual_review_required, false);

  const vacationAllowance = leaveSickness.calculateVacationAllowance({
    base_salary_amount: 1000,
    periodic_increase_amount: 50,
    special_hours_allowance_amount: 100,
    holiday_surcharge_amount: 20,
    structural_overtime_amount: 30,
    fixed_allowances_amount: 10
  }, params);
  assertAlmostEqual(vacationAllowance.vacation_allowance_basis_amount, 1210, 'Vacation allowance basis mismatch');
  assertAlmostEqual(vacationAllowance.vacation_allowance_amount, 96.8, 'Vacation allowance must be 8% over eligible basis');

  const shortSenioritySickness = leaveSickness.calculateSicknessPayment({
    sickness_start_date: '2026-01-01',
    sickness_end_date: '2026-01-10',
    sickness_payable_days: 10,
    industry_seniority_periods: 12,
    base_gross_salary: 2000,
    payable_days_per_pay_period: 20
  }, params);
  assert.equal(shortSenioritySickness.has_waiting_day, true);
  assert.equal(shortSenioritySickness.payment_percentage, 70);
  assertAlmostEqual(shortSenioritySickness.total_sickness_payment, 630, 'Short-seniority sickness must apply 1 waiting day and 70% payment');

  const regularSickness = leaveSickness.calculateSicknessPayment({
    sickness_start_date: '2026-01-01',
    sickness_end_date: '2026-01-10',
    sickness_payable_days: 10,
    industry_seniority_periods: 13,
    base_gross_salary: 2000,
    payable_days_per_pay_period: 20
  }, params);
  assert.equal(regularSickness.has_waiting_day, false);
  assert.equal(regularSickness.days_first_six_months_100_percent, 10);
  assertAlmostEqual(regularSickness.total_sickness_payment, 1000, 'First six months sickness payment must be 100% for >=13 pay periods seniority');
}

function runPayrollPolicyScenarios() {
  const params = personnelCosts.resolvePayrollCaoParameters(null);
  assert.equal(params.standard_vacation.fulltimeAnnualHours, 172.8);
  assert.equal(params.standard_vacation.fulltimeVacationHoursPerPeriod, 13.3);
  assert.equal(params.call_worker_vacation_payout_percentage, 9.24);
  assert.equal(params.pension.franchiseAnnual, 16164);
  assert.equal(params.pension.premiumRateTotalPercentage, 24.1);
  assert.equal(params.pension.employerSharePercentage, 60);
  assert.equal(params.funds.sfpbEmployeePercentage, 0.061);
  assert.equal(params.funds.pawwEmployeePercentage, 0.1);

  const regularSurcharges = personnelCosts.resolveArticle40And41SurchargeMatrix({
    caoConfig: {},
    isCallWorker: false,
    applySpecialHours: true,
    applyHolidays: true
  });
  assert.equal(regularSurcharges.special_hours.evening_18_00_24_00_monday_friday_percentage, 10);
  assert.equal(regularSurcharges.special_hours.night_00_00_07_00_monday_friday_percentage, 20);
  assert.equal(regularSurcharges.special_hours.weekend_saturday_sunday_percentage, 35);
  assert.equal(regularSurcharges.special_hours.new_years_eve_after_16_00_percentage, 100);
  assert.equal(regularSurcharges.holidays.applied_holiday_percentage, 50);
  assert.equal(regularSurcharges.holidays.article_40_stacks_with_article_41_for_this_employee, true);

  const callWorkerSurcharges = personnelCosts.resolveArticle40And41SurchargeMatrix({
    caoConfig: {},
    isCallWorker: true,
    applySpecialHours: true,
    applyHolidays: true
  });
  assert.equal(callWorkerSurcharges.holidays.applied_holiday_percentage, 100);
  assert.equal(callWorkerSurcharges.holidays.article_40_stacks_with_article_41_for_this_employee, false);

  const callWorkerVacation = personnelCosts.calculateCallWorkerVacationPayoutArticle59({
    baseWageAmount: 4000,
    minimumServiceAmount: 0,
    baseHourlyRate: 20,
    paidBaseHours: 160
  });
  assert.equal(callWorkerVacation.capped_at_144_hours_per_pay_period, true);
  assertAlmostEqual(callWorkerVacation.payout_base_amount, 2880, 'Call-worker vacation basis must cap at 144 hours');
  assertAlmostEqual(callWorkerVacation.amount, 266.11, 'Call-worker vacation amount must use 9.24%');

  const yearEndBasis = yearEndBonus.extractYearEndBonusBasisFromRun({
    id: 'run-1',
    pay_period_year: 2026,
    pay_period_number: 5,
    calculation_output: {
      payslip: {
        base_salary: 1000,
        minimum_service_compensation: { amount: 50 },
        overtime_50: { amount: 200 }
      }
    }
  }, 8);
  assert.equal(yearEndBasis.basis_source, 'fallback_base_salary_plus_minimum_service');
  assertAlmostEqual(yearEndBasis.eligible_base_wage, 1050, 'Year-end bonus basis must include base salary and minimum service compensation');
  assertAlmostEqual(yearEndBasis.vacation_allowance_on_eligible_base_wage, 84, 'Year-end bonus basis must include 8% vacation allowance');
  assertAlmostEqual(yearEndBasis.eligible_amount_including_vacation_allowance, 1134, 'Year-end bonus eligible amount mismatch');
  assertAlmostEqual(yearEndBasis.excluded_overtime_amount, 200, 'Year-end bonus basis must keep overtime excluded');

  const correctionApplication = personnelCosts.buildCaoCorrectionApplication([
    { id: 'corr-1', status: 'queued', cao_change_review_id: 'review-1' }
  ], {
    'corr-1': {
      delta_snapshot: {
        gross_delta: 100,
        employee_deductions_delta: 20,
        employer_costs_delta: 30,
        vacation_allowance_delta: 8,
        year_end_bonus_delta: 2
      }
    }
  }, true);
  assert.equal(correctionApplication.ready_to_apply, true);

  const correctionComponent = personnelCosts.buildCaoCorrectionPayrollComponent([
    { id: 'corr-1', status: 'queued', cao_change_review_id: 'review-1' }
  ], {
    'corr-1': {
      delta_snapshot: {
        gross_delta: 100,
        employee_deductions_delta: 20,
        employer_costs_delta: 30,
        vacation_allowance_delta: 8,
        year_end_bonus_delta: 2
      }
    }
  });
  assert.equal(correctionComponent.applied, true);
  assertAlmostEqual(correctionComponent.total_gross_delta, 100, 'Correction gross delta mismatch');
  assertAlmostEqual(correctionComponent.net_salary_delta, 80, 'Correction net delta should default to gross minus employee deductions');
  assertAlmostEqual(correctionComponent.total_cost_employer_delta, 140, 'Correction employer total should default to gross plus employer/vacation/year-end deltas');
}

function runFunctionClassificationScenarios() {
  const nonSecurity = functionClassification.classify({
    function_type: 'klantrelatie',
    cao_function_group: 'non_security_staff',
    custom_hourly_rate: 25
  }, {}, {
    cao_scope_profile: 'non_security_work_article_3_exception',
    manual_review_required: false,
    payroll_rule_profile: {
      apply_appendix_2_function_scales: false
    }
  }, null, '2026-01-01', []);
  assert.equal(nonSecurity.appendix_2_applies, false);
  assert.equal(nonSecurity.classification_status, 'not_applicable');
  assert.equal(nonSecurity.cao_function_group, 'non_security_staff');
  assertAlmostEqual(nonSecurity.hourly_rate, 25, 'Non-security function must use explicit custom hourly wage basis');
  assert.equal(nonSecurity.payroll_final_allowed, true);
  assertIncludes(nonSecurity.source_rule_ids, 'CAO-PB-2024-R0228', 'Non-security classification must cite article 3 exclusion scope');
  assertIncludes(nonSecurity.source_rule_ids, 'CAO-PB-2024-R0233', 'Non-security classification must cite article 3 exclusion scope');

  const security = functionClassification.classify({
    function_type: 'objectbeveiliger',
    cao_function_group: 'objectbeveiliger_receptionist',
    cao_function_level: 'a',
    security_role_status: 'beveiliger',
    performs_security_work: true,
    security_work_percentage: 100,
    cao_scale: 3,
    cao_period: 0,
    written_classification_notice_confirmed: true,
    written_scale_period_notice_confirmed: true,
    periodic_increase_due_confirmed: true
  }, {}, {
    cao_scope_profile: 'full_security_worker',
    manual_review_required: false,
    payroll_rule_profile: {
      apply_appendix_2_function_scales: true
    }
  }, {
    wage_scales_detailed: {
      3: {
        0: { hourly_rate: 16.02, period_salary: 2307.84 }
      }
    }
  }, '2026-01-01', []);
  assert.equal(security.appendix_2_applies, true);
  assert.equal(security.classification_status, 'resolved');
  assert.equal(security.suggested_cao_scale, 3);
  assert.equal(security.current_cao_period, 0);
  assert.equal(security.period_valid_for_scale, true);
  assert.equal(security.wage_rate_found, true);
  assertAlmostEqual(security.hourly_rate, 16.02, 'Security worker wage must come from wage_scales_detailed');
  assert.equal(security.payroll_final_allowed, true);
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1812', 'Function-to-salary-scale mapping source missing');
  assertIncludes(security.source_rule_ids, 'CAO-PB-2024-R1838', 'Appendix 4 wage-scale source missing');
}

async function main() {
  const scenarios = [
    ['external CAO gates', () => runExternalCaoGateScenarios()],
    ['planning context', () => runPlanningContextScenarios()],
    ['contract resolver scope', () => runContractResolverScenarios()],
    ['contract scope persistence', () => runContractScopePersistenceScenarios()],
    ['probation rules', () => runProbationScenarios()],
    ['effective-date correction queue', () => runEffectiveDateCorrectionScenarios()],
    ['reimbursements', () => runReimbursementScenarios()],
    ['leave and sickness', () => runLeaveSicknessScenarios()],
    ['payroll policy and corrections', () => runPayrollPolicyScenarios()],
    ['function classification and wage scales', () => runFunctionClassificationScenarios()]
  ];

  for (const [name, fn] of scenarios) {
    await fn();
    console.log(`ok - ${name}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

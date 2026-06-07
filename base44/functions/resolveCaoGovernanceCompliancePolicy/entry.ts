import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'ja' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'no' || value === 'nee' || value === 0 || value === '0') return false;
  return null;
}

function r2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function hasDocument(available, key) {
  const set = new Set(asArray(available).map(item => String(item).toLowerCase()));
  return set.has(key.toLowerCase());
}

function review(ruleId, domain, message, field = null) {
  return { rule_id: ruleId, domain, message, field, manual_review_required: true };
}

function buildWpbrApplicabilityPolicy(input) {
  const securityWage = numberOrNull(input.security_sv_wage_amount);
  const totalWage = numberOrNull(input.total_sv_wage_amount);
  const explicitPct = numberOrNull(input.security_sv_wage_percentage);
  const percentage = explicitPct !== null
    ? explicitPct
    : securityWage !== null && totalWage > 0
      ? (securityWage / totalWage) * 100
      : null;
  return {
    source_rule_ids: ['CAO-PB-2024-R0221'],
    security_sv_wage_percentage: percentage === null ? null : r2(percentage),
    below_or_equal_5_percent_security_wage: percentage === null ? null : percentage <= 5,
    wpbr_private_security_organization_sub_a_excluded: percentage === null ? null : percentage <= 5,
    manual_review_required: percentage === null,
    manual_review_items: percentage === null
      ? [review('CAO-PB-2024-R0221', 'scope_applicability', 'SV-loonpercentage beveiligingswerk ontbreekt; 5%-uitzondering kan niet audit-proof worden bepaald.', 'security_sv_wage_amount/total_sv_wage_amount')]
      : []
  };
}

function buildControlEvidencePackage(input) {
  const available = input.available_documents || input.available_evidence || [];
  const required = [
    ['cao_payroll_administration', 'Inzichtelijke/deugdelijke loon- en arbeidstijdenadministratie', 'CAO-PB-2024-R1865'],
    ['interns_overview', 'Overzicht stagiaires in onderzoeksperiode', 'CAO-PB-2024-R1868'],
    ['annual_wage_statement', 'Verzamelloonstaat voorgaand kalenderjaar en tot controledatum', 'CAO-PB-2024-R1869'],
    ['wage_payment_proofs', 'Betalingsbewijzen loon, batchbetalingen, bankafschriften of kwitanties', 'CAO-PB-2024-R1871'],
    ['payslips', 'Loonstroken inclusief loonspecificaties ingeleend personeel', 'CAO-PB-2024-R1872'],
    ['rosters', 'Registratie gewerkte diensten en diensttijden per loonperiode inclusief wijzigingen', 'CAO-PB-2024-R1873'],
    ['worked_hours_registration', 'Registratie gewerkte uren per loonperiode', 'CAO-PB-2024-R1874'],
    ['sickness_overview', 'Overzicht werknemers die ziek zijn geweest', 'CAO-PB-2024-R1875'],
    ['travel_reimbursement_specification', 'Specificatie uitbetaalde reiskosten-/reistijdenvergoeding', 'CAO-PB-2024-R1877'],
    ['agency_payroll_worker_files', 'Onderbouwing inhuur/uitzend/payroll en toepassing inlenersverplichtingen', 'CAO-PB-2024-R1857']
  ];
  const missing = required
    .filter(([key]) => !hasDocument(available, key))
    .map(([key, label, ruleId]) => ({ key, label, rule_id: ruleId }));
  return {
    source_rule_ids: [
      'CAO-PB-2024-R1841', 'CAO-PB-2024-R1844', 'CAO-PB-2024-R1847', 'CAO-PB-2024-R1857',
      'CAO-PB-2024-R1858', 'CAO-PB-2024-R1859', 'CAO-PB-2024-R1861',
      'CAO-PB-2024-R1862', 'CAO-PB-2024-R1865', 'CAO-PB-2024-R1868',
      'CAO-PB-2024-R1869', 'CAO-PB-2024-R1871', 'CAO-PB-2024-R1872',
      'CAO-PB-2024-R1873', 'CAO-PB-2024-R1874', 'CAO-PB-2024-R1875',
      'CAO-PB-2024-R1877', 'CAO-PB-2024-R1879', 'CAO-PB-2024-R1881',
      'CAO-PB-2024-R1883', 'CAO-PB-2024-R1884', 'CAO-PB-2024-R1885',
      'CAO-PB-2024-R1886', 'CAO-PB-2024-R1887', 'CAO-PB-2024-R1888',
      'CAO-PB-2024-R1889', 'CAO-PB-2024-R1890', 'CAO-PB-2024-R1891', 'CAO-PB-2024-R1892',
      'CAO-PB-2024-R1893', 'CAO-PB-2024-R1894', 'CAO-PB-2024-R1895',
      'CAO-PB-2024-R1896', 'CAO-PB-2024-R1897', 'CAO-PB-2024-R1898',
      'CAO-PB-2024-R1900', 'CAO-PB-2024-R1902', 'CAO-PB-2024-R1903',
      'CAO-PB-2024-R1904', 'CAO-PB-2024-R1905', 'CAO-PB-2024-R1908',
      'CAO-PB-2024-R1910', 'CAO-PB-2024-R1911', 'CAO-PB-2024-R1913',
      'CAO-PB-2024-R1914', 'CAO-PB-2024-R1915', 'CAO-PB-2024-R1916',
      'CAO-PB-2024-R1917'
    ],
    required_documents: required.map(([key, label, ruleId]) => ({ key, label, rule_id: ruleId, present: hasDocument(available, key) })),
    missing_documents: missing,
    control_cooperation_required: true,
    insufficient_infringement_notice_requires_description: true,
    insufficient_company_judgement_publication_threshold_percentage: 60,
    company_judgement_response_deadline_workdays: 10,
    manual_review_required: missing.length > 0,
    manual_review_items: missing.map(item => review(item.rule_id, 'cao_control_evidence', `Controlebewijs ontbreekt: ${item.label}.`, item.key))
  };
}

function buildContractEmploymentGovernancePolicy(input) {
  const manualItems = [];
  if (booleanOrNull(input.summary_dismissal_reason_documented) === false) {
    manualItems.push(review('CAO-PB-2024-R0453', 'summary_dismissal', 'Ontslag op staande voet vereist vastlegging van dringende reden en bijzondere beveiligingscontext.', 'summary_dismissal_reason_documented'));
  }
  if (booleanOrNull(input.security_specific_summary_dismissal_reviewed) === false) {
    manualItems.push(review('CAO-PB-2024-R0456', 'summary_dismissal', 'Bij beveiligingsfuncties moet het bijzondere karakter van de functie worden meegewogen.', 'security_specific_summary_dismissal_reviewed'));
  }
  if (booleanOrNull(input.left_object_unattended) === true) {
    manualItems.push(review('CAO-PB-2024-R0461', 'summary_dismissal', 'Alleen te beveiligen object onbeheerd achterlaten is als dringende reden gemarkeerd; juridische/HR-review vereist.', 'left_object_unattended'));
  }
  if (booleanOrNull(input.left_shared_object_without_urgent_reason) === true) {
    manualItems.push(review('CAO-PB-2024-R0462', 'summary_dismissal', 'Mede te beveiligen object verlaten zonder dringende reden of zonder voorschriften te volgen is als dringende reden gemarkeerd.', 'left_shared_object_without_urgent_reason'));
  }
  if (booleanOrNull(input.sfpb_file_confidentiality_confirmed) === false) {
    manualItems.push(review('CAO-PB-2024-R1923', 'control_regulation_confidentiality', 'SFPB-dossierinformatie valt onder geheimhouding; borg dit in toegang/logging.', 'sfpb_file_confidentiality_confirmed'));
  }
  if (booleanOrNull(input.hardship_clause_requested) === true) {
    manualItems.push(review('CAO-PB-2024-R1925', 'control_regulation_hardship_clause', 'Hardheidsclausule is bestuursbeoordeling en mag niet automatisch als afwijking worden toegepast.', 'hardship_clause_requested'));
  }
  return {
    source_rule_ids: [
      'CAO-PB-2024-R0301', 'CAO-PB-2024-R0305', 'CAO-PB-2024-R0306',
      'CAO-PB-2024-R0338', 'CAO-PB-2024-R0346', 'CAO-PB-2024-R0453',
      'CAO-PB-2024-R0456', 'CAO-PB-2024-R0461', 'CAO-PB-2024-R0462',
      'CAO-PB-2024-R1923', 'CAO-PB-2024-R1925'
    ],
    delegated_runtime_functions: {
      hired_worker_article_15: 'applyCaoContractRules.hired_worker_article_15',
      contract_transfer_articles_18_20: 'applyCaoContractRules.contract_transfer_articles_18_20',
      fulltime_contract_model: 'applyCaoContractRules.fulltime_parttime_contract_model_articles_10_11',
      summary_dismissal_manual_review: 'resolveCaoGovernanceCompliancePolicy.contract_employment_governance'
    },
    pay_period_policy: {
      pay_periods_per_year: 13,
      pay_period_weeks: 4,
      year_can_have_53rd_week: true
    },
    fulltime_model_policy: {
      worked_hours_may_not_exceed_contractual_working_time_in_fixed_model: true
    },
    summary_dismissal_policy: {
      reason_documented: booleanOrNull(input.summary_dismissal_reason_documented),
      security_specific_context_reviewed: booleanOrNull(input.security_specific_summary_dismissal_reviewed),
      left_object_unattended: booleanOrNull(input.left_object_unattended),
      left_shared_object_without_urgent_reason: booleanOrNull(input.left_shared_object_without_urgent_reason),
      legal_manual_review_required: true
    },
    control_regulation_policy: {
      sfpb_file_confidentiality_required: true,
      sfpb_file_confidentiality_confirmed: booleanOrNull(input.sfpb_file_confidentiality_confirmed),
      hardship_clause_is_board_discretion: true,
      hardship_clause_requested: booleanOrNull(input.hardship_clause_requested)
    },
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildSafetyRiskWorkingConditionsPolicy(input) {
  const manualItems = [];
  const requiredChecks = [
    ['communication_device_available_and_working', 'CAO-PB-2024-R1303', 'Werkgever moet een goed werkend communicatiemiddel beschikbaar stellen.'],
    ['incident_reporting_procedure_available', 'CAO-PB-2024-R1311', 'Onregelmatigheden moeten gemeld kunnen worden via een vastgelegde procedure.'],
    ['control_alarm_calamity_procedures_available', 'CAO-PB-2024-R1313', 'Procedures voor controlemeldingen, alarmmeldingen en calamiteiten moeten aanwezig zijn.'],
    ['high_risk_object_risk_assessment_completed', 'CAO-PB-2024-R1322', 'Bij hoger risico-object moet risico-inventarisatie bepalen welke maatregelen/middelen nodig zijn.'],
    ['start_of_shift_equipment_check_recorded', 'CAO-PB-2024-R1327', 'Controle van middelen/materialen bij dienstaanvang moet aantoonbaar zijn.'],
    ['annual_safety_union_consultation_completed', 'CAO-PB-2024-R1330', 'Vakbondsoverleg over veiligheid moet minimaal jaarlijks plaatsvinden met gegevens over calamiteiten/ongevallen/initiatieven.']
  ];
  for (const [field, ruleId, message] of requiredChecks) {
    if (booleanOrNull(input[field]) === false) manualItems.push(review(ruleId, 'safety_risk_working_conditions', message, field));
  }
  return {
    source_rule_ids: ['CAO-PB-2024-R1303', 'CAO-PB-2024-R1311', 'CAO-PB-2024-R1313', 'CAO-PB-2024-R1322', 'CAO-PB-2024-R1327', 'CAO-PB-2024-R1330'],
    communication_device_required: true,
    incident_reporting_required: true,
    control_alarm_calamity_procedures_required: true,
    high_risk_object_risk_assessment_required: true,
    start_of_shift_equipment_check_required: true,
    annual_union_safety_consultation_required: true,
    evidence_fields: requiredChecks.map(([field, ruleId]) => ({
      field,
      rule_id: ruleId,
      confirmed: booleanOrNull(input[field])
    })),
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildDamageCompensation(input) {
  const wageSum = numberOrNull(input.last_sfpb_wage_sum);
  const weeks = numberOrNull(input.weeks_in_default) ?? 0;
  const weeklyAmount = wageSum === null ? null : Math.max(1500, wageSum * 0.01);
  return {
    source_rule_ids: ['CAO-PB-2024-R1848', 'CAO-PB-2024-R1850', 'CAO-PB-2024-R1918', 'CAO-PB-2024-R1919', 'CAO-PB-2024-R1920', 'CAO-PB-2024-R1921'],
    last_sfpb_wage_sum: wageSum,
    weekly_percentage: 1,
    weekly_minimum_amount: 1500,
    weeks_in_default: weeks,
    weekly_damage_amount: weeklyAmount === null ? null : r2(weeklyAmount),
    total_damage_amount: weeklyAmount === null ? null : r2(weeklyAmount * weeks),
    manual_review_required: wageSum === null,
    manual_review_items: wageSum === null
      ? [review('CAO-PB-2024-R1918', 'sfpb_damage_compensation', 'Laatst vastgestelde SFPB-loonsom ontbreekt; forfaitaire schadevergoeding kan niet worden berekend.', 'last_sfpb_wage_sum')]
      : []
  };
}

function buildEmployerCompliancePolicy(input) {
  const indefiniteContracts = numberOrNull(input.security_indefinite_contract_count);
  const totalContracts = numberOrNull(input.security_contract_count);
  const indefinitePct = totalContracts > 0 && indefiniteContracts !== null ? (indefiniteContracts / totalContracts) * 100 : null;
  const agencyContractClauseConfirmed = booleanOrNull(input.agency_payroll_contract_cao_clause_confirmed);
  const standardArticleDeviation = booleanOrNull(input.deviates_from_standard_article);
  const manualItems = [];
  if (indefinitePct !== null && indefinitePct < 80) {
    manualItems.push(review('CAO-PB-2024-R1673', 'employment_contract_mix', 'Uitgangspunt minimaal 80% arbeidsovereenkomsten onbepaalde tijd voor beveiligers wordt niet gehaald.', 'security_indefinite_contract_count/security_contract_count'));
  }
  if (agencyContractClauseConfirmed !== true) {
    manualItems.push(review('CAO-PB-2024-R1677', 'agency_payroll_compliance', 'Overeenkomst met uitzendbureau/payrollbedrijf moet CAO-lonen, vergoedingen en individuele arbeidsvoorwaarden borgen.', 'agency_payroll_contract_cao_clause_confirmed'));
  }
  if (standardArticleDeviation === true) {
    manualItems.push(review('CAO-PB-2024-R1658', 'dispensation', 'Afwijking van standaardartikel is niet toegestaan zonder geldige grondslag; handmatige juridische review vereist.', 'deviates_from_standard_article'));
  }
  return {
    source_rule_ids: [
      'CAO-PB-2024-R1651', 'CAO-PB-2024-R1652', 'CAO-PB-2024-R1658',
      'CAO-PB-2024-R1668', 'CAO-PB-2024-R1669', 'CAO-PB-2024-R1670',
      'CAO-PB-2024-R1671', 'CAO-PB-2024-R1673', 'CAO-PB-2024-R1675',
      'CAO-PB-2024-R1676', 'CAO-PB-2024-R1677', 'CAO-PB-2024-R1678',
      'CAO-PB-2024-R1679', 'CAO-PB-2024-R1681', 'CAO-PB-2024-R1682',
      'CAO-PB-2024-R1683', 'CAO-PB-2024-R1686', 'CAO-PB-2024-R1689',
      'CAO-PB-2024-R1690', 'CAO-PB-2024-R1691', 'CAO-PB-2024-R1692',
      'CAO-PB-2024-R1693', 'CAO-PB-2024-R1694', 'CAO-PB-2024-R1695',
      'CAO-PB-2024-R1696', 'CAO-PB-2024-R1698'
    ],
    indefinite_contract_ratio_percentage: indefinitePct === null ? null : r2(indefinitePct),
    indefinite_contract_ratio_target_percentage: 80,
    roster_retention_required: true,
    agency_payroll_contract_clause_confirmed: agencyContractClauseConfirmed === true,
    dispensation: {
      may_not_deviate_from_standard_article: true,
      max_duration: 'looptijd_cao_of_duur_regeling_waarvoor_dispensatie_is_gevraagd',
      sfpb_may_revoke_any_time_with_written_reason: true,
      extra_union_agreement_allowed_only_special_situation_and_not_conflicting_with_cao: true
    },
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildSocialUnionPolicy(input) {
  const organizationChange = booleanOrNull(input.organization_structure_change);
  const affectsJobs = booleanOrNull(input.affects_employment_or_legal_position);
  const unionsInformed = booleanOrNull(input.unions_informed_or_consulted);
  const socialPlanAgreed = booleanOrNull(input.social_plan_agreed_with_unions);
  const bankruptcyOrSuspension = booleanOrNull(input.bankruptcy_or_suspension_requested);
  const manualItems = [];
  if (organizationChange === true && affectsJobs === true && unionsInformed !== true) {
    manualItems.push(review('CAO-PB-2024-R1375', 'organization_change_union_consultation', 'Organisatiewijziging met effect op werkgelegenheid/rechtspositie vereist overleg/informatie richting vakbonden.', 'unions_informed_or_consulted'));
  }
  if (organizationChange === true && affectsJobs === true && socialPlanAgreed !== true) {
    manualItems.push(review('CAO-PB-2024-R1392', 'social_plan', 'Bij relevante reorganisatie moet sociaal plan/sociale begeleiding met vakbonden worden beoordeeld.', 'social_plan_agreed_with_unions'));
  }
  if (bankruptcyOrSuspension === true && unionsInformed !== true) {
    manualItems.push(review('CAO-PB-2024-R1387', 'bankruptcy_union_notice', 'Vakbonden moeten onmiddellijk worden geïnformeerd bij surseance/faillissement.', 'unions_informed_or_consulted'));
  }
  return {
    source_rule_ids: [
      'CAO-PB-2024-R1337', 'CAO-PB-2024-R1338', 'CAO-PB-2024-R1357',
      'CAO-PB-2024-R1358', 'CAO-PB-2024-R1359', 'CAO-PB-2024-R1360',
      'CAO-PB-2024-R1366', 'CAO-PB-2024-R1375', 'CAO-PB-2024-R1377',
      'CAO-PB-2024-R1386', 'CAO-PB-2024-R1387', 'CAO-PB-2024-R1392',
      'CAO-PB-2024-R1393', 'CAO-PB-2024-R1395', 'CAO-PB-2024-R1399',
      'CAO-PB-2024-R1400', 'CAO-PB-2024-R1401', 'CAO-PB-2024-R1408',
      'CAO-PB-2024-R1409', 'CAO-PB-2024-R1423', 'CAO-PB-2024-R1436',
      'CAO-PB-2024-R1438', 'CAO-PB-2024-R1439', 'CAO-PB-2024-R1440',
      'CAO-PB-2024-R1441', 'CAO-PB-2024-R1442', 'CAO-PB-2024-R1443',
      'CAO-PB-2024-R1444', 'CAO-PB-2024-R1445', 'CAO-PB-2024-R1455',
      'CAO-PB-2024-R1460', 'CAO-PB-2024-R1472', 'CAO-PB-2024-R1474',
      'CAO-PB-2024-R1484', 'CAO-PB-2024-R1491', 'CAO-PB-2024-R1495',
      'CAO-PB-2024-R1499', 'CAO-PB-2024-R1500', 'CAO-PB-2024-R1501',
      'CAO-PB-2024-R1506', 'CAO-PB-2024-R1508', 'CAO-PB-2024-R1509',
      'CAO-PB-2024-R1510', 'CAO-PB-2024-R1514', 'CAO-PB-2024-R1515',
      'CAO-PB-2024-R1516'
    ],
    quarterly_sector_employment_consultation: true,
    unions_need_information_to_follow_employment_developments: true,
    organization_change_requires_union_consultation_when_jobs_or_rights_affected: organizationChange === true && affectsJobs === true,
    social_plan_review_required: organizationChange === true && affectsJobs === true,
    bankruptcy_or_suspension_union_notice_required: bankruptcyOrSuspension === true,
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildTravelReimbursementSystemPolicy(input) {
  return {
    source_rule_ids: ['CAO-PB-2024-R1927', 'CAO-PB-2024-R1928', 'CAO-PB-2024-R1929', 'CAO-PB-2024-R1932', 'CAO-PB-2024-R1934', 'CAO-PB-2024-R1935', 'CAO-PB-2024-R1936'],
    calculation_must_be_transparent_simple_unambiguous_and_online_checkable: true,
    distance_source: 'SFPB_postcode_program_distance_between_two_postcodes_whole_kilometers',
    postcode_geo_dataset_update: 'once_per_year_in_pay_period_1',
    travel_date_definition: 'service_start_date_00_00_is_new_day',
    manual_review_required: booleanOrNull(input.travel_reimbursement_system_transparent_and_checkable) === false,
    manual_review_items: booleanOrNull(input.travel_reimbursement_system_transparent_and_checkable) === false
      ? [review('CAO-PB-2024-R1929', 'travel_reimbursement_system', 'Reiskostenprogramma moet transparant, eenvoudig, eenduidig en controleerbaar zijn.', 'travel_reimbursement_system_transparent_and_checkable')]
      : []
  };
}

function buildVacationAllocationPoints(input) {
  const requests = asArray(input.vacation_requests);
  const rows = requests.map((request, index) => {
    const status = String(request.status || '').toLowerCase();
    const overlapsPeak = booleanOrNull(request.overlaps_may_1_october_31) ??
      (String(request.start_date || '').slice(5) <= '10-31' && String(request.end_date || '').slice(5) >= '05-01');
    const awardedDaysInPeak = numberOrNull(request.awarded_days_in_may_1_october_31);
    const point = status.includes('reject') || status.includes('afgewezen')
      ? 1
      : status.includes('approved') && overlapsPeak && awardedDaysInPeak !== null && awardedDaysInPeak < 14
        ? 1
        : status.includes('approved') && !overlapsPeak
          ? 1
          : 0;
    return {
      index,
      status: request.status || null,
      overlaps_may_1_october_31: overlapsPeak,
      awarded_days_in_may_1_october_31: awardedDaysInPeak,
      point_awarded: point,
      max_one_point_per_vacation_year_plan: true
    };
  });
  const totalPoints = Math.min(1, rows.reduce((sum, row) => sum + row.point_awarded, 0));
  return {
    source_rule_ids: ['CAO-PB-2024-R1937', 'CAO-PB-2024-R1938', 'CAO-PB-2024-R1939', 'CAO-PB-2024-R1940', 'CAO-PB-2024-R1941', 'CAO-PB-2024-R1942', 'CAO-PB-2024-R1943', 'CAO-PB-2024-R1944', 'CAO-PB-2024-R1945', 'CAO-PB-2024-R1946', 'CAO-PB-2024-R1947', 'CAO-PB-2024-R1948'],
    requests: rows,
    points_awarded_this_year_plan: totalPoints,
    carry_forward_to_next_vacation_arrangement: true,
    manual_review_required: requests.length === 0,
    manual_review_items: requests.length === 0
      ? [review('CAO-PB-2024-R1937', 'vacation_allocation_points', 'Geen verlofaanvragen meegegeven; puntensysteem kan niet worden beoordeeld.', 'vacation_requests')]
      : []
  };
}

function buildContractChangeTransferPolicy(input) {
  const vacationHours = numberOrNull(input.transfer_vacation_hours);
  const baseHourlyRate = numberOrNull(input.base_hourly_rate);
  const avgOrtPerHour = numberOrNull(input.average_ort_per_hour) ?? 0;
  const vacationAllowancePercentage = numberOrNull(input.vacation_allowance_percentage) ?? 8;
  const socialChargesPercentage = numberOrNull(input.social_charges_percentage);
  const vacationDaysValue = vacationHours !== null && baseHourlyRate !== null
    ? vacationHours * (baseHourlyRate + avgOrtPerHour)
    : null;
  const vacationAllowanceValue = vacationDaysValue === null ? null : vacationDaysValue * (vacationAllowancePercentage / 100);
  const subtotal = vacationDaysValue === null || vacationAllowanceValue === null ? null : vacationDaysValue + vacationAllowanceValue;
  const total = subtotal === null || socialChargesPercentage === null ? null : subtotal * (1 + socialChargesPercentage / 100);
  const manualItems = [];
  if (vacationDaysValue === null) manualItems.push(review('CAO-PB-2024-R1951', 'contract_change_vacation_transfer', 'Vakantiedagenwaarde vereist vakantieuren, basisuurloon en gemiddelde ORT per uur.', 'transfer_vacation_hours/base_hourly_rate/average_ort_per_hour'));
  if (socialChargesPercentage === null) manualItems.push(review('CAO-PB-2024-R1953', 'contract_change_vacation_transfer', 'Opslagpercentage sociale lasten ontbreekt.', 'social_charges_percentage'));
  return {
    source_rule_ids: ['CAO-PB-2024-R1949', 'CAO-PB-2024-R1950', 'CAO-PB-2024-R1951', 'CAO-PB-2024-R1952', 'CAO-PB-2024-R1953'],
    payment_deadline_days_for_leaving_party: 14,
    vacation_days_value: vacationDaysValue === null ? null : r2(vacationDaysValue),
    vacation_allowance_value: vacationAllowanceValue === null ? null : r2(vacationAllowanceValue),
    subtotal_before_social_charges: subtotal === null ? null : r2(subtotal),
    social_charges_percentage: socialChargesPercentage,
    total_transfer_value: total === null ? null : r2(total),
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildMutationListTemplatePolicy() {
  return {
    source_rule_ids: ['CAO-PB-2024-R2105', 'CAO-PB-2024-R2107', 'CAO-PB-2024-R2108', 'CAO-PB-2024-R2109', 'CAO-PB-2024-R2110'],
    required_sections: [
      'current_organization_and_client',
      'location_data',
      'employee_contract_and_location_data',
      'salary_scale_period_salary_and_allowances',
      'other_allowances_study_agreement_travel_vacation_sickness',
      'footnotes_prorated_amounts_fixed_term_contract_sequence_composite_locations'
    ],
    export_template_required_for_contract_change: true
  };
}

function buildProtocolsPolicy() {
  return {
    source_rule_ids: ['CAO-PB-2024-R1707', 'CAO-PB-2024-R1708', 'CAO-PB-2024-R1712', 'CAO-PB-2024-R1714', 'CAO-PB-2024-R1716', 'CAO-PB-2024-R1717', 'CAO-PB-2024-R1719', 'CAO-PB-2024-R1720', 'CAO-PB-2024-R1722', 'CAO-PB-2024-R1723', 'CAO-PB-2024-R1725', 'CAO-PB-2024-R1736'],
    service_center_security_branch_policy: true,
    sustainable_participation_and_employability_policy: true,
    roster_protocol_goals: ['meer_rust_in_roosters', 'voorspelbaarheid_in_roosters', 'voldoende_hersteltijd'],
    roster_system_deviation_requires_dispensation_until_new_system_agreed: true,
    function_building_recalibration_policy: true,
    payslip_appendix_reference: 'calculatePersonnelCosts.payslip_template_compliance'
  };
}

function buildDispensationRequestProcessPolicy(input) {
  const writtenRequestSubmitted = booleanOrNull(input.dispensation_written_request_submitted);
  const factsAndArgumentsIncluded = booleanOrNull(input.dispensation_facts_and_arguments_included);
  const urgent = booleanOrNull(input.dispensation_urgent_request);
  const manualItems = [];
  if (writtenRequestSubmitted !== true) {
    manualItems.push(review('CAO-PB-2024-R2074', 'dispensation_request_process', 'Dispensatieverzoek moet schriftelijk bij het secretariaat van SFPB worden ingediend.', 'dispensation_written_request_submitted'));
  }
  if (factsAndArgumentsIncluded !== true) {
    manualItems.push(review('CAO-PB-2024-R2077', 'dispensation_request_process', 'Dispensatieverzoek moet een beknopt overzicht van feiten en argumenten bevatten.', 'dispensation_facts_and_arguments_included'));
  }
  return {
    source_rule_ids: [
      'CAO-PB-2024-R2074', 'CAO-PB-2024-R2077', 'CAO-PB-2024-R2078',
      'CAO-PB-2024-R2079', 'CAO-PB-2024-R2080', 'CAO-PB-2024-R2081',
      'CAO-PB-2024-R2084', 'CAO-PB-2024-R2088', 'CAO-PB-2024-R2089',
      'CAO-PB-2024-R2090', 'CAO-PB-2024-R2091', 'CAO-PB-2024-R2092',
      'CAO-PB-2024-R2093', 'CAO-PB-2024-R2094', 'CAO-PB-2024-R2095',
      'CAO-PB-2024-R2099', 'CAO-PB-2024-R2100', 'CAO-PB-2024-R2101',
      'CAO-PB-2024-R2102', 'CAO-PB-2024-R2103'
    ],
    written_submission_required: true,
    facts_and_arguments_required: true,
    receipt_confirmation_by_secretary_required: true,
    default_handling: urgent === true ? 'urgent_handling_possible' : 'next_regular_sfpb_meeting',
    sfpb_may_request_additional_written_response: true,
    hearing_possible: true,
    decision_deadline_weeks_after_submission_to_secretary: 8,
    contacts: {
      social_fund: 'belonen@beveiligingsbranche.nl',
      training_steering_group: 'opleiden@beveiligingsbranche.nl',
      social_committee: 'scb@beveiligingsbranche.nl'
    },
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

function buildSchipholSocialAgreementPolicy(input) {
  const manualItems = [];
  const booleanChecks = [
    ['fair_labor_and_healthy_work_conditions_reviewed', 'CAO-PB-2024-R1957', 'Schiphol-afspraken vereisen aantoonbare beoordeling van eerlijke arbeidsvoorwaarden en gezonde werkomstandigheden.'],
    ['schiphol_legal_and_cao_compliance_confirmed', 'CAO-PB-2024-R1966', 'Schiphol-opdracht/uitvoering moet expliciet wet- en CAO-conform zijn ingericht.'],
    ['schiphol_basic_facilities_available', 'CAO-PB-2024-R1966', 'Basisvoorzieningen zoals rust-, sanitaire en facilitaire voorzieningen moeten beschikbaar zijn.'],
    ['schiphol_independent_reporting_point_available', 'CAO-PB-2024-R1971', 'Onafhankelijk meldpunt voor misstanden en veiligheidsrisico\'s moet beschikbaar zijn.'],
    ['schiphol_rest_facilities_improvement_plan_available', 'CAO-PB-2024-R2035', 'Structurele verbetering van rustruimtes, sanitaire faciliteiten en lounges moet aantoonbaar zijn.'],
    ['schiphol_socially_responsible_commissioning_confirmed', 'CAO-PB-2024-R1993', 'Sociaal verantwoord opdrachtgeverschap moet in Schiphol-opdrachtvoorwaarden zijn geborgd.'],
    ['schiphol_equipment_pooling_policy_confirmed', 'CAO-PB-2024-R2003', 'Pooling/gebruik van benodigde hulpmiddelen en uitrusting moet aantoonbaar zijn geregeld.'],
    ['schiphol_license_to_operate_requirements_confirmed', 'CAO-PB-2024-R2006', 'License-to-operate/operationele eisen moeten aantoonbaar zijn ingericht.'],
    ['schiphol_union_facilities_available', 'CAO-PB-2024-R2012', 'Vakbonden moeten toegang en faciliteiten hebben voor Schiphol-medewerkers.'],
    ['schiphol_landside_union_room_available', 'CAO-PB-2024-R2013', 'Landside vakbondsruimte/faciliteit moet beschikbaar zijn.'],
    ['schiphol_peace_obligation_acknowledged', 'CAO-PB-2024-R2018', 'Vredesplicht/afspraken uit het Schiphol-akkoord moeten zijn erkend.'],
    ['schiphol_commuting_ov_full_reimbursement_confirmed', 'CAO-PB-2024-R1989', 'Schiphol-afspraak over 100% OV-reiskostenvergoeding moet in beleid of configuratie zijn verwerkt.'],
    ['schiphol_parking_on_contract_change_confirmed', 'CAO-PB-2024-R1990', 'Parkeerplaats/parkeren bij contractwijziging moet in de Schiphol-inrichting zijn beoordeeld.']
  ];
  for (const [field, ruleId, message] of booleanChecks) {
    if (booleanOrNull(input[field]) === false) manualItems.push(review(ruleId, 'airport_schiphol_agreements', message, field));
  }

  const contiguousVacationDays = numberOrNull(input.schiphol_contiguous_vacation_days_may_october);
  if (contiguousVacationDays !== null && contiguousVacationDays < 10) {
    manualItems.push(review('CAO-PB-2024-R1991', 'airport_schiphol_agreements', 'Schiphol-afspraak vereist 10 aaneengesloten vakantiedagen in mei t/m oktober.', 'schiphol_contiguous_vacation_days_may_october'));
  }

  if (booleanOrNull(input.schiphol_intern_replaces_employee) === true) {
    manualItems.push(review('CAO-PB-2024-R2001', 'airport_schiphol_agreements', 'Stagiairs mogen niet als vervanging van reguliere werknemers worden ingezet.', 'schiphol_intern_replaces_employee'));
  }
  if (booleanOrNull(input.schiphol_intern_night_work) === true) {
    manualItems.push(review('CAO-PB-2024-R2001', 'airport_schiphol_agreements', 'Stagiairs mogen niet in nachtdiensten worden ingezet.', 'schiphol_intern_night_work'));
  }
  if (booleanOrNull(input.schiphol_intern_public_transport_reimbursed) === false) {
    manualItems.push(review('CAO-PB-2024-R2001', 'airport_schiphol_agreements', 'OV-kosten van stagiairs moeten worden vergoed volgens de Schiphol-afspraak.', 'schiphol_intern_public_transport_reimbursed'));
  }

  const lastWorkPressureMeasurementDate = input.schiphol_work_pressure_measurement_last_date || null;
  const lastMeasurement = lastWorkPressureMeasurementDate ? new Date(`${String(lastWorkPressureMeasurementDate).slice(0, 10)}T00:00:00Z`) : null;
  const nextMeasurementDue = lastMeasurement && !Number.isNaN(lastMeasurement.getTime())
    ? new Date(Date.UTC(lastMeasurement.getUTCFullYear() + 4, lastMeasurement.getUTCMonth(), lastMeasurement.getUTCDate())).toISOString().slice(0, 10)
    : null;
  if (!nextMeasurementDue) {
    manualItems.push(review('CAO-PB-2024-R2011', 'airport_schiphol_agreements', 'Laatste Schiphol-werkdrukmeting ontbreekt; vierjaarlijkse meetplicht kan niet worden bewaakt.', 'schiphol_work_pressure_measurement_last_date'));
  } else if (nextMeasurementDue < new Date().toISOString().slice(0, 10)) {
    manualItems.push(review('CAO-PB-2024-R2011', 'airport_schiphol_agreements', 'Schiphol-werkdrukmeting is ouder dan vier jaar of opnieuw verschuldigd.', 'schiphol_work_pressure_measurement_last_date'));
  }

  return {
    source_rule_ids: [
      'CAO-PB-2024-R1957', 'CAO-PB-2024-R1959', 'CAO-PB-2024-R1962',
      'CAO-PB-2024-R1965', 'CAO-PB-2024-R1966', 'CAO-PB-2024-R1971',
      'CAO-PB-2024-R1979', 'CAO-PB-2024-R1983', 'CAO-PB-2024-R1984',
      'CAO-PB-2024-R1985', 'CAO-PB-2024-R1987', 'CAO-PB-2024-R1989',
      'CAO-PB-2024-R1990', 'CAO-PB-2024-R1991', 'CAO-PB-2024-R1993',
      'CAO-PB-2024-R2001', 'CAO-PB-2024-R2003', 'CAO-PB-2024-R2006',
      'CAO-PB-2024-R2008', 'CAO-PB-2024-R2010', 'CAO-PB-2024-R2011',
      'CAO-PB-2024-R2012', 'CAO-PB-2024-R2013', 'CAO-PB-2024-R2018',
      'CAO-PB-2024-R2024', 'CAO-PB-2024-R2026', 'CAO-PB-2024-R2028',
      'CAO-PB-2024-R2035', 'CAO-PB-2024-R2053', 'CAO-PB-2024-R2055'
    ],
    policy_scope: 'airport_schiphol_security_agreements',
    handled_by_runtime_functions: {
      labor_market_allowance_and_historical_payroll: 'calculatePersonnelCosts.schiphol_payroll_allowances',
      travel_parking_and_ppe_reimbursements: 'calculateCaoReimbursements.schiphol_reimbursements_article_94_96',
      standing_time_entry_moments_and_roster_constraints: 'validateCaoScheduleRules.schiphol_airport_schedule_policy'
    },
    required_controls: {
      fair_labor_and_healthy_work_conditions_reviewed: booleanOrNull(input.fair_labor_and_healthy_work_conditions_reviewed),
      legal_and_cao_compliance_confirmed: booleanOrNull(input.schiphol_legal_and_cao_compliance_confirmed),
      basic_facilities_available: booleanOrNull(input.schiphol_basic_facilities_available),
      independent_reporting_point_available: booleanOrNull(input.schiphol_independent_reporting_point_available),
      rest_facilities_improvement_plan_available: booleanOrNull(input.schiphol_rest_facilities_improvement_plan_available),
      socially_responsible_commissioning_confirmed: booleanOrNull(input.schiphol_socially_responsible_commissioning_confirmed),
      equipment_pooling_policy_confirmed: booleanOrNull(input.schiphol_equipment_pooling_policy_confirmed),
      license_to_operate_requirements_confirmed: booleanOrNull(input.schiphol_license_to_operate_requirements_confirmed),
      union_facilities_available: booleanOrNull(input.schiphol_union_facilities_available),
      landside_union_room_available: booleanOrNull(input.schiphol_landside_union_room_available),
      peace_obligation_acknowledged: booleanOrNull(input.schiphol_peace_obligation_acknowledged)
    },
    internship_policy: {
      interns_may_not_replace_regular_employees: true,
      interns_may_not_work_night_services: true,
      public_transport_reimbursement_required: true,
      intern_replaces_employee: booleanOrNull(input.schiphol_intern_replaces_employee),
      intern_night_work: booleanOrNull(input.schiphol_intern_night_work),
      intern_public_transport_reimbursed: booleanOrNull(input.schiphol_intern_public_transport_reimbursed)
    },
    vacation_policy: {
      may_to_october_contiguous_vacation_days_required: 10,
      configured_contiguous_vacation_days_may_october: contiguousVacationDays,
      compliant: contiguousVacationDays === null ? null : contiguousVacationDays >= 10
    },
    work_pressure_measurement: {
      frequency_years: 4,
      last_measurement_date: lastWorkPressureMeasurementDate,
      next_measurement_due_date: nextMeasurementDue,
      results_shared_with_unions_required: true
    },
    source_acknowledgements: {
      wpbl_sector_cao_consultation_reference: true,
      social_agreement_signatory_reference_lines: ['CAO-PB-2024-R2024', 'CAO-PB-2024-R2026', 'CAO-PB-2024-R2028', 'CAO-PB-2024-R2053', 'CAO-PB-2024-R2055']
    },
    manual_review_required: manualItems.length > 0,
    manual_review_items: manualItems
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const caoKey = body.cao_key || CAO_PB_KEY;
    if (caoKey !== CAO_PB_KEY) {
      return Response.json({
        success: false,
        error: `resolveCaoGovernanceCompliancePolicy ondersteunt ${caoKey} nog niet.`,
        supported_cao_keys: [CAO_PB_KEY]
      }, { status: 400 });
    }

    const policies = {
      wpbr_applicability: buildWpbrApplicabilityPolicy(body),
      control_evidence_package: buildControlEvidencePackage(body),
      sfpb_damage_compensation: buildDamageCompensation(body),
      contract_employment_governance: buildContractEmploymentGovernancePolicy(body),
      safety_risk_working_conditions: buildSafetyRiskWorkingConditionsPolicy(body),
      employer_compliance: buildEmployerCompliancePolicy(body),
      social_union_policy: buildSocialUnionPolicy(body),
      travel_reimbursement_system: buildTravelReimbursementSystemPolicy(body),
      vacation_allocation_points: buildVacationAllocationPoints(body),
      contract_change_vacation_transfer: buildContractChangeTransferPolicy(body),
      contract_change_mutation_list: buildMutationListTemplatePolicy(),
      protocols: buildProtocolsPolicy(),
      dispensation_request_process: buildDispensationRequestProcessPolicy(body),
      schiphol_social_agreement: buildSchipholSocialAgreementPolicy(body)
    };

    const manualReviewItems = Object.values(policies).flatMap(policy => policy.manual_review_items || []);
    return Response.json({
      success: true,
      cao_key: caoKey,
      policies,
      manual_review_required: manualReviewItems.length > 0,
      manual_review_items: manualReviewItems,
      source_rule_ids: [...new Set(Object.values(policies).flatMap(policy => policy.source_rule_ids || []))]
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
});

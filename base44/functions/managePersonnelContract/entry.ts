import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const CAO_PB_KEY = 'cao_particuliere_beveiliging';
const CAO_EHB_KEY = 'cao_evenementen_horecabeveiliging';
const FLEX_REFORM_EFFECTIVE_DATE = '2028-01-01';
const FUNCTION_POLICY_VERSION = 'employee-contract-routing-v2';
const CHAIN_POLICY_VERSION = 'nl-chain-rule-2026-v1';

const COMMITTED_DOCUMENT_STATUSES = new Set(['signed', 'scheduled', 'active', 'expired']);
const EHB_EXTENDED_CHAIN_LEVELS = new Set(['a', 'b', 'c', 'd']);

function todayIsoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function isLegallyCommittedContract(contract) {
  if (COMMITTED_DOCUMENT_STATUSES.has(contract?.document_status)) return true;
  return contract?.document_status === 'archived'
    && !!(contract?.signed_at || contract?.signed_file_id || contract?.signed_file_url);
}

function dateKey(value, fallback = '9999-12-31') {
  return value ? String(value).slice(0, 10) : fallback;
}

function rangesOverlap(startA, endA, startB, endB) {
  const aStart = dateKey(startA, '0000-01-01');
  const aEnd = dateKey(endA);
  const bStart = dateKey(startB, '0000-01-01');
  const bEnd = dateKey(endB);
  return aStart <= bEnd && bStart <= aEnd;
}

function addMonths(value, months) {
  if (!value || !Number.isFinite(Number(months))) return null;
  const date = new Date(`${dateKey(value)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const originalDay = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(months), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function calendarMonthsBetween(start, end) {
  if (!start || !end) return null;
  const from = new Date(`${dateKey(start)}T00:00:00.000Z`);
  const to = new Date(`${dateKey(end)}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  return Math.round((days / 30.4375) * 100) / 100;
}

function ageOnDate(dateOfBirth, referenceDate) {
  if (!dateOfBirth || !referenceDate) return null;
  const birth = new Date(`${dateKey(dateOfBirth)}T00:00:00.000Z`);
  const reference = new Date(`${dateKey(referenceDate)}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime()) || reference < birth) return null;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = reference.getUTCMonth() < birth.getUTCMonth()
    || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function contractFunctionKeys(contract) {
  const assignments = normalizeArray(contract?.function_assignments)
    .map(item => normalizeToken(item?.function_key))
    .filter(Boolean);
  const legacy = [
    normalizeToken(contract?.function_type),
    ...normalizeArray(contract?.allowed_function_types).map(normalizeToken)
  ].filter(Boolean);
  return unique([...assignments, ...legacy]).filter(value => !['unknown', 'all'].includes(value));
}

function normalizePrimaryFunctionState(contract) {
  const functionKeys = contractFunctionKeys(contract);
  if (functionKeys.length === 0) {
    return {
      function_type: null,
      primary_function_status: null,
      primary_function_source: null
    };
  }

  const currentFunction = normalizeToken(contract?.function_type);
  const currentIsAllowed = functionKeys.includes(currentFunction);
  const source = normalizeToken(contract?.primary_function_source);
  const status = normalizeToken(contract?.primary_function_status);

  if (functionKeys.length === 1) {
    return {
      function_type: functionKeys[0],
      primary_function_status: 'determined',
      primary_function_source: source === 'worked_services' ? 'worked_services' : 'single_contract_function'
    };
  }

  if (currentIsAllowed && status === 'determined' && ['worked_services', 'legacy_contract'].includes(source)) {
    return {
      function_type: currentFunction,
      primary_function_status: 'determined',
      primary_function_source: source
    };
  }

  return {
    function_type: currentIsAllowed ? currentFunction : functionKeys[0],
    primary_function_status: 'pending_work_history',
    primary_function_source: 'provisional_contract_start'
  };
}

function contractCaoFunctionLevels(contract) {
  const assignmentLevels = normalizeArray(contract?.function_assignments)
    .map(item => normalizeToken(item?.cao_function_level))
    .filter(Boolean);
  const legacyLevels = [
    normalizeToken(contract?.cao_function_level),
    ...normalizeArray(contract?.allowed_cao_function_levels).map(normalizeToken)
  ].filter(Boolean);
  return unique([...assignmentLevels, ...legacyLevels]);
}

function buildFunctionAssignments(contract) {
  const primaryState = normalizePrimaryFunctionState(contract);
  const primaryKey = primaryState.function_type;
  const primaryIsDetermined = primaryState.primary_function_status === 'determined';
  const existing = normalizeArray(contract?.function_assignments)
    .map(item => ({
      function_key: normalizeToken(item?.function_key),
      function_label: item?.function_label || null,
      is_primary: item?.is_primary === true,
      cao_function_group: item?.cao_function_group || contract?.cao_function_group || null,
      cao_function_level: item?.cao_function_level || contract?.cao_function_level || null,
      cao_scale: item?.cao_scale ?? contract?.cao_scale ?? null
    }))
    .filter(item => item.function_key && !['unknown', 'all'].includes(item.function_key));
  const byKey = new Map(existing.map(item => [item.function_key, item]));
  contractFunctionKeys(contract).forEach(functionKey => {
    const previous = byKey.get(functionKey) || {};
    byKey.set(functionKey, {
      function_key: functionKey,
      function_label: previous.function_label || null,
      is_primary: primaryIsDetermined && functionKey === primaryKey,
      cao_function_group: previous.cao_function_group || contract?.cao_function_group || null,
      cao_function_level: previous.cao_function_level || contract?.cao_function_level || null,
      cao_scale: previous.cao_scale ?? contract?.cao_scale ?? null
    });
  });
  const assignments = [...byKey.values()];
  if (primaryIsDetermined && assignments.length > 0 && !assignments.some(item => item.is_primary)) {
    const primaryAssignment = assignments.find(item => item.function_key === primaryKey) || assignments[0];
    primaryAssignment.is_primary = true;
  }
  return assignments;
}

function isOriginallyFixedTermEmployment(contract) {
  const model = normalizeToken(contract?.employment_contract_model);
  const legalType = contract?.legal_document_type || 'employment_agreement';
  if (legalType !== 'employment_agreement') return false;
  if (['internship', 'bbl', 'zzp', 'hired_worker'].includes(model)) return false;
  if (contract?.learning_route === 'bbl') return false;
  if (contract?.contract_form === 'bepaalde_tijd') return true;
  return contract?.contract_form === 'oproep' && contract?.underlying_contract_form === 'bepaalde_tijd';
}

function isFixedTermEmployment(contract) {
  if (contract?.statutory_conversion_applies === true || contract?.effective_duration_type === 'indefinite') return false;
  return isOriginallyFixedTermEmployment(contract);
}

function effectiveContractEndDate(contract) {
  if (contract?.effective_contract_end_date) {
    return contract.effective_contract_end_date;
  }
  if (contract?.statutory_conversion_applies === true || contract?.effective_duration_type === 'indefinite') return null;
  return contract?.contract_end_date || null;
}

function effectiveDurationType(contract) {
  if (contract?.statutory_conversion_applies === true) return 'indefinite';
  return contract?.effective_duration_type
    || contract?.duration_type
    || (isOriginallyFixedTermEmployment(contract) ? 'fixed' : 'indefinite');
}

function isChainExcluded(contract) {
  const model = normalizeToken(contract?.employment_contract_model);
  return contract?.legal_document_type !== 'employment_agreement'
    || contract?.learning_route === 'bbl'
    || ['internship', 'bbl', 'zzp', 'hired_worker'].includes(model);
}

function agreementDate(contract) {
  return dateKey(
    contract?.contract_agreed_at
      || contract?.signing_date
      || contract?.signed_at
      || contract?.contract_start_date,
    '0000-01-01'
  );
}

function resolveChainProfile(contract) {
  const agreedAt = agreementDate(contract);
  const interruptionMonths = agreedAt >= FLEX_REFORM_EFFECTIVE_DATE ? 36 : 6;
  let contractLimit = 3;
  let periodLimitMonths = 36;
  let profile = 'statutory_3_in_36';
  let sourceRuleIds = ['BW7:668a-current-3-in-36'];

  const legacyCaoExtensionAllowed = agreedAt < FLEX_REFORM_EFFECTIVE_DATE;
  const ehbFunctionLevels = contractCaoFunctionLevels(contract);
  const ehbExtensionCandidate = legacyCaoExtensionAllowed && contract?.cao_key === CAO_EHB_KEY;
  const ehbExtensionAllowed = ehbExtensionCandidate
    && ehbFunctionLevels.length > 0
    && ehbFunctionLevels.every(level => EHB_EXTENDED_CHAIN_LEVELS.has(level));
  if (contract?.employee_already_receives_aow === true || contract?.call_contract_exception_profile === 'aow') {
    contractLimit = 6;
    periodLimitMonths = 48;
    profile = 'statutory_aow_6_in_48';
    sourceRuleIds.push('BW7:668a-AOW-6-in-48');
  } else if (ehbExtensionAllowed) {
    contractLimit = 6;
    periodLimitMonths = 48;
    profile = 'cao_ehb_6_in_48';
    sourceRuleIds.push('CAO-EHB-chain-exception-6-in-48');
  }

  if (agreedAt >= FLEX_REFORM_EFFECTIVE_DATE
    && ['student', 'pupil'].includes(contract?.call_contract_exception_profile)
    && Number(contract?.call_contract_exception_average_hours_per_week) <= 16) {
    sourceRuleIds.push('BW7:668a-11-student-pupil-6-month-interruption');
    return {
      contractLimit,
      periodLimitMonths,
      interruptionMonths: 6,
      profile: `${profile}_student_pupil`,
      sourceRuleIds,
      ehbExtensionCandidate,
      ehbExtensionAllowed,
      ehbFunctionLevels
    };
  }

  if (interruptionMonths === 36) sourceRuleIds.push('Wmzf-2028-chain-interruption-36-months');
  return {
    contractLimit,
    periodLimitMonths,
    interruptionMonths,
    profile,
    sourceRuleIds,
    ehbExtensionCandidate,
    ehbExtensionAllowed,
    ehbFunctionLevels
  };
}

function legalEmployerKey(contract, companyById) {
  const company = companyById.get(String(contract?.company_id || '')) || null;
  const kvk = normalizeToken(company?.kvk_number);
  return kvk ? `kvk:${kvk}` : `company:${contract?.company_id || 'unknown'}`;
}

function evaluateChain(candidate, contracts, companyById, personnel = null) {
  if (!isOriginallyFixedTermEmployment(candidate)) {
    return {
      status: isChainExcluded(candidate) ? 'not_applicable' : 'not_applicable',
      position: null,
      profile: null,
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      source_rule_ids: []
    };
  }


  const employeeAge = ageOnDate(personnel?.date_of_birth, agreementDate(candidate));
  const minorAverageHours = Number(candidate?.call_contract_exception_average_hours_per_week);
  const minorChainHours = Number.isFinite(minorAverageHours) && minorAverageHours >= 0
    ? minorAverageHours
    : weeklyHours(candidate);
  if (employeeAge !== null && employeeAge < 18 && minorChainHours > 0 && minorChainHours <= 12) {
    return {
      status: 'not_applicable',
      position: null,
      profile: 'minor_under_18_up_to_12_hours',
      blocking_reasons: [],
      manual_review_reasons: [],
      warnings: [],
      source_rule_ids: ['BW7:668a-minor-exclusion']
    };
  }

  const profile = resolveChainProfile(candidate);
  const employerKey = legalEmployerKey(candidate, companyById);
  const aowHistoryBoundary = profile.profile === 'statutory_aow_6_in_48'
    ? candidate?.employee_aow_date || null
    : null;
  const historical = contracts
    .filter(contract => contract.id !== candidate.id)
    .filter(isLegallyCommittedContract)
    .filter(isFixedTermEmployment)
    .filter(contract => legalEmployerKey(contract, companyById) === employerKey)
    .filter(contract => !aowHistoryBoundary || dateKey(contract.contract_start_date, '0000-01-01') >= aowHistoryBoundary);
  const markedCandidate = { ...candidate, __candidate_marker: true };
  const chainContracts = [...historical, markedCandidate]
    .filter(contract => contract.contract_start_date)
    .sort((a, b) => dateKey(a.contract_start_date, '0000-01-01').localeCompare(dateKey(b.contract_start_date, '0000-01-01')));
  const resolvedCandidateIndex = chainContracts.findIndex(contract => contract.__candidate_marker === true);
  let chainStartIndex = resolvedCandidateIndex;

  for (let index = resolvedCandidateIndex; index > 0; index -= 1) {
    const previous = chainContracts[index - 1];
    const current = chainContracts[index];
    if (!previous.contract_end_date || !current.contract_start_date) break;
    const resetAfter = addMonths(previous.contract_end_date, profile.interruptionMonths);
    if (resetAfter && current.contract_start_date > resetAfter) break;
    chainStartIndex = index - 1;
  }

  const currentChain = chainContracts.slice(chainStartIndex, resolvedCandidateIndex + 1);
  const externalHistory = candidate?.chain_external_history || {};
  const externalResetAfter = addMonths(externalHistory.last_end_date, profile.interruptionMonths);
  const externalChainConnected = candidate?.prior_similar_work_status === 'yes'
    && externalHistory.successor_employer_confirmed === true
    && !!externalHistory.last_end_date
    && !!candidate.contract_start_date
    && !!externalResetAfter
    && candidate.contract_start_date <= externalResetAfter;
  const externalCount = externalChainConnected
    ? Math.max(0, Number(externalHistory.contract_count || 0))
    : 0;
  const position = currentChain.length + externalCount;
  const firstStart = (externalChainConnected ? externalHistory.first_start_date : null)
    || currentChain[0]?.contract_start_date
    || candidate.contract_start_date;
  const totalMonths = calendarMonthsBetween(firstStart, candidate.contract_end_date);
  const periodLimitExclusive = addMonths(firstStart, profile.periodLimitMonths);
  const blockingReasons = [];
  const manualReviewReasons = [];
  const warnings = [];
  const conversionReasons = [];
  const conversionDates = [];
  const committedContract = isLegallyCommittedContract(candidate);

  if (profile.ehbExtensionCandidate && !profile.ehbExtensionAllowed) {
    if (profile.ehbFunctionLevels.length === 0) {
      warnings.push('De CAO EHB-uitzondering van maximaal 6 tijdelijke contracten in 48 maanden is niet toegepast, omdat functieniveau a, b, c of d niet expliciet is vastgelegd. De wettelijke 3-in-36-regel blijft gelden.');
    } else {
      warnings.push(`De CAO EHB-uitzondering van maximaal 6 tijdelijke contracten in 48 maanden is niet toegepast op functieniveau ${profile.ehbFunctionLevels.join(', ')}. Deze uitzondering geldt uitsluitend voor de functies a tot en met d uit artikel 17 lid 2.`);
    }
  }

  if (profile.profile === 'statutory_aow_6_in_48' && !aowHistoryBoundary) {
    manualReviewReasons.push('Leg de AOW-datum vast om te bepalen welke tijdelijke contracten binnen de bijzondere AOW-keten van 6 contracten in 48 maanden vallen.');
  }

  if (candidate?.prior_similar_work_status === 'yes') {
    if (!externalHistory.contract_count || !externalHistory.last_end_date || externalHistory.successor_employer_confirmed === null || externalHistory.successor_employer_confirmed === undefined) {
      manualReviewReasons.push('Externe contracthistorie of opvolgend werkgeverschap is nog niet volledig beoordeeld.');
    } else if (externalHistory.successor_employer_confirmed === true && !externalChainConnected) {
      warnings.push('De vastgelegde externe contracthistorie valt door de onderbreking buiten de huidige keten en is daarom niet meegeteld.');
    } else if (externalHistory.successor_employer_confirmed === false) {
      warnings.push('De vorige werkgever is niet als opvolgend werkgever beoordeeld; externe contracten zijn daarom niet meegeteld.');
    }
  }
  if (!candidate.contract_end_date) {
    blockingReasons.push('Een tijdelijk arbeidscontract moet een bepaalbare einddatum hebben.');
  }
  if (position > profile.contractLimit) {
    const reason = `Dit is contract ${position} in de keten, terwijl binnen dit profiel maximaal ${profile.contractLimit} tijdelijke contracten zijn toegestaan.`;
    if (committedContract) {
      conversionReasons.push(reason);
      conversionDates.push(candidate.contract_start_date);
    } else {
      blockingReasons.push(`${reason} Kies voor het nieuwe contract onbepaalde tijd.`);
    }
  }
  if (candidate.contract_end_date && periodLimitExclusive && candidate.contract_end_date >= periodLimitExclusive) {
    const reason = `De aaneengesloten keten duurt circa ${totalMonths} maanden en overschrijdt de grens van ${profile.periodLimitMonths} maanden.`;
    if (committedContract) {
      conversionReasons.push(reason);
      conversionDates.push(periodLimitExclusive);
    } else {
      blockingReasons.push(`${reason} Kies voor het nieuwe contract onbepaalde tijd of pas de looptijd aan.`);
    }
  }
  if (position === profile.contractLimit && blockingReasons.length === 0) {
    warnings.push('Dit is het laatste tijdelijke contract binnen de berekende keten. Een volgende aaneengesloten overeenkomst moet opnieuw juridisch worden beoordeeld.');
  }
  const statutoryConversionApplies = conversionReasons.length > 0;
  const statutoryConversionEffectiveDate = conversionDates.filter(Boolean).sort()[0] || null;
  if (statutoryConversionApplies) {
    warnings.push(`Deze reeds aangegane overeenkomst geldt van rechtswege als een arbeidsovereenkomst voor onbepaalde tijd vanaf ${statutoryConversionEffectiveDate || 'de wettelijke omzettingsdatum'}. Het document blijft ongewijzigd; planning en payroll gebruiken de juridisch effectieve duur.`);
  }

  return {
    status: blockingReasons.length > 0
      ? 'blocked'
      : statutoryConversionApplies
      ? 'converted_to_indefinite'
      : manualReviewReasons.length > 0
      ? 'manual_review_required'
      : 'compliant',
    policy_version: CHAIN_POLICY_VERSION,
    profile: profile.profile,
    position,
    contract_limit: profile.contractLimit,
    period_limit_months: profile.periodLimitMonths,
    interruption_months: profile.interruptionMonths,
    total_chain_months: totalMonths,
    counted_contract_ids: currentChain.map(contract => contract.id).filter(Boolean),
    external_contract_count: externalCount,
    recommended_duration_type: blockingReasons.length > 0 || statutoryConversionApplies ? 'indefinite' : null,
    statutory_conversion: {
      applies: statutoryConversionApplies,
      effective_date: statutoryConversionEffectiveDate,
      reasons: conversionReasons
    },
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons,
    warnings,
    source_rule_ids: profile.sourceRuleIds
  };
}

function evaluateFunctionConflicts(candidate, contracts, companyById) {
  const candidateFunctions = contractFunctionKeys(candidate);
  const candidateEmployerKey = legalEmployerKey(candidate, companyById);
  const conflicts = [];
  if (!candidate.company_id || !candidate.contract_start_date || candidateFunctions.length === 0) {
    return { status: 'not_checked', conflicts, blocking_reasons: [] };
  }

  contracts
    .filter(contract => contract.id !== candidate.id)
    .filter(isLegallyCommittedContract)
    .filter(contract => rangesOverlap(
      candidate.contract_start_date,
      effectiveContractEndDate(candidate),
      contract.contract_start_date,
      effectiveContractEndDate(contract)
    ))
    .forEach(contract => {
      const otherFunctions = contractFunctionKeys(contract);
      const duplicateFunctions = candidateFunctions.filter(key => otherFunctions.includes(key));
      if (legalEmployerKey(contract, companyById) === candidateEmployerKey) {
        conflicts.push({
          type: 'overlapping_contract_same_company',
          contract_id: contract.id,
          company_id: contract.company_id,
          duplicate_function_keys: duplicateFunctions,
          message: 'Bij dezelfde juridische werkgever mag in deze periode niet nog een afzonderlijk overlappend contract worden gebruikt; voeg de functies samen in één contract.'
        });
      } else if (duplicateFunctions.length > 0) {
        conflicts.push({
          type: 'duplicate_function_across_companies',
          contract_id: contract.id,
          company_id: contract.company_id,
          duplicate_function_keys: duplicateFunctions,
          message: `Dezelfde functie is in een overlappende periode al aan een ander bedrijf gekoppeld: ${duplicateFunctions.join(', ')}.`
        });
      }
    });

  return {
    status: conflicts.length > 0 ? 'blocked' : 'unique',
    policy_version: FUNCTION_POLICY_VERSION,
    function_keys: candidateFunctions,
    conflicts,
    blocking_reasons: conflicts.map(conflict => conflict.message)
  };
}

function assignmentCaoKey(assignment, configurationById) {
  if (assignment?.cao_key) return assignment.cao_key;
  return configurationById.get(String(assignment?.cao_configuration_id || ''))?.cao_key || null;
}

function evaluateCompanyCaoScope(candidate, assignments, configurationById) {
  if (!candidate?.company_id || !candidate?.cao_key || !candidate?.contract_start_date) {
    return { status: 'not_checked', blocking_reasons: [], warnings: [], matching_assignment_ids: [] };
  }

  const referenceDate = dateKey(candidate.contract_start_date);
  const activeAssignments = (assignments || []).filter(assignment =>
    assignment?.company_id === candidate.company_id
    && (!assignment.valid_from || dateKey(assignment.valid_from) <= referenceDate)
    && (!assignment.valid_until || dateKey(assignment.valid_until) >= referenceDate)
  );
  const matchingAssignments = activeAssignments.filter(assignment =>
    assignmentCaoKey(assignment, configurationById) === candidate.cao_key
  );
  const blockingReasons = [];
  const warnings = [];

  if (matchingAssignments.length === 0) {
    blockingReasons.push('De gekozen CAO is op de contractstartdatum niet actief gekoppeld aan het gekozen bedrijf.');
  } else {
    const activities = unique(matchingAssignments.flatMap(assignment =>
      normalizeArray(assignment?.applies_to_activities).map(normalizeToken)
    ));
    const functionKeys = contractFunctionKeys(candidate);
    if (!activities.includes('all')) {
      if (activities.length === 0) {
        blockingReasons.push('De actieve bedrijfs-CAO bevat nog geen toegestane functies. Configureer eerst de functiecontext bij het bedrijf.');
      } else {
        const disallowedFunctions = functionKeys.filter(functionKey => !activities.includes(functionKey));
        if (disallowedFunctions.length > 0) {
          blockingReasons.push(`De volgende contractfuncties zijn niet geactiveerd binnen deze bedrijfs-CAO: ${disallowedFunctions.join(', ')}.`);
        }
      }
    }
  }

  return {
    status: blockingReasons.length > 0 ? 'blocked' : 'compliant',
    blocking_reasons: blockingReasons,
    warnings,
    matching_assignment_ids: matchingAssignments.map(assignment => assignment.id).filter(Boolean)
  };
}

function weeklyHours(contract) {
  const direct = Number(contract?.contract_hours_per_week);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const max = Number(contract?.max_hours_per_week);
  if (Number.isFinite(max) && max > 0) return max;
  const perPeriod = Number(contract?.contract_hours_per_pay_period || contract?.max_hours_per_pay_period);
  return Number.isFinite(perPeriod) && perPeriod > 0 ? perPeriod / 4 : 0;
}

function minMaxHours(contract) {
  const numericOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const minPayPeriod = numericOrNull(contract?.min_hours_per_pay_period);
  const maxPayPeriod = numericOrNull(contract?.max_hours_per_pay_period);
  if (minPayPeriod !== null && maxPayPeriod !== null) {
    return { minimum: minPayPeriod, maximum: maxPayPeriod, period: 'loonperiode' };
  }
  const minWeek = numericOrNull(contract?.min_hours_per_week);
  const maxWeek = numericOrNull(contract?.max_hours_per_week);
  if (minWeek !== null && maxWeek !== null) {
    return { minimum: minWeek, maximum: maxWeek, period: 'week' };
  }
  return { minimum: null, maximum: null, period: null };
}

function evaluateCombinedHours(candidate, contracts) {
  const overlapping = contracts
    .filter(contract => contract.id !== candidate.id)
    .filter(isLegallyCommittedContract)
    .filter(contract => rangesOverlap(
      candidate.contract_start_date,
      effectiveContractEndDate(candidate),
      contract.contract_start_date,
      effectiveContractEndDate(contract)
    ));
  const total = Math.round(([candidate, ...overlapping].reduce((sum, contract) => sum + weeklyHours(contract), 0)) * 100) / 100;
  const warnings = [];
  const manualReviewReasons = [];
  if (total > 48) warnings.push(`De gezamenlijke contractomvang is circa ${total} uur per week. Controleer de feitelijke planning over alle werkgevers aan de Arbeidstijdenwet.`);
  if (total > 60) manualReviewReasons.push('De gezamenlijke maximale contractomvang komt boven 60 uur per week; inzet mag pas na een expliciete arbeidstijdencontrole.');
  return {
    total_weekly_hours: total,
    overlapping_contract_ids: overlapping.map(contract => contract.id).filter(Boolean),
    warnings,
    manual_review_reasons: manualReviewReasons
  };
}

function evaluateFutureFlexRules(candidate, personnel = null) {
  const blockers = [];
  const warnings = [];
  const manualReviewReasons = [];
  const agreedAt = agreementDate(candidate);
  const model = normalizeToken(candidate?.employment_contract_model);
  const legacyCallModel = ['zero_hours', 'call_agreement', 'min_max'].includes(model);
  const band = minMaxHours(candidate);
  const validMinMaxBand = model === 'min_max'
    && band.minimum !== null
    && band.maximum !== null
    && band.minimum > 0
    && band.maximum >= band.minimum;
  const statutoryBandwidth = validMinMaxBand && band.maximum <= band.minimum * 1.3;
  const normalizedContract = {};

  if (model === 'min_max' && !validMinMaxBand) {
    blockers.push('Een min-maxcontract vereist een minimum groter dan nul en een maximum dat ten minste gelijk is aan het minimum.');
  }
  const continuesAfterReform = legacyCallModel
    && dateKey(candidate?.contract_start_date, '0000-01-01') < FLEX_REFORM_EFFECTIVE_DATE
    && dateKey(candidate?.contract_end_date) >= FLEX_REFORM_EFFECTIVE_DATE;
  if (agreedAt >= FLEX_REFORM_EFFECTIVE_DATE && legacyCallModel) {
    const profile = candidate?.call_contract_exception_profile || 'none';
    const averageHours = Number(candidate?.call_contract_exception_average_hours_per_week);
    const exceptionReferenceDate = dateKey(candidate?.contract_start_date, agreedAt) > agreedAt
      ? dateKey(candidate?.contract_start_date)
      : agreedAt;
    const employeeAge = ageOnDate(personnel?.date_of_birth, exceptionReferenceDate);
    const validHours = Number.isFinite(averageHours) && averageHours >= 0 && averageHours <= 16;
    const validMinor = profile === 'minor' && employeeAge !== null && employeeAge < 18;
    const validStudent = ['student', 'pupil'].includes(profile)
      && !!candidate?.call_contract_exception_evidence_reference
      && !!candidate?.call_contract_exception_valid_until
      && candidate.call_contract_exception_valid_until >= exceptionReferenceDate;
    const validAow = profile === 'aow'
      && candidate?.employee_already_receives_aow === true
      && !!candidate?.employee_aow_date
      && candidate.employee_aow_date <= exceptionReferenceDate;
    const exceptionValid = validHours && (validMinor || validStudent || validAow);

    if (statutoryBandwidth) {
      warnings.push(`Dit min-maxmodel voldoet inhoudelijk aan het wettelijke bandbreedtecontract: het maximum is ten hoogste 130% van het minimum per ${band.period}.`);
      Object.assign(normalizedContract, {
        contract_form: candidate?.underlying_contract_form || (candidate?.duration_type === 'indefinite' ? 'onbepaalde_tijd' : 'bepaalde_tijd'),
        underlying_contract_form: null,
        is_call_agreement: false,
        call_agreement_type: 'statutory_bandwidth',
        call_notice_days: 4,
        employee_notice_days: 4,
        payslip_call_agreement_indicator_required: false
      });
    } else if (!exceptionValid) {
      blockers.push('Voor overeenkomsten aangegaan vanaf 1 januari 2028 is een nuluren-/min-maxmodel alleen toegestaan binnen een aantoonbare wettelijke oproepuitzondering. Kies anders een bandbreedtecontract met minimaal meer dan nul uur en maximaal 130% daarvan.');
    } else {
      warnings.push('De oproepovereenkomst gebruikt een wettelijke uitzondering. Bewaak tijdens de looptijd dat gemiddeld maximaal 16 uur per week wordt gewerkt en dat eventueel inschrijvingsbewijs geldig blijft.');
    }
  } else if (continuesAfterReform) {
    warnings.push('Dit oproepcontract loopt door op 1 januari 2028. Het wordt dan van rechtswege een bandbreedtecontract, tenzij op dat moment aantoonbaar een wettelijke oproepuitzondering geldt; plan tijdig een contract- en urencontrole.');
  } else if (candidate?.contract_start_date >= FLEX_REFORM_EFFECTIVE_DATE && agreedAt < FLEX_REFORM_EFFECTIVE_DATE) {
    warnings.push('De startdatum ligt na 1 januari 2028. Het overgangsrecht is gebaseerd op de vastgelegde datum waarop de overeenkomst is aangegaan; controleer die datum zorgvuldig.');
  }
  return { blocking_reasons: blockers, manual_review_reasons: manualReviewReasons, warnings, normalized_contract: normalizedContract };
}

function requiredContext(candidate) {
  const missing = [];
  if (!candidate.personnel_id) missing.push('personnel_id');
  if (!candidate.company_id) missing.push('company_id');
  if (!candidate.cao_key && candidate.contract_form !== 'zzp') missing.push('cao_key');
  if (!candidate.contract_start_date) missing.push('contract_start_date');
  if (candidate.duration_type === 'fixed' && !candidate.contract_end_date) missing.push('contract_end_date');
  if (contractFunctionKeys(candidate).length === 0) missing.push('function_assignments');
  if (candidate.legal_document_type !== 'internship_agreement' && candidate.contract_form !== 'zzp' && !candidate.probation_agreed && candidate.probation_agreed !== false) {
    missing.push('probation_agreed');
  }
  return missing;
}

function evaluateWpbrActivation(candidate, personnel, companyWpbrLicenses = []) {
  const today = todayIsoDate();
  const contractStart = dateKey(candidate?.contract_start_date, today);
  const referenceDate = contractStart > today ? contractStart : today;
  const configuredLicenses = (companyWpbrLicenses || []).filter(license => (
    !!license?.license_type && normalizeToken(license?.status) !== 'superseded'
  ));
  const companyRequiresWpbr = configuredLicenses.length > 0;
  const required = candidate?.wpbr_required === true
    || candidate?.cao_key === CAO_PB_KEY
    || companyRequiresWpbr;
  const blockingReasons = [];
  const warnings = [];

  if (!required) {
    return {
      required: false,
      activation_allowed: true,
      reference_date: referenceDate,
      blocking_reasons: [],
      warnings: []
    };
  }

  const activeCompanyLicense = configuredLicenses.find(license => (
    normalizeToken(license?.status) !== 'expired'
    && dateKey(license?.valid_from, '0000-01-01') <= referenceDate
    && dateKey(license?.valid_until) >= referenceDate
  )) || null;
  if (!activeCompanyLicense) {
    blockingReasons.push(`De werkgever heeft op ${referenceDate} geen aantoonbaar geldige Wpbr-vergunning. Het contract mag niet actief of planningsgeschikt worden gemaakt.`);
  }

  // De actuele toestemming in het personeelsdossier gaat voor op de contractsnapshot.
  const status = personnel?.wpbr_status || candidate?.wpbr_status || null;
  const authority = personnel?.wpbr_authority || candidate?.wpbr_authority || null;
  const permissionNumber = personnel?.wpbr_permission_number || candidate?.wpbr_permission_number || null;
  const validFrom = dateKey(personnel?.wpbr_permission_valid_from || candidate?.wpbr_permission_valid_from, '');
  const validUntil = dateKey(personnel?.wpbr_permission_valid_until || candidate?.wpbr_permission_valid_until, '');

  if (status !== 'approved') {
    blockingReasons.push(status
      ? `De Wpbr-toestemming van de medewerker staat op '${status}' en is niet goedgekeurd.`
      : 'De status van de Wpbr-toestemming van de medewerker ontbreekt.');
  }
  if (!authority) blockingReasons.push('De bevoegde instantie van de Wpbr-toestemming ontbreekt.');
  if (!permissionNumber) blockingReasons.push('Het bewijsnummer van de Wpbr-toestemming ontbreekt.');
  if (!validFrom) blockingReasons.push('De ingangsdatum van de Wpbr-toestemming ontbreekt.');
  if (!validUntil) blockingReasons.push('De einddatum van de Wpbr-toestemming ontbreekt.');
  if (validFrom && validFrom > referenceDate) {
    blockingReasons.push(`De Wpbr-toestemming is pas geldig vanaf ${validFrom}, terwijl activering wordt beoordeeld op ${referenceDate}.`);
  }
  if (validUntil && validUntil < referenceDate) {
    blockingReasons.push(`De Wpbr-toestemming is verlopen op ${validUntil}, terwijl activering wordt beoordeeld op ${referenceDate}.`);
  }
  if (validUntil && validUntil >= referenceDate) {
    warnings.push(`De Wpbr-toestemming is geldig tot en met ${validUntil}. Planning na die datum blijft geblokkeerd totdat een geldige verlenging is vastgelegd.`);
  }

  return {
    required: true,
    activation_allowed: blockingReasons.length === 0,
    reference_date: referenceDate,
    company_license_id: activeCompanyLicense?.id || null,
    company_license_type: activeCompanyLicense?.license_type || null,
    wpbr_status: status,
    wpbr_authority: authority,
    wpbr_permission_number: permissionNumber,
    wpbr_permission_valid_from: validFrom || null,
    wpbr_permission_valid_until: validUntil || null,
    blocking_reasons: unique(blockingReasons),
    warnings: unique(warnings)
  };
}

async function evaluateContract(base44, candidateInput) {
  const primaryFunctionState = normalizePrimaryFunctionState(candidateInput);
  const normalizedInput = { ...candidateInput, ...primaryFunctionState };
  const candidate = {
    ...normalizedInput,
    function_assignments: buildFunctionAssignments(normalizedInput),
    allowed_function_types: contractFunctionKeys(normalizedInput)
  };

  const [contracts, companies, personnel, companyCaoAssignments, companyWpbrLicenses] = await Promise.all([
    base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id: candidate.personnel_id }).catch(() => []),
    base44.asServiceRole.entities.Company.list().catch(() => []),
    base44.asServiceRole.entities.Personnel.get(candidate.personnel_id).catch(() => null),
    candidate.company_id
      ? base44.asServiceRole.entities.CompanyCaoAssignment.filter({ company_id: candidate.company_id }).catch(() => [])
      : Promise.resolve([]),
    candidate.company_id
      ? base44.asServiceRole.entities.CompanyWpbrLicense.filter({ company_id: candidate.company_id }).catch(() => [])
      : Promise.resolve([])
  ]);
  const configurationIds = unique((companyCaoAssignments || [])
    .map(assignment => assignment?.cao_configuration_id)
    .filter(Boolean));
  const configurations = await Promise.all(configurationIds.map(configurationId =>
    base44.asServiceRole.entities.CAOConfiguration.get(configurationId).catch(() => null)
  ));
  const configurationById = new Map(configurations.filter(Boolean).map(configuration => [String(configuration.id), configuration]));
  const companyById = new Map((companies || []).map(company => [String(company.id), company]));
  const peers = (contracts || []).filter(contract => contract.id !== candidate.id);
  const missingFields = requiredContext(candidate);
  const companyCaoScope = evaluateCompanyCaoScope(candidate, companyCaoAssignments, configurationById);
  const chain = evaluateChain(candidate, peers, companyById, personnel);
  const candidateWithEffectiveDuration = chain.statutory_conversion?.applies
    ? {
        ...candidate,
        statutory_conversion_applies: true,
        effective_duration_type: 'indefinite',
        effective_contract_end_date: null
      }
    : candidate;
  const functionConflicts = evaluateFunctionConflicts(candidateWithEffectiveDuration, peers, companyById);
  const combinedHours = evaluateCombinedHours(candidateWithEffectiveDuration, peers);
  const flexRules = evaluateFutureFlexRules(candidate, personnel);
  const wpbrActivation = evaluateWpbrActivation(candidate, personnel, companyWpbrLicenses);
  const blockingReasons = unique([
    ...missingFields.map(field => `Verplicht contractgegeven ontbreekt: ${field}.`),
    ...companyCaoScope.blocking_reasons,
    ...functionConflicts.blocking_reasons,
    ...chain.blocking_reasons,
    ...flexRules.blocking_reasons
  ]);
  const manualReviewReasons = unique([
    ...chain.manual_review_reasons,
    ...combinedHours.manual_review_reasons,
    ...flexRules.manual_review_reasons
  ]);
  const warnings = unique([
    ...companyCaoScope.warnings,
    ...chain.warnings,
    ...combinedHours.warnings,
    ...flexRules.warnings,
    ...wpbrActivation.warnings,
    ...wpbrActivation.blocking_reasons.map(reason => `Activering geblokkeerd: ${reason}`)
  ]);
  const status = blockingReasons.length > 0
    ? 'blocked'
    : manualReviewReasons.length > 0
    ? 'manual_review_required'
    : 'compliant';

  return {
    status,
    can_generate: status === 'compliant',
    can_activate: status === 'compliant'
      && !!(candidate.signed_file_id || candidate.signed_file_url)
      && wpbrActivation.activation_allowed,
    missing_fields: missingFields,
    blocking_reasons: blockingReasons,
    manual_review_reasons: manualReviewReasons,
    warnings,
    function_conflicts: functionConflicts,
    company_cao_scope: companyCaoScope,
    wpbr_activation: wpbrActivation,
    chain,
    combined_hours: combinedHours,
    normalized_contract: {
      ...(flexRules.normalized_contract || {}),
      effective_duration_type: chain.statutory_conversion?.applies
        ? 'indefinite'
        : (candidate.duration_type || effectiveDurationType(candidate)),
      effective_contract_end_date: chain.statutory_conversion?.applies
        ? (candidate.ended_at ? (candidate.effective_contract_end_date || candidate.contract_end_date || null) : null)
        : (candidate.contract_end_date || null),
      statutory_conversion_applies: chain.statutory_conversion?.applies === true,
      statutory_conversion_effective_date: chain.statutory_conversion?.effective_date || null,
      statutory_conversion_reason: chain.statutory_conversion?.reasons?.join(' ') || null,
      function_type: candidate.function_type || null,
      allowed_function_types: candidate.allowed_function_types,
      function_assignments: candidate.function_assignments,
      function_assignment_policy_version: FUNCTION_POLICY_VERSION,
      primary_function_status: candidate.primary_function_status || null,
      primary_function_source: candidate.primary_function_source || null,
      wpbr_required: wpbrActivation.required,
      wpbr_status: wpbrActivation.wpbr_status || null,
      wpbr_authority: wpbrActivation.wpbr_authority || null,
      wpbr_permission_number: wpbrActivation.wpbr_permission_number || null,
      wpbr_permission_valid_from: wpbrActivation.wpbr_permission_valid_from || null,
      wpbr_permission_valid_until: wpbrActivation.wpbr_permission_valid_until || null,
      routing_snapshot: {
        company_id: candidate.company_id || null,
        cao_key: candidate.cao_key || null,
        function_keys: candidate.allowed_function_types,
        primary_function_key: candidate.primary_function_status === 'determined'
          ? (candidate.function_type || null)
          : null,
        primary_function_status: candidate.primary_function_status || null,
        primary_function_source: candidate.primary_function_source || null,
        policy_version: FUNCTION_POLICY_VERSION
      }
    },
    evaluated_at: nowIso()
  };
}

function evaluationPersistence(evaluation) {
  return {
    ...evaluation.normalized_contract,
    chain_evaluation_status: evaluation.chain.status,
    chain_position: evaluation.chain.position,
    chain_contract_limit: evaluation.chain.contract_limit ?? null,
    chain_period_limit_months: evaluation.chain.period_limit_months ?? null,
    chain_interruption_months: evaluation.chain.interruption_months ?? null,
    chain_evaluated_at: evaluation.evaluated_at,
    chain_evaluation_snapshot: evaluation.chain,
    chain_source_rule_ids: evaluation.chain.source_rule_ids || [],
    legal_validation_status: evaluation.status,
    legal_validation_checked_at: evaluation.evaluated_at,
    legal_validation_snapshot: {
      status: evaluation.status,
      blocking_reasons: evaluation.blocking_reasons,
      manual_review_reasons: evaluation.manual_review_reasons,
      warnings: evaluation.warnings,
      function_conflicts: evaluation.function_conflicts,
      company_cao_scope: evaluation.company_cao_scope,
      wpbr_activation: evaluation.wpbr_activation,
      combined_hours: evaluation.combined_hours
    },
    contract_context_status: evaluation.status === 'compliant'
      ? 'compliant'
      : evaluation.status === 'blocked'
      ? 'blocked'
      : 'manual_review_required',
    contract_context_missing_fields: evaluation.missing_fields || [],
    contract_context_checked_at: evaluation.evaluated_at
  };
}

function stripProtectedFields(input = {}) {
  const output = { ...input };
  [
    'id', 'created_date', 'updated_date', 'created_by',
    'document_status', 'is_current', 'planning_allowed', 'contract_final_allowed',
    'payroll_final_allowed', 'signed_at', 'activated_at', 'ended_at', 'archived_at',
    'legal_validation_status', 'legal_validation_checked_at', 'legal_validation_snapshot',
    'chain_evaluation_status', 'chain_position', 'chain_contract_limit',
    'chain_period_limit_months', 'chain_interruption_months', 'chain_evaluated_at',
    'chain_evaluation_snapshot', 'chain_source_rule_ids', 'routing_snapshot',
    'effective_duration_type', 'effective_contract_end_date',
    'statutory_conversion_applies', 'statutory_conversion_effective_date',
    'statutory_conversion_reason', 'history_revalidated_at', 'is_historical_import'
  ].forEach(field => delete output[field]);
  return output;
}

function auditMetadata(previous, user, action) {
  const metadata = previous && typeof previous === 'object' ? { ...previous } : {};
  const history = Array.isArray(metadata.contract_lifecycle_history) ? metadata.contract_lifecycle_history : [];
  return {
    ...metadata,
    contract_lifecycle_history: [
      ...history,
      { action, at: nowIso(), user_id: user?.id || null, user_email: user?.email || null }
    ].slice(-100)
  };
}

async function syncCompanyAssignment(base44, personnelId, companyId) {
  if (!personnelId || !companyId) return null;
  const [contracts, assignments] = await Promise.all([
    base44.asServiceRole.entities.PersonnelContract.filter({ personnel_id: personnelId }),
    base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: personnelId })
  ]);
  const today = todayIsoDate();
  const relevant = (contracts || []).filter(contract =>
    contract.company_id === companyId
    && ['active', 'scheduled'].includes(contract.document_status)
    && contract.legal_validation_status === 'compliant'
    && contract.is_current !== false
  );
  const activeNow = relevant.some(contract =>
    dateKey(contract.contract_start_date, '0000-01-01') <= today
    && dateKey(effectiveContractEndDate(contract)) >= today
  );
  const existing = (assignments || []).find(assignment => assignment.company_id === companyId) || null;
  const starts = relevant.map(contract => contract.contract_start_date).filter(Boolean).sort();
  const hasOpenEnd = relevant.some(contract => !effectiveContractEndDate(contract));
  const ends = relevant.map(effectiveContractEndDate).filter(Boolean).sort();
  const relationTypes = unique(relevant.map(contract => {
    if (contract.legal_document_type === 'internship_agreement') return 'intern';
    if (contract.contract_form === 'zzp') return 'contractor';
    return 'employee';
  }));
  const payload = {
    personnel_id: personnelId,
    company_id: companyId,
    cao_key: relevant[0]?.cao_key || existing?.cao_key || null,
    assignment_status: relevant.length === 0 ? 'ended' : activeNow ? 'active' : 'pending',
    available_for_planning: activeNow,
    relation_type: relationTypes.length === 1 ? relationTypes[0] : 'other',
    valid_from: starts[0] || existing?.valid_from || null,
    valid_until: hasOpenEnd ? null : (ends[ends.length - 1] || existing?.valid_until || null),
    source_contract_ids: relevant.map(contract => contract.id).filter(Boolean),
    managed_by_contracts: true,
    contract_sync_at: nowIso()
  };
  return existing
    ? base44.asServiceRole.entities.PersonnelCompanyAssignment.update(existing.id, payload)
    : base44.asServiceRole.entities.PersonnelCompanyAssignment.create(payload);
}

async function applyPbRules(base44, contract) {
  if (contract.cao_key !== CAO_PB_KEY) return { applicable: false, compliant: true, response: null };
  try {
    const response = await base44.asServiceRole.functions.invoke('applyCaoContractRules', {
      action: 'validate_contract',
      contract_id: contract.id,
      personnel_id: contract.personnel_id,
      cao_key: contract.cao_key,
      save: true
    });
    const data = response?.data || response || {};
    return {
      applicable: true,
      compliant: data.contract_final_allowed === true && data.manual_review_required !== true,
      response: data
    };
  } catch (error) {
    return {
      applicable: true,
      compliant: false,
      response: { error: error?.message || 'CAO PB-contractcontrole kon niet worden uitgevoerd.' }
    };
  }
}

function signedLifecycleStatus(contract) {
  const today = todayIsoDate();
  if (contract.is_historical_import === true && contract.contract_end_date && contract.contract_end_date < today) return 'expired';
  const effectiveEndDate = effectiveContractEndDate(contract);
  if (effectiveEndDate && effectiveEndDate < today) return 'expired';
  if (contract.contract_start_date && contract.contract_start_date > today) return 'scheduled';
  return 'active';
}

async function revalidateLaterContractHistory(base44, changedContract) {
  if (!changedContract?.personnel_id || !changedContract?.contract_start_date) return [];
  const contracts = await base44.asServiceRole.entities.PersonnelContract
    .filter({ personnel_id: changedContract.personnel_id })
    .catch(() => []);
  const candidates = (contracts || [])
    .filter(contract => contract.id !== changedContract.id)
    .filter(isLegallyCommittedContract)
    .filter(contract => dateKey(contract.contract_start_date, '0000-01-01') >= dateKey(changedContract.contract_start_date, '0000-01-01'))
    .sort((a, b) => dateKey(a.contract_start_date, '0000-01-01').localeCompare(dateKey(b.contract_start_date, '0000-01-01')));
  const updates = [];

  for (const contract of candidates) {
    const evaluation = await evaluateContract(base44, contract);
    const persisted = evaluationPersistence(evaluation);
    const pbReady = contract.cao_key !== CAO_PB_KEY
      || contract.cao_contract_rule_status === 'compliant'
      || contract.contract_final_allowed === true;
    const signedDocumentAvailable = !!(contract.signed_file_id || contract.signed_file_url || contract.signed_at);
    const canActivate = evaluation.can_activate && signedDocumentAvailable && pbReady;
    const lifecycleStatus = contract.document_status === 'archived'
      ? 'archived'
      : canActivate
      ? signedLifecycleStatus({ ...contract, ...persisted })
      : 'signed';
    const convertedNow = persisted.statutory_conversion_applies === true;
    const conversionChanged = convertedNow && contract.statutory_conversion_applies !== true;
    const updated = await base44.asServiceRole.entities.PersonnelContract.update(contract.id, {
      ...persisted,
      history_revalidated_at: nowIso(),
      document_status: lifecycleStatus,
      is_current: canActivate && lifecycleStatus !== 'expired' && lifecycleStatus !== 'archived',
      planning_allowed: canActivate && lifecycleStatus !== 'expired' && lifecycleStatus !== 'archived',
      contract_final_allowed: canActivate,
      payroll_final_allowed: canActivate && contract.cao_key === CAO_PB_KEY && pbReady
    });
    updates.push({
      contract_id: updated.id,
      document_status: updated.document_status,
      legal_validation_status: updated.legal_validation_status,
      statutory_conversion_applies: convertedNow,
      statutory_conversion_effective_date: updated.statutory_conversion_effective_date || null,
      conversion_changed: conversionChanged,
      message: conversionChanged
        ? `Een later contract geldt door de aangevulde contracthistorie vanaf ${updated.statutory_conversion_effective_date || 'de wettelijke omzettingsdatum'} van rechtswege voor onbepaalde tijd.`
        : null
    });
    await syncCompanyAssignment(base44, updated.personnel_id, updated.company_id);
  }

  return updates;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'evaluate';
    const isMutation = action !== 'evaluate';
    if (isMutation && user.role !== 'admin') {
      return Response.json({ error: 'Alleen beheerders mogen arbeidscontracten wijzigen.' }, { status: 403 });
    }

    if (action === 'evaluate') {
      const stored = body.contract_id
        ? await base44.asServiceRole.entities.PersonnelContract.get(body.contract_id).catch(() => null)
        : null;
      const candidate = { ...(stored || {}), ...(body.contract || {}) };
      if (!candidate.personnel_id) return Response.json({ error: 'personnel_id is verplicht.' }, { status: 400 });
      const evaluation = await evaluateContract(base44, candidate);
      return Response.json({ success: true, evaluation });
    }

    if (action === 'save_draft') {
      const input = stripProtectedFields(body.contract || {});
      if (!input.personnel_id) return Response.json({ error: 'personnel_id is verplicht.' }, { status: 400 });
      const existing = body.contract_id
        ? await base44.asServiceRole.entities.PersonnelContract.get(body.contract_id).catch(() => null)
        : null;
      if (existing && ['signed', 'active', 'scheduled', 'expired', 'archived'].includes(existing.document_status)) {
        return Response.json({ error: 'Een definitief contract is onveranderlijk. Maak een opvolgend contract of een nieuw concept.' }, { status: 409 });
      }
      if (existing && existing.personnel_id !== input.personnel_id) {
        return Response.json({ error: 'Een contractconcept kan niet naar een andere medewerker worden verplaatst.' }, { status: 409 });
      }
      const primaryFunctionState = normalizePrimaryFunctionState(input);
      const normalizedInput = { ...input, ...primaryFunctionState };
      const normalized = {
        ...normalizedInput,
        is_historical_import: input.source_type === 'uploaded_existing'
          && !!input.contract_end_date
          && input.contract_end_date < todayIsoDate(),
        function_assignments: buildFunctionAssignments(normalizedInput),
        allowed_function_types: contractFunctionKeys(normalizedInput),
        function_assignment_policy_version: FUNCTION_POLICY_VERSION,
        document_status: 'concept',
        is_current: false,
        planning_allowed: false,
        contract_final_allowed: false,
        payroll_final_allowed: false,
        legal_validation_status: 'draft',
        metadata: auditMetadata(existing?.metadata, user, existing ? 'draft_updated' : 'draft_created')
      };
      const record = existing
        ? await base44.asServiceRole.entities.PersonnelContract.update(existing.id, normalized)
        : await base44.asServiceRole.entities.PersonnelContract.create(normalized);
      const evaluation = await evaluateContract(base44, record);
      const updated = await base44.asServiceRole.entities.PersonnelContract.update(record.id, {
        ...evaluationPersistence(evaluation),
        document_status: 'concept',
        legal_validation_status: 'draft',
        is_current: false,
        planning_allowed: false,
        contract_final_allowed: false,
        payroll_final_allowed: false
      });
      return Response.json({ success: true, contract: updated, evaluation });
    }

    const contractId = body.contract_id;
    if (!contractId) return Response.json({ error: 'contract_id is verplicht.' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.PersonnelContract.get(contractId).catch(() => null);
    if (!existing) return Response.json({ error: 'Contract niet gevonden.' }, { status: 404 });

    if (action === 'attach_generated') {
      if (!['concept', 'generated'].includes(existing.document_status)) {
        return Response.json({ error: 'Alleen een concept of eerder gegenereerd contract kan een nieuw gegenereerd document krijgen.' }, { status: 409 });
      }
      if (!(body.generated_file_id || body.generated_file_url || existing.generated_file_id || existing.generated_file_url)) {
        return Response.json({ error: 'Een gegenereerd contractbestand is verplicht.' }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.PersonnelContract.update(contractId, {
        generated_file_url: body.generated_file_url || existing.generated_file_url || null,
        generated_file_id: body.generated_file_id || existing.generated_file_id || null,
        generated_download_filename: body.generated_download_filename || existing.generated_download_filename || null,
        generated_logical_path: body.generated_logical_path || existing.generated_logical_path || null,
        document_status: 'generated',
        is_current: false,
        planning_allowed: false,
        contract_final_allowed: false,
        payroll_final_allowed: false,
        metadata: auditMetadata(existing.metadata, user, 'generated_document_attached')
      });
      const evaluation = await evaluateContract(base44, updated);
      const evaluatedContract = await base44.asServiceRole.entities.PersonnelContract.update(contractId, evaluationPersistence(evaluation));
      return Response.json({ success: true, contract: evaluatedContract, evaluation });
    }

    if (action === 'archive') {
      if (['active', 'scheduled'].includes(existing.document_status)) {
        return Response.json({ error: 'Beëindig een lopend of toekomstig contract eerst. Archiveren mag een geldige arbeidsovereenkomst niet stilzwijgend uitschakelen.' }, { status: 409 });
      }
      const updated = await base44.asServiceRole.entities.PersonnelContract.update(contractId, {
        document_status: 'archived',
        archived_at: nowIso(),
        is_current: false,
        planning_allowed: false,
        contract_final_allowed: false,
        payroll_final_allowed: false,
        metadata: auditMetadata(existing.metadata, user, 'archived')
      });
      await syncCompanyAssignment(base44, existing.personnel_id, existing.company_id);
      const historyUpdates = await revalidateLaterContractHistory(base44, updated);
      return Response.json({ success: true, contract: updated, history_updates: historyUpdates });
    }

    if (action === 'end') {
      if (!['active', 'scheduled'].includes(existing.document_status)) {
        return Response.json({ error: 'Alleen een actief of ingepland contract kan via deze actie worden beëindigd.' }, { status: 409 });
      }
      const endDate = body.contract_end_date || todayIsoDate();
      if (existing.contract_start_date && endDate < existing.contract_start_date) {
        return Response.json({ error: 'De einddatum kan niet vóór de startdatum liggen.' }, { status: 400 });
      }
      const endedStatus = endDate < todayIsoDate()
        ? 'expired'
        : signedLifecycleStatus({ ...existing, contract_end_date: endDate });
      const updated = await base44.asServiceRole.entities.PersonnelContract.update(contractId, {
        contract_end_date: endDate,
        effective_contract_end_date: endDate,
        document_status: endedStatus,
        ended_at: nowIso(),
        is_current: endDate >= todayIsoDate(),
        planning_allowed: endDate >= todayIsoDate() && existing.planning_allowed === true,
        metadata: auditMetadata(existing.metadata, user, 'ended')
      });
      await syncCompanyAssignment(base44, existing.personnel_id, existing.company_id);
      const historyUpdates = await revalidateLaterContractHistory(base44, updated);
      return Response.json({ success: true, contract: updated, history_updates: historyUpdates });
    }

    if (!['register_signed', 'revalidate'].includes(action)) {
      return Response.json({ error: `Onbekende actie: ${action}.` }, { status: 400 });
    }

    if (action === 'register_signed' && !['concept', 'generated', 'signed'].includes(existing.document_status)) {
      return Response.json({ error: 'Een actief, verlopen of gearchiveerd contractdocument is onveranderlijk.' }, { status: 409 });
    }
    if (action === 'revalidate' && !['signed', 'scheduled', 'active', 'expired'].includes(existing.document_status)) {
      return Response.json({ error: 'Deze contractstatus kan niet opnieuw juridisch worden gevalideerd.' }, { status: 409 });
    }
    if (action === 'register_signed' && !(body.signed_file_id || body.signed_file_url || existing.signed_file_id || existing.signed_file_url)) {
      return Response.json({ error: 'Een getekend contractbestand is verplicht.' }, { status: 400 });
    }

    const signedPatch = action === 'register_signed'
      ? {
          signed_file_url: body.signed_file_url || existing.signed_file_url || null,
          signed_file_id: body.signed_file_id || existing.signed_file_id || null,
          signed_download_filename: body.signed_download_filename || existing.signed_download_filename || null,
          signed_logical_path: body.signed_logical_path || existing.signed_logical_path || null,
          contract_agreed_at: body.contract_agreed_at
            || existing.contract_agreed_at
            || existing.signing_date
            || (existing.source_type === 'uploaded_existing' ? existing.contract_start_date : null)
            || todayIsoDate(),
          signed_at: body.signed_at || nowIso(),
          document_status: 'signed',
          metadata: auditMetadata(existing.metadata, user, 'signed_document_registered')
        }
      : { metadata: auditMetadata(existing.metadata, user, 'revalidated') };
    let signedContract = await base44.asServiceRole.entities.PersonnelContract.update(contractId, {
      ...signedPatch,
      is_current: false,
      planning_allowed: false,
      contract_final_allowed: false,
      payroll_final_allowed: false
    });
    const evaluation = await evaluateContract(base44, signedContract);
    const pbRules = await applyPbRules(base44, signedContract);
    signedContract = await base44.asServiceRole.entities.PersonnelContract.get(contractId);
    const pbBlockingReason = pbRules.applicable && !pbRules.compliant
      ? 'De CAO Particuliere Beveiliging-contractcontrole is nog niet volledig compliant.'
      : null;
    const canActivate = evaluation.can_activate && !pbBlockingReason;
    const lifecycleStatus = canActivate ? signedLifecycleStatus(signedContract) : 'signed';
    const finalStatus = pbBlockingReason && evaluation.status === 'compliant'
      ? 'manual_review_required'
      : evaluation.status;
    const finalSnapshot = {
      ...evaluation,
      status: finalStatus,
      can_activate: canActivate,
      manual_review_reasons: unique([
        ...evaluation.manual_review_reasons,
        ...(pbBlockingReason ? [pbBlockingReason] : [])
      ]),
      cao_pb_runtime: pbRules.response
    };
    const updated = await base44.asServiceRole.entities.PersonnelContract.update(contractId, {
      ...evaluationPersistence(finalSnapshot),
      document_status: lifecycleStatus,
      activated_at: canActivate ? (signedContract.activated_at || nowIso()) : null,
      is_current: canActivate && lifecycleStatus !== 'expired',
      planning_allowed: canActivate && lifecycleStatus !== 'expired',
      contract_final_allowed: canActivate,
      payroll_final_allowed: canActivate && signedContract.cao_key === CAO_PB_KEY && pbRules.compliant,
      cao_contract_rule_status: pbRules.applicable
        ? (pbRules.compliant ? 'compliant' : 'manual_review_required')
        : (evaluation.status === 'compliant' ? 'not_applicable' : evaluation.status)
    });
    await syncCompanyAssignment(base44, updated.personnel_id, updated.company_id);
    const historyUpdates = await revalidateLaterContractHistory(base44, updated);
    const notifications = [
      ...(updated.statutory_conversion_applies === true ? [{
        type: 'statutory_conversion',
        contract_id: updated.id,
        message: `Dit contract geldt vanaf ${updated.statutory_conversion_effective_date || 'de wettelijke omzettingsdatum'} van rechtswege voor onbepaalde tijd. De oorspronkelijke contracttekst blijft als brondocument bewaard.`
      }] : []),
      ...historyUpdates.filter(item => item.message).map(item => ({
        type: 'history_revalidation',
        contract_id: item.contract_id,
        message: item.message
      }))
    ];
    return Response.json({
      success: true,
      contract: updated,
      evaluation: finalSnapshot,
      activated: canActivate,
      history_updates: historyUpdates,
      notifications
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Contractactie is mislukt.' }, { status: 500 });
  }
});

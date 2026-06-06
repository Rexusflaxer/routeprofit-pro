import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner/internal CAO coverage audit.
// This function does not approve or import CAO changes. It only recomputes the
// runtime coverage gate from the current CAOConfiguration + CAORule registry.

const PAYROLL_CRITICAL_DOMAINS = [
  'payroll', 'wage', 'wages', 'salary', 'loon', 'loontabel', 'allowance',
  'allowances', 'reimbursement', 'toeslag', 'surcharge', 'overtime',
  'overwerk', 'planning', 'schedule', 'rooster', 'contract', 'employment',
  'probation', 'proeftijd', 'dismissal', 'termination', 'opzegging',
  'leave', 'vacation', 'holiday', 'sickness', 'ziekte', 'pension', 'fund',
  'function_classification', 'classification', 'bijlage_2'
];

const CRITICAL_RULE_ID_NEEDLES = [
  'R031', 'R032', 'R037', 'R038', 'R039', 'R040', 'R041', 'R042', 'R043',
  'R047', 'R048', 'R056', 'R057', 'R058', 'R059', 'R064', 'R065', 'R066',
  'R067', 'R072', 'R073', 'R077', 'R079', 'R080', 'R081', 'R085', 'R087',
  'R088', 'R089', 'R090', 'R099', 'R114', 'R115', 'R116', 'R160', 'R175',
  'R181'
];

function normalizeDate(value) {
  return value ? String(value).slice(0, 10) : null;
}

function hasAnyNeedle(value, needles) {
  const text = String(value || '').toLowerCase();
  return needles.some(needle => text.includes(needle));
}

function hasWageScales(config) {
  return Object.keys(config?.wage_scales || {}).length > 0 ||
    Object.keys(config?.wage_scales_detailed || {}).length > 0;
}

function hasPayPeriods(config) {
  const payPeriods = config?.pay_periods;
  if (!payPeriods) return false;
  if (Array.isArray(payPeriods)) return payPeriods.length > 0;
  if (typeof payPeriods === 'object') return Object.keys(payPeriods).length > 0;
  return false;
}

function isReferenceOnly(rule) {
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const implementationStatus = String(rule.implementation_status || '').toUpperCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  return calculationPolicy === 'not_payroll' ||
    (['reference', 'reference_or_policy'].includes(automationLevel) && implementationStatus === 'REFERENCE');
}

function isPayrollCriticalRule(rule) {
  if (isReferenceOnly(rule)) return false;
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  return calculationPolicy === 'automatic' ||
    automationLevel === 'automatic_or_calculation' ||
    automationLevel === 'validation_or_policy' ||
    hasAnyNeedle(rule.domain, PAYROLL_CRITICAL_DOMAINS) ||
    hasAnyNeedle(rule.impact, ['payroll', 'calculation', 'planning', 'validation']) ||
    hasAnyNeedle(rule.rule_id, CRITICAL_RULE_ID_NEEDLES);
}

function hasRuntimeBinding(rule) {
  return rule.runtime_binding_status === 'verified_local_runtime' ||
    !!rule.runtime_binding_key ||
    (Array.isArray(rule.runtime_binding_functions) && rule.runtime_binding_functions.length > 0);
}

function hasTestEvidence(rule) {
  const tests = rule.tests;
  if (!tests) return false;
  if (Array.isArray(tests)) return tests.length > 0;
  if (typeof tests === 'object') return Object.keys(tests).length > 0;
  return false;
}

function countBy(collection, keyFn) {
  return collection.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeRule(rule, extra = {}) {
  return {
    rule_id: rule.rule_id || 'unknown',
    domain: rule.domain || null,
    article: rule.article || null,
    automation_level: rule.automation_level || null,
    implementation_status: rule.implementation_status || 'MISSING',
    manual_review_required: rule.manual_review_required === true,
    runtime_binding_status: rule.runtime_binding_status || null,
    runtime_binding_key: rule.runtime_binding_key || null,
    implemented_in: rule.implemented_in || [],
    risk_level: rule.risk_level || null,
    ...extra
  };
}

function evaluateCoverageGate(config, rules, options = {}) {
  const maxOpenRules = Math.max(1, Number(options.max_open_rules || 100));
  const counts = {
    total: rules.length,
    implemented: 0,
    partial: 0,
    missing: 0,
    reference: 0,
    unknown: 0,
    manual_review_required: 0,
    payroll_critical: 0,
    payroll_critical_open: 0,
    runtime_bound: 0,
    runtime_missing: 0,
    implemented_without_runtime_binding: 0,
    implemented_without_test_evidence: 0,
    partial_without_manual_review: 0,
    missing_rule_text: 0
  };

  const openCriticalRules = [];
  const implementedWithoutRuntimeBinding = [];
  const implementedWithoutTestEvidence = [];
  const partialWithoutManualReview = [];
  const missingRuleText = [];

  for (const rule of rules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    const runtimeBound = hasRuntimeBinding(rule);
    const testEvidence = hasTestEvidence(rule);
    const payrollCritical = isPayrollCriticalRule(rule);

    if (status === 'IMPLEMENTED') counts.implemented++;
    else if (status === 'PARTIAL') counts.partial++;
    else if (status === 'MISSING') counts.missing++;
    else if (status === 'REFERENCE') counts.reference++;
    else counts.unknown++;

    if (rule.manual_review_required === true) counts.manual_review_required++;
    if (!rule.rule_text && !rule.rule_text_summary) {
      counts.missing_rule_text++;
      missingRuleText.push(rule.rule_id || 'unknown');
    }

    if (!payrollCritical) continue;

    counts.payroll_critical++;
    if (runtimeBound) counts.runtime_bound++;
    else counts.runtime_missing++;

    const implementedNoRuntime = status === 'IMPLEMENTED' && !runtimeBound;
    const implementedNoTests = status === 'IMPLEMENTED' && !testEvidence;
    const partialNoManualReview = status === 'PARTIAL' && rule.manual_review_required !== true;

    if (implementedNoRuntime) {
      counts.implemented_without_runtime_binding++;
      implementedWithoutRuntimeBinding.push(summarizeRule(rule, {
        message: 'Rule claims IMPLEMENTED but has no verified local Base44 runtime binding.'
      }));
    }
    if (implementedNoTests) {
      counts.implemented_without_test_evidence++;
      implementedWithoutTestEvidence.push(summarizeRule(rule, {
        message: 'Rule claims IMPLEMENTED but has no test evidence recorded in CAORule.tests.'
      }));
    }
    if (partialNoManualReview) {
      counts.partial_without_manual_review++;
      partialWithoutManualReview.push(summarizeRule(rule, {
        message: 'Rule is PARTIAL but manual_review_required is not true.'
      }));
    }

    if (
      status !== 'IMPLEMENTED' ||
      rule.manual_review_required === true ||
      implementedNoRuntime ||
      implementedNoTests ||
      partialNoManualReview
    ) {
      counts.payroll_critical_open++;
      openCriticalRules.push(summarizeRule(rule, {
        has_runtime_binding: runtimeBound,
        has_test_evidence: testEvidence
      }));
    }
  }

  const blockingFindings = [];
  if (!config?.valid_from) {
    blockingFindings.push({
      code: 'missing_effective_date',
      severity: 'critical',
      message: 'Active CAOConfiguration.valid_from ontbreekt; payroll kan zonder ingangsdatum niet veilig historisch rekenen.'
    });
  }
  if (rules.length === 0) {
    blockingFindings.push({
      code: 'missing_rules',
      severity: 'critical',
      message: 'CAORule registry is leeg; CAO-regeldekking kan niet worden bewezen.'
    });
  }
  if (!hasWageScales(config)) {
    blockingFindings.push({
      code: 'missing_wage_scales',
      severity: 'critical',
      message: 'Loontabellen ontbreken; loonberekening mag niet payroll-ready zijn.'
    });
  }
  if (!hasPayPeriods(config)) {
    blockingFindings.push({
      code: 'missing_pay_periods',
      severity: 'high',
      message: 'Loonperiodetabel ontbreekt; payrollcorrecties en historische runs kunnen niet betrouwbaar worden afgebakend.'
    });
  }
  if (counts.payroll_critical_open > 0) {
    blockingFindings.push({
      code: 'open_payroll_critical_rules',
      severity: 'critical',
      message: `${counts.payroll_critical_open} payrollkritische CAO-regels zijn niet volledig runtime- en testgedekt.`
    });
  }
  if (implementedWithoutRuntimeBinding.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_runtime_binding',
      severity: 'critical',
      message: `${implementedWithoutRuntimeBinding.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen een lokale runtime-binding.`
    });
  }
  if (implementedWithoutTestEvidence.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_test_evidence',
      severity: 'high',
      message: `${implementedWithoutTestEvidence.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen testbewijs.`
    });
  }
  if (partialWithoutManualReview.length > 0) {
    blockingFindings.push({
      code: 'partial_rules_without_manual_review',
      severity: 'high',
      message: `${partialWithoutManualReview.length} payrollkritische PARTIAL-regels missen manual_review_required=true.`
    });
  }

  let status = 'ready';
  if (blockingFindings.some(f => f.code === 'missing_effective_date')) status = 'blocked_missing_effective_date';
  else if (blockingFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
  else if (blockingFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
  else if (counts.payroll_critical_open > 0) status = 'blocked_incomplete_runtime_rules';
  else if (counts.manual_review_required > 0) status = 'manual_review_required';

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    by_domain: countBy(rules, rule => rule.domain),
    by_automation_level: countBy(rules, rule => rule.automation_level),
    by_implementation_status: countBy(rules, rule => String(rule.implementation_status || 'MISSING').toUpperCase()),
    by_runtime_binding_status: countBy(rules, rule => rule.runtime_binding_status || (hasRuntimeBinding(rule) ? 'verified_local_runtime' : 'unknown')),
    blocking_findings: blockingFindings,
    open_payroll_critical_rules: openCriticalRules.slice(0, maxOpenRules),
    open_payroll_critical_rules_truncated: openCriticalRules.length > maxOpenRules,
    implemented_without_runtime_binding_rules: implementedWithoutRuntimeBinding.slice(0, maxOpenRules),
    implemented_without_runtime_binding_truncated: implementedWithoutRuntimeBinding.length > maxOpenRules,
    implemented_without_test_evidence_rules: implementedWithoutTestEvidence.slice(0, maxOpenRules),
    implemented_without_test_evidence_truncated: implementedWithoutTestEvidence.length > maxOpenRules,
    partial_without_manual_review_rules: partialWithoutManualReview.slice(0, maxOpenRules),
    partial_without_manual_review_truncated: partialWithoutManualReview.length > maxOpenRules,
    missing_rule_text_rule_ids: missingRuleText.slice(0, maxOpenRules),
    missing_rule_text_truncated: missingRuleText.length > maxOpenRules
  };
}

function chooseActiveConfiguration(configs, referenceDate) {
  const ref = normalizeDate(referenceDate || new Date().toISOString());
  const active = configs
    .filter(config => config.status === 'active' || config.is_active === true)
    .filter(config => !config.valid_from || config.valid_from <= ref)
    .filter(config => !config.valid_until || config.valid_until >= ref)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')));
  return active[0] || null;
}

function bearerToken(req) {
  const auth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function verifyInternalSecret(req, body) {
  const expected = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET') ||
    Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
  if (!expected || expected.length < 16) {
    return { ok: false, status: 500, error: 'Internal CAO audit secret is not configured.' };
  }
  const provided = bearerToken(req) ||
    body.audit_secret ||
    body.sync_trigger_secret ||
    body.shared_secret;
  if (provided !== expected) {
    return { ok: false, status: 403, error: 'Forbidden: owner/internal CAO audit secret required.' };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const secretCheck = verifyInternalSecret(req, body);
    if (!secretCheck.ok) {
      return Response.json({ success: false, error: secretCheck.error }, { status: secretCheck.status });
    }

    const caoKey = body.cao_key || 'cao_particuliere_beveiliging';
    const referenceDate = normalizeDate(body.reference_date || new Date().toISOString());
    const persistResult = body.persist_result === true;
    const maxOpenRules = Math.min(500, Math.max(25, Number(body.max_open_rules || 100)));

    const [configs, rules] = await Promise.all([
      base44.asServiceRole.entities.CAOConfiguration.filter({ cao_key: caoKey }),
      base44.asServiceRole.entities.CAORule.filter({ cao_key: caoKey })
    ]);

    const activeConfig = chooseActiveConfiguration(configs || [], referenceDate);
    const gate = evaluateCoverageGate(activeConfig || {}, rules || [], { max_open_rules: maxOpenRules });

    const requestedPayrollReady = activeConfig?.is_payroll_ready === true;
    const isPayrollReady = requestedPayrollReady && gate.passed;
    const payrollReadinessStatus = isPayrollReady
      ? 'ready'
      : requestedPayrollReady
      ? gate.status
      : gate.passed
      ? 'owner_not_marked_ready'
      : gate.status;

    if (persistResult && activeConfig?.id) {
      await base44.asServiceRole.entities.CAOConfiguration.update(activeConfig.id, {
        is_payroll_ready: isPayrollReady,
        payroll_readiness_status: payrollReadinessStatus,
        payroll_readiness_checked_at: gate.checked_at,
        payroll_readiness_gate: gate,
        coverage_summary: {
          ...(activeConfig.coverage_summary || {}),
          last_owner_internal_audit: {
            checked_at: gate.checked_at,
            reference_date: referenceDate,
            status: payrollReadinessStatus,
            passed: gate.passed,
            counts: gate.counts,
            blocking_findings: gate.blocking_findings
          }
        }
      });
    }

    return Response.json({
      success: true,
      cao_key: caoKey,
      reference_date: referenceDate,
      active_configuration_id: activeConfig?.id || null,
      active_configuration_revision: activeConfig?.cloudflare_revision || null,
      requested_payroll_ready: requestedPayrollReady,
      is_payroll_ready: isPayrollReady,
      payroll_readiness_status: payrollReadinessStatus,
      persisted_to_active_configuration: persistResult && !!activeConfig?.id,
      coverage_gate: gate
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
});

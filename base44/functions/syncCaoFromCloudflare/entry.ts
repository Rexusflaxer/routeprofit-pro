import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * syncCaoFromCloudflare
 * Haalt de owner-approved CAO op uit Cloudflare en synchroniseert naar Base44.
 * Ondersteunt batching van CAORule records om rate limits te voorkomen.
 * Hervatbaar: een half-afgemaakte import met dezelfde idempotency_key wordt voortgezet.
 */

const PAYROLL_CRITICAL_DOMAINS = [
  'payroll', 'wage', 'wages', 'salary', 'loon', 'loontabel', 'allowance',
  'allowances', 'reimbursement', 'toeslag', 'surcharge', 'overtime',
  'overwerk', 'planning', 'schedule', 'rooster', 'contract', 'employment',
  'probation', 'proeftijd', 'dismissal', 'termination', 'opzegging',
  'leave', 'vacation', 'holiday', 'sickness', 'ziekte', 'pension', 'fund',
  'function_classification', 'classification', 'bijlage_2'
];

const LOCAL_RUNTIME_RULE_BINDINGS = {
  'resolveCaoApplicability.article_3_scope': {
    functions: ['resolveCaoApplicability', 'calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
      'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
      'CAO-PB-2024-R0233'
    ]
  },
  'applyCaoContractRules.probation_and_probation_dismissal': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0315', 'CAO-PB-2024-R0316', 'CAO-PB-2024-R0317',
      'CAO-PB-2024-R0321', 'CAO-PB-2024-R0322'
    ]
  },
  'applyCaoContractRules.call_agreement_article_13': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0372', 'CAO-PB-2024-R0373', 'CAO-PB-2024-R0374',
      'CAO-PB-2024-R0377', 'CAO-PB-2024-R0378', 'CAO-PB-2024-R0380',
      'CAO-PB-2024-R0387', 'CAO-PB-2024-R0388', 'CAO-PB-2024-R0389',
      'CAO-PB-2024-R0390', 'CAO-PB-2024-R0391', 'CAO-PB-2024-R0392',
      'CAO-PB-2024-R0393', 'CAO-PB-2024-R0394'
    ]
  },
  'validateCaoScheduleRules.roster_period_constraints': {
    functions: ['validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0561', 'CAO-PB-2024-R0562', 'CAO-PB-2024-R0564',
      'CAO-PB-2024-R0570', 'CAO-PB-2024-R0575', 'CAO-PB-2024-R0580',
      'CAO-PB-2024-R0585', 'CAO-PB-2024-R0590'
    ]
  },
  'resolveCaoFunctionClassification.appendix_2_wage_scales': {
    functions: ['resolveCaoApplicability', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0728', 'CAO-PB-2024-R0729', 'CAO-PB-2024-R0734',
      'CAO-PB-2024-R1751', 'CAO-PB-2024-R1813'
    ]
  },
  'calculateCaoReimbursements.article_47_48_49_50': {
    functions: ['calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R0855', 'CAO-PB-2024-R0878', 'CAO-PB-2024-R0880',
      'CAO-PB-2024-R0885', 'CAO-PB-2024-R0890', 'CAO-PB-2024-R0895',
      'CAO-PB-2024-R0900', 'CAO-PB-2024-R0905', 'CAO-PB-2024-R1609'
    ]
  },
  'calculateCaoLeaveAndSickness.leave_and_sickness_basic': {
    functions: ['calculateCaoLeaveAndSickness'],
    rule_ids: [
      'CAO-PB-2024-R0999', 'CAO-PB-2024-R1149',
      'CAO-PB-2024-R1159', 'CAO-PB-2024-R1160'
    ]
  }
};

const LOCAL_RUNTIME_RULE_ID_INDEX = Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)
  .reduce((acc, [key, binding]) => {
    for (const ruleId of binding.rule_ids) acc[ruleId] = { key, ...binding };
    return acc;
  }, {});

function hasAnyNeedle(value, needles) {
  const text = String(value || '').toLowerCase();
  return needles.some(needle => text.includes(needle));
}

function getLocalRuntimeBinding(rule) {
  return LOCAL_RUNTIME_RULE_ID_INDEX[rule?.rule_id] || null;
}

function withLocalRuntimeBindingMetadata(rule) {
  const binding = getLocalRuntimeBinding(rule);
  const critical = isPayrollCriticalRule(rule);
  return {
    ...rule,
    runtime_binding_status: binding ? 'verified_local_runtime' : critical ? 'missing_local_runtime' : 'not_required',
    runtime_binding_key: binding?.key || null,
    runtime_binding_functions: binding?.functions || [],
    local_runtime_verified_at: binding ? new Date().toISOString() : null
  };
}

function hasWageScales(candidateCfg) {
  return Object.keys(candidateCfg?.wage_scales || {}).length > 0 ||
    Object.keys(candidateCfg?.wage_scales_detailed || {}).length > 0;
}

function hasPayPeriods(candidateCfg) {
  const payPeriods = candidateCfg?.pay_periods;
  if (!payPeriods) return false;
  if (Array.isArray(payPeriods)) return payPeriods.length > 0;
  if (typeof payPeriods === 'object') return Object.keys(payPeriods).length > 0;
  return false;
}

function isPayrollCriticalRule(rule) {
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  const implementationStatus = String(rule.implementation_status || '').toUpperCase();

  if (calculationPolicy === 'not_payroll') return false;
  if (automationLevel === 'reference' && implementationStatus === 'REFERENCE') return false;

  return calculationPolicy === 'automatic' ||
    automationLevel === 'automatic_or_calculation' ||
    automationLevel === 'validation_or_policy' ||
    hasAnyNeedle(rule.domain, PAYROLL_CRITICAL_DOMAINS) ||
    hasAnyNeedle(rule.impact, ['payroll', 'calculation', 'planning', 'validation']) ||
    hasAnyNeedle(rule.rule_id, ['R031', 'R032', 'R037', 'R038', 'R039', 'R040', 'R041', 'R042', 'R043', 'R047', 'R048', 'R056', 'R057', 'R058', 'R059', 'R072', 'R073', 'R085', 'R087', 'R088', 'R089', 'R090', 'R099', 'R114', 'R115', 'R116', 'R160', 'R175', 'R181']);
}

function evaluateCaoCoverageGate(candidateCfg, candidateRules) {
  const rules = Array.isArray(candidateRules) ? candidateRules : [];
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
    implemented_without_runtime_binding: 0
  };
  const openCriticalRules = [];
  const implementedWithoutRuntimeBinding = [];
  const missingTextRules = [];

  for (const rule of rules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    const runtimeBinding = getLocalRuntimeBinding(rule);
    if (status === 'IMPLEMENTED') counts.implemented++;
    else if (status === 'PARTIAL') counts.partial++;
    else if (status === 'MISSING') counts.missing++;
    else if (status === 'REFERENCE') counts.reference++;
    else counts.unknown++;

    if (rule.manual_review_required === true) counts.manual_review_required++;
    if (!rule.rule_text && !rule.rule_text_summary) missingTextRules.push(rule.rule_id || 'unknown');

    if (isPayrollCriticalRule(rule)) {
      counts.payroll_critical++;
      if (runtimeBinding) counts.runtime_bound++;
      else counts.runtime_missing++;

      const lacksRuntimeBinding = status === 'IMPLEMENTED' && !runtimeBinding;
      if (lacksRuntimeBinding) {
        counts.implemented_without_runtime_binding++;
        implementedWithoutRuntimeBinding.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'IMPLEMENTED',
          implemented_in: rule.implemented_in || [],
          message: 'Regel claimt IMPLEMENTED, maar heeft geen lokale runtime-binding in Base44.'
        });
      }

      if (status !== 'IMPLEMENTED' || rule.manual_review_required === true || lacksRuntimeBinding) {
        counts.payroll_critical_open++;
        openCriticalRules.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'MISSING',
          manual_review_required: rule.manual_review_required === true,
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          runtime_binding_status: runtimeBinding ? 'verified_local_runtime' : 'missing_local_runtime',
          runtime_binding_key: runtimeBinding?.key || null,
          runtime_binding_functions: runtimeBinding?.functions || []
        });
      }
    }
  }

  const blockingFindings = [];
  if (!candidateCfg?.valid_from) {
    blockingFindings.push({
      code: 'missing_effective_date',
      severity: 'critical',
      message: 'candidate_configuration.valid_from ontbreekt; payroll kan zonder ingangsdatum niet veilig historisch rekenen.'
    });
  }
  if (rules.length === 0) {
    blockingFindings.push({
      code: 'missing_rules',
      severity: 'critical',
      message: 'candidate_rules is leeg; CAO-regeldekking kan niet worden bewezen.'
    });
  }
  if (!hasWageScales(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_wage_scales',
      severity: 'critical',
      message: 'Loontabellen ontbreken; loonberekening mag niet payroll-ready zijn.'
    });
  }
  if (!hasPayPeriods(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_pay_periods',
      severity: 'high',
      message: 'Loonperiodetabel ontbreekt; payrollcorrecties en historische runs kunnen niet betrouwbaar worden afgebakend.'
    });
  }
  if (openCriticalRules.length > 0) {
    blockingFindings.push({
      code: 'open_payroll_critical_rules',
      severity: 'critical',
      message: `${openCriticalRules.length} payrollkritische CAO-regels zijn niet volledig geïmplementeerd of vereisen handmatige review.`
    });
  }
  if (implementedWithoutRuntimeBinding.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_runtime_binding',
      severity: 'critical',
      message: `${implementedWithoutRuntimeBinding.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen een lokale runtime-binding.`
    });
  }

  let status = 'ready';
  if (blockingFindings.some(f => f.code === 'missing_effective_date')) status = 'blocked_missing_effective_date';
  else if (blockingFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
  else if (blockingFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
  else if (openCriticalRules.length > 0 || implementedWithoutRuntimeBinding.length > 0) status = 'blocked_incomplete_runtime_rules';
  else if (counts.manual_review_required > 0) status = 'manual_review_required';

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    blocking_findings: blockingFindings,
    open_payroll_critical_rules: openCriticalRules.slice(0, 100),
    open_payroll_critical_rules_truncated: openCriticalRules.length > 100,
    implemented_without_runtime_binding_rules: implementedWithoutRuntimeBinding.slice(0, 100),
    implemented_without_runtime_binding_truncated: implementedWithoutRuntimeBinding.length > 100,
    local_runtime_binding_keys: Object.keys(LOCAL_RUNTIME_RULE_BINDINGS),
    missing_rule_text_rule_ids: missingTextRules.slice(0, 100),
    missing_rule_text_truncated: missingTextRules.length > 100
  };
}

function resolvePayrollReadiness(candidateCfg, candidateRules) {
  const gate = evaluateCaoCoverageGate(candidateCfg, candidateRules);
  const requestedPayrollReady = candidateCfg?.is_payroll_ready === true;
  const isPayrollReady = requestedPayrollReady && gate.passed;
  return {
    gate,
    requested_payroll_ready: requestedPayrollReady,
    is_payroll_ready: isPayrollReady,
    status: isPayrollReady ? 'ready' : (requestedPayrollReady ? gate.status : (gate.passed ? 'owner_not_marked_ready' : gate.status))
  };
}

function isPayrollImpactChange(change) {
  if (change.payroll_impact === true) return true;
  return hasAnyNeedle(
    `${change.rule_key || ''} ${change.field_path || ''} ${change.domain || ''} ${change.change_type || ''}`,
    PAYROLL_CRITICAL_DOMAINS
  );
}

function buildChangeEffectiveMetadata(change, fallbackValidFrom, approvedAt) {
  const effectiveFrom = change.effective_from || change.valid_from || change.applies_from || fallbackValidFrom || null;
  const effectiveUntil = change.effective_until || change.valid_until || null;
  const payrollImpact = isPayrollImpactChange(change);
  const approvedDate = approvedAt ? new Date(approvedAt) : new Date();
  const approvedDay = approvedDate.toISOString().slice(0, 10);
  const retroactive = change.retroactive === true ||
    (!!effectiveFrom && effectiveFrom < approvedDay);
  const correctionRequired = payrollImpact && retroactive;

  return {
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    payroll_impact: payrollImpact,
    retroactive,
    correction_required: correctionRequired,
    correction_status: correctionRequired ? 'candidate' : 'not_required'
  };
}

Deno.serve(async (req) => {
  let importRun = null;
  const base44 = createClientFromRequest(req);

  try {
    // ── Auth ──
    const body = await req.json().catch(() => ({}));
    const syncSecret = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET');

    if (!syncSecret) {
      return Response.json({ error: 'BASE44_CAO_SYNC_TRIGGER_SECRET niet geconfigureerd op server.' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const bodySecret = body.sync_trigger_secret || '';
    delete body.sync_trigger_secret;

    if (authHeader !== `Bearer ${syncSecret}` && bodySecret !== syncSecret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { force = false, trigger_source = 'manual' } = body;

    // Batch parameters
    const ruleBatchOffset = Math.max(0, Number(body.rule_batch_offset ?? 0));
    const ruleBatchSize = Math.min(Math.max(1, Number(body.rule_batch_size ?? 75)), 150);

    console.log(`[syncCaoFromCloudflare] trigger_source=${trigger_source} force=${force} offset=${ruleBatchOffset} batchSize=${ruleBatchSize}`);

    const apiKey = Deno.env.get('BASE44_CAO_API_KEY');
    const statusUrl = Deno.env.get('CAO_CLOUDFLARE_STATUS_URL');
    const currentUrl = Deno.env.get('CAO_CLOUDFLARE_CURRENT_URL');

    if (!apiKey || !statusUrl || !currentUrl) {
      return Response.json({ error: 'CAO Cloudflare secrets niet geconfigureerd' }, { status: 500 });
    }

    // ── Stap 1: Haal status op (lichtgewicht) ──
    let statusData;
    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (statusRes.status === 404) {
        return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
      }
      if (!statusRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable', http_status: statusRes.status });
      }

      statusData = await statusRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    if (!statusData?.current_revision) {
      return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
    }

    const cloudflareRevision = statusData.current_revision;

    // ── Stap 2: Revision check over ALLE actieve configs ──
    const activeConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: 'cao_particuliere_beveiliging',
      is_active: true
    });

    const activeConfigWithRevision = activeConfigs.find(cfg => cfg.cloudflare_revision === cloudflareRevision);

    if (!force && activeConfigWithRevision) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'already_current',
        revision: cloudflareRevision,
        cao_configuration_id: activeConfigWithRevision.id
      });
    }

    // ── Stap 3: Haal volledige payload op ──
    let payload;
    try {
      const currentRes = await fetch(currentUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (!currentRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_current_unavailable', http_status: currentRes.status });
      }

      payload = await currentRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    // ── Stap 4: Valideer payload ──
    if (payload.applied !== true) {
      return Response.json({ success: false, error: 'Payload applied !== true; niet geactiveerd.' }, { status: 422 });
    }
    if (payload.approval?.status !== 'approved_by_owner') {
      return Response.json({ success: false, error: 'Payload is niet goedgekeurd door eigenaar.' }, { status: 422 });
    }
    if (payload.cao_key !== 'cao_particuliere_beveiliging') {
      return Response.json({ success: false, error: `Onverwachte cao_key: ${payload.cao_key}` }, { status: 422 });
    }
    if (!payload.revision || !payload.idempotency_key) {
      return Response.json({ success: false, error: 'Payload mist revision of idempotency_key.' }, { status: 422 });
    }
    const candidateCfgForGate = payload.candidate_configuration || {};
    const candidateRulesForGate = payload.candidate_rules || [];
    const initialPayrollReadiness = resolvePayrollReadiness(candidateCfgForGate, candidateRulesForGate);

    // ── Stap 5: Idempotency check met herstelpad ──
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key: payload.idempotency_key
    });
    const existingRun = existingRuns[0] || null;

    const existingSameConfig = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: 'cao_particuliere_beveiliging',
      idempotency_key: payload.idempotency_key
    });

    // Completed + config aanwezig = idempotent, geen duplicaat
    if (!force && existingRun?.status === 'completed' && existingSameConfig.length > 0) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'duplicate_idempotency_key',
        idempotency_key: payload.idempotency_key,
        revision: payload.revision,
        cao_configuration_id: existingSameConfig[0].id
      });
    }

    // Hergebruik bestaande run (running/failed/geen config) of maak nieuw aan
    importRun = existingRun;
    if (!importRun) {
      importRun = await base44.asServiceRole.entities.CAOImportRun.create({
        started_at: new Date().toISOString(),
        trigger_type: 'cloudflare_pull',
        status: 'running',
        approval_status: 'owner_approved',
        idempotency_key: payload.idempotency_key,
        codex_thread_id: payload.approval?.codex_thread_id || null,
        source_document_ids: [],
        detected_changes: [],
        created_review_ids: [],
        payroll_readiness_status: initialPayrollReadiness.status,
        coverage_gate: initialPayrollReadiness.gate,
        summary: `Cloudflare sync gestart - revision ${payload.revision}`
      });
    } else {
      // Reset naar running bij herstel
      await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
        status: 'running',
        payroll_readiness_status: initialPayrollReadiness.status,
        coverage_gate: initialPayrollReadiness.gate
      });
    }

    // ── Stap 6: Upsert CAOSourceDocuments (alleen bij eerste batch of herstel) ──
    const sourceDocIds = [];
    const sourceDocs = payload.source_documents || [];
    for (const doc of sourceDocs) {
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, {
          title: doc.title || existing[0].title,
          status: 'active',
          last_checked_at: new Date().toISOString(),
          content_hash: doc.content_hash || existing[0].content_hash || null
        });
        sourceDocIds.push(existing[0].id);
      } else {
        const created = await base44.asServiceRole.entities.CAOSourceDocument.create({
          title: doc.title || doc.url,
          url: doc.url,
          source_type: doc.source_type || 'cao_pdf',
          status: 'active',
          first_seen_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          content_hash: doc.content_hash || null,
          extraction_status: 'ok'
        });
        sourceDocIds.push(created.id);
      }
    }

    // ── Stap 7: Archiveer alleen exacte duplicaten (zelfde revision of idempotency_key) ──
    const duplicateConfigs = activeConfigs.filter(cfg =>
      cfg.cloudflare_revision === payload.revision ||
      cfg.idempotency_key === payload.idempotency_key
    );
    for (const cfg of duplicateConfigs) {
      await base44.asServiceRole.entities.CAOConfiguration.update(cfg.id, {
        is_active: false,
        status: 'archived'
      });
    }

    // ── Stap 8: Normaliseer pay_periods ──
    function normalizePayPeriods(raw) {
      if (!raw) return null;
      if (Array.isArray(raw)) {
        const byYear = {};
        for (const p of raw) {
          const y = String(p.year || '');
          if (!y) continue;
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(p);
        }
        return Object.keys(byYear).length > 0 ? byYear : null;
      }
      if (typeof raw === 'object') return raw;
      return null;
    }

    // ── Stap 9: Upsert CAOConfiguration ──
    const candidateCfg = payload.candidate_configuration || {};
    const candidateRules = payload.candidate_rules || [];
    const payrollReadiness = resolvePayrollReadiness(candidateCfg, candidateRules);
    const configData = {
      name: candidateCfg.name || `CAO PB - ${payload.revision}`,
      cao_key: 'cao_particuliere_beveiliging',
      display_name: candidateCfg.display_name || null,
      sector: candidateCfg.sector || 'Particuliere beveiliging',
      version_label: candidateCfg.version_label || payload.revision,
      valid_from: candidateCfg.valid_from || null,
      valid_until: candidateCfg.valid_until || null,
      is_active: true,
      is_payroll_ready: payrollReadiness.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      payroll_readiness_checked_at: payrollReadiness.gate.checked_at,
      payroll_readiness_gate: payrollReadiness.gate,
      status: 'active',
      wage_scales: candidateCfg.wage_scales || {},
      wage_scales_detailed: candidateCfg.wage_scales_detailed || null,
      holidays: candidateCfg.holidays || [],
      pay_periods: normalizePayPeriods(candidateCfg.pay_periods),
      surcharges: candidateCfg.surcharges || null,
      allowances: candidateCfg.allowances || null,
      leave_rules: candidateCfg.leave_rules || null,
      sickness_rules: candidateCfg.sickness_rules || null,
      minus_hours_rules: candidateCfg.minus_hours_rules || null,
      overtime_rules: candidateCfg.overtime_rules || null,
      shift_change_rules: candidateCfg.shift_change_rules || null,
      pension_rules: candidateCfg.pension_rules || null,
      fund_rules: candidateCfg.fund_rules || null,
      schiphol_rules: candidateCfg.schiphol_rules || null,
      cash_value_logistics_rules: candidateCfg.cash_value_logistics_rules || null,
      contract_change_rules: candidateCfg.contract_change_rules || null,
      function_classification_rules: candidateCfg.function_classification_rules || null,
      rule_engine_metadata: candidateCfg.rule_engine_metadata || payload.rule_engine_metadata || null,
      source_documents_snapshot: sourceDocs.length > 0 ? sourceDocs : null,
      coverage_summary: {
        ...(payload.coverage_summary || {}),
        ...(candidateCfg.coverage_summary || {}),
        payroll_readiness: {
          status: payrollReadiness.status,
          requested_payroll_ready: payrollReadiness.requested_payroll_ready,
          passed: payrollReadiness.gate.passed,
          counts: payrollReadiness.gate.counts,
          blocking_findings: payrollReadiness.gate.blocking_findings
        }
      },
      surcharge_weekend: candidateCfg.surcharge_weekend ?? 35,
      surcharge_night: candidateCfg.surcharge_night ?? 20,
      surcharge_evening: candidateCfg.surcharge_evening ?? 10,
      surcharge_holiday: candidateCfg.surcharge_holiday ?? 50,
      surcharge_new_years_eve_after_16: candidateCfg.surcharge_new_years_eve_after_16 ?? 100,
      vacation_allowance: candidateCfg.vacation_allowance ?? 8,
      year_end_bonus: candidateCfg.year_end_bonus ?? 2.01,
      pension_base_salary_threshold: candidateCfg.pension_base_salary_threshold ?? 16164,
      pension_premium_rate_total: candidateCfg.pension_premium_rate_total ?? 24.1,
      pension_premium_employer: candidateCfg.pension_premium_employer ?? 60,
      pension_premium_employee: candidateCfg.pension_premium_employee ?? 40,
      premium_sfpb: candidateCfg.premium_sfpb ?? 0.061,
      premium_paww_employee: candidateCfg.premium_paww_employee ?? 0.1,
      premium_wga_employee: candidateCfg.premium_wga_employee ?? 0.81,
      premium_awf_employer: candidateCfg.premium_awf_employer ?? 2.64,
      premium_ww_employer_fixed: candidateCfg.premium_ww_employer_fixed ?? 0,
      premium_ww_employer_variable: candidateCfg.premium_ww_employer_variable ?? 1.5,
      premium_wia_employer: candidateCfg.premium_wia_employer ?? 0.72,
      premium_wga_employer: candidateCfg.premium_wga_employer ?? 1.5,
      premium_zw_employer: candidateCfg.premium_zw_employer ?? 0,
      tax_rate_bracket_1: candidateCfg.tax_rate_bracket_1 ?? 36.97,
      tax_rate_bracket_2: candidateCfg.tax_rate_bracket_2 ?? 36.97,
      tax_rate_bracket_3: candidateCfg.tax_rate_bracket_3 ?? 49.5,
      tax_bracket_1_limit: candidateCfg.tax_bracket_1_limit ?? 38098,
      tax_bracket_2_limit: candidateCfg.tax_bracket_2_limit ?? 75518,
      labor_tax_credit_max: candidateCfg.labor_tax_credit_max ?? 5672,
      approval_source: payload.approval?.approval_source || 'cloudflare_relay',
      approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
      approved_at: payload.approval?.approved_at || null,
      codex_thread_id: payload.approval?.codex_thread_id || null,
      codex_approval_message: payload.approval?.approval_message || null,
      cloudflare_revision: payload.revision,
      idempotency_key: payload.idempotency_key,
      automation_version: payload.automation_version || null,
      notes: `Automatisch gesynchroniseerd via Cloudflare (${trigger_source}) op ${new Date().toISOString()}`
    };

    let newConfig;
    if (existingSameConfig.length > 0) {
      await base44.asServiceRole.entities.CAOConfiguration.update(existingSameConfig[0].id, configData);
      newConfig = { ...existingSameConfig[0], ...configData, id: existingSameConfig[0].id };
    } else {
      newConfig = await base44.asServiceRole.entities.CAOConfiguration.create(configData);
    }

    // ── Stap 10: Verwerk één batch CAORules ──
    const batchRules = candidateRules.slice(ruleBatchOffset, ruleBatchOffset + ruleBatchSize);
    let rulesUpserted = 0;

    for (const rule of batchRules) {
      if (!rule.rule_id) continue;
      const existing = await base44.asServiceRole.entities.CAORule.filter({ rule_id: rule.rule_id });
      const ruleData = {
        ...withLocalRuntimeBindingMetadata(rule),
        cao_configuration_id: newConfig.id,
        status: 'active',
        last_verified_at: new Date().toISOString()
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAORule.update(existing[0].id, ruleData);
      } else {
        await base44.asServiceRole.entities.CAORule.create(ruleData);
      }
      rulesUpserted++;
    }

    const nextRuleBatchOffset = ruleBatchOffset + batchRules.length;
    const rulesComplete = nextRuleBatchOffset >= candidateRules.length;

    // ── Stap 11: Gedeeltelijke batch — nog niet klaar ──
    if (!rulesComplete) {
      await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
        status: 'running',
        payroll_readiness_status: payrollReadiness.status,
        coverage_gate: payrollReadiness.gate,
        summary: `Cloudflare sync batch: regels ${ruleBatchOffset}-${nextRuleBatchOffset - 1} van ${candidateRules.length} verwerkt. Volgende offset: ${nextRuleBatchOffset}`
      });

      return Response.json({
        success: true,
        changed: true,
        partial: true,
        reason: 'rule_batch_processed',
        revision: payload.revision,
        idempotency_key: payload.idempotency_key,
        cao_configuration_id: newConfig.id,
        import_run_id: importRun.id,
        rules_upserted: rulesUpserted,
        rules_total: candidateRules.length,
        rule_batch_offset: ruleBatchOffset,
        next_rule_batch_offset: nextRuleBatchOffset,
        rule_batch_size: ruleBatchSize,
        rules_complete: false,
        is_payroll_ready: newConfig.is_payroll_ready,
        payroll_readiness_status: payrollReadiness.status,
        coverage_gate: payrollReadiness.gate
      });
    }

    // ── Stap 12: Alle regels klaar — maak CAOChangeReview records ──
    const reviewIds = [];
    const detectedChanges = payload.detected_changes || [];
    for (const change of detectedChanges) {
      const effectiveMeta = buildChangeEffectiveMetadata(
        change,
        newConfig.valid_from || candidateCfg.valid_from || null,
        payload.approval?.approved_at || null
      );
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: newConfig.id,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'medium',
        ...effectiveMeta,
        status: 'applied',
        approval_source: payload.approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
        approved_at: payload.approval?.approved_at || null,
        codex_thread_id: payload.approval?.codex_thread_id || null,
        idempotency_key: payload.idempotency_key
      });
      reviewIds.push(review.id);
    }

    let correctionQueueSummary = null;
    if (reviewIds.length > 0) {
      try {
        const queueRes = await base44.asServiceRole.functions.invoke('queueCaoPayrollCorrections', {
          review_ids: reviewIds,
          import_run_id: importRun.id,
          idempotency_key: payload.idempotency_key,
          sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
        });
        correctionQueueSummary = queueRes?.data || null;
      } catch (error) {
        correctionQueueSummary = {
          success: false,
          error: error.message,
          note: 'CAO-sync voltooid, maar queueCaoPayrollCorrections faalde. Handmatige queue-run vereist.'
        };
      }
    }

    // ── Stap 13: Finaliseer import run ──
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      created_configuration_id: newConfig.id,
      created_review_ids: reviewIds,
      created_correction_ids: [
        ...(correctionQueueSummary?.created_correction_ids || []),
        ...(correctionQueueSummary?.updated_correction_ids || [])
      ],
      correction_queue_summary: correctionQueueSummary,
      source_document_ids: sourceDocIds,
      detected_changes: detectedChanges,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary: `Cloudflare sync voltooid: ${candidateRules.length} regels, ${sourceDocs.length} brondocumenten, ${reviewIds.length} wijzigingen, ${correctionQueueSummary?.corrections_created || 0} payrollcorrecties nieuw, ${correctionQueueSummary?.corrections_updated || 0} payrollcorrecties bijgewerkt. Payroll-ready: ${newConfig.is_payroll_ready ? 'ja' : 'nee'} (${payrollReadiness.status}). Revision: ${payload.revision}`
    });

    return Response.json({
      success: true,
      changed: true,
      partial: false,
      revision: payload.revision,
      idempotency_key: payload.idempotency_key,
      cao_configuration_id: newConfig.id,
      import_run_id: importRun.id,
      rules_upserted: rulesUpserted,
      rules_total: candidateRules.length,
      rule_batch_offset: ruleBatchOffset,
      next_rule_batch_offset: nextRuleBatchOffset,
      rule_batch_size: ruleBatchSize,
      rules_complete: true,
      source_docs_upserted: sourceDocIds.length,
      change_reviews_created: reviewIds.length,
      correction_queue_summary: correctionQueueSummary,
      is_payroll_ready: newConfig.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      coverage_summary: newConfig.coverage_summary || null
    });

  } catch (error) {
    // Markeer import run als failed bij fout
    if (importRun?.id) {
      try {
        await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_message: error.message
        });
      } catch { /* negeer secundaire fout */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});

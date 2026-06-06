import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner-only CAO ingest endpoint.
// Called by Cloudflare cao-automation-relay after owner approval in Codex.
// Auth: Authorization: Bearer <CAO_AUTOMATION_SHARED_SECRET>
// All customer user auth is ignored for mutations — secret-only gate.

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

function resolvePayrollReadiness(candidateCfg, candidateRules, isOwnerApproved) {
  const gate = evaluateCaoCoverageGate(candidateCfg, candidateRules);
  const requestedPayrollReady = candidateCfg?.is_payroll_ready === true;
  const isPayrollReady = isOwnerApproved && requestedPayrollReady && gate.passed;
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
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Validate shared secret — must match CAO_AUTOMATION_SHARED_SECRET env var
    const authHeader = req.headers.get('Authorization') || '';
    const secret = Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
    if (!secret) {
      return Response.json({ error: 'CAO_AUTOMATION_SHARED_SECRET not configured on server.' }, { status: 500 });
    }
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearerToken || bearerToken !== secret) {
      return Response.json({ error: 'Unauthorized — invalid or missing CAO automation secret.' }, { status: 401 });
    }

    const cloudflareRequestId = req.headers.get('cf-ray') || req.headers.get('x-request-id') || null;

    const body = await req.json();
    const {
      idempotency_key,
      revision,
      cao_key,
      automation_version,
      approval,
      source_documents = [],
      candidate_configuration = {},
      candidate_rules = [],
      detected_changes = []
    } = body;

    if (!idempotency_key) {
      return Response.json({ error: 'idempotency_key is verplicht.' }, { status: 400 });
    }
    if (!cao_key) {
      return Response.json({ error: 'cao_key is verplicht.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    // Idempotency check — reject duplicate ingest runs
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key
    });
    if (existingRuns.length > 0) {
      const prev = existingRuns[0];
      return Response.json({
        success: true,
        idempotency_key,
        message: 'Payload al eerder verwerkt (idempotent).',
        import_run_id: prev.id,
        cao_configuration_id: prev.created_configuration_id || null,
        applied: prev.status === 'completed',
        duplicate: true
      });
    }

    const isOwnerApproved = approval?.status === 'approved_by_owner';
    const trigger_type = 'cloudflare_relay';
    const approval_status = isOwnerApproved ? 'owner_approved' : 'proposed';
    const payrollReadiness = resolvePayrollReadiness(candidate_configuration, candidate_rules, isOwnerApproved);

    // Maak ImportRun aan
    const importRun = await base44.asServiceRole.entities.CAOImportRun.create({
      started_at: now,
      finished_at: null,
      trigger_type,
      status: 'running',
      idempotency_key,
      approval_status,
      codex_thread_id: approval?.codex_thread_id || null,
      cloudflare_request_id: cloudflareRequestId,
      source_document_ids: [],
      detected_changes: [],
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary: null,
      error_message: null
    });

    // Upsert source documents
    const sourceDocIds = [];
    for (const doc of source_documents) {
      if (!doc.url) continue;
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      const docData = {
        title: doc.title || doc.url,
        url: doc.url,
        source_type: doc.source_type || 'other',
        status: 'active',
        content_hash: doc.content_hash || null,
        etag: doc.etag || null,
        last_modified: doc.last_modified || null,
        first_seen_at: existing[0]?.first_seen_at || now,
        last_checked_at: now,
        last_changed_at: doc.changed ? now : (existing[0]?.last_changed_at || null),
        extraction_status: 'ok'
      };
      let savedDoc;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, docData);
        savedDoc = { id: existing[0].id };
      } else {
        savedDoc = await base44.asServiceRole.entities.CAOSourceDocument.create(docData);
      }
      sourceDocIds.push(savedDoc.id);
    }

    // Upsert / create CAOConfiguration
    let configId = null;
    if (Object.keys(candidate_configuration).length > 0 || isOwnerApproved) {
      const existingConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({ cao_key });

      const configData = {
        ...candidate_configuration,
        cao_key,
        status: isOwnerApproved ? 'active' : 'draft',
        is_active: isOwnerApproved,
        is_payroll_ready: payrollReadiness.is_payroll_ready,
        payroll_readiness_status: payrollReadiness.status,
        payroll_readiness_checked_at: payrollReadiness.gate.checked_at,
        payroll_readiness_gate: payrollReadiness.gate,
        coverage_summary: {
          ...(candidate_configuration.coverage_summary || {}),
          payroll_readiness: {
            status: payrollReadiness.status,
            requested_payroll_ready: payrollReadiness.requested_payroll_ready,
            passed: payrollReadiness.gate.passed,
            counts: payrollReadiness.gate.counts,
            blocking_findings: payrollReadiness.gate.blocking_findings
          }
        },
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: approval?.approved_by_owner_name || null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        codex_approval_message: approval?.approval_message || null,
        cloudflare_request_id: cloudflareRequestId,
        cloudflare_revision: revision || candidate_configuration.cloudflare_revision || null,
        idempotency_key,
        automation_version: automation_version || null
      };

      if (isOwnerApproved) {
        // Archiveer alleen exacte duplicaten. Andere actieve configs met andere
        // valid_from/valid_until blijven bestaan voor historische berekeningen.
        const duplicateConfigs = existingConfigs.filter(existing =>
          (revision && existing.cloudflare_revision === revision) ||
          existing.idempotency_key === idempotency_key
        );
        for (const existing of duplicateConfigs) {
          await base44.asServiceRole.entities.CAOConfiguration.update(existing.id, {
            status: 'archived',
            is_active: false
          });
        }
      }

      // Check for existing pending config with same idempotency_key
      const existingPending = existingConfigs.find(c => c.idempotency_key === idempotency_key);
      if (existingPending) {
        await base44.asServiceRole.entities.CAOConfiguration.update(existingPending.id, configData);
        configId = existingPending.id;
      } else {
        const newConfig = await base44.asServiceRole.entities.CAOConfiguration.create(configData);
        configId = newConfig.id;
      }
    }

    // Upsert CAO rules
    let rulesUpserted = 0;
    for (const rule of candidate_rules) {
      if (!rule.rule_id || !rule.cao_key) continue;
      const existing = await base44.asServiceRole.entities.CAORule.filter({ rule_id: rule.rule_id });
      const ruleData = {
        ...withLocalRuntimeBindingMetadata(rule),
        cao_configuration_id: configId || rule.cao_configuration_id || null,
        status: isOwnerApproved ? 'active' : 'draft',
        last_verified_at: isOwnerApproved ? now : (rule.last_verified_at || null)
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAORule.update(existing[0].id, ruleData);
      } else {
        await base44.asServiceRole.entities.CAORule.create(ruleData);
      }
      rulesUpserted++;
    }

    // Create CAOChangeReview records
    const reviewIds = [];
    const reviewStatus = isOwnerApproved ? 'applied' : 'proposed';
    for (const change of detected_changes) {
      const effectiveMeta = buildChangeEffectiveMetadata(
        change,
        candidate_configuration.valid_from || null,
        approval?.approved_at || null
      );
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: configId,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        source_document_id: change.source_document_id || null,
        source_reference: change.source_reference || null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'low',
        ...effectiveMeta,
        status: reviewStatus,
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: isOwnerApproved ? (approval?.approved_by_owner_name || null) : null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        cloudflare_request_id: cloudflareRequestId,
        idempotency_key,
        review_notes: isOwnerApproved
          ? `Owner-approved via Codex (${approval?.approved_by_owner_name || 'owner'}) on ${approval?.approved_at || now}`
          : 'Proposed — awaiting owner approval'
      });
      reviewIds.push(review.id);
    }

    let correctionQueueSummary = null;
    if (reviewIds.length > 0 && isOwnerApproved) {
      try {
        const queueRes = await base44.asServiceRole.functions.invoke('queueCaoPayrollCorrections', {
          review_ids: reviewIds,
          import_run_id: importRun.id,
          idempotency_key,
          sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
        });
        correctionQueueSummary = queueRes?.data || null;
      } catch (error) {
        correctionQueueSummary = {
          success: false,
          error: error.message,
          note: 'Owner-approved ingest voltooid, maar queueCaoPayrollCorrections faalde. Handmatige queue-run vereist.'
        };
      }
    }

    const summary = isOwnerApproved
      ? `Owner-approved CAO payload toegepast. Config: ${configId}. Regels: ${rulesUpserted}. Wijzigingen: ${reviewIds.length}. Payrollcorrecties nieuw: ${correctionQueueSummary?.corrections_created || 0}, bijgewerkt: ${correctionQueueSummary?.corrections_updated || 0}.`
      : `Proposed CAO payload ontvangen (niet geactiveerd — geen owner approval). Regels: ${rulesUpserted}.`;

    // Finalize import run
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      source_document_ids: sourceDocIds,
      created_configuration_id: configId,
      created_review_ids: reviewIds,
      created_correction_ids: [
        ...(correctionQueueSummary?.created_correction_ids || []),
        ...(correctionQueueSummary?.updated_correction_ids || [])
      ],
      correction_queue_summary: correctionQueueSummary,
      detected_changes,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

    return Response.json({
      success: true,
      idempotency_key,
      import_run_id: importRun.id,
      cao_configuration_id: configId,
      applied: isOwnerApproved,
      changes_count: reviewIds.length,
      rules_upserted: rulesUpserted,
      source_docs_upserted: sourceDocIds.length,
      correction_queue_summary: correctionQueueSummary,
      is_payroll_ready: payrollReadiness.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

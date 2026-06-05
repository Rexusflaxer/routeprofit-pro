import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner-only CAO ingest endpoint.
// Called by Cloudflare cao-automation-relay after owner approval in Codex.
// Auth: Authorization: Bearer <CAO_AUTOMATION_SHARED_SECRET>
// All customer user auth is ignored for mutations — secret-only gate.

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
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: approval?.approved_by_owner_name || null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        codex_approval_message: approval?.approval_message || null,
        cloudflare_request_id: cloudflareRequestId,
        idempotency_key,
        automation_version: automation_version || null
      };

      if (isOwnerApproved) {
        // Archive all currently active configs for this cao_key
        for (const existing of existingConfigs) {
          if (existing.status === 'active') {
            await base44.asServiceRole.entities.CAOConfiguration.update(existing.id, {
              status: 'archived',
              is_active: false
            });
          }
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
        ...rule,
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

    const summary = isOwnerApproved
      ? `Owner-approved CAO payload toegepast. Config: ${configId}. Regels: ${rulesUpserted}. Wijzigingen: ${reviewIds.length}.`
      : `Proposed CAO payload ontvangen (niet geactiveerd — geen owner approval). Regels: ${rulesUpserted}.`;

    // Finalize import run
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      source_document_ids: sourceDocIds,
      created_configuration_id: configId,
      created_review_ids: reviewIds,
      detected_changes,
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
      summary
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
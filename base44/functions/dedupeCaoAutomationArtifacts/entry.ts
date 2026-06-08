import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() {
  return new Date().toISOString();
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function stableForHash(value) {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableForHash(value[key]);
      return acc;
    }, {});
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function reviewDeduplicationKey(review) {
  if (review.review_deduplication_key) return review.review_deduplication_key;
  const semanticPayload = stableForHash({
    idempotency_key: review.idempotency_key || null,
    cao_key: review.cao_key || null,
    rule_key: review.rule_key || 'unknown',
    field_path: review.field_path || '',
    change_type: review.change_type || 'changed',
    effective_from: review.effective_from || null,
    effective_until: review.effective_until || null,
    old_value: review.old_value ?? null,
    new_value: review.new_value ?? null
  });
  return `cao-change-review::${await sha256Hex(JSON.stringify(semanticPayload))}`;
}

function correctionKeyPart(value) {
  const normalized = value === null || value === undefined || value === '' ? '-' : String(value);
  return encodeURIComponent(normalized);
}

function correctionReviewValueSignature(review) {
  if (review.review_deduplication_key) return review.review_deduplication_key;
  return JSON.stringify(stableForHash({
    old_value: review.old_value ?? null,
    new_value: review.new_value ?? null
  }));
}

function correctionKeyFromCorrection(correction, reviewById) {
  const review = reviewById[correction.cao_change_review_id] || {};
  const scope = [
    correction.idempotency_key || review.idempotency_key || correction.import_run_id || review.import_run_id || 'unknown_import',
    correction.cao_key || review.cao_key || 'unknown_cao',
    correction.rule_key || review.rule_key || 'unknown_rule',
    correction.field_path || review.field_path || '',
    review.change_type || 'changed',
    isoDate(correction.effective_from || review.effective_from) || '',
    isoDate(correction.effective_until || review.effective_until) || '',
    correctionReviewValueSignature(review)
  ].map(correctionKeyPart).join('::');
  return [
    'cao-payroll-correction',
    scope,
    correctionKeyPart(correction.affected_payroll_run_id || 'unmatched')
  ].join('::');
}

function reviewRank(review, activeConfigIds) {
  const statusRank = {
    applied: 4,
    owner_approved: 3,
    proposed: 2,
    owner_rejected: 1,
    superseded: 0
  }[review.status] ?? 0;
  return [
    activeConfigIds.has(review.cao_configuration_id) ? 1 : 0,
    statusRank,
    review.correction_status === 'superseded' ? 0 : 1,
    String(review.approved_at || ''),
    String(review.id || '')
  ];
}

function correctionRank(correction, canonicalReviewIds) {
  const statusRank = {
    applied: 5,
    queued: 4,
    candidate: 3,
    manual_review_required: 2,
    skipped_no_affected_run: 1,
    superseded: 0
  }[correction.status] ?? 0;
  return [
    canonicalReviewIds.has(correction.cao_change_review_id) ? 1 : 0,
    statusRank,
    String(correction.created_at || ''),
    String(correction.id || '')
  ];
}

function compareRank(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const next = String(b[i] ?? '').localeCompare(String(a[i] ?? ''));
    if (next !== 0) return next;
  }
  return 0;
}

function appendNote(existingNotes, note) {
  return [existingNotes || '', note].filter(Boolean).join('\n');
}

function isAuthorized(req, body) {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const syncSecret = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET');
  const automationSecret = Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
  return Boolean(
    (syncSecret && (bearer === syncSecret || body.sync_trigger_secret === syncSecret)) ||
    (automationSecret && (bearer === automationSecret || body.automation_secret === automationSecret))
  );
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!isAuthorized(req, body)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apply = body.apply === true || body.dry_run === false;
    const idempotencyKeys = new Set(normalizeArray(body.idempotency_keys || body.idempotency_key));
    const includeRecord = record => idempotencyKeys.size === 0 || idempotencyKeys.has(record.idempotency_key);

    const [reviewsAll, correctionsAll, payrollRunsAll, configsAll] = await Promise.all([
      base44.asServiceRole.entities.CAOChangeReview.list(),
      base44.asServiceRole.entities.CAOPayrollCorrection.list(),
      base44.asServiceRole.entities.PayrollCalculationRun.list(),
      base44.asServiceRole.entities.CAOConfiguration.list()
    ]);

    const reviews = (reviewsAll || []).filter(includeRecord);
    const includedReviewIds = new Set(reviews.map(review => review.id).filter(Boolean));
    const corrections = (correctionsAll || []).filter(correction =>
      includeRecord(correction) || includedReviewIds.has(correction.cao_change_review_id)
    );
    const activeConfigIds = new Set((configsAll || []).filter(cfg => cfg.is_active === true).map(cfg => cfg.id));
    const reviewById = Object.fromEntries((reviewsAll || []).filter(review => review.id).map(review => [review.id, review]));

    const reviewGroups = {};
    for (const review of reviews) {
      const key = await reviewDeduplicationKey(review);
      if (!reviewGroups[key]) reviewGroups[key] = [];
      reviewGroups[key].push(review);
    }

    const reviewIdReplacement = {};
    const canonicalReviewIds = new Set();
    const reviewActions = [];
    const reviewNormalizationActions = [];

    for (const [key, group] of Object.entries(reviewGroups)) {
      const sorted = [...group].sort((a, b) => compareRank(reviewRank(a, activeConfigIds), reviewRank(b, activeConfigIds)));
      const canonical = sorted[0];
      if (!canonical) continue;
      canonicalReviewIds.add(canonical.id);

      if (canonical.review_deduplication_key !== key) {
        reviewNormalizationActions.push({ review_id: canonical.id, key });
      }
      if (apply && canonical.review_deduplication_key !== key) {
        await base44.asServiceRole.entities.CAOChangeReview.update(canonical.id, {
          review_deduplication_key: key
        });
      }

      for (const duplicate of sorted.slice(1)) {
        reviewIdReplacement[duplicate.id] = canonical.id;
        const alreadySuperseded =
          duplicate.status === 'superseded' &&
          duplicate.correction_status === 'superseded' &&
          duplicate.review_deduplication_key === key;
        if (alreadySuperseded) continue;
        reviewActions.push({ duplicate_review_id: duplicate.id, canonical_review_id: canonical.id, key });
        if (!apply) continue;
        await base44.asServiceRole.entities.CAOChangeReview.update(duplicate.id, {
          status: 'superseded',
          correction_status: 'superseded',
          review_deduplication_key: key,
          review_notes: appendNote(
            duplicate.review_notes,
            `Superseded door dedupeCaoAutomationArtifacts op ${nowIso()}; canonical_review_id=${canonical.id}.`
          )
        });
      }
    }

    const correctionGroups = {};
    for (const correction of corrections) {
      const key = correctionKeyFromCorrection(correction, reviewById);
      if (!correctionGroups[key]) correctionGroups[key] = [];
      correctionGroups[key].push(correction);
    }

    const correctionActions = [];
    const correctionNormalizationActions = [];
    for (const [key, group] of Object.entries(correctionGroups)) {
      const sorted = [...group].sort((a, b) => compareRank(correctionRank(a, canonicalReviewIds), correctionRank(b, canonicalReviewIds)));
      const canonical = sorted[0];
      if (!canonical) continue;
      const canonicalReviewId = reviewIdReplacement[canonical.cao_change_review_id] || canonical.cao_change_review_id;

      if (canonical.correction_key !== key || canonical.cao_change_review_id !== canonicalReviewId) {
        correctionNormalizationActions.push({
          correction_id: canonical.id,
          canonical_review_id: canonicalReviewId,
          key
        });
      }
      if (apply && (canonical.correction_key !== key || canonical.cao_change_review_id !== canonicalReviewId)) {
        await base44.asServiceRole.entities.CAOPayrollCorrection.update(canonical.id, {
          correction_key: key,
          cao_change_review_id: canonicalReviewId,
          notes: appendNote(
            canonical.notes,
            `Canonical correction normalized door dedupeCaoAutomationArtifacts op ${nowIso()}.`
          )
        });
      }

      for (const duplicate of sorted.slice(1)) {
        const alreadySuperseded = duplicate.status === 'superseded' && duplicate.correction_key === key;
        if (alreadySuperseded) continue;
        correctionActions.push({ duplicate_correction_id: duplicate.id, canonical_correction_id: canonical.id, key });
        if (!apply) continue;
        await base44.asServiceRole.entities.CAOPayrollCorrection.update(duplicate.id, {
          status: 'superseded',
          correction_key: key,
          notes: appendNote(
            duplicate.notes,
            `Superseded door dedupeCaoAutomationArtifacts op ${nowIso()}; canonical_correction_id=${canonical.id}.`
          )
        });
      }
    }

    const payrollRunActions = [];
    for (const run of payrollRunsAll || []) {
      const reasonIds = Array.isArray(run.cao_recalculation_reason_ids)
        ? run.cao_recalculation_reason_ids
        : [];
      if (reasonIds.length === 0) continue;
      const nextReasonIds = [...new Set(reasonIds.map(id => reviewIdReplacement[id] || id))];
      if (JSON.stringify(nextReasonIds) === JSON.stringify(reasonIds)) continue;
      payrollRunActions.push({ payroll_run_id: run.id, old_review_ids: reasonIds, new_review_ids: nextReasonIds });
      if (apply) {
        await base44.asServiceRole.entities.PayrollCalculationRun.update(run.id, {
          cao_recalculation_reason_ids: nextReasonIds
        });
      }
    }

    return Response.json({
      success: true,
      applied: apply,
      idempotency_keys: [...idempotencyKeys],
      reviews_checked: reviews.length,
      review_duplicates_superseded: reviewActions.length,
      review_normalizations: reviewNormalizationActions.length,
      corrections_checked: corrections.length,
      correction_duplicates_superseded: correctionActions.length,
      correction_normalizations: correctionNormalizationActions.length,
      payroll_runs_checked: (payrollRunsAll || []).length,
      payroll_runs_relinked: payrollRunActions.length,
      review_normalization_actions: reviewNormalizationActions.slice(0, 200),
      review_normalization_actions_truncated: reviewNormalizationActions.length > 200,
      review_actions: reviewActions.slice(0, 200),
      review_actions_truncated: reviewActions.length > 200,
      correction_normalization_actions: correctionNormalizationActions.slice(0, 200),
      correction_normalization_actions_truncated: correctionNormalizationActions.length > 200,
      correction_actions: correctionActions.slice(0, 200),
      correction_actions_truncated: correctionActions.length > 200,
      payroll_run_actions: payrollRunActions.slice(0, 100),
      payroll_run_actions_truncated: payrollRunActions.length > 100
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

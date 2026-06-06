import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() {
  return new Date().toISOString();
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB) return false;
  const aStart = isoDate(startA);
  const aEnd = isoDate(endA);
  const bStart = isoDate(startB);
  const bEnd = isoDate(endB) || '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
}

function runTouchesReview(run, review) {
  if (run.pay_period_start && run.pay_period_end && review.effective_from) {
    return rangesOverlap(run.pay_period_start, run.pay_period_end, review.effective_from, review.effective_until);
  }

  // Legacy fallback: old PayrollCalculationRun records may not yet have period dates.
  // Keep this conservative and require manual review instead of pretending certainty.
  if (review.effective_from && run.pay_period_year) {
    const effectiveYear = Number(String(review.effective_from).slice(0, 4));
    return Number(run.pay_period_year) >= effectiveYear;
  }
  return false;
}

function isFinalizedPayrollRun(run) {
  const status = run.payroll_run_status || 'calculated';
  return ['approved', 'exported', 'paid', 'corrected'].includes(status) ||
    !!run.payroll_exported_at ||
    !!run.payroll_paid_at;
}

function buildCorrectionKey(review, run) {
  return `${review.id}::${run?.id || 'unmatched'}`;
}

function buildCorrectionData(review, run, status, reason) {
  return {
    correction_key: buildCorrectionKey(review, run),
    cao_change_review_id: review.id,
    import_run_id: review.import_run_id || null,
    idempotency_key: review.idempotency_key || null,
    affected_payroll_run_id: run?.id || null,
    personnel_id: run?.personnel_id || null,
    route_id: run?.route_id || null,
    cao_configuration_id: review.cao_configuration_id || run?.cao_configuration_id || null,
    cao_revision: run?.cao_revision || null,
    rule_key: review.rule_key || null,
    field_path: review.field_path || null,
    effective_from: review.effective_from || null,
    effective_until: review.effective_until || null,
    pay_period_year: run?.pay_period_year ?? null,
    pay_period_number: run?.pay_period_number ?? null,
    pay_period_start: run?.pay_period_start || null,
    pay_period_end: run?.pay_period_end || null,
    status,
    payroll_impact: review.payroll_impact !== false,
    correction_reason: reason,
    old_calculation_snapshot: run?.calculation_output || null,
    new_calculation_snapshot: null,
    delta_snapshot: null,
    created_at: nowIso(),
    created_by_function: 'queueCaoPayrollCorrections',
    queued_for_pay_period_year: null,
    queued_for_pay_period_number: null,
    applied_payroll_run_id: null,
    notes: run
      ? `Retroactieve CAO-wijziging ${review.rule_key || review.field_path || review.id} raakt payrollrun ${run.id}.`
      : `Retroactieve CAO-wijziging ${review.rule_key || review.field_path || review.id} heeft payroll-impact, maar er is nog geen concrete payrollrun gematcht.`
  };
}

async function upsertCorrection(base44, data) {
  const existing = await base44.asServiceRole.entities.CAOPayrollCorrection.filter({
    correction_key: data.correction_key
  });
  if (existing.length > 0) {
    await base44.asServiceRole.entities.CAOPayrollCorrection.update(existing[0].id, {
      ...data,
      created_at: existing[0].created_at || data.created_at
    });
    return { id: existing[0].id, created: false };
  }
  const created = await base44.asServiceRole.entities.CAOPayrollCorrection.create(data);
  return { id: created.id, created: true };
}

async function markPayrollRunForRecalculation(base44, run, reviewId) {
  const existingIds = Array.isArray(run.cao_recalculation_reason_ids)
    ? run.cao_recalculation_reason_ids
    : [];
  const nextIds = [...new Set([...existingIds, reviewId])];
  await base44.asServiceRole.entities.PayrollCalculationRun.update(run.id, {
    requires_cao_recalculation: true,
    cao_recalculation_reason_ids: nextIds
  });
}

function isAuthorized(req, body) {
  const authHeader = req.headers.get('Authorization') || '';
  const automationSecret = Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
  const syncSecret = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (automationSecret && bearer === automationSecret) return true;
  if (syncSecret && (bearer === syncSecret || body.sync_trigger_secret === syncSecret)) return true;
  return false;
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

    const reviewIds = Array.isArray(body.review_ids) ? body.review_ids.filter(Boolean) : [];
    const importRunId = body.import_run_id || null;
    const idempotencyKey = body.idempotency_key || null;

    let reviews = [];
    if (reviewIds.length > 0) {
      const all = await Promise.all(reviewIds.map(id =>
        base44.asServiceRole.entities.CAOChangeReview.get(id).catch(() => null)
      ));
      reviews = all.filter(Boolean);
    } else if (importRunId) {
      reviews = await base44.asServiceRole.entities.CAOChangeReview.filter({ import_run_id: importRunId });
    } else if (idempotencyKey) {
      reviews = await base44.asServiceRole.entities.CAOChangeReview.filter({ idempotency_key: idempotencyKey });
    } else {
      const candidates = await base44.asServiceRole.entities.CAOChangeReview.filter({
        correction_required: true,
        correction_status: 'candidate'
      });
      reviews = candidates;
    }

    const correctionReviews = reviews.filter(r =>
      r.correction_required === true &&
      r.payroll_impact !== false &&
      r.status === 'applied'
    );

    const payrollRuns = await base44.asServiceRole.entities.PayrollCalculationRun.list();
    const createdCorrectionIds = [];
    const updatedCorrectionIds = [];
    const unmatchedReviewIds = [];
    const markedPayrollRunIds = [];

    for (const review of correctionReviews) {
      const affectedRuns = payrollRuns.filter(run => runTouchesReview(run, review));

      if (affectedRuns.length === 0) {
        const data = buildCorrectionData(
          review,
          null,
          'skipped_no_affected_run',
          'Geen bestaande PayrollCalculationRun gevonden die overlapt met de ingangsdatum van de CAO-wijziging.'
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        unmatchedReviewIds.push(review.id);
        await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
          correction_status: 'manual_review_required'
        });
        continue;
      }

      for (const run of affectedRuns) {
        const finalized = isFinalizedPayrollRun(run);
        const hasExactDates = !!(run.pay_period_start && run.pay_period_end);
        const status = !hasExactDates
          ? 'manual_review_required'
          : finalized
          ? 'queued'
          : 'candidate';
        const reason = !hasExactDates
          ? 'Legacy payrollrun mist pay_period_start/pay_period_end; handmatige review vereist om overlap exact te bepalen.'
          : finalized
          ? 'Payrollrun is al goedgekeurd/geëxporteerd/betaald; correctie moet in een volgende loonrun worden verwerkt.'
          : 'Payrollrun valt binnen retroactieve CAO-periode; herberekening vereist voordat deze definitief wordt.';

        const data = buildCorrectionData(review, run, status, reason);
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);

        await markPayrollRunForRecalculation(base44, run, review.id);
        markedPayrollRunIds.push(run.id);
      }

      const hasLegacyRunsWithoutExactDates = affectedRuns.some(run => !(run.pay_period_start && run.pay_period_end));
      await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
        correction_status: hasLegacyRunsWithoutExactDates
          ? 'manual_review_required'
          : affectedRuns.some(isFinalizedPayrollRun)
          ? 'queued'
          : 'candidate'
      });
    }

    return Response.json({
      success: true,
      reviews_checked: reviews.length,
      correction_reviews: correctionReviews.length,
      corrections_created: createdCorrectionIds.length,
      corrections_updated: updatedCorrectionIds.length,
      created_correction_ids: createdCorrectionIds,
      updated_correction_ids: updatedCorrectionIds,
      marked_payroll_run_ids: [...new Set(markedPayrollRunIds)],
      unmatched_review_ids: unmatchedReviewIds
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

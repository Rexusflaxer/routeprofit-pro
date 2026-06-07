import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() {
  return new Date().toISOString();
}

function isoDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB) return false;
  const aStart = isoDate(startA);
  const aEnd = isoDate(endA);
  const bStart = isoDate(startB);
  const bEnd = isoDate(endB) || '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
}

function daysInclusive(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || end < start) return null;
  return Math.floor((endDate - startDate) / 86400000) + 1;
}

function exactOverlapEvidence(run, review) {
  if (!run?.pay_period_start || !run?.pay_period_end || !review?.effective_from) {
    return {
      match_type: null,
      overlap_start: null,
      overlap_end: null,
      overlap_days: null,
      evidence: null
    };
  }
  const payPeriodStart = isoDate(run.pay_period_start);
  const payPeriodEnd = isoDate(run.pay_period_end);
  const effectiveFrom = isoDate(review.effective_from);
  const effectiveUntil = isoDate(review.effective_until) || '9999-12-31';
  const overlapStart = payPeriodStart > effectiveFrom ? payPeriodStart : effectiveFrom;
  const overlapEnd = payPeriodEnd < effectiveUntil ? payPeriodEnd : effectiveUntil;
  const overlaps = overlapStart <= overlapEnd;

  return {
    match_type: overlaps ? 'exact_pay_period_overlap' : null,
    overlap_start: overlaps ? overlapStart : null,
    overlap_end: overlaps ? overlapEnd : null,
    overlap_days: overlaps ? daysInclusive(overlapStart, overlapEnd) : null,
    evidence: {
      strategy: 'exact_pay_period_overlap',
      payroll_period_start: payPeriodStart,
      payroll_period_end: payPeriodEnd,
      effective_from: effectiveFrom,
      effective_until: review.effective_until ? effectiveUntil : null,
      overlap_start: overlaps ? overlapStart : null,
      overlap_end: overlaps ? overlapEnd : null,
      overlap_days: overlaps ? daysInclusive(overlapStart, overlapEnd) : null,
      overlaps
    }
  };
}

function runTouchesReview(run, review) {
  if (run.pay_period_start && run.pay_period_end && review.effective_from) {
    return rangesOverlap(run.pay_period_start, run.pay_period_end, review.effective_from, review.effective_until);
  }
  return false;
}

function legacyRunMayTouchReview(run, review) {
  if (run.pay_period_start && run.pay_period_end) return false;
  if (!review.effective_from || !run.pay_period_year) return false;
  const effectiveYear = Number(String(review.effective_from).slice(0, 4));
  const effectiveUntilYear = review.effective_until
    ? Number(String(review.effective_until).slice(0, 4))
    : 9999;
  const runYear = Number(run.pay_period_year);
  if (!Number.isFinite(effectiveYear) || !Number.isFinite(effectiveUntilYear) || !Number.isFinite(runYear)) return false;
  return runYear >= effectiveYear && runYear <= effectiveUntilYear;
}

function isFinalizedPayrollRun(run) {
  const status = run.payroll_run_status || 'calculated';
  return ['approved', 'exported', 'paid', 'corrected'].includes(status) ||
    !!run.payroll_exported_at ||
    !!run.payroll_paid_at;
}

function indexById(records) {
  return (records || []).reduce((acc, record) => {
    if (record?.id) acc[record.id] = record;
    return acc;
  }, {});
}

function indexLatestConfigByCaoKey(records) {
  const result = {};
  for (const config of records || []) {
    const caoKey = config?.cao_key || null;
    if (!caoKey) continue;
    const current = result[caoKey];
    const currentDate = current?.valid_from || '0000-00-00';
    const nextDate = config?.valid_from || '0000-00-00';
    if (!current || nextDate >= currentDate) result[caoKey] = config;
  }
  return result;
}

function resolveReviewCaoKey(review, configById) {
  return review?.cao_key ||
    configById[review?.cao_configuration_id]?.cao_key ||
    null;
}

function resolveRunCaoKey(run, configById) {
  return run?.cao_key ||
    configById[run?.cao_configuration_id]?.cao_key ||
    null;
}

function runMatchesReviewCao(run, reviewCaoKey, configById) {
  const runCaoKey = resolveRunCaoKey(run, configById);
  return !!reviewCaoKey && !!runCaoKey && runCaoKey === reviewCaoKey;
}

function resolveReviewConfig(review, reviewCaoKey, configById, configByCaoKey) {
  return configById[review?.cao_configuration_id] ||
    configByCaoKey[reviewCaoKey] ||
    null;
}

function flattenPayPeriods(config) {
  const payPeriods = config?.pay_periods;
  if (!payPeriods || typeof payPeriods !== 'object') return [];
  return Object.entries(payPeriods)
    .flatMap(([year, periods]) => Array.isArray(periods)
      ? periods.map(period => ({
        pay_period_year: Number(period.year ?? period.pay_period_year ?? year),
        pay_period_number: Number(period.period_number ?? period.pay_period_number ?? period.number),
        pay_period_start: isoDate(period.start_date || period.period_start || period.pay_period_start),
        pay_period_end: isoDate(period.end_date || period.period_end || period.pay_period_end),
        is_extra_period: period.is_extra_period === true
      }))
      : []
    )
    .filter(period =>
      Number.isFinite(period.pay_period_year) &&
      Number.isFinite(period.pay_period_number) &&
      period.pay_period_start &&
      period.pay_period_end
    )
    .sort((a, b) =>
      a.pay_period_start.localeCompare(b.pay_period_start) ||
      a.pay_period_number - b.pay_period_number
    );
}

function normalizeRequestedQueueTarget(body) {
  const year = Number(
    body.queued_for_pay_period_year ??
    body.queue_for_pay_period_year ??
    body.target_pay_period_year
  );
  const number = Number(
    body.queued_for_pay_period_number ??
    body.queue_for_pay_period_number ??
    body.target_pay_period_number
  );
  if (!Number.isFinite(year) || !Number.isFinite(number)) return null;
  return { pay_period_year: year, pay_period_number: number };
}

function samePayPeriod(run, period) {
  return Number(run?.pay_period_year) === Number(period?.pay_period_year) &&
    Number(run?.pay_period_number) === Number(period?.pay_period_number);
}

function hasFinalizedPayrollForPeriod(payrollRuns, period, reviewCaoKey, configById) {
  return payrollRuns.some(candidate =>
    samePayPeriod(candidate, period) &&
    runMatchesReviewCao(candidate, reviewCaoKey, configById) &&
    isFinalizedPayrollRun(candidate)
  );
}

function periodPayload(period) {
  return {
    pay_period_year: period.pay_period_year,
    pay_period_number: period.pay_period_number,
    pay_period_start: period.pay_period_start,
    pay_period_end: period.pay_period_end
  };
}

function resolveCorrectionQueueTarget({
  review,
  run,
  reviewCaoKey,
  config,
  payrollRuns,
  configById,
  queueReferenceDate,
  requestedTarget
}) {
  const payPeriods = flattenPayPeriods(config);
  const referenceDate = isoDate(queueReferenceDate) || isoDate(nowIso());

  if (payPeriods.length === 0) {
    return {
      manual_review_required: true,
      match_type: 'manual_review_missing_pay_periods',
      warnings: [
        'Eerstvolgende correctie-loonperiode kon niet worden bepaald: CAOConfiguration.pay_periods ontbreekt of is leeg.'
      ],
      evidence: {
        strategy: 'manual_review_missing_pay_periods',
        cao_configuration_id: config?.id || review?.cao_configuration_id || run?.cao_configuration_id || null,
        cao_key: reviewCaoKey,
        queue_reference_date: referenceDate
      }
    };
  }

  if (requestedTarget) {
    const explicitPeriod = payPeriods.find(period =>
      period.pay_period_year === requestedTarget.pay_period_year &&
      period.pay_period_number === requestedTarget.pay_period_number
    );
    if (explicitPeriod) {
      if (hasFinalizedPayrollForPeriod(payrollRuns, explicitPeriod, reviewCaoKey, configById)) {
        return {
          manual_review_required: true,
          match_type: 'manual_review_no_open_pay_period',
          warnings: [
            `Aangevraagde correctie-loonperiode ${requestedTarget.pay_period_year}-${requestedTarget.pay_period_number} is al definitief voor CAO ${reviewCaoKey}.`
          ],
          evidence: {
            strategy: 'explicit_request_finalized',
            cao_key: reviewCaoKey,
            requested_target: requestedTarget,
            selected_pay_period: periodPayload(explicitPeriod)
          }
        };
      }
      return {
        ...periodPayload(explicitPeriod),
        manual_review_required: false,
        match_type: 'explicit_request',
        warnings: [],
        evidence: {
          strategy: 'explicit_request',
          cao_key: reviewCaoKey,
          requested_target: requestedTarget,
          selected_pay_period: periodPayload(explicitPeriod)
        }
      };
    }
    return {
      manual_review_required: true,
      match_type: 'manual_review_no_open_pay_period',
      warnings: [
        `Aangevraagde correctie-loonperiode ${requestedTarget.pay_period_year}-${requestedTarget.pay_period_number} staat niet in CAOConfiguration.pay_periods.`
      ],
      evidence: {
        strategy: 'explicit_request_not_found',
        cao_key: reviewCaoKey,
        requested_target: requestedTarget,
        configured_pay_period_count: payPeriods.length
      }
    };
  }

  const selectablePeriods = payPeriods.filter(period =>
    period.is_extra_period !== true &&
    period.pay_period_end >= referenceDate &&
    !hasFinalizedPayrollForPeriod(payrollRuns, period, reviewCaoKey, configById)
  );
  const selectedPeriod = selectablePeriods[0] || null;

  if (!selectedPeriod) {
    return {
      manual_review_required: true,
      match_type: 'manual_review_no_open_pay_period',
      warnings: [
        'Eerstvolgende open loonperiode voor CAO-correctie kon niet audit-proof worden bepaald; alle bekende actuele/toekomstige perioden ontbreken of zijn al definitief.'
      ],
      evidence: {
        strategy: 'manual_review_no_open_pay_period',
        cao_key: reviewCaoKey,
        queue_reference_date: referenceDate,
        configured_pay_period_count: payPeriods.length,
        affected_payroll_run_id: run?.id || null
      }
    };
  }

  return {
    ...periodPayload(selectedPeriod),
    manual_review_required: false,
    match_type: 'next_open_pay_period',
    warnings: [],
    evidence: {
      strategy: 'next_open_pay_period',
      cao_key: reviewCaoKey,
      queue_reference_date: referenceDate,
      affected_payroll_run_id: run?.id || null,
      selected_pay_period: periodPayload(selectedPeriod),
      skipped_finalized_periods: payPeriods
        .filter(period =>
          period.is_extra_period !== true &&
          period.pay_period_end >= referenceDate &&
          hasFinalizedPayrollForPeriod(payrollRuns, period, reviewCaoKey, configById)
        )
        .map(periodPayload)
    }
  };
}

function buildCorrectionKey(review, run) {
  return `${review.id}::${run?.id || 'unmatched'}`;
}

function buildCorrectionData(review, run, status, reason, caoKey = null, match = {}, queueTarget = {}) {
  return {
    correction_key: buildCorrectionKey(review, run),
    cao_change_review_id: review.id,
    import_run_id: review.import_run_id || null,
    idempotency_key: review.idempotency_key || null,
    affected_payroll_run_id: run?.id || null,
    personnel_id: run?.personnel_id || null,
    route_id: run?.route_id || null,
    cao_configuration_id: review.cao_configuration_id || run?.cao_configuration_id || null,
    cao_key: caoKey || review.cao_key || run?.cao_key || null,
    cao_revision: run?.cao_revision || null,
    rule_key: review.rule_key || null,
    field_path: review.field_path || null,
    effective_from: review.effective_from || null,
    effective_until: review.effective_until || null,
    effective_from_source: review.effective_from_source || null,
    effective_from_inferred: review.effective_from_inferred === true,
    effective_date_manual_review_required: review.effective_date_manual_review_required === true,
    effective_date_warnings: normalizeArray(review.effective_date_warnings),
    affected_overlap_start: match.overlap_start || null,
    affected_overlap_end: match.overlap_end || null,
    affected_overlap_days: match.overlap_days ?? null,
    correction_match_type: match.match_type || null,
    correction_match_evidence: match.evidence || null,
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
    queued_for_pay_period_year: queueTarget.pay_period_year ?? null,
    queued_for_pay_period_number: queueTarget.pay_period_number ?? null,
    queued_for_pay_period_start: queueTarget.pay_period_start || null,
    queued_for_pay_period_end: queueTarget.pay_period_end || null,
    queue_target_match_type: queueTarget.match_type || null,
    queue_target_manual_review_required: queueTarget.manual_review_required === true,
    queue_target_warnings: normalizeArray(queueTarget.warnings),
    queue_target_evidence: queueTarget.evidence || null,
    applied_payroll_run_id: null,
    notes: run
      ? `Retroactieve CAO-wijziging ${review.rule_key || review.field_path || review.id} raakt payrollrun ${run.id}.`
      : `Retroactieve CAO-wijziging ${review.rule_key || review.field_path || review.id} heeft payroll-impact, maar er is nog geen concrete payrollrun gematcht.`
  };
}

function effectiveDateManualReviewReason(review) {
  const warnings = normalizeArray(review.effective_date_warnings).map(String);
  if (review.effective_date_manual_review_required === true) {
    return warnings.length > 0
      ? warnings.join(' ')
      : 'CAO-wijziging vereist handmatige review van de ingangsdatum voordat payrollruns automatisch gematcht mogen worden.';
  }
  if (review.effective_from_inferred === true) {
    return 'CAO-wijziging gebruikt een afgeleide ingangsdatum uit de CAO-configuratie; bevestig de wijzigingsspecifieke ingangsdatum voordat payrollruns automatisch gematcht mogen worden.';
  }
  if (review.effective_from && review.effective_until && review.effective_until < review.effective_from) {
    return 'CAO-wijziging heeft een ongeldig datumbereik: effective_until ligt voor effective_from.';
  }
  return null;
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
    const queueReferenceDate = isoDate(body.queue_reference_date) || isoDate(nowIso());
    const requestedQueueTarget = normalizeRequestedQueueTarget(body);

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

    const [payrollRuns, caoConfigs] = await Promise.all([
      base44.asServiceRole.entities.PayrollCalculationRun.list(),
      base44.asServiceRole.entities.CAOConfiguration.list()
    ]);
    const configById = indexById(caoConfigs || []);
    const configByCaoKey = indexLatestConfigByCaoKey(caoConfigs || []);
    const createdCorrectionIds = [];
    const updatedCorrectionIds = [];
    const unmatchedReviewIds = [];
    const unverifiableReviewIds = [];
    const markedPayrollRunIds = [];
    const legacyManualReviewRunIds = [];
    const queueTargetManualReviewRunIds = [];

    for (const review of correctionReviews) {
      let reviewHasQueueTargetManualReview = false;
      const reviewCaoKey = resolveReviewCaoKey(review, configById);
      if (!reviewCaoKey) {
        const data = buildCorrectionData(
          review,
          null,
          'manual_review_required',
          'CAO-wijziging mist cao_key en gekoppelde CAOConfiguration kon niet worden herleid; automatische correctiematching is geblokkeerd om cross-CAO fouten te voorkomen.',
          null,
          {
            match_type: 'manual_review_missing_cao_key',
            evidence: {
              strategy: 'manual_review_missing_cao_key',
              review_id: review.id,
              cao_configuration_id: review.cao_configuration_id || null
            }
          }
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        unmatchedReviewIds.push(review.id);
        unverifiableReviewIds.push(review.id);
        await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
          correction_status: 'manual_review_required'
        });
        continue;
      }

      const effectiveDateReviewReason = effectiveDateManualReviewReason(review);
      if (effectiveDateReviewReason) {
        const data = buildCorrectionData(
          review,
          null,
          'manual_review_required',
          effectiveDateReviewReason,
          reviewCaoKey,
          {
            match_type: 'manual_review_effective_date',
            evidence: {
              strategy: 'manual_review_effective_date',
              effective_from: review.effective_from || null,
              effective_until: review.effective_until || null,
              effective_from_source: review.effective_from_source || null,
              effective_from_inferred: review.effective_from_inferred === true,
              effective_date_manual_review_required: review.effective_date_manual_review_required === true,
              effective_date_warnings: normalizeArray(review.effective_date_warnings)
            }
          }
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        unmatchedReviewIds.push(review.id);
        unverifiableReviewIds.push(review.id);
        await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
          correction_status: 'manual_review_required'
        });
        continue;
      }

      if (!review.effective_from) {
        const data = buildCorrectionData(
          review,
          null,
          'manual_review_required',
          'CAO-wijziging heeft payroll-impact maar mist effective_from; automatische correctiematching is geblokkeerd omdat historische loonruns niet veilig kunnen worden afgebakend.',
          reviewCaoKey,
          {
            match_type: 'manual_review_effective_date',
            evidence: {
              strategy: 'manual_review_missing_effective_from',
              effective_from: null,
              effective_until: review.effective_until || null
            }
          }
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        unmatchedReviewIds.push(review.id);
        unverifiableReviewIds.push(review.id);
        await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
          correction_status: 'manual_review_required'
        });
        continue;
      }

      const exactAffectedRuns = payrollRuns.filter(run =>
        runMatchesReviewCao(run, reviewCaoKey, configById) &&
        runTouchesReview(run, review)
      );
      const legacyPossibleRuns = payrollRuns.filter(run =>
        runMatchesReviewCao(run, reviewCaoKey, configById) &&
        legacyRunMayTouchReview(run, review)
      );

      if (exactAffectedRuns.length === 0 && legacyPossibleRuns.length === 0) {
        const data = buildCorrectionData(
          review,
          null,
          'skipped_no_affected_run',
          `Geen bestaande PayrollCalculationRun voor CAO ${reviewCaoKey} gevonden die overlapt met de ingangsdatum van de CAO-wijziging.`,
          reviewCaoKey,
          {
            match_type: 'unmatched_no_existing_run',
            evidence: {
              strategy: 'unmatched_no_existing_run',
              cao_key: reviewCaoKey,
              effective_from: review.effective_from || null,
              effective_until: review.effective_until || null,
              checked_payroll_run_count: payrollRuns.length
            }
          }
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        unmatchedReviewIds.push(review.id);
        await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
          correction_status: 'skipped_no_affected_run'
        });
        continue;
      }

      for (const run of exactAffectedRuns) {
        const finalized = isFinalizedPayrollRun(run);
        const queueTarget = finalized
          ? resolveCorrectionQueueTarget({
            review,
            run,
            reviewCaoKey,
            config: resolveReviewConfig(review, reviewCaoKey, configById, configByCaoKey),
            payrollRuns,
            configById,
            queueReferenceDate,
            requestedTarget: requestedQueueTarget
          })
          : {};
        const status = finalized
          ? queueTarget.manual_review_required === true ? 'manual_review_required' : 'queued'
          : 'candidate';
        const reason = finalized
          ? queueTarget.manual_review_required === true
            ? `Payrollrun is al goedgekeurd/geëxporteerd/betaald, maar de eerstvolgende correctie-loonperiode kon niet audit-proof worden bepaald: ${normalizeArray(queueTarget.warnings).join(' ')}`
            : `Payrollrun is al goedgekeurd/geëxporteerd/betaald; correctie moet worden verwerkt in loonperiode ${queueTarget.pay_period_year}-${queueTarget.pay_period_number}.`
          : 'Payrollrun valt binnen retroactieve CAO-periode; herberekening vereist voordat deze definitief wordt.';

        const data = buildCorrectionData(review, run, status, reason, reviewCaoKey, exactOverlapEvidence(run, review), queueTarget);
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);

        await markPayrollRunForRecalculation(base44, run, review.id);
        markedPayrollRunIds.push(run.id);
        if (queueTarget.manual_review_required === true) {
          reviewHasQueueTargetManualReview = true;
          queueTargetManualReviewRunIds.push(run.id);
          unverifiableReviewIds.push(review.id);
        }
      }

      for (const run of legacyPossibleRuns) {
        const data = buildCorrectionData(
          review,
          run,
          'manual_review_required',
          'Legacy payrollrun mist pay_period_start/pay_period_end; handmatige review vereist om overlap exact te bepalen. Deze run wordt niet automatisch als geraakt gemarkeerd.',
          reviewCaoKey,
          {
            match_type: 'legacy_year_only_possible_overlap',
            evidence: {
              strategy: 'legacy_year_only_possible_overlap',
              payroll_run_id: run.id || null,
              pay_period_year: run.pay_period_year ?? null,
              pay_period_number: run.pay_period_number ?? null,
              effective_from: review.effective_from || null,
              effective_until: review.effective_until || null,
              reason: 'pay_period_start/pay_period_end ontbreken; exacte overlap kan niet automatisch worden bewezen.'
            }
          }
        );
        const saved = await upsertCorrection(base44, data);
        if (saved.created) createdCorrectionIds.push(saved.id);
        else updatedCorrectionIds.push(saved.id);
        legacyManualReviewRunIds.push(run.id);
      }

      const hasLegacyRunsWithoutExactDates = legacyPossibleRuns.length > 0;
      if (hasLegacyRunsWithoutExactDates || reviewHasQueueTargetManualReview) {
        unverifiableReviewIds.push(review.id);
      }
      await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
        correction_status: hasLegacyRunsWithoutExactDates || reviewHasQueueTargetManualReview
          ? 'manual_review_required'
          : exactAffectedRuns.some(isFinalizedPayrollRun)
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
      legacy_manual_review_run_ids: [...new Set(legacyManualReviewRunIds)],
      queue_target_manual_review_run_ids: [...new Set(queueTargetManualReviewRunIds)],
      unmatched_review_ids: unmatchedReviewIds,
      unverifiable_review_ids: [...new Set(unverifiableReviewIds)]
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/** Best-effort, bounded retention cleanup after an authenticated worker heartbeat.
 * Only immutable analysis snapshots are removed; ManagedFiles are never touched.
 * Current index references remain authoritative, including expired references.
 */
export async function cleanupExpiredAnalysisSnapshots(base44, settings, now = Date.now(), mayContinue = () => true) {
  const snapshots = base44.asServiceRole.entities.FloorPlanAnalysisJobSnapshot;
  const services = base44.asServiceRole.entities.FloorPlanAnalysisService;
  const before = now - 60 * 60 * 1000;
  const rows = await snapshots.filter({retain_until: {$lt: new Date(before).toISOString()}}, 'retain_until', 10);
  if (!Array.isArray(rows)) return {removed: 0};
  let removed = 0;
  for (const row of rows.slice(0, 10)) {
    if (!mayContinue()) break;
    if (typeof row?.id !== 'string' || !row.id || !Number.isFinite(Date.parse(row.retain_until)) || Date.parse(row.retain_until) >= before) continue;
    // Refresh before every delete. Never rely on the earlier heartbeat's index.
    const service = await services.get(settings.singletonId);
    if (!mayContinue()) break;
    if (!service || !service.jobs || typeof service.jobs !== 'object' || Array.isArray(service.jobs)) continue;
    if (Object.values(service.jobs).some(entry => entry?.snapshot_id === row.id)) continue;
    await snapshots.delete(row.id);
    removed++;
  }
  return {removed};
}

export async function maintainAfterWorkerHeartbeat(base44, settings, body, budgetMs = 1000) {
  if (body.action !== 'heartbeat') return;
  // Cap extra heartbeat latency at one second. A pending SDK operation is not
  // cancellable, but no subsequent deletion starts once this budget expires.
  let expired = false, timer;
  try {
    const timeout = new Promise(resolve => {timer = setTimeout(() => {expired = true; resolve(undefined);}, budgetMs);});
    const cleanup = cleanupExpiredAnalysisSnapshots(base44, settings, Date.now(), () => !expired).catch(() => undefined);
    await Promise.race([cleanup, timeout]);
  } finally { expired = true; clearTimeout(timer); }
}

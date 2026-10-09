/** Proposed server-only queue engine. Not deployed; see BASE44-PROMPT.md.
 * One service-record CAS activates immutable job snapshots and their receipts.
 * Never find jobs by listing staging rows: only service.jobs pointers are live.
 */
export const QUEUE_POLICY = Object.freeze({jobTtlMs: 600_000, retentionMs: 86_400_000, leaseMs: 60_000, workerOnlineMs: 45_000, maxJobs: 500, maxAttempts: 2});
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired']);
const failureCodes = new Set(['invalid_image', 'model_unavailable', 'model_output_invalid', 'analysis_timeout', 'analysis_failed']);
const errors = {invalid_image: 'De afbeelding kon niet worden verwerkt.', model_unavailable: 'De AI-server is tijdelijk niet beschikbaar.', model_output_invalid: 'De AI kon geen bruikbaar voorstel maken.', analysis_timeout: 'De analyse duurde te lang.', analysis_failed: 'De analyse is niet gelukt.'};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,180}$/.test(value);
const sameScope = (a, b) => ['customer_id', 'object_id', 'building_selection_key'].every(key => a[key] === b[key]);
const epoch = value => Date.parse(value);
const clone = value => structuredClone(value);
export class QueueError extends Error { constructor(status, code, message) { super(message); this.status = status; this.details = {code}; } }
const fail = (status, code, message) => { throw new QueueError(status, code, message); };
const strict = (value, keys) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'invalid_analysis_request', 'Ongeldige analyseaanvraag.'); };
const scopeKeys = ['customer_id', 'object_id', 'building_selection_key'];
const sourceKeys = ['file_id', 'width', 'height', 'source_kind'];

/** deps.store: getService(), getSnapshot(id), stageSnapshot(job),
 * casService(expectedVersion, next)->boolean (exactly one DB record updated).
 * authorizeScope(actor,body,mutable) reuses existing admin/object/building checks.
 * validateSource(state,source) returns {sha256} after full ManagedFile ownership checks.
 * loadSource(job) rechecks actor/scope/file, decrypts and validates PNG/hash/dimensions.
 * validateJobScope(job) rechecks original actor and current object/building rights.
 * validateResult(result,width,height) strictly validates already-PIXEL proposals.
 * hash(text) is server SHA-256, randomToken() cryptographically random 32 bytes.
 * workerIds is a server-configured allowlist, never obtained from client data.
 */
export function createFloorPlanAnalysisQueue(deps) {
  const {store, authorizeScope, validateSource, loadSource, validateJobScope, validateResult, hash, randomToken} = deps;
  const now = deps.now || Date.now, policy = {...QUEUE_POLICY, ...deps.policy};
  const iso = value => new Date(value).toISOString();
  const digest = value => hash(JSON.stringify(canonical(value)));
  const active = job => !terminal.has(job.status) && epoch(job.expires_at) > now();
  const liveLease = job => active(job) && job.status === 'running' && epoch(job.lease_expires_at) > now();
  const dto = job => ({id: job.id, status: active(job) || terminal.has(job.status) ? job.status : 'expired', created_at: job.created_at, expires_at: job.expires_at, poll_after_ms: 2000,
    ...(job.status === 'completed' ? {result: clone(job.result)} : {}), ...(job.status === 'failed' ? {error: {code: job.error_code, message: errors[job.error_code] || errors.analysis_failed}} : {})});
  const requireActor = actor => { if (!actor?.id || actor.role !== 'admin') fail(actor ? 403 : 401, 'analysis_access_denied', 'Meld je aan met een geautoriseerd LOQ-beheerdersaccount.'); };
  const requireWorker = worker => { if (!isId(worker?.id) || !deps.workerIds.includes(worker.id)) fail(403, 'worker_access_denied', 'Geen toegang.'); };
  async function jobAt(state, id) {
    if(typeof id !== 'string' || !Object.hasOwn(state.jobs,id))return null;
    const entry = state.jobs[id];
    if (!entry || epoch(entry.retain_until) <= now()) return null;
    const job = await store.getSnapshot(entry.snapshot_id);
    if (!job || job.id !== id || job.version !== entry.version) fail(503, 'analysis_pointer_invalid', 'De analysewachtrij is tijdelijk niet beschikbaar.');
    return job;
  }
  async function snapshot(state, job) {
    const saved = await store.stageSnapshot(job);
    state.jobs[job.id] = {snapshot_id: saved.id, version: job.version, status: job.status, actor_id: job.actor_id, worker_id: job.worker_id || null,
      expires_at: job.expires_at, lease_expires_at: job.lease_expires_at || null, created_at: job.created_at, retain_until: job.retain_until};
  }
  async function transact(run) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = clone(await store.getService());
      if (!state || !Number.isSafeInteger(state.version) || !state.jobs || !state.receipts || !state.workers || !Number.isInteger(state.max_workers) || state.max_workers < 1 || state.max_workers > 16) fail(503, 'analysis_not_configured', 'De AI-service is nog niet geconfigureerd.');
      const version = state.version;
      for (const [id, entry] of Object.entries(state.jobs)) if (epoch(entry.retain_until) <= now()) delete state.jobs[id];
      for (const [key, receipt] of Object.entries(state.receipts)) if (epoch(receipt.retain_until) <= now()) delete state.receipts[key];
      const outcome = await run(state);
      if (!outcome.write) return outcome.value;
      state.version = version + 1;
      if (new TextEncoder().encode(JSON.stringify(state)).length > 4 * 1024 * 1024) fail(503, 'analysis_queue_full', 'De analysewachtrij is vol. Probeer later opnieuw.');
      if (await store.casService(version, state)) return outcome.value;
    }
    fail(409, 'analysis_queue_busy', 'De analysewachtrij wordt bijgewerkt. Herhaal hetzelfde verzoek.');
  }
  function requireKey(body) { if (!isId(body.idempotency_key) || body.idempotency_key.length < 8) fail(400, 'invalid_analysis_request', 'Een geldige idempotency_key is verplicht.'); }
  async function ownedJob(state, actor, body) {
    await authorizeScope(actor, body, false);
    const job = await jobAt(state, body.job_id);
    if (!job || job.actor_id !== actor.id || !sameScope(job, body)) fail(404, 'analysis_not_found', 'Deze analyse is niet beschikbaar.');
    return job;
  }
  const serviceStatus = state => {
    const online = Object.entries(state.workers).some(([id, worker]) => deps.workerIds.includes(id) && worker.ready === true && epoch(worker.last_seen_at) + policy.workerOnlineMs > now());
    return {protocol_version: 1, available: state.enabled === true && online, reason_code: state.enabled !== true ? 'disabled' : online ? 'ready' : 'worker_offline', poll_after_ms: 2000};
  };
  async function client(actor, body) {
    requireActor(actor);
    if (body.action === 'get_floor_plan_analysis_service_status') { strict(body, ['action']); return transact(async state => ({value: serviceStatus(state)})); }
    if (body.action === 'get_object_floor_plan_analysis_job') {
      strict(body, ['action', ...scopeKeys, 'job_id']);
      return transact(async state => ({value: {job: dto(await ownedJob(state, actor, body))}}));
    }
    if (body.action === 'cancel_object_floor_plan_analysis_job') {
      strict(body, ['action', ...scopeKeys, 'job_id', 'idempotency_key']); requireKey(body);
      const key = await hash(`${actor.id}:${body.action}:${body.idempotency_key}`), fingerprint = await digest(body);
      return transact(async state => {
        const job = await ownedJob(state, actor, body), receipt = state.receipts[key];
        if (receipt && receipt.fingerprint !== fingerprint) fail(409, 'analysis_idempotency_conflict', 'Deze aanvraagsleutel is eerder met andere inhoud gebruikt.');
        if (receipt) return {value: {job: dto(job)}};
        const next = !active(job) ? job : {...job, version: job.version + 1, status: 'cancelled', finished_at: iso(now()), result: null};
        if (next !== job) await snapshot(state, next);
        state.receipts[key] = {fingerprint, job_id: job.id, retain_until: job.retain_until};
        return {write: true, value: {job: dto(next)}};
      });
    }
    if (body.action !== 'create_object_floor_plan_analysis_job') fail(400, 'invalid_analysis_action', 'Onbekende analyseactie.');
    strict(body, ['action', ...scopeKeys, 'expected_map_version', 'idempotency_key', 'source']); strict(body.source, sourceKeys); requireKey(body);
    if (!isId(body.source.file_id) || ![body.source.width, body.source.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096) || !['photo', 'scan', 'pdf', 'vector-pdf', 'image'].includes(body.source.source_kind)) fail(400, 'invalid_analysis_source', 'Ongeldige bronafbeelding.');
    const key = await hash(`${actor.id}:${body.action}:${body.idempotency_key}`), fingerprint = await digest(body);
    const id = `analysis-${await hash(`${actor.id}:${body.idempotency_key}`)}`;
    return transact(async state => {
      await authorizeScope(actor, body, false);
      const receipt = state.receipts[key];
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail(409, 'analysis_idempotency_conflict', 'Deze aanvraagsleutel is eerder met andere inhoud gebruikt.');
        const previous = await jobAt(state, receipt.job_id);
        if (!previous || previous.actor_id !== actor.id || !sameScope(previous, body)) fail(409, 'analysis_receipt_invalid', 'De eerdere analyse kan niet veilig worden hersteld.');
        return {value: {job: dto(previous), replayed: true}};
      }
      if (!serviceStatus(state).available) fail(503, 'analysis_service_unavailable', 'De AI-server is tijdelijk niet bereikbaar. Je kunt lokaal herkennen of handmatig verdergaan.');
      if (Object.values(state.jobs).some(entry => entry.actor_id === actor.id && !terminal.has(entry.status) && epoch(entry.expires_at) > now())) fail(429, 'analysis_user_busy', 'Er loopt al een analyse voor je account. Rond die af of annuleer hem eerst.');
      if (Object.keys(state.jobs).length >= policy.maxJobs || Object.keys(state.receipts).length >= policy.maxJobs * 4) fail(429, 'analysis_queue_full', 'De analysewachtrij is vol. Probeer later opnieuw.');
      const scope = await authorizeScope(actor, body, true);
      const file = await validateSource(scope, body.source);
      const job = {id, version: 1, actor_id: actor.id, customer_id: scope.customer.id, object_id: scope.object.id, building_selection_key: scope.key,
        configuration_version: body.expected_map_version, source: {...clone(body.source), sha256: file.sha256}, status: 'queued', created_at: iso(now()), expires_at: iso(now() + policy.jobTtlMs), retain_until: iso(now() + policy.retentionMs), lease_attempts: 0};
      await snapshot(state, job);
      state.receipts[key] = {fingerprint, job_id: job.id, retain_until: job.retain_until};
      return {write: true, value: {job: dto(job), replayed: false}};
    });
  }
  async function worker(identity, body) {
    requireWorker(identity);
    if (body.worker_id !== identity.id) fail(403, 'worker_access_denied', 'Geen toegang.');
    if (['heartbeat', 'lease'].includes(body.action)) {
      strict(body, ['action', 'worker_id', 'protocol_version', 'model_id']);
      if (body.protocol_version !== 1 || !isId(body.model_id)) fail(400, 'invalid_worker_request', 'Ongeldig workerprotocol.');
      const leased = await transact(async state => {
        state.workers[identity.id] = {last_seen_at: iso(now()), model_id: body.model_id, ready: true};
        if (body.action === 'heartbeat') return {write: true, value: {ok: true, protocol_version: 1}};
        if (state.enabled !== true) return {write: true, value: {job: null, poll_after_ms: 5000}};
        const leases = Object.values(state.jobs).filter(entry => entry.status === 'running' && epoch(entry.lease_expires_at) > now() && epoch(entry.expires_at) > now());
        if (leases.length >= Math.max(1, state.max_workers || 1) || leases.some(entry => entry.worker_id === identity.id)) return {write: true, value: {job: null, poll_after_ms: 5000}};
        const candidates = Object.entries(state.jobs).filter(([, entry]) => !terminal.has(entry.status) && epoch(entry.expires_at) > now() && !(entry.status === 'running' && epoch(entry.lease_expires_at) > now())).sort((a, b) => epoch(a[1].created_at) - epoch(b[1].created_at));
        for (const [id] of candidates) {
          const job = await jobAt(state, id);
          if (!job) continue;
          if (job.lease_attempts >= policy.maxAttempts) { await snapshot(state, {...job, version: job.version + 1, status: 'failed', error_code: 'analysis_timeout', finished_at: iso(now())}); continue; }
          try { await validateJobScope(job); } catch { await snapshot(state, {...job, version: job.version + 1, status: 'failed', error_code: 'analysis_failed', finished_at: iso(now())}); continue; }
          const token = randomToken(), tokenHash = await hash(token);
          const next = {...job, version: job.version + 1, status: 'running', worker_id: identity.id, lease_hash: tokenHash, lease_attempts: job.lease_attempts + 1, lease_expires_at: iso(Math.min(now() + policy.leaseMs, epoch(job.expires_at)))};
          await snapshot(state, next);
          return {write: true, value: {internalJob: next, token}};
        }
        return {write: true, value: {job: null, poll_after_ms: 5000}};
      });
      if (!leased.internalJob) return leased;
      const job = leased.internalJob;
      try {
        const source = await loadSource(job);
        // Cancellation or a new owner during private-file loading revokes delivery.
        const current = await transact(async state => ({value: await jobAt(state, job.id)}));
        if (!current || !liveLease(current) || current.lease_hash !== job.lease_hash || current.worker_id !== identity.id) return {job: null, poll_after_ms: 5000};
        return {job: {id: job.id, lease_token: leased.token, lease_expires_at: current.lease_expires_at, expires_at: job.expires_at, source}, poll_after_ms: 5000};
      } catch {
        await worker(identity, {action: 'fail', worker_id: identity.id, job_id: job.id, lease_token: leased.token, error: {code: 'invalid_image'}}).catch(() => {});
        return {job: null, poll_after_ms: 5000};
      }
    }
    if (!['renew', 'complete', 'fail'].includes(body.action)) fail(400, 'invalid_worker_action', 'Onbekende workeractie.');
    strict(body, ['action', 'worker_id', 'job_id', 'lease_token', ...(body.action === 'complete' ? ['result'] : body.action === 'fail' ? ['error'] : [])]);
    if (!isId(body.job_id) || typeof body.lease_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.lease_token)) fail(400, 'invalid_worker_request', 'Ongeldige lease.');
    const tokenHash = await hash(body.lease_token);
    return transact(async state => {
      const job = await jobAt(state, body.job_id);
      if (!job || job.worker_id !== identity.id || job.lease_hash !== tokenHash) {
        if (body.action === 'renew') return {value: {continue: false, reason: 'lease_lost'}};
        fail(409, 'analysis_lease_lost', 'Deze lease is niet meer geldig.');
      }
      let result, errorCode;
      if (body.action === 'complete') result = validateResult(body.result, job.source.width, job.source.height);
      if (body.action === 'fail') { strict(body.error, ['code']); errorCode = failureCodes.has(body.error.code) ? body.error.code : 'analysis_failed'; }
      const completionHash = body.action === 'renew' ? null : await digest({action: body.action, result: result || null, error_code: errorCode || null});
      if (terminal.has(job.status)) {
        if (body.action === 'renew') return {value: {continue: false, reason: job.status === 'cancelled' ? 'cancelled' : 'expired'}};
        if (job.completion_hash === completionHash) return {value: {accepted: true, job_status: job.status, replayed: true}};
        fail(409, 'analysis_lease_lost', 'Deze analyse is al afgesloten.');
      }
      if (!liveLease(job)) {
        if (body.action === 'renew') return {value: {continue: false, reason: active(job) ? 'lease_lost' : 'expired'}};
        fail(409, 'analysis_lease_lost', 'Deze lease is verlopen.');
      }
      try { await validateJobScope(job); } catch { if (body.action === 'renew') return {value: {continue: false, reason: 'lease_lost'}}; fail(409, 'analysis_access_changed', 'De gebouwtoegang is gewijzigd.'); }
      const next = {...job, version: job.version + 1};
      state.workers[identity.id] = {...state.workers[identity.id], last_seen_at: iso(now()), ready: true};
      if (body.action === 'renew') {
        next.lease_expires_at = iso(Math.min(now() + policy.leaseMs, epoch(job.expires_at)));
        await snapshot(state, next);
        return {write: true, value: {continue: true, lease_expires_at: next.lease_expires_at}};
      }
      next.status = body.action === 'complete' ? 'completed' : 'failed'; next.completion_hash = completionHash; next.finished_at = iso(now());
      if (result) next.result = result; if (errorCode) next.error_code = errorCode;
      await snapshot(state, next);
      return {write: true, value: {accepted: true, job_status: next.status, replayed: false}};
    });
  }
  return {client, worker};
}

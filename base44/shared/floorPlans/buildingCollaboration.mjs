import {canonical, splitDocument, applyChanges, dependencyResources, conflictingChanges, coversResource, resourcesConflict, parseResourceId} from './collabDocument.mjs';

export const ACTIONS = Object.freeze({
  open: 'open_object_building_floor_plan_collaboration',
  get: 'get_object_building_floor_plan_collaboration',
  claim: 'claim_object_building_floor_plan_resources',
  renew: 'renew_object_building_floor_plan_resources',
  release: 'release_object_building_floor_plan_resources',
  apply: 'apply_object_building_floor_plan_operation',
  publish: 'publish_object_building_floor_plan_collaboration',
  leave: 'leave_object_building_floor_plan_collaboration',
});
export const LEASE_MS = 12_000, SESSION_MS = 45_000;
const MAX_SESSIONS = 24, MAX_LEASES = 64, MAX_RESOURCES = 2048, MAX_RECEIPTS = 256;
const COLORS = ['#1683ff', '#a348df', '#008f74', '#d06600', '#cf3672', '#487b20'];
export class CollaborationError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.details = {code, ...details}; }
}
const fail = (status, code, message, details) => { throw new CollaborationError(status, code, message, details); };
const clone = value => structuredClone(value);
const iso = milliseconds => new Date(milliseconds).toISOString();
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/.test(value);
const table = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const keepNewest = (records, key, value) => Object.fromEntries([...Object.entries(records).filter(([id]) => id !== key), [key, value]].slice(-MAX_RECEIPTS));
const expired = (value, now) => !value || !Number.isSafeInteger(value.expires_at_ms) || value.expires_at_ms <= now;
async function defaultHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function blankState() { return {protocol: 1, generation: 0, next_fence: 1, retired_through_version: 0, sessions: {}, leases: {}, claims: {}, operations: {}}; }
function sanitizeState(value, now) {
  const state = value ? clone(value) : blankState();
  if (state.protocol !== 1 || !Number.isSafeInteger(state.generation) || !Number.isSafeInteger(state.next_fence)) fail(409, 'collaboration_state_invalid', 'De samenwerking kan nu niet worden geopend.');
  state.sessions = Object.fromEntries(Object.entries(table(state.sessions)).filter(([, session]) => !expired(session, now)));
  state.leases = Object.fromEntries(Object.entries(table(state.leases)).filter(([, lease]) => !expired(lease, now) && state.sessions[lease.session_id]));
  state.claims = table(state.claims); state.operations = table(state.operations);
  state.retired_through_version ??= 0;
  if (!Number.isSafeInteger(state.retired_through_version) || state.retired_through_version < 0) fail(409, 'collaboration_state_invalid', 'De samenwerkingshistorie is ongeldig.');
  return state;
}
function requestLeases(body) {
  if (!Array.isArray(body.leases) || body.leases.length > MAX_LEASES || body.leases.some(item => !safeId(item?.lease_id) || !Number.isSafeInteger(item?.fence) || item.fence < 1) || new Set(body.leases.map(item => item.lease_id)).size !== body.leases.length) fail(400, 'invalid_collaboration_request', 'Ongeldige reserveringen.');
  return body.leases;
}
function sessionFor(state, user, body, now) {
  const session = state.sessions[body.session_id];
  if (!session || session.user_id !== user.id || expired(session, now)) fail(409, 'collaboration_session_expired', 'De verbinding met deze tekenwerkruimte is verlopen. Open de actuele tekening opnieuw.');
  return session;
}
function leaseFor(state, session, id, fence, now) {
  const lease = state.leases[id];
  if (!lease || lease.session_id !== session.session_id || lease.fence !== fence || expired(lease, now)) fail(409, 'floor_plan_lease_lost', 'Dit onderdeel is niet meer voor u gereserveerd.');
  return lease;
}
function presenceFor(input, document) {
  if (input === undefined) return undefined;
  if (input?.floor_id === null && Array.isArray(input.selection_resource_ids) && input.selection_resource_ids.length === 0 && !input.cursor && Object.keys(input).every(key => ['floor_id', 'selection_resource_ids'].includes(key))) return {floor_id: null, selection_resource_ids: []};
  if (!input || Object.keys(input).some(key => !['floor_id', 'selection_resource_ids', 'cursor'].includes(key)) || !document.floors.some(floor => floor.id === input.floor_id) || !Array.isArray(input.selection_resource_ids) || input.selection_resource_ids.length > 128) fail(400, 'invalid_collaboration_presence', 'Ongeldige aanwezigheid.');
  const resources = splitDocument(document);
  for (const id of input.selection_resource_ids) { parseResourceId(id); if (!Object.hasOwn(resources, id)) fail(400, 'invalid_collaboration_presence', 'Dit onderdeel bestaat niet.'); }
  const cursor = input.cursor;
  if (cursor && (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y) || Math.abs(cursor.x) > 100000 || Math.abs(cursor.y) > 100000 || Object.keys(cursor).some(key => !['x', 'y'].includes(key)))) fail(400, 'invalid_collaboration_presence', 'Ongeldige positie.');
  return {floor_id: input.floor_id, selection_resource_ids: [...new Set(input.selection_resource_ids)], ...(cursor ? {cursor: clone(cursor)} : {})};
}

/** The adapter's commit() MUST compare the same authoritative object-index
 * revision used by load(), including collaboration state, document pointer and
 * map version. No mutation may bypass that CAS. Staged rows alone are never live.
 * load() MUST authenticate current scope on every call, including receipt replay.
 */
export function createBuildingCollaboration({load, commit, validateDocument, stagePublication, recordCommitted = async () => {}, now = Date.now, randomId = () => crypto.randomUUID(), hash = defaultHash}) {
  const actions = new Set(Object.values(ACTIONS));
  function response(loaded, state, session, extra = {}) {
    const time = now();
    const active = sanitizeState(state, time);
    const entry = loaded.entry;
    return {capabilities: {collaboration_protocol: 1, document_versions: [1, 2]}, configuration_version: loaded.mapVersion,
      server_time: iso(time), generation: active.generation,
      session: session ? {session_id: session.session_id, client_id: session.client_id, expires_at: iso(session.expires_at_ms)} : null,
      workspace: entry?.snapshot_id ? {id: entry.id, version: entry.version, document: clone(loaded.document), current_published_floor_plan_id: entry.current_published_floor_plan_id || null, published_revision: entry.published_revision || 0, updated_at: entry.updated_at} : null,
      presence: Object.values(active.sessions).map(item => ({session_id: item.session_id, user_name: item.user_name, color: item.color, ...clone(item.presence || {}), expires_at: iso(item.expires_at_ms)})),
      leases: Object.values(active.leases).map(item => ({lease_id: item.lease_id, session_id: item.session_id, fence: item.fence, resource_ids: [...item.resource_ids], expires_at: iso(item.expires_at_ms)})), ...extra};
  }
  async function handle(action, user, body) {
    if (!actions.has(action)) fail(400, 'invalid_collaboration_action', 'Onbekende samenwerkingsactie.');
    if (!user?.id || user.role !== 'admin') fail(403, 'collaboration_forbidden', 'Alleen bevoegde LOQ-beheerders hebben toegang.');
    if (!body || new TextEncoder().encode(JSON.stringify(body)).length > 9 * 1024 * 1024) fail(413, 'collaboration_request_too_large', 'Deze wijziging is te groot.');
    const fingerprint = await hash(JSON.stringify(canonical({action, body})));
    const operationKey = [ACTIONS.apply, ACTIONS.publish].includes(action) ? await hash(`${user.id}:${body.operation_id}`) : null;
    const claimKey = action === ACTIONS.claim ? await hash(`${user.id}:${body.request_id}`) : null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const loaded = await load(user, body); // includes scope + selected-building check
      const time = now(), state = sanitizeState(loaded.entry?.collaboration, time);
      // Acknowledging a successful old request is not a new write. This remains
      // resolvable after expiry/takeover, only for the same authorized actor/body.
      if (operationKey && state.operations[operationKey]) {
        const receipt = state.operations[operationKey];
        if (receipt.fingerprint !== fingerprint) fail(409, 'floor_plan_operation_reused', 'Deze wijzigingssleutel is eerder anders gebruikt.');
        await recordCommitted(loaded, loaded.entry, {action, user, body, fingerprint}, receipt.version);
        return response(loaded, state, state.sessions[body.session_id], {replayed: true, committed_version: receipt.version, operation_id: body.operation_id});
      }
      if (action !== ACTIONS.get && (!Number.isSafeInteger(body.expected_map_version) || body.expected_map_version !== loaded.mapVersion)) fail(409, 'building_configuration_conflict', 'De gebouwselectie is gewijzigd. Open het gebouw opnieuw.', {configuration_version: loaded.mapVersion});
      if (loaded.archived) fail(409, 'object_archived', 'Dit object is gearchiveerd.');
      let entry = clone(loaded.entry || {id: randomId(), version: 0, snapshot_id: null, current_published_floor_plan_id: loaded.legacyPublication?.id || null, published_revision: loaded.legacyPublication?.revision || 0});
      let document = loaded.document, changedDocument = false, session, extra = {};
      if (action === ACTIONS.open) {
        if (!safeId(body.client_id)) fail(400, 'invalid_collaboration_client', 'Een vensteridentificatie is verplicht.');
        if (!document) {
          if (!body.initial_document) fail(409, 'floor_plan_initial_document_required', 'De eerste plattegrond ontbreekt.');
          document = await validateDocument(body.initial_document, loaded, user);
          entry.version += 1; entry.updated_at = iso(time); changedDocument = true;
        } else if (!loaded.entry?.collaboration) {
          // Activation is a version barrier too. A legacy save that started
          // before deployment must fail its expected_version after this CAS.
          // The existing immutable snapshot is reused; its content is unchanged.
          entry.version += 1; entry.updated_at = iso(time);
        }
        session = Object.values(state.sessions).find(item => item.user_id === user.id && item.client_id === body.client_id);
        if (!session) {
          if (Object.keys(state.sessions).length >= MAX_SESSIONS) fail(429, 'collaboration_session_limit', 'Er zijn te veel gelijktijdige tekenvensters.');
          const sessionId = randomId(), colorIndex = parseInt((await hash(`${user.id}:${body.client_id}`)).slice(0, 8), 16) % COLORS.length;
          session = {session_id: sessionId, user_id: user.id, client_id: body.client_id, user_name: String(user.full_name || user.name || 'LOQ-gebruiker').replace(/[\u0000-\u001f<>]/g, '').slice(0, 100), color: COLORS[colorIndex], expires_at_ms: time + SESSION_MS, presence: {floor_id: document.floors[0].id, selection_resource_ids: []}};
        } else session.expires_at_ms = time + SESSION_MS;
        state.sessions[session.session_id] = session;
      } else {
        session = sessionFor(state, user, body, time);
        if (!document) fail(409, 'floor_plan_draft_required', 'De tekening ontbreekt.');
        if (action === ACTIONS.get) return response(loaded, state, session);
        if (action === ACTIONS.claim) {
          if (!safeId(body.request_id)) fail(400, 'invalid_collaboration_request', 'Een reserveringssleutel is verplicht.');
          const prior = state.claims[claimKey];
          if (prior) {
            if (prior.fingerprint !== fingerprint) fail(409, 'floor_plan_claim_reused', 'Deze reserveringssleutel is eerder anders gebruikt.');
            const lease = leaseFor(state, session, prior.lease_id, prior.fence, time);
            return response(loaded, state, session, {replayed: true, lease: {lease_id: lease.lease_id, fence: lease.fence, resource_ids: lease.resource_ids, expires_at: iso(lease.expires_at_ms)}});
          }
          const ids = body.resource_ids || [], changes = body.changes || [];
          if (!Array.isArray(ids) || ids.length > MAX_RESOURCES || !Array.isArray(changes) || !ids.length && !changes.length) fail(400, 'invalid_collaboration_request', 'Kies een tekenonderdeel.');
          const resources = splitDocument(document);
          for (const key of ids) { parseResourceId(key); if (!Object.hasOwn(resources, key)) fail(409, 'floor_plan_resource_missing', 'Een geselecteerd onderdeel bestaat niet meer.'); }
          if (changes.length && conflictingChanges(document, changes).length) fail(409, 'floor_plan_resource_conflict', 'Een onderdeel is intussen gewijzigd.', {resource_ids: conflictingChanges(document, changes)});
          const resourceIds = dependencyResources(document, {resourceIds: ids, changes});
          if (resourceIds.length > MAX_RESOURCES) fail(413, 'floor_plan_dependency_limit', 'Reserveer de verdieping voor deze grote bewerking.');
          const blocked = Object.values(state.leases).find(lease => lease.session_id !== session.session_id && lease.resource_ids.some(a => resourceIds.some(b => resourcesConflict(a, b))));
          if (blocked) fail(423, 'floor_plan_resource_busy', 'Een andere gebruiker bewerkt dit onderdeel.', {session_id: blocked.session_id, resource_ids: blocked.resource_ids, expires_at: iso(blocked.expires_at_ms)});
          if (Object.keys(state.leases).length >= MAX_LEASES || state.next_fence >= Number.MAX_SAFE_INTEGER) fail(429, 'floor_plan_lease_limit', 'Er zijn te veel actieve reserveringen.');
          const lease = {lease_id: randomId(), session_id: session.session_id, fence: state.next_fence++, resource_ids: resourceIds, expires_at_ms: time + LEASE_MS};
          state.leases[lease.lease_id] = lease;
          state.claims = keepNewest(state.claims, claimKey, {fingerprint, lease_id: lease.lease_id, fence: lease.fence});
          extra.lease = {lease_id: lease.lease_id, fence: lease.fence, resource_ids: resourceIds, expires_at: iso(lease.expires_at_ms)};
        } else if (action === ACTIONS.renew) {
          for (const wanted of requestLeases(body)) leaseFor(state, session, wanted.lease_id, wanted.fence, time).expires_at_ms = time + LEASE_MS;
          const presence = presenceFor(body.presence, document);
          if (presence) session.presence = presence;
          session.expires_at_ms = time + SESSION_MS;
        } else if (action === ACTIONS.release) {
          for (const wanted of requestLeases(body)) {
            const lease = state.leases[wanted.lease_id];
            // A late release is harmless; it must never remove a new owner's lock.
            if (lease?.session_id === session.session_id && lease.fence === wanted.fence) delete state.leases[wanted.lease_id];
          }
        } else if (action === ACTIONS.leave) {
          delete state.sessions[session.session_id];
          for (const lease of Object.values(state.leases)) if (lease.session_id === session.session_id) delete state.leases[lease.lease_id];
          session = null;
        } else if (action === ACTIONS.apply || action === ACTIONS.publish) {
          if (!safeId(body.operation_id) || !Number.isSafeInteger(body.base_version) || body.base_version < 0 || body.base_version > entry.version) fail(400, 'invalid_floor_plan_operation', 'Ongeldige tekenwijziging.');
          if (body.base_version < state.retired_through_version) fail(409, 'floor_plan_operation_history_expired', 'Deze oude wijziging kan niet meer veilig worden herhaald. Laad de actuele tekening.', {current_version: entry.version});
          const lease = leaseFor(state, session, body.lease_id, body.fence, time);
          if (action === ACTIONS.publish) {
            if (typeof stagePublication !== 'function') fail(503, 'collaboration_publication_unavailable', 'Publiceren is nog niet beschikbaar.');
            if (body.base_version !== entry.version || body.expected_current_floor_plan_id !== (entry.current_published_floor_plan_id || null)) fail(409, 'floor_plan_publication_conflict', 'Controleer eerst de nieuwste gezamenlijke tekening.');
            if (!lease.resource_ids.includes('document')) fail(409, 'floor_plan_dependencies_changed', 'Reserveer de tekening kort voor publicatie.');
            const published = await stagePublication(document, loaded, entry, {action, user, body, fingerprint});
            entry = {...entry, ...published, version: entry.version + 1, updated_at: iso(time)};
          } else {
          const conflicts = conflictingChanges(document, body.changes);
          if (conflicts.length) fail(409, 'floor_plan_resource_conflict', 'Een onderdeel is intussen gewijzigd.', {resource_ids: conflicts});
          const required = dependencyResources(document, {changes: body.changes});
          const missing = required.filter(key => !lease.resource_ids.some(locked => coversResource(locked, key)));
          if (missing.length) fail(409, 'floor_plan_dependencies_changed', 'Deze wijziging raakt meer onderdelen. Reserveer deze opnieuw.', {resource_ids: missing});
          document = await validateDocument(applyChanges(document, body.changes), loaded, user);
          entry.version += 1; entry.updated_at = iso(time); changedDocument = true;
          }
          const operations = [...Object.entries(state.operations), [operationKey, {fingerprint, version: entry.version, session_id: session.session_id}]];
          const evicted = operations.slice(0, Math.max(0, operations.length - MAX_RECEIPTS));
          state.retired_through_version = Math.max(state.retired_through_version, ...evicted.map(([, receipt]) => receipt.version));
          state.operations = Object.fromEntries(operations.slice(-MAX_RECEIPTS));
          extra = {replayed: false, operation_id: body.operation_id, committed_version: entry.version};
        }
      }
      state.generation += 1; entry.collaboration = state;
      // Storage work may take time. Reject before activation if the claimed
      // session or fencing lease expired while validating files/geometry.
      if ([ACTIONS.apply, ACTIONS.publish].includes(action)) { sessionFor(state, user, body, now()); leaseFor(state, session, body.lease_id, body.fence, now()); }
      const committed = await commit(loaded, entry, changedDocument ? document : undefined, {action, user, body, fingerprint});
      if (committed) {
        if ([ACTIONS.apply, ACTIONS.publish].includes(action)) await recordCommitted(loaded, committed.entry || entry, {action, user, body, fingerprint}, entry.version);
        return response({...loaded, entry: committed.entry || entry, document}, state, session, extra);
      }
      // Retry starts from fresh scope, document, locks, dependencies and hashes.
    }
    fail(409, 'floor_plan_collaboration_busy', 'De tekening wordt gelijktijdig bijgewerkt. Probeer opnieuw.', {retryable: true});
  }
  return {actions, handle};
}

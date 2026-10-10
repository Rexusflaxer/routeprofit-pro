import {ACTIONS, CollaborationError, createBuildingCollaboration} from './buildingCollaboration.mjs';

/** Concrete Base44 adapter. Deployment must also apply the supplied integration
 * patch: serverOnly.validateReferences export, dispatch and legacy-write guard.
 * No direct entity access is granted to the desktop renderer.
 */
export function createBase44BuildingCollaboration({base44, entity, floorPlans, validateDesktopDocument, ApiError, sha256, now = Date.now, audit = async () => {}}) {
  const fail = (status, code, message) => { throw new CollaborationError(status, code, message); };
  const indexOf = object => object.floor_plan_workspace_index || {};
  async function load(user, body) {
    const scope = await floorPlans.serverOnly.scope(base44, body, false);
    const entry = indexOf(scope.object)[scope.keyHash] || null;
    let document = null;
    if (entry?.snapshot_id) {
      const rows = await entity(base44, 'ObjectBuildingFloorPlanWorkspace').filter({id: entry.snapshot_id}, '-created_date', 2);
      const row = rows[0];
      if (rows.length !== 1 || row.customer_id !== scope.customer.id || row.object_id !== scope.object.id || row.building_selection_key !== scope.key || row.workspace_id !== entry.id) fail(409, 'floor_plan_pointer_invalid', 'De tekenbestandkoppeling is ongeldig.');
      document = validateDesktopDocument(row.document, ApiError);
    }
    const legacyPublication = entry ? null : await floorPlans.resolveCurrent(base44, scope.object, scope.key);
    const rawVersion = Number(scope.object.version);
    const mapVersion = Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 1;
    return {...scope, scope, entry, document, legacyPublication, mapVersion, archived: scope.object.status === 'archived'};
  }
  async function validateDocument(document, loaded) {
    const normalized = validateDesktopDocument(document, ApiError);
    if (typeof floorPlans.serverOnly.validateReferences !== 'function') fail(503, 'collaboration_validation_unavailable', 'De samenwerkingsvalidatie is nog niet beschikbaar.');
    await floorPlans.serverOnly.validateReferences(base44, loaded.scope, normalized);
    return normalized;
  }
  async function commit(loaded, entry, document, operation) {
    const next = structuredClone(entry);
    if (document !== undefined) {
      const row = await entity(base44, 'ObjectBuildingFloorPlanWorkspace').create({
        workspace_id: next.id, customer_id: loaded.customer.id, object_id: loaded.object.id,
        building_selection_key: loaded.key, version: next.version, document,
        operation_hash: await sha256(`${operation.user.id}:collaboration:${operation.body.operation_id || operation.body.client_id}`),
        request_fingerprint: operation.fingerprint, actor_id: operation.user.id, created_at: next.updated_at,
      });
      next.snapshot_id = row.id;
    }
    const old = loaded.object.floor_plan_workspace_index_version;
    const revisionQuery = Number.isSafeInteger(old) ? {floor_plan_workspace_index_version: old} : {$or: [{floor_plan_workspace_index_version: null}, {floor_plan_workspace_index_version: {$exists: false}}]};
    const mapQuery = loaded.object.version == null ? {$or: [{version: null}, {version: {$exists: false}}]} : {version: loaded.object.version};
    const conditions = [revisionQuery, mapQuery];
    if ([ACTIONS.apply, ACTIONS.publish].includes(operation.action)) {
      const lease = loaded.entry?.collaboration?.leases?.[operation.body.lease_id];
      const time = now();
      if (!lease || lease.expires_at_ms <= time) fail(409, 'floor_plan_lease_lost', 'De reservering is verlopen.');
      const prefix = `floor_plan_workspace_index.${loaded.keyHash}.collaboration.leases.${operation.body.lease_id}`;
      conditions.push({[`${prefix}.fence`]: operation.body.fence, [`${prefix}.session_id`]: operation.body.session_id, [`${prefix}.expires_at_ms`]: {$gt: time}});
    }
    const index = {...indexOf(loaded.object), [loaded.keyHash]: next};
    if (new TextEncoder().encode(JSON.stringify(index)).length > 4 * 1024 * 1024) fail(409, 'floor_plan_index_limit', 'De revisie-index is vol.');
    const result = await entity(base44, 'SurveillanceObject').updateMany({id: loaded.object.id, $and: conditions}, {$set: {floor_plan_workspace_index: index, floor_plan_workspace_index_version: (Number.isSafeInteger(old) ? old : 0) + 1}});
    if (result?.success !== true || result.updated !== 1) return false;
    return {entry: next};
  }
  // Called after commit and on every exact receipt replay. The integration's
  // audit sink deduplicates by actor/action/operation/version, including retries
  // after a failure that occurred after the authoritative pointer was committed.
  async function recordCommitted(loaded, entry, operation, version) {
    await audit({user: operation.user, action: operation.action, object_id: loaded.object.id, building_selection_key: loaded.key, operation_id: operation.body.operation_id, workspace_id: entry.id, version});
  }
  async function stagePublication(document, loaded, entry, operation) {
    if (document.floors.some(floor => floor.background && !floor.background.calibrated)) fail(409, 'floor_plan_scale_unconfirmed', 'Bevestig eerst de schaal van iedere onderlegger.');
    await validateDocument(document, loaded);
    const assets = {};
    for (const [field, kind] of [['preview_2d_file_id', 'preview'], ['pdf_file_id', 'pdf']]) if (operation.body.data?.[field]) {
      const file = await floorPlans.serverOnly.assetScope(base44, loaded.scope, operation.body.data[field], [kind]);
      if (file.metadata?.draft_version !== entry.version || file.metadata?.publication_revision !== entry.published_revision + 1) fail(409, 'floor_plan_asset_revision_conflict', 'De afdruk hoort bij een andere tekenversie.');
      assets[field] = file.id;
      if (kind === 'preview') assets.preview_2d_download_filename = file.download_filename;
    }
    if (typeof floorPlans.serverOnly.desktopLegacyFloor !== 'function') fail(503, 'collaboration_publication_unavailable', 'De publicatiekoppeling ontbreekt.');
    const operationHash = await sha256(`${operation.user.id}:collaboration:${operation.body.operation_id}`);
    const rows = await entity(base44, 'ObjectFloorPlan').filter({object_id: loaded.object.id, building_selection_key: loaded.key, desktop_operation_hash: operationHash}, '-created_date', 2);
    if (rows.some(row => row.metadata?.request_fingerprint !== operation.fingerprint)) fail(409, 'floor_plan_operation_reused', 'Deze publicatiesleutel is eerder gebruikt.');
    const record = rows[0] || await entity(base44, 'ObjectFloorPlan').create({desktop_operation_hash: operationHash, object_id: loaded.object.id, building_selection_key: loaded.key, source: 'loq_desktop', status: 'published', is_current: false, revision: entry.published_revision + 1, title: document.title, desktop_document: document, floorplan_2d_json: floorPlans.serverOnly.desktopLegacyFloor(document), captured_by: operation.user.id, captured_at: new Date(now()).toISOString(), published_at: new Date(now()).toISOString(), ...assets, metadata: {workspace_id: entry.id, operation_hash: operationHash, request_fingerprint: operation.fingerprint, immutable_desktop_revision: true}});
    const history = entry.committed_publication_ids || [entry.current_published_floor_plan_id].filter(Boolean);
    if (history.length >= 5000) fail(409, 'floor_plan_revision_limit', 'Er zijn te veel bewaarde publicaties.');
    return {current_published_floor_plan_id: record.id, published_revision: record.revision, committed_publication_ids: [...new Set([...history, record.id])]};
  }
  return createBuildingCollaboration({load, commit, validateDocument, stagePublication, recordCommitted, now, hash: sha256});
}

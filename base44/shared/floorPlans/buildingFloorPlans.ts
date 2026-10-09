/** Immutable drawing snapshots, activated through one atomic object-index CAS.
 * Staged rows are never current by themselves. No demotion or cross-entity
 * transaction is needed; a failed write keeps the previous pointer intact.
 */
type RecordValue = Record<string, any>;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const RECEIPT_LIMIT = 64;
const WORKSPACE = 'ObjectBuildingFloorPlanWorkspace';
const READS = new Set(['get_object_building_floor_plan_workspace', 'read_object_building_floor_plan_asset']);
const WRITES = new Set(['save_object_building_floor_plan_draft', 'publish_object_building_floor_plan', 'upload_object_building_floor_plan_asset']);
const SYMBOLS = new Set(['camera', 'motion_detector', 'alarm_panel', 'access_control', 'smoke_detector', 'manual_call_point', 'fire_extinguisher', 'fire_hose', 'aed', 'emergency_exit', 'assembly_point', 'you_are_here', 'stairs', 'detector', 'fire_alarm', 'first_aid', 'emergency_light', 'lift', 'electrical']);

export function validateDesktopDocument(input: any, ApiError: any) {
  const fail = (message = 'Ongeldig tekenbestand') => { throw new ApiError(400, message, { code: 'invalid_desktop_document' }); };
  const object = (value: any, keys: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail();
    return value;
  };
  const text = (value: any, maximum = 250, empty = true) => {
    if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim()) || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('Ongeldige tekst in het tekenbestand');
    return value;
  };
  const ids = new Set<string>();
  const id = (value: any) => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value) || ids.has(value)) fail('Tekenonderdelen moeten unieke geldige IDs hebben'); ids.add(value); return value; };
  const reference = (value: any) => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value)) fail(); return value; };
  const number = (value: any, min = -100000, max = 100000) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('Ongeldige maat of positie'); return value; };
  let total = 0;
  const array = (value: any, maximum: number, minimum = 0) => { if (!Array.isArray(value) || value.length < minimum || value.length > maximum || (total += value.length) > 40000) fail('Te veel tekenonderdelen'); return value; };
  const point = (value: any) => { object(value, ['x', 'y']); return { x: number(value.x), y: number(value.y) }; };
  const choice = (value: any, options: string[]) => { if (!options.includes(value)) fail(); return value; };
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { return fail(); }
  if (!serialized || new TextEncoder().encode(serialized).length > MAX_DOCUMENT_BYTES) fail('Het tekenbestand is te groot (maximaal 4 MiB)');
  object(input, ['schemaVersion', 'id', 'title', 'unit', 'floors']);
  if (input.schemaVersion !== 1 || input.unit !== 'm') fail('Deze tekenbestandversie of maateenheid wordt niet ondersteund');
  const documentId = id(input.id);
  return {
    schemaVersion: 1, id: documentId, title: text(input.title), unit: 'm',
    floors: array(input.floors, 30, 1).map((floor: any) => {
      object(floor, ['id', 'name', 'elevation', 'walls', 'rooms', 'openings', 'symbols', 'routes', 'background', 'print']);
      const floorId = id(floor.id);
      const walls = array(floor.walls, 5000).map((wall: any) => {
        object(wall, ['id', 'start', 'end', 'thickness']);
        const start = point(wall.start), end = point(wall.end);
        if (Math.hypot(start.x - end.x, start.y - end.y) < 0.01) fail('Een muur moet minstens een centimeter lang zijn');
        return { id: id(wall.id), start, end, thickness: number(wall.thickness, 0.01, 5) };
      });
      const wallMap = new Map(walls.map((wall: any) => [wall.id, wall]));
      const rooms = array(floor.rooms, 2000).map((room: any) => {
        object(room, ['id', 'label', 'polygon']);
        const polygon = array(room.polygon, 500, 3).map(point);
        const area = Math.abs(polygon.reduce((sum: number, p: any, i: number) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
        if (area < 0.0001) fail('Een ruimte moet een geldig oppervlak hebben');
        return { id: id(room.id), label: text(room.label), polygon };
      });
      const openings = array(floor.openings, 4000).map((opening: any) => {
        object(opening, ['id', 'wallId', 'type', 'offset', 'width', 'hinge', 'swing']);
        const wall: any = wallMap.get(reference(opening.wallId));
        if (!wall) fail('Een deur of raam moet aan een bestaande muur zijn gekoppeld');
        const offset = number(opening.offset, 0), width = number(opening.width, 0.05, 50);
        if (offset + width > Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) + 0.001) fail('Een deur of raam valt buiten de muur');
        return { id: id(opening.id), wallId: opening.wallId, type: choice(opening.type, ['door', 'window', 'opening']), offset, width, hinge: choice(opening.hinge, ['left', 'right']), swing: choice(opening.swing, ['in', 'out']) };
      });
      const symbols = array(floor.symbols, 5000).map((symbol: any) => {
        object(symbol, ['id', 'kind', 'position', 'rotation', 'label', 'installationId']);
        if (!SYMBOLS.has(symbol.kind)) fail('Onbekend veiligheidssymbool');
        return { id: id(symbol.id), kind: symbol.kind, position: point(symbol.position), rotation: number(symbol.rotation, -3600, 3600), label: text(symbol.label), ...(symbol.installationId ? { installationId: reference(symbol.installationId) } : {}) };
      });
      const routes = array(floor.routes, 1000).map((route: any) => {
        object(route, ['id', 'points', 'label']);
        return { id: id(route.id), points: array(route.points, 500, 2).map(point), label: text(route.label) };
      });
      let background;
      if (floor.background != null) {
        const bg = object(floor.background, ['fileId', 'width', 'height', 'origin', 'metresPerPixel', 'opacity', 'calibrated']);
        if (typeof bg.calibrated !== 'boolean') fail();
        background = { fileId: reference(bg.fileId), width: number(bg.width, 1, 20000), height: number(bg.height, 1, 20000), origin: point(bg.origin), metresPerPixel: number(bg.metresPerPixel, 0.000001, 100), opacity: number(bg.opacity, 0, 1), calibrated: bg.calibrated };
      }
      const print = object(floor.print, ['paper', 'orientation', 'scale', 'profile', 'title', 'address', 'drawingNumber', 'instructions', 'secondaryInstructions', 'language2', 'viewpoints', 'cropCenter', 'logoFileId']);
      return { id: floorId, name: text(floor.name, 120, false), elevation: number(floor.elevation, -1000, 10000), walls, rooms, openings, symbols, routes, ...(background ? { background } : {}), print: {
        paper: choice(print.paper, ['A4', 'A3']), orientation: choice(print.orientation, ['portrait', 'landscape']), scale: number(print.scale, 1, 10000), profile: choice(print.profile, ['evacuation', 'installation']), title: text(print.title), address: text(print.address, 500), drawingNumber: text(print.drawingNumber, 120), instructions: text(print.instructions, 4000), secondaryInstructions: text(print.secondaryInstructions, 4000), language2: text(print.language2, 40),
        viewpoints: array(print.viewpoints, 100).map((view: any) => { object(view, ['id', 'label', 'position', 'rotation']); return { id: id(view.id), label: text(view.label), position: point(view.position), rotation: number(view.rotation, -3600, 3600) }; }),
        ...(print.cropCenter ? { cropCenter: point(print.cropCenter) } : {}),
        ...(print.logoFileId ? { logoFileId: reference(print.logoFileId) } : {}),
      } };
    }),
  };
}

export function desktopLegacyFloor(document: any) {
  const floor = document.floors[0];
  const endpoints = [...floor.walls.flatMap((wall: any) => [wall.start, wall.end]), ...floor.rooms.flatMap((room: any) => room.polygon), ...floor.symbols.map((symbol: any) => symbol.position)];
  const xs = endpoints.map((point: any) => point.x), ys = endpoints.map((point: any) => point.y);
  return { id: floor.id, title: floor.name, unit: 'm', bounds: { minX: Math.min(0, ...xs), minY: Math.min(0, ...ys), maxX: Math.max(1, ...xs), maxY: Math.max(1, ...ys) }, rooms: floor.rooms, walls: floor.walls.map((wall: any) => ({ ...wall, height: 2.8 })), openings: floor.openings.map((opening: any) => {
    const wall = floor.walls.find((candidate: any) => candidate.id === opening.wallId);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const p = (distance: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * distance / length, y: wall.start.y + (wall.end.y - wall.start.y) * distance / length });
    return { id: opening.id, type: opening.type, width: opening.width, center: p(opening.offset + opening.width / 2), start: p(opening.offset), end: p(opening.offset + opening.width) };
  }), objects: [] };
}

export function createBuildingFloorPlanHandlers(deps: RecordValue) {
  const { entity, ApiError, requireScope, selectionKeys, versionOf, sha256, nowIso, requireRecord, audit } = deps;
  const fail = (status: number, message: string, code: string, extra: RecordValue = {}) => { throw new ApiError(status, message, { code, ...extra }); };
  const assetStep = async <T>(code: string, status: number, run: () => Promise<T>): Promise<T> => {
    try { return await run(); }
    catch (error) {
      // Preserve our existing integrity/configuration errors, never provider text.
      if (error instanceof ApiError) throw error;
      return fail(status, 'Het beveiligde plattegrondbestand kon niet worden geopend', code);
    }
  };
  const fetchFailureReason = (error: unknown) => {
    // Inspect bounded transport diagnostics only to select a fixed public enum.
    // Neither these messages nor URLs/headers are returned or logged.
    const item = error && typeof error === 'object' ? error as RecordValue : {};
    const cause = item.cause && typeof item.cause === 'object' ? item.cause : {};
    const names = [item.name, cause.name].filter(value => typeof value === 'string').map(value => value.slice(0, 100));
    const text = [item.message, cause.message, item.code, cause.code].filter(value => typeof value === 'string').map(value => value.slice(0, 2048)).join(' ').toLowerCase();
    if (names.includes('TimeoutError') || /\b(?:timeout|timed out|etimedout|und_err_connect_timeout)\b/.test(text)) return 'timeout';
    if (/redirect/.test(text)) return /unsupported|not supported|not implemented|won.t be implemented|invalid redirect (?:mode|value)/.test(text) ? 'redirect_unsupported' : 'redirect';
    if (/\b(?:certificate|cert_|x509|tls|ssl|unknown issuer)\b|cert_has_expired|unable_to_verify_leaf_signature/.test(text)) return 'tls';
    if (/\b(?:dns|getaddrinfo|enotfound|eai_again)\b|name resolution|failed to lookup address|nodename nor servname/.test(text)) return 'dns';
    return 'unknown';
  };
  const integer = (value: any, name: string) => { if (!Number.isSafeInteger(value) || value < 0) fail(400, `${name} is verplicht en moet een positief geheel getal of nul zijn`, 'invalid_floor_plan_request'); return value; };
  const dict = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const indexOf = (object: any) => dict(object.floor_plan_workspace_index);
  const scope = async (base44: any, body: any, mutable = false) => {
    if (body.collective_id) fail(400, 'Kies een objectdossier', 'invalid_floor_plan_scope');
    const result = await requireScope(base44, body, mutable);
    if (mutable && result.object.status === 'archived') fail(409, 'Dit object is gearchiveerd', 'object_archived');
    if (typeof body.building_selection_key !== 'string' || !selectionKeys(result.object).includes(body.building_selection_key)) fail(409, 'Dit gebouw is niet meer uniek geselecteerd; laad de gebouwkeuze opnieuw', 'building_selection_unavailable');
    if (mutable && integer(body.expected_map_version, 'expected_map_version') !== versionOf(result.object)) fail(409, 'De objectconfiguratie is gewijzigd; controleer de gebouwkeuze opnieuw', 'building_configuration_conflict', { configuration_version: versionOf(result.object) });
    return { ...result, key: body.building_selection_key, keyHash: await sha256(body.building_selection_key) };
  };
  const readEntry = (object: any, keyHash: string) => indexOf(object)[keyHash] || null;
  const legacy = async (base44: any, object: any, key: string) => {
    const records = await entity(base44, 'ObjectFloorPlan').filter({ object_id: object.id, building_selection_key: key, status: 'published', is_current: true }, '-revision', 2);
    const exact = records.filter((r: any) => r.object_id === object.id && r.building_selection_key === key && r.status === 'published' && r.is_current === true);
    if (exact.length > 1) fail(409, 'Dit gebouw heeft meerdere actuele plattegronden', 'building_floor_plan_ambiguous');
    return exact[0] || null;
  };
  const snapshot = async (base44: any, object: any, key: string, entry: any) => {
    if (!entry?.snapshot_id) return null;
    const record = await requireRecord(base44, WORKSPACE, entry.snapshot_id, 'Tekenbestand');
    if (record.object_id !== object.id || record.customer_id !== object.customer_id || record.building_selection_key !== key || record.workspace_id !== entry.id) fail(409, 'De tekenbestandkoppeling is ongeldig', 'floor_plan_pointer_invalid');
    return validateDesktopDocument(record.document, ApiError);
  };
  const projection = async (base44: any, state: any, entry: any) => ({
    customer_id: state.customer.id, object_id: state.object.id, building_selection_key: state.key, configuration_version: versionOf(state.object),
    workspace: entry?.snapshot_id ? { id: entry.id, version: entry.version, document: await snapshot(base44, state.object, state.key, entry), current_published_floor_plan_id: entry.current_published_floor_plan_id || null, published_revision: entry.published_revision || 0, updated_at: entry.updated_at } : null,
  });
  const keyFor = async (user: any, body: any) => {
    if (typeof body.idempotency_key !== 'string' || body.idempotency_key.length < 8 || body.idempotency_key.length > 180) fail(400, 'Een unieke idempotency_key is verplicht', 'invalid_floor_plan_request');
    return sha256(`${user.id}:${body.idempotency_key}`);
  };
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const fingerprint = (body: any) => sha256(JSON.stringify(canonical(body)));
  const receipts = (entry: any) => dict(entry?.receipts);
  const replay = (entry: any, operation: string, hash: string) => {
    const prior = receipts(entry)[operation];
    if (!prior) return null;
    if (prior.fingerprint !== hash) fail(409, 'Deze opslagsleutel is eerder met andere inhoud gebruikt', 'floor_plan_idempotency_conflict');
    return prior;
  };
  const addReceipt = (entry: any, operation: string, receipt: any) => Object.fromEntries([...Object.entries(receipts(entry)).filter(([key]) => key !== operation), [operation, receipt]].slice(-RECEIPT_LIMIT));
  const casIndex = async (base44: any, state: any, next: any) => {
    const old = state.object.floor_plan_workspace_index_version;
    const query = Number.isSafeInteger(old) ? { floor_plan_workspace_index_version: old } : { $or: [{ floor_plan_workspace_index_version: null }, { floor_plan_workspace_index_version: { $exists: false } }] };
    const mapQuery = state.object.version == null ? { $or: [{ version: null }, { version: { $exists: false } }] } : { version: state.object.version };
    const index = { ...indexOf(state.object), [state.keyHash]: next };
    if (new TextEncoder().encode(JSON.stringify(index)).length > MAX_DOCUMENT_BYTES) fail(409, 'De revisie-index van dit object is vol; laat de bewaarde historie controleren', 'floor_plan_index_limit');
    const result = await entity(base44, 'SurveillanceObject').updateMany({ id: state.object.id, $and: [query, mapQuery] }, { $set: { floor_plan_workspace_index: index, floor_plan_workspace_index_version: (Number.isSafeInteger(old) ? old : 0) + 1 } });
    return result?.success === true && result.updated === 1;
  };
  const emitAudit = async (base44: any, user: any, body: any, entry: any, operation: string, hash: string) => {
    // Only technical references enter the audit stream, never drawing/asset data.
    await audit(base44, user, { action: body.action, customer_id: body.customer_id, object_id: body.object_id, building_selection_key: body.building_selection_key, idempotency_key: body.idempotency_key }, { customer_id: body.customer_id, object_id: body.object_id, resource_type: WORKSPACE, resource_id: entry.id, workspace_version: entry.version, published_floor_plan_id: entry.current_published_floor_plan_id || null, published_revision: entry.published_revision || 0, operation_hash: operation }, hash);
  };
  const assetScope = async (base44: any, state: any, fileId: string, kinds: string[]) => {
    const file = await requireRecord(base44, 'ManagedFile', fileId, 'Plattegrondbestand');
    if (file.owner_type !== 'object' || file.owner_id !== state.object.id || file.object_id !== state.object.id || file.customer_id !== state.customer.id || file.company_id != null || file.tenant_container_key !== `object:${state.object.id}` || file.owner_container_key !== `object:${state.object.id}` || file.domain !== 'operations' || file.category !== 'building_floor_plan' || file.status !== 'active' || file.storage_visibility !== 'private' || !file.encrypted || file.encryption_algorithm !== 'AES-256-GCM' || file.key_wrap_algorithm !== 'AES-256-GCM' || file.metadata?.building_key_hash !== state.keyHash || !kinds.includes(file.metadata?.asset_kind) || file.source_entity !== WORKSPACE || !(Number.isSafeInteger(file.size_bytes) && file.size_bytes > 0 && file.size_bytes <= MAX_ASSET_BYTES) || !file.file_uri) fail(403, 'Dit bestand is niet beschikbaar voor deze gebouwplattegrond', 'floor_plan_asset_unavailable');
    return file;
  };
  const validateReferences = async (base44: any, state: any, document: any) => {
    for (const id of new Set<string>(document.floors.map((f: any) => f.print.logoFileId).filter(Boolean))) await assetScope(base44, state, id, ['logo']);
    for (const id of new Set<string>(document.floors.filter((f: any) => f.background).map((f: any) => f.background.fileId))) await assetScope(base44, state, id, ['background']);
    for (const id of new Set<string>(document.floors.flatMap((f: any) => f.symbols.map((s: any) => s.installationId).filter(Boolean)))) {
      const installation = await requireRecord(base44, 'ObjectInstallation', id, 'Installatie');
      if (installation.object_id !== state.object.id || installation.customer_id !== state.customer.id || installation.status === 'archived') fail(409, 'Een symbool verwijst naar een niet beschikbare objectinstallatie', 'floor_plan_installation_unavailable');
    }
  };
  const resolveCurrent = async (base44: any, object: any, key: string) => {
    const entry = readEntry(object, await sha256(key));
    if (!entry) return legacy(base44, object, key);
    if (!entry.current_published_floor_plan_id) return null;
    const record = await requireRecord(base44, 'ObjectFloorPlan', entry.current_published_floor_plan_id, 'Gepubliceerde plattegrond');
    if (record.object_id !== object.id || record.building_selection_key !== key || record.status !== 'published') fail(409, 'De publicatiekoppeling is ongeldig', 'floor_plan_pointer_invalid');
    return { ...record, is_current: true };
  };
  const read = async (base44: any, user: any, body: any) => {
    const state = await scope(base44, body);
    if (body.action === 'read_object_building_floor_plan_asset') {
      const file = await assetScope(base44, state, body.file_id, ['background', 'preview', 'pdf', 'logo']);
      const content = await decryptAsset(base44, file);
      await assetStep('floor_plan_asset_audit_failed', 503, () => entity(base44, 'ManagedFileAccessLog').create({ managed_file_id: file.id, action: 'download', actor_user_id: user.id, owner_type: 'object', owner_id: state.object.id, source_entity: WORKSPACE, source_entity_id: file.source_entity_id, success: true, created_at: nowIso(), metadata: { building_key_hash: state.keyHash } }));
      return { file_id: file.id, filename: file.download_filename, mime_type: file.mime_type, content_base64: content };
    }
    return projection(base44, state, readEntry(state.object, state.keyHash));
  };
  const mutate = async (base44: any, user: any, body: any) => {
    integer(body.expected_version, 'expected_version');
    const operation = await keyFor(user, body), hash = await fingerprint(body);
    let state = await scope(base44, body);
    let entry = readEntry(state.object, state.keyHash);
    const prior = replay(entry, operation, hash);
    if (prior && !prior.pending) {
      await emitAudit(base44, user, body, prior.entry || entry, operation, hash);
      return { ...(await projection(base44, state, prior.entry || entry)), ...(prior.file_id ? { file_id: prior.file_id, mime_type: prior.mime_type } : {}), replayed: true };
    }
    state = await scope(base44, body, true);
    entry = readEntry(state.object, state.keyHash);
    if (body.action === 'upload_object_building_floor_plan_asset') return uploadAsset(base44, user, body, state, operation, hash);
    if ((entry?.version || 0) !== body.expected_version) fail(409, 'De tekening is op een andere Mac gewijzigd; beide versies blijven behouden', 'floor_plan_version_conflict', { current_version: entry?.version || 0 });
    const oldPublished = entry ? null : await legacy(base44, state.object, state.key);
    entry ||= { id: crypto.randomUUID(), version: 0, snapshot_id: null, current_published_floor_plan_id: oldPublished?.id || null, published_revision: oldPublished?.revision || 0 };
    const document = body.action === 'save_object_building_floor_plan_draft' ? validateDesktopDocument(body.data?.document, ApiError) : await snapshot(base44, state.object, state.key, entry);
    if (!document) fail(409, 'Sla de tekening op voordat je publiceert', 'floor_plan_draft_required');
    await validateReferences(base44, state, document);
    const next = { ...entry, version: entry.version + 1, updated_at: nowIso() };
    if (body.action === 'save_object_building_floor_plan_draft') {
      const staged = await entity(base44, WORKSPACE).filter({ object_id: state.object.id, building_selection_key: state.key, operation_hash: operation }, '-created_date', 2);
      if (staged.some((row: any) => row.request_fingerprint !== hash)) fail(409, 'Deze opslagsleutel is eerder gebruikt', 'floor_plan_idempotency_conflict');
      if (staged[0] && !readEntry(state.object, state.keyHash)) { entry.id = staged[0].workspace_id; next.id = entry.id; }
      const reusable = staged.find((row: any) => row.workspace_id === entry.id && row.version === next.version);
      const record = reusable || await entity(base44, WORKSPACE).create({ workspace_id: entry.id, customer_id: state.customer.id, object_id: state.object.id, building_selection_key: state.key, version: next.version, document, operation_hash: operation, request_fingerprint: hash, actor_id: user.id, created_at: next.updated_at });
      next.snapshot_id = record.id;
    } else {
      if (!Object.hasOwn(body, 'expected_current_floor_plan_id') || body.expected_current_floor_plan_id !== entry.current_published_floor_plan_id) fail(409, 'De gepubliceerde plattegrond is gewijzigd', 'floor_plan_publication_conflict');
      if (document.floors.some((floor: any) => floor.background && !floor.background.calibrated)) fail(409, 'Bevestig eerst de schaal van iedere onderlegger', 'floor_plan_scale_unconfirmed');
      const assets: RecordValue = {};
      for (const [field, kind] of [['preview_2d_file_id', 'preview'], ['pdf_file_id', 'pdf']]) if (body.data?.[field]) {
        const file = await assetScope(base44, state, body.data[field], [kind]);
        if (file.metadata?.draft_version !== entry.version || file.metadata?.publication_revision !== entry.published_revision + 1) fail(409, 'De afdruk of preview hoort bij een andere tekenversie; maak deze opnieuw', 'floor_plan_asset_revision_conflict');
        assets[field] = file.id;
        if (kind === 'preview') assets.preview_2d_download_filename = file.download_filename;
      }
      const staged = await entity(base44, 'ObjectFloorPlan').filter({ object_id: state.object.id, building_selection_key: state.key, desktop_operation_hash: operation }, '-created_date', 2);
      if (staged.some((row: any) => row.metadata?.request_fingerprint !== hash)) fail(409, 'Deze publicatiesleutel is eerder gebruikt', 'floor_plan_idempotency_conflict');
      const record = staged[0] || await entity(base44, 'ObjectFloorPlan').create({ desktop_operation_hash: operation, object_id: state.object.id, building_selection_key: state.key, source: 'loq_desktop', status: 'published', is_current: false, revision: entry.published_revision + 1, title: document.title, desktop_document: document, floorplan_2d_json: desktopLegacyFloor(document), captured_by: user.id, captured_at: next.updated_at, published_at: next.updated_at, ...assets, metadata: { workspace_id: entry.id, operation_hash: operation, request_fingerprint: hash, immutable_desktop_revision: true } });
      next.current_published_floor_plan_id = record.id;
      next.published_revision = record.revision;
      const history = Array.isArray(entry.committed_publication_ids) ? entry.committed_publication_ids : [entry.current_published_floor_plan_id].filter(Boolean);
      if (history.length >= 5000) fail(409, 'Het maximale aantal bewaarde gebouwrevisies is bereikt', 'floor_plan_revision_limit');
      next.committed_publication_ids = [...new Set([...history, record.id])];
    }
    // The receipt is swapped with the pointer. Replays recover even if the audit
    // write or HTTP response failed after the atomic activation.
    const receiptEntry = { ...next }; delete receiptEntry.receipts; delete receiptEntry.committed_publication_ids;
    next.receipts = addReceipt(entry, operation, { fingerprint: hash, entry: receiptEntry });
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await casIndex(base44, state, next)) {
        await emitAudit(base44, user, body, next, operation, hash);
        return { ...(await projection(base44, state, next)), replayed: false };
      }
      state = await scope(base44, body, true);
      const current = readEntry(state.object, state.keyHash);
      const recovered = replay(current, operation, hash);
      if (recovered) return { ...(await projection(base44, state, recovered.entry)), replayed: true };
      if ((current?.version || 0) !== body.expected_version || (current?.snapshot_id || null) !== entry.snapshot_id || (current && current.id !== entry.id) || (current?.current_published_floor_plan_id || null) !== entry.current_published_floor_plan_id) fail(409, 'De tekening is op een andere Mac gewijzigd; laad de actuele versie', 'floor_plan_version_conflict', { current_version: current?.version || 0 });
      next.receipts = addReceipt(current || entry, operation, { fingerprint: hash, entry: receiptEntry });
    }
    return fail(409, 'Het object wordt gelijktijdig bijgewerkt; probeer opnieuw', 'floor_plan_busy', { retryable: true });
  };

  const from64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const to64 = (value: ArrayBuffer | Uint8Array) => { let result = ''; for (const byte of new Uint8Array(value)) result += String.fromCharCode(byte); return btoa(result); };
  const master = async (usage: KeyUsage[]) => {
    let bytes;
    try { bytes = from64(Deno.env.get('MANAGED_FILE_MASTER_KEY_B64') || ''); } catch { /* checked below */ }
    if (!bytes || bytes.length !== 32) return fail(503, 'Beveiligde bestandsopslag is nog niet geconfigureerd', 'managed_file_crypto_unavailable');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, usage);
  };
  const assetData = (data: any) => {
    const types: RecordValue = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'image/heic': 'heic', 'image/heif': 'heif' };
    if (!data || !['background', 'preview', 'pdf', 'logo'].includes(data.kind) || !types[data.mime_type] || (data.kind === 'pdf' && data.mime_type !== 'application/pdf') || (['preview', 'logo'].includes(data.kind) && !['image/png', 'image/jpeg', 'image/webp'].includes(data.mime_type)) || typeof data.content_base64 !== 'string' || data.content_base64.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.content_base64)) return fail(400, 'Ongeldig plattegrondbestand (maximaal 12 MiB)', 'invalid_floor_plan_asset');
    let bytes;
    try { bytes = from64(data.content_base64); } catch { return fail(400, 'Ongeldig bestand', 'invalid_floor_plan_asset'); }
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return fail(400, 'Ongeldige bestandsgrootte', 'invalid_floor_plan_asset');
    const header = Array.from(bytes.slice(0, 12)).map(byte => String.fromCharCode(byte)).join('');
    const isImage = data.mime_type === 'image/png' ? bytes[0] === 137 && header.slice(1, 4) === 'PNG' : data.mime_type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : data.mime_type === 'image/webp' ? header.startsWith('RIFF') && header.slice(8) === 'WEBP' : data.mime_type === 'application/pdf' ? header.startsWith('%PDF-') : header.slice(4, 8) === 'ftyp';
    if (!isImage) return fail(400, 'De inhoud past niet bij het gekozen bestandstype', 'invalid_floor_plan_asset');
    return { bytes, extension: types[data.mime_type] };
  };
  const uploadAsset = async (base44: any, user: any, body: any, state: any, operation: string, hash: string) => {
    const { bytes, extension } = assetData(body.data);
    const initialEntry = readEntry(state.object, state.keyHash);
    const publicationAsset = ['preview', 'pdf'].includes(body.data.kind);
    if (publicationAsset && (!initialEntry?.snapshot_id || initialEntry.version !== body.expected_version)) fail(409, 'Sla eerst de actuele tekenversie op voordat je de afdruk uploadt', 'floor_plan_asset_revision_conflict');
    const publicationRevision = publicationAsset ? initialEntry.published_revision + 1 : null;
    const draftVersion = publicationAsset ? initialEntry.version : null;
    // Recover a file registered before interruption without uploading it again.
    const registered = await entity(base44, 'ManagedFile').filter({ object_id: state.object.id, source_entity: WORKSPACE, source_entity_id: operation }, '-created_date', 2);
    let file = registered[0];
    if (file && file.metadata?.request_fingerprint !== hash) fail(409, 'Deze uploadsleutel is eerder met andere inhoud gebruikt', 'floor_plan_idempotency_conflict');
    if (!file) {
      let reserved = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        let entry = readEntry(state.object, state.keyHash);
        if (!entry) {
          const published = await legacy(base44, state.object, state.key);
          entry = { id: crypto.randomUUID(), version: 0, snapshot_id: null, current_published_floor_plan_id: published?.id || null, published_revision: published?.revision || 0, updated_at: nowIso() };
        }
        const prior = replay(entry, operation, hash);
        if (prior && !prior.pending) return { file_id: prior.file_id, mime_type: prior.mime_type, replayed: true };
        if (prior?.pending && Date.parse(prior.expires_at) > Date.now()) fail(409, 'Deze upload wordt nog verwerkt; probeer met dezelfde sleutel opnieuw', 'floor_plan_upload_pending', { retryable: true });
        const next = { ...entry, receipts: addReceipt(entry, operation, { fingerprint: hash, pending: true, expires_at: new Date(Date.now() + 120000).toISOString() }) };
        if (await casIndex(base44, state, next)) { reserved = true; state = await scope(base44, body, true); break; }
        state = await scope(base44, body, true);
      }
      if (!reserved) return fail(409, 'Het object wordt bijgewerkt; probeer opnieuw', 'floor_plan_busy', { retryable: true });
      const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12)), wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, bytes);
      const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, await master(['encrypt']), await crypto.subtle.exportKey('raw', dataKey));
      const filename = `${body.data.kind}-${operation.slice(0, 16)}.${extension}`;
      const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([ciphertext], `${filename}.enc`, { type: 'application/octet-stream' }) });
      if (!uploaded?.file_uri) return fail(502, 'Privéopslag bevestigde het bestand niet; probeer met dezelfde opslagsleutel opnieuw', 'floor_plan_upload_incomplete');
      const folder = `objects/${state.object.id}/floorplans/building-${state.keyHash}/${publicationAsset ? `revision-${publicationRevision}/` : ''}assets`;
      file = await entity(base44, 'ManagedFile').create({ owner_type: 'object', owner_id: state.object.id, object_id: state.object.id, customer_id: state.customer.id, company_id: null, tenant_container_key: `object:${state.object.id}`, owner_container_key: `object:${state.object.id}`, access_scope: 'company', domain: 'operations', category: 'building_floor_plan', source_entity: WORKSPACE, source_entity_id: operation, source_field: body.data.kind, file_url: `private://${uploaded.file_uri}`, file_uri: uploaded.file_uri, storage_filename: `${filename}.enc`, display_filename: filename, download_filename: filename, logical_path: `${folder}/${filename}`, folder_path: folder, extension, mime_type: body.data.mime_type, stored_mime_type: 'application/octet-stream', size_bytes: bytes.length, ciphertext_size_bytes: ciphertext.byteLength, encrypted: true, encryption_algorithm: 'AES-256-GCM', encryption_key_id: Deno.env.get('MANAGED_FILE_MASTER_KEY_ID') || 'managed-file-master-v1', encryption_iv: to64(iv), encrypted_data_key: to64(wrapped), key_wrap_algorithm: 'AES-256-GCM', key_wrap_iv: to64(wrapIv), plaintext_sha256: to64(await crypto.subtle.digest('SHA-256', bytes)), ciphertext_sha256: to64(await crypto.subtle.digest('SHA-256', ciphertext)), storage_visibility: 'private', status: 'active', is_sensitive: true, security_classification: 'strictly_confidential', uploaded_at: nowIso(), uploaded_by: user.id, metadata: { building_key_hash: state.keyHash, asset_kind: body.data.kind, request_fingerprint: hash, ...(publicationAsset ? { draft_version: draftVersion, publication_revision: publicationRevision } : {}) } });
    }
    await assetScope(base44, state, file.id, [body.data.kind]);
    state = await scope(base44, body, true);
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = readEntry(state.object, state.keyHash) || { id: crypto.randomUUID(), version: 0, snapshot_id: null, current_published_floor_plan_id: (await legacy(base44, state.object, state.key))?.id || null, published_revision: 0, updated_at: nowIso() };
      const prior = replay(entry, operation, hash);
      if (prior && !prior.pending) return { file_id: prior.file_id, mime_type: prior.mime_type, replayed: true };
      const next = { ...entry, receipts: addReceipt(entry, operation, { fingerprint: hash, file_id: file.id, mime_type: file.mime_type }) };
      if (await casIndex(base44, state, next)) {
        await emitAudit(base44, user, body, next, operation, hash);
        return { file_id: file.id, mime_type: file.mime_type, replayed: false };
      }
      state = await scope(base44, body, true);
    }
    return fail(409, 'Bestand is beveiligd opgeslagen; probeer met dezelfde opslagsleutel opnieuw', 'floor_plan_busy', { retryable: true });
  };
  const decryptAsset = async (base44: any, file: any) => {
    const signed = await assetStep<any>('floor_plan_asset_signing_failed', 502, () => base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: file.file_uri, expires_in: 60 }));
    if (!signed?.signed_url || !String(signed.signed_url).startsWith('https://')) return fail(502, 'Het bestand is niet beschikbaar', 'floor_plan_asset_unavailable');
    let response: Response;
    // The hosted runtime supports manual/follow. Manual preserves the no-redirect
    // rule: every 3xx response is rejected by the existing response.ok check.
    try { response = await fetch(signed.signed_url, { redirect: 'manual' }); }
    catch (error) { return fail(502, 'Het beveiligde plattegrondbestand kon niet worden opgehaald', 'floor_plan_asset_fetch_failed', {reason: fetchFailureReason(error)}); }
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_ASSET_BYTES + 16) return fail(502, 'Het bestand is niet beschikbaar', 'floor_plan_asset_unavailable');
    if (!response.body) return fail(502, 'Het bestand is leeg', 'floor_plan_asset_unavailable');
    const encrypted = await assetStep('floor_plan_asset_stream_failed', 502, async () => {
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > MAX_ASSET_BYTES + 16) { await reader.cancel(); return fail(409, 'Het bestand is te groot', 'floor_plan_asset_integrity'); }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(total);
      let position = 0;
      for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
      return bytes;
    });
    const cipherHash = await assetStep('floor_plan_asset_cipher_hash_failed', 503, () => crypto.subtle.digest('SHA-256', encrypted));
    if (encrypted.length > MAX_ASSET_BYTES + 16 || to64(cipherHash) !== file.ciphertext_sha256) return fail(409, 'Bestandscontrole mislukt', 'floor_plan_asset_integrity');
    const masterKey = await assetStep('floor_plan_asset_master_key_failed', 503, () => master(['decrypt']));
    const rawKey = await assetStep('floor_plan_asset_key_unwrap_failed', 503, () => crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(file.key_wrap_iv) }, masterKey, from64(file.encrypted_data_key)));
    const key = await assetStep('floor_plan_asset_key_import_failed', 503, () => crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']));
    const plaintext = await assetStep('floor_plan_asset_decryption_failed', 409, () => crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(file.encryption_iv) }, key, encrypted));
    const plaintextHash = await assetStep('floor_plan_asset_plaintext_hash_failed', 503, () => crypto.subtle.digest('SHA-256', plaintext));
    if (to64(plaintextHash) !== file.plaintext_sha256) return fail(409, 'Bestandscontrole mislukt', 'floor_plan_asset_integrity');
    return to64(plaintext);
  };
  const committedFloorPlans = (object: any, records: any[]) => {
    const entries = Object.values(indexOf(object)) as any[];
    const committed = new Set(entries.flatMap(entry => [...(entry.committed_publication_ids || []), entry.current_published_floor_plan_id].filter(Boolean)));
    const current = new Set(entries.map(entry => entry.current_published_floor_plan_id).filter(Boolean));
    return records.filter(record => !record.metadata?.immutable_desktop_revision || committed.has(record.id)).map(record => record.metadata?.immutable_desktop_revision || committed.has(record.id) ? { ...record, is_current: current.has(record.id) } : record);
  };
  return { readActions: READS, mutationActions: WRITES, read, mutate, resolveCurrent, committedFloorPlans, serverOnly: { scope, assetScope, decryptAsset } };
}

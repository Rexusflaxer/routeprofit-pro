import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createBase44BuildingCollaboration } from '../../base44/shared/floorPlans/buildingCollaborationBase44.mjs';
import { ACTIONS } from '../../base44/shared/floorPlans/buildingCollaboration.mjs';
import { diffDocuments, canonical } from '../../base44/shared/floorPlans/collabDocument.mjs';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { TextEncoder } from 'node:util';
import { createBuildingReferenceHandlers } from '../../base44/shared/floorPlans/buildingReferences';
import { createBuildingFloorPlanHandlers, validateDesktopDocument, desktopLegacyFloor } from '../../base44/functions/customerPlatformApi/buildingFloorPlans';

class ApiError extends Error {
  constructor(public status: number, message: string, public details: any = {}) { super(message); }
}
const admin = { id: 'admin-one', role: 'admin' };
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
const doc = (title = 'Object') => ({ schemaVersion: 1, id: 'doc-1', title, unit: 'm', floors: [{ id: 'floor-1', name: 'Begane grond', elevation: 0, walls: [{ id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2 }], rooms: [], openings: [{ id: 'door-1', wallId: 'wall-1', type: 'door', offset: 2, width: 1, hinge: 'left', swing: 'in' }], symbols: [], routes: [], print: { paper: 'A4', orientation: 'landscape', scale: 100, profile: 'installation', title: '', address: '', drawingNumber: '', instructions: '', secondaryInstructions: '', language2: '', viewpoints: [] } }] });
const scope = { customer_id: 'customer-1', object_id: 'object-1', building_selection_key: 'bag:one' };
const save = (key: string, version = 0, overrides: any = {}) => ({ ...scope, action: 'test:save_collaboratively', expected_map_version: 4, expected_version: version, idempotency_key: key, data: { document: doc() }, ...overrides });
const publish = (key: string, version = 1, current: string | null = null, overrides: any = {}) => ({ ...scope, action: 'test:publish_collaboratively', expected_map_version: 4, expected_version: version, expected_current_floor_plan_id: current, idempotency_key: key, ...overrides });

function matches(record: any, query: any): boolean {
  return Object.entries(query).every(([key, value]: any) => {
    if (key === '$or') return value.some((branch: any) => matches(record, branch));
    if (key === '$and') return value.every((branch: any) => matches(record, branch));
    const found = key.split('.').reduce((item: any, part: string) => item?.[part], record);
    if (value && typeof value === 'object' && '$exists' in value) return (found !== undefined) === value.$exists;
    if (value && typeof value === 'object' && '$gt' in value) return found > value.$gt;
    return value === null ? found == null : found === value;
  });
}
function setup() {
  const object: any = { id: 'object-1', customer_id: 'customer-1', version: 4, status: 'active', keys: ['bag:one', 'bag:two'] };
  const rows: Record<string, any[]> = { SurveillanceObject: [object], Customer: [{ id: 'customer-1', status: 'active' }], ObjectBuildingFloorPlanWorkspace: [], ObjectFloorPlan: [], ManagedFile: [], ManagedFileAccessLog: [], ObjectInstallation: [] };
  let count = 0;
  const hooks: any = {};
  const entities = Object.fromEntries(Object.keys(rows).map(name => [name, {
    get: async (id: string) => structuredClone(rows[name].find(row => row.id === id)),
    filter: async (query: any, _sort: string, limit = 500) => structuredClone(rows[name].filter(row => matches(row, query)).slice(0, limit)),
    create: async (data: any) => { const created = { id: `${name}-${++count}`, ...structuredClone(data) }; rows[name].push(created); await hooks.afterCreate?.(name, created); return structuredClone(created); },
    updateMany: async (query: any, update: any) => {
      await hooks.beforeCas?.(query, update);
      const row = rows[name].find(candidate => matches(candidate, query));
      if (!row) return { success: true, updated: 0 };
      Object.assign(row, structuredClone(update.$set || {}));
      await hooks.afterCas?.(row);
      return { success: true, updated: 1 };
    },
  }]));
  const uploads: any[] = [];
  const audit = vi.fn(async () => undefined);
  const base44: any = { asServiceRole: { entities, integrations: { Core: { UploadPrivateFile: vi.fn(async ({ file }: any) => { uploads.push(new Uint8Array(await file.arrayBuffer())); return { file_uri: `private:file-${uploads.length}` }; }), CreateFileSignedUrl: vi.fn(async ({ file_uri }: any) => ({ signed_url: `https://storage.test/${file_uri}` })) } } } };
  const requireRecord = async (_base: any, entity: string, id: string) => { const row = await entities[entity].get(id); if (!row) throw new ApiError(404, 'Niet gevonden'); return row; };
  const api = createBuildingFloorPlanHandlers({ entity: (_base: any, name: string) => entities[name], ApiError, requireRecord, selectionKeys: (object: any) => object.keys, versionOf: (row: any) => row.version || 1, sha256, nowIso: () => new Date().toISOString(), audit, requireScope: async (_base: any, body: any, mutable: boolean) => {
    const customer = await requireRecord(null, 'Customer', body.customer_id);
    const object = await requireRecord(null, 'SurveillanceObject', body.object_id);
    if (object.customer_id !== customer.id || mutable && customer.status === 'archived') throw new ApiError(409, 'Verkeerde scope');
    return { object, customer };
  } });
  // Scenario helpers use actual session/claim/apply/publication actions. The
  // test:* intents are never sent to an API; legacyRun separately verifies the
  // old write routes are closed and their already-committed receipts replay.
  const collaborative = createBase44BuildingCollaboration({base44, entity:(_base:any,name:string)=>entities[name],floorPlans:api,validateDesktopDocument,ApiError,sha256,audit});
  const operations = new Map<string, any>();
  const run = async (body:any) => {
    if (!body.action.startsWith('test:')) return api.mutate(base44,admin,body);
    const fields = {customer_id:body.customer_id,object_id:body.object_id,building_selection_key:body.building_selection_key,expected_map_version:body.expected_map_version};
    const key = `${body.action}:${body.building_selection_key}:${body.idempotency_key}`;
    const prior = operations.get(key);
    if (prior?.kind === 'initial') return collaborative.handle(ACTIONS.open,admin,{...fields,client_id:prior.clientId,initial_document:body.data.document});
    let operation = prior;
    if (!operation) {
      const state = await api.read(base44,admin,{...fields,action:'get_object_building_floor_plan_workspace'});
      if (!state.workspace?.document && body.expected_version !== 0) throw new ApiError(409,'De tekenversie is gewijzigd',{code:'floor_plan_resource_conflict'});
      const clientId = `fixture-${await sha256(body.building_selection_key)}`;
      const opened = await collaborative.handle(ACTIONS.open,admin,{...fields,client_id:clientId,...(body.action==='test:save_collaboratively'?{initial_document:body.data.document}:{})});
      if (!state.workspace?.document) { operations.set(key,{kind:'initial',clientId}); return opened; }
      const before = state.workspace.version === body.expected_version ? opened.workspace.document : rows.ObjectBuildingFloorPlanWorkspace.find(row=>row.workspace_id===state.workspace.id && row.version===body.expected_version)?.document;
      if (!before) throw new ApiError(409,'De tekenversie is gewijzigd',{code:'floor_plan_resource_conflict'});
      const changes = body.action==='test:save_collaboratively' ? diffDocuments(before,body.data.document) : [];
      if (body.action==='test:save_collaboratively' && !changes.length) return opened;
      const claimed = await collaborative.handle(ACTIONS.claim,admin,{...fields,session_id:opened.session.session_id,request_id:body.idempotency_key,...(changes.length?{changes}:{resource_ids:['document']})});
      operation={before,sessionId:opened.session.session_id,lease:claimed.lease};operations.set(key,operation);
    }
    const payload={...fields,session_id:operation.sessionId,operation_id:body.idempotency_key,lease_id:operation.lease.lease_id,fence:operation.lease.fence,base_version:body.expected_version};
    return body.action==='test:save_collaboratively'
      ? collaborative.handle(ACTIONS.apply,admin,{...payload,changes:diffDocuments(operation.before,body.data.document)})
      : collaborative.handle(ACTIONS.publish,admin,{...payload,expected_current_floor_plan_id:body.expected_current_floor_plan_id,data:body.data||{}});
  };
  return { object, rows, api, base44, hooks, audit, uploads, run, collaborative, legacyRun: (body:any)=>api.mutate(base44,admin,body), read: (body: any = {}) => api.read(base44, admin, { ...scope, action: 'get_object_building_floor_plan_workspace', ...body }) };
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'MANAGED_FILE_MASTER_KEY_B64' ? Buffer.alloc(32, 7).toString('base64') : undefined } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('legacy writer migration boundary', () => {
  it.each(['save_object_building_floor_plan_draft','publish_object_building_floor_plan'])('rejects a new %s request without changing any document or publication', async action => {
    const s=setup();const body={...(action.startsWith('save')?save('legacy-new-save'):publish('legacy-new-publication',0)),action};
    await expect(s.legacyRun(body)).rejects.toMatchObject({status:409,details:{code:'floor_plan_client_update_required'}});
    expect((await s.read()).workspace).toBeNull();
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(0);expect(s.rows.ObjectFloorPlan).toHaveLength(0);
    expect(s.audit).not.toHaveBeenCalled();
  });
  it.each(['save_object_building_floor_plan_draft','publish_object_building_floor_plan'])('replays a previously committed %s receipt without activating its historical snapshot', async action => {
    const s=setup();const body={...(action.startsWith('save')?save('legacy-committed-save'):publish('legacy-committed-publication',0)),action};
    const keyHash=await sha256('bag:one'),operation=await sha256(`${admin.id}:${body.idempotency_key}`),fingerprint=await sha256(JSON.stringify(canonical(body)));
    const old={id:'legacy-workspace',version:1,snapshot_id:'legacy-old',published_revision:action.startsWith('publish')?1:0,current_published_floor_plan_id:action.startsWith('publish')?'publication-old':null};
    const current={...old,version:2,snapshot_id:'legacy-current',receipts:{[operation]:{fingerprint,entry:old}}};
    s.rows.ObjectBuildingFloorPlanWorkspace.push(...[['legacy-old',1,doc('Old acknowledged')],['legacy-current',2,doc('Latest drawing')]].map(([id,version,document])=>({id,version,document,workspace_id:old.id,customer_id:scope.customer_id,object_id:scope.object_id,building_selection_key:scope.building_selection_key})));
    if(action.startsWith('publish'))s.rows.ObjectFloorPlan.push({id:'publication-old',object_id:scope.object_id,building_selection_key:scope.building_selection_key,status:'published',revision:1});
    s.object.floor_plan_workspace_index={[keyHash]:current};s.object.floor_plan_workspace_index_version=7;
    const records=structuredClone(s.rows);s.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(s.legacyRun(body)).rejects.toThrow('audit unavailable');
    const replay=await s.legacyRun(body);expect(replay.replayed).toBe(true);expect(replay.workspace.version).toBe(1);
    expect(replay.workspace.document.title).toBe('Old acknowledged');
    expect((await s.read()).workspace.document.title).toBe('Latest drawing');
    expect(s.rows).toEqual(records);expect(s.object.floor_plan_workspace_index_version).toBe(7);
    await expect(s.legacyRun({...body,expected_version:99})).rejects.toMatchObject({status:409,details:{code:'floor_plan_idempotency_conflict'}});
  });
  it('does not turn an uncommitted historical reservation into a new legacy save', async () => {
    const s=setup(),body={...save('legacy-incomplete'),action:'save_object_building_floor_plan_draft'};
    const keyHash=await sha256('bag:one'),operation=await sha256(`${admin.id}:${body.idempotency_key}`),fingerprint=await sha256(JSON.stringify(canonical(body)));
    s.object.floor_plan_workspace_index={[keyHash]:{id:'legacy-pending',version:0,snapshot_id:null,published_revision:0,receipts:{[operation]:{fingerprint,pending:true,expires_at:'2000-01-01T00:00:00.000Z'}}}};
    await expect(s.legacyRun(body)).rejects.toMatchObject({status:409,details:{code:'floor_plan_client_update_required'}});
    expect((await s.read()).workspace).toBeNull();expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(0);
  });
});

describe('authoritative cloud workspace', () => {
  it('returns no workspace before first save; persists complete multi-floor document and keeps map version unchanged', async () => {
    const s = setup(); expect((await s.read()).workspace).toBeNull();
    const data = doc(); const second = structuredClone(data.floors[0]); second.id = 'floor-2'; second.name = 'Verdieping'; second.walls = []; second.openings = []; data.floors.push(second);
    const result = await s.run(save('save-first', 0, { data: { document: data } }));
    expect(result.workspace.version).toBe(1); expect(result.workspace.document.floors).toHaveLength(2);
    expect(s.object.version).toBe(4); expect((await s.read()).workspace.document).toEqual(data);
    expect(JSON.stringify(s.audit.mock.calls)).not.toContain('Begane grond');
  });
  it('replays a committed operation after audit/HTTP failure without replacing a newer canonical document', async () => {
    const s = setup(); await s.run(save('initial'));
    s.audit.mockRejectedValueOnce(new Error('audit temporarily unavailable'));
    const request=save('save-unknown',1,{data:{document:doc('First change')}});
    await expect(s.run(request)).rejects.toThrow('audit temporarily unavailable');
    await s.run(save('save-second',2,{data:{document:doc('Changed')}}));
    const recovered=await s.run(request);
    expect(recovered.replayed).toBe(true);expect(recovered.committed_version).toBe(2);
    expect(recovered.workspace.version).toBe(3);expect(recovered.workspace.document.title).toBe('Changed');
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(3);
  });
  it('retries initialization after interruption while leaving the abandoned snapshot non-authoritative', async () => {
    const s = setup(); s.hooks.afterCreate = (name: string) => { if (name === 'ObjectBuildingFloorPlanWorkspace') { s.hooks.afterCreate = null; throw new Error('process stopped'); } };
    await expect(s.run(save('save-interrupted'))).rejects.toThrow('process stopped');
    expect((await s.read()).workspace).toBeNull();
    const result = await s.run(save('save-interrupted'));
    expect(result.workspace.version).toBe(1); expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(2);
    expect(s.object.floor_plan_workspace_index[await sha256('bag:one')].snapshot_id).toBe(s.rows.ObjectBuildingFloorPlanWorkspace[1].id);
  });
  it('rejects the same operation key with changed content', async () => {
    const s=setup();await s.run(save('initial'));
    await s.run(save('save-bound-key',1,{data:{document:doc('First')}}));
    await expect(s.run(save('save-bound-key',1,{data:{document:doc('Other')}}))).rejects.toMatchObject({status:409,details:{code:'floor_plan_operation_reused'}});
  });
  it('racing first opens return the same authoritative initial document', async () => {
    const s=setup();const results=await Promise.all([s.run(save('racing-save-a',0,{data:{document:doc('A')}})),s.run(save('racing-save-b',0,{data:{document:doc('B')}}))]);
    expect(results[0].workspace.document).toEqual(results[1].workspace.document);
    expect((await s.read()).workspace.version).toBe(1);
    const current=s.object.floor_plan_workspace_index[await sha256('bag:one')];
    expect(s.rows.ObjectBuildingFloorPlanWorkspace.filter(row=>row.id===current.snapshot_id)).toHaveLength(1);
  });
  it('concurrent saves for two buildings both survive independent index rebasing', async () => {
    const s = setup(); await Promise.all([s.run(save('building-one')), s.run(save('building-two', 0, { building_selection_key: 'bag:two' }))]);
    expect((await s.read()).workspace.version).toBe(1); expect((await s.read({ building_selection_key: 'bag:two' })).workspace.version).toBe(1);
    expect(s.object.version).toBe(4);
  });
  it('map change between staging and activation blocks commit and retains the old current', async () => {
    const s = setup(); await s.run(save('save-before-map'));
    // Delay the map change until after the operation's immutable snapshot is
    // staged; changing it during session opening would not exercise activation.
    s.hooks.afterCreate = (name: string) => {
      if (name !== 'ObjectBuildingFloorPlanWorkspace') return;
      s.hooks.afterCreate = null;
      s.hooks.beforeCas = () => { s.object.version = 5; s.hooks.beforeCas = null; };
    };
    await expect(s.run(save('save-map-race', 1, {data:{document:doc('Changed')}}))).rejects.toMatchObject({ status: 409, details: { code: 'building_configuration_conflict' } });
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(2);
    expect((await s.read()).workspace).toMatchObject({ version: 1, document: { title: 'Object' } });
  });
  it('deselection, archived objects and wrong customer are rejected', async () => {
    const s = setup(); await expect(s.run(save('invalid-key', 0, { building_selection_key: 'manual:other' }))).rejects.toMatchObject({ status: 409 });
    s.rows.Customer.push({ id: 'customer-2' }); await expect(s.run(save('invalid-scope', 0, { customer_id: 'customer-2' }))).rejects.toMatchObject({ status: 409 });
    s.object.status = 'archived'; await expect(s.run(save('invalid-archived'))).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a future base version at the server without staging or activating a change', async () => {
    const s = setup();
    const fields = { ...scope, expected_map_version: 4 };
    const opened = await s.collaborative.handle(ACTIONS.open, admin, { ...fields, client_id: 'future-version-client', initial_document: doc() });
    const changes = diffDocuments(opened.workspace.document, doc('Must not be saved'));
    const claimed = await s.collaborative.handle(ACTIONS.claim, admin, { ...fields, session_id: opened.session.session_id, request_id: 'future-version-claim', changes });
    await expect(s.collaborative.handle(ACTIONS.apply, admin, {
      ...fields, session_id: opened.session.session_id, operation_id: 'future-version-operation',
      lease_id: claimed.lease.lease_id, fence: claimed.lease.fence, base_version: 99, changes,
    })).rejects.toMatchObject({ status: 400, details: { code: 'invalid_floor_plan_operation' } });
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(1);
    expect((await s.read()).workspace).toMatchObject({ version: 1, document: { title: 'Object' } });
  });
});

describe('immutable publication pointer', () => {
  it('publishes two buildings independently and preserves previous published geometry', async () => {
    const s = setup(); await s.run(save('draft-building-one')); await s.run(save('draft-building-two', 0, { building_selection_key: 'bag:two' }));
    const first = await s.run(publish('publish-one'));
    await s.run(publish('publish-two', 1, null, { building_selection_key: 'bag:two' }));
    const old = structuredClone(s.rows.ObjectFloorPlan[0]);
    await s.run(save('change-building-one', 2, { data: { document: doc('New title') } }));
    const updated = await s.run(publish('publish-one-again', 3, first.workspace.current_published_floor_plan_id));
    expect(updated.workspace.published_revision).toBe(2); expect(updated.workspace.version).toBe(4);
    expect(s.rows.ObjectFloorPlan[0]).toEqual(old);
    expect((await s.api.resolveCurrent(s.base44, s.object, 'bag:one')).title).toBe('New title');
    expect((await s.api.resolveCurrent(s.base44, s.object, 'bag:two')).revision).toBe(1);
    expect(s.api.committedFloorPlans(s.object, s.rows.ObjectFloorPlan).filter((r: any) => r.is_current)).toHaveLength(2);
  });
  it('concurrent publishers get one successful commit and one conflict, never no current', async () => {
    const s = setup(); await s.run(save('draft-pub-race'));
    const outcomes = await Promise.allSettled([s.run(publish('publish-racer-a')), s.run(publish('publish-racer-b'))]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const committed = s.api.committedFloorPlans(s.object, s.rows.ObjectFloorPlan);
    expect(committed).toHaveLength(1); expect(committed[0].is_current).toBe(true);
    expect((await s.read()).workspace.published_revision).toBe(1);
  });
  it('recovers publication interrupted after record creation; old pointer stays readable throughout', async () => {
    const s = setup(); await s.run(save('draft-before-pub'));
    const initial = await s.run(publish('publish-initial'));
    await s.run(save('draft-revision-two', 2, {data:{document:doc('Revision two')}}));
    s.hooks.afterCreate = (name: string) => { if (name === 'ObjectFloorPlan') { s.hooks.afterCreate = null; throw new Error('interrupted publication'); } };
    const request = publish('publish-interrupted', 3, initial.workspace.current_published_floor_plan_id);
    await expect(s.run(request)).rejects.toThrow('interrupted publication');
    expect((await s.api.resolveCurrent(s.base44, s.object, 'bag:one')).id).toBe(initial.workspace.current_published_floor_plan_id);
    expect(s.api.committedFloorPlans(s.object, s.rows.ObjectFloorPlan)).toHaveLength(1);
    await s.run(request); expect(s.rows.ObjectFloorPlan).toHaveLength(2);
    expect((await s.read()).workspace.published_revision).toBe(2);
  });
  it('unknown successful publication outcome replays without a duplicate revision', async () => {
    const s = setup(); await s.run(save('draft-unknown-pub')); s.audit.mockRejectedValueOnce(new Error('unknown output'));
    await expect(s.run(publish('unknown-pub'))).rejects.toThrow('unknown output');
    const recovered = await s.run(publish('unknown-pub')); expect(recovered.replayed).toBe(true); expect(s.rows.ObjectFloorPlan).toHaveLength(1);
  });
  it('requires exact current publication and never changes legacy objectwide currents', async () => {
    const s = setup(); s.rows.ObjectFloorPlan.push({ id: 'ios', object_id: 'object-1', building_selection_key: null, is_current: true, revision: 12, status: 'published' });
    await s.run(save('draft-legacy-test')); await expect(s.run(publish('pub-wrong-current', 1, 'ios'))).rejects.toMatchObject({ status: 409 });
    await s.run(publish('pub-right-current')); expect(s.rows.ObjectFloorPlan[0].is_current).toBe(true);
  });
});

describe('document boundary and geometry', () => {
  it.each([
    (d: any) => { d.floors[0].walls[0].end.x = Infinity; },
    (d: any) => { d.floors[0].walls[0].id = 'floor-1'; },
    (d: any) => { d.floors[0].openings[0].wallId = 'not-present'; },
    (d: any) => { d.floors[0].openings[0].offset = 9.5; },
    (d: any) => { d.title = '<script>alert(1)</script>'; },
    (d: any) => { d.url = 'https://external.test'; },
    (d: any) => { d.floors = Array(31).fill(d.floors[0]); },
    (d: any) => { d.unit = 'px'; },
  ])('rejects malformed geometry without truncating the drawing', change => { const d = doc(); change(d); expect(() => validateDesktopDocument(d, ApiError)).toThrow(ApiError); });
  it('first-floor legacy conversion uses source coordinates Y-up and metric openings', () => {
    const d = doc(); d.floors[0].walls[0].start = { x: 5, y: 5 }; d.floors[0].walls[0].end = { x: 5, y: 15 };
    const legacy = desktopLegacyFloor(d); expect(legacy.openings[0].start).toEqual({ x: 5, y: 7 }); expect(legacy.openings[0].end).toEqual({ x: 5, y: 8 });
  });
  it('rejects installation links from another object', async () => {
    const s = setup(); const d: any = doc(); d.floors[0].symbols.push({ id: 'symbol-1', kind: 'camera', position: { x: 1, y: 1 }, rotation: 0, label: '', installationId: 'installation-other' });
    s.rows.ObjectInstallation.push({ id: 'installation-other', customer_id: 'customer-1', object_id: 'different' });
    await expect(s.run(save('invalid-installation', 0, { data: { document: d } }))).rejects.toMatchObject({ status: 409 });
  });
});

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13]).toString('base64');
const upload = (key = 'upload-private') => ({ ...scope, action: 'upload_object_building_floor_plan_asset', expected_version: 0, expected_map_version: 4, idempotency_key: key, data: { kind: 'background', filename: 'plan.png', mime_type: 'image/png', content_base64: png } });
describe('private managed drawing assets', () => {
  it('encrypts bytes, uses private upload, returns no keys/URLs and replays without another upload', async () => {
    const s = setup(); const result = await s.run(upload()); expect(result.file_id).toBeTruthy(); expect(s.uploads).toHaveLength(1);
    expect(Buffer.from(s.uploads[0]).toString('base64')).not.toBe(png);
    expect(JSON.stringify(result)).not.toContain('file_uri'); expect(JSON.stringify(result)).not.toContain('raw_key');
    const file = s.rows.ManagedFile[0]; expect(file.storage_visibility).toBe('private'); expect(file.metadata.building_key_hash).toBe(await sha256('bag:one'));
    expect((await s.run(upload())).file_id).toBe(result.file_id); expect(s.uploads).toHaveLength(1);
    expect((await s.read()).workspace).toBeNull();
  });
  it('recovers registered upload after interruption without uploading bytes again', async () => {
    const s = setup(); s.hooks.afterCreate = (name: string) => { if (name === 'ManagedFile') { s.hooks.afterCreate = null; throw new Error('process stopped after file registration'); } };
    await expect(s.run(upload('upload-interrupted'))).rejects.toThrow('process stopped');
    await s.run(upload('upload-interrupted')); expect(s.uploads).toHaveLength(1); expect(s.rows.ManagedFile).toHaveLength(1);
  });
  it('concurrent duplicate uploads reserve before sending bytes', async () => {
    const s = setup(); const outcomes = await Promise.allSettled([s.run(upload('upload-concurrent')), s.run(upload('upload-concurrent'))]);
    expect(outcomes.some(item => item.status === 'fulfilled')).toBe(true); expect(s.uploads).toHaveLength(1);
  });
  it('binds a PDF to the saved workspace version and upcoming immutable publication', async () => {
    const s = setup();
    const request: any = upload('upload-publication-pdf'); request.data = {kind: 'pdf', filename: 'plan.pdf', mime_type: 'application/pdf', content_base64: Buffer.from('%PDF-1.7\nexample').toString('base64')};
    await expect(s.run(request)).rejects.toMatchObject({status: 409});
    await s.run(save('save-before-pdf')); request.expected_version = 1;
    const asset = await s.run(request);
    expect(s.rows.ManagedFile[0].folder_path).toContain('/revision-1/assets');
    expect(s.rows.ManagedFile[0].metadata).toMatchObject({draft_version: 1, publication_revision: 1});
    const result = await s.run(publish('publish-with-pdf', 1, null, {data: {pdf_file_id: asset.file_id}}));
    expect(s.rows.ObjectFloorPlan[0].pdf_file_id).toBe(asset.file_id);
    await expect(s.run(publish('reuse-obsolete-pdf', 2, result.workspace.current_published_floor_plan_id, {data: {pdf_file_id: asset.file_id}}))).rejects.toMatchObject({status: 409, details: {code: 'floor_plan_asset_revision_conflict'}});
  });
  it('accepts a scoped logo and crop center, and rejects a logo from another building', async () => {
    const s = setup(); const request = upload('upload-logo'); request.data.kind = 'logo';
    const result = await s.run(request); const d: any = doc(); d.floors[0].print.logoFileId = result.file_id; d.floors[0].print.cropCenter = { x: 12, y: 5 };
    const saved = await s.run(save('save-with-logo', 0, { data: { document: d } }));
    expect(saved.workspace.document.floors[0].print.cropCenter).toEqual({ x: 12, y: 5 });
    await expect(s.run(save('other-building-logo', 0, { data: { document: d }, building_selection_key: 'bag:two' }))).rejects.toMatchObject({ status: 403 });
  });
  it('downloads and verifies encrypted bytes without exposing unwrap material', async () => {
    const s = setup(); const result = await s.run(upload()); vi.stubGlobal('fetch', vi.fn(async () => new Response(s.uploads[0])));
    const read = await s.read({ action: 'read_object_building_floor_plan_asset', file_id: result.file_id }); expect(read.content_base64).toBe(png);
    expect(Object.keys(read).sort()).toEqual(['content_base64', 'file_id', 'filename', 'mime_type']);
    await expect(s.read({ action: 'read_object_building_floor_plan_asset', file_id: result.file_id, building_selection_key: 'bag:two' })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects forged file types, other-building backgrounds and uncalibrated publication', async () => {
    const s = setup(); const bad = upload('upload-wrongtype'); bad.data.mime_type = 'application/pdf'; await expect(s.run(bad)).rejects.toMatchObject({ status: 400 });
    const asset = await s.run(upload()); const d: any = doc(); d.floors[0].background = { fileId: asset.file_id, width: 100, height: 100, origin: { x: 0, y: 0 }, metresPerPixel: 0.1, opacity: 0.5, calibrated: false };
    await expect(s.run(save('cross-building', 0, { building_selection_key: 'bag:two', data: { document: d } }))).rejects.toMatchObject({ status: 403 });
    await s.run(save('draft-background', 0, { data: { document: d } }));
    await expect(s.run(publish('pub-background'))).rejects.toMatchObject({ status: 409, details: { code: 'floor_plan_scale_unconfirmed' } });
  });
});

const referenceGeo = { crs: 'EPSG:28992', origin: { x: 201234.5, y: 495123.6 }, rotation: 0, verticalDatum: 'NAP', axis: 'x-east-y-north' };
function referenceSetup() {
  const s = setup();
  Object.assign(s.object, { latitude: 52.44, longitude: 6.07, building_selection_mode: 'manual', building_selection_points: [{ id: 'selected-one', latitude: 52.44, longitude: 6.07 }, { id: 'selected-two', latitude: 52.441, longitude: 6.071 }], keys: ['point:selected-one', 'point:selected-two'] });
  let now = '2026-10-10T12:00:00.000Z';
  const candidate: any = { id: 'bgt:source-one', source: 'bgt', sourceId: 'source-one', bagId: '0246100000012576', label: 'Buitencontour', structureType: 'building', matching: 'contains_point', geometry: { type: 'Polygon', coordinates: [[[6.07,52.44],[6.0701,52.44],[6.0701,52.4401],[6.07,52.44]]] }, polygons: [[[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:0}]]], geoReference: referenceGeo, provenance: { retrievedAt: now, license: 'CC0-1.0', attribution: 'BGT via PDOK', version: '2026', registeredAt: '2026-01-01' }, requiresConfirmation: true };
  const discover = vi.fn(async () => ({ candidates: [structuredClone(candidate)], aerial: { year: 2026, geoReference: referenceGeo }, warnings: [], status: 'ready' }));
  const prepareAerial = vi.fn(async () => ({ bytes: new Uint8Array(Buffer.from(png, 'base64')), mimeType: 'image/png', width: 100, height: 100, origin: { x:-5,y:-5 }, metresPerPixel: 0.1, geoReference: referenceGeo, attribution: 'Luchtfoto 2026 / PDOK', year: 2026 }));
  const publicModel = {schemaVersion:1,bagId:candidate.bagId,geoReference:referenceGeo,vertices:[{x:0,y:0,z:3.1},{x:10,y:0,z:3.1},{x:10,y:10,z:3.1}],surfaces:[{rings:[[0,1,2]],type:'roof'}],groundNAP:5,sourceYear:2025,quality:{rmseMetres:0.5},provenance:{source:'kadaster_3d',sourceId:'NL.IMBAG.Pand.0246100000012576',url:'https://3d.kadaster.nl/example.zip',retrievedAt:now,license:'CC-BY-4.0',attribution:'Kadaster / CC BY 4.0',lod:'2.2'},attributions:['Kadaster / CC BY 4.0']};
  const prepareModel = vi.fn(async () => ({model:structuredClone(publicModel),warnings:[]}));
  const handler = createBuildingReferenceHandlers({ApiError, sha256, nowIso: () => now, versionOf: (o: any) => o.version, floorPlans: s.api, discover, prepareAerial, prepareModel});
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(s.uploads[Number(/file-(\d+)/.exec(url)![1])-1])));
  const body = {customer_id:'customer-1',object_id:'object-1',building_selection_key:'point:selected-one',expected_map_version:4};
  const list = (extra: any = {}) => handler.read(s.base44, admin, {...body,action:'get_object_building_reference_candidates',...extra});
  const prepare = (candidate_id: string, extra: any = {}) => handler.mutate(s.base44, admin, {...body,action:'prepare_object_building_reference_import',candidate_id,idempotency_key:'reference-import-one',interpretation:'closed_building',include_aerial:true,...extra});
  return {...s,body,candidate,discover,prepareAerial,prepareModel,publicModel,handler,list,prepare,setNow:(value: string) => {now=value;}};
}

describe('public building source packages', () => {
  it('uses only saved scope/selection and returns a brokered photo without writing business data', async () => {
    const s=referenceSetup(); const result=await s.list({bag_id:'forged',selectedPoint:[5,51],geometry:{bad:true}});
    expect(s.discover).toHaveBeenCalledWith({selectionKey:'point:selected-one',selectedPoint:[6.07,52.44]});
    expect(result.candidates[0].candidate_id).toMatch(/^v1\.\d{10}\.[a-f0-9]{64}$/);
    expect(result.aerial.content_base64).toBe(png); expect(s.uploads).toHaveLength(0);
    expect((await s.read({building_selection_key:'point:selected-one'})).capabilities.document_versions).toEqual([1,2]);
  });
  it('scopes candidates to exact selection and rejects stale map versions', async () => {
    const s=referenceSetup(); const result=await s.list();
    await expect(s.prepare(result.candidates[0].candidate_id,{building_selection_key:'point:selected-two'})).rejects.toMatchObject({details:{code:'building_reference_candidate_changed'}});
    await expect(s.list({expected_map_version:3})).rejects.toMatchObject({details:{code:'building_configuration_conflict'}});
    expect(s.uploads).toHaveLength(0);
  });
  it('rejects changed and expired proposals without changing a drawing', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    s.candidate.polygons[0][0][1].x=11;
    await expect(s.prepare(token)).rejects.toMatchObject({details:{code:'building_reference_candidate_changed'}});
    s.setNow('2026-10-10T12:16:00.000Z');
    await expect(s.prepare(token)).rejects.toMatchObject({details:{code:'building_reference_candidate_expired'}});
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(0);
  });
  it('encrypts immutable manifest/photo; a replay after expiry performs no fresh source calls or upload', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    const first=await s.prepare(token); expect(first.reference.attributions).toEqual(['BGT via PDOK','Luchtfoto 2026 / PDOK']);
    expect(s.uploads).toHaveLength(2); expect(s.rows.ManagedFile.every(f=>f.encrypted && f.storage_visibility==='private')).toBe(true);
    const manifestFile=s.rows.ManagedFile.find(f=>f.metadata.asset_kind==='reference_manifest');
    const manifest=JSON.parse(Buffer.from(await s.api.serverOnly.decryptAsset(s.base44,manifestFile),'base64').toString());
    expect(manifest.aerialSource.sha256).toBe(createHash('sha256').update(Buffer.from(png,'base64')).digest('hex'));
    expect(manifest.aerialSource.year).toBe(2026);
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(0);
    s.discover.mockClear(); s.setNow('2026-10-10T14:00:00.000Z');
    const replay=await s.prepare(token); expect(replay).toEqual({...first,replayed:true});
    expect(s.discover).not.toHaveBeenCalled(); expect(s.uploads).toHaveLength(2);
  });
  it('conflicts when the same import key changes content', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id; await s.prepare(token);
    await expect(s.prepare(token,{include_aerial:false})).rejects.toMatchObject({details:{code:'floor_plan_idempotency_conflict'}});
    expect(s.uploads).toHaveLength(2);
  });
  it('preparing an open shed requires open-structure interpretation', async () => {
    const s=referenceSetup(); s.candidate.structureType='open_shed'; const token=(await s.list()).candidates[0].candidate_id;
    await expect(s.prepare(token)).rejects.toMatchObject({details:{code:'building_reference_structure_confirmation'}});
    const imported=await s.prepare(token,{interpretation:'open_structure',include_aerial:false});
    expect(imported.reference.usedParts).toEqual(['footprint']); expect(s.uploads).toHaveLength(1);
  });
  it('keeps a valid contour available when photo preview is unavailable', async () => {
    const s=referenceSetup(); s.prepareAerial.mockRejectedValue(new Error('upstream unavailable'));
    const result=await s.list(); expect(result.status).toBe('partial'); expect(result.candidates).toHaveLength(1); expect(result.aerial).toBeNull();
    await expect(s.prepare(result.candidates[0].candidate_id)).rejects.toMatchObject({details:{code:'building_reference_aerial_unavailable'}});
    expect((await s.prepare(result.candidates[0].candidate_id,{include_aerial:false})).reference.usedParts).toEqual(['footprint']);
  });
  it('reserves concurrent duplicate imports before upload', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    const results=await Promise.allSettled([s.prepare(token),s.prepare(token)]);
    expect(results.some(r=>r.status==='fulfilled')).toBe(true); expect(s.uploads).toHaveLength(2);
    await s.prepare(token); expect(s.uploads).toHaveLength(2);
  });
  it('recovers registration interrupted before the manifest receipt', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    s.hooks.afterCreate=(name:string,row:any)=>{if(name==='ManagedFile'&&row.metadata.asset_kind==='reference_manifest'){s.hooks.afterCreate=null;throw Error('interrupted after manifest');}};
    await expect(s.prepare(token)).rejects.toThrow('interrupted after manifest');
    expect((await s.prepare(token)).replayed).toBe(true); expect(s.uploads).toHaveLength(2);
  });
  it('saves v2 provenance, keeps v1 strict, and rejects forged hashes and missing rights', async () => {
    const s=referenceSetup(); const imported=await s.prepare((await s.list()).candidates[0].candidate_id);
    const data:any=doc(); Object.assign(data,{schemaVersion:2,geoReference:imported.geoReference,buildingReferences:[{...imported.reference,floorId:'floor-1',wallIds:['wall-1']}]});
    const request=save('save-reference',0,{...s.body,data:{document:data}});
    expect((await s.run(request)).workspace.document.buildingReferences).toEqual(data.buildingReferences);
    const legacy={...data,schemaVersion:1}; expect(()=>validateDesktopDocument(legacy,ApiError)).toThrow();
    data.buildingReferences[0].manifestSha256='0'.repeat(64);
    await expect(s.run(save('forged-reference',1,{...s.body,data:{document:data}}))).rejects.toMatchObject({details:{code:'building_reference_manifest_mismatch'}});
    data.buildingReferences[0].manifestSha256=imported.manifest_sha256;
    await expect(s.run(save('cross-selection-reference',0,{...s.body,building_selection_key:'point:selected-two',data:{document:data}}))).rejects.toMatchObject({status:403});
  });
  it('does not allow public upload to forge trusted reference metadata', async () => {
    const s=referenceSetup(); const request:any=upload('forge-manifest'); Object.assign(request,s.body); request.data={kind:'reference_manifest',mime_type:'application/json',content_base64:Buffer.from('{}').toString('base64')};
    await expect(s.run(request)).rejects.toMatchObject({details:{code:'invalid_floor_plan_asset'}}); expect(s.uploads).toHaveLength(0);
  });
  it('rejects manifest attribution/coordinate tampering and removed selection on replay', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id; const imported=await s.prepare(token);
    const data:any=doc(); Object.assign(data,{schemaVersion:2,geoReference:{...imported.geoReference,origin:{x:200000,y:495000}},buildingReferences:[{...imported.reference,floorId:'floor-1',wallIds:[]}]});
    await expect(s.run(save('alter-georeference',0,{...s.body,data:{document:data}}))).rejects.toMatchObject({details:{code:'building_reference_georeference_mismatch'}});
    data.geoReference=imported.geoReference; data.buildingReferences[0].attributions=[];
    await expect(s.run(save('erase-attribution',0,{...s.body,data:{document:data}}))).rejects.toMatchObject({details:{code:'building_reference_manifest_mismatch'}});
    s.object.keys=[];
    await expect(s.prepare(token)).rejects.toMatchObject({details:{code:'building_selection_unavailable'}});
  });
});

describe('public building reference publication compatibility', () => {
  it('accepts an explicit correction from unknown source classification to closed building', async () => {
    const s=referenceSetup(); s.candidate.structureType='unknown'; const token=(await s.list()).candidates[0].candidate_id;
    const result=await s.prepare(token,{confirmed_closed_structure:true,include_aerial:false});
    expect(result.reference.interpretation).toBe('closed_building');
  });
  it('publishes v2 source references immutably while the legacy 2D geometry remains unchanged', async () => {
    const s=referenceSetup(); const imported=await s.prepare((await s.list()).candidates[0].candidate_id);
    const data:any=doc(); const before=desktopLegacyFloor(data);
    Object.assign(data,{schemaVersion:2,geoReference:imported.geoReference,buildingReferences:[{...imported.reference,floorId:'floor-1',wallIds:['wall-1']}]});
    data.floors[0].background={...imported.aerial,calibrated:true};
    await s.run(save('save-v2-publication',0,{...s.body,data:{document:data}}));
    await s.run(publish('publish-v2-reference',1,null,s.body));
    expect(s.rows.ObjectFloorPlan[0].floorplan_2d_json).toEqual(before);
    expect(s.rows.ObjectFloorPlan[0].desktop_document.buildingReferences[0]).toEqual(data.buildingReferences[0]);
    s.rows.ManagedFile.find(f=>f.metadata.asset_kind==='reference_aerial').status='archived';
    await expect(s.run(publish('republish-missing-source',2,s.rows.ObjectFloorPlan[0].id,s.body))).rejects.toMatchObject({details:{code:'floor_plan_asset_unavailable'}});
    expect(s.rows.ObjectFloorPlan).toHaveLength(1);
  });
});

it('allows intentional v2-to-v1 undo through collaboration while rejecting legacy writes', async () => {
  const s=referenceSetup(); const imported=await s.prepare((await s.list()).candidates[0].candidate_id,{include_aerial:false});
  const data:any=doc(); Object.assign(data,{schemaVersion:2,geoReference:imported.geoReference,buildingReferences:[{...imported.reference,floorId:'floor-1',wallIds:['wall-1']}]});
  await s.run(save('save-v2-for-undo',0,{...s.body,data:{document:data}}));
  await expect(s.legacyRun({...save('old-client-downgrade',1,s.body),action:'save_object_building_floor_plan_draft'})).rejects.toMatchObject({details:{code:'floor_plan_client_update_required'}});
  expect((await s.run(save('new-client-undo',1,{...s.body,supported_document_versions:[1,2]}))).workspace.document.schemaVersion).toBe(1);
  expect(s.rows.ManagedFile).toHaveLength(1);
});

describe('optional immutable public exterior model', () => {
  it('stores the metric source model separately and scopes it through the immutable manifest', async () => {
    const s=referenceSetup(); const discovery=await s.list(); expect(discovery.candidates[0].hasModelPotential).toBe(true);
    const imported=await s.prepare(discovery.candidates[0].candidate_id,{include_model:true});
    expect(imported.reference.usedParts).toEqual(['footprint','aerial','roof']); expect(s.uploads).toHaveLength(3);
    const asset=s.rows.ManagedFile.find(f=>f.metadata.asset_kind==='reference_model');
    expect(imported.reference.modelFileId).toBe(asset.id); expect(imported.model.sourceYear).toBe(2025);
    const raw=JSON.parse(Buffer.from(await s.api.serverOnly.decryptAsset(s.base44,asset),'base64').toString());
    expect(raw.vertices[0].z).toBe(3.1); expect(raw.groundNAP).toBe(5);
    expect(s.prepareModel).toHaveBeenCalledWith({bagId:s.candidate.bagId,geoReference:referenceGeo,sourceBounds:[201234.5,495123.6,201244.5,495133.6]});
    const data:any=doc(); Object.assign(data,{schemaVersion:2,geoReference:imported.geoReference,buildingReferences:[{...imported.reference,floorId:'floor-1',wallIds:['wall-1']}]});
    await s.run(save('save-source-model',0,{...s.body,data:{document:data}}));
    await s.run(publish('publish-source-model',1,null,s.body));
    asset.status='archived';
    await expect(s.run(publish('missing-source-model',2,s.rows.ObjectFloorPlan[0].id,s.body))).rejects.toMatchObject({details:{code:'floor_plan_asset_unavailable'}});
  });
  it('keeps the outside contour when the optional model source is unavailable', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id; s.prepareModel.mockRejectedValue(new Error('upstream unavailable'));
    const result=await s.prepare(token,{include_aerial:false,include_model:true});
    expect(result.reference.usedParts).toEqual(['footprint']); expect(result.reference.modelFileId).toBeUndefined(); expect(result.warnings).toHaveLength(1); expect(s.uploads).toHaveLength(1);
    s.prepareModel.mockClear(); const replay=await s.prepare(token,{include_aerial:false,include_model:true});
    expect(replay.warnings).toEqual(result.warnings); expect(s.prepareModel).not.toHaveBeenCalled();
  });
  it('rejects a model from another BAG building before storing it', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id; s.publicModel.bagId='0246100000013704';
    await expect(s.prepare(token,{include_aerial:false,include_model:true})).rejects.toMatchObject({details:{code:'building_reference_model_mismatch'}}); expect(s.uploads).toHaveLength(0);
  });
  it('recovers a model registered before interruption without fetching newer source data', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    s.hooks.afterCreate=(name:string,row:any)=>{if(name==='ManagedFile'&&row.metadata.asset_kind==='reference_model'){s.hooks.afterCreate=null;throw Error('interrupted after model');}};
    await expect(s.prepare(token,{include_aerial:false,include_model:true})).rejects.toThrow('interrupted after model');
    s.prepareModel.mockClear(); s.prepareModel.mockRejectedValue(new Error('source changed'));
    const result=await s.prepare(token,{include_aerial:false,include_model:true});
    expect(result.model.sourceYear).toBe(2025); expect(s.prepareModel).not.toHaveBeenCalled(); expect(s.uploads).toHaveLength(2);
  });
  it('recovers a registered photo with its original checksum and geometry', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id;
    s.hooks.afterCreate=(name:string,row:any)=>{if(name==='ManagedFile'&&row.metadata.asset_kind==='reference_aerial'){s.hooks.afterCreate=null;throw Error('interrupted after photo');}};
    await expect(s.prepare(token)).rejects.toThrow('interrupted after photo'); s.prepareAerial.mockClear(); s.prepareAerial.mockRejectedValue(new Error('photo changed'));
    const result=await s.prepare(token); expect(s.prepareAerial).not.toHaveBeenCalled(); expect(result.aerial.origin).toEqual({x:-5,y:-5});
    const manifestFile=s.rows.ManagedFile.find(f=>f.metadata.asset_kind==='reference_manifest');
    const manifest=JSON.parse(Buffer.from(await s.api.serverOnly.decryptAsset(s.base44,manifestFile),'base64').toString());
    expect(manifest.aerialSource.sha256).toBe(createHash('sha256').update(Buffer.from(png,'base64')).digest('hex')); expect(s.uploads).toHaveLength(2);
  });
  it('binds model choice to the request key and rejects forged model references', async () => {
    const s=referenceSetup(); const token=(await s.list()).candidates[0].candidate_id; const result=await s.prepare(token,{include_model:true});
    await expect(s.prepare(token,{include_model:false})).rejects.toMatchObject({details:{code:'floor_plan_idempotency_conflict'}});
    const data:any=doc(); Object.assign(data,{schemaVersion:2,geoReference:result.geoReference,buildingReferences:[{...result.reference,modelFileId:result.aerial.fileId,floorId:'floor-1',wallIds:[]}]});
    await expect(s.run(save('forged-source-model',0,{...s.body,data:{document:data}}))).rejects.toMatchObject({details:{code:'building_reference_model_mismatch'}});
    delete data.buildingReferences[0].modelFileId;
    expect(()=>validateDesktopDocument(data,ApiError)).toThrow();
  });
});

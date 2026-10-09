import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { TextEncoder } from 'node:util';
import { createBuildingFloorPlanHandlers, validateDesktopDocument, desktopLegacyFloor } from '../../base44/functions/customerPlatformApi/buildingFloorPlans';

class ApiError extends Error {
  constructor(public status: number, message: string, public details: any = {}) { super(message); }
}
const admin = { id: 'admin-one', role: 'admin' };
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
const doc = (title = 'Object') => ({ schemaVersion: 1, id: 'doc-1', title, unit: 'm', floors: [{ id: 'floor-1', name: 'Begane grond', elevation: 0, walls: [{ id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2 }], rooms: [], openings: [{ id: 'door-1', wallId: 'wall-1', type: 'door', offset: 2, width: 1, hinge: 'left', swing: 'in' }], symbols: [], routes: [], print: { paper: 'A4', orientation: 'landscape', scale: 100, profile: 'installation', title: '', address: '', drawingNumber: '', instructions: '', secondaryInstructions: '', language2: '', viewpoints: [] } }] });
const scope = { customer_id: 'customer-1', object_id: 'object-1', building_selection_key: 'bag:one' };
const save = (key: string, version = 0, overrides: any = {}) => ({ ...scope, action: 'save_object_building_floor_plan_draft', expected_map_version: 4, expected_version: version, idempotency_key: key, data: { document: doc() }, ...overrides });
const publish = (key: string, version = 1, current: string | null = null, overrides: any = {}) => ({ ...scope, action: 'publish_object_building_floor_plan', expected_map_version: 4, expected_version: version, expected_current_floor_plan_id: current, idempotency_key: key, ...overrides });

function matches(record: any, query: any): boolean {
  return Object.entries(query).every(([key, value]: any) => {
    if (key === '$or') return value.some((branch: any) => matches(record, branch));
    if (key === '$and') return value.every((branch: any) => matches(record, branch));
    if (value && typeof value === 'object' && '$exists' in value) return (record[key] !== undefined) === value.$exists;
    return record[key] === value;
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
  return { object, rows, api, base44, hooks, audit, uploads, run: (body: any) => api.mutate(base44, admin, body), read: (body: any = {}) => api.read(base44, admin, { ...scope, action: 'get_object_building_floor_plan_workspace', ...body }) };
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

describe('authoritative cloud workspace', () => {
  it('returns no workspace before first save; persists complete multi-floor document and keeps map version unchanged', async () => {
    const s = setup(); expect((await s.read()).workspace).toBeNull();
    const data = doc(); const second = structuredClone(data.floors[0]); second.id = 'floor-2'; second.name = 'Verdieping'; second.walls = []; second.openings = []; data.floors.push(second);
    const result = await s.run(save('save-first', 0, { data: { document: data } }));
    expect(result.workspace.version).toBe(1); expect(result.workspace.document.floors).toHaveLength(2);
    expect(s.object.version).toBe(4); expect((await s.read()).workspace.document).toEqual(data);
    expect(JSON.stringify(s.audit.mock.calls)).not.toContain('Begane grond');
  });
  it('replays the exact saved snapshot after audit/HTTP failure, even when a later save exists', async () => {
    const s = setup(); s.audit.mockRejectedValueOnce(new Error('audit temporarily unavailable'));
    await expect(s.run(save('save-unknown'))).rejects.toThrow('audit temporarily unavailable');
    await s.run(save('save-second', 1, { data: { document: doc('Changed') } }));
    const recovered = await s.run(save('save-unknown'));
    expect(recovered.replayed).toBe(true); expect(recovered.workspace.version).toBe(1); expect(recovered.workspace.document.title).toBe('Object');
    expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(2);
    expect((await s.read()).workspace.version).toBe(2);
  });
  it('recovers a staged draft after interruption before activation without creating another snapshot', async () => {
    const s = setup(); s.hooks.afterCreate = (name: string) => { if (name === 'ObjectBuildingFloorPlanWorkspace') { s.hooks.afterCreate = null; throw new Error('process stopped'); } };
    await expect(s.run(save('save-interrupted'))).rejects.toThrow('process stopped');
    expect((await s.read()).workspace).toBeNull();
    const result = await s.run(save('save-interrupted'));
    expect(result.workspace.version).toBe(1); expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(1);
  });
  it('rejects the same idempotency key with changed content', async () => {
    const s = setup(); await s.run(save('save-bound-key'));
    await expect(s.run(save('save-bound-key', 0, { data: { document: doc('Other') } }))).rejects.toMatchObject({ status: 409, details: { code: 'floor_plan_idempotency_conflict' } });
  });
  it('racing first saves choose one authoritative document and retain the losing draft snapshot', async () => {
    const s = setup(); const results = await Promise.allSettled([s.run(save('racing-save-a', 0, { data: { document: doc('A') } })), s.run(save('racing-save-b', 0, { data: { document: doc('B') } }))]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect((await s.read()).workspace.version).toBe(1); expect(s.rows.ObjectBuildingFloorPlanWorkspace).toHaveLength(2);
  });
  it('concurrent saves for two buildings both survive independent index rebasing', async () => {
    const s = setup(); await Promise.all([s.run(save('building-one')), s.run(save('building-two', 0, { building_selection_key: 'bag:two' }))]);
    expect((await s.read()).workspace.version).toBe(1); expect((await s.read({ building_selection_key: 'bag:two' })).workspace.version).toBe(1);
    expect(s.object.version).toBe(4);
  });
  it('map change between staging and activation blocks commit and retains the old current', async () => {
    const s = setup(); await s.run(save('save-before-map'));
    s.hooks.beforeCas = () => { s.object.version = 5; s.hooks.beforeCas = null; };
    await expect(s.run(save('save-map-race', 1))).rejects.toMatchObject({ status: 409, details: { code: 'building_configuration_conflict' } });
    expect((await s.read()).workspace.version).toBe(1);
  });
  it('deselection, archived objects, wrong customer and unexpected version are rejected', async () => {
    const s = setup(); await expect(s.run(save('invalid-key', 0, { building_selection_key: 'manual:other' }))).rejects.toMatchObject({ status: 409 });
    s.rows.Customer.push({ id: 'customer-2' }); await expect(s.run(save('invalid-scope', 0, { customer_id: 'customer-2' }))).rejects.toMatchObject({ status: 409 });
    await expect(s.run(save('invalid-version', 5))).rejects.toMatchObject({ status: 409 });
    s.object.status = 'archived'; await expect(s.run(save('invalid-archived'))).rejects.toMatchObject({ status: 409 });
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
    await s.run(save('draft-revision-two', 2));
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

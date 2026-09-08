import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { createCollectiveDossierHandlers } from '../../base44/functions/customerPlatformApi/collectiveDossier.ts';

class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
beforeAll(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); });
const admin = { id: 'admin', role: 'admin' };
const bag = (id = 'pand-1') => ({ type: 'FeatureCollection', features: [{ type: 'Feature', id, properties: { source: 'pdok_bag', source_feature_id: id }, geometry: { type: 'Polygon', coordinates: [[[5, 52], [5.001, 52], [5.001, 52.001], [5, 52.001], [5, 52]]] } }] });
const point = (id = 'point-1', longitude = 5.0005) => ({ id, source: 'user_selected', provider: 'mapbox', bag_status: 'unlinked', longitude, latitude: 52.0005 });
function fixture(extra = {}, overrides = {}) {
  let nextId = 1;
  const rows = {
    Customer: [{ id: 'c1', name: 'Beheerder', version: 1 }, { id: 'c2', name: 'Huurder', version: 1 }],
    SurveillanceObject: [{ id: 'o1', customer_id: 'c1', name: 'Portier', version: 1 }, { id: 'o2', customer_id: 'c2', name: 'Kruizinga', version: 1 }],
    Collectief: [], CollectiveMembership: [], PhysicalBuilding: [], BuildingDossierLink: [], ObjectCustomerResponsibility: [], CollectiveDossierRecord: [], CollectiveDossierEvent: [], CollectiveMutationReceipt: [], CollectiveMapGeometryRevision: [], Task: [], ...extra,
  };
  let failEvent = false;
  let queue = Promise.resolve();
  const entities = Object.fromEntries(Object.keys(rows).map((name) => [name, {
    get: async (id) => { const row = rows[name].find((item) => item.id === id); if (!row) throw new ApiError(404, 'Missing'); return structuredClone(row); },
    list: async () => structuredClone(rows[name]),
    filter: async (filter) => structuredClone(rows[name].filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value))),
    create: async (value) => {
      if (name === 'CollectiveDossierEvent' && failEvent) { failEvent = false; throw new Error('temporary event outage'); }
      const row = { ...structuredClone(value), id: `${name}-${nextId++}` }; rows[name].push(row); return structuredClone(row);
    },
  }]));
  const backend = createCollectiveDossierHandlers({
    entity: (_base44, name) => entities[name], ApiError,
    casUpdate: async (_base44, name, prior, expected, patch) => {
      const row = rows[name].find((item) => item.id === prior.id);
      if ((row.version || 1) !== expected) throw new ApiError(409, 'Version conflict');
      Object.assign(row, structuredClone(patch), { version: expected + 1 }); return structuredClone(row);
    },
    withMutationLock: async (_base44, _body, _user, fn) => {
      const previous = queue; let release; queue = new Promise((resolve) => { release = resolve; });
      await previous; try { return await fn(); } finally { release(); }
    },
    ...overrides,
  });
  const mutate = (action, body, key = `request-${nextId++}`) => backend.mutate({}, admin, action, { action, ...body, idempotency_key: key }, body.expected_version ?? 0, key);
  return { rows, backend, mutate, failNextEvent: () => { failEvent = true; } };
}

describe('collective dossier backend', () => {
  it('requires admin for reads and mutations', async () => {
    const { backend } = fixture();
    await expect(backend.read({}, { id: 'user', role: 'user' }, 'list_collective_dossiers', {})).rejects.toMatchObject({ status: 403 });
    await expect(backend.mutate({}, { id: 'user', role: 'user' }, 'create_collective_dossier', {}, 0, 'key')).rejects.toMatchObject({ status: 403 });
  });

  it('creates a neighborhood without a managing customer or legacy commercial scope', async () => {
    const { rows, mutate } = fixture();
    const result = await mutate('create_collective_dossier', { name: 'Buurt', collectief_type: 'woonwijk', expected_version: 0 });
    expect(rows.Collectief[0]).toMatchObject({ id: result.collective_id, customer_id: null, manager_customer_id: null, object_ids: [], collectief_type: 'woonwijk' });
  });

  it('preserves legacy billing scope while changing the dossier manager', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', collectief_type: 'bedrijventerrein', customer_id: 'c1', object_ids: ['o1'], version: 1 }] });
    await mutate('update_collective_dossier', { collective_id: 'estate', manager_customer_id: 'c2', expected_version: 1 });
    expect(rows.Collectief[0]).toMatchObject({ customer_id: 'c1', object_ids: ['o1'], manager_customer_id: 'c2' });
  });

  it('clears a manager and parent without restoring the legacy manager on the next edit', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', collectief_type: 'bedrijventerrein', customer_id: 'c1', manager_customer_id: 'c1', parent_collectief_id: 'parent', version: 1 }, { id: 'parent', name: 'Parent', version: 1 }] });
    await mutate('update_collective_dossier', { collective_id: 'estate', manager_customer_id: null, parent_collectief_id: null, expected_version: 1 });
    await mutate('update_collective_dossier', { collective_id: 'estate', name: 'New name', expected_version: 2 });
    expect(rows.Collectief[0]).toMatchObject({ manager_customer_id: null, parent_collectief_id: null, customer_id: 'c1' });
  });

  it('rejects direct and indirect parent cycles', async () => {
    const { mutate } = fixture({ Collectief: [{ id: 'a', name: 'A', collectief_type: 'bedrijventerrein', version: 1 }, { id: 'b', name: 'B', parent_collectief_id: 'a', version: 1 }] });
    await expect(mutate('update_collective_dossier', { collective_id: 'a', parent_collectief_id: 'a', expected_version: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(mutate('update_collective_dossier', { collective_id: 'a', parent_collectief_id: 'b', expected_version: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('allows cross-customer and multi-collective memberships without changing object ownership', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }] });
    await mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o2', expected_version: 0 });
    await mutate('upsert_collective_membership', { collective_id: 'b', object_id: 'o2', expected_version: 0 });
    expect(rows.CollectiveMembership).toHaveLength(2);
    expect(rows.SurveillanceObject[1].customer_id).toBe('c2');
    expect(rows.Collectief.every((row) => !row.object_ids)).toBe(true);
  });

  it('rejects duplicate create attempts with a new request key and stale versions', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'a', version: 1 }] });
    await mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o2', expected_version: 0 });
    await expect(mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o2', expected_version: 0 })).rejects.toMatchObject({ status: 409 });
    expect(rows.CollectiveMembership).toHaveLength(1);
  });

  it('rejects archived objects and impossible participation dates', async () => {
    const { mutate } = fixture({ Collectief: [{ id: 'a' }], SurveillanceObject: [{ id: 'o1', customer_id: 'c1', status: 'archived' }, { id: 'o2', customer_id: 'c2' }] });
    await expect(mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o1' })).rejects.toMatchObject({ status: 409 });
    await expect(mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o2', starts_on: '2026-09-40' })).rejects.toMatchObject({ status: 400 });
    await expect(mutate('upsert_collective_membership', { collective_id: 'a', object_id: 'o2', starts_on: '2026-09-10', ends_on: '2026-09-09' })).rejects.toMatchObject({ status: 400 });
  });

  it('keeps additional customer responsibilities non-commercial and non-authorizing', async () => {
    const { rows, mutate } = fixture();
    await mutate('upsert_object_customer_responsibility', { object_id: 'o1', customer_id: 'c2', role: 'joint_responsible', notes: 'Samen verantwoordelijk', starts_on: '2026-09-08', billing_enabled: true, report_access_enabled: true });
    expect(rows.ObjectCustomerResponsibility[0]).toMatchObject({ role: 'joint_responsible', billing_enabled: false, report_access_enabled: false, key_access_enabled: false, starts_on: '2026-09-08' });
    expect(rows.SurveillanceObject[0].customer_id).toBe('c1');
    await expect(mutate('upsert_object_customer_responsibility', { object_id: 'o1', customer_id: 'c1' })).rejects.toMatchObject({ status: 400 });
  });

  it('forces collective tasks to draft and supports archiving without creating legacy tasks', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate' }] });
    const first = await mutate('upsert_collective_dossier_record', { collective_id: 'estate', section: 'tasks', title: 'Buurtcontroleronde', status: 'active', data: { task_type: 'mobile_control_round', target_scope: 'collective', days: [1, 2], start_time: '20:00', end_time: '21:00' } });
    expect(rows.CollectiveDossierRecord[0]).toMatchObject({ status: 'draft', operational: false, data: { operational: false } });
    await mutate('upsert_collective_dossier_record', { collective_id: 'estate', record_id: first.resource_id, section: 'tasks', title: 'Buurtcontroleronde', status: 'archived', expected_version: 1, data: {} });
    expect(rows.CollectiveDossierRecord[0].status).toBe('archived');
    expect(rows.Task).toHaveLength(0);
  });

  it('rejects task targets and security plans from other collectives', async () => {
    const { mutate } = fixture({ Collectief: [{ id: 'estate' }], CollectiveDossierRecord: [{ id: 'plan-other', collective_id: 'other', section: 'security-plan' }] });
    await expect(mutate('upsert_collective_dossier_record', { collective_id: 'estate', section: 'tasks', title: 'Task', data: { target_scope: 'objects', target_object_ids: ['o2'] } })).rejects.toMatchObject({ status: 400 });
    await expect(mutate('upsert_collective_dossier_record', { collective_id: 'estate', section: 'tasks', title: 'Task', data: { security_plan_id: 'plan-other' } })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects untyped dossier payloads and does not log sensitive content', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate' }] });
    await expect(mutate('upsert_collective_dossier_record', { collective_id: 'estate', section: 'keys', title: 'Sleutels', data: { permission: 'all-customers' } })).rejects.toMatchObject({ status: 400 });
    await mutate('upsert_collective_dossier_record', { collective_id: 'estate', section: 'keys', title: 'Hoofdsleutel', data: { key_number: 'PRIVATE-KEY-987', storage_location: 'PRIVATE-LOCATION' } });
    const logAndRecovery = JSON.stringify([rows.CollectiveDossierEvent, rows.CollectiveMutationReceipt]);
    expect(logAndRecovery).not.toContain('PRIVATE');
  });

  it('replays safely after an audit write fails and rejects changed payload reuse', async () => {
    const { rows, mutate, failNextEvent } = fixture();
    const body = { name: 'Buurt', collectief_type: 'woonwijk' };
    failNextEvent();
    await expect(mutate('create_collective_dossier', body, 'stable')).rejects.toThrow('temporary event outage');
    await mutate('create_collective_dossier', body, 'stable');
    const replay = await mutate('create_collective_dossier', body, 'stable');
    expect(replay.replayed).toBe(true);
    expect(rows.Collectief).toHaveLength(1);
    expect(rows.CollectiveDossierEvent).toHaveLength(1);
    await expect(mutate('create_collective_dossier', { ...body, name: 'Andere buurt' }, 'stable')).rejects.toMatchObject({ status: 409 });
  });

  it('serializes concurrent duplicate creates with the same key', async () => {
    const { rows, mutate } = fixture();
    const results = await Promise.all([1, 2].map(() => mutate('create_collective_dossier', { name: 'Estate' }, 'same')));
    expect(results[0].collective_id).toBe(results[1].collective_id);
    expect(rows.Collectief).toHaveLength(1);
  });

  it('marks configured geometry for review on location changes without deleting it', async () => {
    const geometry = bag();
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', collectief_type: 'bedrijventerrein', address: 'Old', map_geometry_status: 'configured', building_polygon_geojson: geometry, version: 1 }] });
    await mutate('update_collective_dossier', { collective_id: 'estate', address: 'New', expected_version: 1 });
    expect(rows.Collectief[0]).toMatchObject({ map_geometry_status: 'needs_review', building_polygon_geojson: geometry });
  });

  it('suggests estate membership and requires a building collective for a new shared object', async () => {
    const { rows, backend } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', collectief_type: 'bedrijventerrein', building_polygon_geojson: bag() }] });
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    const result = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], bag(), []);
    expect(result.matches[0]).toMatchObject({ selection_key: 'bag:pand-1', shared_building_required: true, objects: [{ id: 'o1', source_selection_key: 'bag:pand-1' }], collectives: [{ id: 'estate', member: false }] });
    await expect(backend.validateObjectBuildingSharing({}, rows.SurveillanceObject[1], bag(), [])).rejects.toMatchObject({ status: 409, details: { code: 'SHARED_BUILDING_REQUIRED' } });
    rows.SurveillanceObject[1].building_polygon_geojson = bag();
    await expect(backend.validateObjectBuildingSharing({}, rows.SurveillanceObject[1], bag(), [])).resolves.toBeTruthy();
  });

  it('creates a shared building group explicitly without mutating either object or legacy coverage', async () => {
    const { rows, mutate, backend } = fixture();
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    const result = await mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'object', source_id: 'o1', source_selection_key: 'bag:pand-1', name: 'Verzamelgebouw' });
    expect(rows.Collectief[0]).toMatchObject({ id: result.collective_id, collectief_type: 'bedrijfsverzamelgebouw', customer_id: null, object_ids: [], building_polygon_geojson: bag() });
    expect(rows.CollectiveMembership.map((row) => row.object_id).sort()).toEqual(['o1', 'o2']);
    expect(rows.SurveillanceObject[1].building_polygon_geojson).toBeUndefined();
    expect(rows.SurveillanceObject[1].version).toBe(1);
    const context = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], bag(), []);
    expect(context.matches[0].shared_building_required).toBe(false);
    expect(rows.CollectiveMapGeometryRevision).toHaveLength(1);
    expect(JSON.stringify([rows.CollectiveDossierEvent, rows.CollectiveMutationReceipt])).not.toContain('coordinates');
  });

  it('does not infer shared unlinked buildings from proximity and accepts explicit attestation', async () => {
    const { rows, backend, mutate } = fixture();
    rows.SurveillanceObject[0].building_selection_points = [point('first', 5.0005)];
    const selected = [point('second', 5.00051)];
    const before = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], null, selected);
    expect(before.matches).toHaveLength(0);
    expect(before.unlinked_candidates).toHaveLength(1);
    await mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'object', source_id: 'o1', source_selection_key: 'selection:o1:first', target_selection_key: 'selection:o2:second', name: 'Gedeeld gebouw' });
    await backend.registerCanonicalBuildings({}, 'object', 'o2', { ...rows.SurveillanceObject[1], building_selection_points: selected });
    const after = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], null, selected);
    expect(after.matches[0].shared_building_required).toBe(false);
    expect(rows.PhysicalBuilding).toHaveLength(1);
    expect(rows.BuildingDossierLink.some((row) => row.attestation === 'user_confirmed')).toBe(true);
  });

  it('returns indirect members separately and preserves legacy tasks as read-only', async () => {
    const { backend } = fixture({ Collectief: [{ id: 'estate' }, { id: 'building', name: 'Verzamelgebouw', parent_collectief_id: 'estate' }], CollectiveMembership: [{ id: 'member', collective_id: 'building', object_id: 'o2', status: 'active' }], Task: [{ id: 'legacy', collectief_id: 'estate', name: 'Oude ronde' }] });
    const result = await backend.read({}, admin, 'get_collective_dossier', { collective_id: 'estate' });
    expect(result.indirect_memberships[0]).toMatchObject({ collective_name: 'Verzamelgebouw', object: { id: 'o2' } });
    expect(result.legacy_tasks[0]).toMatchObject({ id: 'legacy', readonly: true });
  });

  it('creates a child building collective without a tenant and includes already known occupants', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', building_polygon_geojson: bag(), version: 1 }] });
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    rows.SurveillanceObject[1].building_polygon_geojson = bag();
    const result = await mutate('confirm_building_association', { expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'collective', source_id: 'estate', source_selection_key: 'bag:pand-1', name: 'Huurdersgebouw' });
    expect(rows.Collectief.find((row) => row.id === result.collective_id)).toMatchObject({ parent_collectief_id: 'estate', building_polygon_geojson: bag() });
    expect(result.object_id).toBeNull();
    expect(result.linked_object_count).toBe(2);
  });

  it('rejects reuse of a building collective belonging to a different building', async () => {
    const { rows, mutate } = fixture({ Collectief: [{ id: 'other-building', collectief_type: 'bedrijfsverzamelgebouw', building_polygon_geojson: bag('different') }] });
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    await expect(mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'object', source_id: 'o1', source_selection_key: 'bag:pand-1', collective_id: 'other-building' })).rejects.toMatchObject({ status: 409 });
    expect(rows.CollectiveMembership).toHaveLength(0);
  });

  it('delegates reverse map attachment with a deterministic point alias and returns the map version', async () => {
    const attach = vi.fn(async () => ({ object: { version: 2 } }));
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', building_selection_points: [point('saved-point')], version: 1 }] }, { applyCollectiveBuildingToObject: attach, validateCollectiveBuildingAttachment: async () => undefined });
    const result = await mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, apply_to_object_map: true, association_type: 'join_collective', collective_id: 'estate', source_kind: 'collective', source_id: 'estate', source_selection_key: 'selection:estate:saved-point' });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(rows.BuildingDossierLink.find((link) => link.dossier_id === 'o2')).toMatchObject({ selection_key: 'selection:o2:linked-estate-saved-point' });
    expect(result.object_version).toBe(2);
  });

  it('lists additional customers objects without expanding the primary commercial scope', async () => {
    const { backend } = fixture({ ObjectCustomerResponsibility: [
      { id: 'active', object_id: 'o1', customer_id: 'c2', role: 'joint_responsible', status: 'active' },
      { id: 'future', object_id: 'o1', customer_id: 'c2', role: 'manager', status: 'active', starts_on: '2080-01-01' },
    ] });
    const current = await backend.read({}, admin, 'list_customer_shared_objects', { customer_id: 'c2' });
    expect(current.items).toHaveLength(1);
    expect(current.items[0]).toMatchObject({ id: 'o1', customer_id: 'c1', active_now: true, responsibility_id: 'active' });
    const all = await backend.read({}, admin, 'list_customer_shared_objects', { customer_id: 'c2', include_inactive: true });
    expect(all.items).toHaveLength(2);
    expect(all.items.find((row) => row.responsibility_id === 'future').active_now).toBe(false);
  });

  it('does not expose map mutation receipts through collective dossier reads', async () => {
    const { backend } = fixture({ Collectief: [{ id: 'estate', map_mutation_receipt: { private: 'test' }, mutation_key_hash: 'hidden' }] });
    const result = await backend.read({}, admin, 'get_collective_dossier', { collective_id: 'estate' });
    expect(result.collective.map_mutation_receipt).toBeUndefined();
    expect(result.collective.mutation_key_hash).toBeUndefined();
  });

  it('allows historical object context reads but blocks writes on archived objects and customers', async () => {
    const { rows, backend, mutate } = fixture({ CollectiveMembership: [{ id: 'historical', collective_id: 'old', object_id: 'o1', status: 'inactive' }] });
    rows.SurveillanceObject[0].status = 'archived';
    rows.Customer[0].status = 'archived';
    const result = await backend.read({}, admin, 'get_object_collective_context', { object_id: 'o1' });
    expect(result.object_status).toBe('archived');
    expect(result.memberships[0]).toMatchObject({ id: 'historical', status: 'inactive' });
    await expect(mutate('upsert_object_customer_responsibility', { object_id: 'o1', customer_id: 'c2' })).rejects.toMatchObject({ status: 409 });
  });

  it('does not suggest or block buildings from sources requiring location review', async () => {
    const { rows, backend } = fixture({ Collectief: [{ id: 'estate', map_geometry_status: 'needs_review', building_polygon_geojson: bag() }] });
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    rows.SurveillanceObject[0].map_geometry_status = 'needs_review';
    const result = await backend.validateObjectBuildingSharing({}, rows.SurveillanceObject[1], bag(), []);
    expect(result.matches).toHaveLength(0);
  });

  it('preflights reverse map attachment before creating groups or relations', async () => {
    const attach = vi.fn();
    const validate = vi.fn(async () => { throw new ApiError(409, 'Object was updated'); });
    const { rows, mutate } = fixture({ Collectief: [{ id: 'estate', name: 'Estate', building_polygon_geojson: bag(), version: 1 }] }, {
      applyCollectiveBuildingToObject: attach, validateCollectiveBuildingAttachment: validate,
    });
    await expect(mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, apply_to_object_map: true, association_type: 'shared_building', name: 'Shared', source_kind: 'collective', source_id: 'estate', source_selection_key: 'bag:pand-1' })).rejects.toMatchObject({ status: 409 });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(attach).not.toHaveBeenCalled();
    expect(rows.Collectief).toHaveLength(1);
    expect(rows.BuildingDossierLink).toHaveLength(0);
    expect(rows.PhysicalBuilding).toHaveLength(0);
    expect(rows.CollectiveMembership).toHaveLength(0);
  });

  it('does not treat future or expired participation as current shared occupancy', async () => {
    const { rows, backend, mutate } = fixture({
      Collectief: [{ id: 'shared', name: 'Shared', collectief_type: 'bedrijfsverzamelgebouw', building_polygon_geojson: bag() }],
      CollectiveMembership: [{ id: 'old-member', collective_id: 'shared', object_id: 'o1', status: 'active', ends_on: '2000-01-01', version: 1 }, { id: 'future-member', collective_id: 'shared', object_id: 'o2', status: 'active', starts_on: '2080-01-01', version: 1 }],
    });
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    const result = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], bag(), []);
    expect(result.matches[0]).toMatchObject({ shared_building_required: true, collectives: [{ id: 'shared', member: false }] });
    await mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'object', source_id: 'o1', source_selection_key: 'bag:pand-1', collective_id: 'shared' });
    const confirmed = await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], bag(), []);
    expect(confirmed.matches[0].shared_building_required).toBe(false);
    expect(rows.CollectiveMembership[0].ends_on).toBeNull();
    expect(rows.CollectiveMembership[1].starts_on).not.toBe('2080-01-01');
  });

  it('ignores archived customer objects as new association sources', async () => {
    const { rows, backend, mutate } = fixture();
    rows.Customer[0].status = 'archived';
    rows.SurveillanceObject[0].building_polygon_geojson = bag();
    expect((await backend.inspectBuildingAssociations({}, rows.SurveillanceObject[1], bag(), [])).matches).toHaveLength(0);
    await expect(mutate('confirm_building_association', { object_id: 'o2', expected_version: 1, confirmed: true, association_type: 'shared_building', source_kind: 'object', source_id: 'o1', source_selection_key: 'bag:pand-1', name: 'Shared' })).rejects.toMatchObject({ status: 409 });
    expect(rows.CollectiveMembership).toHaveLength(0);
  });
});

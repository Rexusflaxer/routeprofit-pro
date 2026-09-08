/** Backoffice-only collective configuration. No operational, invoice or portal consumers. */
type Row = Record<string, any>;
type Dependencies = {
  entity: (base44: Row, name: string) => any;
  ApiError: new (status: number, message: string, details?: Row) => Error;
  casUpdate: (base44: Row, entity: string, row: Row, version: number, patch: Row) => Promise<Row>;
  withMutationLock: (base44: Row, body: Row, user: Row, fn: (reservation?: Row) => Promise<Row>) => Promise<Row>;
  validateCollectiveBuildingAttachment?: (base44: Row, user: Row, object: Row, source: Row, sourceSelectionKey: string, body: Row, reservation?: Row) => Promise<unknown>;
  applyCollectiveBuildingToObject?: (base44: Row, user: Row, object: Row, source: Row, sourceSelectionKey: string, body: Row, reservation?: Row) => Promise<Row>;
};

export const COLLECTIVE_READ_ACTIONS = new Set([
  'list_collective_dossiers', 'get_collective_dossier', 'get_object_collective_context', 'list_building_associations', 'list_customer_shared_objects',
]);
export const COLLECTIVE_MUTATION_ACTIONS = new Set([
  'create_collective_dossier', 'update_collective_dossier', 'upsert_collective_membership',
  'upsert_object_customer_responsibility', 'upsert_collective_dossier_record', 'confirm_building_association',
]);

const TYPES = ['regio_groep', 'woonwijk', 'bedrijventerrein', 'bedrijfsverzamelgebouw'];
const SECTIONS: Record<string, string[]> = {
  tasks: ['task_type', 'execution_mode', 'security_plan_id', 'target_scope', 'target_object_ids', 'target_building_ids', 'requesting_customer_id', 'days', 'start_time', 'end_time', 'recurrence', 'instructions'],
  'security-plan': ['purpose', 'risks', 'instructions', 'emergency_procedure'],
  modules: ['module_type', 'enabled', 'instructions'],
  handbook: ['content'],
  'floor-plan': ['file_url', 'file_name', 'description'],
  'warning-addresses': ['contact_name', 'phone', 'email', 'priority', 'instructions'],
  relationships: ['organization_name', 'relation_type', 'phone', 'email', 'notes'],
  keys: ['set_number', 'key_number', 'quantity', 'storage_location', 'instructions'],
  installations: ['installation_type', 'brand', 'model', 'location', 'reference', 'instructions'],
};
const ver = (row: Row) => Number.isInteger(row?.version) && row.version > 0 ? row.version : 1;
const active = (row: Row) => row && !['archived', 'inactive', 'deleted'].includes(row.status) && !row.archived_at;
const todayInAmsterdam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const currentMembership = (row: Row) => {
  const today = todayInAmsterdam();
  return active(row) && (!row.starts_on || row.starts_on <= today) && (!row.ends_on || row.ends_on >= today);
};
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function features(value: any): Row[] {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  return value?.type === 'FeatureCollection' ? value.features || [] : value?.type === 'Feature' ? [value] : [];
}
function containsRing(point: number[], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [px, py] = ring[j];
    if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
function contains(point: number[], geometry: Row) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some((rings: number[][][]) => rings?.[0]?.length >= 4 && containsRing(point, rings[0]) && !rings.slice(1).some((ring) => containsRing(point, ring)));
}
function buildingRefs(record: Row): Row[] {
  const bag = features(record.building_polygon_geojson).flatMap((feature) => {
    const props = feature.properties || {};
    if (props.source !== 'pdok_bag') return [];
    const sourceId = String(props.source_feature_id || feature.id || '').trim();
    return sourceId ? [{ building_key: `bag:${sourceId}`, bag_id: sourceId, source: 'pdok_bag', geometry: feature.geometry }] : [];
  });
  const points = (Array.isArray(record.building_selection_points) ? record.building_selection_points : []).flatMap((point: Row) => {
    if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude) || !point.id) return [];
    return [{ building_key: `selection:${record.id}:${point.id}`, source: 'user_selected', point_id: point.id, longitude: point.longitude, latitude: point.latitude }];
  });
  return [...bag, ...points];
}
function matchesBuilding(a: Row, b: Row) {
  if (a.building_key === b.building_key) return true;
  if (a.source === 'pdok_bag' && b.source === 'pdok_bag') return a.bag_id === b.bag_id;
  if (a.source === 'user_selected' && b.geometry) return contains([a.longitude, a.latitude], b.geometry);
  if (b.source === 'user_selected' && a.geometry) return contains([b.longitude, b.latitude], a.geometry);
  // Exact user-selected point only: nearby coordinates are not proof of the same building.
  return a.source === 'user_selected' && b.source === 'user_selected'
    && a.longitude === b.longitude && a.latitude === b.latitude;
}

export function createCollectiveDossierHandlers(deps: Dependencies) {
  const { entity, ApiError, casUpdate, withMutationLock } = deps;
  const fail = (status: number, message: string, details?: Row): never => { throw new ApiError(status, message, details); };
  const text = (value: any, field: string, required = false, limit = 500): string => {
    if (value == null && !required) return '';
    if (typeof value !== 'string') return fail(400, `${field} moet tekst zijn`);
    const result = value.trim();
    if ((required && !result) || result.length > limit) return fail(400, `${field} is verplicht of te lang`);
    return result;
  };
  const choose = (value: any, field: string, options: string[], fallback?: string) => {
    const result = value == null || value === '' ? fallback : value;
    return options.includes(result) ? result : fail(400, `${field} is ongeldig`);
  };
  const guard = (user: Row) => { if (!user?.id || user.role !== 'admin') fail(403, 'Alleen beheerders hebben toegang tot collectiefinrichting'); };
  const list = async (base44: Row, name: string, filter?: Row) => {
    const rows = filter ? await entity(base44, name).filter(filter, '-created_date', 5001) : await entity(base44, name).list('-created_date', 5001);
    if (rows.length > 5000) fail(422, 'Te veel records voor een veilige collectiefcontrole; verfijn de inrichting');
    return rows;
  };
  const get = async (base44: Row, name: string, id: string) => {
    let row;
    try { row = await entity(base44, name).get(id); } catch (error) {
      if ((error as any)?.status !== 404 && (error as any)?.response?.status !== 404) throw error;
    }
    return row || fail(404, `${name} niet gevonden`);
  };
  const usable = async (base44: Row, name: string, id: string) => {
    const row = await get(base44, name, text(id, `${name}_id`, true));
    return active(row) ? row : fail(409, 'Een gearchiveerd dossier kan niet worden gekoppeld');
  };
  const customerForObject = async (base44: Row, id: string) => {
    const object = await usable(base44, 'SurveillanceObject', id);
    await usable(base44, 'Customer', object.customer_id);
    return object;
  };
  const assertVersion = (row: Row | null, expected: number) => {
    const current = row ? ver(row) : 0;
    if (expected !== current) fail(409, 'Het dossier is ondertussen gewijzigd. Uw lokale wijzigingen blijven behouden.', { current_version: current, expected_version: expected, retryable: true });
  };
  const date = (value: any, field: string) => {
    if (!value) return null;
    const normalized = text(value, field, true, 10);
    const parsed = new Date(normalized);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) fail(400, `${field} is ongeldig`);
    return normalized;
  };
  const publicRow = (row: Row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('mutation_') && !key.startsWith('creation_') && !key.startsWith('customer_platform_') && !['idempotency_key', 'map_mutation_receipt'].includes(key)));

  async function checkParent(base44: Row, collectiveId: string, parentId: string | null) {
    let current = parentId;
    const seen = new Set([collectiveId]);
    while (current) {
      if (seen.has(current)) fail(409, 'Een collectief kan niet onder zichzelf of een eigen subcollectief vallen');
      seen.add(current);
      const parent = await usable(base44, 'Collectief', current);
      current = parent.parent_collectief_id;
    }
  }

  async function configuration(base44: Row, body: Row, prior?: Row) {
    const patch: Row = {
      name: text(body.name ?? prior?.name, 'Naam', true, 180),
      collectief_type: choose(body.collectief_type ?? prior?.collectief_type, 'Type', TYPES, 'bedrijventerrein'),
      parent_collectief_id: text(Object.hasOwn(body, 'parent_collectief_id') ? body.parent_collectief_id : prior?.parent_collectief_id, 'Bovenliggend collectief') || null,
      address: text(body.address ?? prior?.address, 'Adres'),
      notes: text(body.notes ?? prior?.notes, 'Opmerkingen', false, 12000),
    };
    // Legacy customer_id remains commercial scope. The manager is an independent dossier role.
    patch.manager_customer_id = Object.hasOwn(body, 'manager_customer_id')
      ? text(body.manager_customer_id, 'Beherende klant') || null : Object.hasOwn(prior || {}, 'manager_customer_id') ? prior?.manager_customer_id : prior?.customer_id ?? null;
    if (patch.manager_customer_id) await usable(base44, 'Customer', patch.manager_customer_id);
    await checkParent(base44, prior?.id || '', patch.parent_collectief_id);
    for (const field of ['street_name', 'house_number', 'house_number_addition', 'postal_code', 'city', 'country_code', 'country_name', 'bag_address_id', 'geocoding_status']) {
      if (Object.hasOwn(body, field)) patch[field] = text(body[field], field);
    }
    if (Object.hasOwn(patch, 'geocoding_status')) patch.geocoding_status = choose(patch.geocoding_status, 'Adrescontrole', ['unverified', 'verified', 'manual'], 'unverified');
    for (const [field, bound] of [['longitude', 180], ['latitude', 90]] as const) {
      if (!Object.hasOwn(body, field)) continue;
      const value = body[field];
      if (value != null && (!Number.isFinite(value) || Math.abs(value) > bound)) fail(400, 'De kaartlocatie is ongeldig');
      patch[field] = value;
    }
    if (prior && ['latitude', 'longitude', 'address', 'bag_address_id'].some((key) => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (prior[key] ?? null)) && prior.map_geometry_status === 'configured') {
      patch.map_geometry_status = 'needs_review';
      patch.map_geometry_review_reason = 'Adres of locatie gewijzigd; controleer de opgeslagen kaartinrichting.';
    }
    return patch;
  }

  async function dataForSection(base44: Row, collectiveId: string, section: string, value: any) {
    if (!SECTIONS[section]) fail(400, 'Onbekend dossieronderdeel');
    if (value == null) value = {};
    if (typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 32000) fail(400, 'Dossierinhoud is ongeldig of te groot');
    const result: Row = {};
    for (const [key, entry] of Object.entries(value)) {
      if (section === 'tasks' && key === 'operational' && entry === false) continue;
      if (!SECTIONS[section].includes(key)) fail(400, `Onbekende instelling: ${key}`);
      if (['target_object_ids', 'target_building_ids'].includes(key)) {
        if (!Array.isArray(entry) || entry.length > 500 || entry.some((id) => typeof id !== 'string' || !id.trim())) fail(400, 'Doelselectie is ongeldig');
        result[key] = [...new Set(entry)];
      } else if (key === 'days') {
        if (!Array.isArray(entry) || entry.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) fail(400, 'Weekdagen zijn ongeldig');
        result[key] = [...new Set(entry)];
      } else if (key === 'enabled') {
        if (typeof entry !== 'boolean') fail(400, 'Modulekeuze is ongeldig');
        result[key] = entry;
      } else if (['quantity', 'priority'].includes(key)) {
        if (!Number.isInteger(entry) || Number(entry) < 0 || Number(entry) > 10000) fail(400, `${key} is ongeldig`);
        result[key] = entry;
      } else {
        result[key] = text(entry, key, false, ['instructions', 'notes', 'content', 'purpose', 'risks', 'emergency_procedure', 'description'].includes(key) ? 12000 : 500);
      }
    }
    if (result.file_url && !/^https:\/\//i.test(result.file_url)) fail(400, 'Gebruik een beveiligde bestandslink');
    if (section === 'tasks') {
      result.target_scope = choose(result.target_scope, 'Taakdoel', ['collective', 'objects', 'buildings'], 'collective');
      if (result.target_scope === 'objects' && !result.target_object_ids?.length) fail(400, 'Selecteer minstens één deelnemend object');
      if (result.target_scope === 'buildings' && !result.target_building_ids?.length) fail(400, 'Selecteer minstens één gekoppeld gebouw');
      if (result.security_plan_id) {
        const plan = await get(base44, 'CollectiveDossierRecord', result.security_plan_id);
        if (plan.collective_id !== collectiveId || plan.section !== 'security-plan' || plan.status === 'archived') fail(400, 'Het beveiligingsplan hoort niet bij dit collectief');
      }
      for (const time of [result.start_time, result.end_time].filter(Boolean)) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400, 'Taaktijd is ongeldig');
      const members = await list(base44, 'CollectiveMembership', { collective_id: collectiveId });
      for (const id of result.target_object_ids || []) if (!members.some((member: Row) => member.object_id === id && active(member))) fail(400, 'Een taakdoel moet een actieve deelnemer van dit collectief zijn');
      const links = await list(base44, 'BuildingDossierLink', { dossier_kind: 'collective', dossier_id: collectiveId });
      for (const id of result.target_building_ids || []) if (!links.some((link: Row) => link.building_id === id && active(link))) fail(400, 'Een taakgebouw moet bij dit collectief horen');
      if (result.requesting_customer_id) {
        await usable(base44, 'Customer', result.requesting_customer_id);
        const collective = await get(base44, 'Collectief', collectiveId);
        const memberObjects = await Promise.all(members.filter(active).map((member: Row) => customerForObject(base44, member.object_id)));
        const responsibilities = await list(base44, 'ObjectCustomerResponsibility');
        const manager = Object.hasOwn(collective, 'manager_customer_id') ? collective.manager_customer_id : collective.customer_id;
        const allowed = manager === result.requesting_customer_id || memberObjects.some((object: Row) => object.customer_id === result.requesting_customer_id)
          || responsibilities.some((responsibility: Row) => active(responsibility) && responsibility.customer_id === result.requesting_customer_id && memberObjects.some((object: Row) => object.id === responsibility.object_id));
        if (!allowed) fail(400, 'De opdrachtgever moet beheerder of klant van een deelnemend object zijn');
      }
      result.operational = false;
    }
    return result;
  }

  async function inspectBuildingAssociations(base44: Row, object: Row, normalizedBuildingCollection: Row | null, points: Row[] = []) {
    const subject = { ...object, building_polygon_geojson: normalizedBuildingCollection, building_selection_points: points };
    const selected = buildingRefs(subject);
    const [objects, collectives, links, buildings, memberships, customers] = await Promise.all([
      list(base44, 'SurveillanceObject'), list(base44, 'Collectief'), list(base44, 'BuildingDossierLink'), list(base44, 'PhysicalBuilding'), list(base44, 'CollectiveMembership'), list(base44, 'Customer'),
    ]);
    const activeCustomerIds = new Set(customers.filter(active).map((customer: Row) => customer.id));
    const existingLinks = links.filter((link: Row) => link.dossier_kind === 'object' && link.dossier_id === object.id && active(link));
    const matches: Row[] = [];
    for (const ref of selected) {
      const physical = buildings.filter((building: Row) => building.building_key === ref.building_key || existingLinks.some((link: Row) => link.building_id === building.id && link.selection_key === ref.building_key));
      const linked = links.filter((link: Row) => active(link) && physical.some((building: Row) => building.id === link.building_id));
      const matchingObjects = objects.filter((candidate: Row) => active(candidate) && activeCustomerIds.has(candidate.customer_id) && candidate.map_geometry_status !== 'needs_review' && candidate.id !== object.id &&
        (buildingRefs(candidate).some((other) => matchesBuilding(ref, other)) || linked.some((link: Row) => link.dossier_kind === 'object' && link.dossier_id === candidate.id)));
      const matchingCollectives = collectives.filter((candidate: Row) => active(candidate) && candidate.map_geometry_status !== 'needs_review' && candidate.id !== object.id &&
        (buildingRefs(candidate).some((other) => matchesBuilding(ref, other)) || linked.some((link: Row) => link.dossier_kind === 'collective' && link.dossier_id === candidate.id)));
      const groups = matchingCollectives.filter((collective: Row) => collective.collectief_type === 'bedrijfsverzamelgebouw');
      const shared = groups.find((group: Row) => [object.id, ...matchingObjects.map((candidate: Row) => candidate.id)].every((id) => memberships.some((membership: Row) => membership.collective_id === group.id && membership.object_id === id && currentMembership(membership))));
      if (matchingObjects.length || matchingCollectives.length) matches.push({
        selection_key: ref.building_key,
        physical_building_id: physical[0]?.id || null,
        objects: matchingObjects.map((candidate: Row) => ({ id: candidate.id, name: candidate.name, customer_id: candidate.customer_id, source_selection_key: buildingRefs(candidate).find((other) => matchesBuilding(ref, other))?.building_key || linked.find((link: Row) => link.dossier_kind === 'object' && link.dossier_id === candidate.id)?.selection_key })),
        collectives: matchingCollectives.map((candidate: Row) => ({ id: candidate.id, name: candidate.name, collectief_type: candidate.collectief_type, source_selection_key: buildingRefs(candidate).find((other) => matchesBuilding(ref, other))?.building_key || linked.find((link: Row) => link.dossier_kind === 'collective' && link.dossier_id === candidate.id)?.selection_key, member: memberships.some((member: Row) => member.collective_id === candidate.id && member.object_id === object.id && currentMembership(member)) })),
        shared_collective_id: shared?.id || null,
        shared_building_required: matchingObjects.length > 0 && !shared,
      });
    }
    const nearbySelectionPoints = [...objects.map((row: Row) => ({ row, kind: 'object' })), ...collectives.map((row: Row) => ({ row, kind: 'collective' }))]
      .filter(({ row, kind }) => row.id !== object.id && active(row) && (kind === 'collective' || activeCustomerIds.has(row.customer_id)) && row.map_geometry_status !== 'needs_review')
      .flatMap(({ row, kind }) => buildingRefs(row).filter((ref) => ref.source === 'user_selected').map((ref) => ({ dossier_kind: kind, dossier_id: row.id, name: row.name, customer_id: row.customer_id || null, collectief_type: row.collectief_type || null, selection_key: ref.building_key, longitude: ref.longitude, latitude: ref.latitude })))
      .filter((point) => {
        if (!Number.isFinite(object.latitude) || !Number.isFinite(object.longitude)) return selected.some((ref) => ref.source === 'user_selected' && Math.hypot((point.longitude - ref.longitude) * Math.cos(ref.latitude * Math.PI / 180), point.latitude - ref.latitude) * 111320 <= 1000);
        return Math.hypot((point.longitude - object.longitude) * Math.cos(object.latitude * Math.PI / 180), point.latitude - object.latitude) * 111320 <= 1000;
      });
    return {
      matches,
      nearby_selection_points: nearbySelectionPoints,
      // Only explicit saved click points; the browser may correlate with a clicked native contour in memory.
      // A correlation is a proposal requiring confirmation, never a trusted nearest-building assignment.
      unlinked_candidates: nearbySelectionPoints.map((point) => ({ source_kind: point.dossier_kind, source_id: point.dossier_id, name: point.name, customer_id: point.customer_id, source_selection_key: point.selection_key, longitude: point.longitude, latitude: point.latitude })),
    };
  }

  async function validateObjectBuildingSharing(base44: Row, object: Row, collection: Row | null, points: Row[] = []) {
    const result = await inspectBuildingAssociations(base44, object, collection, points);
    const previous = buildingRefs(object);
    const selected = buildingRefs({ ...object, building_polygon_geojson: collection, building_selection_points: points });
    const blocking = result.matches.filter((match) => match.shared_building_required && !previous.some((prior) => selected.some((next) => next.building_key === match.selection_key && matchesBuilding(prior, next))));
    if (blocking.length) fail(409, 'Dit gebouw is al gekoppeld aan een ander object. Maak of kies eerst een bedrijfsverzamelgebouw.', { code: 'SHARED_BUILDING_REQUIRED', matches: blocking });
    return result;
  }

  async function registerCanonicalBuildings(base44: Row, kind: string, id: string, validatedRecord: Row) {
    if (!['object', 'collective'].includes(kind)) fail(400, 'Onbekend dossierdoel');
    const refs = buildingRefs({ ...validatedRecord, id });
    const existing = await list(base44, 'BuildingDossierLink', { dossier_kind: kind, dossier_id: id });
    const keep = new Set<string>();
    for (const ref of refs) {
      // An explicit shared link can canonicalize distinct user-selected points without a fuzzy location guess.
      const bound = existing.find((link: Row) => link.selection_key === ref.building_key && active(link));
      let building = bound ? await get(base44, 'PhysicalBuilding', bound.building_id) : (await list(base44, 'PhysicalBuilding', { building_key: ref.building_key }))[0];
      if (!building) building = await entity(base44, 'PhysicalBuilding').create({
        building_key: ref.building_key, source: ref.source, bag_id: ref.bag_id || null,
        selection_object_id: ref.source === 'user_selected' ? id : null,
        selection_point_id: ref.point_id || null,
        longitude: ref.longitude ?? null, latitude: ref.latitude ?? null, status: 'active', version: 1,
      });
      let link = existing.find((candidate: Row) => candidate.building_id === building.id && candidate.selection_key === ref.building_key);
      if (!link) link = await entity(base44, 'BuildingDossierLink').create({ building_id: building.id, dossier_kind: kind, dossier_id: id, selection_key: ref.building_key, status: 'active', map_managed: true, version: 1 });
      else if (!active(link)) link = await casUpdate(base44, 'BuildingDossierLink', link, ver(link), { status: 'active' });
      keep.add(link.id);
    }
    for (const link of existing) if (active(link) && link.map_managed !== false && !keep.has(link.id)) await casUpdate(base44, 'BuildingDossierLink', link, ver(link), { status: 'inactive' });
  }

  async function read(base44: Row, user: Row, action: string, body: Row) {
    guard(user);
    if (action === 'list_collective_dossiers') {
      const [items, customers, objects] = await Promise.all([list(base44, 'Collectief'), list(base44, 'Customer'), list(base44, 'SurveillanceObject')]);
      return { items: items.map(publicRow), customers: customers.map((row: Row) => ({ id: row.id, name: row.name, status: row.status })), objects: objects.map((row: Row) => ({ id: row.id, name: row.name, customer_id: row.customer_id, object_code: row.object_code, status: row.status, version: ver(row) })) };
    }
    if (action === 'get_collective_dossier') {
      const collective = await get(base44, 'Collectief', text(body.collective_id, 'Collectief', true));
      const [memberships, collectives, customers, objects, records, building_links, object_customers, logbook, legacy_tasks] = await Promise.all([
        list(base44, 'CollectiveMembership', { collective_id: collective.id }), list(base44, 'Collectief'), list(base44, 'Customer'), list(base44, 'SurveillanceObject'),
        list(base44, 'CollectiveDossierRecord', { collective_id: collective.id }), list(base44, 'BuildingDossierLink', { dossier_kind: 'collective', dossier_id: collective.id }),
        list(base44, 'ObjectCustomerResponsibility'), list(base44, 'CollectiveDossierEvent', { collective_id: collective.id }), list(base44, 'Task', { collectief_id: collective.id }),
      ]);
      const descendants = new Set<string>();
      let frontier = [collective.id];
      while (frontier.length) {
        const next = collectives.filter((item: Row) => frontier.includes(item.parent_collectief_id) && item.id !== collective.id && !descendants.has(item.id));
        frontier = next.map((item: Row) => item.id);
        frontier.forEach((id: string) => descendants.add(id));
      }
      const allMembers = descendants.size ? await list(base44, 'CollectiveMembership') : [];
      const enrich = (membership: Row) => {
        const object = objects.find((row: Row) => row.id === membership.object_id);
        const customer = customers.find((row: Row) => row.id === object?.customer_id);
        return { ...publicRow(membership), object: object ? { id: object.id, name: object.name, customer_id: object.customer_id, object_code: object.object_code, status: object.status, version: ver(object) } : null, customer: customer ? { id: customer.id, name: customer.name } : null };
      };
      return {
        collective: publicRow(collective), memberships: memberships.map(enrich),
        indirect_memberships: allMembers.filter((member: Row) => descendants.has(member.collective_id)).map((member: Row) => ({ ...enrich(member), collective_name: collectives.find((item: Row) => item.id === member.collective_id)?.name })),
        children: collectives.filter((item: Row) => item.parent_collectief_id === collective.id).map(publicRow),
        customers: customers.map((row: Row) => ({ id: row.id, name: row.name, status: row.status })),
        objects: objects.map((row: Row) => ({ id: row.id, name: row.name, customer_id: row.customer_id, object_code: row.object_code, status: row.status, version: ver(row) })),
        records: records.map(publicRow), building_links: building_links.map(publicRow), object_customers: object_customers.filter((row: Row) => memberships.some((membership: Row) => membership.object_id === row.object_id)).map(publicRow),
        logbook: logbook.map(publicRow), legacy_tasks: legacy_tasks.map((row: Row) => ({ id: row.id, name: row.name || row.title || row.task_type, task_type: row.task_type, readonly: true })),
      };
    }
    if (action === 'get_object_collective_context') {
      // Historical dossier inspection is allowed for admins; all writers still use customerForObject.
      const object = await get(base44, 'SurveillanceObject', text(body.object_id, 'Object', true));
      await get(base44, 'Customer', object.customer_id);
      const [memberships, collectives, responsibilities, customers, links] = await Promise.all([
        list(base44, 'CollectiveMembership', { object_id: object.id }), list(base44, 'Collectief'), list(base44, 'ObjectCustomerResponsibility', { object_id: object.id }), list(base44, 'Customer'), list(base44, 'BuildingDossierLink', { dossier_kind: 'object', dossier_id: object.id }),
      ]);
      return { object_id: object.id, object_version: ver(object), object_status: object.status || 'active', primary_customer_id: object.customer_id, memberships: memberships.map(publicRow), collectives: collectives.map(publicRow), responsibilities: responsibilities.map(publicRow), customers: customers.map((row: Row) => ({ id: row.id, name: row.name, status: row.status })), building_links: links.map(publicRow) };
    }
    if (action === 'list_customer_shared_objects') {
      const customer = await get(base44, 'Customer', text(body.customer_id, 'Klant', true));
      const [responsibilities, objects] = await Promise.all([
        list(base44, 'ObjectCustomerResponsibility', { customer_id: customer.id }), list(base44, 'SurveillanceObject'),
      ]);
      const today = todayInAmsterdam();
      const items = responsibilities.flatMap((responsibility: Row) => {
        const object = objects.find((row: Row) => row.id === responsibility.object_id);
        if (!object || object.customer_id === customer.id) return [];
        const current = active(customer) && active(object) && active(responsibility) && (!responsibility.starts_on || responsibility.starts_on <= today) && (!responsibility.ends_on || responsibility.ends_on >= today);
        if (!current && body.include_inactive !== true) return [];
        return [{ id: object.id, name: object.name, object_code: object.object_code, customer_id: object.customer_id, status: object.status, version: ver(object), responsibility_id: responsibility.id, responsibility_version: ver(responsibility), role: responsibility.role, responsibility_status: responsibility.status, starts_on: responsibility.starts_on || null, ends_on: responsibility.ends_on || null, active_now: current }];
      });
      return { customer_id: customer.id, items };
    }
    if (action === 'list_building_associations') {
      const object = await customerForObject(base44, text(body.object_id, 'Object', true));
      // Candidate geometry is resolved/validated by the existing map API, never accepted by this action.
      return inspectBuildingAssociations(base44, object, object.building_polygon_geojson, object.building_selection_points || []);
    }
    return fail(400, 'Onbekende collectiefactie');
  }

  async function mutate(base44: Row, user: Row, action: string, body: Row, expectedVersion: number, idempotencyKey: string) {
    guard(user);
    if (!COLLECTIVE_MUTATION_ACTIONS.has(action)) fail(400, 'Onbekende collectiefmutatie');
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) fail(400, 'expected_version is verplicht');
    text(idempotencyKey, 'idempotency_key', true, 180);
    const hash = await digest([user.id, idempotencyKey]);
    const fingerprint = await digest([action, Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'idempotency_key'))]);
    return withMutationLock(base44, { ...body, idempotency_key: idempotencyKey }, user, async (reservation) => {
      let receipt = (await list(base44, 'CollectiveMutationReceipt', { mutation_key_hash: hash }))[0];
      if (receipt && (receipt.request_fingerprint !== fingerprint || receipt.actor_user_id !== user.id || receipt.action !== action)) fail(409, 'Deze verzoeksleutel is al voor een andere wijziging gebruikt');
      if (receipt?.status === 'completed') return { ...receipt.result, replayed: true };
      if (!receipt) receipt = await entity(base44, 'CollectiveMutationReceipt').create({ mutation_key_hash: hash, request_fingerprint: fingerprint, actor_user_id: user.id, action, status: 'pending', version: 1 });
      const marker = { mutation_key_hash: hash, mutation_fingerprint: fingerprint };
      const marked = (row: Row) => row?.mutation_key_hash === hash && row?.mutation_fingerprint === fingerprint;
      const create = async (name: string, data: Row, suffix = '') => {
        const key = `${hash}${suffix}`;
        const existing = (await list(base44, name, { creation_key: key }))[0];
        return existing || entity(base44, name).create({ ...data, ...marker, creation_key: key, version: 1 });
      };
      const save = async (name: string, row: Row, data: Row, expected = expectedVersion) => {
        if (marked(row)) return row;
        assertVersion(row, expected);
        return casUpdate(base44, name, row, expected, { ...data, ...marker });
      };
      let result: Row;
      if (action === 'create_collective_dossier') {
        if (expectedVersion !== 0) fail(409, 'Een nieuw collectief heeft nog geen versie');
        const collective = await create('Collectief', { ...await configuration(base44, body), customer_id: null, object_ids: [], status: 'active', dossier_version: 1 });
        result = { collective_id: collective.id, resource_id: collective.id, version: ver(collective) };
      } else if (action === 'update_collective_dossier') {
        const collective = await get(base44, 'Collectief', text(body.collective_id, 'Collectief', true));
        const updated = await save('Collectief', collective, await configuration(base44, body, collective));
        result = { collective_id: collective.id, resource_id: collective.id, version: ver(updated) };
      } else if (action === 'upsert_collective_membership') {
        const collective = await usable(base44, 'Collectief', text(body.collective_id, 'Collectief', true));
        const object = await customerForObject(base44, text(body.object_id, 'Object', true));
        const previous = body.membership_id ? await get(base44, 'CollectiveMembership', body.membership_id)
          : (await list(base44, 'CollectiveMembership', { collective_id: collective.id, object_id: object.id }))[0];
        if (previous && (previous.collective_id !== collective.id || previous.object_id !== object.id)) fail(403, 'De deelnemer hoort niet bij dit dossier');
        const starts = date(body.starts_on, 'Begindatum'), ends = date(body.ends_on, 'Einddatum');
        if (starts && ends && ends < starts) fail(400, 'De einddatum ligt voor de begindatum');
        const data = { collective_id: collective.id, object_id: object.id, status: choose(body.status, 'Deelnamestatus', ['active', 'inactive'], 'active'), starts_on: starts, ends_on: ends };
        if (!previous) assertVersion(null, expectedVersion);
        const row = previous ? await save('CollectiveMembership', previous, data) : await create('CollectiveMembership', data);
        result = { collective_id: collective.id, object_id: object.id, resource_id: row.id, version: ver(row) };
      } else if (action === 'upsert_object_customer_responsibility') {
        const object = await customerForObject(base44, text(body.object_id, 'Object', true));
        const customer = await usable(base44, 'Customer', text(body.customer_id, 'Klant', true));
        if (object.customer_id === customer.id) fail(400, 'Deze klant is al de primaire klant van het object');
        const previous = body.responsibility_id ? await get(base44, 'ObjectCustomerResponsibility', body.responsibility_id)
          : (await list(base44, 'ObjectCustomerResponsibility', { object_id: object.id, customer_id: customer.id }))[0];
        if (previous && (previous.object_id !== object.id || previous.customer_id !== customer.id)) fail(403, 'De klantkoppeling hoort niet bij dit object');
        const starts = date(body.starts_on, 'Begindatum'), ends = date(body.ends_on, 'Einddatum');
        if (starts && ends && ends < starts) fail(400, 'De einddatum ligt voor de begindatum');
        const data = { object_id: object.id, customer_id: customer.id, role: choose(body.role, 'Verantwoordelijkheid', ['joint_responsible', 'manager', 'client'], 'joint_responsible'), status: choose(body.status, 'Status', ['active', 'inactive'], 'active'), starts_on: starts, ends_on: ends, notes: text(body.notes, 'Toelichting', false, 12000), billing_enabled: false, report_access_enabled: false, key_access_enabled: false };
        if (!previous) assertVersion(null, expectedVersion);
        const row = previous ? await save('ObjectCustomerResponsibility', previous, data) : await create('ObjectCustomerResponsibility', data);
        result = { object_id: object.id, resource_id: row.id, version: ver(row) };
      } else if (action === 'upsert_collective_dossier_record') {
        const collective = await usable(base44, 'Collectief', text(body.collective_id, 'Collectief', true));
        const section = text(body.section, 'Dossieronderdeel', true);
        const previous = body.record_id ? await get(base44, 'CollectiveDossierRecord', body.record_id) : null;
        if (previous && (previous.collective_id !== collective.id || previous.section !== section)) fail(403, 'De registratie hoort niet bij dit dossieronderdeel');
        const status = choose(body.status, 'Status', ['draft', 'active', 'archived'], 'draft');
        const data = { collective_id: collective.id, section, title: text(body.title, 'Naam', true, 180), description: text(body.description, 'Omschrijving', false, 12000), data: await dataForSection(base44, collective.id, section, body.data), status: section === 'tasks' && status !== 'archived' ? 'draft' : status, operational: false, updated_by_user_id: user.id, updated_at: new Date().toISOString() };
        if (!previous) assertVersion(null, expectedVersion);
        const row = previous ? await save('CollectiveDossierRecord', previous, data) : await create('CollectiveDossierRecord', data);
        result = { collective_id: collective.id, resource_id: row.id, section, version: ver(row) };
      } else {
        result = await confirmAssociation(base44, user, body, expectedVersion, create, save, reservation);
      }
      // Audit and recovery intentionally contain identifiers/counts only, never geometry, keys or dossier content.
      await create('CollectiveDossierEvent', { collective_id: result.collective_id || null, object_id: result.object_id || null, actor_user_id: user.id, action, resource_id: result.resource_id, summary: summary(action), occurred_at: new Date().toISOString() }, ':event');
      receipt = await casUpdate(base44, 'CollectiveMutationReceipt', receipt, ver(receipt), { status: 'completed', result });
      return receipt.result;
    });
  }

  async function confirmAssociation(base44: Row, user: Row, body: Row, expectedVersion: number, create: (name: string, data: Row, suffix?: string) => Promise<Row>, save: (name: string, row: Row, data: Row, expected?: number) => Promise<Row>, reservation?: Row) {
    if (body.confirmed !== true) fail(400, 'Bevestig eerst de koppeling van dit gebouw');
    const mode = choose(body.association_type, 'Koppeling', ['join_collective', 'shared_building']);
    const sourceKind = choose(body.source_kind, 'Brondossier', ['object', 'collective']);
    const sourceId = text(body.source_id, 'Brondossier', true);
    const source = sourceKind === 'object' ? await customerForObject(base44, sourceId) : await usable(base44, 'Collectief', sourceId);
    if (source.map_geometry_status === 'needs_review') fail(409, 'Controleer eerst de gewijzigde kaartlocatie van het brondossier');
    const object = body.object_id ? await customerForObject(base44, text(body.object_id, 'Object', true)) : null;
    if (!object && !(mode === 'shared_building' && sourceKind === 'collective')) fail(400, 'Kies het klantobject dat wordt gekoppeld');
    const applyToObjectMap = body.apply_to_object_map === true;
    if (applyToObjectMap && (!object || sourceKind !== 'collective' || !deps.applyCollectiveBuildingToObject || !deps.validateCollectiveBuildingAttachment)) fail(400, 'Deze kaartkoppeling is niet beschikbaar');
    // The injected map writer checks CAS and its own successful-write replay marker for reverse attachments.
    if (!applyToObjectMap) assertVersion(object || source, expectedVersion);
    const key = text(body.source_selection_key, 'Gebouw', true);
    const ref = buildingRefs(source).find((candidate) => candidate.building_key === key);
    if (!ref) fail(409, 'Het gekozen gebouw staat niet meer in het brondossier');
    const targetSelectionKey = applyToObjectMap && object && ref.source === 'user_selected'
      ? `selection:${object.id}:${`linked-${source.id}-${ref.point_id}`.slice(0, 120)}`
      : text(body.target_selection_key, 'Gebouwselectie') || key;
    if (object && ref.source === 'pdok_bag' && targetSelectionKey !== ref.building_key) fail(400, 'De BAG-koppeling verwijst naar een ander gebouw');
    if (object && ref.source !== 'pdok_bag' && !targetSelectionKey.startsWith(`selection:${object.id}:`)) fail(400, 'De eigen kaartselectie hoort niet bij dit object');
    if (applyToObjectMap && object) await deps.validateCollectiveBuildingAttachment!(base44, user, object, source, key, body, reservation);
    let collective: Row;
    if (mode === 'join_collective') {
      collective = await usable(base44, 'Collectief', text(body.collective_id || (sourceKind === 'collective' ? source.id : ''), 'Collectief', true));
      if (sourceKind !== 'collective' || source.id !== collective.id) fail(400, 'Selecteer het collectief waarin dit gebouw is vastgelegd');
    } else {
      if (sourceKind === 'object' && source.id === object?.id) fail(400, 'Kies een ander bestaand object voor gedeeld gebruik');
      if (body.collective_id) {
        collective = await usable(base44, 'Collectief', body.collective_id);
        if (collective.collectief_type !== 'bedrijfsverzamelgebouw') fail(400, 'Gedeelde gebouwen vereisen een bedrijfsverzamelgebouw');
      } else {
        const parentId = text(body.parent_collectief_id ?? (sourceKind === 'collective' ? source.id : null), 'Bovenliggend collectief') || null;
        await checkParent(base44, '', parentId);
        const polygon = ref.source === 'pdok_bag' ? { type: 'FeatureCollection', features: features(source.building_polygon_geojson).filter((feature) => String(feature.properties?.source_feature_id || feature.id) === ref.bag_id) } : null;
        const points = ref.source === 'user_selected' ? (source.building_selection_points || []).filter((point: Row) => point.id === ref.point_id) : [];
        const name = text(body.name, 'Naam bedrijfsverzamelgebouw', true, 180);
        const stamp = new Date().toISOString();
        const geometryHash = await digest({ polygon, points });
        collective = await create('Collectief', {
          name, collectief_type: 'bedrijfsverzamelgebouw', parent_collectief_id: parentId, manager_customer_id: null, customer_id: null, object_ids: [], status: 'active', dossier_version: 1,
          address: source.address || '', latitude: source.latitude ?? ref.latitude ?? null, longitude: source.longitude ?? ref.longitude ?? null,
          geocoding_status: source.geocoding_status || 'unverified', bag_address_id: source.bag_address_id || null,
          building_selection_mode: 'manual', building_polygon_geojson: polygon, building_selection_points: points,
          building_labels: { [ref.source === 'pdok_bag' ? `bag:${ref.bag_id}` : `point:${ref.point_id}`]: name.slice(0, 100) }, object_area_geojson: null,
          map_geometry_status: 'configured', map_geometry_revision: 1, map_geometry_hash: geometryHash, map_geometry_updated_at: stamp, map_geometry_updated_by_user_id: user.id,
        }, ':shared-collective');
        await create('CollectiveMapGeometryRevision', {
          collective_id: collective.id, revision: 1, geometry_hash: collective.map_geometry_hash,
          building_selection_mode: 'manual', map_geometry_status: 'configured',
          building_polygon_geojson: collective.building_polygon_geojson, building_selection_points: collective.building_selection_points, building_labels: collective.building_labels, object_area_geojson: null,
          anchor_latitude: collective.latitude, anchor_longitude: collective.longitude, recorded_at: stamp, recorded_by_user_id: user.id, source_action: 'confirm_building_association',
        }, ':shared-map-revision');
      }
    }
    await registerCanonicalBuildings(base44, sourceKind, source.id, source);
    const sourceLinks = await list(base44, 'BuildingDossierLink', { dossier_kind: sourceKind, dossier_id: source.id });
    const sourceLink = sourceLinks.find((link: Row) => link.selection_key === key && active(link));
    if (!sourceLink) fail(409, 'Het gebouw kon niet veilig worden gekoppeld');
    if (mode === 'shared_building' && body.collective_id) {
      const groupLinks = (await list(base44, 'BuildingDossierLink', { dossier_kind: 'collective', dossier_id: collective.id })).filter(active);
      const groupRefs = buildingRefs(collective);
      if ((groupLinks.length && !groupLinks.some((link: Row) => link.building_id === sourceLink.building_id))
        || (!groupLinks.length && groupRefs.length && !groupRefs.some((candidate) => matchesBuilding(ref, candidate)))) {
        fail(409, 'Dit bedrijfsverzamelgebouw hoort bij een ander gebouw. Kies het passende collectief of maak een nieuw bedrijfsverzamelgebouw.');
      }
    }
    for (const [kind, id, selectionKey] of [...(object ? [['object', object.id, targetSelectionKey]] : []), ['collective', collective.id, key]]) {
      const existing = (await list(base44, 'BuildingDossierLink', { building_id: sourceLink.building_id, dossier_kind: kind, dossier_id: id })).find((link: Row) => link.selection_key === selectionKey);
      if (!existing) await create('BuildingDossierLink', { building_id: sourceLink.building_id, dossier_kind: kind, dossier_id: id, selection_key: selectionKey, status: 'active', attestation: ref.source === 'user_selected' ? 'user_confirmed' : 'source_match', map_managed: kind === 'object' }, `:link:${kind}:${id}`);
      else if (!active(existing)) await save('BuildingDossierLink', existing, { status: 'active' }, ver(existing));
    }
    if (mode === 'shared_building') {
      // The group keeps a canonical link to its own saved point as well as the attested source point.
      const ownRef = buildingRefs(collective).find((candidate) => matchesBuilding(ref, candidate));
      if (ownRef && ownRef.building_key !== key) {
        const links = await list(base44, 'BuildingDossierLink', { dossier_kind: 'collective', dossier_id: collective.id });
        if (!links.some((link: Row) => link.selection_key === ownRef.building_key && link.building_id === sourceLink.building_id && active(link))) {
          await create('BuildingDossierLink', { building_id: sourceLink.building_id, dossier_kind: 'collective', dossier_id: collective.id, selection_key: ownRef.building_key, status: 'active', attestation: 'user_confirmed', map_managed: true }, ':group-point-link');
        }
      }
    }
    let existingOccupants: Row[] = [];
    if (mode === 'shared_building') {
      const [objects, links, customers] = await Promise.all([list(base44, 'SurveillanceObject'), list(base44, 'BuildingDossierLink', { building_id: sourceLink.building_id }), list(base44, 'Customer')]);
      const activeCustomerIds = new Set(customers.filter(active).map((customer: Row) => customer.id));
      existingOccupants = objects.filter((candidate: Row) => active(candidate) && activeCustomerIds.has(candidate.customer_id) && candidate.map_geometry_status !== 'needs_review' && (
        buildingRefs(candidate).some((candidateRef) => matchesBuilding(ref, candidateRef))
        || links.some((link: Row) => link.dossier_kind === 'object' && link.dossier_id === candidate.id && active(link))
      ));
    }
    const objectIds = [...new Set([...(object ? [object.id] : []), ...existingOccupants.map((candidate: Row) => candidate.id), ...(mode === 'shared_building' && sourceKind === 'object' ? [source.id] : [])])];
    for (const id of objectIds) {
      const existing = (await list(base44, 'CollectiveMembership', { collective_id: collective.id, object_id: id }))[0];
      if (!existing) await create('CollectiveMembership', { collective_id: collective.id, object_id: id, status: 'active', starts_on: null, ends_on: null }, `:member:${id}`);
      else if (!currentMembership(existing)) await save('CollectiveMembership', existing, { status: 'active', ends_on: null, starts_on: existing.starts_on && existing.starts_on <= todayInAmsterdam() ? existing.starts_on : todayInAmsterdam() }, ver(existing));
    }
    const attachment = applyToObjectMap && object ? await deps.applyCollectiveBuildingToObject!(base44, user, object, source, key, body, reservation) : null;
    return { collective_id: collective.id, object_id: object?.id || null, resource_id: sourceLink.building_id, version: ver(collective), association_type: mode, linked_object_count: objectIds.length, ...(attachment ? { object_version: attachment.object?.version || attachment.version || attachment.object_version || null } : {}) };
  }

  function summary(action: string) {
    return ({ create_collective_dossier: 'Collectief aangemaakt', update_collective_dossier: 'Collectiefinstellingen gewijzigd', upsert_collective_membership: 'Collectiefdeelname gewijzigd', upsert_object_customer_responsibility: 'Klantverantwoordelijkheid vastgelegd; toegang en facturatie ongewijzigd', upsert_collective_dossier_record: 'Collectiefdossier bijgewerkt', confirm_building_association: 'Gebouwkoppeling expliciet bevestigd' } as Row)[action];
  }

  return { readActions: COLLECTIVE_READ_ACTIONS, mutationActions: COLLECTIVE_MUTATION_ACTIONS, read, mutate, inspectBuildingAssociations, validateObjectBuildingSharing, registerCanonicalBuildings };
}

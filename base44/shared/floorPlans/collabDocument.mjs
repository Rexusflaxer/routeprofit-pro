// Shared client/server protocol. Collections are ID-addressed; display order is
// intentionally not a write dependency for unrelated element additions.
export const COLLECTIONS = Object.freeze(['walls', 'openings', 'rooms', 'symbols', 'routes']);
const clone = value => structuredClone(value);
const EPS = .001;
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
export const equalValue = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
export const floorResourceId = floorId => `floor:${encodeURIComponent(floorId)}`;
export const resourceId = (floorId, collection, id) => `element:${encodeURIComponent(floorId)}:${collection}:${encodeURIComponent(id)}`;
export function parseResourceId(key) {
  if (key === 'document') return {kind: 'document'};
  if (typeof key !== 'string' || key.length > 800) throw new Error('Ongeldige onderdeelverwijzing.');
  const parts = key.split(':');
  const decode = part => {
    const result = decodeURIComponent(part);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(result) || encodeURIComponent(result) !== part) throw new Error('Ongeldige onderdeelverwijzing.');
    return result;
  };
  if (parts.length === 2 && parts[0] === 'floor') return {kind: 'floor', floorId: decode(parts[1])};
  if (parts.length === 4 && parts[0] === 'element' && COLLECTIONS.includes(parts[2])) return {kind: 'element', floorId: decode(parts[1]), collection: parts[2], id: decode(parts[3])};
  throw new Error('Ongeldige onderdeelverwijzing.');
}
export function resourcesConflict(left, right) {
  const a = parseResourceId(left), b = parseResourceId(right);
  return a.kind === 'document' || b.kind === 'document' || left === right || a.floorId === b.floorId && (a.kind === 'floor' || b.kind === 'floor');
}
export function coversResource(locked, requested) {
  const a = parseResourceId(locked), b = parseResourceId(requested);
  return a.kind === 'document' || locked === requested || a.kind === 'floor' && a.floorId === b.floorId;
}
export function splitDocument(document) {
  const {floors, ...metadata} = document;
  if (!Array.isArray(floors) || !floors.length) throw new Error('Het tekenbestand heeft geen verdieping.');
  const result = Object.create(null);
  result.document = {...clone(metadata), floorIds: floors.map(floor => floor.id)};
  for (const floor of floors) {
    const meta = Object.fromEntries(Object.entries(floor).filter(([key]) => !COLLECTIONS.includes(key)));
    const key = floorResourceId(floor.id); parseResourceId(key);
    if (Object.hasOwn(result, key)) throw new Error('Dubbele verdieping.');
    result[key] = clone(meta);
    for (const collection of COLLECTIONS) for (const element of floor[collection] || []) {
      const key = resourceId(floor.id, collection, element.id); parseResourceId(key);
      if (Object.hasOwn(result, key)) throw new Error('Dubbel tekenonderdeel.');
      result[key] = clone(element);
    }
  }
  return result;
}
export function diffDocuments(before, after) {
  const a = splitDocument(before), b = splitDocument(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(key => !equalValue(a[key] ?? null, b[key] ?? null))
    .map(resource_id => ({resource_id, before: a[resource_id] ?? null, after: b[resource_id] ?? null}));
}
export function validateChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 20000) throw new Error('Ongeldige wijziging.');
  const ids = new Set();
  for (const change of changes) {
    if (!change || Object.keys(change).some(key => !['resource_id', 'before', 'after'].includes(key)) || !Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after')) throw new Error('Ongeldige wijziging.');
    const parsed = parseResourceId(change.resource_id);
    if (ids.has(change.resource_id) || equalValue(change.before, change.after)) throw new Error('Dubbele of lege wijziging.');
    ids.add(change.resource_id);
    for (const value of [change.before, change.after]) {
      if (value !== null && (typeof value !== 'object' || Array.isArray(value) || parsed.id && value.id !== parsed.id || parsed.kind === 'floor' && value.id !== parsed.floorId)) throw new Error('De wijziging hoort bij een ander onderdeel.');
    }
    if (parsed.kind === 'document' && !change.after) throw new Error('Het tekenbestand kan niet worden verwijderd.');
  }
}
export function conflictingChanges(document, changes) {
  validateChanges(changes);
  const resources = splitDocument(document);
  return changes.filter(change => !equalValue(resources[change.resource_id] ?? null, change.before)).map(change => change.resource_id);
}
export function applyChanges(document, changes) {
  const conflicts = conflictingChanges(document, changes);
  if (conflicts.length) { const error = new Error('Een onderdeel is intussen gewijzigd.'); error.resourceIds = conflicts; throw error; }
  const resources = splitDocument(document);
  for (const change of changes) {
    if (change.after === null) delete resources[change.resource_id];
    else resources[change.resource_id] = clone(change.after);
  }
  const {floorIds, ...metadata} = resources.document;
  if (!Array.isArray(floorIds) || !floorIds.length || new Set(floorIds).size !== floorIds.length) throw new Error('Ongeldige verdiepingen.');
  const floors = floorIds.map(id => {
    const floor = resources[floorResourceId(id)];
    if (!floor) throw new Error('Een verdieping ontbreekt.');
    const previous = document.floors.find(item => item.id === id);
    const result = clone(floor);
    for (const collection of COLLECTIONS) {
      const elements = Object.keys(resources).filter(key => { const parsed = parseResourceId(key); return parsed.kind === 'element' && parsed.floorId === id && parsed.collection === collection; }).map(key => resources[key]);
      const order = new Map((previous?.[collection] || []).map((element, index) => [element.id, index]));
      result[collection] = elements.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.id.localeCompare(b.id));
    }
    return result;
  });
  for (const key of Object.keys(resources)) {
    const parsed = parseResourceId(key);
    if (parsed.floorId && !floorIds.includes(parsed.floorId)) throw new Error('Verwijder eerst alle onderdelen van de verdieping.');
  }
  return {...metadata, floors};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const onSegment = (p, wall) => {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy) / denominator)) : 0;
  return distance(p, {x: wall.start.x + t * dx, y: wall.start.y + t * dy}) <= EPS;
};
const crosses = (a, b) => {
  if ([a.start, a.end].some(p => onSegment(p, b)) || [b.start, b.end].some(p => onSegment(p, a))) return true;
  const cross = (p, q, r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return cross(a.start,a.end,b.start)*cross(a.start,a.end,b.end) < 0 && cross(b.start,b.end,a.start)*cross(b.start,b.end,a.end) < 0;
};
const roomEdges = room => room.polygon.map((start, index) => ({start, end: room.polygon[(index + 1) % room.polygon.length]}));
const insideRoom = (point, room) => {
  let inside = false;
  for (const edge of roomEdges(room)) {
    if (onSegment(point, edge)) return true;
    const {start:a, end:b} = edge;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
  }
  return inside;
};
const roomTouchesWall = (room, wall) => insideRoom(wall.start, room) || insideRoom(wall.end, room) || roomEdges(room).some(edge => crosses(edge, wall));
const roomsOverlap = (a, b) => a.polygon.some(point => insideRoom(point, b)) || b.polygon.some(point => insideRoom(point, a)) || roomEdges(a).some(edge => roomEdges(b).some(other => crosses(edge, other)));

/** Dependency calculation is repeated on the latest server document at commit.
 * It expands the original seeds once: recursively expanding every neighbouring
 * wall would inadvertently lock an entire connected building.
 */
export function dependencyResources(document, {resourceIds = [], changes = []} = {}) {
  resourceIds.forEach(parseResourceId);
  if (changes.length) validateChanges(changes);
  const documents = [document];
  if (changes.length) documents.push(applyChanges(document, changes));
  const output = new Set([...resourceIds, ...changes.map(change => change.resource_id)]);
  if (output.has('document')) return ['document'];
  const broadFloors = new Set([...output].map(parseResourceId).filter(item => item.kind === 'floor').map(item => item.floorId));
  const seeds = [...output].filter(key => { const parsed = parseResourceId(key); return parsed.kind !== 'element' || !broadFloors.has(parsed.floorId); });
  for (const doc of documents) for (const key of seeds) {
    const parsed = parseResourceId(key);
    if (parsed.kind !== 'element') continue;
    const floor = doc.floors.find(item => item.id === parsed.floorId);
    const element = floor?.[parsed.collection]?.find(item => item.id === parsed.id);
    if (!floor || !element) continue;
    const change = changes.find(item => item.resource_id === key);
    const labelOnly = parsed.collection === 'rooms' && change && equalValue(change.before?.polygon, change.after?.polygon);
    if (labelOnly || ['symbols', 'routes'].includes(parsed.collection)) continue;
    const affectedWalls = new Set();
    if (parsed.collection === 'walls') {
      // Includes new crossings in the after-document, not merely old joints.
      for (const wall of floor.walls) if (wall.id === element.id || crosses(element, wall)) affectedWalls.add(wall.id);
      for (const room of floor.rooms) if (roomEdges(room).some(edge => crosses(edge, element))) output.add(resourceId(floor.id, 'rooms', room.id));
    } else if (parsed.collection === 'openings') affectedWalls.add(element.wallId);
    else if (parsed.collection === 'rooms') {
      for (const wall of floor.walls) if (roomTouchesWall(element, wall)) affectedWalls.add(wall.id);
      for (const room of floor.rooms) if (room.id !== element.id && roomsOverlap(room, element)) output.add(resourceId(floor.id, 'rooms', room.id));
    }
    for (const id of affectedWalls) output.add(resourceId(floor.id, 'walls', id));
    for (const opening of floor.openings) if (affectedWalls.has(opening.wallId)) output.add(resourceId(floor.id, 'openings', opening.id));
  }
  // A broad resource subsumes its descendants and bounds large imports.
  return [...output].filter(key => { const parsed = parseResourceId(key); return parsed.kind !== 'element' || !broadFloors.has(parsed.floorId); }).sort();
}

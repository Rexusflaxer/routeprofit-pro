// Existing customer/object and saved-building authorization helpers, moved verbatim.
export type LooseRecord = Record<string, any>;

export class ApiError extends Error {
  status: number;
  details?: LooseRecord;

  constructor(status: number, message: string, details?: LooseRecord) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const OBJECT_MAP_MAX_BUILDING_FEATURES = 100;

export const OBJECT_MAP_MAX_VERTICES = 10_000;

export const OBJECT_MAP_MAX_PAYLOAD_BYTES = 750_000;

export const OBJECT_MAP_MAX_DISTANCE_METERS = 5_000;

export const OBJECT_MAP_MAX_BUILDING_AREA_SQM = 5_000_000;

export function nowIso() {
  return new Date().toISOString();
}

export function asString(value: unknown) {
  return String(value ?? '').trim();
}

export function requireString(body: LooseRecord, field: string) {
  const value = asString(body[field]);
  if (!value) throw new ApiError(400, `${field} is verplicht`);
  return value;
}

export function versionOf(record: LooseRecord) {
  const version = Number(record?.version);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

export function normalizeName(value: unknown) {
  return asString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function getEntity(base44: LooseRecord, entityName: string) {
  const handler = base44.asServiceRole.entities[entityName];
  if (!handler) throw new ApiError(500, `Entiteit ${entityName} is niet beschikbaar`);
  return handler;
}

export async function getRecord(base44: LooseRecord, entityName: string, id: string) {
  return getEntity(base44, entityName).get(id).catch(() => null);
}

export async function requireRecord(base44: LooseRecord, entityName: string, id: string, label = entityName) {
  const record = await getRecord(base44, entityName, id);
  if (!record) throw new ApiError(404, `${label} niet gevonden`);
  return record;
}

export function isNullIslandCoordinatePair(latitude: number | null, longitude: number | null) {
  return latitude === 0 && longitude === 0;
}

export async function requireCustomerObjectForMutation(base44: LooseRecord, body: LooseRecord) {
  const customerId = requireString(body, 'customer_id');
  const objectId = requireString(body, 'object_id');
  const [customer, object] = await Promise.all([
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'SurveillanceObject', objectId, 'Object'),
  ]);
  if (customer.status === 'archived') {
    throw new ApiError(409, 'Objecten van een gearchiveerde klant kunnen niet worden gewijzigd');
  }
  if (object.customer_id !== customer.id) {
    throw new ApiError(409, 'Object hoort niet bij deze klant', { object_id: object.id, customer_id: customer.id });
  }
  return { customer, object };
}

export async function requireCustomerObjectScope(base44: LooseRecord, body: LooseRecord) {
  const customerId = requireString(body, 'customer_id');
  const objectId = requireString(body, 'object_id');
  const [customer, object] = await Promise.all([
    requireRecord(base44, 'Customer', customerId, 'Klant'),
    requireRecord(base44, 'SurveillanceObject', objectId, 'Object'),
  ]);
  if (object.customer_id !== customer.id) {
    throw new ApiError(409, 'Object hoort niet bij deze klant', { object_id: object.id, customer_id: customer.id });
  }
  return { customer, object };
}

export function geoJsonFeatures(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [] as LooseRecord[];
  const record = value as LooseRecord;
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
    return record.features.filter(feature => feature && typeof feature === 'object' && !Array.isArray(feature));
  }
  if (record.type === 'Feature') return [record];
  if (['Polygon', 'MultiPolygon'].includes(asString(record.type))) {
    return [{ type: 'Feature', properties: {}, geometry: record }];
  }
  return [] as LooseRecord[];
}

export function geoJsonPositionCount(value: unknown): number {
  const walk = (node: unknown): number => {
    if (!Array.isArray(node)) return 0;
    if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') return 1;
    return node.reduce((sum, child) => sum + walk(child), 0);
  };
  return geoJsonFeatures(value).reduce((sum, feature) => sum + walk(feature.geometry?.coordinates), 0);
}

export function allGeometryPositions(geometry: LooseRecord) {
  const positions: number[][] = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      positions.push([node[0], node[1]]);
      return;
    }
    node.forEach(walk);
  };
  walk(geometry.coordinates);
  return positions;
}

export function distanceMeters(left: number[], right: number[]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const latitude1 = radians(left[1]);
  const latitude2 = radians(right[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export function projectedRingAreaSquareMeters(ring: number[][]) {
  if (ring.length < 4) return 0;
  const referenceLatitude = ring.reduce((sum, position) => sum + position[1], 0) / ring.length;
  const longitudeScale = 111_320 * Math.cos(referenceLatitude * Math.PI / 180);
  const latitudeScale = 110_540;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [leftLongitude, leftLatitude] = ring[index];
    const [rightLongitude, rightLatitude] = ring[index + 1];
    twiceArea += (leftLongitude * longitudeScale) * (rightLatitude * latitudeScale) -
      (rightLongitude * longitudeScale) * (leftLatitude * latitudeScale);
  }
  return Math.abs(twiceArea) / 2;
}

export function geometryAreaSquareMeters(geometry: LooseRecord) {
  const polygonArea = (rings: number[][][]) => {
    if (!rings.length) return 0;
    const exterior = projectedRingAreaSquareMeters(rings[0]);
    const holes = rings.slice(1).reduce((sum, ring) => sum + projectedRingAreaSquareMeters(ring), 0);
    return Math.max(0, exterior - holes);
  };
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum: number, polygon: number[][][]) => sum + polygonArea(polygon), 0);
  }
  return 0;
}

export function featureCollectionAreaSquareMeters(value: unknown) {
  return geoJsonFeatures(value).reduce((sum, feature) => sum + geometryAreaSquareMeters(feature.geometry || {}), 0);
}

export function orientation(left: number[], middle: number[], right: number[]) {
  return (middle[1] - left[1]) * (right[0] - middle[0]) -
    (middle[0] - left[0]) * (right[1] - middle[1]);
}

export function pointOnSegment(left: number[], point: number[], right: number[]) {
  const epsilon = 1e-12;
  return point[0] <= Math.max(left[0], right[0]) + epsilon &&
    point[0] >= Math.min(left[0], right[0]) - epsilon &&
    point[1] <= Math.max(left[1], right[1]) + epsilon &&
    point[1] >= Math.min(left[1], right[1]) - epsilon;
}

export function segmentsIntersect(leftStart: number[], leftEnd: number[], rightStart: number[], rightEnd: number[]) {
  const first = orientation(leftStart, leftEnd, rightStart);
  const second = orientation(leftStart, leftEnd, rightEnd);
  const third = orientation(rightStart, rightEnd, leftStart);
  const fourth = orientation(rightStart, rightEnd, leftEnd);
  const epsilon = 1e-12;
  if (((first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon)) &&
    ((third > epsilon && fourth < -epsilon) || (third < -epsilon && fourth > epsilon))) return true;
  if (Math.abs(first) <= epsilon && pointOnSegment(leftStart, rightStart, leftEnd)) return true;
  if (Math.abs(second) <= epsilon && pointOnSegment(leftStart, rightEnd, leftEnd)) return true;
  if (Math.abs(third) <= epsilon && pointOnSegment(rightStart, leftStart, rightEnd)) return true;
  return Math.abs(fourth) <= epsilon && pointOnSegment(rightStart, leftEnd, rightEnd);
}

export function ringSelfIntersects(ring: number[][]) {
  const segmentCount = ring.length - 1;
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      if (right === left + 1 || (left === 0 && right === segmentCount - 1)) continue;
      if (segmentsIntersect(ring[left], ring[left + 1], ring[right], ring[right + 1])) return true;
    }
  }
  return false;
}

export function ringsIntersect(leftRing: number[][], rightRing: number[][]) {
  for (let left = 0; left < leftRing.length - 1; left += 1) {
    for (let right = 0; right < rightRing.length - 1; right += 1) {
      if (segmentsIntersect(leftRing[left], leftRing[left + 1], rightRing[right], rightRing[right + 1])) return true;
    }
  }
  return false;
}

export function positionInsideRing(position: number[], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPosition = ring[index];
    const previousPosition = ring[previous];
    const crossesLatitude = (currentPosition[1] > position[1]) !== (previousPosition[1] > position[1]);
    if (!crossesLatitude) continue;
    const crossingLongitude = ((previousPosition[0] - currentPosition[0]) *
      (position[1] - currentPosition[1])) / (previousPosition[1] - currentPosition[1]) + currentPosition[0];
    if (position[0] < crossingLongitude) inside = !inside;
  }
  return inside;
}

export function normalizedGeoJsonPosition(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 2) throw new ApiError(400, `${label} bevat een ongeldige positie`);
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(400, `${label} bevat coördinaten buiten WGS84`);
  }
  return [Number(longitude.toFixed(7)), Number(latitude.toFixed(7))];
}

export function normalizedGeoJsonRing(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 4) throw new ApiError(400, `${label} bevat een onvolledige ring`);
  const ring = value.map(position => normalizedGeoJsonPosition(position, label));
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) throw new ApiError(400, `${label} bevat een niet-gesloten ring`);
  for (let index = 1; index < ring.length; index += 1) {
    if (ring[index][0] === ring[index - 1][0] && ring[index][1] === ring[index - 1][1]) {
      throw new ApiError(400, `${label} bevat opeenvolgende dubbele punten`);
    }
  }
  const uniquePositions = new Set(ring.slice(0, -1).map(position => position.join(',')));
  if (ringSelfIntersects(ring)) throw new ApiError(400, `${label} bevat een zelfdoorsnijding`);
  if (uniquePositions.size < 3 || projectedRingAreaSquareMeters(ring) < 0.1) {
    throw new ApiError(400, `${label} bevat een vlak zonder geldige oppervlakte`);
  }
  return ring;
}

export function normalizedGeoJsonGeometry(value: unknown, label: string, anchor: number[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, `${label} mist geometrie`);
  const geometry = value as LooseRecord;
  if (!['Polygon', 'MultiPolygon'].includes(asString(geometry.type))) {
    throw new ApiError(400, `${label} ondersteunt alleen Polygon en MultiPolygon`);
  }
  const normalizePolygon = (coordinates: unknown, polygonLabel: string) => {
    if (!Array.isArray(coordinates) || !coordinates.length) throw new ApiError(400, `${polygonLabel} bevat geen ringen`);
    const rings = coordinates.map((ring, index) => normalizedGeoJsonRing(ring, `${polygonLabel}, ring ${index + 1}`));
    for (let holeIndex = 1; holeIndex < rings.length; holeIndex += 1) {
      if (ringsIntersect(rings[0], rings[holeIndex]) || !positionInsideRing(rings[holeIndex][0], rings[0])) {
        throw new ApiError(400, `${polygonLabel} bevat een binnenring buiten de buitenring`);
      }
      for (let otherHoleIndex = 1; otherHoleIndex < holeIndex; otherHoleIndex += 1) {
        if (
          ringsIntersect(rings[holeIndex], rings[otherHoleIndex]) ||
          positionInsideRing(rings[holeIndex][0], rings[otherHoleIndex]) ||
          positionInsideRing(rings[otherHoleIndex][0], rings[holeIndex])
        ) {
          throw new ApiError(400, `${polygonLabel} bevat overlappende binnenringen`);
        }
      }
    }
    return rings;
  };
  const coordinates = geometry.type === 'Polygon'
    ? normalizePolygon(geometry.coordinates, label)
    : (() => {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
        throw new ApiError(400, `${label} bevat geen polygonen`);
      }
      return geometry.coordinates.map((polygon: unknown, index: number) =>
        normalizePolygon(polygon, `${label}, polygoon ${index + 1}`));
    })();
  const normalized = { type: geometry.type, coordinates } as LooseRecord;
  for (const position of allGeometryPositions(normalized)) {
    if (distanceMeters(anchor, position) > OBJECT_MAP_MAX_DISTANCE_METERS) {
      throw new ApiError(400, `${label} ligt te ver van de gecontroleerde objectlocatie`);
    }
  }
  return normalized;
}

export function normalizedGeoJsonFeatureCollection(
  value: unknown,
  label: string,
  options: {
    anchor: number[];
    maxFeatures: number;
    maxAreaSquareMeters: number;
    properties: (feature: LooseRecord, index: number) => LooseRecord;
  },
) {
  if (value === null || value === undefined) return null;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > OBJECT_MAP_MAX_PAYLOAD_BYTES) {
    throw new ApiError(400, `${label} is te groot om veilig te verwerken`);
  }
  const rawFeatures = geoJsonFeatures(value);
  const isFeatureCollection = Boolean(
    value && typeof value === 'object' && !Array.isArray(value) &&
    (value as LooseRecord).type === 'FeatureCollection' && Array.isArray((value as LooseRecord).features),
  );
  if (!rawFeatures.length && !isFeatureCollection) {
    throw new ApiError(400, `${label} is geen geldige GeoJSON FeatureCollection`);
  }
  if (rawFeatures.length > options.maxFeatures) {
    throw new ApiError(400, `${label} bevat meer dan ${options.maxFeatures} vlakken`);
  }
  const features = rawFeatures.map((rawFeature, index) => {
    const rawGeometry = rawFeature.type === 'Feature' ? rawFeature.geometry : rawFeature;
    const geometry = normalizedGeoJsonGeometry(rawGeometry, `${label} ${index + 1}`, options.anchor);
    const id = asString(rawFeature.id || rawFeature.properties?.local_id)
      .replace(/[^a-zA-Z0-9:_-]/g, '')
      .slice(0, 120) || undefined;
    return {
      type: 'Feature',
      ...(id ? { id } : {}),
      properties: options.properties(rawFeature, index),
      geometry,
    };
  });
  const featureCollection = { type: 'FeatureCollection', features };
  const vertices = geoJsonPositionCount(featureCollection);
  if (vertices > OBJECT_MAP_MAX_VERTICES) {
    throw new ApiError(400, `${label} bevat meer dan ${OBJECT_MAP_MAX_VERTICES} coördinaatpunten`);
  }
  const areaSquareMeters = featureCollectionAreaSquareMeters(featureCollection);
  if (areaSquareMeters > options.maxAreaSquareMeters) {
    throw new ApiError(400, `${label} heeft een onredelijk grote oppervlakte`);
  }
  if (new TextEncoder().encode(JSON.stringify(featureCollection)).byteLength > OBJECT_MAP_MAX_PAYLOAD_BYTES) {
    throw new ApiError(400, `${label} is te groot om veilig op te slaan`);
  }
  return featureCollection;
}

export function safeLocalGeometryProperties(source: 'manual' | 'user_drawn', feature: LooseRecord, index: number) {
  const localId = asString(feature.id || feature.properties?.local_id)
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 120) || `${source}:${index + 1}`;
  const derivedFromId = asString(feature.properties?.derived_from_id);
  const parcelOrigin = source === 'user_drawn' && feature.properties?.derived_from === 'pdok_brk' &&
    /^[a-zA-Z0-9_-]{1,120}$/.test(derivedFromId)
    ? { derived_from: 'pdok_brk', derived_from_id: derivedFromId }
    : {};
  return { source, local_id: localId, ...parcelOrigin };
}

export function normalizedBuildingSelectionPoints(value: unknown, anchor: number[], maxPoints = OBJECT_MAP_MAX_BUILDING_FEATURES) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxPoints ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > OBJECT_MAP_MAX_PAYLOAD_BYTES) {
    throw new ApiError(400, `Gebouwselectie moet een lijst met maximaal ${maxPoints} aanklikpunten zijn`);
  }
  const ids = new Set<string>();
  const positions = new Set<string>();
  return value.map(point => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw new ApiError(400, 'Gebouwaanklikpunt is ongeldig');
    const id = asString(point.id);
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(id) || ids.has(id)) throw new ApiError(400, 'Gebouwaanklikpunt mist een uniek nummer');
    if (typeof point.longitude !== 'number' || typeof point.latitude !== 'number' ||
      !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude) ||
      point.longitude < -180 || point.longitude > 180 || point.latitude < -90 || point.latitude > 90) {
      throw new ApiError(400, 'Gebouwaanklikpunt bevat ongeldige WGS84-coördinaten');
    }
    const longitude = Number(point.longitude.toFixed(7));
    const latitude = Number(point.latitude.toFixed(7));
    if (distanceMeters(anchor, [longitude, latitude]) > OBJECT_MAP_MAX_DISTANCE_METERS) {
      throw new ApiError(400, 'Gebouwaanklikpunt ligt te ver van de gecontroleerde objectlocatie');
    }
    const positionKey = `${longitude},${latitude}`;
    if (positions.has(positionKey)) throw new ApiError(400, 'Hetzelfde gebouwaanklikpunt is meermaals geselecteerd');
    ids.add(id);
    positions.add(positionKey);
    return { id, source: 'user_selected', provider: 'mapbox', bag_status: 'unlinked', longitude, latitude };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function safeStoredBuildingSelectionPoints(object: LooseRecord) {
  if (object.building_selection_points === undefined || object.building_selection_points === null) {
    return { value: [], invalid: false };
  }
  const coordinates = safeObjectMapCoordinatePair(object.latitude, object.longitude);
  try {
    if (!coordinates && (!Array.isArray(object.building_selection_points) || object.building_selection_points.length)) {
      return { value: [], invalid: true };
    }
    return {
      value: normalizedBuildingSelectionPoints(object.building_selection_points,
        coordinates ? [coordinates.longitude, coordinates.latitude] : [0, 0]),
      invalid: false,
    };
  } catch {
    return { value: [], invalid: true };
  }
}

export function objectBuildingLabelKeys(geometry: unknown, points: LooseRecord[] = []) {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) || 0) + 1);
  geoJsonFeatures(geometry).forEach(feature => {
    const properties = feature.properties || {};
    const id = asString(properties.source === 'pdok_bag'
      ? properties.source_feature_id
      : properties.local_id || feature.id);
    if (id) add(`${properties.source === 'pdok_bag' ? 'bag' : 'manual'}:${id}`);
  });
  points.forEach(point => { if (asString(point.id)) add(`point:${point.id}`); });
  // Ambigue legacy-ID's mogen nooit een naam aan meer dan één gebouw koppelen.
  return new Set([...counts].filter(([, count]) => count === 1).map(([key]) => key));
}

export function objectBuildingFloorPlanSelectionKeys(object: LooseRecord) {
  // Automatic or legacy contours are context until a manual selection is saved.
  // The public geometry normalizer may synthesize IDs; those are not plan keys.
  if (object.__dossier_kind === 'collective' || object.building_selection_mode !== 'manual') return [] as string[];
  const buildings = safeStoredBuildingCollection(object);
  const points = safeStoredBuildingSelectionPoints(object);
  if (buildings.invalid || points.invalid ||
    geoJsonFeatures(buildings.value).length + points.value.length > OBJECT_MAP_MAX_BUILDING_FEATURES) return [] as string[];
  const storedKeys = objectBuildingLabelKeys(object.building_polygon_geojson,
    Array.isArray(object.building_selection_points) ? object.building_selection_points : []);
  return [...objectBuildingLabelKeys(buildings.value, points.value)]
    .filter(key => storedKeys.has(key))
    .sort((left, right) => left.localeCompare(right));
}

export function safeObjectMapCoordinate(value: unknown, minimum: number, maximum: number) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
}

export function safeObjectMapCoordinatePair(latitudeValue: unknown, longitudeValue: unknown) {
  const latitude = safeObjectMapCoordinate(latitudeValue, -90, 90);
  const longitude = safeObjectMapCoordinate(longitudeValue, -180, 180);
  if (latitude === null || longitude === null || isNullIslandCoordinatePair(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function geoJsonPayloadWasConfigured(value: unknown) {
  if (value === null || value === undefined) return false;
  if (
    value && typeof value === 'object' && !Array.isArray(value) &&
    (value as LooseRecord).type === 'FeatureCollection' &&
    Array.isArray((value as LooseRecord).features) &&
    !(value as LooseRecord).features.length
  ) return false;
  return true;
}

export function safeStoredBuildingCollection(object: LooseRecord) {
  if (!geoJsonPayloadWasConfigured(object.building_polygon_geojson)) {
    return { value: null, invalid: false };
  }
  const coordinates = safeObjectMapCoordinatePair(object.latitude, object.longitude);
  if (!coordinates) return { value: null, invalid: true };
  try {
    const normalized = normalizedGeoJsonFeatureCollection(
      object.building_polygon_geojson,
      'Opgeslagen gebouwvlak',
      {
        anchor: [coordinates.longitude, coordinates.latitude],
        maxFeatures: OBJECT_MAP_MAX_BUILDING_FEATURES,
        maxAreaSquareMeters: OBJECT_MAP_MAX_BUILDING_AREA_SQM,
        properties: (feature, index) => {
          if (feature.properties?.source !== 'pdok_bag') {
            return safeLocalGeometryProperties('manual', feature, index);
          }
          const sourceFeatureId = safePdokFeatureId(feature.properties?.source_feature_id || feature.id);
          const sourceStatus = asString(feature.properties?.source_status).slice(0, 120) || null;
          if (!activeBagBuildingStatus(sourceStatus)) {
            throw new ApiError(409, 'Een opgeslagen BAG-pand heeft geen actieve status');
          }
          const rawRetrievedAt = asString(feature.properties?.source_retrieved_at);
          const parsedRetrievedAt = Date.parse(rawRetrievedAt);
          return {
            source: 'pdok_bag',
            source_feature_id: sourceFeatureId,
            source_identificatie: asString(feature.properties?.source_identificatie).slice(0, 80) || null,
            source_status: sourceStatus,
            source_retrieved_at: Number.isFinite(parsedRetrievedAt)
              ? new Date(parsedRetrievedAt).toISOString()
              : null,
          };
        },
      },
    );
    return { value: normalized?.features?.length ? normalized : null, invalid: false };
  } catch {
    // Ongeldige, te grote of niet-canonieke legacydata wordt nooit opnieuw uitgeleverd.
    return { value: null, invalid: true };
  }
}

export function safePdokFeatureId(value: unknown) {
  const featureId = asString(value);
  if (!featureId || featureId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(featureId)) {
    throw new ApiError(400, 'Een BAG-pand-ID is ongeldig');
  }
  return featureId;
}

export function activeBagBuildingStatus(value: unknown) {
  const normalized = normalizeName(value);
  return Boolean(normalized) &&
    !['gesloopt', 'ten onrechte', 'ingetrokken', 'niet gerealiseerd'].some(term => normalized.includes(term));
}

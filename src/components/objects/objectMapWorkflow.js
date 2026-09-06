import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
  invokeCustomerPlatformRead,
} from "@/components/customers/customerDossierUtils";
import {
  featureSourceId,
  normalizeFeatureCollection,
  selectedFeatureIds,
} from "./objectMapGeometry";
import { fetchObjectParcelCandidatesDirect } from "./objectMapParcelTransport";

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} ontbreekt.`);
  return normalized;
}

function overlapReason(value) {
  const reason = required(value, "Reden voor gedeeld gebouw");
  if (reason.length < 3) throw new Error("De reden voor een gedeeld gebouw moet minimaal 3 tekens bevatten.");
  return reason.slice(0, 500);
}

function overlapConfirmation(value) {
  if (value?.confirmed !== true) return null;
  if (typeof value.conflict_fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.conflict_fingerprint)) {
    throw new Error("De conflictbevestiging is niet meer actueel. Probeer de wijziging opnieuw.");
  }
  return {
    confirmed: true,
    reason: overlapReason(value.reason),
    conflict_fingerprint: value.conflict_fingerprint,
  };
}

function normalizeConflict(value) {
  if (!value || typeof value !== "object") return null;
  return {
    object_id: value.object_id || value.id || null,
    object_name: value.object_name || value.name || "Ander object",
    object_code: value.object_code || null,
    customer_name: value.customer_name || null,
  };
}

function candidateFeatures(value) {
  const root = value?.data || value || {};
  if (root.type === "FeatureCollection") return root.features || [];
  if (root.feature_collection?.type === "FeatureCollection") return root.feature_collection.features || [];
  if (root.candidates?.type === "FeatureCollection") return root.candidates.features || [];
  if (Array.isArray(root.candidates)) return root.candidates;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.features)) return root.features;
  return [];
}

export function normalizeObjectMapCandidates(value) {
  const root = value?.data || value || {};
  const source = typeof root.source === "string"
    ? root.source
    : root.source?.name || "PDOK BAG";
  const conflictsById = new Map();
  Object.entries(root.conflicts_by_feature_id || {}).forEach(([id, conflicts]) => conflictsById.set(id, Array.isArray(conflicts) ? conflicts : []));
  (Array.isArray(root.conflicts) ? root.conflicts : []).forEach(conflict => {
    const id = String(conflict?.source_feature_id || "");
    if (id) conflictsById.set(id, Array.isArray(conflict?.objects) ? conflict.objects : []);
  });
  const items = candidateFeatures(root).map((candidate, index) => {
    const feature = candidate?.type === "Feature"
      ? candidate
      : candidate?.feature?.type === "Feature"
        ? candidate.feature
        : { type: "Feature", id: candidate?.id, properties: candidate?.properties || candidate || {}, geometry: candidate?.geometry };
    const sourceFeatureId = featureSourceId(feature) || String(candidate?.source_feature_id || candidate?.id || index);
    const inlineConflicts = candidate?.conflicts || feature.properties?.conflicts || conflictsById.get(sourceFeatureId) || [];
    const conflicts = (Array.isArray(inlineConflicts) ? inlineConflicts : []).map(normalizeConflict).filter(Boolean);
    return {
      ...feature,
      id: sourceFeatureId,
      properties: {
        ...(feature.properties || {}),
        source: feature.properties?.source || candidate?.source || "pdok_bag",
        source_feature_id: sourceFeatureId,
        source_identificatie: feature.properties?.source_identificatie || feature.properties?.identificatie || candidate?.identificatie || null,
        source_status: feature.properties?.source_status || feature.properties?.status || candidate?.status || null,
        conflicts,
        conflict_count: Number(candidate?.conflict_count ?? feature.properties?.conflict_count ?? conflicts.length),
        selected: candidate?.selected === true || feature.properties?.selected === true,
      },
    };
  }).filter(feature => feature.geometry);
  return {
    items,
    total: Number(root.total ?? items.length),
    has_more: Boolean(root.has_more),
    cursor: root.cursor || null,
    next_cursor: root.next_cursor || null,
    center: root.center && typeof root.center === "object" ? root.center : null,
    radius_meters: Number(root.radius_meters || 0) || null,
    skipped_invalid_count: Number(root.skipped_invalid_count || 0),
    source,
    source_retrieved_at: root.source?.retrieved_at || root.source_retrieved_at || root.retrieved_at || null,
    transport: root.transport === "browser" ? "browser" : "server",
    conflicts: Array.isArray(root.conflicts) ? root.conflicts : [],
  };
}

export function normalizeObjectMapConfiguration(value) {
  const root = value?.data || value || {};
  const configuration = root.configuration || root.map_configuration || root.object_map || root.object || root;
  const selectedBuildings = normalizeFeatureCollection(
    configuration.building_polygon_geojson || configuration.selected_buildings_geojson,
  );
  const manualBuildings = normalizeFeatureCollection(
    configuration.manual_building_geojson || configuration.manual_buildings_geojson,
  );
  const selectedIds = configuration.selected_bag_feature_ids
    || configuration.selected_building_source_ids
    || root.selected_bag_feature_ids
    || selectedFeatureIds(selectedBuildings.features.filter(feature => (feature.properties?.source || "pdok_bag") === "pdok_bag"));
  const showOnMobileMap = configuration.show_on_mobile_map ?? configuration.object?.show_on_mobile_map;
  return {
    object_id: configuration.object_id || root.object_id || null,
    customer_id: configuration.customer_id || root.customer_id || null,
    object: configuration.object && typeof configuration.object === "object" ? configuration.object : null,
    expected_version: Number(root.expected_version ?? root.object_version ?? configuration.version ?? 0),
    building_selection_mode: configuration.building_selection_mode === "manual" ? "manual" : "automatic",
    map_geometry_status: configuration.map_geometry_status || "unconfigured",
    map_geometry_revision: Number(configuration.map_geometry_revision || 0),
    map_geometry_hash: configuration.map_geometry_hash || null,
    map_geometry_updated_at: configuration.map_geometry_updated_at || null,
    map_geometry_updated_by_user_id: configuration.map_geometry_updated_by_user_id || null,
    map_geometry_updated_by_name: configuration.map_geometry_updated_by_name || root.map_geometry_updated_by_name || null,
    map_geometry_review_reason: configuration.map_geometry_review_reason || null,
    show_on_mobile_map: typeof showOnMobileMap === "boolean" ? showOnMobileMap : null,
    selected_bag_feature_ids: [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String).filter(Boolean))].sort(),
    building_selection_points: Array.isArray(configuration.building_selection_points) ? configuration.building_selection_points : [],
    building_labels: configuration.building_labels && typeof configuration.building_labels === "object" && !Array.isArray(configuration.building_labels) ? configuration.building_labels : {},
    building_polygon_geojson: selectedBuildings,
    manual_building_geojson: manualBuildings,
    object_area_geojson: normalizeFeatureCollection(configuration.object_area_geojson),
    selected_buildings: Array.isArray(root.selected_buildings) ? root.selected_buildings : [],
    conflicts: Array.isArray(root.conflicts) ? root.conflicts : [],
    building_summary: configuration.building_summary || root.building_summary || null,
    terrain_summary: configuration.terrain_summary || root.terrain_summary || null,
    source_retrieved_at: configuration.source_retrieved_at || root.source_retrieved_at || null,
  };
}

export function createObjectMapMutationKey() {
  return createCustomerMutationKey("update_object_map_configuration");
}

export async function getObjectMapConfiguration({ customerId, objectId, invoke = invokeCustomerPlatformRead }) {
  const result = await invoke({
    action: "get_object_map_configuration",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
  });
  return normalizeObjectMapConfiguration(result);
}

export async function listObjectBuildingCandidates({ customerId, objectId, radiusMeters = 250, limit = 100, cursor = null, invoke = invokeCustomerPlatformRead }) {
  const result = await invoke({
    action: "list_object_building_candidates",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    radius_meters: Math.min(500, Math.max(25, Math.round(Number(radiusMeters) || 250))),
    limit: Math.min(100, Math.max(1, Math.round(Number(limit) || 100))),
    ...(String(cursor || "").trim() ? { cursor: String(cursor).trim() } : {}),
  });
  return normalizeObjectMapCandidates(result);
}

function readableParcelError(error) {
  const code = error?.details?.code;
  const message = code === "pdok_parcel_unavailable"
    ? "De perceelgrenzen konden via de beschikbare verbindingen niet worden opgehaald. Probeer opnieuw; je bestaande terrein blijft bewaard."
    : code === "pdok_parcel_invalid_response"
      ? "De kadastrale perceeldienst (PDOK) gaf geen bruikbaar antwoord. Probeer opnieuw; je bestaande terrein blijft bewaard."
      : Number(error?.status) >= 500
        ? "Het ophalen van objectgegevens of perceelgrenzen is tijdelijk mislukt. Probeer opnieuw; je bestaande terrein blijft bewaard."
        : null;
  if (!message) return error;
  return Object.assign(new Error(message), {
    status: error.status, requestId: error.requestId, details: error.details, action: error.action,
  });
}

function requireUnchangedParcelCenter(expected, actual) {
  if (expected && (Number(actual?.longitude) !== expected.longitude || Number(actual?.latitude) !== expected.latitude)) {
    throw Object.assign(new Error("De objectlocatie is gewijzigd. Vernieuw de kaart om de juiste percelen te laden."), { status: 409, details: { code: "object_map_anchor_changed", retryable: false } });
  }
}

export async function listObjectParcelCandidates({ customerId, objectId, radiusMeters = 1_000, limit = 100, cursor = null, transport = "server", expectedCenter = null, invoke = invokeCustomerPlatformRead, fetchDirect = fetchObjectParcelCandidatesDirect }) {
  const payload = {
    action: "list_object_parcel_candidates",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    radius_meters: Math.min(1_000, Math.max(25, Math.round(Number(radiusMeters) || 1_000))),
    limit: Math.min(100, Math.max(1, Math.round(Number(limit) || 100))),
    ...(String(cursor || "").trim() ? { cursor: String(cursor).trim() } : {}),
  };
  // A public-data transport fallback, not an authorization fallback. Recheck
  // scope and the saved address on every browser page; never use draft/prop
  // coordinates or send platform credentials to PDOK.
  const readDirect = async originalError => {
    const configuration = await getObjectMapConfiguration({ customerId: payload.customer_id, objectId: payload.object_id, invoke });
    const object = configuration.object;
    if (configuration.customer_id !== payload.customer_id || configuration.object_id !== payload.object_id
      || object?.id !== payload.object_id || object?.customer_id !== payload.customer_id) {
      throw Object.assign(new Error("De actuele objectlocatie kon niet veilig worden gecontroleerd. Vernieuw de kaart."), { status: 409, details: { code: "object_map_scope_changed", retryable: false } });
    }
    requireUnchangedParcelCenter(expectedCenter, object);
    try {
      const result = await fetchDirect({ object, radiusMeters: payload.radius_meters, limit: payload.limit, cursor: payload.cursor || null });
      return normalizeObjectMapCandidates({ ...result, transport: "browser" });
    } catch (error) {
      // Keep the platform reference for support, but never retain a request
      // URL, geometry or the original fetch exception in recovery/error state.
      throw readableParcelError(Object.assign(new Error(error.message), {
        status: error.status, requestId: originalError?.requestId,
        details: error.details, action: payload.action,
      }));
    }
  };
  if (transport === "browser") return readDirect(null);
  try {
    const result = normalizeObjectMapCandidates(await invoke(payload));
    requireUnchangedParcelCenter(expectedCenter, result.center);
    return result;
  } catch (error) {
    if (Number(error?.status) >= 500 && error?.details?.code === "pdok_parcel_unavailable"
      && error?.details?.retryable !== false) return readDirect(error);
    // Never bypass scope/platform failures or invalid source data.
    throw readableParcelError(error);
  }
}

export function shouldRetryObjectParcelCandidates(failureCount, error) {
  // The server already retries temporary PDOK failures twice. Do not multiply
  // those requests or retry invalid geometry, permissions or scope failures.
  if (failureCount >= 1 || error?.details?.retryable === false || Number(error?.details?.attempts) >= 2
    || error?.details?.code === "pdok_parcel_invalid_response") return false;
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export async function updateObjectMapConfiguration({ customerId, objectId, expectedVersion, data, idempotencyKey, invoke = invokeCustomerPlatformMutation }) {
  const version = Number(expectedVersion);
  if (!Number.isInteger(version) || version < 0) throw new Error("De actuele objectversie ontbreekt. Vernieuw de kaart en probeer opnieuw.");
  const mode = data?.building_selection_mode === "manual" ? "manual" : "automatic";
  const confirmation = overlapConfirmation(data?.overlap_confirmation);
  const result = await invoke({
    action: "update_object_map_configuration",
    customer_id: required(customerId, "Klant-ID"),
    object_id: required(objectId, "Object-ID"),
    expected_version: version,
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    data: {
      building_selection_mode: mode,
      ...(Object.prototype.hasOwnProperty.call(data || {}, "building_labels") ? { building_labels: data.building_labels || {} } : {}),
      selected_bag_feature_ids: mode === "manual"
        ? [...new Set((data?.selected_bag_feature_ids || []).map(String).filter(Boolean))].sort()
        : [],
      building_selection_points: mode === "manual"
        ? (data?.building_selection_points || []).map(point => ({
          id: point.id,
          source: "user_selected",
          provider: "mapbox",
          bag_status: "unlinked",
          longitude: point.longitude,
          latitude: point.latitude,
        }))
        : [],
      manual_building_geojson: mode === "manual"
        ? normalizeFeatureCollection(data?.manual_building_geojson)
        : null,
      object_area_geojson: normalizeFeatureCollection(data?.object_area_geojson).features.length
        ? normalizeFeatureCollection(data?.object_area_geojson)
        : null,
      // Legacy objects without this field are visible unless they were
      // explicitly disabled; mirror the server default instead of silently
      // switching them off when another map setting is saved.
      show_on_mobile_map: data?.show_on_mobile_map !== false,
      ...(confirmation ? { overlap_confirmation: confirmation } : {}),
    },
  });
  return normalizeObjectMapConfiguration(result);
}

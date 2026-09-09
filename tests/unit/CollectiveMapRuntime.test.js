import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokePinned, invokeLatest, runtime } = vi.hoisted(() => ({
  invokePinned: vi.fn(),
  invokeLatest: vi.fn(),
  runtime: { pinned: true, sameClient: false },
}));

vi.mock("@/api/base44Client", () => {
  const base44 = { entities: {}, functions: { invoke: invokePinned } };
  const latest = { functions: { invoke: invokeLatest } };
  return {
    base44,
    get base44LatestFunctions() { return runtime.sameClient ? base44 : latest; },
    get hasPinnedFunctionsVersion() { return runtime.pinned; },
  };
});

// Use the public workflows and real customer-platform transport together. An
// older snapshot knows these action names but only accepts customer objects.
import {
  getObjectMapConfiguration,
  listObjectBuildingCandidates,
  listObjectParcelCandidates,
  updateObjectMapConfiguration,
} from "@/components/objects/objectMapWorkflow";

const center = { longitude: 6.063, latitude: 52.442 };
const polygon = {
  type: "Polygon",
  coordinates: [[[6.063, 52.442], [6.0631, 52.442], [6.0631, 52.4421], [6.063, 52.442]]],
};
const feature = (id, source) => ({ type: "Feature", id, properties: { source, source_feature_id: id }, geometry: polygon });
const configuration = {
  collective_id: "estate-1", customer_id: null, object_id: null, version: 3,
  object: { id: "estate-1", customer_id: null, ...center, geocoding_status: "verified" },
  selected_bag_feature_ids: ["bag-1"], building_selection_mode: "manual",
  building_polygon_geojson: { type: "FeatureCollection", features: [feature("bag-1", "pdok_bag")] },
};
const apiResponse = data => ({ status: 200, data: { data } });
const platformError = (status, message, details = null) => ({
  response: { status, data: { error: message, request_id: "collective-map-runtime-reference", ...(details ? { details } : {}) } },
});
const saveOptions = {
  expectedVersion: 3, idempotencyKey: "collective-map:unchanged-key",
  data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"], building_labels: { "bag:bag-1": "Portier" }, show_on_mobile_map: false },
};
const helpers = [
  { action: "get_object_map_configuration", call: scope => getObjectMapConfiguration(scope) },
  { action: "list_object_building_candidates", call: scope => listObjectBuildingCandidates(scope) },
  { action: "list_object_parcel_candidates", call: scope => listObjectParcelCandidates(scope) },
  { action: "update_object_map_configuration", call: scope => updateObjectMapConfiguration({ ...saveOptions, ...scope }) },
];

beforeEach(() => {
  runtime.pinned = true;
  runtime.sameClient = false;
  invokePinned.mockReset().mockRejectedValue(platformError(400, "customer_id is verplicht"));
  invokeLatest.mockReset().mockImplementation(async (_name, payload) => {
    if (payload.action === "list_object_building_candidates") return apiResponse({ items: [feature("bag-1", "pdok_bag")], center });
    if (payload.action === "list_object_parcel_candidates") return apiResponse({ items: [feature("parcel-1", "pdok_brk")], center });
    return apiResponse({ configuration: { ...configuration, ...(payload.action === "update_object_map_configuration" ? { ...payload.data, version: 4 } : {}) } });
  });
});

describe("collectiefkaart gebruikt het actuele dossiercontract", () => {
  it("leest een managerloze collectiefkaart zonder klant-ID naar de oude objectbackend te sturen", async () => {
    const result = await getObjectMapConfiguration({ collectiveId: "estate-1" });
    expect(result).toMatchObject({ collective_id: "estate-1", customer_id: null, object_id: null, expected_version: 3 });
    expect(invokeLatest).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", { action: "get_object_map_configuration", collective_id: "estate-1" });
    expect(invokePinned).not.toHaveBeenCalled();
  });

  it("laadt BAG-kandidaten via de collectiefscope met behoud van paginering", async () => {
    const result = await listObjectBuildingCandidates({ collectiveId: "estate-1", radiusMeters: 350, limit: 50, cursor: "bag-page-2" });
    expect(result.items[0]).toMatchObject({ id: "bag-1", properties: { source: "pdok_bag" } });
    expect(invokeLatest).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", {
      action: "list_object_building_candidates", collective_id: "estate-1", radius_meters: 350, limit: 50, cursor: "bag-page-2",
    });
    expect(invokePinned).not.toHaveBeenCalled();
  });

  it("laadt percelen via dezelfde collectiefscope en controleert het kaartcentrum", async () => {
    const fetchDirect = vi.fn();
    const result = await listObjectParcelCandidates({ collectiveId: "estate-1", radiusMeters: 800, limit: 40, cursor: "parcel-page-2", expectedCenter: center, fetchDirect });
    expect(result.items[0]).toMatchObject({ id: "parcel-1", properties: { source: "pdok_brk" } });
    expect(invokeLatest).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", {
      action: "list_object_parcel_candidates", collective_id: "estate-1", radius_meters: 800, limit: 40, cursor: "parcel-page-2",
    });
    expect(invokePinned).not.toHaveBeenCalled();
    expect(fetchDirect).not.toHaveBeenCalled();
  });

  it("slaat een collectiefkaart eenmaal op met dezelfde versie en idempotencykey", async () => {
    const input = { ...saveOptions, collectiveId: "estate-1" };
    const original = JSON.stringify(input);
    const result = await updateObjectMapConfiguration(input);
    expect(result).toMatchObject({ collective_id: "estate-1", expected_version: 4, building_labels: { "bag:bag-1": "Portier" } });
    expect(invokeLatest).toHaveBeenCalledOnce();
    const [name, payload] = invokeLatest.mock.calls[0];
    expect(name).toBe("customerPlatformApi");
    expect(payload).toMatchObject({
      action: "update_object_map_configuration", collective_id: "estate-1",
      expected_version: 3, idempotency_key: "collective-map:unchanged-key",
      data: { selected_bag_feature_ids: ["bag-1"], building_labels: { "bag:bag-1": "Portier" } },
    });
    expect(payload).not.toHaveProperty("customer_id");
    expect(payload).not.toHaveProperty("object_id");
    expect(JSON.stringify(input)).toBe(original);
    expect(invokePinned).not.toHaveBeenCalled();
  });

  it.each(helpers)("weigert gemengde scope voor $action vóór een netwerkverzoek", async ({ call }) => {
    for (const extra of [{ customerId: "customer-1" }, { objectId: "object-1" }, { customerId: "customer-1", objectId: "object-1" }]) {
      await expect(call({ collectiveId: "estate-1", ...extra })).rejects.toThrow("Kies één kaartdossier: object of collectief.");
    }
    expect(invokePinned).not.toHaveBeenCalled();
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it.each(helpers)("behoudt autorisatie- en versieconflicten uit latest voor $action", async ({ call }) => {
    for (const status of [403, 409]) {
      invokeLatest.mockClear().mockRejectedValue(platformError(status, status === 403 ? "Geen toegang" : "Versieconflict"));
      await expect(call({ collectiveId: "estate-1" })).rejects.toMatchObject({ status, requestId: "collective-map-runtime-reference" });
      expect(invokeLatest).toHaveBeenCalledOnce();
      expect(invokePinned).not.toHaveBeenCalled();
    }
  });

  it("stuurt een echte klantobjectkaart nog steeds naar de gepinde backend", async () => {
    invokePinned.mockResolvedValue(apiResponse({ configuration: { version: 8, customer_id: "customer-1", object_id: "object-1" } }));
    const result = await getObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1" });
    expect(result).toMatchObject({ customer_id: "customer-1", object_id: "object-1", expected_version: 8 });
    expect(invokePinned).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", { action: "get_object_map_configuration", customer_id: "customer-1", object_id: "object-1" });
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it.each([{ pinned: false, sameClient: false }, { pinned: true, sameClient: true }])("voegt geen alternatieve backend toe zonder aparte previewclient ($pinned/$sameClient)", async options => {
    Object.assign(runtime, options);
    invokePinned.mockResolvedValue(apiResponse({ configuration }));
    await expect(getObjectMapConfiguration({ collectiveId: "estate-1" })).resolves.toHaveProperty("collective_id", "estate-1");
    expect(invokePinned).toHaveBeenCalledOnce();
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it("herhaalt een onzekere opslagtimeout niet op de oude snapshot", async () => {
    invokeLatest.mockRejectedValue(new Error("Network timeout"));
    await expect(updateObjectMapConfiguration({ ...saveOptions, collectiveId: "estate-1" })).rejects.toThrow("Network timeout");
    expect(invokeLatest).toHaveBeenCalledOnce();
    expect(invokePinned).not.toHaveBeenCalled();
  });

  it("controleert bij publieke perceelfallback de collectiefscope opnieuw via latest", async () => {
    invokeLatest.mockRejectedValueOnce(platformError(503, "PDOK niet bereikbaar", { code: "pdok_parcel_unavailable", retryable: true }));
    const fetchDirect = vi.fn().mockResolvedValue({ items: [feature("parcel-1", "pdok_brk")], center });
    const result = await listObjectParcelCandidates({ collectiveId: "estate-1", expectedCenter: center, fetchDirect });
    expect(result).toMatchObject({ transport: "browser", items: [expect.objectContaining({ id: "parcel-1" })] });
    expect(invokeLatest.mock.calls.map(([, payload]) => payload.action)).toEqual(["list_object_parcel_candidates", "get_object_map_configuration"]);
    expect(invokeLatest.mock.calls.every(([, payload]) => payload.collective_id === "estate-1" && !payload.customer_id && !payload.object_id)).toBe(true);
    expect(fetchDirect).toHaveBeenCalledExactlyOnceWith({ object: configuration.object, radiusMeters: 1_000, limit: 100, cursor: null });
    expect(invokePinned).not.toHaveBeenCalled();
  });
});

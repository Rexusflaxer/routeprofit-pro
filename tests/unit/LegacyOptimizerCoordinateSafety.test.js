import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modules = {};

async function loadBackend(name, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  globalThis.Deno = {
    env: { get: () => undefined },
    serve: () => {},
  };
  const withoutSdk = source.replace(
    /^import \{ createClientFromRequest(?: as ([A-Za-z0-9_]+))? \} from ["']npm:@base44\/sdk@[^"']+["'];$/gm,
    (_match, alias) => `const ${alias || "createClientFromRequest"} = () => null;`,
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(withoutSdk, { format: "esm", loader: "ts", target: "es2022" });
  modules[name] = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  await loadBackend("google", "base44/functions/googleRouteOptimization/entry.ts");
  await loadBackend("fleet", "base44/functions/globalFleetOptimizer/entry.ts");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["google", "fleet"])("%s optimizercoördinaten", name => {
  it.each([
    [null, null],
    ["", " "],
    ["geen-getal", 4.3],
    [52.1, "geen-getal"],
    [91, 4.3],
    [52.1, 181],
    [0, 0],
  ])("weigert het onbruikbare paar (%o, %o)", (latitude, longitude) => {
    expect(modules[name].normalizeCoordinatePair(latitude, longitude)).toBeNull();
    expect(modules[name].fixCoords({ latitude, longitude })).toBeNull();
  });

  it.each([
    [0, 4.3],
    [0, 100],
    [52.1, 0],
    ["0", "4.3"],
  ])("behoudt het geldige paar met één nul (%o, %o)", (latitude, longitude) => {
    expect(modules[name].normalizeCoordinatePair(latitude, longitude)).toEqual({
      latitude: Number(latitude),
      longitude: Number(longitude),
    });
    expect(modules[name].fixCoords({ latitude, longitude })).toMatchObject({
      latitude: Number(latitude),
      longitude: Number(longitude),
    });
  });
});

describe("Google Route Optimization coördinaatgrenzen", () => {
  const task = {
    id: "task-1",
    object_id: "object-1",
    task_type: "Mobiele controleronde",
    weekdays: [1],
    time_window_start: "18:00",
    time_window_end: "19:00",
    duration_minutes: 15,
  };

  it("slaat een niet-numerieke objectlocatie over en behoudt een single-zero locatie", () => {
    const invalid = modules.google.prepareTaskInstances(
      [task],
      [{ id: "object-1", name: "Ongeldig", latitude: "geen-getal", longitude: 4.3 }],
      1,
    );
    expect(invalid.instances).toEqual([]);
    expect(invalid.skipped).toEqual([
      expect.objectContaining({ primaryReason: "missing_coordinates" }),
    ]);

    const valid = modules.google.prepareTaskInstances(
      [task],
      [{ id: "object-1", name: "Geldig", latitude: 0, longitude: 4.3 }],
      1,
    );
    expect(valid.skipped).toEqual([]);
    expect(valid.instances).toEqual([
      expect.objectContaining({ latitude: 0, longitude: 4.3 }),
    ]);
  });

  it("weigert een ongeldig depot voordat een Google-payload kan worden gemaakt", () => {
    const vehicles = modules.google.buildPlanningVehicles(
      [],
      [{ id: "vehicle-1", name: "Auto 1" }],
      [],
      [{ id: "office-1", name: "Kantoor", latitude: null, longitude: " " }],
    );

    expect(() => modules.google.assertPlanningVehicleDepots(vehicles)).toThrow("Controleer de depotcoördinaten");
    expect(() => modules.google.buildGoogleRequest([], vehicles, [], [], 1)).toThrow("Controleer de depotcoördinaten");
  });

  it("bouwt geldige Google-locaties met één nul zonder ze te verwijderen", () => {
    const request = modules.google.buildGoogleRequest(
      [{ ...task, latitude: 0, longitude: 4.3 }],
      [{
        id: "vehicle-1",
        _planningLabel: "Auto 1",
        _startDepot: { latitude: 52.1, longitude: 0 },
        _endDepot: { latitude: 52.1, longitude: 0 },
        _windowStart: 0,
        _windowEnd: 1439,
      }],
      [],
      [],
      1,
    );

    expect(request.model.shipments[0].deliveries[0].arrivalLocation).toEqual({ latitude: 0, longitude: 4.3 });
    expect(request.model.vehicles[0].startLocation).toEqual({ latitude: 52.1, longitude: 0 });
  });
});

describe("Global Fleet Optimizer coördinaatgrenzen", () => {
  const task = {
    id: "task-1",
    object_id: "object-1",
    task_type: "Mobiele controleronde",
    weekdays: [1],
    time_window_start: "18:00",
    time_window_end: "19:00",
    duration_minutes: 15,
  };

  it("markeert ongeldige objectcoördinaten als ontbrekend en behoudt single-zero", () => {
    const invalid = modules.fleet.prepareTaskInstances(
      [task],
      [{ id: "object-1", name: "Ongeldig", latitude: "geen-getal", longitude: 4.3 }],
      [],
      1,
    );
    expect(invalid.instances[0]).toMatchObject({ latitude: null, longitude: null, missing_coords: true });

    const valid = modules.fleet.prepareTaskInstances(
      [task],
      [{ id: "object-1", name: "Geldig", latitude: 0, longitude: 4.3 }],
      [],
      1,
    );
    expect(valid.instances[0]).toMatchObject({ latitude: 0, longitude: 4.3, missing_coords: false });
  });

  it("roept Google Directions niet aan voor een ongeldig coördinatenpaar", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(modules.fleet.getTravelTime(
      { latitude: null, longitude: null },
      { latitude: 52.1, longitude: 4.3 },
      "api-key",
      new Map(),
    )).resolves.toMatchObject({ status: "missing_coordinates", estimated: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("weigert handmatige routes zonder een geldig depot", () => {
    const states = modules.fleet.buildManualRouteStates(
      [{ id: "route-1", name: "Route 1", vehicle_id: "vehicle-1", time_window_start: "18:00", time_window_end: "23:00" }],
      [{ id: "vehicle-1", name: "Auto 1" }],
      [],
      [{ id: "office-1", name: "Kantoor", latitude: 0, longitude: 0 }],
    );

    expect(() => modules.fleet.assertManualRouteDepots(states)).toThrow("Controleer de depotcoördinaten");
  });
});

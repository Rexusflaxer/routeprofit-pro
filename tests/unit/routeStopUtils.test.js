import { describe, expect, it } from "vitest";
import {
  getBuildingProximityFilter,
  normalizeRouteCoordinatePair,
  routeStopsFromData,
} from "../../src/components/navigation/routeStopUtils";

describe("operationele routecoördinaten", () => {
  it.each([
    [null, null],
    ["", " "],
    ["geen-getal", 4.3],
    [91, 4.3],
    [0, 0],
  ])("weigert het onbruikbare paar (%o, %o)", (latitude, longitude) => {
    expect(normalizeRouteCoordinatePair({ latitude, longitude })).toBeNull();
  });

  it("behoudt geldige single-zero coördinaten en de bestaande wisselcorrectie", () => {
    expect(normalizeRouteCoordinatePair({ latitude: 0, longitude: 4.3 })).toEqual([4.3, 0]);
    expect(normalizeRouteCoordinatePair({ latitude: 0, longitude: 100 })).toEqual([100, 0]);
    expect(normalizeRouteCoordinatePair({ latitude: 52.1, longitude: 0 })).toEqual([0, 52.1]);
    expect(normalizeRouteCoordinatePair({ latitude: 4.3, longitude: 52.1 })).toEqual([4.3, 52.1]);
  });

  it("maakt alleen stops voor objecten met een volledig geldig paar", () => {
    const route = {
      assigned_tasks: [
        { task_id: "task-invalid" },
        { task_id: "task-zero-zero" },
        { task_id: "task-single-zero" },
      ],
    };
    const tasks = [
      { id: "task-invalid", object_id: "object-invalid", task_type: "Controle" },
      { id: "task-zero-zero", object_id: "object-zero-zero", task_type: "Controle" },
      { id: "task-single-zero", object_id: "object-single-zero", task_type: "Controle" },
    ];
    const objects = [
      { id: "object-invalid", latitude: null, longitude: " " },
      { id: "object-zero-zero", latitude: 0, longitude: 0 },
      { id: "object-single-zero", name: "Geldige stop", latitude: 0, longitude: 4.3 },
    ];

    expect(routeStopsFromData(route, tasks, objects)).toEqual([
      expect.objectContaining({ id: "object-single-zero", latitude: 0, longitude: 4.3 }),
    ]);
  });

  it("laat ongeldige objecten nooit als 0,0 in de Mapbox-gebouwfilter terechtkomen", () => {
    const filter = getBuildingProximityFilter([
      { latitude: null, longitude: null },
      { latitude: 0, longitude: 0 },
      { latitude: 52.1, longitude: 4.3 },
      { latitude: 0, longitude: 4.3 },
    ]);

    expect(filter[2][1][1].coordinates).toEqual([[4.3, 52.1], [4.3, 0]]);
    expect(filter[2][1][1].coordinates).not.toContainEqual([0, 0]);
  });
});

import { describe, expect, it } from "vitest";
import {
  getOccurrenceRemainingAllocationRanges,
  planningShiftContainedInDate,
  resolvePlanningDrop,
  toDateKey,
} from "@/components/planning/planningDomain";

function drop({ draggableId, sourceId, destinationId, type }) {
  return {
    draggableId,
    type,
    source: { droppableId: sourceId, index: 0 },
    destination: destinationId ? { droppableId: destinationId, index: 0 } : null,
    reason: "DROP",
    mode: "FLUID",
  };
}

describe("planningmatrix dropresolutie", () => {
  it("vertaalt medewerker naar een concreet dienstslot", () => {
    expect(resolvePlanningDrop(drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "slot:shift-42:2",
      type: "PERSONNEL",
    }))).toEqual({
      kind: "assign_personnel_to_shift",
      personnelId: "person-17",
      shiftId: "shift-42",
      slotIndex: 2,
    });
  });

  it("behoudt de projectiedag bij een slotdrop en markeert een nachtdienst als niet direct toewijsbaar", () => {
    const overnightShift = {
      id: "shift-42",
      service_date: "2027-01-03",
      end_date: "2027-01-04",
      start_time: "23:00",
      end_time: "01:00",
    };
    const resolved = resolvePlanningDrop(drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "slot:shift-42:0:2027-01-04:object%3Aobject-1%3A2027-01-04",
      type: "PERSONNEL",
    }));

    expect(resolved).toEqual({
      kind: "assign_personnel_to_shift",
      personnelId: "person-17",
      shiftId: "shift-42",
      slotIndex: 0,
      serviceDate: "2027-01-04",
    });
    expect(planningShiftContainedInDate(overnightShift, resolved.serviceDate)).toBe(false);
    expect(planningShiftContainedInDate({
      ...overnightShift,
      service_date: "2027-01-04",
      end_date: "2027-01-04",
      start_time: "08:00",
      end_time: "16:00",
    }, resolved.serviceDate)).toBe(true);
  });

  it("vertaalt medewerker naar een occurrence waarvoor een dienst moet worden samengesteld", () => {
    expect(resolvePlanningDrop(drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "occurrence:occurrence-9",
      type: "PERSONNEL",
    }))).toEqual({
      kind: "compose_occurrence_for_personnel",
      personnelId: "person-17",
      occurrenceId: "occurrence-9",
    });
  });

  it("neemt de zichtbare objectdag expliciet op in een occurrence-drop", () => {
    expect(resolvePlanningDrop(drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "occurrence:occurrence-9:2027-01-04",
      type: "PERSONNEL",
    }))).toEqual({
      kind: "compose_occurrence_for_personnel",
      personnelId: "person-17",
      occurrenceId: "occurrence-9",
      serviceDate: "2027-01-04",
    });
  });

  it("vertaalt een medewerkerdrop op een tijdlijngat naar exact het voorgestelde dienstdeel", () => {
    expect(resolvePlanningDrop(drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "occurrence-gap:occurrence-reception:2027-01-04:0360:0840",
      type: "PERSONNEL",
    }))).toEqual({
      kind: "compose_occurrence_slice_for_personnel",
      personnelId: "person-17",
      occurrenceId: "occurrence-reception",
      serviceDate: "2027-01-04",
      startTime: "06:00",
      endTime: "14:00",
    });
  });

  it("vertaalt een taak naar de dagcel van een medewerker", () => {
    expect(resolvePlanningDrop(drop({
      draggableId: "task:occurrence-9",
      sourceId: "task-backlog",
      destinationId: "employee-day:person-17:2027-01-04",
      type: "TASK",
    }))).toEqual({
      kind: "assign_task_to_employee_day",
      occurrenceId: "occurrence-9",
      personnelId: "person-17",
      serviceDate: "2027-01-04",
    });
  });

  it.each([
    ["task naar medewerkerdag", drop({
      draggableId: "task:occurrence-overnight",
      sourceId: "task-backlog",
      destinationId: "employee-day:person-17:2027-01-04",
      type: "TASK",
    })],
    ["medewerker naar objecttaak", drop({
      draggableId: "personnel:person-17",
      sourceId: "personnel-pool",
      destinationId: "occurrence:occurrence-overnight:2027-01-04",
      type: "PERSONNEL",
    })],
  ])("clipt Sunday 23:00–Monday 01:00 bij %s uitsluitend tot Monday", (_label, result) => {
    const overnightOccurrence = {
      id: "occurrence-overnight",
      service_date: "2027-01-03",
      end_date: "2027-01-04",
      window_start_time: "23:00",
      window_end_time: "01:00",
      required_minutes: 120,
    };
    const resolved = resolvePlanningDrop(result);
    expect(resolved.serviceDate).toBe("2027-01-04");

    const ranges = getOccurrenceRemainingAllocationRanges(
      overnightOccurrence,
      [],
      [],
      resolved.serviceDate,
    );
    expect(ranges).toHaveLength(1);
    expect(toDateKey(ranges[0].start)).toBe("2027-01-04");
    expect(toDateKey(ranges[0].end)).toBe("2027-01-04");
    expect(ranges[0].start.getHours()).toBe(0);
    expect(ranges[0].end.getHours()).toBe(1);
  });

  it.each([
    ["geen bestemming", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: null, type: "PERSONNEL" })],
    ["onbekende draggable", drop({ draggableId: "customer:customer-1", sourceId: "customers", destinationId: "slot:shift-42:0", type: "PERSONNEL" })],
    ["medewerker naar medewerkerdag", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "employee-day:person-18:2027-01-04", type: "PERSONNEL" })],
    ["taak naar dienstslot", drop({ draggableId: "task:occurrence-9", sourceId: "task-backlog", destinationId: "slot:shift-42:0", type: "TASK" })],
    ["negatieve slotindex", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "slot:shift-42:-1", type: "PERSONNEL" })],
    ["niet-numerieke slotindex", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "slot:shift-42:first", type: "PERSONNEL" })],
    ["ongeldige slotdag", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "slot:shift-42:0:2027-02-30:object%3Aobject-1", type: "PERSONNEL" })],
    ["ongeldige medewerkerdag", drop({ draggableId: "task:occurrence-9", sourceId: "task-backlog", destinationId: "employee-day:person-17:2027-02-30", type: "TASK" })],
    ["ongeldige objectdag", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "occurrence:occurrence-9:2027-02-30", type: "PERSONNEL" })],
    ["lege occurrence-id", drop({ draggableId: "task:", sourceId: "task-backlog", destinationId: "employee-day:person-17:2027-01-04", type: "TASK" })],
    ["ongeldig tijdlijngat", drop({ draggableId: "personnel:person-17", sourceId: "personnel-pool", destinationId: "occurrence-gap:occurrence-9:2027-01-04:0840:0360", type: "PERSONNEL" })],
  ])("retourneert null voor %s", (_label, result) => {
    expect(resolvePlanningDrop(result)).toBeNull();
  });
});

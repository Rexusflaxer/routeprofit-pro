import { describe, expect, it } from "vitest";
import {
  getOccurrencePlanningState,
  getOccurrenceOpenStaffingShift,
  getOccurrenceRemainingAllocationRanges,
  getSafeOccurrenceDropServiceDate,
  getOccurrenceStaffingTarget,
  getPlanningRange,
  getPlanningShiftRangeQuery,
  getPlanningTaskOccurrenceBootstrapStart,
  getPlanningTaskOccurrenceRangeQuery,
  getTaskOccurrenceDayProjection,
  isPlanningObjectActive,
  isPlanningPersonnelActive,
  planningShiftOverlapsRange,
  planningShiftOwnedByRange,
  planningTaskOccurrenceOverlapsRange,
  taskOccurrenceOverlapsDate,
  toDateKey,
} from "@/components/planning/planningDomain";

function dateKeys(range) {
  return range.days.map(toDateKey);
}

const occurrence = {
  id: "occurrence-1",
  lifecycle_status: "active",
  service_date: "2027-01-04",
  end_date: "2027-01-04",
  window_start_time: "08:00",
  window_end_time: "16:00",
  required_minutes: 480,
};

function segment(id, shiftId, startTime, endTime, status = "draft") {
  return {
    id,
    shift_id: shiftId,
    task_occurrence_id: occurrence.id,
    start_date: occurrence.service_date,
    end_date: occurrence.end_date,
    start_time: startTime,
    end_time: endTime,
    status,
  };
}

describe("planningmatrix-periodes", () => {
  it("bouwt een maandag-gebaseerde week correct over een jaargrens", () => {
    const range = getPlanningRange("2026-12-31", "week", { maxDays: 63 });

    expect(toDateKey(range.start)).toBe("2026-12-28");
    expect(toDateKey(range.end)).toBe("2027-01-03");
    expect(dateKeys(range)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("gebruikt voor een custom periode exact de inclusieve grenzen, onafhankelijk van de anchorDate", () => {
    const range = getPlanningRange("2025-06-15", "period", {
      periodStart: "2026-12-29",
      periodEnd: "2027-01-04",
      maxDays: 63,
    });

    expect(toDateKey(range.start)).toBe("2026-12-29");
    expect(toDateKey(range.end)).toBe("2027-01-04");
    expect(dateKeys(range)).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
    ]);
  });

  it("accepteert exact 63 dagen en kapt een langere custom periode veilig op 63 dagen af", () => {
    const maximum = getPlanningRange("2026-01-15", "period", {
      periodStart: "2026-01-01",
      periodEnd: "2026-03-04",
      maxDays: 63,
    });

    expect(maximum.days).toHaveLength(63);
    expect(toDateKey(maximum.start)).toBe("2026-01-01");
    expect(toDateKey(maximum.end)).toBe("2026-03-04");
    expect(maximum.truncated).toBe(false);

    const truncated = getPlanningRange("2026-01-15", "period", {
      periodStart: "2026-01-01",
      periodEnd: "2026-03-05",
      maxDays: 63,
    });
    expect(truncated.days).toHaveLength(63);
    expect(toDateKey(truncated.end)).toBe("2026-03-04");
    expect(truncated.truncated).toBe(true);
  });

  it("laadt ook impliciete nachtdiensten en expliciete meerdaagse diensten die de periode inlopen", () => {
    expect(getPlanningShiftRangeQuery("2026-08-17", "2026-08-23")).toEqual({
      $or: [
        { service_date: { $gte: "2026-08-16", $lte: "2026-08-23" } },
        { service_date: { $lte: "2026-08-23" }, end_date: { $gte: "2026-08-17" } },
      ],
    });

    expect(planningShiftOverlapsRange({
      service_date: "2026-08-16",
      start_time: "22:00",
      end_time: "06:00",
    }, "2026-08-17", "2026-08-23")).toBe(true);
    expect(planningShiftOverlapsRange({
      service_date: "2026-08-14",
      end_date: "2026-08-18",
      start_time: "10:00",
      end_time: "10:00",
    }, "2026-08-17", "2026-08-23")).toBe(true);
    expect(planningShiftOverlapsRange({
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      start_time: "18:00",
      end_time: "00:00",
    }, "2026-08-17", "2026-08-23")).toBe(false);
  });

  it("behandelt carry-in taakuitvoeringen als halfopen interval en bootstrapt de vorige dag", () => {
    const overnightOccurrence = {
      ...occurrence,
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      window_start_time: "22:00",
      window_end_time: "06:00",
    };
    expect(getPlanningTaskOccurrenceBootstrapStart("2026-08-17")).toBe("2026-08-16");
    expect(getPlanningTaskOccurrenceRangeQuery("2026-08-17", "2026-08-23")).toEqual(
      getPlanningShiftRangeQuery("2026-08-17", "2026-08-23"),
    );
    expect(planningTaskOccurrenceOverlapsRange(overnightOccurrence, "2026-08-17", "2026-08-23")).toBe(true);
    expect(taskOccurrenceOverlapsDate(overnightOccurrence, "2026-08-17")).toBe(true);
    expect(taskOccurrenceOverlapsDate(overnightOccurrence, "2026-08-18")).toBe(false);
    expect(getTaskOccurrenceDayProjection(overnightOccurrence, "2026-08-17")).toEqual({
      date: "2026-08-17",
      startTime: "00:00",
      endTime: "06:00",
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(getSafeOccurrenceDropServiceDate(overnightOccurrence)).toBe("");
    expect(getSafeOccurrenceDropServiceDate(overnightOccurrence, "2026-08-17")).toBe("2026-08-17");
    expect(getSafeOccurrenceDropServiceDate(overnightOccurrence, "2026-08-18")).toBe("");
    expect(getSafeOccurrenceDropServiceDate(occurrence)).toBe(occurrence.service_date);
  });

  it("scheidt operationeel actieve medewerkers en objecten van concept- en legacyrecords", () => {
    expect(isPlanningPersonnelActive({ status: "active", is_active: false })).toBe(false);
    expect(isPlanningPersonnelActive({ status: "draft", is_active: true })).toBe(false);
    expect(isPlanningPersonnelActive({ is_active: true })).toBe(true);
    expect(isPlanningObjectActive({ status: "active", is_active_customer_object: true })).toBe(true);
    expect(isPlanningObjectActive({ status: "concept", is_active_customer_object: true })).toBe(false);
    expect(isPlanningObjectActive({ status: "active", is_active_customer_object: false })).toBe(false);
  });

  it("houdt publicatie-eigenaarschap bij de startdatum ondanks een zichtbare carry-in shift", () => {
    const carryIn = { service_date: "2026-08-16", start_time: "22:00", end_time: "06:00" };
    expect(planningShiftOverlapsRange(carryIn, "2026-08-17", "2026-08-23")).toBe(true);
    expect(planningShiftOwnedByRange(carryIn, "2026-08-17", "2026-08-23")).toBe(false);
    expect(planningShiftOwnedByRange({ ...carryIn, service_date: "2026-08-17" }, "2026-08-17", "2026-08-23")).toBe(true);
  });
});

describe("planningstatus van een taakuitvoering", () => {
  it("is unplanned wanneer er geen actieve segmenten of gekoppelde diensten zijn", () => {
    expect(getOccurrencePlanningState({
      occurrence,
      segments: [segment("removed-segment", "shift-removed", "08:00", "16:00", "removed")],
      shifts: [{ id: "shift-removed", required_count: 1, status: "draft" }],
      assignments: [{ id: "assignment-removed", planning_shift_id: "shift-removed", slot_index: 0, status: "removed" }],
    })).toEqual({
      coverage: {
        allocatedMinutes: 0,
        requiredMinutes: 480,
        remainingMinutes: 480,
        status: "open",
        segmentCount: 0,
      },
      linkedShiftIds: [],
      requiredSlots: 0,
      assignedSlots: 0,
      openSlots: 0,
      readiness: "unplanned",
    });
  });

  it("aggregeert dekking en open plaatsen over meerdere gekoppelde diensten en negeert removed records", () => {
    const state = getOccurrencePlanningState({
      occurrence,
      segments: [
        segment("morning", "shift-morning", "08:00", "12:00"),
        segment("evening", "shift-evening", "12:00", "16:00", "published"),
        segment("removed-duplicate", "shift-removed", "08:00", "16:00", "removed"),
      ],
      shifts: [
        { id: "shift-morning", required_count: 2, status: "draft" },
        { id: "shift-evening", required_count: 1, status: "published" },
        { id: "shift-removed", required_count: 10, status: "draft" },
      ],
      assignments: [
        { id: "morning-slot-0", planning_shift_id: "shift-morning", slot_index: 0, status: "draft" },
        { id: "morning-slot-1-removed", shift_id: "shift-morning", slot_index: 1, status: "removed" },
        { id: "evening-slot-0", shift_id: "shift-evening", slot_index: 0, status: "published" },
        { id: "unrelated", shift_id: "shift-other", slot_index: 0, status: "draft" },
      ],
    });

    expect(state).toEqual({
      coverage: {
        allocatedMinutes: 480,
        requiredMinutes: 480,
        remainingMinutes: 0,
        status: "full",
        segmentCount: 2,
      },
      linkedShiftIds: ["shift-morning", "shift-evening"],
      requiredSlots: 3,
      assignedSlots: 2,
      openSlots: 1,
      readiness: "needs_staffing",
    });
  });

  it("is pas ready wanneer de occurrence volledig gedekt en iedere gekoppelde dienst volledig bezet is", () => {
    const state = getOccurrencePlanningState({
      occurrence,
      segments: [
        segment("morning", "shift-morning", "08:00", "12:00"),
        segment("evening", "shift-evening", "12:00", "16:00"),
      ],
      shifts: [
        { id: "shift-morning", required_count: 1, status: "draft" },
        { id: "shift-evening", required_count: 1, status: "draft" },
      ],
      assignments: [
        { id: "morning-slot", planning_shift_id: "shift-morning", slot_index: 0, status: "draft" },
        { id: "evening-slot", planning_shift_id: "shift-evening", slot_index: 0, status: "draft" },
      ],
    });

    expect(state.coverage.status).toBe("full");
    expect(state.openSlots).toBe(0);
    expect(state.readiness).toBe("ready");
  });

  it("blijft needs_staffing wanneer de bezetting compleet is maar de occurrence slechts deels gedekt is", () => {
    const state = getOccurrencePlanningState({
      occurrence,
      segments: [segment("morning", "shift-morning", "08:00", "12:00")],
      shifts: [{ id: "shift-morning", required_count: 1, status: "draft" }],
      assignments: [{ id: "morning-slot", shift_id: "shift-morning", slot_index: 0, status: "draft" }],
    });

    expect(state.coverage).toMatchObject({
      status: "partial",
      allocatedMinutes: 240,
      remainingMinutes: 240,
    });
    expect(state.openSlots).toBe(0);
    expect(state.readiness).toBe("needs_staffing");
  });

  it("gebruikt een open plaats alleen bij volledige tijddekking en slaat een dubbele medewerker over", () => {
    const shifts = [
      { id: "shift-morning", service_date: occurrence.service_date, start_time: "08:00", required_count: 2, status: "draft" },
      { id: "shift-evening", service_date: occurrence.service_date, start_time: "12:00", required_count: 1, status: "draft" },
    ];
    const segments = [
      segment("morning", "shift-morning", "08:00", "12:00"),
      segment("evening", "shift-evening", "12:00", "16:00"),
    ];
    const assignments = [{
      id: "already-assigned",
      planning_shift_id: "shift-morning",
      personnel_id: "personnel-1",
      slot_index: 0,
      status: "draft",
    }];

    expect(getOccurrenceStaffingTarget({
      occurrence,
      personnelId: "personnel-1",
      shifts,
      segments,
      assignments,
    })).toEqual({ shiftId: "shift-evening", slotIndex: 0 });

    expect(getOccurrenceStaffingTarget({
      occurrence,
      personnelId: "personnel-2",
      shifts: [shifts[0]],
      segments: [segments[0]],
      assignments: [],
    })).toBeNull();

    expect(getOccurrenceOpenStaffingShift({
      occurrence,
      shifts,
      segments,
      assignments,
    })).toEqual(shifts[0]);
  });

  it("wijst via een dagdrop nooit stilzwijgend een kalenderdag-overschrijdende dienst toe", () => {
    const overnightOccurrence = {
      ...occurrence,
      service_date: "2027-01-03",
      end_date: "2027-01-04",
      window_start_time: "23:00",
      window_end_time: "01:00",
      required_minutes: 120,
    };
    const overnightShift = {
      id: "shift-overnight",
      service_date: "2027-01-03",
      end_date: "2027-01-04",
      start_time: "23:00",
      end_time: "01:00",
      required_count: 1,
      status: "draft",
    };
    const overnightSegment = {
      id: "segment-overnight",
      shift_id: overnightShift.id,
      task_occurrence_id: overnightOccurrence.id,
      start_date: "2027-01-03",
      end_date: "2027-01-04",
      start_time: "23:00",
      end_time: "01:00",
      status: "draft",
    };

    expect(getOccurrenceStaffingTarget({
      occurrence: overnightOccurrence,
      personnelId: "personnel-2",
      serviceDate: "2027-01-04",
      shifts: [overnightShift],
      segments: [overnightSegment],
      assignments: [],
    })).toBeNull();
  });

  it("begrenst een time-window drop cumulatief tot de werkelijk vereiste minuten", () => {
    const timeWindow = {
      ...occurrence,
      id: "occurrence-one-hour-window",
      execution_mode: "time_window",
      required_minutes: 60,
    };
    const ranges = getOccurrenceRemainingAllocationRanges(timeWindow, [], []);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.getHours()).toBe(8);
    expect(ranges[0].end.getHours()).toBe(9);
  });
});

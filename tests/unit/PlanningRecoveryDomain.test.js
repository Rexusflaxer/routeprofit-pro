import { describe, expect, it } from "vitest";
import {
  getSharedBoundaryRepairRetryDelay,
  resolveEffectiveSharedBoundaryPlanning,
} from "@/components/planning/planningRecoveryDomain";

function fixture({ phase = "prepared", effectiveView = "before" } = {}) {
  const before = {
    shifts: [
      { id: "early", start_time: "10:00", end_time: "14:00", revision: 1 },
      { id: "late", start_time: "14:00", end_time: "18:00", revision: 1 },
    ],
    segments: [
      { id: "early-segment", shift_id: "early", start_time: "10:00", end_time: "14:00", revision: 1 },
      { id: "late-segment", shift_id: "late", start_time: "14:00", end_time: "18:00", revision: 1 },
    ],
    assignments: [{ id: "assignment-early", shift_id: "early", personnel_id: "personnel-1", revision: 1 }],
  };
  const target = {
    shifts: [
      { ...before.shifts[0], end_time: "15:00" },
      { ...before.shifts[1], start_time: "15:00" },
    ],
    segments: [
      { ...before.segments[0], end_time: "15:00" },
      { ...before.segments[1], start_time: "15:00" },
    ],
    assignments: before.assignments,
  };
  return {
    before,
    target,
    occurrence: {
      id: "occurrence-1",
      metadata: {
        shared_boundary_mutation: {
          phase,
          effective_view: effectiveView,
          before_state: before,
          target_state: target,
        },
      },
    },
  };
}

describe("planning boundary recovery projection", () => {
  it("toont vóór het commitpunt de complete oude grens in plaats van een raw gat", () => {
    const { occurrence, before } = fixture();
    const resolved = resolveEffectiveSharedBoundaryPlanning({
      occurrences: [occurrence],
      shifts: [before.shifts[0], { ...before.shifts[1], start_time: "15:00", revision: 2 }],
      segments: [before.segments[0], { ...before.segments[1], start_time: "15:00", revision: 2 }],
      assignments: before.assignments,
    });

    expect(resolved.shifts.map(item => [item.start_time, item.end_time])).toEqual([
      ["10:00", "14:00"],
      ["14:00", "18:00"],
    ]);
    expect(resolved.segments.map(item => [item.start_time, item.end_time])).toEqual([
      ["10:00", "14:00"],
      ["14:00", "18:00"],
    ]);
    expect(resolved.pendingResourceKeys).toEqual(new Set([
      "occurrence:occurrence-1",
      "shift:early",
      "shift:late",
      "personnel:personnel-1",
    ]));
  });

  it("toont na het commitpunt de complete doelgrens totdat audit-herstel klaar is", () => {
    const { occurrence, before, target } = fixture({ phase: "applied_audit_pending", effectiveView: "target" });
    const resolved = resolveEffectiveSharedBoundaryPlanning({
      occurrences: [occurrence],
      shifts: before.shifts,
      segments: before.segments,
      assignments: before.assignments,
    });

    expect(resolved.shifts.map(item => [item.start_time, item.end_time])).toEqual([
      ["10:00", "15:00"],
      ["15:00", "18:00"],
    ]);
    expect(resolved.segments).toEqual(expect.arrayContaining(
      target.segments.map(segment => expect.objectContaining(segment)),
    ));
  });

  it("laat voltooide operaties ongemoeid en vergrendelt niets", () => {
    const { occurrence, target } = fixture({ phase: "completed", effectiveView: "target" });
    const rawShifts = [{ ...target.shifts[0], revision: 8 }, { ...target.shifts[1], revision: 9 }];
    const resolved = resolveEffectiveSharedBoundaryPlanning({ occurrences: [occurrence], shifts: rawShifts });

    expect(resolved.shifts).toEqual(rawShifts);
    expect(resolved.pendingResourceKeys.size).toBe(0);
  });

  it("plant automatisch herstel net na de vroegste verlopen serverlease", () => {
    const now = Date.parse("2026-08-13T12:00:00.000Z");
    expect(getSharedBoundaryRepairRetryDelay([
      { retry_after: "2026-08-13T12:02:00.000Z" },
      { retry_after: "2026-08-13T12:01:00.000Z" },
    ], { now })).toBe(60_250);
    expect(getSharedBoundaryRepairRetryDelay([], { now })).toBe(5_000);
  });
});

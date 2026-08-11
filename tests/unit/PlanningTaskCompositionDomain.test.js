import { describe, expect, it } from "vitest";
import {
  getOccurrenceRemainingRanges,
  getTaskOccurrenceCoverage,
  taskCoverageSummary,
  toDateKey,
  validateTaskComposition,
  validateTaskSegmentAllocations,
} from "@/components/planning/planningDomain";

const occurrence = {
  id: "occurrence-day",
  lifecycle_status: "active",
  service_date: "2026-08-17",
  end_date: "2026-08-17",
  window_start_time: "08:00",
  window_end_time: "16:00",
  required_minutes: 480,
};

const segment = (id, shiftId, start, end, overrides = {}) => ({
  id,
  shift_id: shiftId,
  task_occurrence_id: occurrence.id,
  start_date: occurrence.service_date,
  end_date: occurrence.service_date,
  start_time: start,
  end_time: end,
  sequence_index: 0,
  status: "draft",
  object_id: "object-1",
  task_name_snapshot: "Receptiedienst",
  ...overrides,
});

describe("taakdekking over diensten", () => {
  it("vult één taak met twee aansluitende diensten zonder dubbele minuten", () => {
    const segments = [
      segment("morning", "shift-morning", "08:00", "12:00"),
      segment("evening", "shift-evening", "12:00", "16:00"),
    ];

    expect(getTaskOccurrenceCoverage(occurrence, segments)).toEqual({
      allocatedMinutes: 480,
      requiredMinutes: 480,
      remainingMinutes: 0,
      status: "full",
      segmentCount: 2,
    });
    expect(getOccurrenceRemainingRanges(occurrence, segments)).toEqual([]);
  });

  it("rekent overlappende minuten als unie en houdt het resterende tijdvak zichtbaar", () => {
    const segments = [
      segment("first", "shift-1", "08:00", "12:00"),
      segment("overlap", "shift-2", "11:00", "14:00"),
    ];
    const coverage = getTaskOccurrenceCoverage(occurrence, segments);
    const remaining = getOccurrenceRemainingRanges(occurrence, segments);

    expect(coverage).toMatchObject({ allocatedMinutes: 360, remainingMinutes: 120, status: "partial" });
    expect(remaining).toHaveLength(1);
    expect(toDateKey(remaining[0].start)).toBe("2026-08-17");
    expect(remaining[0].start.getHours()).toBe(14);
    expect(remaining[0].end.getHours()).toBe(16);
  });

  it("vat open, deels en volledig geplande taken samen", () => {
    const occurrences = [
      occurrence,
      { ...occurrence, id: "partial", required_minutes: 240 },
      { ...occurrence, id: "open", required_minutes: 60 },
    ];
    const segments = [
      segment("full", "shift-1", "08:00", "16:00"),
      segment("partial-segment", "shift-2", "08:00", "09:00", { task_occurrence_id: "partial" }),
    ];

    expect(taskCoverageSummary(occurrences, segments)).toMatchObject({
      full: 1,
      partial: 1,
      open: 1,
      requiredMinutes: 780,
      allocatedMinutes: 540,
      remainingMinutes: 240,
    });
  });
});

describe("samengestelde dienst", () => {
  it("accepteert aansluitende taken en signaleert alleen de objectovergang", () => {
    const result = validateTaskComposition([
      segment("reception", "shift-combined", "15:30", "18:15", { sequence_index: 0 }),
      segment("rounds", "shift-combined", "18:15", "23:30", {
        sequence_index: 1,
        task_occurrence_id: "occurrence-rounds",
        object_id: "object-2",
        task_name_snapshot: "Losse rondes",
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "object_transition_review" }));
  });

  it("blokkeert overlappende taaksegmenten", () => {
    const result = validateTaskComposition([
      segment("first", "shift-combined", "15:30", "18:30", { sequence_index: 0 }),
      segment("second", "shift-combined", "18:15", "23:30", { sequence_index: 1, task_occurrence_id: "other" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "segment_overlap" }));
  });

  it("blokkeert een segment buiten het vaste taakvenster al lokaal", () => {
    const result = validateTaskSegmentAllocations({
      occurrences: [occurrence],
      segments: [segment("outside", "shift-new", "07:00", "15:00")],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: expect.stringContaining("segment_outside_occurrence_window"),
      segmentId: "outside",
    }));
  });

  it("blokkeert overlap met een segment in een andere dienst maar staat aansluiting toe", () => {
    const existing = segment("morning", "shift-morning", "08:00", "12:00");
    const overlap = validateTaskSegmentAllocations({
      occurrences: [occurrence],
      externalSegments: [existing],
      segments: [segment("overlap", "shift-evening", "11:00", "15:00")],
    });
    const adjacent = validateTaskSegmentAllocations({
      occurrences: [occurrence],
      externalSegments: [existing],
      segments: [segment("adjacent", "shift-evening", "12:00", "16:00")],
    });

    expect(overlap.valid).toBe(false);
    expect(overlap.errors).toContainEqual(expect.objectContaining({
      code: expect.stringContaining("segment_overlaps_existing"),
    }));
    expect(adjacent).toEqual({ valid: true, errors: [] });
  });
});

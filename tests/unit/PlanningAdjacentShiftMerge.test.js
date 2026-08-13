import { describe, expect, it } from "vitest";
import { findSamePersonnelAdjacentShiftMerge } from "@/components/planning/planningAdjacentShiftMerge";

function fixture(overrides = {}) {
  const shift = {
    id: "shift-morning",
    source_type: "task",
    service_date: "2026-08-17",
    end_date: "2026-08-17",
    start_time: "10:00",
    end_time: "14:00",
    required_count: 1,
    status: "draft",
    revision: 4,
    ...overrides.shift,
  };
  const segment = {
    id: "segment-morning",
    shift_id: shift.id,
    task_occurrence_id: "occurrence-reception",
    start_date: "2026-08-17",
    end_date: "2026-08-17",
    start_time: "10:00",
    end_time: "14:00",
    status: "draft",
    revision: 6,
    ...overrides.segment,
  };
  const assignment = {
    id: "assignment-morning",
    shift_id: shift.id,
    personnel_id: "personnel-1",
    slot_index: 0,
    status: "draft",
    revision: 3,
    ...overrides.assignment,
  };
  return {
    occurrenceId: "occurrence-reception",
    personnelId: "personnel-1",
    proposedSegment: {
      task_occurrence_id: "occurrence-reception",
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "14:00",
      end_time: "18:00",
      ...overrides.proposedSegment,
    },
    shifts: [shift, ...(overrides.extraShifts || [])],
    segments: [segment, ...(overrides.extraSegments || [])],
    assignments: [assignment, ...(overrides.extraAssignments || [])],
  };
}

describe("same-person adjacent task shift merge", () => {
  it("vindt exact één aansluitende dienst en retourneert de union plus fences", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture());

    expect(result).toEqual({
      status: "merge",
      reason: null,
      candidate: expect.objectContaining({
        direction: "append",
        mergedSegment: {
          task_occurrence_id: "occurrence-reception",
          start_date: "2026-08-17",
          end_date: "2026-08-17",
          start_time: "10:00",
          end_time: "18:00",
        },
        durationMinutes: 480,
        expectedRevisions: { shift: 4, segment: 6, assignment: 3 },
      }),
    });
  });

  it("kan een voorgesteld deel aan de voorkant samenvoegen", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture({
      proposedSegment: { start_time: "06:00", end_time: "10:00" },
    }));

    expect(result.candidate).toMatchObject({
      direction: "prepend",
      mergedSegment: { start_time: "06:00", end_time: "14:00" },
    });
  });

  it("weigert een shift met meerdere segmenten, assignments of bezettingsplaatsen", () => {
    const multiSegment = fixture({
      extraSegments: [{
        id: "segment-other",
        shift_id: "shift-morning",
        task_occurrence_id: "occurrence-other",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "09:00",
        end_time: "10:00",
        status: "draft",
      }],
    });
    expect(findSamePersonnelAdjacentShiftMerge(multiSegment).status).toBe("none");
    expect(findSamePersonnelAdjacentShiftMerge(fixture({ shift: { required_count: 2 } })).status).toBe("none");
    expect(findSamePersonnelAdjacentShiftMerge(fixture({
      extraAssignments: [{
        id: "assignment-2",
        shift_id: "shift-morning",
        personnel_id: "personnel-2",
        status: "draft",
      }],
    })).status).toBe("none");
  });

  it("vereist dezelfde occurrence en dezelfde medewerker", () => {
    expect(findSamePersonnelAdjacentShiftMerge(fixture({
      assignment: { personnel_id: "personnel-2" },
    })).status).toBe("none");
    expect(findSamePersonnelAdjacentShiftMerge(fixture({
      segment: { task_occurrence_id: "occurrence-other" },
    })).status).toBe("none");
  });

  it("weigert een overlap met bestaande dekking voordat er een merge wordt voorgesteld", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture({
      proposedSegment: { start_time: "13:00", end_time: "18:00" },
    }));

    expect(result).toMatchObject({
      status: "blocked",
      reason: "proposal_overlaps_existing_coverage",
      conflictingSegmentIds: ["segment-morning"],
    });
  });

  it("weigert ambiguiteit wanneer de voorgestelde tijd tussen twee geschikte diensten ligt", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture({
      extraShifts: [{
        id: "shift-evening",
        source_type: "task",
        service_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "18:00",
        end_time: "20:00",
        required_count: 1,
        status: "draft",
      }],
      extraSegments: [{
        id: "segment-evening",
        shift_id: "shift-evening",
        task_occurrence_id: "occurrence-reception",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
        start_time: "18:00",
        end_time: "20:00",
        status: "draft",
      }],
      extraAssignments: [{
        id: "assignment-evening",
        shift_id: "shift-evening",
        personnel_id: "personnel-1",
        status: "draft",
      }],
    }));

    expect(result).toEqual({
      status: "ambiguous",
      reason: "multiple_eligible_adjacent_shifts",
      candidate: null,
      candidateShiftIds: ["shift-evening", "shift-morning"],
    });
  });

  it("ondersteunt een aansluiting over middernacht zonder 24:00 in API-data", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture({
      shift: {
        service_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "20:00",
        end_time: "00:00",
      },
      segment: {
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "20:00",
        end_time: "00:00",
      },
      proposedSegment: {
        start_date: "2026-08-18",
        end_date: "2026-08-18",
        start_time: "00:00",
        end_time: "04:00",
      },
    }));

    expect(result.candidate).toMatchObject({
      direction: "append",
      mergedSegment: {
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "20:00",
        end_time: "04:00",
      },
      durationMinutes: 480,
    });
  });

  it("maakt door automatisch samenvoegen nooit stilzwijgend een dienst langer dan twaalf uur", () => {
    const result = findSamePersonnelAdjacentShiftMerge(fixture({
      shift: { start_time: "06:00", end_time: "18:00" },
      segment: { start_time: "06:00", end_time: "18:00" },
      proposedSegment: { start_time: "18:00", end_time: "22:00" },
    }));

    expect(result).toMatchObject({
      status: "blocked",
      reason: "merged_shift_exceeds_automatic_limit",
      durationMinutes: 960,
      maximumDurationMinutes: 720,
    });
  });
});

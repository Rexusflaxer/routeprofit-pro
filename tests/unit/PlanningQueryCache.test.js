import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyPlanningMutationResultToCache } from "@/components/planning/planningQueryCache";

const periodStart = "2026-08-17";
const periodEnd = "2026-08-23";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe("planning mutation query-cache reconciliation", () => {
  it("upsert een samengesteld resultaat direct in alle bijbehorende planningqueries", () => {
    const queryClient = createQueryClient();
    const shiftsKey = ["planning-shifts", periodStart, periodEnd];
    const occurrencesKey = ["planning-task-occurrences", periodStart, periodEnd];
    const otherPeriodKey = ["planning-shifts", "2026-08-24", "2026-08-30"];

    queryClient.setQueryData(shiftsKey, [{ id: "shift-existing", name: "Bestaande dienst" }]);
    queryClient.setQueryData(["planning-assignments"], [{ id: "assignment-existing", status: "assigned" }]);
    queryClient.setQueryData(["planning-task-segments"], [{ id: "segment-existing", shift_id: "shift-existing" }]);
    queryClient.setQueryData(occurrencesKey, [{ id: "occurrence-new", coverage_status: "open", revision: 1 }]);
    queryClient.setQueryData(otherPeriodKey, [{ id: "shift-other-period" }]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      result: {
        shift: { id: "shift-new", name: "Receptiedienst", status: "draft" },
        assignment: {
          id: "assignment-new",
          planning_shift_id: "shift-new",
          personnel_id: "personnel-anna",
          status: "assigned",
        },
        segments: [{
          id: "segment-new",
          shift_id: "shift-new",
          task_occurrence_id: "occurrence-new",
          start_time: "06:00",
          end_time: "12:00",
        }],
        task_occurrences: [{
          id: "occurrence-new",
          coverage_status: "partially_covered",
          covered_minutes: 360,
        }],
      },
    });

    expect(queryClient.getQueryData(shiftsKey)).toEqual([
      { id: "shift-existing", name: "Bestaande dienst" },
      { id: "shift-new", name: "Receptiedienst", status: "draft" },
    ]);
    expect(queryClient.getQueryData(["planning-assignments"])).toEqual([
      { id: "assignment-existing", status: "assigned" },
      expect.objectContaining({ id: "assignment-new", planning_shift_id: "shift-new" }),
    ]);
    expect(queryClient.getQueryData(["planning-task-segments"])).toEqual([
      { id: "segment-existing", shift_id: "shift-existing" },
      expect.objectContaining({ id: "segment-new", shift_id: "shift-new" }),
    ]);
    expect(queryClient.getQueryData(occurrencesKey)).toEqual([
      {
        id: "occurrence-new",
        coverage_status: "partially_covered",
        revision: 1,
        covered_minutes: 360,
      },
    ]);
    expect(queryClient.getQueryData(otherPeriodKey)).toEqual([{ id: "shift-other-period" }]);
  });

  it("werkt alle actieve range-scoped assignment- en segmentqueries direct bij", () => {
    const queryClient = createQueryClient();
    const assignmentsKey = ["planning-assignments", periodStart, periodEnd, "shift-a|shift-b"];
    const segmentsKey = ["planning-task-segments", periodStart, periodEnd, "shift-a|shift-b"];
    queryClient.setQueryData(assignmentsKey, [{ id: "assignment-a", shift_id: "shift-a" }]);
    queryClient.setQueryData(segmentsKey, [{ id: "segment-a", shift_id: "shift-a" }]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      result: {
        assignment: { id: "assignment-b", shift_id: "shift-b", status: "draft" },
        segment: { id: "segment-b", shift_id: "shift-b", status: "draft" },
      },
    });

    expect(queryClient.getQueryData(assignmentsKey)).toEqual([
      { id: "assignment-a", shift_id: "shift-a" },
      { id: "assignment-b", shift_id: "shift-b", status: "draft" },
    ]);
    expect(queryClient.getQueryData(segmentsKey)).toEqual([
      { id: "segment-a", shift_id: "shift-a" },
      { id: "segment-b", shift_id: "shift-b", status: "draft" },
    ]);
  });

  it("ververst overlappende range-caches alleen voor records die daar al bestaan", () => {
    const queryClient = createQueryClient();
    const currentShiftKey = ["planning-shifts", periodStart, periodEnd];
    const overlappingShiftKey = ["planning-shifts", "2026-08-16", "2026-08-22"];
    const overlappingAssignmentsKey = [
      "planning-assignments",
      "2026-08-16",
      "2026-08-22",
      "shift-night",
    ];
    const otherAssignmentsKey = ["planning-assignments", "2026-09-01", "2026-09-28", "shift-other"];
    queryClient.setQueryData(currentShiftKey, [{ id: "shift-night", end_time: "01:00", revision: 2 }]);
    queryClient.setQueryData(overlappingShiftKey, [{ id: "shift-night", end_time: "01:00", revision: 2 }]);
    queryClient.setQueryData(overlappingAssignmentsKey, []);
    queryClient.setQueryData(otherAssignmentsKey, [{ id: "assignment-other", shift_id: "shift-other" }]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      result: {
        shift: { id: "shift-night", end_time: "02:00", revision: 3 },
        assignment: { id: "assignment-night", shift_id: "shift-night", status: "draft" },
      },
    });

    expect(queryClient.getQueryData(overlappingShiftKey)).toEqual([
      { id: "shift-night", end_time: "02:00", revision: 3 },
    ]);
    expect(queryClient.getQueryData(overlappingAssignmentsKey)).toEqual([
      { id: "assignment-night", shift_id: "shift-night", status: "draft" },
    ]);
    expect(queryClient.getQueryData(otherAssignmentsKey)).toEqual([
      { id: "assignment-other", shift_id: "shift-other" },
    ]);
  });

  it("vervangt bij resize alleen de segmenten van de gewijzigde dienst", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["planning-task-segments"], [
      { id: "segment-old-a", shift_id: "shift-resized", start_time: "06:00", end_time: "10:00" },
      { id: "segment-old-b", shift_id: "shift-resized", start_time: "10:00", end_time: "14:00" },
      { id: "segment-other", shift_id: "shift-untouched", start_time: "14:00", end_time: "20:00" },
    ]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      replaceShiftSegments: true,
      result: {
        shift: { id: "shift-resized", start_time: "06:00", end_time: "12:00" },
        segments: [{
          id: "segment-resized",
          shift_id: "shift-resized",
          start_time: "06:00",
          end_time: "12:00",
        }],
      },
    });

    expect(queryClient.getQueryData(["planning-task-segments"])).toEqual([
      { id: "segment-other", shift_id: "shift-untouched", start_time: "14:00", end_time: "20:00" },
      { id: "segment-resized", shift_id: "shift-resized", start_time: "06:00", end_time: "12:00" },
    ]);
  });

  it("verwerkt een autoritatieve grensmutatie voor meerdere diensten in één cache-update", () => {
    const queryClient = createQueryClient();
    const shiftsKey = ["planning-shifts", periodStart, periodEnd];
    queryClient.setQueryData(shiftsKey, [
      { id: "shift-early", start_time: "10:00", end_time: "14:00", revision: 2 },
      { id: "shift-late", start_time: "14:00", end_time: "18:00", revision: 3 },
      { id: "shift-untouched", start_time: "18:00", end_time: "22:00", revision: 1 },
    ]);
    queryClient.setQueryData(["planning-assignments"], [
      { id: "assignment-early", shift_id: "shift-early", status: "draft" },
      { id: "assignment-late-old", shift_id: "shift-late", status: "draft" },
      { id: "assignment-untouched", shift_id: "shift-untouched", status: "draft" },
    ]);
    queryClient.setQueryData(["planning-task-segments"], [
      { id: "segment-early-old", shift_id: "shift-early", start_time: "10:00", end_time: "14:00" },
      { id: "segment-late-old", shift_id: "shift-late", start_time: "14:00", end_time: "18:00" },
      { id: "segment-untouched", shift_id: "shift-untouched", start_time: "18:00", end_time: "22:00" },
    ]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      replaceShiftSegments: true,
      result: {
        shifts: [
          { id: "shift-early", end_time: "15:00", revision: 3 },
          { id: "shift-late", start_time: "15:00", revision: 4 },
        ],
        assignments: [
          { id: "assignment-early", shift_id: "shift-early", status: "draft", revision: 3 },
          { id: "assignment-late", shift_id: "shift-late", status: "draft", revision: 1 },
        ],
        removed_assignment_ids: ["assignment-late-old"],
        segments: [
          { id: "segment-early", shift_id: "shift-early", start_time: "10:00", end_time: "15:00" },
          { id: "segment-late", shift_id: "shift-late", start_time: "15:00", end_time: "18:00" },
        ],
        removed_segment_ids: ["segment-early-old", "segment-late-old"],
      },
    });

    expect(queryClient.getQueryData(shiftsKey)).toEqual([
      { id: "shift-early", start_time: "10:00", end_time: "15:00", revision: 3 },
      { id: "shift-late", start_time: "15:00", end_time: "18:00", revision: 4 },
      { id: "shift-untouched", start_time: "18:00", end_time: "22:00", revision: 1 },
    ]);
    expect(queryClient.getQueryData(["planning-assignments"])).toEqual([
      { id: "assignment-early", shift_id: "shift-early", status: "draft", revision: 3 },
      { id: "assignment-late-old", shift_id: "shift-late", status: "removed" },
      { id: "assignment-untouched", shift_id: "shift-untouched", status: "draft" },
      { id: "assignment-late", shift_id: "shift-late", status: "draft", revision: 1 },
    ]);
    expect(queryClient.getQueryData(["planning-task-segments"])).toEqual([
      { id: "segment-untouched", shift_id: "shift-untouched", start_time: "18:00", end_time: "22:00" },
      { id: "segment-early", shift_id: "shift-early", start_time: "10:00", end_time: "15:00" },
      { id: "segment-late", shift_id: "shift-late", start_time: "15:00", end_time: "18:00" },
    ]);
  });

  it("markeert verwijderde assignment- en segmentrecords als removed", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["planning-assignments"], [
      { id: "assignment-removed", status: "assigned", personnel_id: "personnel-anna" },
      { id: "assignment-kept", status: "assigned", personnel_id: "personnel-boris" },
    ]);
    queryClient.setQueryData(["planning-task-segments"], [
      { id: "segment-removed", shift_id: "shift-a", status: "draft" },
      { id: "segment-kept", shift_id: "shift-b", status: "published" },
    ]);

    applyPlanningMutationResultToCache(queryClient, {
      periodStart,
      periodEnd,
      result: {
        removed_assignment_ids: ["assignment-removed"],
        removed_segment_ids: ["segment-removed"],
      },
    });

    expect(queryClient.getQueryData(["planning-assignments"])).toEqual([
      { id: "assignment-removed", status: "removed", personnel_id: "personnel-anna" },
      { id: "assignment-kept", status: "assigned", personnel_id: "personnel-boris" },
    ]);
    expect(queryClient.getQueryData(["planning-task-segments"])).toEqual([
      { id: "segment-removed", shift_id: "shift-a", status: "removed" },
      { id: "segment-kept", shift_id: "shift-b", status: "published" },
    ]);
  });
});

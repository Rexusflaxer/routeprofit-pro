import { describe, expect, it } from "vitest";
import {
  buildEffectivePlanningPlan,
  rebaseDependentPlanningIntent,
  reconcilePlanningSnapshot,
  resolveQueuedOccurrenceMutation,
  resolveQueuedShiftAssignment,
} from "@/components/planning/planningEffectivePlan";

describe("effective lokale planning", () => {
  it("projecteert queued shifts, medewerkers en taaksegmenten in één consistente snapshot", () => {
    const authoritative = {
      shifts: [{ id: "shift-existing", status: "draft" }],
      assignments: [],
      segments: [],
    };
    const pending = {
      key: "intent-1",
      shifts: [{ id: "pending-shift-intent-1", status: "draft", _optimistic_pending: true }],
      assignments: [{ id: "pending-assignment-intent-1", shift_id: "pending-shift-intent-1", personnel_id: "person-1" }],
      segments: [{ id: "pending-segment-intent-1", shift_id: "pending-shift-intent-1", task_occurrence_id: "occurrence-1" }],
    };

    const result = buildEffectivePlanningPlan({ ...authoritative, intents: [pending] });

    expect(result.shifts.map(item => item.id)).toEqual(["shift-existing", "pending-shift-intent-1"]);
    expect(result.assignments).toEqual([expect.objectContaining({ personnel_id: "person-1" })]);
    expect(result.segments).toEqual([expect.objectContaining({ task_occurrence_id: "occurrence-1" })]);
    expect(result.pendingIntentCount).toBe(1);
    expect(authoritative.shifts).toEqual([{ id: "shift-existing", status: "draft" }]);
  });

  it("laat een teruggedraaide intent weg zonder andere pending intent te verwijderen", () => {
    const result = buildEffectivePlanningPlan({
      intents: [
        { key: "failed", status: "failed", shifts: [{ id: "failed-shift" }] },
        { key: "next", status: "queued", shifts: [{ id: "next-shift" }] },
      ],
    });

    expect(result.shifts).toEqual([{ id: "next-shift" }]);
    expect(result.pendingIntentCount).toBe(1);
  });

  it("overschrijft een record met hetzelfde id zonder duplicaten", () => {
    const result = buildEffectivePlanningPlan({
      shifts: [{ id: "shift-1", start_time: "08:00", revision: 2 }],
      intents: [{ shifts: [{ id: "shift-1", start_time: "09:00", _optimistic_pending: true }] }],
    });

    expect(result.shifts).toEqual([{
      id: "shift-1",
      start_time: "09:00",
      revision: 2,
      _optimistic_pending: true,
    }]);
  });

  it("rebased medewerker 2 bij een 24/7-split op het resterende gat en de nieuwste occurrence-revisie", () => {
    const occurrence = {
      id: "occurrence-24h",
      revision: 7,
      service_date: "2026-08-24",
      end_date: "2026-08-25",
      window_start_time: "00:00",
      window_end_time: "00:00",
      execution_mode: "continuous",
      required_minutes: 1440,
    };
    let snapshot = { shifts: [], assignments: [], segments: [], occurrences: [occurrence] };
    const first = resolveQueuedOccurrenceMutation({
      snapshot,
      occurrenceId: occurrence.id,
      personnelId: "employee-1",
      personnelName: "Medewerker 1",
      serviceDate: "2026-08-24",
      preferredSegment: {
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "00:00",
        end_time: "12:00",
      },
    });
    expect(first).toMatchObject({
      status: "ready",
      kind: "compose",
      payload: {
        personnel_id: "employee-1",
        expected_occurrence_revisions: { [occurrence.id]: 7 },
        segments: [{ start_time: "00:00", end_time: "12:00" }],
      },
    });

    snapshot = reconcilePlanningSnapshot(snapshot, {
      shift: {
        id: "shift-first-half",
        revision: 3,
        source_type: "task",
        status: "draft",
        required_count: 1,
        service_date: "2026-08-24",
        start_time: "00:00",
        end_time: "12:00",
      },
      assignment: {
        id: "assignment-first-half",
        planning_shift_id: "shift-first-half",
        personnel_id: "employee-1",
        slot_index: 0,
        status: "draft",
      },
      segments: [{
        id: "segment-first-half",
        revision: 1,
        shift_id: "shift-first-half",
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "00:00",
        end_time: "12:00",
        status: "draft",
      }],
      task_occurrences: [{ ...occurrence, revision: 8 }],
    });
    const second = resolveQueuedOccurrenceMutation({
      snapshot,
      occurrenceId: occurrence.id,
      personnelId: "employee-2",
      personnelName: "Medewerker 2",
      serviceDate: "2026-08-24",
      preferredSegment: {
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-25",
        start_time: "12:00",
        end_time: "00:00",
      },
    });
    expect(second).toMatchObject({
      status: "ready",
      kind: "compose",
      payload: {
        personnel_id: "employee-2",
        expected_occurrence_revisions: { [occurrence.id]: 8 },
        segments: [{
          start_date: "2026-08-24",
          end_date: "2026-08-25",
          start_time: "12:00",
          end_time: "00:00",
        }],
      },
    });
  });

  it("verlengt bij dezelfde medewerker na reconcile één aansluitende dienst", () => {
    const occurrence = {
      id: "occurrence-adjacent",
      revision: 5,
      service_date: "2026-08-24",
      end_date: "2026-08-24",
      window_start_time: "06:00",
      window_end_time: "18:00",
      execution_mode: "continuous",
      required_minutes: 720,
    };
    const snapshot = {
      occurrences: [occurrence],
      shifts: [{
        id: "shift-morning",
        revision: 4,
        source_type: "task",
        status: "draft",
        required_count: 1,
        service_date: "2026-08-24",
        start_time: "06:00",
        end_time: "12:00",
      }],
      assignments: [{
        id: "assignment-morning",
        revision: 2,
        planning_shift_id: "shift-morning",
        personnel_id: "employee-1",
        slot_index: 0,
        status: "draft",
      }],
      segments: [{
        id: "segment-morning",
        revision: 3,
        shift_id: "shift-morning",
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:00",
        end_time: "12:00",
        status: "draft",
      }],
    };

    const resolution = resolveQueuedOccurrenceMutation({
      snapshot,
      occurrenceId: occurrence.id,
      personnelId: "employee-1",
      personnelName: "Medewerker 1",
      serviceDate: "2026-08-24",
      preferredSegment: {
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "12:00",
        end_time: "16:00",
      },
    });

    expect(resolution).toMatchObject({
      status: "ready",
      kind: "merge",
      payload: {
        action: "update_shift_composition",
        shift_id: "shift-morning",
        expected_shift_revision: 4,
        expected_occurrence_revisions: { [occurrence.id]: 5 },
        segments: [{ start_time: "06:00", end_time: "16:00" }],
      },
    });
  });

  it("toont twee snelle drops van dezelfde medewerker direct als één lokale dienstkaart", () => {
    const occurrence = {
      id: "occurrence-local-adjacent",
      revision: 1,
      service_date: "2026-08-24",
      end_date: "2026-08-24",
      window_start_time: "06:00",
      window_end_time: "18:00",
      execution_mode: "continuous",
      required_minutes: 720,
    };
    const firstIntent = {
      key: "first-local",
      shifts: [{
        id: "pending-shift-first-local",
        revision: 1,
        source_type: "task",
        status: "draft",
        required_count: 1,
        service_date: "2026-08-24",
        start_time: "06:00",
        end_time: "12:00",
        _optimistic_pending: true,
      }],
      assignments: [{
        id: "pending-assignment-first-local",
        planning_shift_id: "pending-shift-first-local",
        shift_id: "pending-shift-first-local",
        personnel_id: "employee-1",
        slot_index: 0,
        status: "draft",
        _optimistic_pending: true,
      }],
      segments: [{
        id: "pending-segment-first-local",
        revision: 1,
        shift_id: "pending-shift-first-local",
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:00",
        end_time: "12:00",
        status: "draft",
        _optimistic_pending: true,
      }],
    };
    const firstProjection = buildEffectivePlanningPlan({
      shifts: [],
      assignments: [],
      segments: [],
      intents: [firstIntent],
    });
    const secondResolution = resolveQueuedOccurrenceMutation({
      snapshot: { ...firstProjection, occurrences: [occurrence] },
      occurrenceId: occurrence.id,
      personnelId: "employee-1",
      personnelName: "Medewerker 1",
      serviceDate: "2026-08-24",
      preferredSegment: {
        task_occurrence_id: occurrence.id,
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "12:00",
        end_time: "16:00",
      },
      allowOptimisticAdjacent: true,
    });
    expect(secondResolution).toMatchObject({
      status: "ready",
      kind: "merge",
      adjacent: { candidate: { shift: { id: "pending-shift-first-local" } } },
    });
    const merged = secondResolution.adjacent.candidate.mergedSegment;
    const secondIntent = {
      key: "second-local",
      shifts: [{
        ...secondResolution.adjacent.candidate.shift,
        service_date: merged.start_date,
        start_time: merged.start_time,
        end_time: merged.end_time,
        _optimistic_pending: true,
      }],
      segments: [{
        ...secondResolution.adjacent.candidate.segment,
        ...merged,
        _optimistic_pending: true,
      }],
      assignments: [],
    };
    const projected = buildEffectivePlanningPlan({ intents: [firstIntent, secondIntent] });

    expect(projected.shifts).toHaveLength(1);
    expect(projected.segments).toHaveLength(1);
    expect(projected.assignments).toHaveLength(1);
    expect(projected.shifts[0]).toMatchObject({ start_time: "06:00", end_time: "16:00" });
    expect(projected.segments[0]).toMatchObject({ start_time: "06:00", end_time: "16:00" });
    expect(projected.assignments[0]).toMatchObject({ personnel_id: "employee-1" });

    const savedResult = {
      shift: { ...firstIntent.shifts[0], id: "shift-server", revision: 2, _optimistic_pending: false },
      assignment: { ...firstIntent.assignments[0], id: "assignment-server", planning_shift_id: "shift-server", shift_id: "shift-server", revision: 2, _optimistic_pending: false },
      segments: [{ ...firstIntent.segments[0], id: "segment-server", shift_id: "shift-server", revision: 2, _optimistic_pending: false }],
    };
    const rebasedSecond = rebaseDependentPlanningIntent(secondIntent, firstIntent, savedResult);
    const authoritative = reconcilePlanningSnapshot({ occurrences: [occurrence] }, savedResult);
    const postAckProjection = buildEffectivePlanningPlan({ ...authoritative, intents: [rebasedSecond] });
    expect(postAckProjection.shifts).toHaveLength(1);
    expect(postAckProjection.segments).toHaveLength(1);
    expect(postAckProjection.assignments).toHaveLength(1);
    expect(postAckProjection.shifts[0]).toMatchObject({ id: "shift-server", start_time: "06:00", end_time: "16:00" });
  });

  it("kiest bij required_count twee na reconcile slot 1 en de nieuwste shift-revisie", () => {
    let snapshot = {
      shifts: [{ id: "shift-double", revision: 10, status: "draft", required_count: 2 }],
      assignments: [],
      segments: [],
      occurrences: [],
    };
    const first = resolveQueuedShiftAssignment({
      snapshot,
      shiftId: "shift-double",
      personnelId: "employee-1",
      requestedSlotIndex: 0,
    });
    expect(first).toMatchObject({ status: "ready", slotIndex: 0, expectedShiftRevision: 10 });

    snapshot = reconcilePlanningSnapshot(snapshot, {
      shift: { id: "shift-double", revision: 11, status: "draft", required_count: 2 },
      assignment: {
        id: "assignment-slot-0",
        planning_shift_id: "shift-double",
        personnel_id: "employee-1",
        slot_index: 0,
        status: "draft",
      },
    });
    const second = resolveQueuedShiftAssignment({
      snapshot,
      shiftId: "shift-double",
      personnelId: "employee-2",
      requestedSlotIndex: 0,
    });
    expect(second).toMatchObject({ status: "ready", slotIndex: 1, expectedShiftRevision: 11 });
  });
});

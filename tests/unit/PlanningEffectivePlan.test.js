import { describe, expect, it } from "vitest";
import {
  buildDependentPlanningDeleteIntent,
  buildDependentPlanningResizeIntent,
  buildDependentPlanningUnassignIntent,
  buildDependentPlanningVacateIntent,
  buildEffectivePlanningPlan,
  planningOriginIntentId,
  planningRecordReference,
  rebaseDependentPlanningIntent,
  reconcilePlanningSnapshot,
  resolveOpenShiftSamePersonnelMerge,
  resolvePlanningRecordTarget,
  resolveQueuedOccurrenceMutation,
  resolveQueuedShiftAssignment,
  withPlanningOptimisticIdentity,
  withPlanningOptimisticIntentIdentity,
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

  it("projecteert een optimistische taakkopie direct en houdt de bronoccurrence intact", () => {
    const result = buildEffectivePlanningPlan({
      occurrences: [{ id: "occurrence-source", service_date: "2026-08-24" }],
      intents: [{
        key: "copy-one",
        occurrences: [{
          id: "pending-copy",
          service_date: "2026-08-25",
          lifecycle_status: "active",
          _optimistic_pending: true,
        }],
      }],
    });

    expect(result.occurrences).toEqual([
      expect.objectContaining({ id: "occurrence-source", service_date: "2026-08-24" }),
      expect.objectContaining({ id: "pending-copy", service_date: "2026-08-25" }),
    ]);
  });

  it("geeft records een stabiele planning-ref en herleidbare origin-intent", () => {
    const first = withPlanningOptimisticIdentity(
      { id: "pending-shift", source_key: "client:shift:one" },
      { kind: "shift", originIntentId: "compose-one" },
    );
    const second = withPlanningOptimisticIdentity(first, {
      kind: "shift",
      originIntentId: "resize-one",
    });
    const intent = withPlanningOptimisticIntentIdentity({
      key: "compose-copy",
      occurrences: [{ id: "pending-occurrence" }],
    });

    expect(planningRecordReference(first, "shift")).toBe("compose-one:shift:client:shift:one");
    expect(planningRecordReference(second, "shift")).toBe(planningRecordReference(first, "shift"));
    expect(planningOriginIntentId(second)).toBe("resize-one");
    expect(intent.occurrences[0]).toMatchObject({
      _planning_ref: "compose-copy:occurrence:pending-occurrence",
      _planning_origin_intent_id: "compose-copy",
      _optimistic_pending: true,
    });
  });

  it("resolveert execute-targets strikt via id, source_key of planning-ref", () => {
    const records = [
      { id: "shift-id", source_key: "source-one", _planning_ref: "ref-one" },
      { id: "shift-two", source_key: "source-two", _planning_ref: "ref-two" },
    ];

    expect(resolvePlanningRecordTarget(records, "shift-id", { kind: "shift" })).toMatchObject({
      status: "ready",
      matchedBy: "id",
      record: { id: "shift-id" },
    });
    expect(resolvePlanningRecordTarget(records, { source_key: "source-two" }, { kind: "shift" })).toMatchObject({
      status: "ready",
      matchedBy: "source_key",
      record: { id: "shift-two" },
    });
    expect(resolvePlanningRecordTarget(records, { ref: "ref-one" }, { kind: "shift" })).toMatchObject({
      status: "ready",
      matchedBy: "ref",
      record: { id: "shift-id" },
    });
    expect(resolvePlanningRecordTarget([
      { id: "one", source_key: "duplicate" },
      { id: "two", source_key: "duplicate" },
    ], { source_key: "duplicate" }, { kind: "shift" })).toMatchObject({
      status: "blocked",
      reason: "shift_target_ambiguous",
      matchedBy: "source_key",
    });
  });

  it("maakt bij inkorten meteen een echte open companion-dienst zonder assignment", () => {
    const shift = {
      id: "shift-long",
      revision: 4,
      source_type: "task",
      source_id: "definition-one",
      status: "draft",
      required_count: 1,
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
      task_occurrence_ids: ["occurrence-one"],
    };
    const segment = {
      id: "segment-long",
      revision: 3,
      shift_id: shift.id,
      task_occurrence_id: "occurrence-one",
      start_date: "2026-08-24",
      end_date: "2026-08-24",
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
    };
    const assignment = {
      id: "assignment-one",
      shift_id: shift.id,
      planning_shift_id: shift.id,
      personnel_id: "employee-one",
      slot_index: 0,
      status: "draft",
    };

    const intent = buildDependentPlanningResizeIntent({
      key: "resize-long",
      shift,
      segment,
      assignments: [assignment],
      nextEndTime: "15:30",
    });

    expect(intent).toMatchObject({
      kind: "dependent_resize",
      status: "queued",
      _planning_origin_intent_id: "resize-long",
      shifts: [
        { id: "shift-long", start_time: "06:30", end_time: "15:30", status: "draft" },
        {
          start_time: "15:30",
          end_time: "18:00",
          status: "draft",
          required_count: 1,
          metadata: {
            task_partition_origin: {
              action: "resize_task_shift_preserving_coverage",
              original_shift_id: "shift-long",
              original_segment_id: "segment-long",
              side: "after",
            },
          },
        },
      ],
      segments: [
        { id: "segment-long", start_time: "06:30", end_time: "15:30" },
        {
          start_time: "15:30",
          end_time: "18:00",
          task_occurrence_id: "occurrence-one",
          metadata: {
            task_partition_origin: {
              action: "resize_task_shift_preserving_coverage",
              original_shift_id: "shift-long",
              original_segment_id: "segment-long",
              side: "after",
            },
          },
        },
      ],
      assignments: [{ personnel_id: "employee-one", shift_id: "shift-long" }],
    });
    expect(intent._planning_companion_refs).toEqual([{
      side: "trailing",
      shift: "resize-long:shift:open-trailing",
      segment: "resize-long:segment:open-trailing",
    }]);
    const companionShift = intent.shifts[1];
    expect(planningOriginIntentId(companionShift)).toBe("resize-long");
    expect(intent.assignments.some(item => item.shift_id === companionShift.id)).toBe(false);

    const effective = buildEffectivePlanningPlan({ intents: [intent] });
    const companionAssignments = effective.assignments.filter(item => item.shift_id === companionShift.id);
    expect(companionAssignments).toEqual([]);
  });

  it("maakt unassign en vacate direct rood zonder taaksegmenten te verwijderen", () => {
    const shift = {
      id: "shift-staffed",
      status: "draft",
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "15:30",
    };
    const assignments = [
      {
        id: "assignment-one",
        shift_id: shift.id,
        planning_shift_id: shift.id,
        personnel_id: "employee-one",
        status: "draft",
      },
      {
        id: "assignment-two",
        shift_id: shift.id,
        planning_shift_id: shift.id,
        personnel_id: "employee-two",
        status: "draft",
      },
    ];
    const unassign = buildDependentPlanningUnassignIntent({
      key: "unassign-one",
      shift,
      assignment: assignments[0],
    });
    const vacate = buildDependentPlanningVacateIntent({
      key: "vacate-all",
      shift,
      assignments,
    });

    expect(unassign.shifts).toEqual([expect.objectContaining({ id: shift.id, status: "draft" })]);
    expect(unassign.assignments).toEqual([
      expect.objectContaining({ id: "assignment-one", status: "removed" }),
    ]);
    expect(unassign.segments).toEqual([]);
    expect(vacate.assignments).toEqual([
      expect.objectContaining({ id: "assignment-one", status: "removed" }),
      expect.objectContaining({ id: "assignment-two", status: "removed" }),
    ]);
    expect(vacate.segments).toEqual([]);
  });

  it("houdt bij target+rechter companion de target als backend-survivor en absorbeert rechts", () => {
    const earlyShift = {
      id: "shift-early",
      status: "draft",
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "15:30",
    };
    const earlySegment = {
      id: "segment-early",
      shift_id: earlyShift.id,
      task_occurrence_id: "occurrence-one",
      start_date: "2026-08-24",
      end_date: "2026-08-24",
      start_time: "06:30",
      end_time: "15:30",
      status: "draft",
    };
    const lateShift = {
      id: "shift-open-late",
      status: "draft",
      service_date: "2026-08-24",
      start_time: "15:30",
      end_time: "18:00",
    };
    const lateSegment = {
      id: "segment-open-late",
      shift_id: lateShift.id,
      task_occurrence_id: "occurrence-one",
      start_date: "2026-08-24",
      end_date: "2026-08-24",
      start_time: "15:30",
      end_time: "18:00",
      status: "draft",
    };
    const assignment = {
      id: "assignment-early",
      shift_id: earlyShift.id,
      planning_shift_id: earlyShift.id,
      personnel_id: "employee-one",
      status: "draft",
    };

    const intent = buildDependentPlanningDeleteIntent({
      key: "delete-early",
      shift: earlyShift,
      segments: [earlySegment],
      assignments: [assignment],
      survivorShift: earlyShift,
      survivorSegment: earlySegment,
      absorbedShifts: [lateShift, lateShift],
      absorbedSegments: [lateSegment, lateSegment],
    });

    expect(intent.shifts).toEqual([
      expect.objectContaining({ id: "shift-open-late", status: "cancelled" }),
      expect.objectContaining({
        id: "shift-early",
        status: "draft",
        start_time: "06:30",
        end_time: "18:00",
      }),
    ]);
    expect(intent.segments).toEqual([
      expect.objectContaining({ id: "segment-open-late", status: "removed" }),
      expect.objectContaining({
        id: "segment-early",
        status: "draft",
        start_time: "06:30",
        end_time: "18:00",
      }),
    ]);
    expect(intent.assignments).toEqual([
      expect.objectContaining({ id: "assignment-early", status: "removed" }),
    ]);
    expect(intent.shifts.map(item => item.id)).toEqual(["shift-open-late", "shift-early"]);
    expect(intent.segments.map(item => item.id)).toEqual(["segment-open-late", "segment-early"]);
    expect(intent._planning_survivor_refs).toEqual({
      shift: "shift:id:shift-early",
      segment: "segment:id:segment-early",
    });
  });

  it("rebased plural original+companion en taakkopie op server-ids zonder latere tijden kwijt te raken", () => {
    const committed = withPlanningOptimisticIntentIdentity({
      key: "resize-with-copy",
      shifts: [
        {
          id: "pending-shift-original",
          source_type: "task",
          source_id: "definition-one",
          service_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
          required_count: 1,
        },
        {
          id: "pending-shift-companion",
          source_type: "task",
          source_id: "definition-one",
          service_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
          required_count: 1,
        },
      ],
      segments: [
        {
          id: "pending-segment-original",
          shift_id: "pending-shift-original",
          task_occurrence_id: "pending-occurrence-copy",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
        },
        {
          id: "pending-segment-companion",
          shift_id: "pending-shift-companion",
          task_occurrence_id: "pending-occurrence-copy",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
        },
      ],
      assignments: [{
        id: "pending-assignment-original",
        planning_shift_id: "pending-shift-original",
        shift_id: "pending-shift-original",
        personnel_id: "employee-one",
        slot_index: 0,
        status: "draft",
      }],
      occurrences: [{
        id: "pending-occurrence-copy",
        object_task_definition_id: "definition-one",
        object_id: "object-one",
        service_date: "2026-08-24",
        window_start_time: "06:30",
        window_end_time: "18:00",
      }],
    });
    const later = {
      ...committed,
      key: "assign-companion-later",
      shift_id: "pending-shift-companion",
      left_shift_id: "pending-shift-original",
      right_shift_id: "pending-shift-companion",
      segment_id: "pending-segment-companion",
      left_segment_id: "pending-segment-original",
      right_segment_id: "pending-segment-companion",
      assignment_id: "pending-assignment-original",
      task_occurrence_id: "pending-occurrence-copy",
      shifts: committed.shifts.map(item => (
        item.id === "pending-shift-companion" ? { ...item, end_time: "17:30" } : item
      )),
      segments: committed.segments.map(item => (
        item.id === "pending-segment-companion" ? { ...item, end_time: "17:30" } : item
      )),
    };
    const result = {
      shifts: [
        {
          id: "shift-server-companion",
          revision: 8,
          source_type: "task",
          source_id: "definition-one",
          service_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
          required_count: 1,
        },
        {
          id: "shift-server-original",
          revision: 7,
          source_type: "task",
          source_id: "definition-one",
          service_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
          required_count: 1,
        },
      ],
      segments: [
        {
          id: "segment-server-companion",
          revision: 4,
          shift_id: "shift-server-companion",
          task_occurrence_id: "occurrence-server-copy",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
        },
        {
          id: "segment-server-original",
          revision: 3,
          shift_id: "shift-server-original",
          task_occurrence_id: "occurrence-server-copy",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
        },
      ],
      assignments: [{
        id: "assignment-server-original",
        revision: 2,
        shift_id: "shift-server-original",
        planning_shift_id: "shift-server-original",
        personnel_id: "employee-one",
        slot_index: 0,
        status: "draft",
      }],
      target_occurrence: {
        id: "occurrence-server-copy",
        revision: 5,
        object_task_definition_id: "definition-one",
        object_id: "object-one",
        service_date: "2026-08-24",
        window_start_time: "06:30",
        window_end_time: "18:00",
      },
    };

    const rebased = rebaseDependentPlanningIntent(later, committed, result);

    expect(rebased).toMatchObject({
      shift_id: "shift-server-companion",
      left_shift_id: "shift-server-original",
      right_shift_id: "shift-server-companion",
      segment_id: "segment-server-companion",
      left_segment_id: "segment-server-original",
      right_segment_id: "segment-server-companion",
      assignment_id: "assignment-server-original",
      task_occurrence_id: "occurrence-server-copy",
    });
    expect(rebased.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shift-server-original", revision: 7, end_time: "15:30" }),
      expect.objectContaining({ id: "shift-server-companion", revision: 8, end_time: "17:30" }),
    ]));
    expect(rebased.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "segment-server-original",
        shift_id: "shift-server-original",
        task_occurrence_id: "occurrence-server-copy",
      }),
      expect.objectContaining({
        id: "segment-server-companion",
        shift_id: "shift-server-companion",
        task_occurrence_id: "occurrence-server-copy",
        end_time: "17:30",
      }),
    ]));
    expect(rebased.assignments).toEqual([
      expect.objectContaining({
        id: "assignment-server-original",
        planning_shift_id: "shift-server-original",
      }),
    ]);
    expect(rebased.occurrences).toEqual([
      expect.objectContaining({ id: "occurrence-server-copy", revision: 5 }),
    ]);
    expect(rebased.shifts[1]._planning_ref).toBe(committed.shifts[1]._planning_ref);
  });

  it("rebased een directe medewerkerdrop op een temp companion naar de nieuwe serverdienst", () => {
    const parentCompose = withPlanningOptimisticIntentIdentity({
      key: "compose-parent",
      shifts: [{
        id: "pending-composed-shift",
        source_type: "task",
        source_id: "definition-one",
        status: "draft",
        required_count: 1,
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
      }],
      segments: [{
        id: "pending-composed-segment",
        shift_id: "pending-composed-shift",
        task_occurrence_id: "occurrence-one",
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
        status: "draft",
      }],
      assignments: [{
        id: "pending-composed-assignment",
        shift_id: "pending-composed-shift",
        planning_shift_id: "pending-composed-shift",
        personnel_id: "employee-one",
        slot_index: 0,
        status: "draft",
      }],
      occurrences: [],
    });
    const resize = buildDependentPlanningResizeIntent({
      key: "resize-child",
      shift: parentCompose.shifts[0],
      segment: parentCompose.segments[0],
      assignments: parentCompose.assignments,
      nextEndTime: "15:30",
    });
    const composeResult = {
      shift: {
        id: "shift-server-composed",
        revision: 2,
        source_type: "task",
        source_id: "definition-one",
        status: "draft",
        required_count: 1,
        service_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
      },
      segments: [{
        id: "segment-server-composed",
        revision: 2,
        shift_id: "shift-server-composed",
        task_occurrence_id: "occurrence-one",
        start_date: "2026-08-24",
        end_date: "2026-08-24",
        start_time: "06:30",
        end_time: "18:00",
      }],
      assignment: {
        id: "assignment-server-composed",
        revision: 2,
        planning_shift_id: "shift-server-composed",
        shift_id: "shift-server-composed",
        personnel_id: "employee-one",
        slot_index: 0,
        status: "draft",
      },
    };
    const rebasedResize = rebaseDependentPlanningIntent(resize, parentCompose, composeResult);
    const companion = rebasedResize.shifts.find(item => item.start_time === "15:30");
    const companionSegment = rebasedResize.segments.find(item => item.start_time === "15:30");
    expect(rebasedResize.shifts[0].id).toBe("shift-server-composed");
    expect(companion.id).toContain("pending-shift-");

    const directAssignment = withPlanningOptimisticIntentIdentity({
      key: "assign-grandchild",
      kind: "assign",
      shift_id: companion.id,
      shifts: [],
      segments: [],
      assignments: [{
        id: "pending-assignment-grandchild",
        planning_shift_id: companion.id,
        shift_id: companion.id,
        personnel_id: "employee-two",
        slot_index: 0,
        status: "draft",
      }],
      occurrences: [],
    });
    const resizeResult = {
      shifts: [
        {
          id: "shift-server-resized",
          revision: 3,
          source_type: "task",
          source_id: "definition-one",
          status: "draft",
          required_count: 1,
          service_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
        },
        {
          id: "shift-server-open-companion",
          revision: 1,
          source_type: "task",
          source_id: "definition-one",
          status: "draft",
          required_count: 1,
          service_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
        },
      ],
      segments: [
        {
          id: "segment-server-resized",
          revision: 3,
          shift_id: "shift-server-resized",
          task_occurrence_id: "occurrence-one",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "06:30",
          end_time: "15:30",
        },
        {
          id: "segment-server-open-companion",
          revision: 1,
          shift_id: "shift-server-open-companion",
          task_occurrence_id: "occurrence-one",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          start_time: "15:30",
          end_time: "18:00",
        },
      ],
    };
    const rebasedAssignment = rebaseDependentPlanningIntent(
      directAssignment,
      rebasedResize,
      resizeResult,
    );

    expect(rebasedAssignment.shift_id).toBe("shift-server-open-companion");
    expect(rebasedAssignment.assignments[0]).toMatchObject({
      planning_shift_id: "shift-server-open-companion",
      shift_id: "shift-server-open-companion",
      personnel_id: "employee-two",
    });
    const authoritative = reconcilePlanningSnapshot({}, resizeResult);
    expect(resolvePlanningRecordTarget(
      authoritative.shifts,
      { id: rebasedAssignment.shift_id },
      { kind: "shift" },
    )).toMatchObject({ status: "ready", record: { id: "shift-server-open-companion" } });
    expect(companionSegment._planning_origin_intent_id).toBe("resize-child");
  });

  it("herkent dezelfde medewerker op een aangrenzende echte open dienst als één merge-partitie", () => {
    const staffedShift = {
      id: "shift-staffed",
      source_type: "task",
      status: "draft",
      required_count: 1,
      service_date: "2026-08-24",
      end_date: "2026-08-24",
      start_time: "06:30",
      end_time: "15:30",
      revision: 4,
      _optimistic_pending: true,
    };
    const openShift = {
      ...staffedShift,
      id: "shift-open",
      start_time: "15:30",
      end_time: "18:00",
      revision: 1,
      metadata: {
        task_partition_origin: {
          action: "resize_task_shift_preserving_coverage",
          original_shift_id: staffedShift.id,
          original_segment_id: "segment-staffed",
          side: "after",
        },
      },
    };
    const staffedSegment = {
      id: "segment-staffed",
      shift_id: staffedShift.id,
      task_occurrence_id: "occurrence-reception",
      start_date: "2026-08-24",
      end_date: "2026-08-24",
      start_time: "06:30",
      end_time: "15:30",
      status: "draft",
      revision: 3,
      _optimistic_pending: true,
    };
    const openSegment = {
      ...staffedSegment,
      id: "segment-open",
      shift_id: openShift.id,
      start_time: "15:30",
      end_time: "18:00",
      revision: 1,
      metadata: {
        task_partition_origin: {
          action: "resize_task_shift_preserving_coverage",
          original_shift_id: staffedShift.id,
          original_segment_id: staffedSegment.id,
          side: "after",
        },
      },
    };
    const assignment = {
      id: "assignment-staffed",
      planning_shift_id: staffedShift.id,
      shift_id: staffedShift.id,
      personnel_id: "person-one",
      slot_index: 0,
      status: "draft",
      revision: 2,
      _optimistic_pending: true,
    };

    const manualOpenShift = { ...openShift, metadata: undefined };
    const manualOpenSegment = { ...openSegment, metadata: undefined };
    const manualResult = resolveOpenShiftSamePersonnelMerge({
      snapshot: {
        shifts: [staffedShift, manualOpenShift],
        segments: [staffedSegment, manualOpenSegment],
        assignments: [assignment],
      },
      targetShift: manualOpenShift,
      personnelId: "person-one",
    });
    expect(manualResult).toMatchObject({
      status: "none",
      reason: "target_not_resize_companion",
      candidate: null,
    });

    const result = resolveOpenShiftSamePersonnelMerge({
      snapshot: {
        shifts: [staffedShift, openShift],
        segments: [staffedSegment, openSegment],
        assignments: [assignment],
      },
      targetShift: openShift,
      personnelId: "person-one",
    });

    expect(result.status).toBe("merge");
    expect(result.targetSegment.id).toBe(openSegment.id);
    expect(result.candidate).toMatchObject({
      shift: { id: staffedShift.id },
      assignment: { id: assignment.id },
      mergedSegment: { start_time: "06:30", end_time: "18:00" },
      durationMinutes: 690,
    });
  });
});

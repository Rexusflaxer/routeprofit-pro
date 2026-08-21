import { describe, expect, it, vi } from "vitest";
import {
  applyObjectTaskMutationResult,
  authoritativeObjectTaskEntry,
  createObjectTaskRefreshCoordinator,
  mergeObjectTaskQuerySnapshot,
} from "@/components/objects/objectTaskQueryCache";

const current = {
  object_id: "object-saturn",
  customer_id: "customer-saturn",
  definitions: [{ id: "definition-reception", version: 3, task_type: "reception" }],
  series: [{
    id: "series-reception",
    object_task_definition_id: "definition-reception",
    task_definition_id: "definition-reception",
    version: 2,
    status: "active",
    current_revision: {
      id: "revision-1",
      series_id: "series-reception",
      revision_number: 1,
      effective_from: "2026-08-17",
      start_time: "06:30",
      end_time: "18:00",
    },
  }],
  revisions: [{
    id: "revision-1",
    series_id: "series-reception",
    revision_number: 1,
    effective_from: "2026-08-17",
  }],
  exceptions: [{
    id: "exception-reception",
    exception_key: "series-source:2026-08-17",
    source_series_id: "series-source",
    alternative_series_id: "series-reception",
    alternative_revision_id: "revision-1",
    service_date: "2026-08-17",
    kind: "alternative",
    status: "active",
    version: 1,
  }],
  source_changes: [{ id: "change-existing", status: "open" }],
  planning_coverage: [{ task_definition_id: "definition-reception", planned: 1 }],
};

describe("object task mutation query cache", () => {
  it("patcht de autoritatieve definitie, reeks en revisie uit een mutatierespons", () => {
    const next = applyObjectTaskMutationResult(current, {
      ok: true,
      definition: { id: "definition-reception", version: 4, task_type: "reception" },
      series: {
        id: "series-reception",
        object_task_definition_id: "definition-reception",
        version: 3,
        current_revision_id: "revision-2",
      },
      current_revision: {
        id: "revision-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-24",
        start_time: "10:00",
        end_time: "18:00",
        recurrence_type: "weekly",
      },
      source_changes: [{ id: "change-new", status: "open" }],
      server_clock: { iso: "2026-08-21T08:00:00.000Z" },
    });

    expect(next.definitions).toEqual([
      expect.objectContaining({ id: "definition-reception", version: 4 }),
    ]);
    expect(next.series).toEqual([
      expect.objectContaining({
        id: "series-reception",
        task_definition_id: "definition-reception",
        version: 3,
        current_revision: expect.objectContaining({ id: "revision-2", frequency: "weekly" }),
      }),
    ]);
    expect(next.revisions).toEqual([
      expect.objectContaining({ id: "revision-1" }),
      expect.objectContaining({ id: "revision-2", revision_number: 2 }),
    ]);
    expect(next.source_changes.map(change => change.id)).toEqual(["change-existing", "change-new"]);
    expect(next.planning_coverage).toEqual(current.planning_coverage);

    const entry = authoritativeObjectTaskEntry(next, {
      definition_id: "definition-reception",
      series_id: "series-reception",
      series_version: 2,
    });
    expect(entry.definition.version).toBe(4);
    expect(entry.series_version).toBe(3);
    expect(entry.series.current_revision.id).toBe("revision-2");
  });

  it("verwerkt ook de meervoudige reeksrespons van een nieuwe taak", () => {
    const next = applyObjectTaskMutationResult(null, {
      definition: { id: "definition-rounds", version: 1 },
      series: [
        {
          series: { id: "series-monday", object_task_definition_id: "definition-rounds", version: 1 },
          current_revision: { id: "revision-monday", series_id: "series-monday", effective_from: "2026-08-24" },
        },
        {
          series: { id: "series-friday", object_task_definition_id: "definition-rounds", version: 1 },
          current_revision: { id: "revision-friday", series_id: "series-friday", effective_from: "2026-08-28" },
        },
      ],
    });

    expect(next.series.map(series => series.id)).toEqual(["series-monday", "series-friday"]);
    expect(next.revisions.map(revision => revision.id)).toEqual(["revision-monday", "revision-friday"]);
  });

  it("werkt de uitzondering van een los alternatief direct en versiebeveiligd bij", () => {
    const next = applyObjectTaskMutationResult(current, {
      definition: { id: "definition-reception", version: 4 },
      series: {
        id: "series-reception",
        object_task_definition_id: "definition-reception",
        version: 3,
      },
      current_revision: {
        id: "revision-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-17",
      },
      task_schedule_exception: {
        ...current.exceptions[0],
        alternative_revision_id: "revision-2",
        kind: "cancelled",
        version: 2,
      },
    });

    expect(next.exceptions).toEqual([
      expect.objectContaining({
        id: "exception-reception",
        alternative_revision_id: "revision-2",
        kind: "cancelled",
        version: 2,
      }),
    ]);

    const merged = mergeObjectTaskQuerySnapshot(next, {
      ...current,
      exceptions: current.exceptions,
    });
    expect(merged.exceptions).toEqual([
      expect.objectContaining({
        id: "exception-reception",
        alternative_revision_id: "revision-2",
        kind: "cancelled",
        version: 2,
      }),
    ]);
  });

  it("laat een laat gestarte lijstquery de mutatieversies niet terugzetten", () => {
    const authoritative = applyObjectTaskMutationResult(current, {
      definition: { id: "definition-reception", version: 4 },
      series: { id: "series-reception", object_task_definition_id: "definition-reception", version: 3 },
      current_revision: { id: "revision-2", series_id: "series-reception", revision_number: 2, effective_from: "2026-08-24" },
      source_changes: [{ id: "change-new", status: "open" }],
    });
    const staleListResponse = {
      ...current,
      definitions: [{ id: "definition-reception", version: 3 }],
      series: [{ ...current.series[0], version: 2 }],
      source_changes: [],
    };

    const merged = mergeObjectTaskQuerySnapshot(authoritative, staleListResponse);

    expect(merged.definitions[0].version).toBe(4);
    expect(merged.series[0].version).toBe(3);
    expect(merged.revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "revision-2" }),
    ]));
    expect(merged.source_changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "change-new" }),
    ]));
  });

  it("behoudt bij een gelijk-versie lijstresponse de autoritatieve current revisie", () => {
    const authoritative = applyObjectTaskMutationResult(current, {
      definition: { id: "definition-reception", version: 4 },
      series: {
        id: "series-reception",
        object_task_definition_id: "definition-reception",
        version: 3,
        current_revision_id: "revision-2",
      },
      current_revision: {
        id: "revision-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-24",
        start_time: "10:00",
        end_time: "18:00",
      },
      source_changes: [{ id: "change-new", status: "open" }],
    });
    const incompleteEqualVersionResponse = {
      ...current,
      definitions: [{ id: "definition-reception", version: 4 }],
      series: [{
        id: "series-reception",
        task_definition_id: "definition-reception",
        version: 3,
        current_revision_id: "revision-2",
      }],
      revisions: [current.revisions[0]],
      source_changes: [],
    };

    const merged = mergeObjectTaskQuerySnapshot(authoritative, incompleteEqualVersionResponse);

    expect(merged.series).toEqual([
      expect.objectContaining({
        id: "series-reception",
        version: 3,
        current_revision_id: "revision-2",
        current_revision: expect.objectContaining({ id: "revision-2" }),
      }),
    ]);
    expect(merged.revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "revision-1" }),
      expect.objectContaining({ id: "revision-2" }),
    ]));
    expect(merged.source_changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "change-new" }),
    ]));
  });

  it("laat een gelijk-versie response met een afwijkende revisiepointer niet winnen", () => {
    const authoritative = {
      ...current,
      series: [{
        ...current.series[0],
        version: 3,
        current_revision_id: "revision-2",
        current_revision: {
          id: "revision-2",
          series_id: "series-reception",
          revision_number: 2,
          effective_from: "2026-08-24",
        },
      }],
      revisions: [...current.revisions, {
        id: "revision-2",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-24",
      }],
      source_changes: [{ id: "change-new", status: "open" }],
    };
    const conflictingEqualVersionResponse = {
      ...current,
      series: [{
        ...current.series[0],
        version: 3,
        current_revision_id: "revision-conflicting",
        current_revision: {
          id: "revision-conflicting",
          series_id: "series-reception",
          revision_number: 2,
          effective_from: "2026-08-24",
        },
      }],
      revisions: [{
        id: "revision-conflicting",
        series_id: "series-reception",
        revision_number: 2,
        effective_from: "2026-08-24",
      }],
      source_changes: [],
    };

    const merged = mergeObjectTaskQuerySnapshot(authoritative, conflictingEqualVersionResponse);

    expect(merged.series[0]).toEqual(expect.objectContaining({
      current_revision_id: "revision-2",
      current_revision: expect.objectContaining({ id: "revision-2" }),
    }));
    expect(merged.revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "revision-conflicting" }),
      expect.objectContaining({ id: "revision-2" }),
    ]));
    expect(merged.source_changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "change-new" }),
    ]));
  });
});

describe("object task background refresh coordinator", () => {
  it("markeert alle families eenmaal stale en coalescet actieve task- en coverage-refetches", async () => {
    vi.useFakeTimers();
    try {
      const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
      let busy = false;
      const coordinator = createObjectTaskRefreshCoordinator({
        queryClient,
        taskQueryKey: ["object-card", "object-saturn", "tasks"],
        taskCoverageQueryKey: ["object-card", "object-saturn", "task-coverage"],
        isBusy: () => busy,
        delayMs: 100,
      });

      coordinator.schedule();
      coordinator.schedule();

      expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(7);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["object-card", "object-saturn", "task-coverage"],
        refetchType: "none",
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["planning-task-occurrences"],
        refetchType: "none",
      });

      busy = true;
      await vi.advanceTimersByTimeAsync(100);
      expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(7);

      busy = false;
      await vi.advanceTimersByTimeAsync(100);
      expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(9);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["object-card", "object-saturn", "tasks"],
        refetchType: "active",
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["object-card", "object-saturn", "task-coverage"],
        refetchType: "active",
      });

      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

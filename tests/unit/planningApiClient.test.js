import { beforeEach, describe, expect, it, vi } from "vitest";

function planningError(status, message, retryAfter = null, details = null) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: {
      status,
      data: { error: message, ...(details ? { details } : {}) },
      headers: retryAfter == null ? {} : { "retry-after": retryAfter },
    },
  });
}

async function loadPlanningClient({ pinned = true } = {}) {
  const invoke = vi.fn();
  const invokeLatest = vi.fn();

  vi.doMock("@/api/base44Client", () => ({
    base44: { functions: { invoke } },
    base44LatestFunctions: { functions: { invoke: invokeLatest } },
    hasPinnedFunctionsVersion: pinned,
  }));

  const client = await import("@/components/planning/planningApiClient");
  return { ...client, invoke, invokeLatest };
}

describe("planningApiClient functieversieherstel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("probeert een onbekende actie uit een vastgezette preview met exact hetzelfde request via de nieuwste functies", async () => {
    const { invokePlanningApi, invoke, invokeLatest } = await loadPlanningClient({ pinned: true });
    invoke.mockRejectedValueOnce(planningError(400, "Onbekende planningactie"));
    invokeLatest.mockResolvedValueOnce({ data: { ok: true, shift_id: "shift-1" } });

    await expect(invokePlanningApi({
      action: "compose_shift",
      idempotency_key: "planning-fallback-key",
      shift: { object_id: "object-1" },
    })).resolves.toEqual({ ok: true, shift_id: "shift-1" });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledTimes(1);
    expect(invokeLatest.mock.calls[0][1]).toBe(invoke.mock.calls[0][1]);
    expect(invokeLatest.mock.calls[0][1]).toMatchObject({
      action: "compose_shift",
      idempotency_key: "planning-fallback-key",
      shift: { object_id: "object-1" },
    });
  });

  it("voert een versiegevoelige bootstrap in een vastgezette preview direct op de nieuwste functie uit", async () => {
    const { invokePlanningApi, invoke, invokeLatest } = await loadPlanningClient({ pinned: true });
    invokeLatest.mockResolvedValueOnce({ data: { ok: true, created_task_occurrence_count: 5 } });

    await expect(invokePlanningApi({
      action: "bootstrap_range",
      period_start: "2026-08-10",
      period_end: "2026-08-21",
    }, { preferLatestFunctions: true })).resolves.toEqual({
      ok: true,
      created_task_occurrence_count: 5,
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledTimes(1);
    expect(invokeLatest.mock.calls[0][1]).toMatchObject({
      action: "bootstrap_range",
      period_start: "2026-08-10",
      period_end: "2026-08-21",
      idempotency_key: expect.any(String),
    });
  });

  it("stuurt een wijziging van één taak-occurrence uitsluitend via planningApi", async () => {
    const { invokePlanningApi, invoke, invokeLatest } = await loadPlanningClient({ pinned: true });
    const request = {
      action: "change_single_task_occurrence",
      occurrence_id: "occurrence-1",
      source_revision_id: "source-revision-4",
      start_time: "07:00",
      end_time: "15:00",
      expected_occurrence_revision: 3,
      confirm_remove_outside_shifts: false,
      idempotency_key: "planning-edit-single-task:key-1",
    };
    invoke.mockResolvedValueOnce({
      data: {
        ok: true,
        task_occurrences: [{ id: "occurrence-1", revision: 4 }],
      },
    });

    await expect(invokePlanningApi(request)).resolves.toMatchObject({
      ok: true,
      task_occurrences: [{ id: "occurrence-1", revision: 4 }],
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("planningApi", request);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it("doet zonder vastgezette versie geen tweede call en geeft een duidelijke publicatiemelding", async () => {
    const { invokePlanningApi, invoke, invokeLatest } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValueOnce(planningError(400, "Onbekende planningactie."));

    await expect(invokePlanningApi({
      action: "list_object_tasks",
    }, { ensureIdempotencyKey: false })).rejects.toMatchObject({
      status: 400,
      message: "De planningbackend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw.",
      details: {
        code: "planning_backend_outdated",
        action: "list_object_tasks",
      },
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Object ontbreekt"],
    [503, "De planningsservice is tijdelijk niet beschikbaar"],
  ])("valt bij een andere backendfout %s niet terug op de nieuwste functies", async (status, message) => {
    const { invokePlanningApi, invoke, invokeLatest } = await loadPlanningClient({ pinned: true });
    invoke.mockRejectedValueOnce(planningError(status, message));

    await expect(invokePlanningApi({
      action: "compose_shift",
      idempotency_key: "planning-no-fallback-key",
    })).rejects.toMatchObject({ status, message });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it.each([
    ["1", 1_000],
    ["Wed, 01 Jan 2025 00:00:02 GMT", 2_000],
  ])("herhaalt een interactieve 429 na Retry-After %s met exact hetzelfde request", async (retryAfter, expectedDelay) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke
      .mockRejectedValueOnce(planningError(429, "Rate limit exceeded", retryAfter))
      .mockResolvedValueOnce({ data: { ok: true, shift: { id: "shift-1", revision: 2 } } });

    const pending = invokePlanningApi({
      action: "resize_task_shift_preserving_coverage",
      shift_id: "shift-1",
      idempotency_key: "planning-resize-retry-key",
    });
    await vi.advanceTimersByTimeAsync(expectedDelay - 1);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ ok: true, shift: { id: "shift-1", revision: 2 } });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1]).toBe(invoke.mock.calls[0][1]);
  });

  it("houdt optimistische writes vast tijdens begrensde backoff en meldt pas de definitieve 429", async () => {
    vi.useFakeTimers();
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValue(planningError(429, "Rate limit exceeded"));

    const pending = invokePlanningApi({
      action: "resize_task_shift_preserving_coverage",
      shift_id: "shift-1",
      idempotency_key: "planning-resize-exhausted-key",
    });
    const rejection = expect(pending).rejects.toMatchObject({
      status: 429,
      message: "Rate limit exceeded",
    });
    await vi.advanceTimersByTimeAsync(449);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_701);

    await rejection;
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[1][1]).toBe(invoke.mock.calls[0][1]);
    expect(invoke.mock.calls[2][1]).toBe(invoke.mock.calls[0][1]);
  });

  it("herstelt ook een opgeslagen write waarvan alleen de rate-limited lease-cleanup uitliep", async () => {
    vi.useFakeTimers();
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke
      .mockRejectedValueOnce(planningError(503, "Planningactie mislukt", "1", {
        lease_release_exhausted: true,
        retry_after: "2025-01-01T00:00:01.000Z",
      }))
      .mockResolvedValueOnce({ data: { ok: true, idempotent: true, shift: { id: "shift-1", revision: 2 } } });

    const pending = invokePlanningApi({
      action: "resize_task_shift_preserving_coverage",
      shift_id: "shift-1",
      idempotency_key: "planning-resize-cleanup-retry-key",
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ ok: true, idempotent: true });
    expect(invoke.mock.calls[1][1]).toBe(invoke.mock.calls[0][1]);
  });

  it("herhaalt een onvolledig opgeruimde partial acquire nooit automatisch", async () => {
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValueOnce(planningError(503, "Planningreservering kon niet volledig worden vrijgegeven", null, {
      lease_release_exhausted: true,
      lease_acquire_cleanup_exhausted: true,
      retry_safe: false,
      retry_after_ms: 120_000,
      acquire_error: {
        status: 409,
        code: "PLANNING_RESOURCE_BUSY",
        resource_type: "personnel_day",
        resource_id: "day-busy",
      },
    }));

    await expect(invokePlanningApi({
      action: "compose_and_assign",
      idempotency_key: "planning-partial-acquire-cleanup-exhausted-key",
    })).rejects.toMatchObject({
      status: 503,
      details: {
        lease_release_exhausted: true,
        lease_acquire_cleanup_exhausted: true,
        retry_safe: false,
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("houdt een idempotente write lokaal vast bij een tijdelijke medewerkerresourcebotsing", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke
      .mockRejectedValueOnce(planningError(409, "Deze planningresource wordt momenteel door een andere planningactie gewijzigd", null, {
        code: "PLANNING_RESOURCE_BUSY",
        transient: true,
        resource_type: "personnel_day",
        resource_id: "week:person-1:2026-08-24",
        reservation_expires_at: "2026-08-29T12:02:00.000Z",
      }))
      .mockResolvedValueOnce({ data: { ok: true, assignment: { id: "assignment-2" } } });

    const pending = invokePlanningApi({
      action: "compose_and_assign",
      idempotency_key: "planning-resource-busy-retry-key",
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ ok: true, assignment: { id: "assignment-2" } });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1]).toBe(invoke.mock.calls[0][1]);
  });

  it("respecteert retry_safe false vóór de tijdelijke-resourceclassificatie", async () => {
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValueOnce(planningError(409, "Resourcecleanup vereist handmatige recovery", null, {
      code: "PLANNING_RESOURCE_BUSY",
      transient: true,
      retry_safe: false,
      resource_type: "personnel_day",
      resource_id: "day-cleanup-uncertain",
      reservation_expires_at: "2026-08-29T12:02:00.000Z",
    }));

    await expect(invokePlanningApi({
      action: "compose_and_assign",
      idempotency_key: "planning-resource-busy-not-retry-safe-key",
    })).rejects.toMatchObject({
      status: 409,
      details: { retry_safe: false },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("herhaalt een semantische revisie-409 niet", async () => {
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValueOnce(planningError(409, "De planning is intussen gewijzigd", null, {
      code: "STALE_PLANNING_REVISION",
      transient: false,
      resource_type: "shift_composition",
    }));

    await expect(invokePlanningApi({
      action: "resize_task_shift_preserving_coverage",
      idempotency_key: "planning-semantic-conflict-key",
    })).rejects.toMatchObject({ status: 409 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("meldt een blijvend bezette resource pas na een begrensde stille retryreeks", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValue(planningError(409, "Deze planningresource wordt momenteel door een andere planningactie gewijzigd", null, {
      code: "PLANNING_RESOURCE_BUSY",
      transient: true,
      resource_type: "shift_composition",
      resource_id: "shift-1",
      reservation_expires_at: "2026-08-29T12:02:00.000Z",
    }));

    const pending = invokePlanningApi({
      action: "move",
      shift_id: "shift-1",
      idempotency_key: "planning-resource-busy-exhausted-key",
    });
    const rejection = expect(pending).rejects.toMatchObject({
      status: 409,
      details: { code: "PLANNING_RESOURCE_BUSY" },
    });
    await vi.advanceTimersByTimeAsync(7_099);
    expect(invoke).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(invoke).toHaveBeenCalledTimes(6);
    expect(invoke.mock.calls.every(call => call[1] === invoke.mock.calls[0][1])).toBe(true);
  });

  it.each([
    ["prefetch_assignment_eligibility"],
    ["bootstrap_range"],
  ])("herhaalt een rate-limited lage-prioriteitsactie %s niet agressief", async action => {
    const { invokePlanningApi, invoke } = await loadPlanningClient({ pinned: false });
    invoke.mockRejectedValueOnce(planningError(429, "Rate limit exceeded", "1"));

    await expect(invokePlanningApi({
      action,
      basis_token: "basis-1",
      candidates: [],
    })).rejects.toMatchObject({ status: 429 });

    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

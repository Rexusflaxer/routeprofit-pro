import { beforeEach, describe, expect, it, vi } from "vitest";

function planningError(status, message) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: {
      status,
      data: { error: message },
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
    vi.resetModules();
    vi.clearAllMocks();
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
});

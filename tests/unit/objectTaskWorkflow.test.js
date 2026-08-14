import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, invokeLatest } = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeLatest: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: { functions: { invoke } },
  base44LatestFunctions: { functions: { invoke: invokeLatest } },
  hasPinnedFunctionsVersion: true,
}));

import {
  addObjectTaskSeries,
  changeObjectTaskSeries,
  createObjectTask,
  listObjectTasks,
  stopObjectTaskSeries,
} from "@/components/objects/objectTaskWorkflow";

function planningError(status, message) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: {
      status,
      data: { error: message },
    },
  });
}

describe("objectTaskWorkflow mutatiecontract", () => {
  beforeEach(() => {
    invoke.mockReset();
    invokeLatest.mockReset();
    invoke.mockResolvedValue({ data: { ok: true } });
    invokeLatest.mockResolvedValue({ data: { ok: true } });
  });

  it("stuurt create, add-series, change en stop met idempotency en CAS naar planningApi", async () => {
    await createObjectTask({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "create-task-key",
      data: {
        security_plan_id: "plan-1",
        task_type: "reception",
        execution_mode: "continuous",
        instructions: "Volg de receptie-instructie.",
        schedule_entries: [{
          occurrence_date: "2099-08-17",
          start_time: "06:30",
          end_time: "18:00",
          frequency: "weekly",
          repeat_until: "2099-08-31",
        }],
      },
    });

    const entry = {
      definition_id: "definition-1",
      definition: { id: "definition-1", version: 3 },
      series_id: "series-1",
      series_version: 4,
      occurrence_date: "2099-08-31",
      start_time: "06:30",
      end_time: "18:00",
    };
    await addObjectTaskSeries({
      customerId: "customer-1",
      objectId: "object-1",
      entry,
      idempotencyKey: "add-series-key",
      data: {
        start_time: "12:00",
        end_time: "18:00",
        frequency: "weekly",
        repeat_until: null,
      },
    });
    await changeObjectTaskSeries({
      customerId: "customer-1",
      objectId: "object-1",
      entry,
      idempotencyKey: "change-series-key",
      data: {
        start_time: "10:00",
        end_time: "18:00",
        frequency: "weekly",
        repeat_until: "2099-12-31",
      },
    });
    await stopObjectTaskSeries({
      customerId: "customer-1",
      objectId: "object-1",
      entry,
      idempotencyKey: "stop-series-key",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "planningApi", {
      action: "create_object_task",
      customer_id: "customer-1",
      object_id: "object-1",
      idempotency_key: "create-task-key",
      expected_version: 0,
      task: {
        security_plan_id: "plan-1",
        task_type: "reception",
        custom_task_type: null,
        execution_mode: "continuous",
        duration_minutes: null,
        instructions: "Volg de receptie-instructie.",
      },
      schedule_blocks: [{
        service_date: "2099-08-17",
        start_time: "06:30",
        end_time: "18:00",
        repeat_weekly: true,
        recurrence_end_date: "2099-08-31",
      }],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "planningApi", {
      action: "add_object_task_series",
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: "definition-1",
      idempotency_key: "add-series-key",
      expected_version: 3,
      schedule_block: {
        service_date: "2099-08-31",
        start_time: "12:00",
        end_time: "18:00",
        repeat_weekly: true,
        recurrence_end_date: null,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "planningApi", {
      action: "change_object_task_series",
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: "definition-1",
      series_id: "series-1",
      idempotency_key: "change-series-key",
      expected_version: 4,
      effective_from: "2099-08-31",
      start_time: "10:00",
      end_time: "18:00",
      repeat_weekly: true,
      recurrence_end_date: "2099-12-31",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "planningApi", {
      action: "stop_object_task_series",
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: "definition-1",
      series_id: "series-1",
      idempotency_key: "stop-series-key",
      expected_version: 4,
      effective_from: "2099-08-31",
    });
  });

  it("probeert een onbekende actie uit een vastgezette preview exact eenmaal via de nieuwste functies", async () => {
    invoke.mockRejectedValueOnce(planningError(400, "Onbekende planningactie"));
    invokeLatest.mockResolvedValueOnce({
      data: {
        ok: true,
        definitions: [],
        series: [],
        revisions: [],
        source_changes: [],
      },
    });

    await expect(listObjectTasks({
      customerId: "customer-1",
      objectId: "object-1",
    })).resolves.toMatchObject({ ok: true, definitions: [] });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledWith("planningApi", {
      action: "list_object_tasks",
      customer_id: "customer-1",
      object_id: "object-1",
    });
    expect(invokeLatest.mock.calls[0][1]).toBe(invoke.mock.calls[0][1]);
  });

  it("behoudt bij een mutatiefallback exact dezelfde payload en idempotency key", async () => {
    invoke.mockRejectedValueOnce(planningError(400, "Onbekende planningactie."));
    invokeLatest.mockResolvedValueOnce({ data: { ok: true } });

    await createObjectTask({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "create-task-fallback-key",
      data: {
        task_type: "reception",
        execution_mode: "continuous",
        schedule_entries: [],
      },
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledTimes(1);
    expect(invokeLatest.mock.calls[0][1]).toBe(invoke.mock.calls[0][1]);
    expect(invokeLatest.mock.calls[0][1].idempotency_key).toBe("create-task-fallback-key");
  });

  it("geeft een publicatiemelding wanneer ook de nieuwste functies de actie niet kennen", async () => {
    invoke.mockRejectedValueOnce(planningError(400, "Onbekende planningactie"));
    invokeLatest.mockRejectedValueOnce(planningError(400, "Onbekende planningactie"));

    await expect(listObjectTasks({ objectId: "object-1" })).rejects.toMatchObject({
      status: 400,
      message: "De planningbackend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw.",
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "Object ontbreekt"],
    [503, "De planningsservice is tijdelijk niet beschikbaar"],
  ])("valt bij een andere backendfout %s niet terug op de nieuwste functies", async (status, message) => {
    invoke.mockRejectedValueOnce(planningError(status, message));

    await expect(listObjectTasks({ objectId: "object-1" })).rejects.toMatchObject({
      status,
      message,
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).not.toHaveBeenCalled();
  });
});

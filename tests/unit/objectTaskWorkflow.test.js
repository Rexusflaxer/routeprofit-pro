import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/api/base44Client", () => ({
  base44: { functions: { invoke } },
}));

import {
  addObjectTaskSeries,
  changeObjectTaskSeries,
  createObjectTask,
  stopObjectTaskSeries,
} from "@/components/objects/objectTaskWorkflow";

describe("objectTaskWorkflow mutatiecontract", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true } });
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
});

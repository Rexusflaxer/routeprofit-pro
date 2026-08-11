import { describe, expect, it, vi } from "vitest";
import {
  createPlanningMutationIntentRegistry,
  planningMutationFingerprint,
} from "@/components/planning/planningMutationIntent";

function registry() {
  let sequence = 0;
  return createPlanningMutationIntentRegistry({
    keyFactory: prefix => `${prefix}:key-${++sequence}`,
  });
}

describe("Planning mutation intents", () => {
  it("maakt dezelfde fingerprint voor semantisch gelijke payloads", () => {
    const first = planningMutationFingerprint({
      action: "assign",
      warnings: [{ severity: "warning", code: "overlap" }],
      expected_shift_revisions: { beta: 2, alpha: 1 },
      optional: undefined,
      idempotency_key: "first-key",
    });
    const second = planningMutationFingerprint({
      expected_shift_revisions: { alpha: 1, beta: 2 },
      warnings: [{ code: "overlap", severity: "warning" }],
      action: "assign",
      idempotency_key: "other-key",
    });

    expect(first).toBe(second);
  });

  it("hergebruikt de key alleen voor een exact gelijke retry", () => {
    const intents = registry();
    const first = intents.prepare("shift-action", {
      action: "copy",
      shift_id: "shift-1",
      service_date: "2026-08-18",
      start_time: "08:00",
      end_time: "16:00",
    }, { prefix: "planning-copy" });
    const retry = intents.prepare("shift-action", {
      end_time: "16:00",
      service_date: "2026-08-18",
      action: "copy",
      start_time: "08:00",
      shift_id: "shift-1",
    }, { prefix: "planning-copy" });
    const changed = intents.prepare("shift-action", {
      ...retry,
      service_date: "2026-08-19",
    }, { prefix: "planning-copy" });

    expect(retry.idempotency_key).toBe(first.idempotency_key);
    expect(changed.idempotency_key).not.toBe(first.idempotency_key);
  });

  it("wist alleen de intent die bij de afgeronde request hoort", () => {
    const intents = registry();
    const first = intents.prepare("publish", { action: "publish", reason: "eerste" });
    const changed = intents.prepare("publish", { action: "publish", reason: "aangepast" });

    expect(intents.clear("publish", first.idempotency_key)).toBe(false);
    expect(intents.peek("publish")?.key).toBe(changed.idempotency_key);
    expect(intents.clear("publish", changed.idempotency_key)).toBe(true);
    expect(intents.peek("publish")).toBeNull();
  });

  it("maakt na expliciet sluiten ook voor hetzelfde payload een nieuwe intent", () => {
    const keyFactory = vi.fn()
      .mockReturnValueOnce("planning:key-1")
      .mockReturnValueOnce("planning:key-2");
    const intents = createPlanningMutationIntentRegistry({ keyFactory });
    const payload = { action: "compose_and_assign", personnel_id: "personnel-1" };

    const first = intents.prepare("matrix", payload);
    intents.clear("matrix");
    const reopened = intents.prepare("matrix", payload);

    expect(first.idempotency_key).toBe("planning:key-1");
    expect(reopened.idempotency_key).toBe("planning:key-2");
  });
});

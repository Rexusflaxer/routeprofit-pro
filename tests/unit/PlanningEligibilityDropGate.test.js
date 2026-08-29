import { describe, expect, it } from "vitest";
import {
  createPendingPlanningEligibilityDrop,
  planningEligibilityDependencyRetryDelay,
  recordPendingPlanningEligibilityAttempt,
  resolvePendingPlanningEligibilityDrop,
} from "@/components/planning/planningEligibilityDropGate";

const NOW = Date.parse("2026-08-29T10:00:00.000Z");

function preview(
  status = "checking",
  warnings = [],
  candidateKey = "candidate:employee-1:occurrence-1",
  basisToken = "basis-1",
) {
  return {
    drop: { kind: "compose_occurrence_for_personnel", occurrenceId: "occurrence-1", personnelId: "employee-1" },
    eligibilityCandidate: { candidate_key: candidateKey },
    verdict: { status, warnings, basisToken },
  };
}

describe("planning eligibility drop gate", () => {
  it("bouwt mislukte dependencygolven begrensd af in plaats van iedere watchdog opnieuw te starten", () => {
    expect(planningEligibilityDependencyRetryDelay({ failureCount: 1, lastAttemptAt: NOW, now: NOW })).toBe(2_000);
    expect(planningEligibilityDependencyRetryDelay({ failureCount: 2, lastAttemptAt: NOW, now: NOW })).toBe(4_000);
    expect(planningEligibilityDependencyRetryDelay({ failureCount: 3, lastAttemptAt: NOW, now: NOW + 3_000 })).toBe(5_000);
    expect(planningEligibilityDependencyRetryDelay({ failureCount: 20, lastAttemptAt: NOW, now: NOW })).toBe(30_000);
  });

  it("wacht op de deletequeue en vraagt daarna exact de actuele candidate", () => {
    const pending = createPendingPlanningEligibilityDrop({ result: { draggableId: "personnel:employee-1" }, preview: preview(), now: NOW });

    expect(resolvePendingPlanningEligibilityDrop({ pending, preview: preview(), queueIdle: false, now: NOW })).toMatchObject({ status: "wait_queue" });
    expect(resolvePendingPlanningEligibilityDrop({ pending, preview: preview(), queueIdle: true, now: NOW })).toMatchObject({
      status: "request",
      candidateKey: "candidate:employee-1:occurrence-1",
    });
  });

  it("geeft na een actuele controle precies eenmaal toestemming zonder opnieuw slepen", () => {
    const initialWarning = { code: "contract_hours", severity: "warning", detail: "Contracturen naderen." };
    const pending = createPendingPlanningEligibilityDrop({ result: { id: "drop-1" }, preview: preview("checking", [initialWarning]), now: NOW });
    const attempted = recordPendingPlanningEligibilityAttempt(pending, "basis-1\u0000candidate:employee-1:occurrence-1");

    expect(resolvePendingPlanningEligibilityDrop({
      pending: attempted,
      preview: preview("ready", [initialWarning]),
      queueIdle: true,
      now: NOW + 1_000,
    })).toMatchObject({ status: "ready", newWarnings: [] });
  });

  it("stopt vóór de planningwrite als de server na de drop een nieuwe waarschuwing vindt", () => {
    const pending = createPendingPlanningEligibilityDrop({ result: { id: "drop-1" }, preview: preview(), now: NOW });
    const newWarning = { code: "cao_manual_review", severity: "warning", detail: "CAO-controle vraagt beoordeling." };

    const resolution = resolvePendingPlanningEligibilityDrop({
      pending,
      preview: preview("ready", [newWarning]),
      queueIdle: true,
      now: NOW + 500,
    });

    expect(resolution.status).toBe("warnings_changed");
    expect(resolution.newWarnings).toEqual([newWarning]);
  });

  it("begrensd unavailable-herstel en een verdwenen of verlopen target falen dicht", () => {
    let pending = createPendingPlanningEligibilityDrop({ result: { id: "drop-1" }, preview: preview("unavailable"), now: NOW, timeoutMs: 2_000 });
    pending = recordPendingPlanningEligibilityAttempt(pending, "basis-1\u0000candidate:employee-1:occurrence-1");
    pending = recordPendingPlanningEligibilityAttempt(pending, "basis-1\u0000candidate:employee-1:occurrence-1");

    expect(resolvePendingPlanningEligibilityDrop({ pending, preview: preview("unavailable"), queueIdle: true, now: NOW + 1_000 })).toMatchObject({ status: "unavailable" });
    expect(resolvePendingPlanningEligibilityDrop({ pending, preview: null, queueIdle: true, now: NOW + 1_000 })).toMatchObject({ status: "target_missing" });
    expect(resolvePendingPlanningEligibilityDrop({ pending, preview: preview(), queueIdle: true, now: NOW + 2_000 })).toMatchObject({ status: "expired" });
  });

  it("geeft een nieuwe basis/candidate een eigen begrensd herstelbudget", () => {
    let pending = createPendingPlanningEligibilityDrop({ result: { id: "drop-1" }, preview: preview(), now: NOW });
    pending = recordPendingPlanningEligibilityAttempt(pending, "basis-old\u0000candidate:same");
    pending = recordPendingPlanningEligibilityAttempt(pending, "basis-old\u0000candidate:same");

    expect(resolvePendingPlanningEligibilityDrop({
      pending,
      preview: preview("checking", [], "candidate:same", "basis-new"),
      queueIdle: true,
      now: NOW + 500,
    })).toMatchObject({
      status: "request",
      candidateKey: "candidate:same",
      attemptKey: "basis-new\u0000candidate:same",
    });
  });
});

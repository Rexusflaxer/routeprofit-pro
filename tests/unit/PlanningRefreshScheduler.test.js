import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlanningRefreshScheduler } from "@/components/planning/planningRefreshScheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("planning refresh scheduler", () => {
  it("debouncet een burst tot één refresh en bewaart de ruimste opties", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 1_200 });

    scheduler.schedule();
    scheduler.schedule({ includePublications: true, reason: "publish" });
    scheduler.schedule({ reason: "mutation" });

    expect(scheduler.getState()).toMatchObject({ scheduled: true, inFlight: false });
    await vi.advanceTimersByTimeAsync(1_199);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({
      includePublications: true,
      reason: "mutation",
    });
    expect(scheduler.getState()).toMatchObject({ scheduled: false, inFlight: false });
  });

  it("kan een geplande refresh direct flushen zonder een tweede timer-run", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue("refreshed");
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 5_000 });

    scheduler.schedule({ includePublications: false });
    await expect(scheduler.flush()).resolves.toBe("refreshed");
    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(scheduler.getState()).toMatchObject({ scheduled: false, inFlight: false });
  });

  it("laat doorlopend plannen de eerste consistency-refresh niet uitstellen", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 1_200 });

    scheduler.schedule({ reason: "first" });
    await vi.advanceTimersByTimeAsync(800);
    scheduler.schedule({ reason: "latest" });
    await vi.advanceTimersByTimeAsync(400);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ reason: "latest" }));
  });

  it("slikt backgroundfouten gecontroleerd en blijft daarna bruikbaar", async () => {
    vi.useFakeTimers();
    const error = new Error("tijdelijke netwerkfout");
    const refresh = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 10, onError });

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledWith(error);

    scheduler.schedule({ includePublications: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(scheduler.getState()).toMatchObject({ scheduled: false, inFlight: false });
  });

  it("annuleert of disposeert uitgestelde refreshes zonder neveneffecten", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 100 });

    scheduler.schedule();
    scheduler.cancel();
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();

    scheduler.schedule();
    scheduler.dispose();
    expect(scheduler.schedule()).toBe(false);
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
  });
});

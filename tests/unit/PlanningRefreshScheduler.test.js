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
    scheduler.schedule({ includePublications: true, includeEligibility: true, reason: "publish" });
    scheduler.schedule({ reason: "mutation" });

    expect(scheduler.getState()).toMatchObject({ scheduled: true, inFlight: false });
    await vi.advanceTimersByTimeAsync(1_199);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({
      includePublications: true,
      includeEligibility: true,
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

  it("houdt een verversing vast tijdens een drag en voert haar na pointer-release eenmaal uit", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 1_200 });

    scheduler.schedule({ reason: "delete-ack" });
    const resume = scheduler.pause();
    await vi.advanceTimersByTimeAsync(1_200);

    expect(refresh).not.toHaveBeenCalled();
    expect(scheduler.getState()).toMatchObject({ paused: true, scheduled: false });

    expect(resume()).toBe(true);
    expect(resume()).toBe(false);
    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({
      includePublications: false,
      includeEligibility: false,
      reason: "delete-ack",
    });
    expect(scheduler.getState()).toMatchObject({ paused: false, scheduled: false, inFlight: false });
  });

  it("hervat pas nadat alle overlappende directe interacties zijn vrijgegeven", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 100 });

    scheduler.schedule({ reason: "mutation" });
    const resumeDrag = scheduler.pause();
    const resumeResize = scheduler.pause();
    await vi.advanceTimersByTimeAsync(100);

    resumeDrag();
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
    expect(scheduler.getState()).toMatchObject({ paused: true });

    resumeResize();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(scheduler.getState()).toMatchObject({ paused: false });
  });

  it("kan een tijdens slepen afgebroken gegevensronde direct na vrijgave uitvoeren", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPlanningRefreshScheduler({ refresh, delayMs: 8_000 });

    scheduler.schedule({ reason: "drag-cancelled-active-refresh", includeEligibility: true });
    const resume = scheduler.pause();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).not.toHaveBeenCalled();

    resume();
    await scheduler.flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({
      reason: "drag-cancelled-active-refresh",
      includeEligibility: true,
    }));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

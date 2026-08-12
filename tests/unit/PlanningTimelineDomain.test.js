import { describe, expect, it } from "vitest";
import {
  MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
  buildTimelineResizeCompositionPayload,
  clockToTimelineMinutes,
  getSuggestedTaskTimelineAllocation,
  getTaskTimelineDemand,
  getTaskTimelineGaps,
  getTimelineDayProjection,
  layoutTimelineIntervalLanes,
  resizeTimelineInterval,
  snapTimelineMinute,
  timelineMinutesToClock,
} from "@/components/planning/planningTimelineDomain";

const reception = {
  id: "occurrence-reception",
  service_date: "2026-08-15",
  end_date: "2026-08-15",
  window_start_time: "06:00",
  window_end_time: "20:00",
  execution_mode: "continuous",
  required_minutes: 840,
  revision: 4,
};

function segment({
  id,
  shiftId,
  occurrenceId = reception.id,
  start = "06:00",
  end = "14:00",
  startDate = "2026-08-15",
  endDate = startDate,
  status = "draft",
} = {}) {
  return {
    id,
    shift_id: shiftId,
    task_occurrence_id: occurrenceId,
    start_date: startDate,
    end_date: endDate,
    start_time: start,
    end_time: end,
    status,
  };
}

describe("planning tijdlijnconversies en dagprojecties", () => {
  it("converteert de volledige lokale klokrange inclusief exact 24:00", () => {
    expect(clockToTimelineMinutes("00:00")).toBe(0);
    expect(clockToTimelineMinutes("06:00")).toBe(360);
    expect(clockToTimelineMinutes("22:25")).toBe(1345);
    expect(clockToTimelineMinutes("24:00")).toBe(1440);
    expect(clockToTimelineMinutes("24:01")).toBeNull();
    expect(clockToTimelineMinutes("12:60")).toBeNull();
    expect(timelineMinutesToClock(0)).toBe("00:00");
    expect(timelineMinutesToClock(1345)).toBe("22:25");
    expect(timelineMinutesToClock(1440)).toBe("24:00");
    expect(timelineMinutesToClock(1441)).toBeNull();
  });

  it("splitst een nachtdienst in veilige halfopen dagslices", () => {
    const overnight = {
      service_date: "2026-08-15",
      end_date: "2026-08-16",
      start_time: "22:00",
      end_time: "06:00",
    };
    expect(getTimelineDayProjection(overnight, "2026-08-15")).toMatchObject({
      startMinute: 1320,
      endMinute: 1440,
      startTime: "22:00",
      endTime: "24:00",
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(getTimelineDayProjection(overnight, "2026-08-16")).toMatchObject({
      startMinute: 0,
      endMinute: 360,
      startTime: "00:00",
      endTime: "06:00",
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(getTimelineDayProjection(overnight, "2026-08-17")).toBeNull();
  });
});

describe("taakvraag en voorgestelde tijdlijndekking", () => {
  it("modelleert aaneengesloten taakvraag als het volledig te dekken venster", () => {
    expect(getTaskTimelineDemand(reception, reception.service_date)).toMatchObject({
      executionMode: "continuous",
      coverageMode: "full_window",
      mustCoverFullWindow: true,
      isFlexible: false,
      startMinute: 360,
      endMinute: 1200,
      windowMinutes: 840,
      totalRequiredMinutes: 840,
      sliceRequiredMinutes: 840,
    });
  });

  it("splitst 06:00-20:00 standaard in maximaal twaalf uur en daarna twee uur", () => {
    const first = getSuggestedTaskTimelineAllocation({
      occurrence: reception,
      serviceDate: reception.service_date,
      segments: [],
      shifts: [],
    });
    expect(first).toMatchObject({
      startTime: "06:00",
      endTime: "18:00",
      durationMinutes: 720,
      segment: {
        start_date: "2026-08-15",
        end_date: "2026-08-15",
        start_time: "06:00",
        end_time: "18:00",
      },
    });

    const morning = segment({ id: "segment-morning", shiftId: "shift-morning", end: "18:00" });
    const second = getSuggestedTaskTimelineAllocation({
      occurrence: reception,
      serviceDate: reception.service_date,
      segments: [morning],
      shifts: [{ id: "shift-morning", status: "draft" }],
    });
    expect(second).toMatchObject({
      startTime: "18:00",
      endTime: "20:00",
      durationMinutes: 120,
    });
    expect(getTaskTimelineGaps({
      occurrence: reception,
      serviceDate: reception.service_date,
      segments: [morning],
      shifts: [{ id: "shift-morning", status: "draft" }],
    })).toEqual([expect.objectContaining({
      startMinute: 1080,
      endMinute: 1200,
      durationMinutes: 120,
      allocatableMinutes: 120,
    })]);
  });

  it("verdeelt een 24/7-taak in twee automatische diensten van twaalf uur", () => {
    const fullDay = {
      ...reception,
      id: "occurrence-full-day",
      service_date: "2026-08-15",
      end_date: "2026-08-16",
      window_start_time: "00:00",
      window_end_time: "00:00",
      required_minutes: 1440,
    };
    expect(MAX_AUTOMATIC_TASK_SERVICE_MINUTES).toBe(720);
    const first = getSuggestedTaskTimelineAllocation({
      occurrence: fullDay,
      serviceDate: "2026-08-15",
      preferredMinutes: 24 * 60,
    });
    expect(first).toMatchObject({
      startTime: "00:00",
      endTime: "12:00",
      durationMinutes: 720,
      segment: {
        start_date: "2026-08-15",
        end_date: "2026-08-15",
        start_time: "00:00",
        end_time: "12:00",
      },
    });

    const firstSegment = segment({
      id: "segment-full-day-first",
      shiftId: "shift-full-day-first",
      occurrenceId: fullDay.id,
      start: "00:00",
      end: "12:00",
    });
    const second = getSuggestedTaskTimelineAllocation({
      occurrence: fullDay,
      serviceDate: "2026-08-15",
      segments: [firstSegment],
      shifts: [{ id: "shift-full-day-first", status: "draft" }],
    });
    expect(second).toMatchObject({
      startTime: "12:00",
      endTime: "24:00",
      durationMinutes: 720,
      segment: {
        start_date: "2026-08-15",
        end_date: "2026-08-16",
        start_time: "12:00",
        end_time: "00:00",
      },
    });

    const secondSegment = segment({
      id: "segment-full-day-second",
      shiftId: "shift-full-day-second",
      occurrenceId: fullDay.id,
      start: "12:00",
      end: "00:00",
      startDate: "2026-08-15",
      endDate: "2026-08-16",
    });
    expect(getTaskTimelineGaps({
      occurrence: fullDay,
      serviceDate: "2026-08-15",
      segments: [firstSegment, secondSegment],
      shifts: [
        { id: "shift-full-day-first", status: "draft" },
        { id: "shift-full-day-second", status: "draft" },
      ],
    })).toEqual([]);
  });

  it("behoudt een korte brand- en sluitronde exact op 22:00-22:25", () => {
    const fireRound = {
      ...reception,
      id: "occurrence-fire-round",
      window_start_time: "22:00",
      window_end_time: "22:25",
      required_minutes: 25,
    };
    expect(getTaskTimelineDemand(fireRound, fireRound.service_date)).toMatchObject({
      startMinute: 1320,
      endMinute: 1345,
      windowMinutes: 25,
    });
    expect(getSuggestedTaskTimelineAllocation({
      occurrence: fireRound,
      serviceDate: fireRound.service_date,
    })).toMatchObject({
      startTime: "22:00",
      endTime: "22:25",
      durationMinutes: 25,
    });
  });

  it("onderscheidt 30 minuten werk binnen een ruimer time-window van volledige vensterdekking", () => {
    const flexibleRound = {
      ...reception,
      id: "occurrence-flexible",
      end_date: "2026-08-16",
      window_start_time: "22:00",
      window_end_time: "00:00",
      execution_mode: "time_window",
      required_minutes: 30,
    };
    expect(getTaskTimelineDemand(flexibleRound, "2026-08-15")).toMatchObject({
      coverageMode: "duration_within_window",
      mustCoverFullWindow: false,
      isFlexible: true,
      windowMinutes: 120,
      totalRequiredMinutes: 30,
      sliceRequiredMinutes: 30,
    });
    const suggestion = getSuggestedTaskTimelineAllocation({
      occurrence: flexibleRound,
      serviceDate: "2026-08-15",
    });
    expect(suggestion).toMatchObject({
      startTime: "22:00",
      endTime: "22:30",
      durationMinutes: 30,
    });

    const allocated = segment({
      id: "segment-flexible",
      shiftId: "shift-flexible",
      occurrenceId: flexibleRound.id,
      start: "22:00",
      end: "22:30",
    });
    expect(getTaskTimelineGaps({
      occurrence: flexibleRound,
      serviceDate: "2026-08-15",
      segments: [allocated],
      shifts: [{ id: "shift-flexible", status: "draft" }],
    })).toEqual([]);
  });

  it("laat segmenten van geannuleerde diensten en removed segmenten de taak niet afdekken", () => {
    const ignored = [
      segment({ id: "segment-cancelled", shiftId: "shift-cancelled" }),
      segment({ id: "segment-removed", shiftId: "shift-active", status: "removed" }),
    ];
    expect(getTaskTimelineGaps({
      occurrence: reception,
      serviceDate: reception.service_date,
      segments: ignored,
      shifts: [
        { id: "shift-cancelled", status: "cancelled" },
        { id: "shift-active", status: "draft" },
      ],
    })).toEqual([expect.objectContaining({ startMinute: 360, endMinute: 1200 })]);
  });
});

describe("tijdlijninteractiegeometrie", () => {
  it("snapt op vijf minuten en begrenst een resize binnen taakgrenzen", () => {
    expect(snapTimelineMinute(722)).toBe(720);
    expect(snapTimelineMinute(723)).toBe(725);
    expect(snapTimelineMinute(2000, { minMinute: 360, maxMinute: 1200 })).toBe(1200);

    expect(resizeTimelineInterval({
      startMinute: 360,
      endMinute: 840,
      edge: "end",
      pointerMinute: 1003,
      minMinute: 360,
      maxMinute: 1200,
    })).toMatchObject({
      startMinute: 360,
      endMinute: 1005,
      startTime: "06:00",
      endTime: "16:45",
    });
    expect(resizeTimelineInterval({
      startMinute: 400,
      endMinute: 840,
      edge: "start",
      pointerMinute: 300,
      minMinute: 360,
      maxMinute: 1200,
    })).toMatchObject({ startMinute: 360, endMinute: 840 });
    expect(resizeTimelineInterval({
      startMinute: 360,
      endMinute: 840,
      edge: "end",
      pointerMinute: 361,
      minimumDurationMinutes: 30,
    })).toMatchObject({ startMinute: 360, endMinute: 390, durationMinutes: 30 });
  });

  it("verdeelt visueel overlappende korte intervallen over deterministische lanes", () => {
    const layout = layoutTimelineIntervalLanes([
      { id: "short-a", startMinute: 60, endMinute: 65 },
      { id: "short-b", startMinute: 70, endMinute: 80 },
      { id: "later", startMinute: 100, endMinute: 120 },
    ], { minimumVisualDurationMinutes: 30 });
    expect(layout.find(item => item.id === "short-a")).toMatchObject({
      lane: 0,
      laneCount: 2,
      visualStartMinute: 60,
      visualEndMinute: 90,
    });
    expect(layout.find(item => item.id === "short-b")).toMatchObject({
      lane: 1,
      laneCount: 2,
      visualStartMinute: 70,
      visualEndMinute: 100,
    });
    expect(layout.find(item => item.id === "later")).toMatchObject({
      lane: 0,
      laneCount: 1,
      groupIndex: 1,
    });
  });
});

describe("volledige compositiepayload bij resize", () => {
  it("wijzigt alleen het doelsegment en behoudt alle andere actieve segmenten en occurrence-revisies", () => {
    const shift = {
      id: "shift-composite",
      name: "Samengestelde dienst",
      revision: 7,
      required_count: 1,
    };
    const segments = [
      segment({ id: "segment-reception", shiftId: shift.id, start: "06:00", end: "12:00" }),
      segment({
        id: "segment-round",
        shiftId: shift.id,
        occurrenceId: "occurrence-round",
        start: "12:00",
        end: "14:00",
      }),
      segment({
        id: "segment-removed",
        shiftId: shift.id,
        occurrenceId: "occurrence-removed",
        start: "14:00",
        end: "15:00",
        status: "removed",
      }),
      segment({ id: "segment-other-shift", shiftId: "shift-other", start: "16:00", end: "17:00" }),
    ];
    const payload = buildTimelineResizeCompositionPayload({
      shift,
      targetSegmentId: "segment-reception",
      segments,
      occurrences: [
        reception,
        { id: "occurrence-round", revision: 9 },
      ],
      nextEndDate: "2026-08-15",
      nextEndTime: "11:30",
    });

    expect(payload).toEqual({
      action: "update_shift_composition",
      shift_id: shift.id,
      expected_shift_revision: 7,
      service_name: "Samengestelde dienst",
      required_count: 1,
      expected_occurrence_revisions: {
        [reception.id]: 4,
        "occurrence-round": 9,
      },
      segments: [
        {
          task_occurrence_id: reception.id,
          start_date: "2026-08-15",
          end_date: "2026-08-15",
          start_time: "06:00",
          end_time: "11:30",
        },
        {
          task_occurrence_id: "occurrence-round",
          start_date: "2026-08-15",
          end_date: "2026-08-15",
          start_time: "12:00",
          end_time: "14:00",
        },
      ],
    });
  });

  it("normaliseert een visuele 24:00-grens naar de volgende segmentdatum om het API-schema te respecteren", () => {
    const shift = { id: "shift-night", revision: 2, service_name_snapshot: "Avonddienst", required_count: 1 };
    const target = segment({
      id: "segment-night",
      shiftId: shift.id,
      start: "22:00",
      end: "23:30",
    });
    const payload = buildTimelineResizeCompositionPayload({
      shift,
      targetSegmentId: target.id,
      segments: [target],
      occurrences: [reception],
      nextEndDate: "2026-08-15",
      nextEndTime: "24:00",
    });
    expect(payload.segments[0]).toMatchObject({
      end_date: "2026-08-16",
      end_time: "00:00",
    });
  });
});

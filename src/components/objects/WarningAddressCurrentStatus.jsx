import React, { useEffect, useState } from "react";
import { availableIntervalsByDay, scheduleIntervalsByKind } from "./warningAvailabilityTimeline";
import { overrideForDate, overrideIntervalsByKind } from "./warningAvailabilityOverrides";

const STATUS_STYLES = {
  available: "bg-emerald-500",
  emergency: "bg-amber-500",
  unavailable: "bg-muted-foreground/50",
};

export default function WarningAddressCurrentStatus({ record }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dayIndex = (now.getDay() + 6) % 7;
  const minute = now.getHours() * 60 + now.getMinutes();
  const containsNow = interval => minute >= interval.start && minute < interval.end;
  let status = "unavailable";
  const override = overrideForDate(record, now);

  if (override) {
    const intervals = overrideIntervalsByKind(override);
    if (intervals.available.some(containsNow)) status = "available";
    else if (intervals.emergency.some(containsNow)) status = "emergency";
  } else if (record?.availability_mode === "schedule") {
    const schedule = scheduleIntervalsByKind(record);
    if (schedule.available[dayIndex].some(containsNow)) status = "available";
    else if (schedule.emergency[dayIndex].some(containsNow)) status = "emergency";
  } else if (availableIntervalsByDay(record)[dayIndex].some(containsNow)) {
    status = "available";
  }

  const label = status === "available" ? "Bereikbaar" : status === "emergency" ? "Alleen noodgevallen" : "Niet bereikbaar";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm"><span className={`h-2 w-2 rounded-full ${STATUS_STYLES[status]}`} />{label}</span>;
}
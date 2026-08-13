import React from "react";

function timeLabel(minute) {
  const value = Math.round(Number(minute) || 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export default function TimelineTimeScale({ startMinute, endMinute, boundaryMinutes = [] }) {
  const duration = Math.max(1, endMinute - startMinute);
  const markers = [...new Set([startMinute, ...boundaryMinutes, endMinute])]
    .filter(minute => minute >= startMinute && minute <= endMinute)
    .sort((left, right) => left - right);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-11 border-r border-border/70 bg-card/90" aria-hidden="true">
      {markers.map(minute => {
        const position = ((minute - startMinute) / duration) * 100;
        const edgeClass = minute === startMinute ? "translate-y-0" : minute === endMinute ? "-translate-y-full" : "-translate-y-1/2";
        return (
          <span key={minute} className={`absolute left-0 flex w-full items-center justify-end pr-1.5 ${edgeClass}`} style={{ top: `${position}%` }}>
            <span className="text-[9px] font-bold tabular-nums text-primary">{timeLabel(minute)}</span>
          </span>
        );
      })}
    </div>
  );
}
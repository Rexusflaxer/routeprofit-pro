import React from "react";

function timeLabel(minute) {
  const value = Math.round(Number(minute) || 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export default function TimelineTimeScale({ startMinute, endMinute, boundaryMinutes = [], openBoundaryMinutes = [] }) {
  const duration = Math.max(1, endMinute - startMinute);
  const openBoundaries = new Set(openBoundaryMinutes);
  const markers = [...new Set([startMinute, ...boundaryMinutes, endMinute])]
    .filter(minute => minute >= startMinute && minute <= endMinute)
    .sort((left, right) => left - right);
  const hours = [];
  for (let minute = Math.ceil(startMinute / 60) * 60; minute < endMinute; minute += 60) {
    if (minute > startMinute) hours.push(minute);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      <span className="absolute inset-y-0 left-0 w-11 border-r border-slate-700/70 bg-[#0c1728]/95" />
      {hours.map(minute => (
        <span key={`hour-${minute}`} className="absolute left-11 right-0 h-px bg-slate-500/15" style={{ top: `${((minute - startMinute) / duration) * 100}%` }} />
      ))}
      {markers.map(minute => {
        const position = ((minute - startMinute) / duration) * 100;
        const edgeClass = minute === startMinute ? "translate-y-0" : minute === endMinute ? "-translate-y-full" : "-translate-y-1/2";
        return (
          <span key={minute} className={`absolute left-0 flex w-11 items-center justify-end pr-1.5 ${edgeClass}`} style={{ top: `${position}%` }}>
            <span className={`text-[9px] font-bold tabular-nums ${openBoundaries.has(minute) ? "text-rose-600 dark:text-rose-400" : "text-primary"}`}>{timeLabel(minute)}</span>
          </span>
        );
      })}
    </div>
  );
}
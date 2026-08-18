import React from "react";

const HOURS = Array.from({ length: 13 }, (_, index) => index * 2);

function positionClass(index) {
  if (index === 0) return "translate-x-0";
  if (index === HOURS.length - 1) return "-translate-x-full";
  return "-translate-x-1/2";
}

export default function ObjectTaskTimeScale() {
  return (
    <div className="flex h-8 bg-background" aria-hidden="true">
      <span className="w-20 shrink-0" />
      <div className="relative flex-1">
        {HOURS.map((hour, index) => (
          <span
            key={hour}
            className={`absolute bottom-1 text-[10px] text-muted-foreground ${positionClass(index)}`}
            style={{ left: `${(index / 12) * 100}%` }}
          >
            {String(hour).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}
import React from "react";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

export default function WarningAvailabilityDetails({ record }) {
  if (record?.availability_mode !== "not_call_periods") {
    return <p className="text-xs text-muted-foreground">Deze contactpersoon mag iedere dag 24 uur worden gebeld.</p>;
  }
  const periods = Array.isArray(record.not_call_periods) ? record.not_call_periods : [];
  return (
    <div className="mt-2 space-y-1.5 border-t border-border pt-2" onClick={event => event.stopPropagation()}>
      {WEEKDAY_OPTIONS.map(day => {
        const blocks = periods.filter(period => period.days?.includes(day.key));
        return (
          <div key={day.key} className="grid grid-cols-[72px_1fr] gap-2 text-xs">
            <span className="font-medium text-foreground">{day.label}</span>
            <span className="flex flex-wrap gap-1">
              {blocks.length ? blocks.map((block, index) => <span key={`${block.start_time}-${block.end_time}-${index}`} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Niet bellen {block.start_time}–{block.end_time}</span>) : <span className="text-muted-foreground">Geen beperking</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
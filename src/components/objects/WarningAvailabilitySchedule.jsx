import React from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

export default function WarningAvailabilitySchedule({ periods, onToggleDay, onChangeTime }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Niet-bellenperioden per dag *</legend>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {WEEKDAY_OPTIONS.map(day => {
          const period = periods.find(item => item.days?.includes(day.key));
          return (
            <div key={day.key} className="grid gap-3 bg-card p-3 sm:grid-cols-[150px_1fr_1fr] sm:items-end">
              <button type="button" aria-pressed={Boolean(period)} onClick={() => onToggleDay(day.key)} className="flex items-center gap-2 text-left text-sm font-medium">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${period ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{period && <Check className="h-3.5 w-3.5" />}</span>
                {day.label}
              </button>
              {period && <>
                <div className="space-y-1"><Label htmlFor={`not-call-start-${day.key}`} className="text-xs text-muted-foreground">Niet bellen vanaf</Label><Input id={`not-call-start-${day.key}`} type="time" value={period.start_time} onChange={event => onChangeTime(day.key, "start_time", event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`not-call-end-${day.key}`} className="text-xs text-muted-foreground">Niet bellen tot</Label><Input id={`not-call-end-${day.key}`} type="time" value={period.end_time} onChange={event => onChangeTime(day.key, "end_time", event.target.value)} /></div>
              </>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Een tijdvak mag over middernacht lopen, bijvoorbeeld 22:00 tot 07:00.</p>
    </fieldset>
  );
}
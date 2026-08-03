import React from "react";
import { Calendar } from "@/components/ui/calendar";

export default function WarningOverrideDatePicker({ mode, onModeChange, range, onRangeChange, dates, onDatesChange, selectedCount }) {
  return <fieldset className="space-y-3">
    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Kies de datum of datums</legend>
    <div className="inline-flex rounded-md border border-border bg-muted/30 p-1">
      <button type="button" onClick={() => onModeChange("range")} className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${mode === "range" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Aaneengesloten periode</button>
      <button type="button" onClick={() => onModeChange("multiple")} className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${mode === "multiple" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Losse datums</button>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      {mode === "range"
        ? <Calendar mode="range" selected={range} onSelect={onRangeChange} numberOfMonths={2} className="mx-auto w-fit" />
        : <Calendar mode="multiple" selected={dates} onSelect={value => onDatesChange(value || [])} numberOfMonths={2} className="mx-auto w-fit" />}
    </div>
    <p className={`text-xs ${selectedCount ? "font-medium text-primary" : "text-muted-foreground"}`}>{selectedCount ? `${selectedCount} datum${selectedCount === 1 ? "" : "s"} geselecteerd` : mode === "range" ? "Klik op een begin- en einddatum." : "Klik op alle losse datums die u wilt aanpassen."}</p>
  </fieldset>;
}
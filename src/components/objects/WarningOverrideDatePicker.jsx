import React from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

export default function WarningOverrideDatePicker({ mode, onModeChange, range, onRangeChange, dates, onDatesChange }) {
  return <div>
    <div className="mb-3 flex gap-2">
      <Button type="button" size="sm" variant={mode === "range" ? "default" : "outline"} onClick={() => onModeChange("range")}>Datum of periode</Button>
      <Button type="button" size="sm" variant={mode === "multiple" ? "default" : "outline"} onClick={() => onModeChange("multiple")}>Losse datums</Button>
    </div>
    {mode === "range"
      ? <Calendar mode="range" selected={range} onSelect={onRangeChange} numberOfMonths={1} className="rounded-md border border-border" />
      : <Calendar mode="multiple" selected={dates} onSelect={value => onDatesChange(value || [])} numberOfMonths={1} className="rounded-md border border-border" />}
  </div>;
}
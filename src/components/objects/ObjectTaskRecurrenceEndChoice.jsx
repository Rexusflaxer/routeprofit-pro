import React from "react";
import { CalendarDays, Infinity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ObjectTaskRecurrenceEndChoice({ hasEndDate, date, minDate, disabled = false, onModeChange, onDateChange }) {
  const options = [
    { value: false, label: "Onbepaalde tijd", icon: Infinity },
    { value: true, label: "Einddatum", icon: CalendarDays },
  ];

  return (
    <div className="space-y-2">
      <Label className="text-[11px]">Looptijd</Label>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1" role="radiogroup" aria-label="Looptijd herhaling">
        {options.map(option => (
          <button key={option.label} type="button" role="radio" aria-checked={hasEndDate === option.value} disabled={disabled} onClick={() => onModeChange(option.value)} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${hasEndDate === option.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <option.icon className="h-3.5 w-3.5" />{option.label}
          </button>
        ))}
      </div>
      {hasEndDate && (
        <div className="space-y-1">
          <Label htmlFor="object-task-recurrence-end-date" className="text-[11px]">Datum</Label>
          <Input id="object-task-recurrence-end-date" type="date" min={minDate} value={date} disabled={disabled} onChange={event => onDateChange(event.target.value)} />
        </div>
      )}
    </div>
  );
}
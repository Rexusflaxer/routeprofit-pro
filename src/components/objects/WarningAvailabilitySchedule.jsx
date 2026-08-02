import React from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

export default function WarningAvailabilitySchedule({ periods, onToggleDay, onAddPeriod, onRemovePeriod, onChangeTime }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Niet-bellenperioden per dag *</legend>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {WEEKDAY_OPTIONS.map(day => {
          const blocks = periods.map((period, index) => ({ period, index })).filter(({ period }) => period.days?.includes(day.key));
          return <div key={day.key} className="space-y-3 bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <button type="button" aria-pressed={blocks.length > 0} onClick={() => onToggleDay(day.key)} className="flex items-center gap-2 text-left text-sm font-medium"><span className={`flex h-5 w-5 items-center justify-center rounded border ${blocks.length ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{blocks.length > 0 && <Check className="h-3.5 w-3.5" />}</span>{day.label}</button>
              {blocks.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => onAddPeriod(day.key)} disabled={periods.length >= 21}><Plus className="h-3.5 w-3.5" /> Bloktijd</Button>}
            </div>
            {blocks.map(({ period, index }, blockIndex) => <div key={`${day.key}-${index}`} className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1"><Label htmlFor={`not-call-start-${day.key}-${index}`} className="text-xs text-muted-foreground">Niet bellen vanaf</Label><Input id={`not-call-start-${day.key}-${index}`} type="time" value={period.start_time} onChange={event => onChangeTime(index, "start_time", event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor={`not-call-end-${day.key}-${index}`} className="text-xs text-muted-foreground">Niet bellen tot</Label><Input id={`not-call-end-${day.key}-${index}`} type="time" value={period.end_time} onChange={event => onChangeTime(index, "end_time", event.target.value)} /></div>
              {blocks.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => onRemovePeriod(index)} aria-label={`Bloktijd ${blockIndex + 1} verwijderen`}><Trash2 className="h-4 w-4" /></Button>}
            </div>)}
          </div>;
        })}
      </div>
      <p className="text-xs text-muted-foreground">Voeg meerdere bloktijden toe wanneer er op één dag verschillende niet-bellenperioden gelden.</p>
    </fieldset>
  );
}
import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { overrideStatusLabel } from "./warningAvailabilityOverrides";

const formatDate = value => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const dateSummary = dates => dates.length === 1 ? formatDate(dates[0]) : `${dates.length} datums · ${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`;

export default function WarningOverrideList({ overrides, onDelete, deleting }) {
  if (!overrides.length) return <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Nog geen specifieke uitzonderingen ingesteld.</p>;
  return <div className="max-h-48 space-y-2 overflow-y-auto">
    {overrides.map(item => <div key={item.id} className="flex items-start gap-3 rounded-md border border-border p-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.availability_status === "available" ? "bg-emerald-500" : item.availability_status === "emergency_only" ? "bg-amber-500" : "bg-muted-foreground/50"}`} />
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{dateSummary(item.dates || [])}</p><p className="text-xs text-muted-foreground">{overrideStatusLabel(item.availability_status)}{item.reason ? ` · ${item.reason}` : ""}</p></div>
      <Button type="button" variant="ghost" size="icon" disabled={deleting} onClick={() => onDelete(item)} aria-label="Uitzondering verwijderen"><Trash2 className="h-4 w-4 text-destructive" /></Button>
    </div>)}
  </div>;
}
import React from "react";
import { Button } from "@/components/ui/button";

const TOOLS = [
  { key: "available", label: "Bereikbaar", color: "border-primary/40 bg-primary/25" },
  { key: "emergency_only", label: "Alleen noodgevallen", color: "border-chart-4/60 bg-chart-4/45" },
  { key: null, label: "Niet bereikbaar", color: "border-border bg-card" },
];

export default function WarningTimelineEditToolbar({ tool, onToolChange, changedCount, saving, onCancel, onSave }) {
  return <div className="mb-3 flex min-w-[900px] flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
    <div><p className="text-xs font-semibold">Teken de afwijkende tijden</p><div className="mt-2 flex flex-wrap gap-2">{TOOLS.map(option => <button key={option.label} type="button" onClick={() => onToolChange(option.key)} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${tool === option.key ? "border-foreground bg-muted" : "border-border bg-card"}`}><span className={`h-3 w-3 rounded-sm border ${option.color}`} />{option.label}</button>)}</div></div>
    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{changedCount} aangepaste dag{changedCount === 1 ? "" : "en"}</span><Button type="button" size="sm" variant="outline" onClick={onCancel}>Annuleren</Button><Button type="button" size="sm" disabled={!changedCount || saving} onClick={onSave}>{saving ? "Opslaan..." : "Aanpassingen opslaan"}</Button></div>
  </div>;
}
import React from "react";

const TOOLS = [
  { key: "available", label: "Bereikbaar", description: "De hele dag bereikbaar", color: "border-primary/40 bg-primary/25" },
  { key: "emergency_only", label: "Alleen noodgevallen", description: "Alleen bellen bij spoed", color: "border-chart-4/60 bg-chart-4/45" },
  { key: "unavailable", label: "Niet bereikbaar", description: "Deze dag niet bellen", color: "border-border bg-card" },
];

export default function WarningOverrideStatusPicker({ value, onChange }) {
  return <fieldset className="space-y-3">
    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2. Kies de bereikbaarheid</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      {TOOLS.map(option => <button key={option.key} type="button" onClick={() => onChange(option.key)} className={`flex items-start gap-2.5 rounded-md border px-3 py-3 text-left transition-colors ${value === option.key ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/40"}`}>
        <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border ${option.color}`} />
        <span><strong className="block text-xs font-medium">{option.label}</strong><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{option.description}</span></span>
      </button>)}
    </div>
  </fieldset>;
}
import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TerrainSelectionRow({ selectionKey, label, highlighted, disabled, viewOnly, onHighlight, onRemove }) {
  return <div className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${highlighted ? "border-amber-500 bg-amber-500/10" : "border-border/60 bg-background/35"}`}>
    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label} weergeven op kaart`}
      onMouseEnter={() => onHighlight(selectionKey)} onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(selectionKey)} onBlur={() => onHighlight(null)} onClick={() => onHighlight(selectionKey)}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${highlighted ? "bg-amber-500" : "bg-emerald-500"}`} />
      <span className="truncate">{label}</span>
    </button>
    {!viewOnly && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}
      onClick={() => { onHighlight(null); onRemove(); }} aria-label={`${label} verwijderen`}><Trash2 className="h-3.5 w-3.5" /></Button>}
  </div>;
}

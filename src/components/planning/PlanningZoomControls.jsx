import React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlanningZoomControls({ value, onZoomIn, onZoomOut, canZoomIn, canZoomOut }) {
  return (
    <div className="absolute right-3 top-2 z-[60] flex items-center rounded-md border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Planning uitzoomen">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-11 text-center text-[10px] font-semibold tabular-nums text-muted-foreground" aria-live="polite">{value}%</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Planning inzoomen">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
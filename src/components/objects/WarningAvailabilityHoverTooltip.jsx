import React from "react";
import { createPortal } from "react-dom";
import { Repeat2, Shuffle } from "lucide-react";

const formatMinutes = minutes => minutes === 1440
  ? "24:00"
  : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export default function WarningAvailabilityHoverTooltip({ hover }) {
  if (!hover) return null;
  return createPortal(
    <div className="pointer-events-none fixed z-[100] min-w-32 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg" style={{ left: hover.x, top: hover.y }}>
      <div className="font-medium">{hover.adjusted ? "Aangepaste tijd" : hover.day} · {formatMinutes(hover.minute)}</div>
      {hover.adjusted && <div className="mt-0.5 text-[11px] text-muted-foreground">{hover.day}</div>}
      {hover.interval && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><span className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${hover.kind === "available" ? "border-primary/40 bg-primary/25" : "border-chart-4/60 bg-chart-4/45"}`} /><span>{formatMinutes(hover.interval.start)} – {formatMinutes(hover.interval.end)}</span></div>}
      {hover.interval?.alternative ? <div className="mt-1.5 flex items-center gap-1.5 font-medium text-primary"><Shuffle className="h-3.5 w-3.5" /><span>Aangepast alternatief</span></div> : hover.interval?.repeating && <div className="mt-1.5 flex items-center gap-1.5 font-medium text-primary"><Repeat2 className="h-3.5 w-3.5" /><span>Wekelijkse herhaling</span></div>}
      {hover.adjusted && <div className="mt-1 max-w-48 text-muted-foreground">{hover.reason ? `Reden: ${hover.reason}` : "Geen reden opgegeven"}</div>}
    </div>,
    document.body,
  );
}
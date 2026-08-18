import React from "react";

export default function ObjectTaskCoverageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground" aria-label="Dekking van taakuren">
      <span className="font-medium text-foreground">Dekking:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-chart-2/70 bg-chart-2/60" />
        Ingeplande dienst
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-primary/40 bg-primary/25" />
        Nog open
      </span>
    </div>
  );
}
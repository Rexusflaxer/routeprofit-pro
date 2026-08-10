import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SECURITY_PLAN_TASK_TYPES } from "./securityPlanConfig";

export default function SecurityPlanCategorySidebar({ summaries, selectedType, loading, error, onSelect, onRetry }) {
  const summaryByType = new Map(summaries.map(summary => [summary.task_type, summary]));

  return (
    <aside className="max-h-64 w-full shrink-0 overflow-y-auto border-b border-border/70 bg-card/20 p-3 sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r">
      <div className="mb-2 flex items-center justify-between gap-2 px-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorieën</p>
        {error && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onRetry} aria-label="Categorieën opnieuw laden"><RefreshCw className="h-3.5 w-3.5" /></Button>}
      </div>
      <nav aria-label="Beveiligingsplancategorieën" className="space-y-0.5">
        {SECURITY_PLAN_TASK_TYPES.map(category => {
          const total = Number(summaryByType.get(category.key)?.total || 0);
          const active = selectedType === category.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => onSelect(category.key)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/40"}`}
            >
              <span className="min-w-0 truncate">{category.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{loading ? "…" : error ? "—" : total}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
import React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function PlanningMultiSelect({ values = [], onChange, options = [], allLabel, singularLabel, ariaLabel, className }) {
  const normalizedValues = Array.isArray(values) ? values : values === "all" ? [] : [values];
  const selected = new Set(normalizedValues.map(String));
  const summary = normalizedValues.length === 0
    ? allLabel
    : normalizedValues.length === 1
      ? options.find(option => String(option.value) === String(normalizedValues[0]))?.label || singularLabel
      : `${normalizedValues.length} ${singularLabel}`;
  const toggle = value => {
    const key = String(value);
    onChange(selected.has(key) ? normalizedValues.filter(item => String(item) !== key) : [...normalizedValues, key]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-8 justify-between bg-card px-2 text-[12px] font-normal", className)} aria-label={ariaLabel}>
          <span className="truncate">{summary}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-border">{normalizedValues.length === 0 && <Check className="h-3 w-3" />}</span>{allLabel}
        </button>
        <div className="my-1 border-t border-border" />
        <div className="max-h-64 overflow-y-auto">
          {options.map(option => {
            const active = selected.has(String(option.value));
            return <button key={option.value} type="button" onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border">{active && <Check className="h-3 w-3" />}</span><span className="truncate">{option.label}</span></button>;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
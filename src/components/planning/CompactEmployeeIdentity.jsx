import React from "react";
import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PlanningEmployeeHoverCard from "@/components/planning/PlanningEmployeeHoverCard";
import { cn } from "@/lib/utils";

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function compactName(name) {
  const parts = String(name || "Onbekend").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Onbekend";
  return `${parts[0][0].toUpperCase()}. ${parts.at(-1)}`;
}

export default function CompactEmployeeIdentity({ name, photoUrl, employee, disabled, onClick, warningCount = 0, variant = "default" }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait",
              variant === "midnight" && "h-full flex-col items-start justify-end gap-2 focus-visible:ring-white/70",
              variant === "portrait" && "h-full flex-col items-start justify-end gap-1 focus-visible:ring-white/70",
              variant === "timeline" && "h-auto flex-none flex-col items-start justify-start gap-0.5 focus-visible:ring-white/70",
            )}
            aria-label={name}
          >
            {variant === "midnight" && (
              <Avatar className={cn(
                "shrink-0 rounded-md border border-white/15 bg-white/10",
                variant === "timeline" ? "h-14 w-11" : "h-14 w-11",
              )}>
                <AvatarImage src={photoUrl || undefined} alt={`Profielfoto van ${name}`} className="object-cover object-top" />
                <AvatarFallback className={cn(
                  "text-[10px] font-bold",
                  variant === "timeline"
                    ? "bg-blue-100/55 text-slate-700 dark:bg-white/10 dark:text-slate-100"
                    : "bg-white/10 text-slate-100",
                )}>{initials(name)}</AvatarFallback>
              </Avatar>
            )}
            <span className={cn(
              "min-w-0 truncate text-[24px] font-bold leading-none tracking-tight text-primary",
              variant === "midnight" && "pb-0.5 text-[22px] text-slate-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
              variant === "portrait" && "pb-0.5 text-[18px] text-slate-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]",
              variant === "timeline" && "text-[16px] text-slate-900 dark:text-slate-50",
            )} title={compactName(name)}>{compactName(name)}</span>
            {warningCount > 0 && ((variant === "midnight" || variant === "portrait" || variant === "timeline") ? (
              <span className={cn(
                "inline-flex items-center gap-1 text-slate-100",
                variant === "timeline"
                  ? "text-[9px] font-medium text-slate-700 dark:text-slate-100"
                  : variant === "portrait"
                    ? "text-[10px] font-medium text-slate-200"
                    : "absolute right-2.5 top-2.5 rounded-md border border-white/10 bg-white/[0.08] px-1.5 py-1 text-[9px] font-semibold shadow-sm backdrop-blur-sm",
              )} aria-label={`${warningCount} waarschuwingen`}>
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                {warningCount}{variant === "timeline" || variant === "portrait" ? " waarschuwingen" : ""}
              </span>
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-label={`${warningCount} waarschuwingen`} />
            ))}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <PlanningEmployeeHoverCard name={name} photoUrl={photoUrl} employee={employee} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
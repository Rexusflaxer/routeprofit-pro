import React from "react";
import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function compactName(name) {
  const parts = String(name || "Onbekend").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Onbekend";
  return `${parts[0][0].toUpperCase()}. ${parts.at(-1)}`;
}

export default function CompactEmployeeIdentity({ name, photoUrl, disabled, onClick, warningCount = 0 }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
            aria-label={name}
          >
            <span className="min-w-0 truncate text-[24px] font-bold leading-none tracking-tight text-primary" title={compactName(name)}>{compactName(name)}</span>
            {warningCount > 0 && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-label={`${warningCount} waarschuwingen`} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <span className="flex items-center gap-2">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={photoUrl || undefined} alt={`Profielfoto van ${name}`} className="object-cover object-top" />
              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="max-w-52 text-[11px] font-semibold leading-tight">{name}</span>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
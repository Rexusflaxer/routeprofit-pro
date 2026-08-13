import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function lastName(name) {
  return String(name || "Onbekend").trim().split(/\s+/).filter(Boolean).at(-1) || "Onbekend";
}

export default function CompactEmployeeIdentity({ name, photoUrl, disabled, onClick }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
            aria-label={name}
          >
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-primary/10 px-1 text-[8px] font-bold text-primary">{initials(name)}</span>
            <span className="min-w-0 truncate text-[10px] font-semibold leading-tight text-foreground">{lastName(name)}</span>
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
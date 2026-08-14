import React from "react";
import { ClipboardPaste, Copy } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export default function PlanningClipboardContextMenu({ children, mode, available, disabled, detail, onSelect }) {
  if (!available) return children;
  const isCopy = mode === "copy";
  const Icon = isCopy ? Copy : ClipboardPaste;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {detail && <ContextMenuLabel className="truncate text-[11px] font-medium text-muted-foreground">{detail}</ContextMenuLabel>}
        <ContextMenuItem disabled={disabled} onSelect={onSelect} className="gap-2 text-[12px]">
          <Icon className="h-3.5 w-3.5" />
          {isCopy ? "Dienst kopiëren" : "Dienst hier plakken"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
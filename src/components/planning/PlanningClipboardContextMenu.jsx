import React from "react";
import { ClipboardPaste, Copy } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import useTouchContextMenu from "@/components/planning/useTouchContextMenu";

export default function PlanningClipboardContextMenu({
  children, mode, available, disabled, detail, label, onSelect,
  secondaryLabel, secondaryDisabled, onSecondarySelect, items,
}) {
  const touchTriggerProps = useTouchContextMenu();
  if (!available) return children;
  const isCopy = mode === "copy";
  const actions = items || [
    { label: label || (isCopy ? "Dienst kopiëren" : "Dienst hier plakken"), disabled, onSelect, Icon: isCopy ? Copy : ClipboardPaste },
    ...(secondaryLabel ? [{ label: secondaryLabel, disabled: secondaryDisabled, onSelect: onSecondarySelect, Icon: Copy }] : []),
  ];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild {...touchTriggerProps}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {detail && <ContextMenuLabel className="truncate text-[11px] font-medium text-muted-foreground">{detail}</ContextMenuLabel>}
        {actions.map((action, index) => (
          <ContextMenuItem key={`${action.label}-${index}`} disabled={action.disabled} onSelect={action.onSelect} className={action.destructive ? "gap-2 text-[12px] text-destructive focus:text-destructive" : "gap-2 text-[12px]"}>
            {action.Icon && <action.Icon className="h-3.5 w-3.5" />}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
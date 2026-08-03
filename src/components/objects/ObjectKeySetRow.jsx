import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { keyTypeLabel, objectKeyStatus } from "./objectKeyConfig";

const STATUS_BADGE_CLASSES = {
  in_storage: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  missing: "border border-destructive/20 bg-destructive/10 text-destructive",
  out_of_service: "border border-border bg-muted text-muted-foreground",
};

export default function ObjectKeySetRow({ set, expanded, onToggle, onOpenHistory, onRequestDelete, disabled }) {
  return (
    <div>
      <div className="group grid cursor-pointer grid-cols-[200px_1fr_140px_130px_40px] items-center px-4 py-3 transition-colors hover:bg-accent/30" onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-2"><ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} /><span className="truncate text-sm font-medium text-foreground">{set.display_label}</span></div>
        <span className="truncate text-xs font-medium text-foreground">Sleutelnummer {set.key_number}</span>
        <span className="text-xs text-muted-foreground">{set.keys.length} sleutel{set.keys.length === 1 ? "" : "s"}</span>
        <span className="text-xs text-muted-foreground">—</span>
        <span />
      </div>
      <AnimatePresence>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden divide-y divide-border border-t border-border bg-muted/10">
        {set.keys.length ? set.keys.map(key => { const status = objectKeyStatus(key.status); return <div key={key.id} role="button" tabIndex={0} onClick={() => onOpenHistory(key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onOpenHistory(key); }} className="group grid cursor-pointer grid-cols-[200px_1fr_140px_130px_40px] items-center px-4 py-3 transition-colors hover:bg-accent/30"><div className="min-w-0 pl-5"><span className="block truncate text-sm font-medium text-foreground">{key.serial_number || "Geen serienummer"}</span></div><span className="truncate text-xs text-muted-foreground">{keyTypeLabel(key.key_type)} · {key.brand}</span><Badge variant="secondary" className={`w-fit justify-self-start whitespace-nowrap ${STATUS_BADGE_CLASSES[key.status] || STATUS_BADGE_CLASSES.in_storage}`}>{status.label}</Badge><span className="text-xs text-muted-foreground">—</span><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Sleutel verwijderen" disabled={disabled} onClick={event => { event.stopPropagation(); onRequestDelete(key, set); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>; }) : <div className="flex items-center gap-2 px-9 py-3 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> Deze set bevat nog geen sleutels.</div>}
      </motion.div>}</AnimatePresence>
    </div>
  );
}
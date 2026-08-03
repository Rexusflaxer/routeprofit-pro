import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { keyTypeLabel, objectKeyStatus } from "./objectKeyConfig";

export default function ObjectKeySetRow({ set, expanded, onToggle, onOpenHistory, onRequestDelete, disabled }) {
  const summary = set.keys.length ? set.keys.map(key => key.serial_number || `${keyTypeLabel(key.key_type)} · ${key.brand}`).join(", ") : "Lege sleutelset";
  return (
    <div>
      <div className="group flex cursor-pointer items-center overflow-hidden px-4 py-3 transition-colors hover:bg-accent/30" onClick={onToggle}>
        <div className="flex w-64 shrink-0 min-w-0 items-center gap-2"><ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} /><span className="truncate text-sm font-medium text-foreground">{set.display_label}</span></div>
        <div className="w-36 shrink-0 text-sm font-medium text-foreground">{set.key_number}</div>
        <div className="w-20 shrink-0 text-xs text-muted-foreground">{set.keys.length} sleutel{set.keys.length === 1 ? "" : "s"}</div>
        <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{expanded ? "" : summary}</div>
      </div>
      <AnimatePresence>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
        <div className="mx-4 mb-3 ml-10 overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[160px_1fr_140px_40px] items-center border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span>Serienummer</span><span>Type en merk</span><span>Status</span><span /></div>
          {set.keys.length ? <div className="divide-y divide-border">{set.keys.map(key => { const status = objectKeyStatus(key.status); return <div key={key.id} role="button" tabIndex={0} onClick={() => onOpenHistory(key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onOpenHistory(key); }} className="group grid cursor-pointer grid-cols-[160px_1fr_140px_40px] items-center px-4 py-3 transition-colors hover:bg-accent/30"><span className="truncate text-sm font-medium text-foreground">{key.serial_number || "Geen serienummer"}</span><span className="truncate text-xs text-muted-foreground">{keyTypeLabel(key.key_type)} · {key.brand}</span><span className={`text-xs ${status.tone}`}>{status.label}</span><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Sleutel verwijderen" disabled={disabled} onClick={event => { event.stopPropagation(); onRequestDelete(key, set); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>; })}</div> : <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> Deze set bevat nog geen sleutels.</div>}
        </div>
      </motion.div>}</AnimatePresence>
    </div>
  );
}
import React, { useState } from "react";
import { ChevronRight, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { keyTypeLabel, objectKeyStatus } from "./objectKeyConfig";
import ObjectKeyDeleteDialog from "./ObjectKeyDeleteDialog";
import ObjectKeyHistoryDialog from "./ObjectKeyHistoryDialog";

export default function ObjectKeyTable({ sets, onDelete, disabled, deleting }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [historyKey, setHistoryKey] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toggle = id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const openHistory = key => setHistoryKey(key);
  return (
    <>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead>Sleutelset</TableHead><TableHead>Sleutelnummer</TableHead><TableHead>Aantal</TableHead><TableHead>Inhoud</TableHead></TableRow></TableHeader><TableBody>{sets.map(set => <React.Fragment key={set.id}><TableRow className="cursor-pointer" onClick={() => toggle(set.id)}><TableCell><div className="flex items-center gap-2 font-medium"><ChevronRight className={`h-4 w-4 transition-transform ${expanded.has(set.id) ? "rotate-90" : ""}`} />{set.display_label}</div></TableCell><TableCell className="font-medium">{set.key_number}</TableCell><TableCell>{set.keys.length}</TableCell><TableCell className="text-muted-foreground">{set.keys.length ? set.keys.map(key => key.serial_number || `${keyTypeLabel(key.key_type)} · ${key.brand}`).join(", ") : "Lege sleutelset"}</TableCell></TableRow>{expanded.has(set.id) && <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="bg-muted/10 p-3"><div className="overflow-hidden rounded-md border border-border bg-card">{set.keys.length ? set.keys.map(key => { const status = objectKeyStatus(key.status); return <div key={key.id} role="button" tabIndex={0} onClick={() => openHistory(key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openHistory(key); }} className="grid cursor-pointer grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-0 hover:bg-muted/40 sm:grid-cols-[120px_1fr_1fr_auto]"><div className="font-medium">{key.serial_number || "Geen serienummer"}</div><div className="text-sm text-muted-foreground">{keyTypeLabel(key.key_type)} · {key.brand}</div><div className="text-sm text-muted-foreground"><span className={status.tone}>{status.label}</span></div><div className="flex"><Button variant="ghost" size="icon" aria-label="Sleutel verwijderen" disabled={disabled} onClick={event => { event.stopPropagation(); setDeleteTarget({ key, set }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>; }) : <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> Deze set bevat nog geen sleutels.</div>}</div></TableCell></TableRow>}</React.Fragment>)}</TableBody></Table></div>
      <ObjectKeyHistoryDialog keyRecord={historyKey} open={Boolean(historyKey)} onOpenChange={open => { if (!open) setHistoryKey(null); }} />
      <ObjectKeyDeleteDialog target={deleteTarget} open={Boolean(deleteTarget)} deleting={deleting} onOpenChange={open => { if (!open) setDeleteTarget(null); }} onConfirm={() => { onDelete(deleteTarget.key, deleteTarget.set); setDeleteTarget(null); }} />
    </>
  );
}
import React, { useState } from "react";
import { ChevronRight, KeyRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { keyTypeLabel, objectKeyStatus } from "./objectKeyConfig";

export default function ObjectKeyTable({ sets, onEdit, onDelete, disabled }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = id => setExpanded(current => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  return (
    <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead>Sleutelset</TableHead><TableHead>Aantal</TableHead><TableHead>Inhoud</TableHead></TableRow></TableHeader><TableBody>{sets.map(set => <React.Fragment key={set.id}><TableRow className="cursor-pointer" onClick={() => toggle(set.id)}><TableCell><div className="flex items-center gap-2 font-medium"><ChevronRight className={`h-4 w-4 transition-transform ${expanded.has(set.id) ? "rotate-90" : ""}`} />{set.display_label}</div></TableCell><TableCell>{set.keys.length}</TableCell><TableCell className="text-muted-foreground">{set.keys.length ? set.keys.map(key => key.key_number).join(", ") : "Lege sleutelset"}</TableCell></TableRow>{expanded.has(set.id) && <TableRow className="hover:bg-transparent"><TableCell colSpan={3} className="bg-muted/10 p-3"><div className="overflow-hidden rounded-md border border-border bg-card">{set.keys.length ? set.keys.map(key => { const status = objectKeyStatus(key.status); return <div key={key.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-2.5 last:border-0 sm:grid-cols-[120px_1fr_1fr_auto]"><div className="font-medium">{key.key_number}</div><div className="text-sm text-muted-foreground">{keyTypeLabel(key.key_type)} · {key.brand}</div><div className="text-sm text-muted-foreground">{key.serial_number || "Geen serienummer"} · <span className={status.tone}>{status.label}</span></div><div className="flex"><Button variant="ghost" size="icon" disabled={disabled} onClick={() => onEdit(key)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" disabled={disabled} onClick={() => onDelete(key)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>; }) : <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> Deze set bevat nog geen sleutels.</div>}</div></TableCell></TableRow>}</React.Fragment>)}</TableBody></Table></div>
  );
}
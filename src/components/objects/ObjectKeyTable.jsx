import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import ObjectKeyDeleteDialog from "./ObjectKeyDeleteDialog";
import ObjectKeySetRow from "./ObjectKeySetRow";
import { keyTypeLabel, objectKeyStatus } from "./objectKeyConfig";

export default function ObjectKeyTable({ sets, onEdit, onDelete, disabled, deleting }) {
  const [expanded, setExpanded] = useState(() => new Set(sets.map(set => set.id)));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toggle = id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const populatedSets = sets.filter(set => set.keys.length);
  useEffect(() => {
    setExpanded(current => new Set([...current, ...sets.filter(set => set.keys.length).map(set => set.id)]));
  }, [sets]);
  return (
    <>
      <div className="hidden overflow-x-auto md:block"><div className="min-w-[720px]"><div className="grid grid-cols-[220px_1fr_150px_44px] items-center border-b border-border/70 bg-card/25 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span>Serienummer</span><span>Type en merk</span><span>Status</span><span /></div><div className="divide-y divide-border/70">{populatedSets.map(set => <ObjectKeySetRow key={set.id} set={set} expanded={expanded.has(set.id)} onToggle={() => toggle(set.id)} onEdit={onEdit} onRequestDelete={(key, keySet) => setDeleteTarget({ key, set: keySet })} disabled={disabled} />)}</div></div></div>
      <div className="divide-y divide-border/70 md:hidden">{populatedSets.flatMap(set => set.keys.map(key => { const status = objectKeyStatus(key.status); const readOnly = key.read_only === true; return <article key={key.assignment_id} className={`bg-card/25 px-4 py-3 ${readOnly ? "opacity-75" : ""}`}><button type="button" disabled={readOnly} onClick={() => onEdit(key)} className="w-full text-left disabled:cursor-default"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{key.serial_number || "Geen serienummer"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{keyTypeLabel(key.key_type)} · {key.brand}{readOnly ? " · Alleen-lezen" : ""}</p></div><Badge variant="secondary" className="shrink-0 text-[11px]">{status.label}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{set.display_label} · {set.key_number}</p></button><button type="button" disabled={disabled || readOnly} onClick={() => setDeleteTarget({ key, set })} className="mt-2 text-xs font-medium text-destructive disabled:opacity-50">Verwijderen</button></article>; }))}</div>
      <ObjectKeyDeleteDialog target={deleteTarget} open={Boolean(deleteTarget)} deleting={deleting} onOpenChange={open => { if (!open) setDeleteTarget(null); }} onConfirm={() => { onDelete(deleteTarget.key, deleteTarget.set); setDeleteTarget(null); }} />
    </>
  );
}

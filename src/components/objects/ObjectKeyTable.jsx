import React, { useState } from "react";
import ObjectKeyDeleteDialog from "./ObjectKeyDeleteDialog";
import ObjectKeyHistoryDialog from "./ObjectKeyHistoryDialog";
import ObjectKeySetRow from "./ObjectKeySetRow";

export default function ObjectKeyTable({ sets, onDelete, disabled, deleting }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [historyKey, setHistoryKey] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toggle = id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return (
    <>
      <div className="overflow-x-auto"><div className="min-w-[850px]"><div className="grid grid-cols-[200px_1fr_140px_130px_40px] items-center border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span>Serienummer</span><span>Type en merk</span><span>Status</span><span>Laatst gebruikt</span><span /></div><div className="divide-y divide-border">{sets.map(set => <ObjectKeySetRow key={set.id} set={set} expanded={expanded.has(set.id)} onToggle={() => toggle(set.id)} onOpenHistory={setHistoryKey} onRequestDelete={(key, keySet) => setDeleteTarget({ key, set: keySet })} disabled={disabled} />)}</div></div></div>
      <ObjectKeyHistoryDialog keyRecord={historyKey} open={Boolean(historyKey)} onOpenChange={open => { if (!open) setHistoryKey(null); }} />
      <ObjectKeyDeleteDialog target={deleteTarget} open={Boolean(deleteTarget)} deleting={deleting} onOpenChange={open => { if (!open) setDeleteTarget(null); }} onConfirm={() => { onDelete(deleteTarget.key, deleteTarget.set); setDeleteTarget(null); }} />
    </>
  );
}
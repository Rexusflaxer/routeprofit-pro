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
      <div className="overflow-x-auto"><div className="min-w-[720px] divide-y divide-border">{sets.map(set => <ObjectKeySetRow key={set.id} set={set} expanded={expanded.has(set.id)} onToggle={() => toggle(set.id)} onOpenHistory={setHistoryKey} onRequestDelete={(key, keySet) => setDeleteTarget({ key, set: keySet })} disabled={disabled} />)}</div></div>
      <ObjectKeyHistoryDialog keyRecord={historyKey} open={Boolean(historyKey)} onOpenChange={open => { if (!open) setHistoryKey(null); }} />
      <ObjectKeyDeleteDialog target={deleteTarget} open={Boolean(deleteTarget)} deleting={deleting} onOpenChange={open => { if (!open) setDeleteTarget(null); }} onConfirm={() => { onDelete(deleteTarget.key, deleteTarget.set); setDeleteTarget(null); }} />
    </>
  );
}
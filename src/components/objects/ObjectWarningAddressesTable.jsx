import React, { useEffect, useState } from "react";
import ObjectWarningAddressesDesktop from "./ObjectWarningAddressesDesktop";
import ObjectWarningAddressesMobile from "./ObjectWarningAddressesMobile";

export default function ObjectWarningAddressesTable({ rows, onEdit, onDelete, editingId, deletingId, onReorder, reorderDisabled, actionsDisabled }) {
  const [orderedRows, setOrderedRows] = useState(rows);

  useEffect(() => setOrderedRows(rows), [rows]);

  const handleDragEnd = result => {
    if (!result.destination || result.source.index === result.destination.index || reorderDisabled) return;
    const next = [...orderedRows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrderedRows(next);
    onReorder(next).catch(() => setOrderedRows(rows));
  };

  if (!orderedRows.length) return null;
  const shared = { rows: orderedRows, onEdit, onDelete, editingId, deletingId, onDragEnd: handleDragEnd, reorderDisabled, actionsDisabled };
  return (
    <>
      <ObjectWarningAddressesDesktop {...shared} />
      <ObjectWarningAddressesMobile {...shared} />
    </>
  );
}
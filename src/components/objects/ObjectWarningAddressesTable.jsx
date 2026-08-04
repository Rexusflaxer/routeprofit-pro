import React, { useEffect, useState } from "react";
import ObjectWarningAddressesDesktop from "./ObjectWarningAddressesDesktop";
import ObjectWarningAddressesMobile from "./ObjectWarningAddressesMobile";
import WarningAvailabilityTimelineDialog from "./WarningAvailabilityTimelineDialog";

export default function ObjectWarningAddressesTable({ rows, overrides = [], onEdit, onDelete, editingId, deletingId, onReorder, reorderDisabled, actionsDisabled, onOverridesChanged }) {
  const [orderedRows, setOrderedRows] = useState(rows);
  const [selectedAvailabilityRecord, setSelectedAvailabilityRecord] = useState(null);
  useEffect(() => setOrderedRows(rows), [rows]);

  const enrichedRows = orderedRows.map(row => ({
    ...row,
    specific_availability_overrides: overrides.filter(item => item.warning_address_id === row.id),
  }));
  const availabilityRecord = selectedAvailabilityRecord
    ? enrichedRows.find(row => row.id === selectedAvailabilityRecord.id) || selectedAvailabilityRecord
    : null;
  const handleDragEnd = result => {
    if (!result.destination || result.source.index === result.destination.index || reorderDisabled) return;
    const next = [...orderedRows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrderedRows(next);
    onReorder(next).catch(() => setOrderedRows(rows));
  };
  const handleRowClick = row => setSelectedAvailabilityRecord(row);

  if (!orderedRows.length) return null;
  const shared = { rows: enrichedRows, onEdit, onDelete, editingId, deletingId, onDragEnd: handleDragEnd, reorderDisabled, actionsDisabled, onRowClick: handleRowClick };
  return <>
    <ObjectWarningAddressesDesktop {...shared} />
    <ObjectWarningAddressesMobile {...shared} />
    <WarningAvailabilityTimelineDialog record={availabilityRecord} open={Boolean(availabilityRecord)} readOnly={actionsDisabled} onOpenChange={open => { if (!open) setSelectedAvailabilityRecord(null); }} onOverridesChanged={onOverridesChanged} />
  </>;
}

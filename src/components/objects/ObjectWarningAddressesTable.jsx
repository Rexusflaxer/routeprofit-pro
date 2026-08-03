import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ObjectWarningAddressesDesktop from "./ObjectWarningAddressesDesktop";
import ObjectWarningAddressesMobile from "./ObjectWarningAddressesMobile";
import WarningAvailabilityTimelineDialog from "./WarningAvailabilityTimelineDialog";
import WarningAddressRowMenu from "./WarningAddressRowMenu";
import WarningSpecificAvailabilityDialog from "./WarningSpecificAvailabilityDialog";

export default function ObjectWarningAddressesTable({ rows, onEdit, onDelete, editingId, deletingId, onReorder, reorderDisabled, actionsDisabled }) {
  const [orderedRows, setOrderedRows] = useState(rows);
  const [rowMenu, setRowMenu] = useState(null);
  const [availabilityId, setAvailabilityId] = useState(null);
  const [specificId, setSpecificId] = useState(null);
  const objectId = rows[0]?.object_id;
  const overrideQuery = useQuery({
    queryKey: ["warning-availability-overrides", objectId],
    queryFn: () => base44.entities.WarningAddressAvailabilityOverride.filter({ object_id: objectId }, "-created_date"),
    enabled: Boolean(objectId),
  });

  useEffect(() => setOrderedRows(rows), [rows]);

  const enrichedRows = orderedRows.map(row => ({
    ...row,
    specific_availability_overrides: (overrideQuery.data || []).filter(item => item.warning_address_id === row.id),
  }));
  const availabilityRecord = enrichedRows.find(row => row.id === availabilityId) || null;
  const specificRecord = enrichedRows.find(row => row.id === specificId) || null;
  const handleDragEnd = result => {
    if (!result.destination || result.source.index === result.destination.index || reorderDisabled) return;
    const next = [...orderedRows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrderedRows(next);
    onReorder(next).catch(() => setOrderedRows(rows));
  };
  const handleRowClick = (row, event) => setRowMenu({ row, x: event.clientX + 4, y: event.clientY + 4 });

  if (!orderedRows.length) return null;
  const shared = { rows: enrichedRows, onEdit, onDelete, editingId, deletingId, onDragEnd: handleDragEnd, reorderDisabled, actionsDisabled, onRowClick: handleRowClick };
  return <>
    <ObjectWarningAddressesDesktop {...shared} />
    <ObjectWarningAddressesMobile {...shared} />
    <WarningAddressRowMenu menu={rowMenu} disabled={actionsDisabled} onClose={() => setRowMenu(null)} onWeekSchedule={() => { setAvailabilityId(rowMenu.row.id); setRowMenu(null); }} onSpecificAvailability={() => { setSpecificId(rowMenu.row.id); setRowMenu(null); }} />
    <WarningAvailabilityTimelineDialog record={availabilityRecord} open={Boolean(availabilityRecord)} onOpenChange={open => { if (!open) setAvailabilityId(null); }} />
    <WarningSpecificAvailabilityDialog record={specificRecord} open={Boolean(specificRecord)} onOpenChange={open => { if (!open) setSpecificId(null); }} />
  </>;
}
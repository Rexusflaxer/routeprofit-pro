import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ObjectWarningAddressesDesktop from "./ObjectWarningAddressesDesktop";
import ObjectWarningAddressesMobile from "./ObjectWarningAddressesMobile";
import WarningAvailabilityTimelineDialog from "./WarningAvailabilityTimelineDialog";

export default function ObjectWarningAddressesTable({ rows, onEdit, onDelete, editingId, deletingId, onReorder, reorderDisabled, actionsDisabled }) {
  const [orderedRows, setOrderedRows] = useState(rows);
  const [availabilityId, setAvailabilityId] = useState(null);
  const objectId = rows[0]?.object_id;
  const overrideQuery = useQuery({
    queryKey: ["warning-availability-overrides", objectId],
    queryFn: () => base44.entities.WarningAddressAvailabilityOverride.filter({ object_id: objectId }, "-created_date"),
    enabled: Boolean(objectId),
  });
  const usersQuery = useQuery({
    queryKey: ["warning-availability-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: Boolean(objectId),
    staleTime: 300_000,
  });

  useEffect(() => setOrderedRows(rows), [rows]);

  const userNames = new Map((usersQuery.data || []).map(user => [user.id, user.full_name || user.email]));
  const enrichedRows = orderedRows.map(row => ({
    ...row,
    specific_availability_overrides: (overrideQuery.data || []).filter(item => item.warning_address_id === row.id).map(item => ({ ...item, created_by_name: userNames.get(item.created_by_id) })),
  }));
  const availabilityRecord = enrichedRows.find(row => row.id === availabilityId) || null;
  const handleDragEnd = result => {
    if (!result.destination || result.source.index === result.destination.index || reorderDisabled) return;
    const next = [...orderedRows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrderedRows(next);
    onReorder(next).catch(() => setOrderedRows(rows));
  };
  const handleRowClick = row => setAvailabilityId(row.id);

  if (!orderedRows.length) return null;
  const shared = { rows: enrichedRows, onEdit, onDelete, editingId, deletingId, onDragEnd: handleDragEnd, reorderDisabled, actionsDisabled, onRowClick: handleRowClick };
  return <>
    <ObjectWarningAddressesDesktop {...shared} />
    <ObjectWarningAddressesMobile {...shared} />
    <WarningAvailabilityTimelineDialog record={availabilityRecord} open={Boolean(availabilityRecord)} onOpenChange={open => { if (!open) setAvailabilityId(null); }} onOverridesChanged={() => overrideQuery.refetch()} />
  </>;
}
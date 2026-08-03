import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import WarningOverrideDatePicker from "./WarningOverrideDatePicker";
import WarningOverrideList from "./WarningOverrideList";
import { expandDateRange, localDateKey } from "./warningAvailabilityOverrides";

const statuses = [["available", "Bereikbaar"], ["emergency_only", "Alleen noodgevallen"], ["unavailable", "Niet bereikbaar"]];

export default function WarningSpecificAvailabilityDialog({ record, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("range");
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const [dates, setDates] = useState([]);
  const [status, setStatus] = useState("unavailable");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setRange({ from: undefined, to: undefined }); setDates([]); setReason(""); } }, [open, record?.id]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["warning-availability-overrides", record?.object_id] });
  const save = useMutation({ mutationFn: selectedDates => base44.entities.WarningAddressAvailabilityOverride.create({ warning_address_id: record.id, customer_id: record.customer_id, object_id: record.object_id, dates: selectedDates, availability_status: status, reason: reason.trim() || null }), onSuccess: async () => { await refresh(); setRange({ from: undefined, to: undefined }); setDates([]); setReason(""); } });
  const remove = useMutation({ mutationFn: item => base44.entities.WarningAddressAvailabilityOverride.delete(item.id), onSuccess: refresh });
  const selectedDates = mode === "range" ? expandDateRange(range) : dates.map(localDateKey).sort();
  const overrides = record?.specific_availability_overrides || [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Specifieke bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle></DialogHeader>
    <div className="grid gap-5 md:grid-cols-[auto,1fr]">
      <WarningOverrideDatePicker mode={mode} onModeChange={setMode} range={range} onRangeChange={value => setRange(value || { from: undefined, to: undefined })} dates={dates} onDatesChange={setDates} />
      <div className="space-y-4"><div><p className="mb-2 text-sm font-medium">Bereikbaarheid op deze datum(s)</p><div className="grid gap-2">{statuses.map(([value, label]) => <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-md border px-3 py-2 text-left text-sm ${status === value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"}`}>{label}</button>)}</div></div><Input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reden (optioneel), bijvoorbeeld vakantie" maxLength={160} /><Button type="button" className="w-full" disabled={!selectedDates.length || save.isPending} onClick={() => save.mutate(selectedDates)}>{save.isPending ? "Opslaan..." : `${selectedDates.length || "Geen"} datum${selectedDates.length === 1 ? "" : "s"} opslaan`}</Button>{save.error && <p className="text-xs text-destructive">{save.error.message}</p>}</div>
    </div>
    <div className="space-y-2 border-t border-border pt-4"><p className="text-sm font-semibold">Ingestelde uitzonderingen</p><WarningOverrideList overrides={overrides} onDelete={item => remove.mutate(item)} deleting={remove.isPending} /></div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button></DialogFooter>
  </DialogContent></Dialog>;
}
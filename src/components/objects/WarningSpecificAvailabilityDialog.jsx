import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import WarningOverrideDatePicker from "./WarningOverrideDatePicker";
import WarningOverrideList from "./WarningOverrideList";
import WarningOverrideStatusPicker from "./WarningOverrideStatusPicker";
import { expandDateRange, localDateKey } from "./warningAvailabilityOverrides";

export default function WarningSpecificAvailabilityDialog({ record, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState("range");
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const [dates, setDates] = useState([]);
  const [status, setStatus] = useState("available");
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["warning-availability-overrides", record?.object_id] });
  const clearSelection = () => { setRange({ from: undefined, to: undefined }); setDates([]); setReason(""); };
  const save = useMutation({ mutationFn: selectedDates => base44.entities.WarningAddressAvailabilityOverride.create({ warning_address_id: record.id, customer_id: record.customer_id, object_id: record.object_id, dates: selectedDates, availability_status: status, reason: reason.trim() || null }), onSuccess: async () => { await refresh(); clearSelection(); toast({ title: "Specifieke bereikbaarheid opgeslagen" }); } });
  const remove = useMutation({ mutationFn: item => base44.entities.WarningAddressAvailabilityOverride.delete(item.id), onSuccess: async () => { await refresh(); toast({ title: "Uitzondering verwijderd" }); } });
  useEffect(() => { if (open) { clearSelection(); setStatus("available"); save.reset(); } }, [open, record?.id]);
  const selectedDates = mode === "range" ? expandDateRange(range) : dates.map(localDateKey).sort();
  const overrides = record?.specific_availability_overrides || [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
    <DialogHeader className="px-6 pb-2 pt-5"><DialogTitle>Specifieke bereikbaarheid</DialogTitle><p className="text-sm text-muted-foreground">Pas voor {record?.display_name || "dit waarschuwingsadres"} één of meerdere dagen aan. Deze instelling gaat voor het vaste weekrooster.</p></DialogHeader>
    <div className="space-y-6 overflow-y-auto px-6 py-5">
      <WarningOverrideDatePicker mode={mode} onModeChange={value => { setMode(value); clearSelection(); }} range={range} onRangeChange={value => setRange(value || { from: undefined, to: undefined })} dates={dates} onDatesChange={setDates} selectedCount={selectedDates.length} />
      <WarningOverrideStatusPicker value={status} onChange={setStatus} />
      <div className="space-y-2"><label htmlFor="override-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3. Reden <span className="normal-case font-normal">(optioneel)</span></label><Input id="override-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Bijvoorbeeld vakantie, vergadering of ziekte" maxLength={160} /></div>
      {save.error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{save.error.message}</p>}
      <div className="space-y-2 border-t border-border pt-5"><div><p className="text-sm font-semibold">Ingestelde uitzonderingen</p><p className="text-xs text-muted-foreground">Deze datums wijken af van het vaste weekrooster.</p></div><WarningOverrideList overrides={overrides} onDelete={item => remove.mutate(item)} deleting={remove.isPending} /></div>
    </div>
    <DialogFooter className="border-t border-border bg-muted/15 px-6 py-4 sm:justify-between"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button><Button type="button" disabled={!selectedDates.length || save.isPending} onClick={() => save.mutate(selectedDates)}>{save.isPending ? "Opslaan..." : selectedDates.length ? `Bereikbaarheid opslaan voor ${selectedDates.length} datum${selectedDates.length === 1 ? "" : "s"}` : "Selecteer eerst een datum"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
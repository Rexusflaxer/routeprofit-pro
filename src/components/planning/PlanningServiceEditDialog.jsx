import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function personnelName(item) {
  return item?.name || item?.display_name || [item?.call_name || item?.first_name, item?.name_prefix, item?.last_name].filter(Boolean).join(" ") || "Onbekende medewerker";
}

export default function PlanningServiceEditDialog({ request, personnel, open, onOpenChange, onSave, isPending }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [personnelId, setPersonnelId] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    setStartTime(request.startTime || request.shift?.start_time || "");
    setEndTime(request.endTime || request.shift?.end_time || "");
    setPersonnelId(request.assignment?.personnel_id ? String(request.assignment.personnel_id) : "");
  }, [open, request]);

  const valid = Boolean(startTime && endTime && startTime !== endTime);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]"><Pencil className="h-4 w-4 text-primary" /> Dienst bewerken</DialogTitle>
          <DialogDescription className="text-[12px]">Wijzig de tijden en kies wie deze dienst uitvoert.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/35 p-3">
          <p className="text-[12px] font-semibold">{request?.shift?.name || request?.shift?.service_name_snapshot || "Dienst"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{request?.shift?.service_date}</p>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="service-edit-start" className="text-[11px]">Starttijd</Label><Input id="service-edit-start" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="service-edit-end" className="text-[11px]">Eindtijd</Label><Input id="service-edit-end" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="service-edit-personnel" className="text-[11px]">Medewerker</Label>
            <select id="service-edit-personnel" value={personnelId} onChange={event => setPersonnelId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
              <option value="">Open dienst</option>
              {personnel.map(item => <option key={item.id} value={item.id}>{personnelName(item)}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button disabled={!valid || isPending} onClick={() => onSave({ ...request, startTime, endTime, personnelId: personnelId || null })}>{isPending ? "Opslaan…" : "Wijzigingen opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
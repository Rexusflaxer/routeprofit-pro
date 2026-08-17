import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PlanningTaskEditDialog({ occurrence, open, onOpenChange, onSave, isPending }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (!open || !occurrence) return;
    setStartTime(occurrence.window_start_time || "");
    setEndTime(occurrence.window_end_time || "");
  }, [occurrence, open]);

  const valid = Boolean(startTime && endTime && startTime !== endTime);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]"><Pencil className="h-4 w-4 text-primary" /> Taak bewerken</DialogTitle>
          <DialogDescription className="text-[12px]">Wijzig het tijdvenster van deze taak vanaf de geselecteerde datum.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/35 p-3">
          <p className="text-[12px] font-semibold">{occurrence?.task_name_snapshot || "Taak"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{occurrence?.object_name_snapshot || "Object"} · {occurrence?.service_date}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="task-edit-start" className="text-[11px]">Starttijd</Label><Input id="task-edit-start" type="time" step="300" value={startTime} onChange={event => setStartTime(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="task-edit-end" className="text-[11px]">Eindtijd</Label><Input id="task-edit-end" type="time" step="300" value={endTime} onChange={event => setEndTime(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button disabled={!valid || isPending} onClick={() => onSave({ occurrence, startTime, endTime })}>{isPending ? "Opslaan…" : "Wijzigingen opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PlanningTaskDeleteDialog({ request, open, onOpenChange, onConfirm, isPending }) {
  const serviceCount = request?.linkedShifts?.length || 0;
  const employeeCount = request?.employeeCount || 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]"><AlertTriangle className="h-4 w-4 text-destructive" />Taak en diensten verwijderen</DialogTitle>
          <DialogDescription className="text-[12px]">Deze taak heeft al {serviceCount} ingeplande {serviceCount === 1 ? "dienst" : "diensten"}. Bevestigen verwijdert ook deze diensten{employeeCount ? ` en plant ${employeeCount} ${employeeCount === 1 ? "medewerker" : "medewerkers"} uit` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/35 p-3">
          <p className="text-[12px] font-semibold">{request?.occurrence?.task_name_snapshot || "Taak"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{request?.occurrence?.service_date} · {request?.occurrence?.window_start_time}–{request?.occurrence?.window_end_time}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Behouden</Button>
          <Button variant="destructive" disabled={isPending} onClick={() => onConfirm(request)}><Trash2 className="h-4 w-4" />{isPending ? "Verwijderen…" : "Taak en diensten verwijderen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
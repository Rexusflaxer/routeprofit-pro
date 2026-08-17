import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function PlanningTaskShiftRemovalDialog({ request, onCancel, onConfirm, isPending }) {
  const shifts = request?.shifts || [];
  return (
    <AlertDialog open={Boolean(request)} onOpenChange={open => { if (!open && !isPending) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Dienst verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            {shifts.length === 1 ? "Deze dienst valt" : `${shifts.length} diensten vallen`} volledig buiten de nieuwe taaktijd en {shifts.length === 1 ? "wordt" : "worden"} bij bevestiging verwijderd.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1 rounded-md border bg-muted/35 p-3 text-xs">
          {shifts.map(shift => <p key={shift.id}>{shift.service_date} · {shift.start_time}–{shift.end_time} · {shift.name}</p>)}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>Behouden</AlertDialogCancel>
          <AlertDialogAction asChild><Button variant="destructive" disabled={isPending} onClick={onConfirm}>{isPending ? "Verwijderen…" : "Verwijderen en taak wijzigen"}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
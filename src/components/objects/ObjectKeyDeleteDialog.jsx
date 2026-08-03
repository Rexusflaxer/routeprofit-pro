import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ObjectKeyDeleteDialog({ target, open, onOpenChange, onConfirm, deleting }) {
  if (!target) return null;
  const label = target.key.serial_number || target.key.brand;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sleutel verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>Weet u zeker dat u {label} uit sleutelset {target.set.key_number} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? "Verwijderen..." : "Verwijderen"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
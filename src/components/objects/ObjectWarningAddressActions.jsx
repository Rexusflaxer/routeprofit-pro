import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ObjectWarningAddressActions({ row, onEdit, onDelete, deleting, disabled }) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={event => event.stopPropagation()}>
      <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`${row.display_name} bewerken`} onClick={() => onEdit(row)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" disabled={disabled || deleting} aria-label={`${row.display_name} verwijderen`} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Waarschuwingsadres verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Weet je zeker dat je {row.display_name || "dit waarschuwingsadres"} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(row)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
import React from "react";
import { Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { taskTypeLabel } from "./objectTaskConfig";
export default function ObjectTaskDeleteDialog({ task, pending, onClose, onConfirm }) {
  return <AlertDialog open={Boolean(task)} onOpenChange={open => !open && !pending && onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Taak verwijderen?</AlertDialogTitle><AlertDialogDescription>{taskTypeLabel(task)} wordt definitief van dit object verwijderd.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); onConfirm(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending && <Loader2 className="animate-spin" />} Verwijderen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
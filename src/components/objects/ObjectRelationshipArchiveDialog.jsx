import React from "react";
import { Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ObjectRelationshipArchiveDialog({ relationship, open, pending, onOpenChange, onConfirm }) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Relatie archiveren?</AlertDialogTitle><AlertDialogDescription>De koppeling met {relationship?.organization?.name || "deze instantie"} verdwijnt van dit object. De instantie blijft beschikbaar voor andere objecten.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); onConfirm(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending && <Loader2 className="animate-spin" />} Archiveren</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
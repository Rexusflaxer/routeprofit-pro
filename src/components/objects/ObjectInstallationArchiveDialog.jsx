import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ObjectInstallationArchiveDialog({ installation, open, onOpenChange, onConfirm, pending }) {
  if (!installation) return null;
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Installatie archiveren?</AlertDialogTitle><AlertDialogDescription>{installation.name} verdwijnt uit de actieve objectkaart. Metadata, beveiligde codes en het objectlogboek blijven voor controle bewaard.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending ? "Archiveren..." : "Archiveren"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

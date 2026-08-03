import React from "react";
import { Clock3, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { keyTypeLabel } from "./objectKeyConfig";

export default function ObjectKeyHistoryDialog({ keyRecord, open, onOpenChange }) {
  if (!keyRecord) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Uitgiftehistorie</DialogTitle>
          <DialogDescription>{keyRecord.serial_number || "Geen serienummer"} · {keyTypeLabel(keyRecord.key_type)} · {keyRecord.brand}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader><TableRow><TableHead>Gepakt op</TableHead><TableHead>Door</TableHead></TableRow></TableHeader>
            <TableBody><TableRow className="hover:bg-transparent"><TableCell colSpan={2} className="h-32 text-center"><Clock3 className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">Nog geen uitgiftes geregistreerd</p><p className="mt-1 text-xs text-muted-foreground">De historie wordt hier zichtbaar zodra dit vanuit de mobiele surveillance-app wordt vastgelegd.</p></TableCell></TableRow></TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
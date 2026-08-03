import React from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { objectKeyStatus } from "./objectKeyConfig";

export default function ObjectKeyTable({ keys, onEdit, onDelete, disabled }) {
  if (!keys.length) return <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center"><div className="mb-3 rounded-lg border border-border bg-muted/30 p-3"><KeyRound className="h-4 w-4 text-muted-foreground" /></div><p className="text-sm font-medium">Nog geen sleutels</p><p className="mt-1 text-xs text-muted-foreground">Voeg de eerste fysieke sleutel van dit object toe.</p></div>;
  return (
    <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead>Sleutelnummer</TableHead><TableHead>Omschrijving</TableHead><TableHead>Status</TableHead><TableHead className="w-24 text-right">Acties</TableHead></TableRow></TableHeader><TableBody>{keys.map(key => { const status = objectKeyStatus(key.status); return <TableRow key={key.id}><TableCell className="font-medium">{key.key_number}</TableCell><TableCell>{key.description}</TableCell><TableCell><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.tone}`}>{status.label}</span></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Wijzigen" disabled={disabled} onClick={() => onEdit(key)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Verwijderen" disabled={disabled} onClick={() => onDelete(key)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell></TableRow>; })}</TableBody></Table></div>
  );
}
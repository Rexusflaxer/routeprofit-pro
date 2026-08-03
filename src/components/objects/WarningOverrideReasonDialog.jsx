import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const formatDate = date => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);

export default function WarningOverrideReasonDialog({ selection, onClose, onSave, onRemove, pending }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(selection?.override?.reason || ""), [selection]);
  return <Dialog open={Boolean(selection)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Aangepaste bereikbaarheid</DialogTitle><p className="text-sm text-muted-foreground">{selection?.date ? formatDate(selection.date) : ""}</p></DialogHeader>
      <div className="space-y-2"><label htmlFor="override-note" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reden</label><Input id="override-note" value={reason} onChange={event => setReason(event.target.value)} placeholder="Bijvoorbeeld vakantie, overleg of ziekte" maxLength={160} /></div>
      <p className="text-xs text-muted-foreground">Deze tijden wijken af van het standaard weekrooster.</p>
      <DialogFooter className="gap-2 sm:justify-between"><Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={pending} onClick={onRemove}><RotateCcw className="h-4 w-4" /> Standaardtijden herstellen</Button><Button type="button" disabled={pending} onClick={() => onSave(reason.trim())}>{pending ? "Opslaan..." : "Reden opslaan"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
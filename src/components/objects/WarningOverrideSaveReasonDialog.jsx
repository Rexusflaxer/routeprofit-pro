import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function WarningOverrideSaveReasonDialog({ open, changedCount, pending, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return <Dialog open={open} onOpenChange={next => { if (!next && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Reden van de aanpassing</DialogTitle><p className="text-sm text-muted-foreground">U past de bereikbaarheid aan voor {changedCount} dag{changedCount === 1 ? "" : "en"}.</p></DialogHeader>
      <div className="space-y-2"><label htmlFor="save-override-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reden <span className="normal-case font-normal">(optioneel)</span></label><Input id="save-override-reason" autoFocus value={reason} onChange={event => setReason(event.target.value)} placeholder="Bijvoorbeeld vakantie, overleg of ziekte" maxLength={160} /></div>
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Annuleren</Button><Button type="button" disabled={pending} onClick={() => onConfirm(reason.trim())}>{pending ? "Opslaan..." : "Aanpassing opslaan"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
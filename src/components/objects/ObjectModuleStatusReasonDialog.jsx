import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_REASON_LENGTH = 500;

function dialogCopy(module, targetStatus) {
  if (targetStatus === "archived") return {
    title: "Objectmodule archiveren?",
    description: `${module?.name || module?.display_name || "Deze module"} verdwijnt uit de actieve modulebibliotheek. Gepubliceerde versies, beveiligingsplankoppelingen en operationele historie blijven behouden.`,
    label: "Reden voor archiveren",
    placeholder: "Bijvoorbeeld vervangen door een andere werkwijze",
    confirm: "Archiveren",
  };
  if (module?.status === "archived") return {
    title: "Module herstellen als gepauzeerd?",
    description: "De module wordt uit het archief hersteld, maar blijft buiten gebruik totdat zij bewust wordt hervat.",
    label: "Reden voor herstel als gepauzeerd",
    placeholder: "Bijvoorbeeld inrichting eerst opnieuw controleren",
    confirm: "Herstellen",
  };
  return {
    title: "Objectmodule pauzeren?",
    description: "De module blijft raadpleegbaar, maar kan niet worden gebruikt voor nieuwe registraties totdat zij wordt hervat.",
    label: "Reden voor pauzeren",
    placeholder: "Bijvoorbeeld tijdelijke proceswijziging of onderhoud",
    confirm: "Pauzeren",
  };
}

export default function ObjectModuleStatusReasonDialog({
  open,
  module,
  targetStatus,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const copy = dialogCopy(module, targetStatus);
  const normalizedReason = reason.trim();

  useEffect(() => {
    if (open) setReason("");
  }, [open, module?.id, targetStatus]);

  return <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="object-module-status-reason">{copy.label}</Label>
        <Textarea
          id="object-module-status-reason"
          autoFocus
          required
          rows={4}
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder={copy.placeholder}
          aria-describedby="object-module-status-reason-help"
        />
        <div id="object-module-status-reason-help" className="flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
          <span>Leg kort vast waarom deze statuswijziging nodig is. Vermeld geen codes of andere geheime gegevens.</span>
          <span className="shrink-0 tabular-nums">{reason.length}/{MAX_REASON_LENGTH}</span>
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error.message || "De status kon niet worden gewijzigd."}</div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Annuleren</Button>
        <Button
          type="button"
          variant={targetStatus === "archived" ? "destructive" : "default"}
          disabled={pending || !normalizedReason}
          onClick={() => onConfirm(normalizedReason)}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? `${copy.confirm}...` : copy.confirm}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

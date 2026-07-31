import React, { useEffect, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Copy,
  MoveRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ShiftActionDialog({
  action,
  shift,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}) {
  const [serviceDate, setServiceDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (!shift || !open) return;
    const current = new Date(`${shift.service_date}T12:00:00`);
    if (action === "copy") current.setDate(current.getDate() + 1);
    setServiceDate([
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, "0"),
      String(current.getDate()).padStart(2, "0"),
    ].join("-"));
    setStartTime(shift.start_time || "");
    setEndTime(shift.end_time || "");
  }, [action, shift, open]);

  const isCopy = action === "copy";
  const valid = Boolean(serviceDate && startTime && endTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            {isCopy ? <Copy className="h-4 w-4 text-primary" /> : <MoveRight className="h-4 w-4 text-primary" />}
            Dienst {isCopy ? "kopiëren" : "verplaatsen"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {isCopy
              ? "De dienstinhoud en bezettingsplaatsen worden overgenomen. Medewerkers worden bewust niet meegekopieerd."
              : "De gekoppelde medewerkers blijven staan. Alle waarschuwingen worden na verplaatsen opnieuw berekend."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/35 p-3">
          <p className="text-[12px] font-semibold">{shift?.name || "Dienst"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {shift?.object_name || shift?.group_label || "Mobiele surveillance"} · {shift?.service_date}
          </p>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="planning-service-date" className="text-[11px]">Nieuwe datum</Label>
            <Input
              id="planning-service-date"
              type="date"
              value={serviceDate}
              onChange={event => setServiceDate(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="planning-start-time" className="text-[11px]">Starttijd</Label>
              <Input
                id="planning-start-time"
                type="time"
                value={startTime}
                onChange={event => setStartTime(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="planning-end-time" className="text-[11px]">Eindtijd</Label>
              <Input
                id="planning-end-time"
                type="time"
                value={endTime}
                onChange={event => setEndTime(event.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button
            disabled={!valid || isPending}
            onClick={() => onConfirm({
              shift,
              service_date: serviceDate,
              start_time: startTime,
              end_time: endTime,
            })}
          >
            {isPending ? "Bezig…" : isCopy ? "Dienst kopiëren" : "Dienst verplaatsen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublishPlanningDialog({
  open,
  onOpenChange,
  rangeLabel,
  draftShiftCount,
  draftAssignmentCount,
  warningCount,
  criticalCount,
  vacantCount,
  onConfirm,
  isPending,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const reasonRequired = criticalCount > 0;
  const canPublish = !reasonRequired || reason.trim().length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <CalendarCheck2 className="h-4 w-4 text-primary" />
            Planning publiceren
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Controleer de conceptwijzigingen voor {rangeLabel}. Publiceren maakt een onveranderlijke revisie.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Diensten", draftShiftCount, "concept"],
            ["Toewijzingen", draftAssignmentCount, "gewijzigd"],
            ["Open plaatsen", vacantCount, "onbezet"],
            ["Waarschuwingen", warningCount, criticalCount > 0 ? `${criticalCount} kritiek` : "controle"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-md border border-border bg-muted/25 p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-[9px] text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>

        {criticalCount > 0 ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-900 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-200">
            <div className="flex items-start gap-2">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold">{criticalCount} kritieke waarschuwingen blijven bestaan</p>
                <p className="mt-0.5 text-[10px] leading-relaxed opacity-85">
                  Publiceren blijft toegestaan, maar de reden wordt samen met de revisie en planner vastgelegd.
                </p>
              </div>
            </div>
          </div>
        ) : warningCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[10px] leading-relaxed">Er blijven waarschuwingen zichtbaar, maar geen kritieke uitzonderingen.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-[10px] font-medium">Geen waarschuwingen in deze publicatie.</p>
          </div>
        )}

        {reasonRequired && (
          <div className="grid gap-1.5">
            <Label htmlFor="planning-publication-reason" className="text-[11px]">
              Reden voor publiceren met kritieke waarschuwingen
            </Label>
            <Textarea
              id="planning-publication-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Leg kort uit waarom deze planning toch wordt gepubliceerd…"
              className="min-h-20 text-[12px]"
            />
            <p className="text-[9px] text-muted-foreground">Minimaal 8 tekens; deze tekst wordt onderdeel van de audit.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button
            disabled={!canPublish || isPending}
            onClick={() => onConfirm({
              acknowledge_critical_warnings: reasonRequired,
              critical_warning_acknowledgement_reason: reason.trim() || null,
            })}
          >
            {isPending ? "Publiceren…" : "Planning publiceren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

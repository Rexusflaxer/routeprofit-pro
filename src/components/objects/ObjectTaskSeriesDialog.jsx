import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Infinity, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OBJECT_TASK_RECURRENCE_OPTIONS, objectTaskRecurrence } from "./objectTaskRecurrence";
import {
  formatObjectTaskCompactDate,
  formatObjectTaskFullDate,
  getAmsterdamNow,
  isObjectTaskMomentEditable,
  objectTaskClockToMinutes,
  objectTaskEntrySummary,
  objectTaskMinutesToClock,
} from "./objectTaskScheduleDomain";

function initialForm(entry, fixedDuration) {
  const start = entry?.start_time || "08:00";
  const recurrence = objectTaskRecurrence(entry);
  const startMinute = objectTaskClockToMinutes(start) || 0;
  const fixedEnd = fixedDuration
    ? (startMinute + Number(fixedDuration) >= 1440
      ? objectTaskMinutesToClock((startMinute + Number(fixedDuration)) % 1440)
      : objectTaskMinutesToClock(startMinute + Number(fixedDuration)))
    : null;
  return {
    start_time: start,
    end_time: fixedEnd || entry?.end_time || "17:00",
    end_day_offset: Number(entry?.end_day_offset || (fixedDuration && startMinute + Number(fixedDuration) >= 1440 ? 1 : 0)),
    recurrence_key: recurrence.key,
    repeat_until: entry?.repeat_until || "",
    has_end_date: Boolean(entry?.repeat_until),
  };
}

export default function ObjectTaskSeriesDialog({
  entry,
  open,
  fixedDuration = null,
  pending = false,
  error = null,
  serverClock = null,
  onOpenChange,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => initialForm(entry, fixedDuration));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const serverSource = useMemo(() => ({
    server: serverClock?.iso && Number.isFinite(Date.parse(serverClock.iso)) ? Date.parse(serverClock.iso) : Date.now(),
    client: Date.now(),
  }), [serverClock?.iso]);
  const [clockTick, setClockTick] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    setClockTick(Date.now());
    const interval = globalThis.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => globalThis.clearInterval(interval);
  }, [open]);
  const now = getAmsterdamNow(new Date(serverSource.server + (clockTick - serverSource.client)));
  useEffect(() => {
    if (open) {
      setForm(initialForm(entry, fixedDuration));
      setConfirmDelete(false);
    }
  }, [entry, fixedDuration, open]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const recurrence = OBJECT_TASK_RECURRENCE_OPTIONS.find(option => option.key === form.recurrence_key) || OBJECT_TASK_RECURRENCE_OPTIONS[0];
  const startMinute = objectTaskClockToMinutes(form.start_time);
  const fixedEnd = useMemo(() => {
    if (!fixedDuration || startMinute == null) return null;
    const total = startMinute + Number(fixedDuration);
    return {
      end_time: objectTaskMinutesToClock(total % 1440 || (total === 1440 ? 0 : total)),
      end_day_offset: total >= 1440 ? 1 : 0,
    };
  }, [fixedDuration, startMinute]);
  const resolvedEnd = fixedEnd?.end_time || form.end_time;
  const resolvedOffset = fixedEnd?.end_day_offset ?? form.end_day_offset;
  const resolvedEndMinute = objectTaskClockToMinutes(resolvedEnd);
  const intervalValid = startMinute != null && resolvedEndMinute != null
    && (resolvedOffset > 0 ? resolvedEndMinute + 1440 > startMinute : resolvedEndMinute > startMinute);
  const recurrenceValid = recurrence.type === "one_time" || !form.has_end_date
    || Boolean(form.repeat_until && form.repeat_until >= entry?.occurrence_date);
  const futureValid = Boolean(entry?.occurrence_date) && startMinute != null
    && isObjectTaskMomentEditable(entry.occurrence_date, startMinute, now);
  const valid = intervalValid && recurrenceValid && futureValid;
  const preview = objectTaskEntrySummary({
    ...entry,
    ...form,
    end_time: resolvedEnd,
    end_day_offset: resolvedOffset,
    frequency: recurrence.type === "one_time" ? "once" : recurrence.type,
    recurrence_type: recurrence.type,
    recurrence_interval: recurrence.interval,
    repeat_until: recurrence.type !== "one_time" && form.has_end_date ? form.repeat_until : null,
  });

  const submit = event => {
    event.preventDefault();
    if (!valid || pending) return;
    onSave({
      start_time: form.start_time,
      end_time: resolvedEnd,
      end_day_offset: resolvedOffset,
      frequency: recurrence.type === "one_time" ? "once" : recurrence.type,
      recurrence_type: recurrence.type,
      recurrence_interval: recurrence.interval,
      repeat_until: recurrence.type !== "one_time" && form.has_end_date ? form.repeat_until : null,
    });
  };
  const recurring = objectTaskRecurrence(entry).repeating;

  return (
    <>
      <Dialog open={Boolean(open && entry)} onOpenChange={next => !pending && onOpenChange(next)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{entry?.draft ? "Taakmoment instellen" : "Taakmoment wijzigen"}</DialogTitle>
            <DialogDescription>
              {entry?.draft
                ? `${formatObjectTaskFullDate(entry?.occurrence_date)}. Stel de exacte tijd en eventuele herhaling in.`
                : `De wijziging geldt vanaf ${formatObjectTaskFullDate(entry?.occurrence_date)}. Eerdere weken blijven ongewijzigd.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-border/70 bg-card/35 p-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="object-task-series-start">Van</Label><Input id="object-task-series-start" type="time" step="300" value={form.start_time} onChange={event => set("start_time", event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="object-task-series-end">Tot</Label><Input id="object-task-series-end" type="time" step="300" value={resolvedEnd} disabled={Boolean(fixedDuration)} onChange={event => set("end_time", event.target.value)} /></div>
              {!fixedDuration && <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2"><Switch checked={form.end_day_offset > 0} onCheckedChange={checked => set("end_day_offset", checked ? 1 : 0)} /><span>Eindigt op de volgende dag</span></label>}
              {fixedDuration && <p className="text-xs text-muted-foreground sm:col-span-2">De eindtijd volgt uit de planduur van {fixedDuration} minuten.</p>}
            </div>

            <div className="space-y-2">
              <Label>Herhaling</Label>
              <Select value={form.recurrence_key} disabled={pending} onValueChange={value => set("recurrence_key", value)}>
                <SelectTrigger className="border-border/70 bg-card/55 shadow-sm backdrop-blur-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECT_TASK_RECURRENCE_OPTIONS.map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {recurrence.type !== "one_time" && (
              <div className="rounded-xl border border-border/70 bg-card/35 p-4">
                <label className="flex items-center justify-between gap-3">
                  <span><span className="flex items-center gap-1.5 text-sm font-semibold"><Infinity className="h-4 w-4 text-primary" /> Zonder einddatum</span><span className="mt-0.5 block text-xs text-muted-foreground">Zet uit om een laatste uitvoeringsdatum te kiezen.</span></span>
                  <Switch checked={!form.has_end_date} onCheckedChange={checked => set("has_end_date", !checked)} />
                </label>
                {form.has_end_date && <div className="mt-4 max-w-xs space-y-1.5"><Label htmlFor="object-task-series-until">Herhalen tot en met</Label><Input id="object-task-series-until" type="date" min={entry?.occurrence_date} value={form.repeat_until} onChange={event => set("repeat_until", event.target.value)} /></div>}
              </div>
            )}

            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Samenvatting</p><p className="mt-1 text-sm font-medium">{preview}</p></div>
            {entry?.source_change && <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Dit taakmoment is al gekoppeld aan een ingeplande dienst. Planning blijft de dienst markeren totdat het verschil is beoordeeld.</span></p>}
            {!futureValid && <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">Dit taakmoment ligt inmiddels in het verleden. Kies een tijd na {now.clock} of een volgende week.</p>}
            {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>}
            <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
              {onDelete ? <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> {recurring && !entry?.draft ? "Vanaf dit moment verwijderen" : "Taakmoment verwijderen"}</Button> : <span />}
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Annuleren</Button><Button type="submit" disabled={!valid || pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pending ? "Opslaan…" : "Toepassen"}</Button></div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={next => !pending && setConfirmDelete(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{recurring && !entry?.draft ? "Reeks vanaf dit moment stoppen?" : "Taakmoment verwijderen?"}</AlertDialogTitle>
            <AlertDialogDescription>{recurring && !entry?.draft ? `Vanaf ${formatObjectTaskCompactDate(entry?.occurrence_date)} wordt dit herhalende taakmoment niet meer aangemaakt. Eerdere weken blijven behouden. Reeds ingeplande diensten worden in Planning gemarkeerd voor controle.` : "Dit nog niet opgeslagen taakmoment wordt uit het rooster verwijderd."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={pending} onClick={event => { event.preventDefault(); setConfirmDelete(false); onDelete(); }}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Verwijderen</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
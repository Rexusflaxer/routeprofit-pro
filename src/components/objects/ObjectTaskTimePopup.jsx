import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OBJECT_TASK_RECURRENCE_OPTIONS, objectTaskRecurrence } from "./objectTaskRecurrence";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const minutes = value => value === "24:00" ? 1440 : /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;

const addMinutes = (value, duration) => { const total = minutes(value) + Number(duration); if (!Number.isFinite(total) || total > 1440) return ""; return total === 1440 ? "24:00" : `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };

export default function ObjectTaskTimePopup({
  editor,
  fixedDuration = null,
  pending = false,
  error = null,
  onClose,
  onSave,
  onDelete = null,
}) {
  const ref = useRef(null);
  const [start, setStart] = useState(editor.start_time);
  const [end, setEnd] = useState(editor.end_time);
  const [recurrenceKey, setRecurrenceKey] = useState(() => objectTaskRecurrence(editor).key);
  const [repeatUntil, setRepeatUntil] = useState(editor.repeat_until || "");
  const recurrence = OBJECT_TASK_RECURRENCE_OPTIONS.find(option => option.key === recurrenceKey) || OBJECT_TASK_RECURRENCE_OPTIONS[0];

  useEffect(() => {
    const close = event => {
      if (event.target.closest?.('[role="listbox"]')) return;
      if (!pending && ref.current && !ref.current.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose, pending]);

  const resolvedEnd = fixedDuration ? addMinutes(start, fixedDuration) : end;
  const validTime = Number.isFinite(minutes(start))
    && Number.isFinite(minutes(resolvedEnd))
    && minutes(start) < minutes(resolvedEnd);
  const validRepeatUntil = recurrence.type === "one_time"
    || !repeatUntil
    || repeatUntil >= editor.occurrence_date;
  const valid = validTime && validRepeatUntil;
  const viewportWidth = Number(globalThis.innerWidth) || 10_000;
  const viewportHeight = Number(globalThis.innerHeight) || 10_000;
  const left = Math.max(12, Math.min(Number(editor.x || 12), viewportWidth - 316));
  const top = Math.max(12, Math.min(Number(editor.y || 12), viewportHeight - 410));

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Taaktijd instellen voor ${editor.dayLabel}`}
      className="fixed z-[110] w-[292px] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
      style={{ left, top }}
    >
      <p className="text-xs font-semibold">Exacte tijd · {editor.dayLabel}</p>
      {editor.dateLabel && <p className="mt-0.5 text-[10px] text-muted-foreground">{editor.dateLabel}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="exact-task-start" className="text-[11px]">Van</Label>
          <Input id="exact-task-start" value={start} onChange={event => setStart(event.target.value)} placeholder="08:15" inputMode="numeric" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exact-task-end" className="text-[11px]">Tot</Label>
          <Input id="exact-task-end" value={resolvedEnd} onChange={event => setEnd(event.target.value)} placeholder="17:45" inputMode="numeric" disabled={Boolean(fixedDuration) || pending} />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {fixedDuration ? `De eindtijd volgt automatisch uit de planduur van ${fixedDuration} minuten.` : "Gebruik HH:MM, bijvoorbeeld 08:15–17:45."}
      </p>

      <div className="mt-3 border-t border-border/70 pt-3">
        <Label htmlFor="exact-task-recurrence" className="text-[11px]">Herhaling</Label>
        <Select value={recurrenceKey} disabled={pending} onValueChange={value => { setRecurrenceKey(value); if (value === "once") setRepeatUntil(""); }}>
          <SelectTrigger id="exact-task-recurrence" className="mt-1.5 h-8 rounded-lg border-border/70 bg-card/55 px-2.5 text-xs shadow-sm backdrop-blur-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[130]">
            {OBJECT_TASK_RECURRENCE_OPTIONS.map(option => <SelectItem key={option.key} value={option.key} className="text-xs">{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {recurrence.type !== "one_time" && (
          <div className="mt-2 space-y-1">
            <Label htmlFor="exact-task-repeat-until" className="text-[11px]">Einddatum <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
            <Input id="exact-task-repeat-until" type="date" min={editor.occurrence_date} value={repeatUntil} disabled={pending} onChange={event => setRepeatUntil(event.target.value)} />
            <p className="text-[10px] text-muted-foreground">Zonder einddatum loopt dit herhalingspatroon door.</p>
          </div>
        )}
      </div>

      {error && <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">{error.message || "Opslaan is mislukt."}</p>}

      <div className="mt-3 flex items-center gap-2">
        {onDelete && (
          <Button type="button" size="sm" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={pending} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Stoppen
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClose}>Annuleren</Button>
        <Button
          type="button"
          size="sm"
          disabled={!valid || pending}
          onClick={() => onSave({
            start_time: start,
            end_time: resolvedEnd,
            frequency: recurrence.type === "one_time" ? "once" : recurrence.type,
            recurrence_type: recurrence.type,
            recurrence_interval: recurrence.interval,
            repeat_until: recurrence.type !== "one_time" ? repeatUntil || null : null,
          })}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Opslaan..." : "Toepassen"}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
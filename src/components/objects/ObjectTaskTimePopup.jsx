import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const minutes = value => value === "24:00" ? 1440 : /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;

const addMinutes = (value, duration) => { const total = minutes(value) + Number(duration); if (!Number.isFinite(total) || total > 1440) return ""; return total === 1440 ? "24:00" : `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };

export default function ObjectTaskTimePopup({ editor, fixedDuration = null, onClose, onSave }) {
  const ref = useRef(null), [start, setStart] = useState(editor.start_time), [end, setEnd] = useState(editor.end_time);
  useEffect(() => { const close = event => { if (ref.current && !ref.current.contains(event.target)) onClose(); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [onClose]);
  const resolvedEnd = fixedDuration ? addMinutes(start, fixedDuration) : end;
  const valid = Number.isFinite(minutes(start)) && Number.isFinite(minutes(resolvedEnd)) && minutes(start) < minutes(resolvedEnd);
  return createPortal(<div ref={ref} className="fixed z-[110] w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl" style={{ left: editor.x, top: editor.y }}><p className="text-xs font-semibold">Exacte tijd · {editor.dayLabel}</p><div className="mt-3 grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="exact-task-start" className="text-[11px]">Van</Label><Input id="exact-task-start" value={start} onChange={event => setStart(event.target.value)} placeholder="08:15" inputMode="numeric" /></div><div className="space-y-1"><Label htmlFor="exact-task-end" className="text-[11px]">Tot</Label><Input id="exact-task-end" value={resolvedEnd} onChange={event => setEnd(event.target.value)} placeholder="17:45" inputMode="numeric" disabled={Boolean(fixedDuration)} /></div></div><p className="mt-2 text-[10px] text-muted-foreground">{fixedDuration ? `De eindtijd volgt automatisch uit de planduur van ${fixedDuration} minuten.` : "Gebruik HH:MM, bijvoorbeeld 08:15–17:45."}</p><div className="mt-3 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={onClose}>Annuleren</Button><Button type="button" size="sm" disabled={!valid} onClick={() => onSave(start, resolvedEnd)}>Toepassen</Button></div></div>, document.body);
}
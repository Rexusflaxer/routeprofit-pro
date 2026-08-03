import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const dateTime = value => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Onbekend";
const dayLabel = date => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(date);

export default function WarningOverrideInfoMenu({ selection, pending, onClose, onRemove }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = event => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  if (!selection) return null;
  const { override, date, x, y } = selection;
  return createPortal(<div ref={ref} className="fixed z-[110] w-72 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl" style={{ left: Math.min(x + 10, window.innerWidth - 300), top: Math.min(y + 10, window.innerHeight - 250) }}>
    <div className="font-semibold">Aangepaste bereikbaarheid</div><div className="mt-0.5 text-xs capitalize text-muted-foreground">{dayLabel(date)}</div>
    {override.reason && <div className="mt-3 rounded-md bg-muted px-2.5 py-2 text-xs"><span className="font-semibold">Reden:</span> {override.reason}</div>}
    <dl className="mt-3 grid grid-cols-[70px_1fr] gap-y-1 text-xs"><dt className="text-muted-foreground">Ingevoerd</dt><dd>{dateTime(override.created_date)}</dd><dt className="text-muted-foreground">Door</dt><dd>{override.created_by_name || "Onbekende gebruiker"}</dd></dl>
    <Button type="button" variant="outline" size="sm" className="mt-3 w-full text-destructive hover:text-destructive" disabled={pending} onClick={onRemove}><RotateCcw className="h-4 w-4" /> {pending ? "Herstellen..." : "Standaardtijden herstellen"}</Button>
  </div>, document.body);
}
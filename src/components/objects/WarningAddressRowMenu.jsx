import React, { useEffect, useRef } from "react";
import { CalendarClock, CalendarDays } from "lucide-react";

export default function WarningAddressRowMenu({ menu, onClose, onWeekSchedule, onSpecificAvailability, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = event => { if (!ref.current?.contains(event.target)) onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", onClose, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("scroll", onClose, true); };
  }, [menu, onClose]);
  if (!menu) return null;
  return <div ref={ref} className="fixed z-50 w-64 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 116) }}>
    <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bereikbaarheid</p>
    <button type="button" onClick={onWeekSchedule} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"><CalendarDays className="h-4 w-4 text-muted-foreground" />Weekrooster bekijken</button>
    <button type="button" disabled={disabled} onClick={onSpecificAvailability} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"><CalendarClock className="h-4 w-4 text-muted-foreground" />Specifieke bereikbaarheid</button>
  </div>;
}
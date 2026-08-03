import React from "react";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

const HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
const style = interval => ({ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` });
const formatDate = date => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" }).format(date);
const isToday = date => date.toDateString() === new Date().toDateString();

export default function WarningTimelineRow({ date, dayIndex, now, available, emergency, override, editing, painting, onPaint, onHover, onHoverEnd, onOpenOverride }) {
  const nowPosition = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  return <div className="flex snap-start snap-always">
    <span className={`relative flex h-12 w-14 shrink-0 flex-col justify-center pr-2 leading-tight ${isToday(date) ? "text-primary" : ""}`}><strong className="text-xs">{WEEKDAY_OPTIONS[dayIndex].shortLabel}</strong><span className={isToday(date) ? "text-[10px] font-semibold text-primary" : "text-[10px] text-muted-foreground"}>{formatDate(date)}</span>{override && <span className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}</span>
    <div className="relative h-12 flex-1 border-b border-r border-border" onMouseMove={onHover} onMouseLeave={onHoverEnd}>
      {HOURS.map((hour, index) => <div key={hour} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${(index / 12) * 100}%`, width: `${100 / 12}%` }}><div className="absolute inset-y-0 left-1/2 border-l border-border/30" /></div>)}
      {available.map((interval, index) => <div key={`available-${index}`} className="pointer-events-none absolute inset-y-1 rounded-sm border border-primary/40 bg-primary/25" style={style(interval)} />)}
      {emergency.map((interval, index) => <div key={`emergency-${index}`} className="pointer-events-none absolute inset-y-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={style(interval)} />)}
      {override && <button type="button" disabled={editing} onClick={onOpenOverride} aria-label="Aangepaste tijden beheren" className="absolute inset-0 z-20 border border-dashed border-primary/60 bg-primary/5 disabled:pointer-events-none" />}
      {isToday(date) && <div className="pointer-events-none absolute inset-y-0 z-40 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" style={{ left: `${nowPosition}%` }} aria-label="Huidige tijd" />}
      {editing && <div className="absolute inset-0 z-30 grid grid-cols-[repeat(48,minmax(0,1fr))]">{Array.from({ length: 48 }, (_, slot) => <button key={slot} type="button" aria-label={`${WEEKDAY_OPTIONS[dayIndex].label} tijdvak aanpassen`} className="h-full touch-none bg-transparent" onPointerDown={event => { event.preventDefault(); onPaint(slot, true); }} onPointerEnter={() => { if (painting) onPaint(slot, false); }} />)}</div>}
    </div>
  </div>;
}
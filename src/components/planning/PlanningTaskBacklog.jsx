import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Layers3,
  ListTodo,
  Plus,
  Search,
  Split,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  formatMinutesAsHours,
  getTaskOccurrenceCoverage,
  sortTaskSegments,
} from "@/components/planning/planningDomain";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function dateLabel(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return year && month && day ? dateFormatter.format(new Date(year, month - 1, day, 12)) : value;
}

function coverageLabel(coverage) {
  if (coverage.status === "full") return "Volledig gepland";
  if (coverage.status === "partial") return `${formatMinutesAsHours(coverage.remainingMinutes)} resterend`;
  return "Nog niet gepland";
}

function statusClass(status) {
  if (status === "full") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300";
}

function OccurrenceCard({ occurrence, coverage, selectedShift, onCreate, onAdd }) {
  const percentage = coverage.requiredMinutes > 0
    ? Math.min(100, Math.round((coverage.allocatedMinutes / coverage.requiredMinutes) * 100))
    : 0;
  return (
    <article className="rounded-lg border border-border bg-card p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {coverage.status === "partial" ? <Split className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">{occurrence.task_name_snapshot || "Taak"}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {occurrence.object_name_snapshot || "Onbekend object"} · {occurrence.window_start_time}–{occurrence.window_end_time}
          </p>
        </div>
        <Badge variant="outline" className={cn("h-5 shrink-0 rounded px-1.5 text-[9px]", statusClass(coverage.status))}>
          {coverageLabel(coverage)}
        </Badge>
      </div>
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[9px] text-muted-foreground">
          <span>{formatMinutesAsHours(coverage.allocatedMinutes)} van {formatMinutesAsHours(coverage.requiredMinutes)}</span>
          <span>{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-1.5" />
      </div>
      {coverage.status !== "full" && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {selectedShift?.source_type === "task" && selectedShift.service_date === occurrence.service_date && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onAdd(occurrence)}>
              <Plus className="h-3 w-3" /> Aan deze dienst
            </Button>
          )}
          <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => onCreate(occurrence)}>
            Nieuwe dienst <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </article>
  );
}

export default function PlanningTaskBacklog({
  occurrences,
  segments,
  selectedShift,
  onCreateShift,
  onAddToShift,
  onEditShift,
  onClearShift,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("work");
  const items = useMemo(() => occurrences.map(occurrence => ({
    occurrence,
    coverage: getTaskOccurrenceCoverage(occurrence, segments),
  })).filter(item => {
    if (status === "work" && item.coverage.status === "full") return false;
    if (status === "open" && item.coverage.status !== "open") return false;
    if (status === "partial" && item.coverage.status !== "partial") return false;
    const query = search.trim().toLocaleLowerCase("nl-NL");
    return !query || [
      item.occurrence.task_name_snapshot,
      item.occurrence.object_name_snapshot,
      item.occurrence.customer_name_snapshot,
    ].filter(Boolean).some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
  }), [occurrences, search, segments, status]);
  const groups = useMemo(() => [...new Set(items.map(item => item.occurrence.service_date))]
    .sort()
    .map(date => ({ date, items: items.filter(item => item.occurrence.service_date === date) })), [items]);
  const selectedSegments = selectedShift
    ? sortTaskSegments(segments.filter(segment => String(segment.shift_id) === String(selectedShift.id)))
    : [];

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/20" aria-label="Taakwerkvoorraad">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold"><ListTodo className="h-4 w-4 text-primary" /> Taken om in te plannen</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Maak expliciet een dienst; na opslaan wordt de doeldienst gewist.</p>
          </div>
          <Badge variant="outline" className="rounded text-[9px]">{items.length} zichtbaar</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek taak, object of klant" className="h-8 bg-background pl-8 text-[11px]" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
          {[["work", "Te doen"], ["open", "Open"], ["partial", "Deels"], ["all", "Alles"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setStatus(value)} className={cn("rounded px-1.5 py-1 text-[9px] font-medium", status === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
      </div>

      {selectedShift?.source_type === "task" && (
        <div className="shrink-0 border-b border-border bg-primary/[0.04] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold">{selectedShift.name}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">{selectedSegments.length} taaksegmenten · {selectedShift.start_time}–{selectedShift.end_time}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onClearShift} aria-label="Doeldienst wissen">
                <X className="h-3 w-3" /> Doel wissen
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onEditShift(selectedShift)}>
                <Layers3 className="h-3 w-3" /> Inhoud bewerken
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {groups.length ? groups.map(group => (
          <section key={group.date}>
            <h3 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> {dateLabel(group.date)}
            </h3>
            <div className="space-y-1.5">
              {group.items.map(item => (
                <OccurrenceCard
                  key={item.occurrence.id}
                  {...item}
                  selectedShift={selectedShift}
                  onCreate={onCreateShift}
                  onAdd={onAddToShift}
                />
              ))}
            </div>
          </section>
        )) : (
          <div className="m-2 rounded-lg border border-dashed border-border bg-card p-5 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
            <p className="mt-2 text-[11px] font-semibold">Geen taken in deze selectie</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Alle taken zijn gepland of passen niet bij het gekozen filter.</p>
          </div>
        )}
      </div>
    </section>
  );
}

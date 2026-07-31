import React, { useMemo, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import {
  AlertOctagon,
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  GripVertical,
  Search,
  ShieldCheck,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function personnelName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function CandidateCard({ candidate, index, selectedShift, onAssign }) {
  const name = personnelName(candidate.personnel);
  const critical = Number(candidate.criticalCount || 0);
  const warnings = Number(candidate.warningCount || 0);
  const scheduledHours = Number(candidate.scheduledMinutes || 0) / 60;
  const contractHours = Number(candidate.contractMinutes || 0) / 60;

  return (
    <Draggable draggableId={`personnel:${candidate.personnel.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "group rounded-md border border-border bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all",
            snapshot.isDragging && "z-50 border-primary shadow-xl ring-2 ring-primary/20",
          )}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              aria-label={`${name} slepen`}
              title="Sleep naar een dienst"
              className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...provided.dragHandleProps}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <p className="truncate text-[12px] font-semibold text-foreground">{name}</p>
                {candidate.personnel?.wpbr_status === "active" && (
                  <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Wpbr actief" />
                )}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {candidate.personnel?.cao_function_group
                  || candidate.personnel?.function_type
                  || candidate.personnel?.employee_type
                  || "Functie nog niet vastgelegd"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <BriefcaseBusiness className="h-2.5 w-2.5" />
                  {scheduledHours.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}u
                  {contractHours > 0 && ` / ${contractHours.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}u`}
                </span>
                {critical > 0 ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                    <AlertOctagon className="h-2.5 w-2.5" /> {critical}
                  </span>
                ) : warnings > 0 ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    <AlertTriangle className="h-2.5 w-2.5" /> {warnings}
                  </span>
                ) : selectedShift ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <CheckCircle2 className="h-2.5 w-2.5" /> passend
                  </span>
                ) : null}
              </div>
            </div>
            {selectedShift && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-primary"
                onClick={() => onAssign(candidate)}
                aria-label={`${name} inplannen op ${selectedShift.name}`}
              >
                <UserRoundPlus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {selectedShift && candidate.warnings?.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-border/70 pt-1.5">
              {candidate.warnings.slice(0, 2).map(warning => (
                <p key={warning.code} className="flex items-start gap-1 text-[9px] leading-snug text-muted-foreground">
                  {warning.severity === "critical"
                    ? <AlertOctagon className="mt-0.5 h-2.5 w-2.5 shrink-0 text-rose-600" />
                    : <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-600" />}
                  <span><strong className="font-semibold text-foreground">{warning.title}</strong> · {warning.detail}</span>
                </p>
              ))}
              {candidate.warnings.length > 2 && (
                <p className="pl-3.5 text-[9px] font-medium text-muted-foreground">
                  + {candidate.warnings.length - 2} meer
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function PlanningEmployeePanel({
  selectedShift,
  candidates,
  onAssign,
  onCloseShift,
  personnelCount,
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    if (!query) return candidates;
    return candidates.filter(candidate => {
      const personnel = candidate.personnel || {};
      return [
        personnelName(personnel),
        personnel.cao_function_group,
        personnel.function_type,
        personnel.employee_type,
      ].filter(Boolean).some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
    });
  }, [candidates, search]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-muted/20">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {selectedShift ? <BadgeCheck className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
              <h2 className="truncate text-[13px] font-semibold">
                {selectedShift ? "Medewerker kiezen" : "Medewerkers"}
              </h2>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {selectedShift
                ? `${selectedShift.name} · ${selectedShift.start_time}–${selectedShift.end_time}`
                : `${personnelCount} actieve medewerkers · sleep naar een dienst`}
            </p>
          </div>
          {selectedShift && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCloseShift} aria-label="Dienstselectie sluiten">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Zoek medewerker of functie"
            className="h-8 bg-background pl-8 text-[11px]"
            aria-label="Zoek medewerker"
          />
        </div>

        {selectedShift && (
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" className="h-5 rounded px-1.5 text-[9px] font-medium">
              {selectedShift.object_name || selectedShift.group_label || "Mobiele surveillance"}
            </Badge>
            {selectedShift.function_type && (
              <Badge variant="outline" className="h-5 rounded px-1.5 text-[9px] font-medium">
                {selectedShift.function_type}
              </Badge>
            )}
          </div>
        )}
      </div>

      <Droppable droppableId="personnel-pool" type="PERSONNEL" isDropDisabled>
        {provided => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2"
          >
            {filtered.length > 0 ? filtered.map((candidate, index) => (
              <CandidateCard
                key={candidate.personnel.id}
                candidate={candidate}
                index={index}
                selectedShift={selectedShift}
                onAssign={onAssign}
              />
            )) : (
              <div className="m-2 rounded-md border border-dashed border-border bg-card p-4 text-center">
                <Users className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-[11px] font-semibold">Geen medewerkers gevonden</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Pas de zoekopdracht aan.</p>
              </div>
            )}
            <div className="hidden">{provided.placeholder}</div>
          </div>
        )}
      </Droppable>
    </aside>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Layers3,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
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
import {
  addDays,
  formatMinutesAsHours,
  getOccurrenceRemainingRanges,
  getShiftDurationMinutes,
  getTaskOccurrenceCoverage,
  sortTaskSegments,
  toDateKey,
  validateTaskComposition,
  validateTaskSegmentAllocations,
} from "@/components/planning/planningDomain";
import { cn } from "@/lib/utils";

function timeKey(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function nextDateForTimes(startDate, startTime, endTime) {
  return endTime <= startTime ? toDateKey(addDays(startDate, 1)) : startDate;
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `planning-composition-${Date.now()}-${Math.random()}`;
}

function remainingRangeLabel(range, occurrence) {
  const startDate = toDateKey(range.start);
  const endDate = toDateKey(range.end);
  const start = timeKey(range.start);
  const end = timeKey(range.end);
  if (startDate === occurrence.service_date && endDate === (occurrence.end_date || occurrence.service_date)) {
    return `${start}–${end}`;
  }
  return `${startDate} ${start}–${endDate} ${end}`;
}

function createDraftSegment(occurrence, allSegments) {
  const coverage = getTaskOccurrenceCoverage(occurrence, allSegments);
  const range = getOccurrenceRemainingRanges(occurrence, allSegments)[0];
  if (!range || coverage.remainingMinutes <= 0) return null;
  const rangeMinutes = Math.round((range.end - range.start) / 60000);
  const duration = Math.min(coverage.remainingMinutes, rangeMinutes);
  const end = new Date(range.start.getTime() + duration * 60000);
  return {
    local_id: globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}-${Math.random()}`,
    task_occurrence_id: occurrence.id,
    object_task_definition_id: occurrence.object_task_definition_id,
    task_name_snapshot: occurrence.task_name_snapshot,
    object_name_snapshot: occurrence.object_name_snapshot,
    customer_name_snapshot: occurrence.customer_name_snapshot,
    object_id: occurrence.object_id,
    customer_id: occurrence.customer_id,
    execution_mode: occurrence.execution_mode,
    start_date: toDateKey(range.start),
    end_date: toDateKey(end),
    start_time: timeKey(range.start),
    end_time: timeKey(end),
  };
}

function fromStoredSegment(segment) {
  return {
    ...segment,
    local_id: segment.id || globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}-${Math.random()}`,
  };
}

function SegmentRow({ segment, index, occurrence, errors = [], onChange, onRemove }) {
  const coverage = occurrence ? getTaskOccurrenceCoverage(occurrence, [segment]) : null;
  const errorId = `segment-errors-${segment.local_id}`;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">{segment.task_name_snapshot || occurrence?.task_name_snapshot || "Taak"}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{segment.object_name_snapshot || occurrence?.object_name_snapshot || "Object"}</p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(index)} aria-label="Taaksegment verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`segment-start-${segment.local_id}`} className="text-[10px]">Begin</Label>
          <Input id={`segment-start-${segment.local_id}`} type="time" value={segment.start_time} onChange={event => onChange(index, "start_time", event.target.value)} aria-invalid={errors.length > 0} aria-describedby={errors.length ? errorId : undefined} className="h-8 text-[11px]" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`segment-end-${segment.local_id}`} className="text-[10px]">Einde</Label>
          <Input id={`segment-end-${segment.local_id}`} type="time" value={segment.end_time} onChange={event => onChange(index, "end_time", event.target.value)} aria-invalid={errors.length > 0} aria-describedby={errors.length ? errorId : undefined} className="h-8 text-[11px]" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{segment.execution_mode === "continuous" ? "Aaneengesloten taak · splitsen toegestaan" : "Taak binnen tijdvenster"}</span>
        {coverage && <span className="font-medium text-foreground">{formatMinutesAsHours(coverage.allocatedMinutes)}</span>}
      </div>
      {errors.length > 0 && (
        <div id={errorId} className="mt-2 space-y-1">
          {errors.map(error => <p key={error.code} role="alert" className="text-[10px] font-medium text-rose-700 dark:text-rose-300">{error.message}</p>)}
        </div>
      )}
    </div>
  );
}

export default function PlanningShiftComposer({
  open,
  onOpenChange,
  shift,
  initialOccurrence,
  occurrences,
  segments,
  onSave,
  isPending,
}) {
  const [name, setName] = useState("");
  const [draftSegments, setDraftSegments] = useState([]);
  const [addOccurrenceId, setAddOccurrenceId] = useState("");
  const idempotencyKeyRef = useRef("");

  useEffect(() => {
    if (!open) {
      idempotencyKeyRef.current = "";
      return;
    }
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = createIdempotencyKey();
    const stored = shift
      ? sortTaskSegments(segments.filter(segment => String(segment.shift_id) === String(shift.id))).map(fromStoredSegment)
      : [];
    if (initialOccurrence && !stored.some(item => String(item.task_occurrence_id) === String(initialOccurrence.id))) {
      const availableSegments = shift
        ? segments.filter(segment => String(segment.shift_id) !== String(shift.id))
        : segments;
      const created = createDraftSegment(initialOccurrence, availableSegments);
      if (created) stored.push(created);
    }
    setDraftSegments(stored.map((segment, index) => ({ ...segment, sequence_index: index })));
    setName(shift?.name || shift?.service_name_snapshot || "");
    setAddOccurrenceId("");
  }, [initialOccurrence, open, segments, shift]);

  const occurrenceById = useMemo(() => new Map(occurrences.map(item => [String(item.id), item])), [occurrences]);
  const serviceDate = draftSegments[0]?.start_date || initialOccurrence?.service_date || shift?.service_date || "";
  const externalSegments = shift
    ? segments.filter(segment => String(segment.shift_id) !== String(shift.id))
    : segments;
  const availableOccurrences = occurrences.filter(occurrence => (
    occurrence.lifecycle_status === "active"
    && (!serviceDate || occurrence.service_date === serviceDate)
    && getTaskOccurrenceCoverage(occurrence, [
      ...externalSegments,
      ...draftSegments.filter(segment => String(segment.task_occurrence_id) === String(occurrence.id)),
    ]).status !== "full"
  ));
  const composition = validateTaskComposition(draftSegments);
  const allocationValidation = validateTaskSegmentAllocations({
    segments: draftSegments,
    occurrences,
    externalSegments,
  });
  const coverageErrors = [...new Set(draftSegments.map(item => String(item.task_occurrence_id)))].flatMap(id => {
    const occurrence = occurrenceById.get(id);
    if (!occurrence) return [];
    const coverage = getTaskOccurrenceCoverage(occurrence, [
      ...externalSegments,
      ...draftSegments.filter(segment => String(segment.task_occurrence_id) === id),
    ]);
    return coverage.allocatedMinutes > coverage.requiredMinutes
      ? [{ code: `overallocated_${id}`, message: `${occurrence.task_name_snapshot} krijgt meer tijd dan vereist.` }]
      : [];
  });
  const validationErrors = [...composition.errors, ...allocationValidation.errors, ...coverageErrors];
  const errorsBySegmentId = validationErrors.reduce((map, error) => {
    if (!error.segmentId) return map;
    const current = map.get(String(error.segmentId)) || [];
    current.push(error);
    map.set(String(error.segmentId), current);
    return map;
  }, new Map());
  const sortedForSummary = sortTaskSegments(draftSegments);
  const envelopeMinutes = sortedForSummary.length ? getShiftDurationMinutes({
    service_date: sortedForSummary[0].start_date,
    end_date: sortedForSummary.at(-1).end_date,
    start_time: sortedForSummary[0].start_time,
    end_time: sortedForSummary.at(-1).end_time,
  }) : 0;
  const taskMinutes = draftSegments.reduce((sum, item) => sum + getShiftDurationMinutes({
    service_date: item.start_date,
    end_date: item.end_date,
    start_time: item.start_time,
    end_time: item.end_time,
  }), 0);
  const occurrenceSummaries = [...new Set(draftSegments.map(item => String(item.task_occurrence_id)))].map(id => {
    const occurrence = occurrenceById.get(id);
    if (!occurrence) return null;
    const coverageSegments = [
      ...externalSegments,
      ...draftSegments.filter(segment => String(segment.task_occurrence_id) === id),
    ];
    return {
      occurrence,
      coverage: getTaskOccurrenceCoverage(occurrence, coverageSegments),
      remainingRanges: getOccurrenceRemainingRanges(occurrence, coverageSegments),
    };
  }).filter(Boolean);

  const updateSegment = (index, field, value) => setDraftSegments(current => current.map((segment, itemIndex) => {
    if (index !== itemIndex) return segment;
    const next = { ...segment, [field]: value };
    if (field === "start_time" || field === "end_time") {
      next.end_date = nextDateForTimes(next.start_date, next.start_time, next.end_time);
    }
    return next;
  }));
  const addOccurrence = () => {
    const occurrence = occurrenceById.get(String(addOccurrenceId));
    if (!occurrence) return;
    const created = createDraftSegment(occurrence, [...externalSegments, ...draftSegments]);
    if (created) setDraftSegments(current => [...current, { ...created, sequence_index: current.length }]);
    setAddOccurrenceId("");
  };
  const submit = () => {
    if (!draftSegments.length || validationErrors.length) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = createIdempotencyKey();
    const uniqueOccurrenceIds = [...new Set(draftSegments.map(item => String(item.task_occurrence_id)))];
    onSave({
      action: shift ? "update_shift_composition" : "compose_shift",
      idempotency_key: idempotencyKeyRef.current,
      shift_id: shift?.id || undefined,
      expected_shift_revision: shift ? Number(shift.revision || 1) : undefined,
      service_name: name.trim() || undefined,
      required_count: Number(shift?.required_count || 1),
      expected_occurrence_revisions: Object.fromEntries(uniqueOccurrenceIds.map(id => [id, Number(occurrenceById.get(id)?.revision || 1)])),
      segments: draftSegments.map(segment => ({
        task_occurrence_id: segment.task_occurrence_id,
        start_date: segment.start_date,
        end_date: segment.end_date,
        start_time: segment.start_time,
        end_time: segment.end_time,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-[16px]"><Layers3 className="h-4 w-4 text-primary" /> {shift ? "Dienstinhoud bewerken" : "Nieuwe dienst samenstellen"}</DialogTitle>
          <DialogDescription className="text-[11px]">Combineer taken op volgorde of plan slechts een deel. Opslaan gebeurt pas na jouw expliciete bevestiging.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
            <div className="space-y-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor="composition-name" className="text-[10px]">Naam van de dienst</Label>
                <Input id="composition-name" value={name} onChange={event => setName(event.target.value)} placeholder={draftSegments.length > 1 ? `Samengestelde dienst · ${draftSegments.length} taken` : "Naam wordt automatisch voorgesteld"} className="h-9 text-[12px]" />
              </div>
              <div className="flex items-end gap-2 rounded-lg border border-dashed border-border bg-muted/25 p-2.5">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="composition-add-task" className="text-[10px]">Taak toevoegen op {serviceDate || "gekozen datum"}</Label>
                  <select id="composition-add-task" value={addOccurrenceId} onChange={event => setAddOccurrenceId(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]">
                    <option value="">Kies een open of gedeeltelijke taak…</option>
                    {availableOccurrences.map(occurrence => <option key={occurrence.id} value={occurrence.id}>{occurrence.window_start_time} · {occurrence.task_name_snapshot} · {occurrence.object_name_snapshot}</option>)}
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8" disabled={!addOccurrenceId} onClick={addOccurrence}><Plus className="h-3.5 w-3.5" /> Toevoegen</Button>
              </div>
              {draftSegments.length > 1 && <p className="px-0.5 text-[9px] text-muted-foreground">De taakvolgorde wordt automatisch bepaald door de begintijden.</p>}
              {draftSegments.map((segment, index) => (
                <SegmentRow
                  key={segment.local_id}
                  segment={segment}
                  index={index}
                  occurrence={occurrenceById.get(String(segment.task_occurrence_id))}
                  errors={errorsBySegmentId.get(String(segment.local_id)) || []}
                  onChange={updateSegment}
                  onRemove={removeIndex => setDraftSegments(current => current.filter((_, itemIndex) => itemIndex !== removeIndex).map((item, sequenceIndex) => ({ ...item, sequence_index: sequenceIndex })))}
                />
              ))}
              {!draftSegments.length && <div className="rounded-lg border border-dashed border-border p-6 text-center text-[11px] text-muted-foreground">Voeg minimaal één taak toe om een dienst te vormen.</div>}
            </div>

            <aside className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dienstcontrole</p>
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="flex justify-between"><span>Datum</span><strong>{serviceDate || "—"}</strong></div>
                  <div className="flex justify-between"><span>Taaktijd</span><strong>{formatMinutesAsHours(taskMinutes)}</strong></div>
                  <div className="flex justify-between"><span>Dienstduur</span><strong>{formatMinutesAsHours(envelopeMinutes)}</strong></div>
                  <div className="flex justify-between"><span>Segmenten</span><strong>{draftSegments.length}</strong></div>
                </div>
              </div>
              {occurrenceSummaries.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-3" aria-label="Taakdekking na opslaan">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Taakdekking na opslaan</p>
                  <div className="mt-2 space-y-2.5">
                    {occurrenceSummaries.map(({ occurrence, coverage, remainingRanges }) => (
                      <div key={occurrence.id} className="border-t border-border pt-2 first:border-0 first:pt-0">
                        <p className="truncate text-[10px] font-semibold">{occurrence.task_name_snapshot || "Taak"}</p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">
                          {formatMinutesAsHours(coverage.allocatedMinutes)} van {formatMinutesAsHours(coverage.requiredMinutes)} gepland
                        </p>
                        {coverage.remainingMinutes > 0 ? (
                          <>
                            <p className="mt-1 font-medium text-[10px] text-amber-800 dark:text-amber-300">{formatMinutesAsHours(coverage.remainingMinutes)} resterend</p>
                            {remainingRanges.length > 0 && <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">Nog open: {remainingRanges.map(range => remainingRangeLabel(range, occurrence)).join(", ")}</p>}
                          </>
                        ) : (
                          <p className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Volledig gepland</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {validationErrors.filter(error => !error.segmentId).map((error, index) => <div key={`${error.code}-${index}`} role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error.message}</div>)}
              {composition.warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning.message}</div>)}
              {!validationErrors.length && draftSegments.length > 0 && <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[10px] text-emerald-800"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Tijden zijn geldig. Taakdekking wordt bij opslaan nogmaals server-side gecontroleerd.</div>}
            </aside>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button disabled={isPending || !draftSegments.length || validationErrors.length > 0} onClick={submit}><Save className={cn("h-4 w-4", isPending && "animate-pulse")} /> {isPending ? "Opslaan…" : "Conceptdienst opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

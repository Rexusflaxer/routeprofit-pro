import React, { useEffect, useRef } from "react";

const text = values => values.flat(Infinity).filter(Boolean).join(" ").toLocaleLowerCase("nl-NL");

export default function PlanningSearchFocus({ query, shifts, assignments, segments, occurrences, personnel, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const normalized = String(query || "").trim().toLocaleLowerCase("nl-NL");
    const personnelById = new Map(personnel.map(item => [String(item.id), item]));
    const segmentsByShift = new Map();
    segments.forEach(item => segmentsByShift.set(String(item.shift_id), [...(segmentsByShift.get(String(item.shift_id)) || []), item]));
    const assignmentsByShift = new Map();
    assignments.filter(item => item.status !== "removed").forEach(item => assignmentsByShift.set(String(item.shift_id || item.planning_shift_id), [...(assignmentsByShift.get(String(item.shift_id || item.planning_shift_id)) || []), item]));
    const matchedShiftIds = new Set(shifts.filter(shift => text([
      shift.name, shift.service_name_snapshot, shift.route_name, shift.object_name, shift.object_name_snapshot,
      shift.customer_name_snapshot, (segmentsByShift.get(String(shift.id)) || []).flatMap(item => [item.task_name_snapshot, item.object_name_snapshot, item.customer_name_snapshot, item.task_type]),
      (assignmentsByShift.get(String(shift.id)) || []).flatMap(item => [item.personnel_name, item.personnel_name_snapshot, personnelById.get(String(item.personnel_id))?.name, personnelById.get(String(item.personnel_id))?.display_name]),
    ]).includes(normalized)).map(item => String(item.id)));
    const matchedOccurrenceIds = new Set(occurrences.filter(item => text([item.task_name_snapshot, item.object_name_snapshot, item.customer_name_snapshot, item.task_type]).includes(normalized)).map(item => String(item.id)));
    segments.filter(item => matchedShiftIds.has(String(item.shift_id))).forEach(item => matchedOccurrenceIds.add(String(item.task_occurrence_id)));
    const selector = "[data-shift-id], [data-task-occurrence-id], [data-task-coverage-group]";
    const cards = [...root.querySelectorAll(selector)].filter(card => !card.parentElement?.closest(selector));
    cards.forEach(card => {
      card.classList.remove("planning-search-match", "planning-search-dim");
      if (!normalized) return;
      const matches = (card.dataset.shiftId && matchedShiftIds.has(card.dataset.shiftId))
        || (card.dataset.taskOccurrenceId && matchedOccurrenceIds.has(card.dataset.taskOccurrenceId))
        || (card.dataset.taskCoverageGroup && matchedOccurrenceIds.has(card.dataset.taskCoverageGroup));
      card.classList.add(matches ? "planning-search-match" : "planning-search-dim");
    });
    return () => cards.forEach(card => card.classList.remove("planning-search-match", "planning-search-dim"));
  }, [assignments, occurrences, personnel, query, segments, shifts]);

  return <div ref={ref} className="h-full min-h-0">{children}</div>;
}
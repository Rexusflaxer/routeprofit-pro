import React from "react";
import PlanningMatrix from "@/components/planning/PlanningMatrix";

/**
 * Full-screen planning projection.
 *
 * The page owns data loading and mutations. This board only projects the
 * supplied range in one of two matrices and exposes typed drop targets through
 * PlanningMatrix:
 * - object: occurrence:<occurrenceId>:<YYYY-MM-DD> accepts a PERSONNEL
 *   draggable and limits composition to that visible day slice;
 * - employee: employee-day:<personnelId>:<YYYY-MM-DD> accepts a TASK draggable;
 * - object slots: slot:<shiftId>:<slotIndex>:<YYYY-MM-DD>:<resourceKey>
 *   accepts PERSONNEL; a cross-day shift opens full-shift confirmation.
 *
 * Legacy props such as `view`, `weeks`, `customers` and
 * `taskOccurrenceCount` remain safe to pass; week/custom-period behavior is
 * expressed entirely by the `days` collection.
 */
export default function PlanningBoard({
  perspective,
  days = [],
  shifts = [],
  coverageShifts = shifts,
  assignments = [],
  segments = [],
  occurrences = [],
  personnel = [],
  objects = [],
  routes = [],
  selectedShiftId,
  onSelectOccurrence,
  onFillStaffing,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
  isLoading,
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
          Planning laden…
        </div>
      </div>
    );
  }

  return (
    <PlanningMatrix
      perspective={perspective}
      days={days}
      shifts={shifts}
      coverageShifts={coverageShifts}
      assignments={assignments}
      segments={segments}
      occurrences={occurrences}
      personnel={personnel}
      objects={objects}
      routes={routes}
      selectedShiftId={selectedShiftId}
      onSelectOccurrence={onSelectOccurrence}
      onFillStaffing={onFillStaffing}
      onSelectShift={onSelectShift}
      onUnassign={onUnassign}
      onMove={onMove}
      onCopy={onCopy}
      onEditComposition={onEditComposition}
      onCancelComposition={onCancelComposition}
    />
  );
}

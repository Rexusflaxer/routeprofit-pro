import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ObjectTaskSchedule from "./ObjectTaskSchedule";
import { taskTypeLabel } from "./objectTaskConfig";

export default function ObjectTaskSchedulePreviewDialog({ definition, contextData, weekStart, onWeekChange, open, onOpenChange }) {
  if (!definition) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{taskTypeLabel(definition)}</DialogTitle>
          <DialogDescription>Bekijk het actuele taakrooster. Wijzigen kan alleen via het potlood bij de taak.</DialogDescription>
        </DialogHeader>
        <ObjectTaskSchedule
          readOnly
          contextData={contextData}
          taskDefinitionId={definition.id}
          executionMode={definition.execution_mode}
          durationMinutes={Number(definition.duration_minutes || 0)}
          weekStart={weekStart}
          onWeekChange={onWeekChange}
          serverClock={contextData.server_clock}
        />
      </DialogContent>
    </Dialog>
  );
}
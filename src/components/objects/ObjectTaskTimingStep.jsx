import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";
import ObjectTaskSchedule from "./ObjectTaskSchedule";
import { securityPlanTaskTypeLabel } from "./securityPlanConfig";

export default function ObjectTaskTimingStep({
  form,
  contextData,
  weekStart,
  onWeekChange,
  serverClock,
  onChange,
}) {
  const continuous = form.execution_mode === "continuous";
  return (
    <>
      <StepHeading
        title="Teken de taak in het rooster"
        description={continuous
          ? "Je ziet de huidige kalenderweek. Teken alleen in de toekomst en stel herhaling daarna per taakmoment in."
          : "Klik in de huidige of een volgende week. De duur komt uit het gekozen beveiligingsplan; herhaling stel je daarna per taakmoment in."}
      />
      <ObjectTaskSchedule
        entries={form.schedule_entries}
        contextData={contextData}
        onChange={value => onChange("schedule_entries", value)}
        executionMode={form.execution_mode}
        durationMinutes={Number(form.duration_minutes)}
        taskLabel={form.custom_task_type || securityPlanTaskTypeLabel(form.task_type)}
        weekStart={weekStart}
        onWeekChange={onWeekChange}
        serverClock={serverClock}
      />
      <div className="max-w-2xl">
        <Field label="Taakinstructie" htmlFor="task-instructions">
          <Textarea
            id="task-instructions"
            rows={3}
            maxLength={2000}
            value={form.instructions}
            onChange={event => onChange("instructions", event.target.value)}
            placeholder="Optionele korte omschrijving van wat er moet gebeuren"
          />
        </Field>
      </div>
    </>
  );
}

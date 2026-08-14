import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";
import ObjectTaskSchedule from "./ObjectTaskSchedule";

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
        title="Wanneer wordt deze taak uitgevoerd?"
        description={continuous
          ? "Teken de aaneengesloten bezetting per dag in de vertrouwde tijdlijn. Klik daarna op een taakblok voor de exacte tijd en herhaling."
          : "Plaats de toegestane taakmomenten in de tijdlijn. De uitvoeringsduur komt uit het gekozen beveiligingsplan; exacte tijd en herhaling stel je per blok in."}
      />
      <ObjectTaskSchedule
        entries={form.schedule_entries}
        contextData={contextData}
        onChange={value => onChange("schedule_entries", value)}
        executionMode={form.execution_mode}
        durationMinutes={Number(form.duration_minutes)}
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

import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";
import ObjectTaskSchedule from "./ObjectTaskSchedule";

export default function ObjectTaskTimingStep({ form, otherTasks = [], onChange }) {
  const continuous = form.execution_mode === "continuous";
  return <><StepHeading title="Wanneer wordt deze taak uitgevoerd?" description={continuous ? "Teken de aaneengesloten bezetting per dag in het rooster." : "Teken de toegestane tijdvensters; de uitvoeringsduur komt uit het gekozen beveiligingsplan."} /><ObjectTaskSchedule periods={form.schedule_periods} otherTasks={otherTasks} recurrence={{ type: form.recurrence_type, specificDate: form.specific_date, validFrom: form.valid_from, validUntil: form.valid_until }} onChange={value => onChange("schedule_periods", value)} oneTimeDate={form.recurrence_type === "one_time" ? form.specific_date : null} executionMode={form.execution_mode} durationMinutes={Number(form.duration_minutes)} /><div className="max-w-2xl"><Field label="Taakinstructie" htmlFor="task-instructions"><Textarea id="task-instructions" rows={3} maxLength={2000} value={form.instructions} onChange={event => onChange("instructions", event.target.value)} placeholder="Optionele korte omschrijving van wat er moet gebeuren" /></Field></div></>;
}
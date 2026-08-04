import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";
import ObjectTaskSchedule from "./ObjectTaskSchedule";

export default function ObjectTaskTimingStep({ form, onChange }) {
  const continuous = form.execution_mode === "continuous";
  return <><StepHeading title="Wanneer wordt deze taak uitgevoerd?" description={continuous ? "Teken de aaneengesloten bezetting per dag in het rooster." : "Teken de toegestane tijdvensters en leg de uitvoeringsduur vast."} /><ObjectTaskSchedule periods={form.schedule_periods} onChange={value => onChange("schedule_periods", value)} oneTimeDate={form.recurrence_type === "one_time" ? form.specific_date : null} /><div className="grid max-w-2xl gap-4 sm:grid-cols-2">{!continuous && <Field label="Uitvoeringsduur in minuten" htmlFor="task-duration" required><Input id="task-duration" type="number" min="1" value={form.duration_minutes} onChange={event => onChange("duration_minutes", event.target.value)} /></Field>}<div className="sm:col-span-2"><Field label="Taakinstructie" htmlFor="task-instructions"><Textarea id="task-instructions" rows={3} maxLength={2000} value={form.instructions} onChange={event => onChange("instructions", event.target.value)} placeholder="Optionele korte omschrijving van wat er moet gebeuren" /></Field></div></div></>;
}
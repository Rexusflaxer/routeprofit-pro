import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";
import { OBJECT_TASK_TYPES } from "./objectTaskConfig";

export default function ObjectTaskTypeStep({ form, onChange, onChoose, onContinue }) {
  const custom = form.task_type === "other";
  return <><StepHeading title="Wat betreft de taak?" description="Kies eerst welke taak op dit object moet worden uitgevoerd." /><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{OBJECT_TASK_TYPES.map(option => <ChoiceCard key={option.value} selected={form.task_type === option.value} onClick={() => onChoose(option)} title={option.label} description={option.description} />)}</div>{custom && <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card/45 p-4"><Input value={form.custom_task_type} onChange={event => onChange("custom_task_type", event.target.value)} placeholder="Naam van de taak" autoFocus /><div className="grid grid-cols-2 gap-2"><ChoiceCard selected={form.execution_mode === "continuous"} onClick={() => onChange("execution_mode", "continuous")} title="Aaneengesloten" description="De taak duurt het hele tijdvak." /><ChoiceCard selected={form.execution_mode === "time_window"} onClick={() => onChange("execution_mode", "time_window")} title="Binnen tijdvenster" description="De taak wordt binnen het tijdvak uitgevoerd." /></div><Button type="button" onClick={onContinue} disabled={!form.custom_task_type.trim() || !form.execution_mode}>Volgende</Button></div>}</>;
}
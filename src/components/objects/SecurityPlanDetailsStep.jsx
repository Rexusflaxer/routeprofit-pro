import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceCard, Field, StepHeading } from "./ObjectWizardUi";

export default function SecurityPlanDetailsStep({ form, onChange, onSelectFull }) {
  const choose = type => {
    onChange({ ...form, plan_type: type, title: type === "full" ? "Volledige brand & sluitronde" : "", description: "" });
    if (type === "full") onSelectFull();
  };
  return <div className="space-y-4"><StepHeading title="Kies het soort brand- en sluitronde" /><div className="space-y-2"><ChoiceCard selected={form.plan_type === "full"} onClick={() => choose("full")} title="Volledige brand & sluitronde" /><ChoiceCard selected={form.plan_type === "custom"} onClick={() => choose("custom")} title="Aangepaste brand & sluitronde" /></div>{form.plan_type === "custom" && <div className="space-y-4"><Field label="Titel / naam" htmlFor="security-plan-title" required><Input id="security-plan-title" value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="Naam van het plan" /></Field><Field label="Omschrijving" htmlFor="security-plan-description" hint="Optioneel"><Textarea id="security-plan-description" value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} placeholder="Voeg eventueel een omschrijving toe" /></Field></div>}</div>;
}
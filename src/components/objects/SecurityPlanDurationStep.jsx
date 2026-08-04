import React from "react";
import { Input } from "@/components/ui/input";
import { Field, StepHeading } from "./ObjectWizardUi";

export default function SecurityPlanDurationStep({ value, onChange }) {
  return <div className="space-y-4"><StepHeading title="Hoeveel minuten duurt deze ronde?" description="Vul de geklokte of berekende uitvoeringsduur in." /><Field label="Geklokte / berekende minuten" htmlFor="security-plan-minutes" required><Input id="security-plan-minutes" type="number" min="1" step="1" value={value} onChange={event => onChange(event.target.value)} placeholder="Bijvoorbeeld 30" /></Field></div>;
}
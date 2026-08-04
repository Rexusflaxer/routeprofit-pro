import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";

export default function ObjectRelationshipDetailsStep({ form, onChange }) {
  return <><StepHeading title="Welke objectgebonden gegevens wilt u vastleggen?" /><div className="grid gap-4 md:grid-cols-2"><Field label="Aansluit- of klantnummer" htmlFor="relationship-reference"><Input id="relationship-reference" value={form.reference_number} onChange={event => onChange("reference_number", event.target.value)} /></Field><Field label="Telefoonnummer" htmlFor="relationship-phone"><Input id="relationship-phone" type="tel" value={form.phone} onChange={event => onChange("phone", event.target.value)} /></Field><Field label="E-mailadres" htmlFor="relationship-email"><Input id="relationship-email" type="email" value={form.email} onChange={event => onChange("email", event.target.value)} /></Field><Field label="Notitie" htmlFor="relationship-notes"><Textarea id="relationship-notes" rows={3} value={form.notes} onChange={event => onChange("notes", event.target.value)} /></Field></div></>;
}
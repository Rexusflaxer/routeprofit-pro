import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepHeading } from "./ObjectWizardUi";

export default function SecurityPlanInstructionsStep({ instructions, onChange }) {
  const update = (index, value) => onChange(instructions.map((item, itemIndex) => itemIndex === index ? value : item));
  const remove = index => onChange(instructions.filter((_, itemIndex) => itemIndex !== index));
  return <div className="space-y-4"><StepHeading title="Instructies" description="Voeg de specifieke werkwijze voor deze planvariant toe. De volgorde wordt tijdens de uitvoering aangehouden." />{instructions.map((instruction, index) => <div key={index} className="flex items-start gap-2"><div className="min-w-0 flex-1"><Field label={`Instructie ${index + 1}`} htmlFor={`plan-instruction-${index}`}><Textarea id={`plan-instruction-${index}`} value={instruction} onChange={event => update(index, event.target.value)} placeholder="Beschrijf wat uitgevoerd of gecontroleerd moet worden" /></Field></div><Button type="button" variant="ghost" size="icon" className="mt-6" onClick={() => remove(index)} aria-label={`Instructie ${index + 1} verwijderen`}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => onChange([...instructions, ""])}><Plus className="h-4 w-4" /> Instructie toevoegen</Button></div>;
}
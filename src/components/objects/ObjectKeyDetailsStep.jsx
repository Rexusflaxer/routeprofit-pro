import React from "react";
import { Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, StepHeading } from "./ObjectWizardUi";
import ObjectKeySetChoice from "./ObjectKeySetChoice";
import { OBJECT_KEY_STATUS_OPTIONS } from "./objectKeyConfig";

export default function ObjectKeyDetailsStep({ form, sets, onChange, onSet }) {
  return <><StepHeading icon={Hash} title="Hoe is dit toegangsmiddel herkenbaar?" description="Het sleutelnummer is uniek in het volledige sleutelregister. Noteer daarnaast het nummer dat door de fabrikant of het toegangssysteem wordt gebruikt." /><div className="grid gap-4 md:grid-cols-2"><Field label="Sleutelnummer" htmlFor="object-key-number" required hint="Moet uniek zijn voor alle objecten."><Input id="object-key-number" value={form.key_number} onChange={event => onChange("key_number", event.target.value)} placeholder="Bijv. SL-000123" autoFocus /></Field><Field label="Serie-, pas- of tagnummer" htmlFor="object-key-serial" hint="Ook geschikt voor een pasnummer, tagnummer of ander herkenningsnummer."><Input id="object-key-serial" value={form.serial_number} onChange={event => onChange("serial_number", event.target.value)} placeholder="Nummer op het middel" /></Field><Field label="Status" htmlFor="object-key-status"><Select value={form.status} onValueChange={value => onChange("status", value)}><SelectTrigger id="object-key-status"><SelectValue /></SelectTrigger><SelectContent>{OBJECT_KEY_STATUS_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field></div><ObjectKeySetChoice sets={sets} setId={form.key_set_id} createNew={form.create_new_set} onSelect={onSet} /></>;
}
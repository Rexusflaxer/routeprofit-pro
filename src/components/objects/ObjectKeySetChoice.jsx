import React from "react";
import { Layers3 } from "lucide-react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";

export default function ObjectKeySetChoice({ sets, setId, createNew, onSelect, heading = true }) {
  if (!sets.length) return heading ? <StepHeading icon={Layers3} title="Sleutelset wordt automatisch aangemaakt" description="Dit object heeft nog geen sleutelset. Bij opslaan wordt automatisch Sleutelset 1 aangemaakt." /> : null;
  return <div className="space-y-3">{heading && <StepHeading icon={Layers3} title="Aan welke sleutelset wilt u deze toevoegen?" description="Kies een bestaande set van dit object of laat automatisch een nieuwe genummerde set aanmaken." />}<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{sets.map(set => <ChoiceCard key={set.id} selected={!createNew && setId === set.id} onClick={() => onSelect(set.id, false)} title={set.display_label} description={`${set.keys?.length || 0} toegangsmiddel${set.keys?.length === 1 ? "" : "en"}`} />)}<ChoiceCard selected={createNew} onClick={() => onSelect("", true)} title="Nieuwe sleutelset" description="Wordt automatisch genummerd." /></div></div>;
}
import React from "react";
import { Layers3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChoiceCard, Field, StepHeading } from "./ObjectWizardUi";

export default function ObjectKeySetChoice({
  sets,
  setId,
  createNew,
  setKeyNumber,
  onSetKeyNumberChange,
  onSelect,
  heading = true,
}) {
  const needsNumber = !sets.length || createNew;
  return (
    <div className="space-y-3">
      {heading && <StepHeading
        icon={Layers3}
        title={sets.length ? "Aan welke sleutelset wilt u deze toevoegen?" : "Nieuwe sleutelset"}
        description={sets.length
          ? "Kies een bestaande set of maak voor dit object een nieuwe herkenbare sleutelset."
          : "Dit object heeft nog geen sleutelset. De eerste set wordt automatisch aangemaakt."}
      />}
      {sets.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sets.map(set => <ChoiceCard
            key={set.id}
            selected={!createNew && setId === set.id}
            onClick={() => onSelect(set.id, false)}
            title={set.display_label}
            description={`${set.key_number} · ${set.keys?.length || 0} toegangsmiddel${set.keys?.length === 1 ? "" : "en"}`}
          />)}
          <ChoiceCard selected={createNew} onClick={() => onSelect("", true)} title="Nieuwe sleutelset" description="Met een herkenbaar sleutelnummer voor dit object." />
        </div>
      )}
      {needsNumber && (
        <div className="max-w-md">
          <Field label="Sleutelnummer van de set" htmlFor="object-key-set-number" required hint="Gebruik de nummering van de eigen organisatie; dit is geen custody- of uitgifte-ID.">
            <Input id="object-key-set-number" value={setKeyNumber} onChange={event => onSetKeyNumberChange(event.target.value)} placeholder="Bijv. WE-063" />
          </Field>
        </div>
      )}
    </div>
  );
}

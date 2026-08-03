import React from "react";
import { KeyRound } from "lucide-react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";

export default function ObjectKeySourceStep({ mode, onChange }) {
  return <><StepHeading icon={KeyRound} title="Welke sleutel wilt u toevoegen?" description="Maak een nieuw toegangsmiddel aan of koppel een sleutel die al in het centrale sleutelregister staat." /><div className="grid gap-2 sm:grid-cols-2"><ChoiceCard selected={mode === "new"} onClick={() => onChange("new")} title="Nieuwe sleutel toevoegen" description="Registreer een nieuw fysiek toegangsmiddel." /><ChoiceCard selected={mode === "existing"} onClick={() => onChange("existing")} title="Bestaande sleutel koppelen" description="Koppel een bestaande sleutel aan dit object." /></div></>;
}
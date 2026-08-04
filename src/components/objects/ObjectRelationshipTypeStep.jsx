import React from "react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";
import { OBJECT_RELATIONSHIP_TYPES } from "./objectRelationshipConfig";

export default function ObjectRelationshipTypeStep({ value, onSelect, customLabel, onCustomLabelChange }) {
  return <>
    <StepHeading title="Welke relatie heeft deze instantie met het object?" />
    <div className="grid grid-cols-1 gap-2">{OBJECT_RELATIONSHIP_TYPES.map(option => <ChoiceCard key={option.value} selected={value === option.value} onClick={() => onSelect(option.value)} title={option.label} description={option.description} />)}</div>
    {value === "other" && <input value={customLabel} onChange={event => onCustomLabelChange(event.target.value)} placeholder="Omschrijf de relatie" className="h-9 w-full max-w-xl rounded-md border border-input bg-card/60 px-3 text-sm" autoFocus />}
  </>;
}
import React from "react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";
import { OBJECT_KEY_TYPES } from "./objectKeyConfig";

export default function ObjectKeyTypeStep({ value, onChange }) {
  return <><StepHeading title="Welk type toegangsmiddel is dit?" /><div className="grid grid-cols-1 gap-2">{OBJECT_KEY_TYPES.map(option => <ChoiceCard key={option.value} selected={value === option.value} onClick={() => onChange(option.value)} title={option.label} description={option.description} />)}</div></>;
}
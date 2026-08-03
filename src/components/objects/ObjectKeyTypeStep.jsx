import React from "react";
import { Shapes } from "lucide-react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";
import { OBJECT_KEY_TYPES } from "./objectKeyConfig";

export default function ObjectKeyTypeStep({ value, onChange }) {
  return <><StepHeading icon={Shapes} title="Welk type toegangsmiddel is dit?" description="Kies de fysieke vorm waarmee toegang tot het object wordt verkregen." /><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{OBJECT_KEY_TYPES.map(option => <ChoiceCard key={option.value} selected={value === option.value} onClick={() => onChange(option.value)} title={option.label} description={option.description} />)}</div></>;
}
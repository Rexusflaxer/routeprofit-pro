import React from "react";
import { Link2 } from "lucide-react";
import { ChoiceCard, StepHeading } from "./ObjectWizardUi";
import { keyTypeLabel } from "./objectKeyConfig";

export default function ObjectExistingKeyStep({ keys, value, onChange }) {
  return <><StepHeading icon={Link2} title="Welke bestaande sleutel wilt u koppelen?" description="Alleen sleutels die nog niet aan dit object zijn gekoppeld worden getoond." />{keys.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{keys.map(key => <ChoiceCard key={key.id} selected={value === key.id} onClick={() => onChange(key.id)} title={key.key_number} description={`${keyTypeLabel(key.key_type)} · ${key.brand}${key.serial_number ? ` · ${key.serial_number}` : ""}`} />)}</div> : <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Er zijn geen bestaande sleutels beschikbaar om te koppelen.</div>}</>;
}
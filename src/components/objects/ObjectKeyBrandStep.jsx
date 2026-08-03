import React, { useMemo, useState } from "react";
import { Factory, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceCard, Field, StepHeading } from "./ObjectWizardUi";
import { KEY_BRANDS } from "./objectKeyConfig";

export default function ObjectKeyBrandStep({ keyType, value, knownBrands, onChange }) {
  const [custom, setCustom] = useState(Boolean(value && !KEY_BRANDS[keyType]?.includes(value)));
  const brands = useMemo(() => [...new Set([...(KEY_BRANDS[keyType] || []), ...knownBrands])].sort((a, b) => a.localeCompare(b, "nl")), [keyType, knownBrands]);
  return <><StepHeading icon={Factory} title="Van welk merk is het toegangsmiddel?" description="De lijst bevat gangbare merken voor het gekozen type. Een ander merk kan direct worden toegevoegd." />{custom ? <div className="max-w-xl space-y-3 rounded-lg border border-primary/30 bg-card p-4"><Field label="Merk" htmlFor="custom-key-brand" required><Input id="custom-key-brand" value={value} onChange={event => onChange(event.target.value)} placeholder="Vul het merk in" autoFocus /></Field><Button type="button" size="sm" variant="outline" onClick={() => { setCustom(false); onChange(""); }}>Terug naar merken</Button></div> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{brands.map(brand => <ChoiceCard key={brand} selected={value === brand} onClick={() => onChange(brand)} title={brand} />)}<button type="button" onClick={() => { setCustom(true); onChange(""); }} className="flex min-h-[72px] items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-card text-sm font-medium text-primary hover:bg-primary/5"><Plus className="h-4 w-4" /> Ander merk toevoegen</button></div>}</>;
}
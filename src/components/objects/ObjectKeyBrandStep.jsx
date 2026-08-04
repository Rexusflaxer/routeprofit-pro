import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceCard, Field, StepHeading } from "./ObjectWizardUi";
import { KEY_BRANDS } from "./objectKeyConfig";

export default function ObjectKeyBrandStep({ keyType, value, knownBrands, onChange }) {
  const [custom, setCustom] = useState(Boolean(value && !KEY_BRANDS[keyType]?.includes(value)));
  const brands = useMemo(() => [...new Set([...(KEY_BRANDS[keyType] || []), ...knownBrands])].sort((a, b) => a.localeCompare(b, "nl")), [keyType, knownBrands]);
  return <><StepHeading title="Van welk merk is het toegangsmiddel?" description="De lijst bevat gangbare merken voor het gekozen type. Een ander merk kan direct worden toegevoegd." />{custom ? <div className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-4"><Field label="Merk" htmlFor="custom-key-brand" required><Input id="custom-key-brand" value={value} onChange={event => onChange(event.target.value)} placeholder="Vul het merk in" autoFocus /></Field><Button type="button" size="sm" variant="outline" onClick={() => { setCustom(false); onChange(""); }}>Terug naar merken</Button></div> : <div className="grid grid-cols-1 gap-2">{brands.map(brand => <ChoiceCard key={brand} selected={value === brand} onClick={() => onChange(brand)} title={brand} />)}<ChoiceCard selected={false} onClick={() => { setCustom(true); onChange(""); }} title="Ander merk" description="Vul het merk handmatig in." icon={Plus} /></div>}</>;
}
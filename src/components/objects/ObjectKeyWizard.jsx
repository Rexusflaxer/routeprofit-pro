import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OBJECT_KEY_STATUS_OPTIONS } from "./objectKeyConfig";

const initialForm = key => ({ key_number: key?.key_number || "", description: key?.description || "", status: key?.status || "in_storage" });

export default function ObjectKeyWizard({ currentKey, onCancel, onSave, saving, error }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialForm(currentKey));
  useEffect(() => { setStep(1); setForm(initialForm(currentKey)); }, [currentKey]);
  const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
  return (
    <section className="border-b border-border bg-muted/10 p-4">
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><KeyRound className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold">{currentKey ? "Sleutel wijzigen" : "Sleutel toevoegen"}</h2><p className="text-xs text-muted-foreground">Stap {step} van 2 · {step === 1 ? "Identificatie" : "Status"}</p></div></div>
        {step === 1 ? <div className="space-y-4"><div className="space-y-2"><Label htmlFor="key-number">Sleutelnummer</Label><Input id="key-number" autoFocus value={form.key_number} onChange={event => setField("key_number", event.target.value)} placeholder="Bijv. S-001" maxLength={60} /></div><div className="space-y-2"><Label htmlFor="key-description">Omschrijving</Label><Input id="key-description" value={form.description} onChange={event => setField("description", event.target.value)} placeholder="Bijv. Hoofdingang" maxLength={160} /></div></div> : <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={value => setField("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OBJECT_KEY_STATUS_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>}
        {error && <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error.message || "De sleutel kon niet worden opgeslagen."}</div>}
        <div className="mt-5 flex justify-between"><Button type="button" variant="outline" onClick={step === 1 ? onCancel : () => setStep(1)} disabled={saving}>{step === 2 && <ArrowLeft className="h-4 w-4" />}{step === 1 ? "Annuleren" : "Vorige"}</Button>{step === 1 ? <Button type="button" onClick={() => setStep(2)} disabled={!form.key_number.trim() || !form.description.trim()}>Volgende <ArrowRight className="h-4 w-4" /></Button> : <Button type="button" onClick={() => onSave({ key_number: form.key_number.trim(), description: form.description.trim(), status: form.status })} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan</Button>}</div>
      </div>
    </section>
  );
}
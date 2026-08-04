import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardSteps } from "./ObjectWizardUi";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import ObjectExistingKeyStep from "./ObjectExistingKeyStep";
import ObjectKeyBrandStep from "./ObjectKeyBrandStep";
import ObjectKeyDetailsStep from "./ObjectKeyDetailsStep";
import ObjectKeySetChoice from "./ObjectKeySetChoice";
import ObjectKeySourceStep from "./ObjectKeySourceStep";
import ObjectKeyTypeStep from "./ObjectKeyTypeStep";

const blank = key => ({ mode: key ? "edit" : "", key_id: key?.id || "", assignment_id: key?.assignment_id || "", key_type: key?.key_type || "", brand: key?.brand || "", serial_number: key?.serial_number || "", status: key?.status || "in_storage", key_set_id: key?.key_set_id || "", set_key_number: "", create_new_set: false });

export default function ObjectKeyWizard({ currentKey, sets, availableKeys, knownBrands, onCancel, onSave, saving, error }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => blank(currentKey));
  const steps = useMemo(() => currentKey ? [{ key: "type", label: "Type" }, { key: "brand", label: "Merk" }, { key: "details", label: "Kenmerken" }] : form.mode === "existing" ? [{ key: "source", label: "Keuze" }, { key: "existing", label: "Sleutel" }, ...(sets.length ? [{ key: "set", label: "Sleutelset" }] : [])] : [{ key: "source", label: "Keuze" }, { key: "type", label: "Type" }, { key: "brand", label: "Merk" }, { key: "details", label: "Kenmerken" }], [currentKey, form.mode, sets.length]);
  const step = steps[stepIndex]?.key;
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const chooseSet = (keySetId, createNew) => setForm(current => ({ ...current, key_set_id: keySetId, create_new_set: createNew }));
  const setChoiceValid = form.key_set_id || ((form.create_new_set || !sets.length) && form.set_key_number.trim());
  const canContinue = step === "source" ? Boolean(form.mode) : step === "type" ? Boolean(form.key_type) : step === "brand" ? Boolean(form.brand.trim()) : step === "existing" ? Boolean(form.key_id) : step === "set" ? Boolean(setChoiceValid) : Boolean(setChoiceValid);
  const finalStep = stepIndex === steps.length - 1;
  const submit = () => { if (!canContinue || saving) return; if (!finalStep) setStepIndex(index => index + 1); else onSave(form); };
  return <motion.section {...wizardRevealMotion} className="overflow-hidden border-b border-primary/30 bg-muted/20 p-4 sm:p-5"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{currentKey ? "Sleutel wijzigen" : "Nieuwe sleutel"}</p><WizardSteps stepIndex={stepIndex} steps={steps} label="Voortgang sleutelwizard" /><form onSubmit={event => { event.preventDefault(); submit(); }}><AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="space-y-5">{step === "source" && <ObjectKeySourceStep mode={form.mode} onChange={mode => setForm({ ...blank(null), mode })} />}{step === "type" && <ObjectKeyTypeStep value={form.key_type} onChange={value => { set("key_type", value); set("brand", ""); }} />}{step === "brand" && <ObjectKeyBrandStep keyType={form.key_type} value={form.brand} knownBrands={knownBrands} onChange={value => set("brand", value)} />}{step === "details" && <ObjectKeyDetailsStep form={form} sets={sets} onChange={set} onSet={chooseSet} />}{step === "existing" && <ObjectExistingKeyStep keys={availableKeys} value={form.key_id} onChange={value => set("key_id", value)} />}{step === "set" && <ObjectKeySetChoice sets={sets} setId={form.key_set_id} createNew={form.create_new_set} setKeyNumber={form.set_key_number} onSetKeyNumberChange={value => set("set_key_number", value)} onSelect={chooseSet} />}</motion.div></AnimatePresence>{error && <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message || "De sleutel kon niet worden opgeslagen."}</div>}<div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">{stepIndex === 0 ? <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button> : <Button type="button" variant="outline" onClick={() => setStepIndex(index => index - 1)} disabled={saving}><ArrowLeft className="h-4 w-4" /> Terug</Button>}<Button type="submit" disabled={!canContinue || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}{saving ? "Opslaan..." : finalStep ? (currentKey ? "Wijzigingen opslaan" : "Sleutel toevoegen") : <>Volgende <ArrowRight className="h-4 w-4" /></>}</Button></div></form></motion.section>;
}
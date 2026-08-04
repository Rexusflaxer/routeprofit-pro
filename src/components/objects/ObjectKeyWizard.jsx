import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import ObjectKeyBrandStep from "./ObjectKeyBrandStep";
import ObjectKeyDetailsStep from "./ObjectKeyDetailsStep";
import ObjectKeyTypeStep from "./ObjectKeyTypeStep";
import { WizardPanel, WizardSteps } from "./ObjectWizardUi";

const blank = key => ({
  key_type: key?.key_type || "",
  brand: key?.brand || "",
  serial_number: key?.serial_number || "",
  status: key?.status || "in_storage",
  key_set_id: key?.key_set_id || "",
  set_key_number: "",
  create_new_set: false,
});

export default function ObjectKeyWizard({ currentKey, sets, knownBrands, onCancel, onSave, saving, error }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => blank(currentKey));
  const steps = useMemo(() => [
    { key: "type", label: "Type" },
    { key: "brand", label: "Merk" },
    { key: "details", label: "Kenmerken" },
  ], []);
  const step = steps[stepIndex]?.key;
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const chooseSet = (keySetId, createNew) => setForm(current => ({
    ...current,
    key_set_id: keySetId,
    create_new_set: createNew,
  }));
  const setChoiceValid = form.key_set_id || ((form.create_new_set || !sets.length) && form.set_key_number.trim());
  const canContinue = step === "type"
    ? Boolean(form.key_type)
    : step === "brand"
      ? Boolean(form.brand.trim())
      : Boolean(setChoiceValid);
  const finalStep = stepIndex === steps.length - 1;
  const submit = () => {
    if (!canContinue || saving) return;
    if (!finalStep) setStepIndex(index => index + 1);
    else onSave(form);
  };

  return (
    <WizardPanel labelledBy="object-key-wizard-title">
      <motion.div {...wizardRevealMotion}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
          {currentKey ? "Sleutel wijzigen" : "Nieuwe sleutel"}
        </p>
        <h2 id="object-key-wizard-title" className="sr-only">{currentKey ? "Sleutel wijzigen" : "Sleutel toevoegen"}</h2>
        <WizardSteps stepIndex={stepIndex} steps={steps} label="Voortgang sleutelwizard" />
        <form onSubmit={event => { event.preventDefault(); submit(); }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-5"
            >
              {step === "type" && <ObjectKeyTypeStep value={form.key_type} onChange={value => { set("key_type", value); set("brand", ""); }} />}
              {step === "brand" && <ObjectKeyBrandStep keyType={form.key_type} value={form.brand} knownBrands={knownBrands} onChange={value => set("brand", value)} />}
              {step === "details" && <ObjectKeyDetailsStep form={form} sets={sets} onChange={set} onSet={chooseSet} readOnlySet={Boolean(currentKey)} />}
            </motion.div>
          </AnimatePresence>
          {error && <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message || "De sleutel kon niet worden opgeslagen."}</div>}
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-between">
            {stepIndex === 0
              ? <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button>
              : <Button type="button" variant="outline" onClick={() => setStepIndex(index => index - 1)} disabled={saving}><ArrowLeft className="h-4 w-4" /> Terug</Button>}
            <Button type="submit" disabled={!canContinue || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}
              {saving ? "Opslaan..." : finalStep ? (currentKey ? "Wijzigingen opslaan" : "Sleutel toevoegen") : <>Volgende <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </form>
      </motion.div>
    </WizardPanel>
  );
}

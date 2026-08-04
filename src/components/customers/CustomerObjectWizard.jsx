import React, { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardCheck,
  Loader2,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { formatAddress } from "@/lib/addressFormatting";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import {
  findPotentialObjectDuplicates,
  OBJECT_TYPE_OPTIONS,
  objectTypeLabel,
} from "./customerObjectConfig";

const STEPS = [
  { key: "identity", label: "Object", icon: Building2 },
  { key: "location", label: "Locatie", icon: MapPin },
  { key: "review", label: "Controleren", icon: ClipboardCheck },
];

function WizardSteps({ stepIndex }) {
  return (
    <ol className="mb-6 grid grid-cols-3 gap-1" aria-label="Voortgang object toevoegen">
      {STEPS.map((step, index) => {
        const complete = index < stepIndex;
        const active = index === stepIndex;
        const Icon = step.icon;
        return (
          <li key={step.key} aria-current={active ? "step" : undefined}>
            <div className={`h-1 rounded-full ${index <= stepIndex ? "bg-primary" : "bg-border"}`} />
            <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium ${active ? "text-primary" : complete ? "text-foreground" : "text-muted-foreground"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${index <= stepIndex ? "border-primary/30 bg-primary/10" : "border-border bg-card"}`}>
                {complete ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </span>
              <span className="hidden truncate sm:block">{step.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeading({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, hint = null, required = false, children }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChoiceCard({ selected, onClick, title, description, icon: Icon = Building2, checkbox = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[76px] items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
      }`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${checkbox ? "rounded" : "rounded-full"} border-2 ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
        {selected ? <Check className="h-3 w-3 text-primary-foreground" /> : Icon ? <Icon className="h-3 w-3 text-muted-foreground" /> : null}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function SummaryItem({ label, children }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

export default function CustomerObjectWizard({
  customerName = "Deze klant",
  objects = [],
  onCancel,
  onSave,
  saving = false,
  error,
}) {
  const fieldId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [duplicateReviewed, setDuplicateReviewed] = useState(false);
  const [form, setForm] = useState(() => ({
    name: "",
    object_type: "",
    address: "",
    street_name: "",
    house_number: "",
    house_number_addition: "",
    postal_code: "",
    city: "",
    country_code: "NL",
    country_name: "Nederland",
    latitude: null,
    longitude: null,
    geocoding_status: "unverified",
    bag_address_id: null,
  }));

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const potentialDuplicates = useMemo(
    () => findPotentialObjectDuplicates(objects, form),
    [form, objects],
  );
  const addressVerified = form.geocoding_status === "verified"
    && Number.isFinite(Number(form.latitude))
    && Number.isFinite(Number(form.longitude));
  const canContinue = [
    Boolean(form.name.trim() && form.object_type),
    Boolean(form.address.trim()),
    potentialDuplicates.length === 0 || duplicateReviewed,
  ][stepIndex];
  const finalStep = stepIndex === STEPS.length - 1;

  const onAddressQueryChange = value => {
    setForm(current => ({
      ...current,
      address: value,
      street_name: "",
      house_number: "",
      house_number_addition: "",
      postal_code: "",
      city: "",
      latitude: null,
      longitude: null,
      bag_address_id: null,
      geocoding_status: "unverified",
    }));
  };

  const onAddressSelect = address => {
    setForm(current => ({
      ...current,
      ...address,
      address: formatAddress(address, { omitDefaultCountry: true }),
      country_code: address.country === "Nederland" ? "NL" : current.country_code,
      country_name: address.country || current.country_name,
    }));
  };

  const continueWizard = () => {
    if (!canContinue || saving) return;
    if (!finalStep) {
      setStepIndex(current => current + 1);
      return;
    }
    onSave?.({
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      duplicate_reviewed: duplicateReviewed,
    });
  };

  return (
    <motion.section {...wizardRevealMotion} className="overflow-hidden border-b border-primary/30 bg-muted/20 p-4 sm:p-5" aria-labelledby="customer-object-wizard-title">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Nieuw object</p>
      <h2 id="customer-object-wizard-title" className="sr-only">Object toevoegen</h2>
      <WizardSteps stepIndex={stepIndex} />

      <form onSubmit={event => { event.preventDefault(); continueWizard(); }} noValidate>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={STEPS[stepIndex].key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="space-y-5"
          >
            {stepIndex === 0 && (
              <>
                <StepHeading
                  icon={Building2}
                  title="Welk object voegen we toe?"
                  description="De klantrelatie staat vast. Maak alleen het fysieke object aan; de operationele inrichting volgt op de objectpagina."
                />
                <div className="rounded-md border border-border bg-card px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Klant</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{customerName}</p>
                </div>
                <Field label="Objectnaam" htmlFor={`${fieldId}-name`} required hint="Gebruik de naam die planners en surveillanten direct herkennen. De objectcode maakt LOQ automatisch.">
                  <Input
                    id={`${fieldId}-name`}
                    value={form.name}
                    onChange={event => set("name", event.target.value)}
                    placeholder="Bijv. Distributiecentrum Utrecht"
                    autoFocus
                  />
                </Field>
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold text-foreground">Objecttype <span className="text-destructive">*</span></legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {OBJECT_TYPE_OPTIONS.map(option => (
                      <ChoiceCard
                        key={option.key}
                        selected={form.object_type === option.key}
                        onClick={() => set("object_type", option.key)}
                        title={option.label}
                        description={option.description}
                      />
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {stepIndex === 1 && (
              <>
                <StepHeading
                  icon={MapPin}
                  title="Waar bevindt het object zich?"
                  description="Kies bij voorkeur een gevonden Nederlands adres. Handmatige invoer blijft mogelijk en krijgt een controlepunt na aanmaken."
                />
                <Field label="Objectadres" htmlFor={`${fieldId}-address`} required hint="Zoek op straat, huisnummer, postcode of plaats.">
                  <AddressAutocomplete
                    id={`${fieldId}-address`}
                    value={form}
                    onQueryChange={onAddressQueryChange}
                    onAddressSelect={onAddressSelect}
                    placeholder="Bijv. Stationsplein 1, Utrecht"
                  />
                </Field>
                <div className={`rounded-md border px-3 py-2.5 ${addressVerified ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {addressVerified ? <Check className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
                    {addressVerified ? "Kaartlocatie gevonden" : "Kaartlocatie nog controleren"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {addressVerified
                      ? "De coördinaten worden bewaard; operationele activatie volgt later."
                      : "Het object kan als concept worden opgeslagen, maar verschijnt nog niet op de mobiele kaart."}
                  </p>
                </div>
              </>
            )}

            {stepIndex === 2 && (
              <>
                <StepHeading
                  icon={ClipboardCheck}
                  title="Controleer het conceptobject"
                  description="Na aanmaken staat het object direct in de tabel. Gevoelige en operationele details worden veilig op de objectpagina ingericht."
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <SummaryItem label="Klant en object">
                    <p className="font-medium">{form.name.trim()}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{customerName} · code wordt automatisch gegenereerd</p>
                  </SummaryItem>
                  <SummaryItem label="Type en status">
                    <p>{objectTypeLabel(form.object_type)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Concept · nog niet operationeel gepubliceerd</p>
                  </SummaryItem>
                  <SummaryItem label="Locatie">
                    <p>{form.address.trim()}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{addressVerified ? "Kaartpositie gevonden" : "Kaartpositie moet nog worden gecontroleerd"}</p>
                  </SummaryItem>
                  <SummaryItem label="Vervolg">
                    <p className="text-muted-foreground">Waarschuwingsadressen en wijzigingen beheer je daarna op de objectkaart.</p>
                  </SummaryItem>
                </div>

                {potentialDuplicates.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
                      <ShieldAlert className="h-4 w-4" /> Mogelijk dubbel object
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
                      Controleer: {potentialDuplicates.map(object => `${object.object_code || "Zonder code"} · ${object.name || "Naamloos object"}`).join(", ")}.
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-amber-950 dark:text-amber-100">
                      <Checkbox checked={duplicateReviewed} onCheckedChange={checked => setDuplicateReviewed(Boolean(checked))} />
                      <span>Ik heb de mogelijke overeenkomst gecontroleerd en wil dit object toch aanmaken.</span>
                    </label>
                  </div>
                )}

                <div className="rounded-md border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">Vervolg op de objectkaart</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    De objectkaart start bewust compact met Waarschuwingsadressen en een volledig Logboek. Andere onderdelen worden pas toegevoegd zodra hun workflow gereed is.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <p>{error.message || "Het object kon niet worden toegevoegd."}</p>
            {error.requestId && <p className="mt-1 text-xs opacity-80">Referentie: {error.requestId}</p>}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {stepIndex === 0 ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setStepIndex(current => Math.max(0, current - 1))} disabled={saving}>
              <ArrowLeft className="h-4 w-4" /> Terug
            </Button>
          )}
          <Button type="submit" disabled={!canContinue || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}
            {saving ? "Object opslaan..." : finalStep ? "Object aanmaken" : <>Volgende <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </form>
    </motion.section>
  );
}
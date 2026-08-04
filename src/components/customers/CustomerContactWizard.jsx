import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ContactRound,
  Loader2,
  Mail,
  MapPinned,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";

const STEPS = [
  { key: "name", label: "Naam" },
  { key: "function", label: "Functie" },
  { key: "contact", label: "Contactgegevens" },
  { key: "objects", label: "Objectbevoegdheid" },
];

const JOB_TITLE_OPTIONS = [
  { key: "director", label: "Directeur", description: "Directie en beslissingsbevoegdheid" },
  { key: "finance", label: "Financieel contactpersoon", description: "Facturen, betalingen en financiële vragen" },
  { key: "operations", label: "Operationeel manager", description: "Dagelijkse operatie en uitvoering" },
  { key: "facilities", label: "Facilitair manager", description: "Facilitaire dienstverlening en locaties" },
  { key: "object_manager", label: "Objectbeheerder", description: "Beheer van één of meer objecten" },
  { key: "location_manager", label: "Locatiemanager", description: "Verantwoordelijk voor een vestiging of locatie" },
  { key: "contract_manager", label: "Contractmanager", description: "Contractafspraken en evaluaties" },
  { key: "planner", label: "Planner", description: "Planning, roosters en operationele wijzigingen" },
  { key: "other", label: "Anders", description: "Vul een andere functie handmatig in" },
];

const EMPTY_OBJECTS = [];

function Field({ label, htmlFor, required = false, hint = null, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required ? " *" : ""}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function WizardSteps({ stepIndex }) {
  return (
    <ol className="mb-5 flex items-center gap-1" aria-label="Voortgang contact toevoegen">
      {STEPS.map((step, index) => {
        const active = index === stepIndex;
        const completed = index < stepIndex;
        return (
          <React.Fragment key={step.key}>
            <li
              className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : completed
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "text-muted-foreground"
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? "bg-primary-foreground text-primary"
                    : completed
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "border border-muted-foreground/30 text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {completed ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={active ? "block" : "hidden sm:block"}>{step.label}</span>
            </li>
            {index < STEPS.length - 1 && (
              <li
                aria-hidden="true"
                className={`h-px min-w-3 flex-1 ${completed ? "bg-emerald-200 dark:bg-emerald-900" : "bg-border"}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function StepHeading({ title, description, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FunctionOption({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.key)}
      aria-pressed={selected}
      className={`flex min-h-[72px] w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/30"
        }`}
        aria-hidden="true"
      >
        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{option.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description}</span>
      </span>
    </button>
  );
}

function objectLabel(object) {
  return [object.object_code && `[${object.object_code}]`, object.name || "Naamloos object"]
    .filter(Boolean)
    .join(" ");
}

export function CustomerContactWizard({
  objects = EMPTY_OBJECTS,
  onSave,
  onCancel,
  saving = false,
  error = null,
}) {
  const fieldId = React.useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    first_name: "",
    name_prefix: "",
    last_name: "",
    email: "",
    phone: "",
  });
  const [selectedFunction, setSelectedFunction] = useState("");
  const [customFunction, setCustomFunction] = useState("");
  const [objectScope, setObjectScope] = useState("all");
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);

  const availableObjects = useMemo(
    () => objects.filter(object => object?.id),
    [objects],
  );
  const availableObjectIds = useMemo(
    () => new Set(availableObjects.map(object => object.id)),
    [availableObjects],
  );

  useEffect(() => {
    setSelectedObjectIds(current => {
      const next = current.filter(id => availableObjectIds.has(id));
      return next.length === current.length ? current : next;
    });
    if (availableObjects.length === 0) setObjectScope("all");
  }, [availableObjectIds, availableObjects.length]);

  const selectedJobTitle = selectedFunction === "other"
    ? customFunction.trim()
    : JOB_TITLE_OPTIONS.find(option => option.key === selectedFunction)?.label || "";
  const hasValidEmail = !form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const canContinue = [
    Boolean(form.first_name.trim() && form.last_name.trim()),
    Boolean(selectedJobTitle),
    Boolean((form.email.trim() || form.phone.trim()) && hasValidEmail),
    objectScope === "all" || selectedObjectIds.length > 0,
  ][stepIndex];
  const finalStep = stepIndex === STEPS.length - 1;

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const chooseScope = scope => {
    setObjectScope(scope);
    if (scope === "all") setSelectedObjectIds([]);
  };
  const toggleObject = objectId => {
    setSelectedObjectIds(current => (
      current.includes(objectId)
        ? current.filter(id => id !== objectId)
        : [...current, objectId]
    ));
  };

  const continueWizard = () => {
    if (!canContinue || saving) return;
    if (!finalStep) {
      setStepIndex(current => current + 1);
      return;
    }
    onSave?.({
      first_name: form.first_name.trim(),
      name_prefix: form.name_prefix.trim(),
      last_name: form.last_name.trim(),
      job_title: selectedJobTitle,
      email: form.email.trim(),
      phone: form.phone.trim(),
      object_scope: objectScope,
      object_ids: objectScope === "all"
        ? []
        : selectedObjectIds.filter(id => availableObjectIds.has(id)),
    });
  };

  const handleSubmit = event => {
    event.preventDefault();
    continueWizard();
  };

  return (
    <motion.section
      {...wizardRevealMotion}
      className="overflow-hidden border-b border-primary/30 bg-muted/20 p-4 sm:p-5"
      aria-labelledby="customer-contact-wizard-title"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Nieuw contact</p>
      <h2 id="customer-contact-wizard-title" className="sr-only">Contact toevoegen</h2>
      <WizardSteps stepIndex={stepIndex} />

      <form onSubmit={handleSubmit} noValidate>
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
                  title="Hoe heet de contactpersoon?"
                  description="Leg de naam vast zoals deze in communicatie en rapportages moet verschijnen."
                  icon={ContactRound}
                />
                <div className="grid gap-4 md:grid-cols-[1fr_140px_1fr]">
                  <Field label="Voornaam" htmlFor={`${fieldId}-first-name`} required>
                    <Input
                      id={`${fieldId}-first-name`}
                      value={form.first_name}
                      onChange={event => set("first_name", event.target.value)}
                      autoComplete="given-name"
                      autoFocus
                    />
                  </Field>
                  <Field label="Tussenvoegsel" htmlFor={`${fieldId}-name-prefix`}>
                    <Input
                      id={`${fieldId}-name-prefix`}
                      value={form.name_prefix}
                      onChange={event => set("name_prefix", event.target.value)}
                      autoComplete="additional-name"
                    />
                  </Field>
                  <Field label="Achternaam" htmlFor={`${fieldId}-last-name`} required>
                    <Input
                      id={`${fieldId}-last-name`}
                      value={form.last_name}
                      onChange={event => set("last_name", event.target.value)}
                      autoComplete="family-name"
                    />
                  </Field>
                </div>
              </>
            )}

            {stepIndex === 1 && (
              <>
                <StepHeading
                  title="Wat is de functie?"
                  description="Kies de functie die het beste aansluit. Staat deze er niet bij, kies dan Anders."
                  icon={BriefcaseBusiness}
                />
                {selectedFunction === "other" ? (
                  <div className="max-w-xl space-y-4 rounded-lg border border-primary/30 bg-card p-4">
                    <Field
                      label="Andere functie"
                      htmlFor={`${fieldId}-custom-function`}
                      required
                      hint="Gebruik de functienaam die de klant zelf hanteert."
                    >
                      <Input
                        id={`${fieldId}-custom-function`}
                        value={customFunction}
                        onChange={event => setCustomFunction(event.target.value)}
                        placeholder="Bijv. Hoofd technische dienst"
                        autoFocus
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedFunction("")}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Terug naar functies
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {JOB_TITLE_OPTIONS.map(option => (
                      <FunctionOption
                        key={option.key}
                        option={option}
                        selected={selectedFunction === option.key}
                        onSelect={setSelectedFunction}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {stepIndex === 2 && (
              <>
                <StepHeading
                  title="Hoe is deze contactpersoon bereikbaar?"
                  description="Vul minimaal één contactkanaal in. Beide kanalen blijven afzonderlijk opgeslagen."
                  icon={Mail}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="E-mailadres"
                    htmlFor={`${fieldId}-email`}
                    hint={!hasValidEmail ? "Vul een geldig e-mailadres in." : undefined}
                  >
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id={`${fieldId}-email`}
                        type="email"
                        value={form.email}
                        onChange={event => set("email", event.target.value)}
                        className={!hasValidEmail ? "border-destructive pl-9" : "pl-9"}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </Field>
                  <Field label="Telefoonnummer" htmlFor={`${fieldId}-phone`}>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id={`${fieldId}-phone`}
                        type="tel"
                        value={form.phone}
                        onChange={event => set("phone", event.target.value)}
                        className="pl-9"
                        autoComplete="tel"
                      />
                    </div>
                  </Field>
                </div>
                {!form.email.trim() && !form.phone.trim() && (
                  <p className="text-xs text-muted-foreground">E-mailadres of telefoonnummer is verplicht.</p>
                )}
              </>
            )}

            {stepIndex === 3 && (
              <>
                <StepHeading
                  title="Voor welke objecten is dit contact bevoegd?"
                  description="Klantbrede contacten verschijnen bij Alle en ieder object. Een beperkte selectie verschijnt alleen bij de gekozen objecten."
                  icon={MapPinned}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => chooseScope("all")}
                    aria-pressed={objectScope === "all"}
                    className={`flex min-h-[70px] items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                      objectScope === "all"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        objectScope === "all" ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}
                      aria-hidden="true"
                    >
                      {objectScope === "all" && <Check className="h-3 w-3 text-primary-foreground" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">Alle objecten</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Ook automatisch geldig voor later toegevoegde objecten.
                      </span>
                    </span>
                  </button>

                  {availableObjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => chooseScope("selected")}
                      aria-pressed={objectScope === "selected"}
                      className={`flex min-h-[70px] items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                        objectScope === "selected"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          objectScope === "selected" ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}
                        aria-hidden="true"
                      >
                        {objectScope === "selected" && <Check className="h-3 w-3 text-primary-foreground" />}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">Specifieke objecten</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Kies één of meerdere objecten van deze klant.
                        </span>
                      </span>
                    </button>
                  )}
                </div>

                {objectScope === "selected" && availableObjects.length > 0 && (
                  <fieldset className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Objecten kiezen
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {availableObjects.map(object => (
                        <label
                          key={object.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                            selectedObjectIds.includes(object.id)
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          <Checkbox
                            checked={selectedObjectIds.includes(object.id)}
                            onCheckedChange={() => toggleObject(object.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{objectLabel(object)}</span>
                            {(object.city || object.address) && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {object.city || object.address}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    {selectedObjectIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">Selecteer minimaal één object.</p>
                    )}
                  </fieldset>
                )}

                {availableObjects.length === 0 && (
                  <div className="rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                    Deze klant heeft nog geen objecten. Het contact wordt daarom klantbreed toegevoegd.
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <p>{error.message || "Het contact kon niet worden toegevoegd."}</p>
            {error.requestId && (
              <p className="mt-1 text-xs opacity-80">Referentie: {error.requestId}</p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {stepIndex === 0 ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Annuleren
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex(current => Math.max(0, current - 1))}
              disabled={saving}
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
          )}
          <Button type="submit" disabled={!canContinue || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : finalStep ? (
              <Check className="h-4 w-4" />
            ) : null}
            {saving
              ? "Contact opslaan..."
              : finalStep
                ? "Contact toevoegen"
                : <>Volgende <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </form>
    </motion.section>
  );
}

export default CustomerContactWizard;
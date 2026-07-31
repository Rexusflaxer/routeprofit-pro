import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ContactRound,
  Loader2,
  Phone,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVAILABILITY_OPTIONS,
  WARNING_RELATIONSHIP_OPTIONS,
  WEEKDAY_OPTIONS,
  warningRelationshipLabel,
} from "./objectWarningAddressConfig";

const STEPS = [
  { key: "contact", label: "Contact" },
  { key: "relationship", label: "Relatie" },
  { key: "phone", label: "Telefoon" },
  { key: "availability", label: "Belvolgorde" },
];

function WizardSteps({ stepIndex }) {
  return (
    <ol className="mb-5 flex items-center gap-1" aria-label="Voortgang waarschuwingsadres">
      {STEPS.map((step, index) => {
        const active = index === stepIndex;
        const completed = index < stepIndex;
        return (
          <React.Fragment key={step.key}>
            <li
              className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : completed
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "text-muted-foreground"
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${active ? "bg-primary-foreground text-primary" : completed ? "text-emerald-700" : "border border-muted-foreground/30"}`}>
                {completed ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={active ? "block" : "hidden sm:block"}>{step.label}</span>
            </li>
            {index < STEPS.length - 1 && <li aria-hidden="true" className={`h-px min-w-3 flex-1 ${completed ? "bg-emerald-200 dark:bg-emerald-900" : "bg-border"}`} />}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function StepHeading({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

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

function ChoiceCard({ selected, onClick, title, description = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[72px] w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}

function initialForm(initialValue, nextCallOrder) {
  const period = Array.isArray(initialValue?.not_call_periods) ? initialValue.not_call_periods[0] : null;
  return {
    contact_mode: initialValue ? "existing" : "new",
    contact_id: initialValue?.contact_id || "",
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    primary_phone: "",
    secondary_phone: "",
    primary_contact_point_id: initialValue?.primary_contact_point_id || "",
    secondary_contact_point_id: initialValue?.secondary_contact_point_id || "",
    relationship_type: initialValue?.relationship_type || "",
    relationship_label: initialValue?.relationship_label || "",
    call_order: initialValue?.call_order || nextCallOrder || 1,
    availability_mode: initialValue?.availability_mode || "always",
    not_call_periods: [{
      days: Array.isArray(period?.days) && period.days.length ? period.days : WEEKDAY_OPTIONS.map(day => day.key),
      start_time: period?.start_time || "22:00",
      end_time: period?.end_time || "07:00",
    }],
  };
}

function phonePoints(contact) {
  return (contact?.points || []).filter(point => ["phone", "mobile"].includes(point.point_type) && point.status === "active");
}

function isCallablePhone(value) {
  const normalized = String(value || "").trim();
  const digits = normalized.replace(/\D/g, "");
  return /^\+?[0-9\s()./-]+$/.test(normalized) && digits.length >= 7 && digits.length <= 15;
}

export default function ObjectWarningAddressWizard({
  mode = "create",
  initialValue = null,
  contactOptions = [],
  nextCallOrder = 1,
  onSave,
  onCancel,
  saving = false,
  error = null,
}) {
  const fieldId = React.useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => initialForm(initialValue, nextCallOrder));
  const [customRelationship, setCustomRelationship] = useState(
    initialValue?.relationship_type === "other" ? initialValue.relationship_label || "" : "",
  );
  const editing = mode === "edit";
  const selectedContact = useMemo(
    () => contactOptions.find(contact => contact.id === form.contact_id) || (initialValue ? {
      id: initialValue.contact_id,
      display_name: initialValue.display_name,
      job_title: initialValue.job_title,
      points: initialValue.contact_points || [],
    } : null),
    [contactOptions, form.contact_id, initialValue],
  );
  const availablePhones = phonePoints(selectedContact);
  const hasValidEmail = !form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const period = form.not_call_periods[0];
  const relationshipLabel = form.relationship_type === "other"
    ? customRelationship.trim()
    : WARNING_RELATIONSHIP_OPTIONS.find(option => option.key === form.relationship_type)?.label || "";
  const selectedPrimaryPhone = availablePhones.find(point => point.id === form.primary_contact_point_id)?.value;
  const hasPrimaryPhone = form.contact_mode === "new"
    ? isCallablePhone(form.primary_phone)
    : form.primary_contact_point_id
      ? isCallablePhone(selectedPrimaryPhone)
      : isCallablePhone(form.primary_phone);
  const hasValidSecondaryPhone = !form.secondary_phone.trim() || isCallablePhone(form.secondary_phone);
  const hasValidSelectedSecondary = !form.secondary_contact_point_id
    || availablePhones.some(point => point.id === form.secondary_contact_point_id);
  const hasAvailability = form.availability_mode === "always"
    || (period.days.length > 0 && period.start_time && period.end_time && period.start_time !== period.end_time);
  const canContinue = [
    editing
      ? Boolean(form.contact_id)
      : form.contact_mode === "existing"
        ? Boolean(form.contact_id)
        : Boolean(form.first_name.trim() && form.last_name.trim()),
    Boolean(relationshipLabel),
    hasPrimaryPhone && hasValidSecondaryPhone && hasValidSelectedSecondary && hasValidEmail,
    Number.isInteger(Number(form.call_order)) && Number(form.call_order) >= 1 && Number(form.call_order) <= 999 && hasAvailability,
  ][stepIndex];
  const finalStep = stepIndex === STEPS.length - 1;

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const chooseContact = contactId => {
    const contact = contactOptions.find(option => option.id === contactId);
    const phones = phonePoints(contact);
    setForm(current => ({
      ...current,
      contact_id: contactId,
      primary_contact_point_id: phones.find(point => point.is_primary)?.id || phones[0]?.id || "",
      secondary_contact_point_id: "",
      primary_phone: "",
    }));
  };
  const chooseRelationship = type => {
    set("relationship_type", type);
    if (type !== "other") set("relationship_label", WARNING_RELATIONSHIP_OPTIONS.find(option => option.key === type)?.label || "");
  };
  const toggleDay = day => {
    setForm(current => {
      const currentPeriod = current.not_call_periods[0];
      const days = currentPeriod.days.includes(day)
        ? currentPeriod.days.filter(value => value !== day)
        : [...currentPeriod.days, day];
      return { ...current, not_call_periods: [{ ...currentPeriod, days }] };
    });
  };
  const setPeriod = (field, value) => setForm(current => ({
    ...current,
    not_call_periods: [{ ...current.not_call_periods[0], [field]: value }],
  }));

  const continueWizard = () => {
    if (!canContinue || saving) return;
    if (!finalStep) {
      setStepIndex(current => current + 1);
      return;
    }
    onSave?.({
      ...form,
      relationship_label: relationshipLabel,
      call_order: Number(form.call_order),
      not_call_periods: form.availability_mode === "not_call_periods" ? form.not_call_periods : [],
    });
  };

  return (
    <section className="border-b border-primary/30 bg-muted/20 p-4 sm:p-5" aria-labelledby={`${fieldId}-title`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
        {editing ? "Waarschuwingsadres wijzigen" : "Nieuw waarschuwingsadres"}
      </p>
      <h2 id={`${fieldId}-title`} className="sr-only">{editing ? "Waarschuwingsadres wijzigen" : "Waarschuwingsadres toevoegen"}</h2>
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
                  icon={ContactRound}
                  title="Wie moet bij een melding worden gewaarschuwd?"
                  description="Koppel een bestaand klantcontact of maak een nieuw contact aan. Contactgegevens blijven centraal beheerd bij de klant."
                />
                {editing ? (
                  <div className="max-w-xl rounded-md border border-border bg-card px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{selectedContact?.display_name || initialValue?.display_name || "Contactpersoon"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">De gekoppelde persoon wijzig je vanuit de klanttab Contacten.</p>
                  </div>
                ) : (
                  <>
                    {contactOptions.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ChoiceCard selected={form.contact_mode === "new"} onClick={() => set("contact_mode", "new")} title="Nieuw contact" description="Maak een nieuwe contactpersoon aan voor deze klant." />
                        <ChoiceCard selected={form.contact_mode === "existing"} onClick={() => set("contact_mode", "existing")} title="Bestaand contact" description="Gebruik een contactpersoon die al bij de klant staat." />
                      </div>
                    )}
                    {form.contact_mode === "existing" && contactOptions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {contactOptions.map(contact => (
                          <ChoiceCard
                            key={contact.id}
                            selected={form.contact_id === contact.id}
                            onClick={() => chooseContact(contact.id)}
                            title={contact.display_name || "Naamloos contact"}
                            description={contact.job_title || `${phonePoints(contact).length} telefoonnummer${phonePoints(contact).length === 1 ? "" : "s"}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-[1fr_140px_1fr]">
                        <Field label="Voornaam" htmlFor={`${fieldId}-first-name`} required><Input id={`${fieldId}-first-name`} value={form.first_name} onChange={event => set("first_name", event.target.value)} autoComplete="given-name" autoFocus /></Field>
                        <Field label="Tussenvoegsel" htmlFor={`${fieldId}-middle-name`}><Input id={`${fieldId}-middle-name`} value={form.middle_name} onChange={event => set("middle_name", event.target.value)} autoComplete="additional-name" /></Field>
                        <Field label="Achternaam" htmlFor={`${fieldId}-last-name`} required><Input id={`${fieldId}-last-name`} value={form.last_name} onChange={event => set("last_name", event.target.value)} autoComplete="family-name" /></Field>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {stepIndex === 1 && (
              <>
                <StepHeading icon={ShieldAlert} title="Wat is de relatie tot het object?" description="Deze rol helpt de centralist direct begrijpen waarom deze persoon wordt gebeld." />
                {form.relationship_type === "other" ? (
                  <div className="max-w-xl space-y-4 rounded-lg border border-primary/30 bg-card p-4">
                    <Field label="Andere relatie" htmlFor={`${fieldId}-custom-relationship`} required>
                      <Input id={`${fieldId}-custom-relationship`} value={customRelationship} onChange={event => setCustomRelationship(event.target.value)} placeholder="Bijv. Technische achterwacht" autoFocus />
                    </Field>
                    <Button type="button" variant="outline" size="sm" onClick={() => { set("relationship_type", ""); setCustomRelationship(""); }}><ArrowLeft className="h-3.5 w-3.5" /> Terug naar rollen</Button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {WARNING_RELATIONSHIP_OPTIONS.map(option => (
                      <ChoiceCard key={option.key} selected={form.relationship_type === option.key} onClick={() => chooseRelationship(option.key)} title={option.label} description={option.description} />
                    ))}
                  </div>
                )}
              </>
            )}

            {stepIndex === 2 && (
              <>
                <StepHeading icon={Phone} title="Op welke nummers is deze persoon bereikbaar?" description="Het primaire nummer wordt als eerste gebruikt. Een alternatief nummer is optioneel." />
                {form.contact_mode === "existing" && availablePhones.length > 0 ? (
                  <div className="space-y-4">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primair telefoonnummer *</legend>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {availablePhones.map(point => <ChoiceCard key={point.id} selected={form.primary_contact_point_id === point.id} onClick={() => { set("primary_contact_point_id", point.id); if (form.secondary_contact_point_id === point.id) set("secondary_contact_point_id", ""); }} title={point.value} description={point.label || (point.point_type === "mobile" ? "Mobiel" : "Telefoon")} />)}
                      </div>
                    </fieldset>
                    {availablePhones.filter(point => point.id !== form.primary_contact_point_id).length > 0 && (
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alternatief nummer</legend>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          <ChoiceCard selected={!form.secondary_contact_point_id} onClick={() => set("secondary_contact_point_id", "")} title="Geen alternatief nummer" />
                          {availablePhones.filter(point => point.id !== form.primary_contact_point_id).map(point => <ChoiceCard key={point.id} selected={form.secondary_contact_point_id === point.id} onClick={() => set("secondary_contact_point_id", point.id)} title={point.value} description={point.label || "Telefoon"} />)}
                        </div>
                      </fieldset>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Primair telefoonnummer" htmlFor={`${fieldId}-primary-phone`} required hint={!hasPrimaryPhone && form.primary_phone.trim() ? "Vul een geldig telefoonnummer met 7 tot 15 cijfers in." : form.contact_mode === "existing" ? "Dit nummer wordt aan het bestaande klantcontact toegevoegd." : null}>
                      <Input id={`${fieldId}-primary-phone`} type="tel" value={form.primary_phone} onChange={event => setForm(current => ({ ...current, primary_phone: event.target.value, ...(current.contact_mode === "existing" ? { primary_contact_point_id: "" } : {}) }))} className={!hasPrimaryPhone && form.primary_phone.trim() ? "border-destructive" : ""} aria-invalid={!hasPrimaryPhone && Boolean(form.primary_phone.trim())} autoComplete="tel" autoFocus />
                    </Field>
                    {form.contact_mode === "new" && <Field label="Alternatief telefoonnummer" htmlFor={`${fieldId}-secondary-phone`} hint={!hasValidSecondaryPhone ? "Vul een geldig telefoonnummer met 7 tot 15 cijfers in." : null}><Input id={`${fieldId}-secondary-phone`} type="tel" value={form.secondary_phone} onChange={event => set("secondary_phone", event.target.value)} className={!hasValidSecondaryPhone ? "border-destructive" : ""} aria-invalid={!hasValidSecondaryPhone} /></Field>}
                    {form.contact_mode === "new" && <Field label="E-mailadres" htmlFor={`${fieldId}-email`} hint={!hasValidEmail ? "Vul een geldig e-mailadres in." : "Optioneel; wordt als afzonderlijk contactkanaal opgeslagen."}><Input id={`${fieldId}-email`} type="email" value={form.email} onChange={event => set("email", event.target.value)} className={!hasValidEmail ? "border-destructive" : ""} autoComplete="email" /></Field>}
                  </div>
                )}
              </>
            )}

            {stepIndex === 3 && (
              <>
                <StepHeading icon={Clock3} title="Wanneer en in welke volgorde mag er worden gebeld?" description="Een lager nummer wordt eerder gebeld. Niet-bellenperioden voorkomen ongewenste oproepen buiten de afspraak." />
                <div className="max-w-xs">
                  <Field label="Belvolgorde" htmlFor={`${fieldId}-call-order`} required hint="Bij gelijke nummers sorteert LOQ op naam.">
                    <Input id={`${fieldId}-call-order`} type="number" min="1" max="999" value={form.call_order} onChange={event => set("call_order", event.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABILITY_OPTIONS.map(option => <ChoiceCard key={option.key} selected={form.availability_mode === option.key} onClick={() => set("availability_mode", option.key)} title={option.label} description={option.description} />)}
                </div>
                {form.availability_mode === "not_call_periods" && (
                  <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dagen *</legend>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAY_OPTIONS.map(day => (
                          <button key={day.key} type="button" aria-pressed={period.days.includes(day.key)} onClick={() => toggleDay(day.key)} className={`min-w-10 rounded-md border px-3 py-2 text-xs font-medium ${period.days.includes(day.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{day.shortLabel}</button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Niet bellen vanaf" htmlFor={`${fieldId}-not-call-start`} required><Input id={`${fieldId}-not-call-start`} type="time" value={period.start_time} onChange={event => setPeriod("start_time", event.target.value)} /></Field>
                      <Field label="Niet bellen tot" htmlFor={`${fieldId}-not-call-end`} required><Input id={`${fieldId}-not-call-end`} type="time" value={period.end_time} onChange={event => setPeriod("end_time", event.target.value)} /></Field>
                    </div>
                    <p className="text-xs text-muted-foreground">Een tijdvak mag over middernacht lopen, bijvoorbeeld 22:00 tot 07:00.</p>
                  </div>
                )}
                <div className="rounded-md border border-border bg-card px-3 py-2.5 text-sm">
                  <span className="font-medium">{selectedContact?.display_name || [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ")}</span>
                  <span className="text-muted-foreground"> · {warningRelationshipLabel({ relationship_type: form.relationship_type, relationship_label: relationshipLabel })} · nummer {form.call_order} in de belvolgorde</span>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <p>{error.message || "Het waarschuwingsadres kon niet worden opgeslagen."}</p>
            {error.requestId && <p className="mt-1 text-xs opacity-80">Referentie: {error.requestId}</p>}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {stepIndex === 0 ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setStepIndex(current => Math.max(0, current - 1))} disabled={saving}><ArrowLeft className="h-4 w-4" /> Terug</Button>
          )}
          <Button type="submit" disabled={!canContinue || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}
            {saving ? "Opslaan..." : finalStep ? (editing ? "Wijzigingen opslaan" : "Waarschuwingsadres toevoegen") : <>Volgende <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </form>
    </section>
  );
}

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  Factory,
  Loader2,
  LockKeyhole,
  RadioTower,
  RotateCcw,
  ShieldX,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import { ChoiceCard, Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import {
  INSTALLATION_BRANDS,
  INSTALLATION_CREDENTIAL_FIELDS,
  INSTALLATION_LIFECYCLE_OPTIONS,
  INSTALLATION_OPERATIONAL_OPTIONS,
  INSTALLATION_TYPES,
  installationCredentialLabel,
  installationTypeLabel,
} from "./objectInstallationConfig";

const STEPS = [
  { key: "type", label: "Soort" },
  { key: "identity", label: "Identificatie" },
  { key: "operation", label: "Doormelding & codes" },
  { key: "management", label: "Beheer & controle" },
];

function initialForm(value) {
  return {
    installation_type: value?.installation_type || "",
    custom_type: value?.custom_type || "",
    name: value?.name || "",
    brand: value?.brand || "",
    model: value?.model || "",
    serial_number: value?.serial_number || "",
    external_reference: value?.external_reference || "",
    control_panel_location: value?.control_panel_location || "",
    monitoring_connected: value?.monitoring_connected === true,
    monitoring_provider_name: value?.monitoring_provider_name || "",
    monitoring_connection_reference: value?.monitoring_connection_reference || "",
    installer_name: value?.installer_name || "",
    installer_phone: value?.installer_phone || "",
    commissioned_on: value?.commissioned_on || "",
    last_tested_on: value?.last_tested_on || "",
    next_maintenance_on: value?.next_maintenance_on || "",
    lifecycle_status: value?.lifecycle_status || "active",
    operational_status: value?.operational_status || "unknown",
    credentials: {},
    credentials_to_revoke: [],
  };
}

function Summary({ label, children }) {
  return <div className="rounded-xl border border-border/70 bg-card/45 px-3.5 py-3 shadow-sm backdrop-blur-xl"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 text-sm">{children}</div></div>;
}

function CredentialField({ definition, value, onChange, alreadySet, revoked, onToggleRevoke }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={definition.label} htmlFor={`installation-${definition.key}`} hint={revoked ? "Deze code wordt na opslaan veilig ingetrokken en als wijziging gelogd." : alreadySet && !value ? "Er is al een code ingesteld. Laat leeg om deze ongewijzigd te bewaren." : definition.description}>
      <div className={`space-y-2 rounded-xl border p-3 shadow-sm backdrop-blur-xl ${revoked ? "border-destructive/35 bg-destructive/5" : "border-border/70 bg-card/35"}`}>
        <div className="relative">
          <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id={`installation-${definition.key}`} type={visible ? "text" : "password"} value={value || ""} onChange={event => onChange(event.target.value)} disabled={revoked} className="pl-9 pr-10" autoComplete="new-password" placeholder={revoked ? "Code wordt ingetrokken" : alreadySet ? "Bestaande code behouden" : "Optioneel"} maxLength={128} />
          <button type="button" disabled={revoked} onClick={() => setVisible(current => !current)} aria-label={visible ? "Code verbergen" : "Code tonen"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        {alreadySet && <Button type="button" variant="ghost" size="sm" aria-pressed={revoked} onClick={() => { setVisible(false); onToggleRevoke(); }} className={revoked ? "h-8 text-xs text-muted-foreground" : "h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"}>{revoked ? <RotateCcw className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}{revoked ? "Intrekken ongedaan maken" : `${definition.label} intrekken`}</Button>}
      </div>
    </Field>
  );
}

export default function ObjectInstallationWizard({ installation = null, onCancel, onSave, saving, error }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => initialForm(installation));
  const knownBrands = INSTALLATION_BRANDS[form.installation_type] || [];
  const [customBrand, setCustomBrand] = useState(Boolean(installation?.brand && !knownBrands.includes(installation.brand)));
  const credentialFields = INSTALLATION_CREDENTIAL_FIELDS[form.installation_type] || [];
  const existingCredentialTypes = installation?.credential_types || [];
  const selectedCredentialTypes = Object.entries(form.credentials).filter(([, value]) => String(value || "").trim()).map(([key]) => key);
  const revokedCredentialTypes = form.credentials_to_revoke || [];
  const allowedCredentialTypes = credentialFields.map(definition => definition.key);
  const effectiveCredentialTypes = [...new Set([
    ...existingCredentialTypes.filter(type => allowedCredentialTypes.includes(type) && !revokedCredentialTypes.includes(type)),
    ...selectedCredentialTypes,
  ])];
  const datesValid = (!form.last_tested_on || !form.commissioned_on || form.last_tested_on >= form.commissioned_on)
    && (!form.next_maintenance_on || !form.commissioned_on || form.next_maintenance_on >= form.commissioned_on)
    && (!form.next_maintenance_on || !form.last_tested_on || form.next_maintenance_on >= form.last_tested_on);
  const canContinue = [
    Boolean(form.installation_type && (form.installation_type !== "other" || form.custom_type.trim())),
    Boolean(form.name.trim()),
    !form.monitoring_connected || Boolean(form.monitoring_provider_name.trim()),
    datesValid,
  ][stepIndex];
  const finalStep = stepIndex === STEPS.length - 1;
  const choiceOnlyStep = stepIndex === 0 && form.installation_type !== "other";
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const setCredential = (key, value) => setForm(current => ({
    ...current,
    credentials: { ...current.credentials, [key]: value },
    credentials_to_revoke: String(value || "").trim()
      ? current.credentials_to_revoke.filter(type => type !== key)
      : current.credentials_to_revoke,
  }));
  const toggleCredentialRevocation = key => setForm(current => {
    const revoked = current.credentials_to_revoke.includes(key);
    return {
      ...current,
      credentials: { ...current.credentials, [key]: "" },
      credentials_to_revoke: revoked
        ? current.credentials_to_revoke.filter(type => type !== key)
        : [...current.credentials_to_revoke, key],
    };
  });
  const chooseType = value => {
    setForm(current => ({ ...current, installation_type: value, custom_type: value === "other" ? current.custom_type : "", brand: "", credentials: {}, credentials_to_revoke: [] }));
    setCustomBrand(false);
    if (value !== "other") setStepIndex(1);
  };
  const submit = () => {
    if (!canContinue || saving) return;
    if (!finalStep) { setStepIndex(index => index + 1); return; }
    onSave({
      ...form,
      custom_type: form.installation_type === "other" ? form.custom_type.trim() : null,
      credentials: Object.fromEntries(Object.entries(form.credentials).map(([key, value]) => [key, String(value || "").trim()]).filter(([, value]) => value)),
      credentials_to_revoke: [...new Set(form.credentials_to_revoke)],
    });
  };

  return (
    <WizardPanel labelledBy="installation-wizard-title">
      <motion.div {...wizardRevealMotion}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{installation ? "Installatie wijzigen" : "Nieuwe installatie"}</p>
        <h2 id="installation-wizard-title" className="sr-only">{installation ? "Installatie wijzigen" : "Installatie toevoegen"}</h2>
        <WizardSteps stepIndex={stepIndex} steps={STEPS} label="Voortgang installatie toevoegen" />
        <form onSubmit={event => { event.preventDefault(); submit(); }} noValidate>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={STEPS[stepIndex].key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="space-y-5">
              {stepIndex === 0 && <>
                <StepHeading icon={BellRing} title="Welke installatie staat op dit object?" description="Kies het functionele systeem. Technische zones en uitgebreide onderhoudshistorie kunnen later per installatie worden aangevuld." />
                <div className="grid grid-cols-1 gap-2">{INSTALLATION_TYPES.map(option => <ChoiceCard key={option.value} selected={form.installation_type === option.value} onClick={() => chooseType(option.value)} title={option.label} description={option.description} />)}</div>
                {form.installation_type === "other" && <div className="max-w-xl"><Field label="Omschrijving installatietype" htmlFor="installation-custom-type" required><Input id="installation-custom-type" value={form.custom_type} onChange={event => set("custom_type", event.target.value)} autoFocus placeholder="Bijv. mistgeneratorbesturing" /></Field></div>}
              </>}

              {stepIndex === 1 && <>
                <StepHeading icon={Factory} title="Hoe herkennen we deze installatie?" description="Gebruik de naam en paneellocatie die een centralist of surveillant tijdens een melding direct begrijpt." />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Installatienaam" htmlFor="installation-name" required><Input id="installation-name" value={form.name} onChange={event => set("name", event.target.value)} placeholder="Bijv. Hoofdcentrale begane grond" autoFocus /></Field>
                  <Field label="Locatie centrale of paneel" htmlFor="installation-location"><Input id="installation-location" value={form.control_panel_location} onChange={event => set("control_panel_location", event.target.value)} placeholder="Bijv. Receptie, kast links van entree" /></Field>
                </div>
                {customBrand ? <div className="max-w-xl space-y-3 rounded-xl border border-primary/30 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><Field label="Merk" htmlFor="installation-custom-brand"><Input id="installation-custom-brand" value={form.brand} onChange={event => set("brand", event.target.value)} autoFocus /></Field><Button type="button" variant="outline" size="sm" onClick={() => { setCustomBrand(false); set("brand", ""); }}>Terug naar merken</Button></div>
                  : <div className="grid grid-cols-1 gap-2">{knownBrands.map(brand => <ChoiceCard key={brand} selected={form.brand === brand} onClick={() => set("brand", brand)} title={brand} />)}<ChoiceCard selected={false} onClick={() => { setCustomBrand(true); set("brand", ""); }} title="Ander merk" description="Vul het merk handmatig in." /></div>}
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Model" htmlFor="installation-model"><Input id="installation-model" value={form.model} onChange={event => set("model", event.target.value)} /></Field>
                  <Field label="Serienummer" htmlFor="installation-serial"><Input id="installation-serial" value={form.serial_number} onChange={event => set("serial_number", event.target.value)} /></Field>
                  <Field label="Externe referentie" htmlFor="installation-reference" hint="Bijv. referentie van installateur of overgenomen beveiligingsbedrijf."><Input id="installation-reference" value={form.external_reference} onChange={event => set("external_reference", event.target.value)} /></Field>
                </div>
              </>}

              {stepIndex === 2 && <>
                <StepHeading icon={RadioTower} title="Is de installatie doorgemeld en hoe wordt deze bediend?" description="De aansluitreferentie is gewone objectmetadata. Bedieningscodes worden afzonderlijk versleuteld en verschijnen nooit in tabellen, zoekresultaten of het logboek." />
                <div className="grid grid-cols-1 gap-2"><ChoiceCard selected={!form.monitoring_connected} onClick={() => set("monitoring_connected", false)} title="Niet doorgemeld" description="Geen PAC, meldkamer of externe monitoring gekoppeld." /><ChoiceCard selected={form.monitoring_connected} onClick={() => set("monitoring_connected", true)} title="Wel doorgemeld" description="Leg provider en aansluitreferentie vast." /></div>
                {form.monitoring_connected && <div className="grid gap-4 md:grid-cols-2"><Field label="Meldkamer of provider" htmlFor="installation-provider" required><Input id="installation-provider" value={form.monitoring_provider_name} onChange={event => set("monitoring_provider_name", event.target.value)} placeholder="Bijv. PAC / alarmcentrale" autoFocus /></Field><Field label="Aansluitreferentie" htmlFor="installation-monitoring-reference"><Input id="installation-monitoring-reference" value={form.monitoring_connection_reference} onChange={event => set("monitoring_connection_reference", event.target.value)} placeholder="Geen schakel- of verificatiecode" /></Field></div>}
                {credentialFields.length > 0 && <div className="space-y-4 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 shadow-sm backdrop-blur-xl dark:border-amber-900/70 dark:bg-amber-950/25"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" /><div><p className="text-sm font-semibold">Beveiligde bedieningscodes</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Leg alleen codes vast die operationeel noodzakelijk zijn. Bestaande codes worden niet teruggelezen in deze wizard.</p></div></div><div className="grid gap-4 md:grid-cols-2">{credentialFields.map(definition => <CredentialField key={definition.key} definition={definition} value={form.credentials[definition.key]} onChange={value => setCredential(definition.key, value)} alreadySet={existingCredentialTypes.includes(definition.key)} revoked={revokedCredentialTypes.includes(definition.key)} onToggleRevoke={() => toggleCredentialRevocation(definition.key)} />)}</div></div>}
              </>}

              {stepIndex === 3 && <>
                <StepHeading icon={Wrench} title="Wie beheert de installatie en wat is de actuele toestand?" description="Onderhoudsdata zijn operationele signalen; ze vervangen geen certificaat, onderhoudsrapport of formeel installatielogboek." />
                <div className="grid gap-4 md:grid-cols-2"><Field label="Installateur / onderhoudspartij" htmlFor="installation-installer"><Input id="installation-installer" value={form.installer_name} onChange={event => set("installer_name", event.target.value)} /></Field><Field label="Telefoon onderhoudspartij" htmlFor="installation-installer-phone"><Input id="installation-installer-phone" type="tel" value={form.installer_phone} onChange={event => set("installer_phone", event.target.value)} /></Field></div>
                <div className="grid gap-4 md:grid-cols-3"><Field label="In bedrijf sinds" htmlFor="installation-commissioned"><Input id="installation-commissioned" type="date" value={form.commissioned_on} onChange={event => set("commissioned_on", event.target.value)} /></Field><Field label="Laatst getest" htmlFor="installation-tested"><Input id="installation-tested" type="date" value={form.last_tested_on} onChange={event => set("last_tested_on", event.target.value)} /></Field><Field label="Volgend onderhoud" htmlFor="installation-maintenance" hint={!datesValid ? "De datums moeten in de volgorde inbedrijfstelling, test en onderhoud liggen." : null}><Input id="installation-maintenance" type="date" value={form.next_maintenance_on} onChange={event => set("next_maintenance_on", event.target.value)} aria-invalid={!datesValid} className={!datesValid ? "border-destructive" : ""} /></Field></div>
                <div className="grid gap-4 md:grid-cols-2"><Field label="Levenscyclus" htmlFor="installation-lifecycle"><Select value={form.lifecycle_status} onValueChange={value => set("lifecycle_status", value)}><SelectTrigger id="installation-lifecycle"><SelectValue /></SelectTrigger><SelectContent>{INSTALLATION_LIFECYCLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Operationele toestand" htmlFor="installation-operational"><Select value={form.operational_status} onValueChange={value => set("operational_status", value)}><SelectTrigger id="installation-operational"><SelectValue /></SelectTrigger><SelectContent>{INSTALLATION_OPERATIONAL_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field></div>
                <div className="grid gap-3 md:grid-cols-2"><Summary label="Installatie"><p className="font-medium">{form.name || "Naam ontbreekt"}</p><p className="mt-0.5 text-xs text-muted-foreground">{installationTypeLabel(form)}{form.brand ? ` · ${form.brand}` : ""}{form.model ? ` ${form.model}` : ""}</p></Summary><Summary label="Doormelding en codes"><p>{form.monitoring_connected ? form.monitoring_provider_name : "Niet doorgemeld"}</p><p className="mt-0.5 text-xs text-muted-foreground">{effectiveCredentialTypes.length ? effectiveCredentialTypes.map(installationCredentialLabel).join(", ") : "Geen bedieningscodes ingesteld"}{revokedCredentialTypes.length ? ` · ${revokedCredentialTypes.map(installationCredentialLabel).join(", ")} wordt ingetrokken` : ""}</p></Summary></div>
                <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-4 text-xs text-muted-foreground shadow-sm backdrop-blur-xl"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Na opslaan staat alleen veilige metadata in de tabel. Codes worden versleuteld opgeslagen en wijzigingen verschijnen in het objectlogboek zonder codewaarde.</p></div>
              </>}
            </motion.div>
          </AnimatePresence>
          {error && <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert"><p>{error.message || "De installatie kon niet worden opgeslagen."}</p>{error.requestId && <p className="mt-1 text-xs opacity-80">Referentie: {error.requestId}</p>}</div>}
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-between">{stepIndex === 0 ? <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button> : <Button type="button" variant="outline" onClick={() => setStepIndex(index => index - 1)} disabled={saving}><ArrowLeft className="h-4 w-4" /> Terug</Button>}{!choiceOnlyStep && <Button type="submit" disabled={!canContinue || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}{saving ? "Opslaan..." : finalStep ? (installation ? "Wijzigingen opslaan" : "Installatie toevoegen") : <>Volgende <ArrowRight className="h-4 w-4" /></>}</Button>}</div>
        </form>
      </motion.div>
    </WizardPanel>
  );
}
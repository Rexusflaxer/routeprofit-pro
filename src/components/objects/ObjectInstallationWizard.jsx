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
  Loader2,
  LockKeyhole,
  RadioTower,
  RotateCcw,
  Search,
  ShieldX,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { wizardRevealMotion } from "@/components/ui-custom/wizardMotion";
import { ChoiceCard, Field, StepHeading, WizardPanel, WizardSteps } from "./ObjectWizardUi";
import {
  INSTALLATION_CREDENTIAL_FIELDS,
  INSTALLATION_LIFECYCLE_OPTIONS,
  INSTALLATION_OPERATIONAL_OPTIONS,
  INSTALLATION_TYPES,
  filterInstallationBrandOptions,
  findInstallationBrandOption,
  installationBrandOptions,
  installationCredentialLabel,
  installationTypeLabel,
} from "./objectInstallationConfig";

const STEPS = [
  { key: "type", label: "Soort" },
  { key: "brand", label: "Merk" },
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

function InstallationBrandLogo({ option }) {
  const [failed, setFailed] = useState(false);
  const initials = option.label.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const dark = option.logoBackground === "dark";

  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border px-2 py-1.5 shadow-sm ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white"}`}
    >
      {option.logoSrc && !failed
        ? <img src={option.logoSrc} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-contain" />
        : <span className={`text-xs font-bold tracking-wide ${dark ? "text-white" : "text-slate-700"}`}>{initials}</span>}
    </span>
  );
}

function InstallationBrandChoices({ options, selectedBrand, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {options.map(option => (
        <ChoiceCard
          key={option.value}
          selected={selectedBrand?.value === option.value}
          onClick={() => onSelect(option)}
          title={option.label}
          description={option.note || option.productFamilies.slice(0, 3).join(" · ")}
          leading={option.logoSrc ? <InstallationBrandLogo option={option} /> : null}
          className="min-h-16"
        />
      ))}
    </div>
  );
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
  const [brandSearch, setBrandSearch] = useState("");
  const knownBrands = installationBrandOptions(form.installation_type);
  const selectedBrand = findInstallationBrandOption(form.installation_type, form.brand);
  const visibleBrands = filterInstallationBrandOptions(form.installation_type, brandSearch);
  const [customBrand, setCustomBrand] = useState(Boolean(installation?.brand && !findInstallationBrandOption(installation.installation_type, installation.brand)));
  const customBrandMatch = customBrand ? selectedBrand : null;
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
    Boolean(form.brand.trim() && !customBrandMatch),
    !form.monitoring_connected || Boolean(form.monitoring_provider_name.trim()),
    datesValid,
  ][stepIndex];
  const finalStep = stepIndex === STEPS.length - 1;
  const choiceOnlyStep = (stepIndex === 0 && form.installation_type !== "other")
    || (stepIndex === 1 && !customBrand);
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
    const typeChanged = form.installation_type !== value;
    setForm(current => ({
      ...current,
      installation_type: value,
      custom_type: value === "other" ? current.custom_type : "",
      brand: typeChanged ? "" : current.brand,
      credentials: typeChanged ? {} : current.credentials,
      credentials_to_revoke: typeChanged ? [] : current.credentials_to_revoke,
    }));
    setBrandSearch("");
    setCustomBrand(typeChanged ? false : Boolean(form.brand && !findInstallationBrandOption(value, form.brand)));
    if (value !== "other") setStepIndex(1);
  };
  const chooseBrand = option => {
    const originalBrandOption = findInstallationBrandOption(installation?.installation_type, installation?.brand);
    const preserveOriginalBrand = installation?.installation_type === form.installation_type
      && originalBrandOption?.value === option.value;
    const brand = preserveOriginalBrand ? installation.brand : option.value;
    setForm(current => ({
      ...current,
      brand,
      name: installation ? current.name : `${installationTypeLabel(current)} ${brand}`.trim(),
    }));
    setStepIndex(2);
  };
  const setCustomBrandValue = value => setForm(current => ({
    ...current,
    brand: value,
    name: installation ? current.name : `${installationTypeLabel(current)} ${value}`.trim(),
  }));
  const submit = () => {
    if (!canContinue || saving) return;
    if (!finalStep) { setStepIndex(index => index + 1); return; }
    onSave({
      ...form,
      name: form.name.trim() || `${installationTypeLabel(form)} ${form.brand}`.trim(),
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
                <StepHeading title="Van welk merk is de installatie?" description="Kies het merk dat op de centrale staat. Zoeken kan ook op een productlijn, zoals Galaxy, ATS, SPC of AlphaVision." />
                {customBrand ? <div className="max-w-xl space-y-3 rounded-xl border border-primary/30 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><Field label="Merk" htmlFor="installation-custom-brand" hint={customBrandMatch ? `Dit merk is al bekend als ${customBrandMatch.label}. Kies de officiële merkoptie om verder te gaan.` : null}><Input id="installation-custom-brand" value={form.brand} onChange={event => setCustomBrandValue(event.target.value)} autoFocus aria-invalid={Boolean(customBrandMatch)} /></Field>{customBrandMatch && <ChoiceCard selected={false} onClick={() => chooseBrand(customBrandMatch)} title={`Gebruik ${customBrandMatch.label}`} description={customBrandMatch.productFamilies.slice(0, 3).join(" · ")} leading={customBrandMatch.logoSrc ? <InstallationBrandLogo option={customBrandMatch} /> : null} />}<Button type="button" variant="outline" size="sm" onClick={() => { setCustomBrand(false); set("brand", ""); }}>Terug naar merken</Button></div>
                  : <div className="space-y-4">
                    {knownBrands.length > 8 && <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={brandSearch} onChange={event => setBrandSearch(event.target.value)} aria-label="Zoek merk of productlijn" placeholder="Zoek merk of productlijn" className="bg-card/60 pl-9 backdrop-blur-xl" /></div>}
                    <p className="sr-only" aria-live="polite">{visibleBrands.length} {visibleBrands.length === 1 ? "merk gevonden" : "merken gevonden"}</p>
                    {visibleBrands.length > 0 && <section aria-labelledby="current-installation-brands"><p id="current-installation-brands" className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actuele en ondersteunde merken</p><InstallationBrandChoices options={visibleBrands} selectedBrand={selectedBrand} onSelect={chooseBrand} /></section>}
                    {visibleBrands.length === 0 && brandSearch.trim() && <div className="rounded-xl border border-dashed border-border bg-card/35 px-4 py-5 text-sm text-muted-foreground">Geen bekend merk of productlijn gevonden voor “{brandSearch.trim()}”. Je kunt het merk hieronder zelf invullen.</div>}
                    <ChoiceCard selected={customBrand} onClick={() => { setCustomBrand(true); setBrandSearch(""); set("brand", ""); }} title="Ander merk" description="Vul het merk handmatig in." />
                  </div>}
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
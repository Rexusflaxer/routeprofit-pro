import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FlaskConical,
  PenLine,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getObjectModuleDefinition,
  normalizeObjectModuleConfiguration,
  objectModuleLabel,
} from "./objectModuleConfig";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const PREVIEW_COPY = {
  visitor_registration: {
    eyebrow: "Receptie",
    title: "Bezoeker aanmelden",
    description: "Test de registratie zoals een beveiliger die tijdens de dienst ziet.",
    action: "Aanmelding testen",
  },
  item_issuance: {
    eyebrow: "Uitgiftebalie",
    title: "Middel uitgeven",
    description: "Selecteer een middel en ontvanger om de bevoegdheid direct te controleren.",
    action: "Uitgifte testen",
  },
  mail_package_receipt: {
    eyebrow: "Receptie",
    title: "Post of pakket ontvangen",
    description: "Doorloop de ontvangstregistratie met de actuele velden en keuzes.",
    action: "Ontvangst testen",
  },
  lost_and_found: {
    eyebrow: "Objectregistratie",
    title: "Gevonden voorwerp registreren",
    description: "Bekijk welke gegevens bij vondst en overdracht worden gevraagd.",
    action: "Registratie testen",
  },
  object_calendar: {
    eyebrow: "Objectagenda",
    title: "Afspraak of evenement plannen",
    description: "Test het formulier waarmee een operationele afspraak wordt vastgelegd.",
    action: "Afspraak testen",
  },
  action_points: {
    eyebrow: "Operationele opvolging",
    title: "Actiepunt toevoegen",
    description: "Bekijk hoe een beveiliger een actie vastlegt en overdraagt.",
    action: "Actiepunt testen",
  },
};

function minuteValue(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return Math.max(0, Math.min(1439, (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)));
}

function asDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? new Date() : result;
}

export function isObjectModuleWindowActive(window, moment = new Date()) {
  if (!window || window.status === "inactive") return false;
  const date = asDate(moment);
  const days = Array.isArray(window.days) ? window.days : [];
  if (!days.length) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minuteValue(window.start_time);
  const end = minuteValue(window.end_time);
  const today = DAY_KEYS[date.getDay()];
  if (start <= end) return days.includes(today) && now >= start && now <= end;

  const previous = DAY_KEYS[(date.getDay() + 6) % 7];
  return (days.includes(today) && now >= start) || (days.includes(previous) && now <= end);
}

export function isObjectModulePreviewValuePresent(field, value) {
  if (!field?.required) return true;
  if (field.field_type === "checkbox") return value === true;
  if (field.field_type === "multiselect") return Array.isArray(value) && value.length > 0;
  if (["photo", "signature"].includes(field.field_type)) return Boolean(value);
  return String(value ?? "").trim().length > 0;
}

function selectedWindowsActive(ids, windows, moment) {
  if (!Array.isArray(ids) || !ids.length) return true;
  const selected = new Set(ids);
  return windows.some(window => selected.has(window.id) && isObjectModuleWindowActive(window, moment));
}

function authorizationResult(code, detail, extras = {}) {
  const allowed = code === "allowed";
  return {
    allowed,
    code,
    label: allowed ? "Bevoegd" : code === "choose_item" ? "Kies een middel" : code === "choose_subject" ? "Kies een persoon of kamer" : code === "outside_window" ? "Buiten toegestaan tijdvenster" : code === "inactive_item" ? "Middel niet actief" : "Niet bevoegd",
    detail,
    ...extras,
  };
}

/**
 * Pure client-side simulation of the configured item-issuance decision.
 * Deny rules and direct denials always win. No data is written by this evaluator.
 */
export function evaluateItemIssuanceAccess({ configuration, itemId, subjectId, moment = new Date() }) {
  const config = normalizeObjectModuleConfiguration("item_issuance", configuration);
  const item = config.catalog_items.find(candidate => candidate.id === itemId);
  if (!item) return authorizationResult("choose_item", "Selecteer eerst een actief catalogusitem.");
  if (item.status === "inactive") return authorizationResult("inactive_item", "Dit middel is gedeactiveerd in de werkconfiguratie.", { item });

  const itemAvailable = selectedWindowsActive(item.availability_window_ids, config.availability_windows, moment);
  if (!itemAvailable) return authorizationResult("outside_window", "Het gekozen middel mag op dit testmoment niet worden uitgegeven.", { item });
  if (!subjectId) return authorizationResult("choose_subject", "Selecteer de persoon, medewerker, kamer of andere ontvanger.", { item });

  const activeRules = config.authorization_rules.filter(rule => rule.status !== "inactive");
  const matchingRules = activeRules.filter(rule => {
    const itemMatches = !rule.catalog_item_ids.length || rule.catalog_item_ids.includes(item.id);
    const subjectMatches = !rule.subject_entry_ids.length || rule.subject_entry_ids.includes(subjectId);
    const timeMatches = selectedWindowsActive(rule.availability_window_ids, config.availability_windows, moment);
    return itemMatches && subjectMatches && timeMatches;
  });
  const denyRule = matchingRules.find(rule => rule.effect === "deny");
  if (item.denied_reference_entry_ids.includes(subjectId)) {
    return authorizationResult("denied", "Deze ontvanger staat rechtstreeks op de weigerlijst van dit middel.", { item });
  }
  if (denyRule) {
    return authorizationResult("denied", denyRule.note || `Geweigerd door de regel ‘${denyRule.name}’.`, { item, rule: denyRule });
  }

  if (!item.requires_authorization) return authorizationResult("allowed", "Voor dit middel is geen afzonderlijke bevoegdheid vereist.", { item });
  if (item.eligibility_mode === "all") return authorizationResult("allowed", "Alle actieve ontvangers zijn voor dit middel toegestaan.", { item });
  if (item.allowed_reference_entry_ids.includes(subjectId)) return authorizationResult("allowed", "Deze ontvanger staat rechtstreeks op de toestemmingslijst.", { item });

  const allowRule = matchingRules.find(rule => rule.effect === "allow");
  if (allowRule) return authorizationResult("allowed", allowRule.note || `Toegestaan door de regel ‘${allowRule.name}’.`, { item, rule: allowRule });
  return authorizationResult("denied", "Er is op dit testmoment geen geldige toestemming voor deze combinatie.", { item });
}

function localDateTimeValue(date = new Date()) {
  const value = asDate(date);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function FieldChoice({ field, options, value, onChange }) {
  if (!options.length) return <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">Nog geen keuzes ingesteld.</div>;
  return <Select value={String(value || "")} onValueChange={onChange}>
    <SelectTrigger id={`preview-field-${field.id}`} className="bg-background/55"><SelectValue placeholder="Maak een keuze" /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

function PreviewField({ field, configuration, value, onChange }) {
  const list = configuration.reference_lists.find(candidate => candidate.id === field.reference_list_id);
  const options = list
    ? list.entries.filter(entry => entry.status !== "inactive").map(entry => ({ value: entry.id, label: entry.secondary_label ? `${entry.label} · ${entry.secondary_label}` : entry.label }))
    : field.options.map(option => ({ value: option, label: option }));
  const label = <Label htmlFor={`preview-field-${field.id}`} className="text-[11px] font-semibold">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>;

  if (field.field_type === "textarea") return <div className="space-y-1.5">{label}<Textarea id={`preview-field-${field.id}`} value={String(value || "")} onChange={event => onChange(event.target.value)} rows={3} placeholder={field.help_text || undefined} className="bg-background/55" /></div>;
  if (field.field_type === "select") return <div className="space-y-1.5">{label}<FieldChoice field={field} options={options} value={value} onChange={onChange} />{field.help_text && <p className="text-[10px] text-muted-foreground">{field.help_text}</p>}</div>;
  if (field.field_type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="space-y-1.5"><legend className="text-[11px] font-semibold">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</legend>{options.length ? <div className="grid gap-1.5">{options.map(option => <label key={option.value} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-xs"><Checkbox checked={selected.includes(option.value)} onCheckedChange={checked => onChange(checked === true ? [...selected, option.value] : selected.filter(item => item !== option.value))} />{option.label}</label>)}</div> : <p className="rounded-lg border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">Nog geen keuzes ingesteld.</p>}</fieldset>;
  }
  if (field.field_type === "checkbox") return <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-xs"><Checkbox checked={value === true} onCheckedChange={checked => onChange(checked === true)} /><span><span className="font-medium">{field.label}</span>{field.help_text && <span className="mt-0.5 block text-[10px] text-muted-foreground">{field.help_text}</span>}</span></label>;
  if (["photo", "signature"].includes(field.field_type)) {
    const Icon = field.field_type === "photo" ? Camera : PenLine;
    return <div className="space-y-1.5">{label}<Button type="button" variant="outline" className="w-full justify-start bg-background/45" onClick={() => onChange(value ? null : "simulated")}><Icon className="h-4 w-4" />{value ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Voorbeeld toegevoegd</> : field.field_type === "photo" ? "Foto simuleren" : "Handtekening simuleren"}</Button></div>;
  }
  const type = ["email", "number", "date", "time"].includes(field.field_type) ? field.field_type : field.field_type === "phone" ? "tel" : "text";
  return <div className="space-y-1.5">{label}<Input id={`preview-field-${field.id}`} type={type} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.help_text || undefined} className="bg-background/55" /></div>;
}

function AccessResult({ result }) {
  const pending = ["choose_item", "choose_subject"].includes(result.code);
  const Icon = result.allowed ? ShieldCheck : pending ? Clock3 : ShieldX;
  return <div aria-live="polite" className={`rounded-xl border p-3 ${result.allowed ? "border-emerald-300/60 bg-emerald-500/10" : pending ? "border-border/70 bg-muted/20" : "border-rose-300/60 bg-rose-500/10"}`}>
    <div className="flex items-start gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${result.allowed ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : pending ? "border-border bg-background/40 text-muted-foreground" : "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}><Icon className="h-4 w-4" /></span><div><p className="text-xs font-semibold">{result.label}</p><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{result.detail}</p></div></div>
  </div>;
}

export default function ObjectModuleLivePreview({ module, configuration, now = null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [values, setValues] = useState({});
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [testMoment, setTestMoment] = useState(() => localDateTimeValue(now || new Date()));
  const [tested, setTested] = useState(false);
  const moduleType = module?.module_type;
  const normalized = useMemo(() => normalizeObjectModuleConfiguration(moduleType, configuration), [configuration, moduleType]);
  const definition = getObjectModuleDefinition(moduleType);
  const copy = PREVIEW_COPY[moduleType] || { eyebrow: "Objectmodule", title: objectModuleLabel(module), description: "Test de actuele module-inrichting.", action: "Registratie testen" };
  const Icon = definition?.icon || FlaskConical;
  const enabledFields = normalized.field_definitions.filter(field => field.enabled).sort((left, right) => left.sequence - right.sequence);
  const activeItems = normalized.catalog_items.filter(item => item.status !== "inactive");
  const activeEntries = normalized.reference_lists.flatMap(list => list.entries.filter(entry => entry.status !== "inactive").map(entry => ({ ...entry, list_name: list.name, subject_type: list.subject_type })));

  useEffect(() => {
    if (selectedItemId && !activeItems.some(item => item.id === selectedItemId)) setSelectedItemId("");
  }, [activeItems, selectedItemId]);
  useEffect(() => {
    if (selectedSubjectId && !activeEntries.some(entry => entry.id === selectedSubjectId)) setSelectedSubjectId("");
  }, [activeEntries, selectedSubjectId]);
  useEffect(() => { setTested(false); }, [configuration, selectedItemId, selectedSubjectId, testMoment]);

  const issuanceResult = moduleType === "item_issuance"
    ? evaluateItemIssuanceAccess({ configuration: normalized, itemId: selectedItemId, subjectId: selectedSubjectId, moment: testMoment })
    : null;
  const updateValue = (field, value) => {
    setValues(current => ({ ...current, [field.id]: value }));
    setTested(false);
    if (moduleType === "item_issuance" && field.id === "issued_to") setSelectedSubjectId(String(value || ""));
  };
  const valueFor = field => moduleType === "item_issuance" && field.id === "issued_to" ? selectedSubjectId : values[field.id];
  const missingRequiredFields = enabledFields.filter(field => !isObjectModulePreviewValuePresent(field, valueFor(field)));
  const reset = () => {
    setValues({});
    setSelectedItemId("");
    setSelectedSubjectId("");
    setTestMoment(localDateTimeValue(now || new Date()));
    setTested(false);
  };
  const testDisabled = !enabledFields.length || missingRequiredFields.length > 0 || (moduleType === "item_issuance" && !issuanceResult?.allowed);

  return <aside className="min-w-0 xl:sticky xl:top-4" aria-label="Live modulevoorbeeld">
    <Collapsible open={mobileOpen} onOpenChange={setMobileOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" className="mb-3 w-full justify-between border-primary/25 bg-primary/5 xl:hidden" aria-label={mobileOpen ? "Modulevoorbeeld inklappen" : "Modulevoorbeeld openen"}>
          <span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /> Live voorbeeld & test</span>{mobileOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className={mobileOpen ? "block" : "hidden xl:block"}>
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.55)] ring-1 ring-border/50 backdrop-blur-2xl">
          <div className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-card/45 to-sky-500/5 p-4">
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-inner"><Icon className="h-4 w-4 text-primary" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{copy.eyebrow}</p><h3 className="mt-0.5 truncate text-sm font-semibold">{copy.title}</h3></div></div><Badge variant="outline" className="shrink-0 border-violet-300/60 bg-violet-500/10 text-[10px] text-violet-800 dark:text-violet-200">Live</Badge></div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{copy.description}</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-300/40 bg-violet-500/10 px-2.5 py-2 text-[11px] text-violet-900 dark:text-violet-100"><FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>Testmodus, niets opgeslagen.</strong> Wijzigingen uit de editor verschijnen hier direct.</span></div>
          </div>

          <div className="max-h-[calc(100vh-16rem)] space-y-4 overflow-y-auto p-4">
            {moduleType === "item_issuance" && <div className="space-y-3 rounded-xl border border-border/60 bg-background/25 p-3">
              <div className="space-y-1.5"><Label htmlFor="preview-catalog-item" className="text-[11px] font-semibold">Catalogusitem</Label>{activeItems.length ? <Select value={selectedItemId} onValueChange={setSelectedItemId}><SelectTrigger id="preview-catalog-item" className="bg-background/55"><SelectValue placeholder="Kies een middel" /></SelectTrigger><SelectContent>{activeItems.map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.code ? ` · ${item.code}` : ""}</SelectItem>)}</SelectContent></Select> : <div className="rounded-lg border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">Voeg in Catalogus & lijsten eerst een actief middel toe.</div>}</div>
              <div className="space-y-1.5"><Label htmlFor="preview-subject" className="text-[11px] font-semibold">Persoon, medewerker of kamer</Label>{activeEntries.length ? <Select value={selectedSubjectId} onValueChange={value => { setSelectedSubjectId(value); setValues(current => ({ ...current, issued_to: value })); }}><SelectTrigger id="preview-subject" className="bg-background/55"><SelectValue placeholder="Kies een ontvanger" /></SelectTrigger><SelectContent>{normalized.reference_lists.map(list => {
                const entries = list.entries.filter(entry => entry.status !== "inactive");
                if (!entries.length) return null;
                return <React.Fragment key={list.id}>{entries.map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.label} · {list.name}</SelectItem>)}</React.Fragment>;
              })}</SelectContent></Select> : <div className="rounded-lg border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">Voeg eerst een lijst met personen, medewerkers, kamers of ontvangers toe.</div>}</div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="space-y-1.5"><Label htmlFor="preview-test-moment" className="text-[11px] font-semibold">Testmoment</Label><Input id="preview-test-moment" type="datetime-local" value={testMoment} onChange={event => setTestMoment(event.target.value)} className="bg-background/55" /></div><Button type="button" variant="outline" size="sm" className="self-end" onClick={() => setTestMoment(localDateTimeValue(now || new Date()))}><Clock3 className="h-3.5 w-3.5" /> Nu</Button></div>
              <AccessResult result={issuanceResult} />
            </div>}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actieve registratievelden</p><Badge variant="secondary" className="text-[10px]">{enabledFields.length}</Badge></div>
              {enabledFields.length ? enabledFields.map(field => {
                if (moduleType === "item_issuance" && field.id === "issued_to") return <div key={field.id} className="rounded-lg border border-border/60 bg-background/25 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</span><span className="text-[10px] text-muted-foreground">Via ontvangerkeuze</span></div><p className="mt-1 truncate text-xs">{activeEntries.find(entry => entry.id === selectedSubjectId)?.label || "Nog niet gekozen"}</p></div>;
                return <PreviewField key={field.id} field={field} configuration={normalized} value={valueFor(field)} onChange={value => updateValue(field, value)} />;
              }) : <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">Activeer in de veldeditor minimaal één registratieveld.</div>}
            </div>

            {missingRequiredFields.length > 0 && <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Nog verplicht invullen:</strong> {missingRequiredFields.map(field => field.label).join(", ")}.</span></div>}
            {tested && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300/50 bg-emerald-500/10 p-3 text-xs"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span><strong>Test geslaagd.</strong> Deze simulatie is niet opgeslagen en heeft geen operationele registratie gemaakt.</span></div>}
            <div className="flex gap-2 border-t border-border/60 pt-4"><Button type="button" className="min-w-0 flex-1" onClick={() => setTested(true)} disabled={testDisabled}><Play className="h-3.5 w-3.5" /> {copy.action}</Button><Button type="button" variant="outline" size="icon" onClick={reset} aria-label="Testvoorbeeld herstellen"><RotateCcw className="h-3.5 w-3.5" /></Button></div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </aside>;
}

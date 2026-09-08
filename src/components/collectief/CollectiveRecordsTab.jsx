import React, { useRef, useState } from "react";
import { Archive, Eye, FileText, Loader2, Pencil, Plus, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useObjectModuleNavigationGuard } from "@/components/objects/useObjectModuleNavigationGuard";
import { CollectiveField, collectiveSelectClass } from "./CollectiefForm";
import { activeRecord, collectiveManagerId, COLLECTIVE_TABS } from "./collectiveDossierWorkflow";

const field = (key, label, type = "text", options) => ({ key, label, type, options });
export const COLLECTIVE_RECORD_FIELDS = {
  tasks: [
    field("task_type", "Soort taak", "select", { mobile_control_round: "Mobiele controleronde", reception_service: "Receptiedienst", fire_closing_round: "Brand- en sluitronde", opening_round: "Openingsronde", other: "Overig" }),
    field("execution_mode", "Uitvoering", "select", { round: "Ronde langs locaties", continuous: "Aaneengesloten bezetting", time_window: "Binnen een tijdvak", on_request: "Op verzoek" }),
    field("security_plan_id", "Beveiligingsplan", "security-plan"),
    field("requesting_customer_id", "Opdrachtgever (voorbereiding)", "customer"),
    field("target_scope", "Taak van toepassing op", "select", { collective: "Het collectief als geheel", objects: "Geselecteerde deelnemende objecten", buildings: "Geselecteerde gebouwen" }),
    field("recurrence", "Herhaling", "select", { weekly: "Wekelijks", daily: "Dagelijks", once: "Eenmalig", on_request: "Op verzoek" }),
    field("start_time", "Vanaf", "time"), field("end_time", "Tot", "time"),
    field("instructions", "Taakinstructie", "textarea"),
  ],
  "security-plan": [field("purpose", "Doel van de beveiliging", "textarea"), field("risks", "Risico's en aandachtspunten", "textarea"), field("instructions", "Werkafspraken", "textarea"), field("emergency_procedure", "Procedure bij incidenten", "textarea")],
  modules: [field("module_type", "Soort module"), field("enabled", "Beschikbaar in dit dossier", "checkbox"), field("instructions", "Inhoud en afspraken", "textarea")],
  handbook: [field("content", "Artikelinhoud", "textarea")],
  "floor-plan": [field("file_url", "Link naar plattegrond", "url"), field("file_name", "Bestandsnaam"), field("description", "Verdieping en toelichting", "textarea")],
  "warning-addresses": [field("contact_name", "Contactpersoon"), field("phone", "Telefoonnummer", "tel"), field("email", "E-mailadres", "email"), field("priority", "Belvolgorde", "number"), field("instructions", "Bereikbaarheid en belinstructie", "textarea")],
  relationships: [field("organization_name", "Organisatie"), field("relation_type", "Rol / dienstverlening"), field("phone", "Telefoonnummer", "tel"), field("email", "E-mailadres", "email"), field("notes", "Afspraken", "textarea")],
  keys: [field("set_number", "Sleutelsetnummer"), field("key_number", "Sleutelnummer"), field("quantity", "Aantal", "number"), field("storage_location", "Bewaarlocatie"), field("instructions", "Beheerafspraken", "textarea")],
  installations: [field("installation_type", "Soort installatie"), field("brand", "Merk"), field("model", "Model"), field("location", "Locatie"), field("reference", "Referentie"), field("instructions", "Bedienings- en beheerinstructie", "textarea")],
};

const SECTION_HINTS = {
  tasks: "Bereid de collectieve dienstverlening voor. Deze concepttaken worden nog niet ingepland of uitgevoerd. Deelnames wijzigen geen opdrachtgevers of facturatie.",
  "security-plan": "Leg doelen, risico's en werkafspraken voor het collectief vast. Het plan geeft deelnemers geen toegang tot elkaars dossiers.",
  modules: "Leg de modules en werkinstructies van dit collectief vast. Dit is dossierinrichting, geen activering van operationele functies.",
  handbook: "Beheer collectieve instructies en achtergrondinformatie. Individuele klantinstructies blijven in het eigen objectdossier.",
  "floor-plan": "Registreer een bestaande plattegrond. Het intekenen van huurdersecties en het toewijzen daarvan aan objecten volgt later.",
  "warning-addresses": "Beheer wie voor dit collectief moet worden gebeld. Er worden geen contacten of rapportagerechten automatisch gedeeld.",
  relationships: "Leg betrokken organisaties en hun rol bij het collectief vast.",
  keys: "Registreer collectieve sleutelsets en beheerafspraken. Sleutels van deelnemers worden niet automatisch gekoppeld of gedeeld. Noteer hier geen pincodes of wachtwoorden.",
  installations: "Leg de gezamenlijke installaties en hun beheer vast. Bewaar hier geen toegangscodes of wachtwoorden.",
};

export function collectiveRecordData(data = {}, section) {
  const allowed = new Set((COLLECTIVE_RECORD_FIELDS[section] || []).map(item => item.key));
  if (section === "tasks") ["days", "target_object_ids", "target_building_ids"].forEach(key => allowed.add(key));
  const result = Object.fromEntries(Object.entries(data).filter(([key, value]) => allowed.has(key) && !(value === "" && ["quantity", "priority"].includes(key))));
  if (section === "tasks") {
    if (result.target_scope !== "objects") result.target_object_ids = [];
    if (result.target_scope !== "buildings") result.target_building_ids = [];
  }
  return result;
}

function initialForm(record, section) {
  const defaults = section === "tasks" ? { task_type: "mobile_control_round", execution_mode: "round", target_scope: "collective", recurrence: "weekly", days: [], target_object_ids: [], target_building_ids: [] } : {};
  return { title: record?.title || "", description: record?.description || "", status: record?.status || "draft", data: { ...defaults, ...collectiveRecordData(record?.data, section) } };
}

function RecordEditor({ record, section, dossier, onSave, onCancel, saving, error, onRegisterNavigationGuard }) {
  const [form, setForm] = useState(() => initialForm(record, section));
  const initialRef = useRef(JSON.stringify(form));
  const formRef = useRef(null);
  const save = async () => {
    if (!formRef.current?.reportValidity()) throw new Error("Controleer de verplichte velden.");
    if (section === "tasks" && form.data.target_scope === "objects" && !form.data.target_object_ids?.length) throw new Error("Kies ten minste één deelnemend object.");
    if (section === "tasks" && form.data.target_scope === "buildings" && !form.data.target_building_ids?.length) throw new Error("Kies ten minste één gebouw.");
    await onSave({ ...form, data: collectiveRecordData(form.data, section), title: form.title.trim(), status: section === "tasks" ? "draft" : form.status, record_id: record?.id, expected_version: record?.version || 0 });
  };
  const [localError, setLocalError] = useState(null);
  const navigation = useObjectModuleNavigationGuard({ dirty: initialRef.current !== JSON.stringify(form), moduleName: COLLECTIVE_TABS.find(tab => tab.key === section)?.label, onSave: save, onDiscard: () => {}, saving, onRegisterNavigationGuard });
  const setData = (key, value) => setForm(current => ({ ...current, data: { ...current.data, [key]: value } }));
  const toggle = (key, value) => setData(key, (form.data[key] || []).includes(value) ? form.data[key].filter(item => item !== value) : [...(form.data[key] || []), value]);
  const securityPlans = (dossier.records || []).filter(item => item.section === "security-plan" && activeRecord(item));
  const objectIds = new Set((dossier.memberships || []).filter(item => item.status === "active").map(item => item.object_id));
  const participantObjects = (dossier.objects || []).filter(item => objectIds.has(item.id) && item.status !== "archived");
  const requesterIds = new Set([collectiveManagerId(dossier.collective), ...participantObjects.map(item => item.customer_id), ...(dossier.object_customers || []).filter(item => item.status === "active" && objectIds.has(item.object_id)).map(item => item.customer_id)].filter(Boolean));
  const buildingLinks = (dossier.building_links || []).filter(link => link.status === "active");
  const buildingOptions = [...new Map(buildingLinks.map((link, index) => {
    const labelKey = link.selection_key?.startsWith(`selection:${dossier.collective.id}:`) ? `point:${link.selection_key.slice(`selection:${dossier.collective.id}:`.length)}` : link.selection_key;
    return [link.building_id || link.building_asset_id || link.id, { id: link.building_id || link.building_asset_id || link.id, name: dossier.collective?.building_labels?.[labelKey] || link.building?.name || link.name || `Gebouw ${index + 1}` }];
  })).values()];
  return <form ref={formRef} className="space-y-5 p-5" onSubmit={event => { event.preventDefault(); setLocalError(null); if (!saving) void save().catch(setLocalError); }}>
    <h3 className="text-sm font-semibold">{record?.id ? "Registratie wijzigen" : "Registratie toevoegen"}</h3>
    <div className="grid gap-5 sm:grid-cols-2">
      <CollectiveField label="Naam *" id="record-title"><Input id="record-title" required maxLength={180} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></CollectiveField>
      {section !== "tasks" && <CollectiveField label="Status" id="record-status"><select id="record-status" className={collectiveSelectClass} value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><option value="draft">Concept</option><option value="active">Vastgelegd</option></select></CollectiveField>}
    </div>
    <CollectiveField label="Korte omschrijving" id="record-description"><Textarea id="record-description" rows={2} maxLength={12000} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></CollectiveField>
    <div className="grid gap-5 sm:grid-cols-2">
      {COLLECTIVE_RECORD_FIELDS[section].map(({ key, label, type, options }) => {
        const id = `record-${key}`;
        let choices = options;
        if (type === "security-plan") choices = Object.fromEntries(securityPlans.map(item => [item.id, item.title]));
        if (type === "customer") choices = Object.fromEntries((dossier.customers || []).filter(item => item.status !== "archived" && requesterIds.has(item.id)).map(item => [item.id, item.name || item.trade_name]));
        return <div key={key} className={type === "textarea" ? "sm:col-span-2" : ""}><CollectiveField label={label} id={id}>
          {choices ? <select id={id} className={collectiveSelectClass} value={form.data[key] || ""} onChange={event => setData(key, event.target.value)}>{["security-plan", "customer"].includes(type) && <option value="">Nog niet vastgelegd</option>}{Object.entries(choices).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
            : type === "textarea" ? <Textarea id={id} rows={4} maxLength={12000} value={form.data[key] || ""} onChange={event => setData(key, event.target.value)} />
              : type === "checkbox" ? <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(form.data[key])} onChange={event => setData(key, event.target.checked)} />
                : <Input id={id} type={type} min={type === "number" ? 1 : undefined} max={type === "number" ? 10000 : undefined} step={type === "number" ? 1 : undefined} maxLength={500} value={form.data[key] ?? ""} onChange={event => setData(key, type === "number" && event.target.value ? Number(event.target.value) : event.target.value)} />}
        </CollectiveField></div>;
      })}
    </div>
    {section === "tasks" && <>
      {form.data.recurrence === "weekly" && <fieldset><legend className="mb-2 text-sm font-medium">Dagen</legend><div className="flex flex-wrap gap-3">{["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day, index) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.data.days || []).includes((index + 1) % 7)} onChange={() => toggle("days", (index + 1) % 7)} />{day}</label>)}</div></fieldset>}
      {form.data.target_scope === "objects" && <fieldset className="rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Deelnemende objecten *</legend>{participantObjects.length ? participantObjects.map(object => <label key={object.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={(form.data.target_object_ids || []).includes(object.id)} onChange={() => toggle("target_object_ids", object.id)} />{object.name}</label>) : <p className="text-sm text-muted-foreground">Voeg eerst een deelnemend object toe.</p>}</fieldset>}
      {form.data.target_scope === "buildings" && <fieldset className="rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Gebouwen *</legend>{buildingOptions.length ? buildingOptions.map(building => <label key={building.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={(form.data.target_building_ids || []).includes(building.id)} onChange={() => toggle("target_building_ids", building.id)} />{building.name}</label>) : <p className="text-sm text-muted-foreground">Leg eerst gebouwen vast via Kaart & terrein.</p>}</fieldset>}
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">Alleen voorbereiding: opslaan maakt geen diensten, facturen of rapportagetoegang aan.</p>
    </>}
    {(error || localError) && <p role="alert" className="text-sm text-destructive">{(error || localError).message || "Opslaan mislukt. Je invoer blijft behouden."}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" disabled={saving} onClick={() => navigation.requestNavigation(onCancel)}>Annuleren</Button><Button disabled={saving} type="submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {section === "tasks" ? "Concepttaak opslaan" : "Opslaan"}</Button></div>
    {navigation.dialog}
  </form>;
}

function recordSummary(record, section) {
  const data = record.data || {};
  if (record.description) return record.description;
  if (section === "tasks") return [COLLECTIVE_RECORD_FIELDS.tasks[0].options[data.task_type], data.start_time && `${data.start_time}–${data.end_time || "…"}`].filter(Boolean).join(" · ");
  return data.contact_name || data.organization_name || data.file_name || data.storage_location || data.location || data.module_type || "Geen aanvullende omschrijving";
}

function RecordDetails({ record, section, dossier, onClose }) {
  const valueFor = ({ key, type, options }) => {
    const value = record?.data?.[key];
    if (value === undefined || value === null || value === "") return "Niet vastgelegd";
    if (type === "checkbox") return value ? "Ja" : "Nee";
    if (type === "customer") return (dossier.customers || []).find(item => item.id === value)?.name || "Klant niet beschikbaar";
    if (type === "security-plan") return (dossier.records || []).find(item => item.id === value)?.title || "Plan niet beschikbaar";
    if (type === "url" && /^https:\/\//i.test(value)) return <a className="break-all text-primary underline" href={value} target="_blank" rel="noopener noreferrer">Plattegrond openen</a>;
    return options?.[value] || String(value);
  };
  return <Dialog open={Boolean(record)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{record?.title}</DialogTitle><DialogDescription>{record?.description || "Opgeslagen dossierregistratie. Alleen bekijken wijzigt geen instellingen."}</DialogDescription></DialogHeader><dl className="grid gap-4 sm:grid-cols-2">{COLLECTIVE_RECORD_FIELDS[section].map(item => <div key={item.key} className={item.type === "textarea" ? "sm:col-span-2" : ""}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{valueFor(item)}</dd></div>)}{section === "tasks" && <><div><dt className="text-xs text-muted-foreground">Weekdagen</dt><dd className="mt-1 text-sm">{(record?.data?.days || []).map(day => ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"][day]).join(", ") || "Niet vastgelegd"}</dd></div>{record?.data?.target_scope === "objects" && <div><dt className="text-xs text-muted-foreground">Deelnemende objecten</dt><dd className="mt-1 text-sm">{(record.data.target_object_ids || []).map(id => (dossier.objects || []).find(object => object.id === id)?.name || "Object niet beschikbaar").join(", ")}</dd></div>}<p className="text-xs text-muted-foreground sm:col-span-2">Conceptconfiguratie · niet ingepland of operationeel.</p></>}</dl></DialogContent></Dialog>;
}

export default function CollectiveRecordsTab({ section, dossier, onSave, saving, error, onRegisterNavigationGuard }) {
  const [editor, setEditor] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const rows = (dossier.records || []).filter(item => item.section === section && (showArchived || activeRecord(item)));
  const label = COLLECTIVE_TABS.find(tab => tab.key === section)?.label || section;
  const saveRecord = async payload => { await onSave({ ...payload, section }); setEditor(null); };
  const legacyTasks = section === "tasks" ? dossier.legacy_tasks || [] : [];
  return <section>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 p-5"><div><h2 className="text-sm font-semibold">{label}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{SECTION_HINTS[section]}</p></div>{!editor && <Button size="sm" onClick={() => setEditor({})}><Plus className="h-4 w-4" />Toevoegen</Button>}</header>
    {editor ? <RecordEditor key={editor.id || "new"} section={section} record={editor} dossier={dossier} onSave={saveRecord} onCancel={() => setEditor(null)} saving={saving} error={error} onRegisterNavigationGuard={onRegisterNavigationGuard} /> : <>
      <label className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Gearchiveerde registraties tonen</label>
      {rows.length ? <Table aria-label={label}><TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Omschrijving</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Acties</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="font-medium"><button type="button" className="text-left hover:text-primary" onClick={() => setViewing(row)}>{row.title}</button></TableCell><TableCell className="max-w-lg whitespace-pre-line text-sm text-muted-foreground">{recordSummary(row, section)}</TableCell><TableCell><Badge variant="outline">{row.status === "archived" ? "Gearchiveerd" : section === "tasks" ? "Concept · niet operationeel" : row.status === "active" ? "Vastgelegd" : "Concept"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={`${row.title} bekijken`} onClick={() => setViewing(row)}><Eye className="h-4 w-4" /></Button>{row.status !== "archived" && <><Button size="icon" variant="ghost" aria-label={`${row.title} wijzigen`} onClick={() => setEditor(row)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" disabled={saving} aria-label={`${row.title} archiveren`} onClick={() => { if (window.confirm(`Registratie “${row.title}” archiveren? De historie blijft behouden.`)) void onSave({ ...row, record_id: row.id, expected_version: row.version, status: "archived", section }).catch(() => {}); }}><Archive className="h-4 w-4" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-60 flex-col items-center justify-center gap-2 p-6 text-center"><FileText className="h-7 w-7 text-muted-foreground/60" /><p className="text-sm font-medium">Nog geen {label.toLowerCase()} vastgelegd</p><p className="max-w-lg text-xs text-muted-foreground">Voeg een registratie toe om het collectieve dossier in te richten.</p></div>}
      {error && <p role="alert" className="p-4 text-sm text-destructive">{error.message}</p>}
      {legacyTasks.length > 0 && <div className="m-5 rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Bestaande taakregistraties</h3><p className="mt-1 text-xs text-muted-foreground">Alleen ter inzage. Deze oude taken zijn niet omgezet; bestaande afspraken blijven ongewijzigd.</p><ul className="mt-3 divide-y divide-border">{legacyTasks.map(task => <li key={task.id} className="py-2 text-sm">{task.name || task.title || task.task_type || "Bestaande taak"}<Badge variant="outline" className="ml-2">Bestaand · alleen lezen</Badge></li>)}</ul></div>}
    </>}
    <RecordDetails record={viewing} section={section} dossier={dossier} onClose={() => setViewing(null)} />
  </section>;
}

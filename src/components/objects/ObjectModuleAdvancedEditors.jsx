import React from "react";
import { BellRing, Clock3, ListPlus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  OBJECT_MODULE_REFERENCE_TYPES,
  OBJECT_MODULE_WEEKDAYS,
  createObjectModuleClientId,
} from "./objectModuleConfig";
import {
  ObjectModuleEmpty,
  ObjectModuleSection,
  ObjectModuleToggle,
} from "./ObjectModuleConfigurationEditors";

function uniqueReferences(references) {
  return [...new Set(references.filter(Boolean))];
}

export function objectModuleResourceDependencies(configuration, resourceType, resourceId) {
  const fields = Array.isArray(configuration?.field_definitions) ? configuration.field_definitions : [];
  const lists = Array.isArray(configuration?.reference_lists) ? configuration.reference_lists : [];
  const catalog = Array.isArray(configuration?.catalog_items) ? configuration.catalog_items : [];
  const rules = Array.isArray(configuration?.authorization_rules) ? configuration.authorization_rules : [];
  const list = resourceType === "reference_list" ? lists.find(candidate => candidate.id === resourceId) : null;
  const entryIds = new Set((list?.entries || []).map(entry => entry.id));
  const references = [];

  if (resourceType === "reference_list") {
    fields.filter(field => field.reference_list_id === resourceId).forEach(field => references.push(`veld ‘${field.label || "Naamloos veld"}’`));
  }
  if (["reference_list", "reference_entry"].includes(resourceType)) {
    const matches = id => resourceType === "reference_entry" ? id === resourceId : entryIds.has(id);
    catalog.forEach(item => {
      if ([...(item.allowed_reference_entry_ids || []), ...(item.denied_reference_entry_ids || [])].some(matches)) references.push(`middel ‘${item.name || "Naamloos middel"}’`);
    });
    rules.forEach(rule => {
      if ((rule.subject_entry_ids || []).some(matches)) references.push(`regel ‘${rule.name || "Naamloze regel"}’`);
    });
  }
  if (resourceType === "catalog_item") {
    rules.filter(rule => (rule.catalog_item_ids || []).includes(resourceId)).forEach(rule => references.push(`regel ‘${rule.name || "Naamloze regel"}’`));
  }
  if (resourceType === "availability_window") {
    catalog.filter(item => (item.availability_window_ids || []).includes(resourceId)).forEach(item => references.push(`middel ‘${item.name || "Naamloos middel"}’`));
    rules.filter(rule => (rule.availability_window_ids || []).includes(resourceId)).forEach(rule => references.push(`regel ‘${rule.name || "Naamloze regel"}’`));
  }
  return uniqueReferences(references);
}

function DependencyNotice({ references, canDeactivate = false }) {
  if (!references.length) return null;
  return <p className="mt-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">In gebruik door {references.join(", ")}. Koppel dit eerst los voordat u verwijdert.{canDeactivate ? " Deactiveren blijft mogelijk." : ""}</p>;
}

function ReferenceListEditor({ list, configuration, onUpdate, onRemove, disabled }) {
  const addEntry = () => onUpdate({
    entries: [...list.entries, {
      id: createObjectModuleClientId("entry"),
      label: "",
      secondary_label: "",
      external_reference: "",
      status: "active",
    }],
  });
  const updateEntry = (id, patch) => onUpdate({ entries: list.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry) });
  const listDependencies = objectModuleResourceDependencies(configuration, "reference_list", list.id);
  return <div className="rounded-xl border border-border/70 bg-card/30 p-3">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
      <div className="space-y-1"><Label htmlFor={`list-name-${list.id}`} className="text-[11px]">Naam van de lijst</Label><Input id={`list-name-${list.id}`} value={list.name} onChange={event => onUpdate({ name: event.target.value })} disabled={disabled} maxLength={160} /></div>
      <div className="space-y-1"><Label className="text-[11px]">Inhoud</Label><Select value={list.subject_type} onValueChange={value => onUpdate({ subject_type: value })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OBJECT_MODULE_REFERENCE_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-end"><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={onRemove} disabled={disabled || listDependencies.length > 0} title={listDependencies.length ? "Koppel deze lijst eerst los van afhankelijke velden en regels." : undefined} aria-label="Lijst verwijderen"><Trash2 className="h-4 w-4" /></Button></div>
    </div>
    <DependencyNotice references={listDependencies} />
    <div className="mt-3 space-y-2">{list.entries.map(entry => {
      const dependencies = objectModuleResourceDependencies(configuration, "reference_entry", entry.id);
      return <div key={entry.id} className="rounded-lg border border-transparent">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <Input value={entry.label} onChange={event => updateEntry(entry.id, { label: event.target.value })} disabled={disabled} placeholder={list.subject_type === "room" ? "Kamer 101" : "Naam"} maxLength={200} />
          <Input value={entry.external_reference} onChange={event => updateEntry(entry.id, { external_reference: event.target.value })} disabled={disabled} placeholder="Personeels- of extern nummer (optioneel)" maxLength={160} />
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => updateEntry(entry.id, { status: entry.status === "inactive" ? "active" : "inactive" })} disabled={disabled}>{entry.status === "inactive" ? "Herstellen" : "Deactiveren"}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => onUpdate({ entries: list.entries.filter(item => item.id !== entry.id) })} disabled={disabled || dependencies.length > 0} title={dependencies.length ? "Koppel deze keuze eerst los van middelen en regels." : undefined} aria-label="Keuze verwijderen"><Trash2 className="h-4 w-4" /></Button>
        </div>
        <DependencyNotice references={dependencies} canDeactivate />
      </div>;
    })}<Button type="button" size="sm" variant="ghost" onClick={addEntry} disabled={disabled}><ListPlus className="h-4 w-4" /> Keuze toevoegen</Button></div>
  </div>;
}

export function ObjectModuleCatalogEditor({ module, configuration, onChange, disabled }) {
  const catalog = configuration.catalog_items;
  const lists = configuration.reference_lists;
  const setCatalog = next => onChange({ ...configuration, catalog_items: next.map((item, index) => ({ ...item, sequence: index + 1 })) });
  const setLists = next => onChange({ ...configuration, reference_lists: next.map((list, index) => ({ ...list, sequence: index + 1 })) });
  const updateItem = (id, patch) => setCatalog(catalog.map(item => item.id === id ? { ...item, ...patch } : item));
  const addCatalog = () => setCatalog([...catalog, {
    id: createObjectModuleClientId("catalog"),
    code: "",
    name: "",
    category: "",
    description: "",
    tracking_mode: "serialized",
    quantity: 1,
    expected_return_minutes: null,
    requires_authorization: false,
    eligibility_mode: "all",
    allowed_reference_entry_ids: [],
    denied_reference_entry_ids: [],
    availability_window_ids: [],
    status: "active",
  }]);
  const addList = () => setLists([...lists, {
    id: createObjectModuleClientId("list"),
    name: `Keuzelijst ${lists.length + 1}`,
    subject_type: "person",
    description: "",
    entries: [],
  }]);
  const itemIssuance = module.module_type === "item_issuance";
  return <div className="space-y-4">
    {itemIssuance && <ObjectModuleSection
      title="Middelencatalogus"
      description="Maak vooraf sleutels, passen, apparatuur, kamers of andere uit te geven middelen aan."
      action={<Button type="button" size="sm" variant="outline" onClick={addCatalog} disabled={disabled}><Plus className="h-4 w-4" /> Middel toevoegen</Button>}
    >
      {catalog.length ? <div className="space-y-3">{catalog.map(item => <div key={item.id} className="rounded-xl border border-border/70 bg-card/30 p-3">
        {(() => { const dependencies = objectModuleResourceDependencies(configuration, "catalog_item", item.id); return <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(160px,1.4fr)_120px_minmax(140px,1fr)_160px_auto]">
          <Input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} disabled={disabled} placeholder="Naam middel" maxLength={200} />
          <Input value={item.code} onChange={event => updateItem(item.id, { code: event.target.value })} disabled={disabled} placeholder="Unieke itemcode" maxLength={80} />
          <Input value={item.category} onChange={event => updateItem(item.id, { category: event.target.value })} disabled={disabled} placeholder="Categorie" maxLength={120} />
          <Select value={item.tracking_mode} onValueChange={value => updateItem(item.id, { tracking_mode: value, quantity: value === "quantity" ? item.quantity : 1 })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="serialized">Uniek exemplaar</SelectItem><SelectItem value="quantity">Voorraadhoeveelheid</SelectItem><SelectItem value="reference_only">Alleen referentie</SelectItem></SelectContent></Select>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setCatalog(catalog.filter(current => current.id !== item.id))} disabled={disabled || dependencies.length > 0} title={dependencies.length ? "Koppel dit middel eerst los van bevoegdheidsregels." : undefined} aria-label="Middel verwijderen"><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_220px_minmax(0,1fr)]">
          {item.tracking_mode === "quantity" && <div className="space-y-1"><Label htmlFor={`catalog-quantity-${item.id}`} className="text-[11px]">Beschikbare hoeveelheid</Label><Input id={`catalog-quantity-${item.id}`} type="number" min="1" max="100000" value={item.quantity} onChange={event => updateItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} disabled={disabled} /></div>}
          <div className="space-y-1"><Label htmlFor={`catalog-return-${item.id}`} className="text-[11px]">Standaard retourtermijn (min.)</Label><Input id={`catalog-return-${item.id}`} type="number" min="1" max="525600" value={item.expected_return_minutes ?? ""} onChange={event => updateItem(item.id, { expected_return_minutes: event.target.value ? Math.max(1, Number(event.target.value)) : null })} disabled={disabled} placeholder="Niet verplicht" /></div>
          <div className="space-y-1"><Label htmlFor={`catalog-description-${item.id}`} className="text-[11px]">Omschrijving / uitgifte-instructie</Label><Input id={`catalog-description-${item.id}`} value={item.description} onChange={event => updateItem(item.id, { description: event.target.value })} disabled={disabled} maxLength={1000} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3"><ObjectModuleToggle checked={item.requires_authorization} onCheckedChange={checked => updateItem(item.id, { requires_authorization: checked === true, eligibility_mode: checked === true ? "allow_list" : "all" })} label="Bevoegdheidscontrole" disabled={disabled} /><ObjectModuleToggle checked={item.status !== "inactive"} onCheckedChange={checked => updateItem(item.id, { status: checked === true ? "active" : "inactive" })} label="Actief" disabled={disabled} /></div>
        <DependencyNotice references={dependencies} canDeactivate />
        </>; })()}
      </div>)}</div> : <ObjectModuleEmpty title="Nog geen middelen" description="Voeg de middelen toe die een beveiliger vanuit de objectcatalogus mag selecteren." />}
    </ObjectModuleSection>}
    <ObjectModuleSection
      title="Personen, kamers en andere keuzelijsten"
      description="Beheer herbruikbare lijsten voor snelle invoer en bevoegdheidscontrole."
      action={<Button type="button" size="sm" variant="outline" onClick={addList} disabled={disabled}><Plus className="h-4 w-4" /> Keuzelijst toevoegen</Button>}
    >
      {lists.length ? <div className="space-y-3">{lists.map(list => <ReferenceListEditor key={list.id} list={list} configuration={configuration} disabled={disabled} onUpdate={patch => setLists(lists.map(current => current.id === list.id ? { ...current, ...patch } : current))} onRemove={() => setLists(lists.filter(current => current.id !== list.id))} />)}</div> : <ObjectModuleEmpty title="Nog geen keuzelijsten" description="Maak bijvoorbeeld een personeelslijst, kamerlijst of afdelingsoverzicht waaruit de beveiliger kan kiezen." />}
    </ObjectModuleSection>
  </div>;
}

function IdCheckboxes({ items, selectedIds, onChange, emptyLabel, disabled }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return <div className="grid gap-1.5 sm:grid-cols-2">{items.map(item => <label key={item.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-xs"><Checkbox checked={selectedIds.includes(item.id)} disabled={disabled} onCheckedChange={checked => onChange(checked === true ? [...selectedIds, item.id] : selectedIds.filter(id => id !== item.id))} /><span className="truncate">{item.name || item.label || "Naamloos"}</span></label>)}</div>;
}

const WORKFLOW_LABELS = {
  allow_preregistration: "Voorregistratie toestaan",
  require_host: "Te bezoeken persoon verplicht",
  maintain_evacuation_list: "Actuele evacuatielijst bijhouden",
  badge_enabled: "Badge-uitgifte gebruiken",
  allow_reservations: "Reserveringen toestaan",
  require_expected_return: "Verwachte retour vastleggen",
  require_condition_on_return: "Retourconditie vastleggen",
  allow_authorized_override: "Bevoegde afwijking toestaan",
  block_critical_faults: "Defecte middelen blokkeren",
  photo_on_receipt: "Foto bij ontvangst",
  require_recipient: "Ontvanger verplicht",
  reminders_enabled: "Herinneringen gebruiken",
  office_hours_only: "Alleen binnen openingstijden",
  require_photo: "Foto verplicht",
  public_description_enabled: "Publieke omschrijving toestaan",
  claim_verification_required: "Claim verifiëren",
  custody_tracking: "Bewaar- en overdrachtshistorie bijhouden",
  disposal_approval_required: "Goedkeuring voor afvoer",
  approval_required: "Goedkeuring vereist",
  conflict_detection: "Agenda-overlap blokkeren",
  allow_recurring: "Herhaling toestaan",
  owner_required: "Eigenaar verplicht",
  due_date_required: "Deadline verplicht",
  completion_evidence_required: "Afrondbewijs verplicht",
  recurring_enabled: "Terugkerende actiepunten toestaan",
  escalation_enabled: "Escalatie gebruiken",
};

export function ObjectModuleRulesEditor({ module, configuration, onChange, disabled }) {
  const windows = configuration.availability_windows;
  const rules = configuration.authorization_rules;
  const settings = configuration.workflow_settings;
  const setWindows = next => onChange({ ...configuration, availability_windows: next });
  const setRules = next => onChange({ ...configuration, authorization_rules: next.map((rule, index) => ({ ...rule, sequence: index + 1 })) });
  const setSetting = (key, value) => onChange({ ...configuration, workflow_settings: { ...settings, [key]: value } });
  const itemIssuance = module.module_type === "item_issuance";
  const entries = configuration.reference_lists.flatMap(list => list.entries.map(entry => ({ ...entry, name: `${list.name}: ${entry.label}` })));
  return <div className="space-y-4">
    <ObjectModuleSection
      title="Beschikbaarheid"
      description="Leg vaste momenten vast waarop registraties, afspraken of uitgiftes zijn toegestaan."
      action={<Button type="button" size="sm" variant="outline" onClick={() => setWindows([...windows, { id: createObjectModuleClientId("window"), name: "Nieuw tijdvenster", days: ["mon", "tue", "wed", "thu", "fri"], start_time: "08:00", end_time: "18:00" }])} disabled={disabled}><Clock3 className="h-4 w-4" /> Tijdvenster toevoegen</Button>}
    >
      {windows.length ? <div className="space-y-3">{windows.map(window => <div key={window.id} className="rounded-xl border border-border/70 bg-card/30 p-3">
        {(() => { const dependencies = objectModuleResourceDependencies(configuration, "availability_window", window.id); return <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]"><Input value={window.name} onChange={event => setWindows(windows.map(current => current.id === window.id ? { ...current, name: event.target.value } : current))} disabled={disabled} /><Input type="time" value={window.start_time} onChange={event => setWindows(windows.map(current => current.id === window.id ? { ...current, start_time: event.target.value } : current))} disabled={disabled} /><Input type="time" value={window.end_time} onChange={event => setWindows(windows.map(current => current.id === window.id ? { ...current, end_time: event.target.value } : current))} disabled={disabled} /><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setWindows(windows.filter(current => current.id !== window.id))} disabled={disabled || dependencies.length > 0} title={dependencies.length ? "Koppel dit tijdvenster eerst los van middelen en bevoegdheidsregels." : undefined} aria-label="Tijdvenster verwijderen"><Trash2 className="h-4 w-4" /></Button></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{OBJECT_MODULE_WEEKDAYS.map(day => <button type="button" key={day.value} aria-pressed={window.days.includes(day.value)} onClick={() => setWindows(windows.map(current => current.id === window.id ? { ...current, days: current.days.includes(day.value) ? current.days.filter(value => value !== day.value) : [...current.days, day.value] } : current))} disabled={disabled} className={`rounded-full border px-2.5 py-1 text-xs ${window.days.includes(day.value) ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{day.label}</button>)}</div>
        <DependencyNotice references={dependencies} />
        </>; })()}
      </div>)}</div> : <ObjectModuleEmpty title="Altijd beschikbaar" description="Zonder tijdvensters kan de module op ieder moment worden gebruikt." />}
    </ObjectModuleSection>
    {itemIssuance && <ObjectModuleSection
      title="Bevoegdheidsregels"
      description="Sta alleen relevante personen of kamers toe voor specifieke middelen en tijden."
      action={<Button type="button" size="sm" variant="outline" onClick={() => setRules([...rules, { id: createObjectModuleClientId("rule"), name: "Nieuwe bevoegdheidsregel", effect: "allow", catalog_item_ids: [], subject_entry_ids: [], availability_window_ids: [], note: "", status: "active" }])} disabled={disabled}><ShieldCheck className="h-4 w-4" /> Regel toevoegen</Button>}
    >
      {rules.length ? <div className="space-y-3">{rules.map(rule => <div key={rule.id} className="rounded-xl border border-border/70 bg-card/30 p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]"><Input value={rule.name} onChange={event => setRules(rules.map(current => current.id === rule.id ? { ...current, name: event.target.value } : current))} disabled={disabled} /><Select value={rule.effect} onValueChange={value => setRules(rules.map(current => current.id === rule.id ? { ...current, effect: value } : current))} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="allow">Toestaan</SelectItem><SelectItem value="deny">Weigeren</SelectItem></SelectContent></Select><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setRules(rules.filter(current => current.id !== rule.id))} disabled={disabled} aria-label="Regel verwijderen"><Trash2 className="h-4 w-4" /></Button></div>
        <div className="mt-3 grid gap-3 xl:grid-cols-3"><div><p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Middelen</p><IdCheckboxes items={configuration.catalog_items.filter(item => item.status !== "inactive")} selectedIds={rule.catalog_item_ids} onChange={ids => setRules(rules.map(current => current.id === rule.id ? { ...current, catalog_item_ids: ids } : current))} emptyLabel="Maak eerst catalogusitems aan." disabled={disabled} /></div><div><p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Personen / kamers</p><IdCheckboxes items={entries.filter(entry => entry.status !== "inactive")} selectedIds={rule.subject_entry_ids} onChange={ids => setRules(rules.map(current => current.id === rule.id ? { ...current, subject_entry_ids: ids } : current))} emptyLabel="Voeg eerst keuzes aan een lijst toe." disabled={disabled} /></div><div><p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Tijdvensters</p><IdCheckboxes items={windows} selectedIds={rule.availability_window_ids} onChange={ids => setRules(rules.map(current => current.id === rule.id ? { ...current, availability_window_ids: ids } : current))} emptyLabel="Geen tijdsbeperking." disabled={disabled} /></div></div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row"><Input value={rule.note} onChange={event => setRules(rules.map(current => current.id === rule.id ? { ...current, note: event.target.value } : current))} disabled={disabled} maxLength={500} placeholder="Toelichting (optioneel)" /><ObjectModuleToggle checked={rule.status !== "inactive"} onCheckedChange={checked => setRules(rules.map(current => current.id === rule.id ? { ...current, status: checked === true ? "active" : "inactive" } : current))} label="Actief" disabled={disabled} /></div>
      </div>)}</div> : <ObjectModuleEmpty title="Nog geen bevoegdheidsregels" description="Voeg toestemmings- of weigerregels toe voor gecontroleerde uitgifte." />}
    </ObjectModuleSection>}
    <ObjectModuleSection title="Procesregels" description="Bepaal welke controles bij het gebruik van deze module verplicht zijn.">
      <div className="grid gap-2 md:grid-cols-2">{Object.entries(settings).filter(([, value]) => typeof value === "boolean").map(([key, value]) => <ObjectModuleToggle key={key} checked={value} onCheckedChange={checked => setSetting(key, checked === true)} label={WORKFLOW_LABELS[key] || key} disabled={disabled} />)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(settings).filter(([, value]) => typeof value === "number").map(([key, value]) => <div key={key} className="space-y-1"><Label htmlFor={`workflow-${key}`} className="text-[11px]">{key === "default_due_minutes" ? "Standaard retourtermijn (min.)" : key === "automatic_checkout_minutes" ? "Automatisch uitchecken na (min.; 0 is uit)" : key === "default_duration_minutes" ? "Standaard duur (min.)" : key}</Label><Input id={`workflow-${key}`} type="number" min="0" max="525600" value={value} onChange={event => setSetting(key, Math.max(0, Number(event.target.value) || 0))} disabled={disabled} /></div>)}</div>
      {typeof settings.pickup_proof === "string" && <div className="mt-3 max-w-sm space-y-1"><Label className="text-[11px]">Afhaalbewijs</Label><Select value={settings.pickup_proof} onValueChange={value => setSetting("pickup_proof", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Geen</SelectItem><SelectItem value="signature">Handtekening</SelectItem><SelectItem value="photo">Foto</SelectItem><SelectItem value="pin">Pincode</SelectItem></SelectContent></Select></div>}
    </ObjectModuleSection>
  </div>;
}

export function ObjectModulePrivacyEditor({ configuration, onChange, disabled }) {
  const notifications = configuration.notification_settings;
  const setNotifications = patch => onChange({ ...configuration, notification_settings: { ...notifications, ...patch } });
  return <div className="space-y-4">
    <ObjectModuleSection title="Bewaarbeleid" description="Leg nu het beleid vast dat bij de latere operationele registratiefase server-side moet worden afgedwongen.">
      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]"><div className="space-y-1.5"><Label htmlFor="module-retention" className="text-xs font-semibold">Voorgenomen bewaartermijn (dagen)</Label><Input id="module-retention" type="number" min="1" max="3650" value={configuration.retention_days} onChange={event => onChange({ ...configuration, retention_days: Math.max(1, Number(event.target.value) || 1) })} disabled={disabled} /><div className="mt-3"><ObjectModuleToggle checked={configuration.anonymize_after_retention} onCheckedChange={checked => onChange({ ...configuration, anonymize_after_retention: checked === true })} label="Anonimisering als beleidsregel opnemen" disabled={disabled} /></div></div><div className="rounded-lg border border-amber-300/40 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"><p className="font-medium text-foreground">Nog geen automatische verwijdering</p><p className="mt-1">Deze beheerfase slaat het beleid op, maar voert nog geen retentiejob uit. Gebruik de testmodus niet voor echte persoonsgegevens. Operationele registratie wordt pas geactiveerd wanneer autorisatie, retentie en audit end-to-end beschikbaar zijn.</p></div></div>
    </ObjectModuleSection>
    <ObjectModuleSection title="Notificaties" description="Stel één gedeelde notificatieregel in voor de operationele module.">
      <ObjectModuleToggle checked={notifications.enabled} onCheckedChange={checked => setNotifications({ enabled: checked === true })} label="Notificaties inschakelen" disabled={disabled} />
      {notifications.enabled && <div className="mt-3 grid gap-4 lg:grid-cols-3"><div><Label className="text-[11px]">Kanalen</Label><div className="mt-1.5 space-y-1.5">{[["in_app", "In de applicatie"], ["email", "E-mail"], ["mobile", "Mobiele melding"]].map(([channel, label]) => <label key={channel} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-xs"><Checkbox checked={notifications.channels.includes(channel)} disabled={disabled} onCheckedChange={checked => setNotifications({ channels: checked === true ? [...new Set([...notifications.channels, channel])] : notifications.channels.filter(value => value !== channel) })} />{label}</label>)}</div></div><div className="space-y-1"><Label htmlFor="module-reminders" className="text-[11px]">Herinneringsmomenten (minuten)</Label><Input id="module-reminders" value={notifications.reminder_minutes.join(", ")} onChange={event => setNotifications({ reminder_minutes: event.target.value.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0) })} disabled={disabled} placeholder="Bijvoorbeeld 30, 60, 1440" /></div><div className="space-y-1"><Label htmlFor="module-escalation" className="text-[11px]">Escalatierol</Label><Input id="module-escalation" value={notifications.escalation_role || ""} onChange={event => setNotifications({ escalation_role: event.target.value || null })} disabled={disabled} maxLength={160} placeholder="Bijvoorbeeld objectbeheerder" /></div></div>}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-card/30 p-3 text-xs text-muted-foreground"><BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Dit legt het toekomstige notificatiebeleid vast. In deze beheerfase worden nog geen echte meldingen verzonden.</div>
    </ObjectModuleSection>
  </div>;
}

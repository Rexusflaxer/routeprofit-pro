import React from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  OBJECT_MODULE_FIELD_TYPES,
  OBJECT_MODULE_RESPONSIBLE_ROLES,
  createObjectModuleClientId,
  objectModuleRevisionStatus,
} from "./objectModuleConfig";

export function ObjectModuleSection({ title, description, action = null, children }) {
  return <section className="overflow-hidden rounded-xl border border-border/70 bg-card/35 shadow-sm backdrop-blur-xl">
    <div className="flex flex-col gap-3 border-b border-border/60 bg-card/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="text-sm font-semibold">{title}</h3>{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>;
}

export function ObjectModuleEmpty({ title, description }) {
  return <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 text-center">
    <p className="text-sm font-medium">{title}</p>
    <p className="mt-1 max-w-lg text-xs text-muted-foreground">{description}</p>
  </div>;
}

export function ObjectModuleToggle({ checked, onCheckedChange, label, description, disabled }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card/35 px-3 py-2.5">
    <Checkbox checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    <span><span className="block text-sm font-medium">{label}</span>{description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}</span>
  </label>;
}

export function ObjectModuleOverviewEditor({ configuration, onChange, disabled }) {
  const set = (field, value) => onChange({ ...configuration, [field]: value });
  const metrics = [
    [configuration.field_definitions.filter(field => field.enabled).length, "Actieve velden"],
    [configuration.catalog_items.filter(item => item.status !== "inactive").length, "Catalogusitems"],
    [configuration.reference_lists.length, "Keuzelijsten"],
    [configuration.authorization_rules.filter(rule => rule.status !== "inactive").length, "Bevoegdheidsregels"],
  ];
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([value, label]) => <div key={label} className="rounded-xl border border-border/70 bg-card/35 p-4 shadow-sm backdrop-blur-xl"><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</div>
    <ObjectModuleSection title="Gebruik binnen het object" description="Deze toelichting helpt planners en objectbeheerders begrijpen waarvoor de gedeelde module bedoeld is.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-1.5"><Label htmlFor="module-summary" className="text-xs font-semibold">Doel en werkwijze</Label><Textarea id="module-summary" value={configuration.summary} onChange={event => set("summary", event.target.value)} disabled={disabled} rows={7} maxLength={2000} placeholder="Beschrijf wanneer en hoe deze module op dit object wordt gebruikt..." /></div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold">Functioneel verantwoordelijk</Label><Select value={configuration.responsible_role} onValueChange={value => set("responsible_role", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OBJECT_MODULE_RESPONSIBLE_ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mb-2 h-4 w-4 text-primary" />Beveiligers gebruiken later alleen de gepubliceerde versie die aan hun beveiligingsplan is gekoppeld.</div></div>
      </div>
    </ObjectModuleSection>
  </div>;
}

export function ObjectModuleFieldsEditor({ configuration, onChange, disabled }) {
  const fields = configuration.field_definitions;
  const changeFields = next => onChange({ ...configuration, field_definitions: next.map((field, index) => ({ ...field, sequence: index + 1 })) });
  const add = () => changeFields([...fields, {
    id: createObjectModuleClientId("field"),
    label: "Nieuw veld",
    field_type: "text",
    required: false,
    help_text: "",
    options: [],
    reference_list_id: null,
    enabled: true,
  }]);
  const update = (id, patch) => changeFields(fields.map(field => field.id === id ? { ...field, ...patch } : field));
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    changeFields(next);
  };
  return <ObjectModuleSection
    title="Registratievelden"
    description="Bepaal welke informatie de dienstdoende beveiliger bij iedere registratie vastlegt."
    action={<Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled}><Plus className="h-4 w-4" /> Veld toevoegen</Button>}
  >
    {fields.length ? <div className="space-y-3">{fields.map((field, index) => {
      const isChoice = ["select", "multiselect"].includes(field.field_type);
      return <div key={field.id} className="rounded-xl border border-border/70 bg-card/30 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(160px,1fr)_180px_minmax(160px,1fr)_auto]">
          <div className="space-y-1"><Label htmlFor={`field-label-${field.id}`} className="text-[11px]">Veldnaam</Label><Input id={`field-label-${field.id}`} value={field.label} onChange={event => update(field.id, { label: event.target.value })} disabled={disabled} maxLength={160} /></div>
          <div className="space-y-1"><Label className="text-[11px]">Soort invoer</Label><Select value={field.field_type} onValueChange={value => update(field.id, { field_type: value, options: ["select", "multiselect"].includes(value) ? field.options : [], reference_list_id: ["select", "multiselect"].includes(value) ? field.reference_list_id : null })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OBJECT_MODULE_FIELD_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor={`field-help-${field.id}`} className="text-[11px]">Hulptekst</Label><Input id={`field-help-${field.id}`} value={field.help_text} onChange={event => update(field.id, { help_text: event.target.value })} disabled={disabled} maxLength={500} placeholder="Optionele uitleg" /></div>
          <div className="flex items-end gap-1"><Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label="Veld omhoog"><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(index, 1)} disabled={disabled || index === fields.length - 1} aria-label="Veld omlaag"><ArrowDown className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => changeFields(fields.filter(item => item.id !== field.id))} disabled={disabled || fields.length === 1} aria-label="Veld verwijderen"><Trash2 className="h-4 w-4" /></Button></div>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ObjectModuleToggle checked={field.required} onCheckedChange={checked => update(field.id, { required: checked === true })} label="Verplicht" disabled={disabled} />
          <ObjectModuleToggle checked={field.enabled} onCheckedChange={checked => update(field.id, { enabled: checked === true })} label="Actief" disabled={disabled} />
          {isChoice && <><div className="min-w-0 flex-1 space-y-1"><Label className="text-[11px]">Gekoppelde keuzelijst</Label><Select value={field.reference_list_id || "__manual__"} onValueChange={value => update(field.id, { reference_list_id: value === "__manual__" ? null : value, options: value === "__manual__" ? field.options : [] })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__manual__">Handmatige keuzes</SelectItem>{configuration.reference_lists.map(list => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select></div>{!field.reference_list_id && <div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`field-options-${field.id}`} className="text-[11px]">Keuzes, gescheiden met komma's</Label><Input id={`field-options-${field.id}`} value={field.options.join(", ")} onChange={event => update(field.id, { options: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} disabled={disabled} placeholder="Of koppel een lijst" /></div>}</>}
        </div>
      </div>;
    })}</div> : <ObjectModuleEmpty title="Nog geen velden" description="Voeg minimaal één veld toe voordat deze module kan worden gepubliceerd." />}
  </ObjectModuleSection>;
}

export function ObjectModuleVersionsView({ revisions, planLinks }) {
  return <div className="space-y-4">
    <ObjectModuleSection title="Versiehistorie" description="Gepubliceerde versies blijven onveranderlijk zodat een uitvoering later herleidbaar blijft.">
      {revisions.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Versie</TableHead><TableHead>Status</TableHead><TableHead>Gepubliceerd</TableHead><TableHead>Door</TableHead></TableRow></TableHeader><TableBody>{revisions.map(revision => { const status = objectModuleRevisionStatus(revision.status); return <TableRow key={revision.id || revision.revision_number}><TableCell className="font-medium">Versie {revision.revision_number}</TableCell><TableCell><Badge variant="outline" className={`text-[11px] ${status.className}`}>{status.label}</Badge></TableCell><TableCell>{revision.published_at ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.published_at)) : "—"}</TableCell><TableCell>{revision.published_by_name || revision.published_by_user_id || "Systeem"}</TableCell></TableRow>; })}</TableBody></Table></div> : <ObjectModuleEmpty title="Nog geen gepubliceerde versie" description="Sla de inrichting op en publiceer deze wanneer de module gereed is voor beveiligingsplannen." />}
    </ObjectModuleSection>
    <ObjectModuleSection title="Gekoppelde beveiligingsplannen" description="Alle koppelingen gebruiken dezelfde objectgegevens, maar alleen plannen waarin de module expliciet is opgenomen tonen haar aan de beveiliger.">
      {planLinks.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Beveiligingsplan</TableHead><TableHead>Toegang</TableHead><TableHead>Revisie</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{planLinks.map((link, index) => <TableRow key={link.id || `${link.security_plan_id}-${link.revision_id}-${index}`}><TableCell className="font-medium">{link.security_plan_name || "Beveiligingsplan"}</TableCell><TableCell>{link.access_mode === "read" ? "Raadplegen" : "Registreren"}{link.quick_action ? " · snelle actie" : ""}</TableCell><TableCell>{link.revision_status === "published" ? "Gepubliceerd" : "Concept"}</TableCell><TableCell><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {link.security_plan_status === "archived" ? "Gearchiveerd" : "Gekoppeld"}</span></TableCell></TableRow>)}</TableBody></Table></div> : <ObjectModuleEmpty title="Nog niet gekoppeld" description="Na publicatie kan deze module vanuit een beveiligingsplan aan de relevante taakvariant worden toegevoegd." />}
    </ObjectModuleSection>
  </div>;
}

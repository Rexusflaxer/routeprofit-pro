import React, { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Layers, Loader2, Pencil, Plus, Save, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useObjectModuleNavigationGuard } from "@/components/objects/useObjectModuleNavigationGuard";
import { formatDate, getCustomerName } from "@/components/customers/customerDossierUtils";
import { collectiveMemberRows, COLLECTIVE_TYPES, uniqueMemberCount } from "./collectiveDossierWorkflow";
import { CollectiveField, collectiveSelectClass } from "./CollectiefForm";

function MemberEditor({ membership, dossier, onSave, onCancel, saving, error, onRegisterNavigationGuard }) {
  const [form, setForm] = useState(() => ({ object_id: membership?.object_id || "", status: membership?.status || "active", starts_on: membership?.starts_on || "", ends_on: membership?.ends_on || "" }));
  const [search, setSearch] = useState("");
  const initialRef = useRef(JSON.stringify(form));
  const formRef = useRef(null);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (!formRef.current?.reportValidity() || !form.object_id) throw new Error("Kies een object.");
    await onSave({ ...form, starts_on: form.starts_on || null, ends_on: form.ends_on || null, membership_id: membership?.legacy ? undefined : membership?.id, expected_version: membership?.legacy ? 0 : membership?.version || 0 });
  };
  const navigation = useObjectModuleNavigationGuard({ dirty: initialRef.current !== JSON.stringify(form), moduleName: "Collectiefdeelname", onSave: save, onDiscard: () => {}, saving, onRegisterNavigationGuard });
  const customerById = new Map((dossier.customers || []).map(customer => [customer.id, customer]));
  const existing = new Set((dossier.memberships || []).filter(item => item.id !== membership?.id).map(item => item.object_id));
  const available = (dossier.objects || []).filter(object => {
    if (object.id === form.object_id) return true;
    if (existing.has(object.id) || object.status === "archived" || customerById.get(object.customer_id)?.status === "archived") return false;
    return `${object.name} ${object.object_code || ""} ${getCustomerName(customerById.get(object.customer_id))}`.toLowerCase().includes(search.toLowerCase());
  });
  return <form ref={formRef} className="space-y-5 p-5" onSubmit={event => { event.preventDefault(); if (!saving) void save().catch(() => {}); }}>
    <h3 className="text-sm font-semibold">{membership?.id && !membership.legacy ? "Deelname wijzigen" : "Object onderbrengen in dit collectief"}</h3>
    {!membership?.object_id && <Input value={search} onChange={event => setSearch(event.target.value)} aria-label="Zoek deelnemend object" placeholder="Zoek op object, code of klant…" />}
    <CollectiveField label="Klantobject *" id="member-object" hint="Objecten van verschillende klanten zijn toegestaan. Een object mag aan meerdere collectieven deelnemen."><select id="member-object" required className={collectiveSelectClass} disabled={Boolean(membership?.object_id)} value={form.object_id} onChange={event => set("object_id", event.target.value)}><option value="">Kies een object</option>{available.map(object => <option key={object.id} value={object.id}>{object.name} — {getCustomerName(customerById.get(object.customer_id))}</option>)}</select></CollectiveField>
    <div className="grid gap-4 sm:grid-cols-3">
      <CollectiveField label="Deelnamestatus" id="member-status"><select id="member-status" className={collectiveSelectClass} value={form.status} onChange={event => set("status", event.target.value)}><option value="active">Deelnemer</option><option value="inactive">Niet actief</option></select></CollectiveField>
      <CollectiveField label="Vanaf (optioneel)" id="member-start"><Input id="member-start" type="date" max={form.ends_on || undefined} value={form.starts_on} onChange={event => set("starts_on", event.target.value)} /></CollectiveField>
      <CollectiveField label="Tot en met (optioneel)" id="member-end"><Input id="member-end" type="date" min={form.starts_on || undefined} value={form.ends_on} onChange={event => set("ends_on", event.target.value)} /></CollectiveField>
    </div>
    <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">Dit legt alleen de deelname vast. De klant van het object, bestaande taken, contracten en sleutels blijven behouden. Er ontstaat geen automatische toegang tot rapportages of andere klantdossiers.</p>
    {membership?.legacy && <p className="text-xs text-muted-foreground">De bestaande commerciële koppeling blijft behouden. Je legt hieronder de afzonderlijke dossierdeelname vast.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => navigation.requestNavigation(onCancel)}>Annuleren</Button><Button disabled={saving || !form.object_id}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Deelname opslaan</Button></div>{navigation.dialog}
  </form>;
}

export default function CollectiveMembersTab({ dossier, onSave, saving, error, onOpenCollective, onCreateChild, onRegisterNavigationGuard }) {
  const [search, setSearch] = useState("");
  const [includeIndirect, setIncludeIndirect] = useState(false);
  const [editor, setEditor] = useState(null);
  const rows = useMemo(() => collectiveMemberRows(dossier, { includeIndirect }), [dossier, includeIndirect]);
  const visibleRows = rows.filter(row => `${row.object?.name || ""} ${row.object?.object_code || ""} ${getCustomerName(row.customer)} ${row.collective_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const save = async data => { await onSave(data); setEditor(null); };
  const childCollectives = dossier.children || [];
  const customerName = id => getCustomerName((dossier.customers || []).find(item => item.id === id));
  const responsibleCustomers = object => {
    const additional = (dossier.object_customers || []).filter(row => row.object_id === object?.id && row.status === "active").map(row => row.customer_id);
    return [...new Set([object?.customer_id, ...additional].filter(Boolean))].map(customerName).join(", ");
  };
  return <section>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 p-5"><div><h2 className="text-sm font-semibold">Objecten & deelnemers</h2><p className="mt-1 text-xs text-muted-foreground">{uniqueMemberCount(rows)} unieke deelnemende objecten. Ligging in het gebied is niet automatisch deelname.</p></div>{!editor && <Button size="sm" onClick={() => setEditor({})}><Plus className="h-4 w-4" />Object koppelen</Button>}</header>
    {editor ? <MemberEditor key={editor.id || "new"} membership={editor} dossier={dossier} onSave={save} onCancel={() => setEditor(null)} saving={saving} error={error} onRegisterNavigationGuard={onRegisterNavigationGuard} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="relative sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Zoek object of klant…" aria-label="Zoek deelnemers" /></div>{(dossier.indirect_memberships || []).length > 0 && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={includeIndirect} onChange={event => setIncludeIndirect(event.target.checked)} />Ook onderliggende collectieven</label>}</div>
      {visibleRows.length ? <Table aria-label="Deelnemende klantobjecten"><TableHeader><TableRow><TableHead>Object</TableHead><TableHead>Klant(en)</TableHead><TableHead>Deelname</TableHead><TableHead>Periode</TableHead><TableHead><span className="sr-only">Acties</span></TableHead></TableRow></TableHeader><TableBody>{visibleRows.map(row => <TableRow key={row.id || `${row.collective_id}:${row.object_id}`}><TableCell><p className="font-medium">{row.object?.name || "Object niet beschikbaar"}</p><p className="text-xs text-muted-foreground">{row.object?.object_code || ""}</p></TableCell><TableCell className="max-w-sm text-sm">{responsibleCustomers(row.object) || getCustomerName(row.customer)}</TableCell><TableCell><Badge variant="outline">{row.legacy ? "Bestaande koppeling" : row.status === "inactive" ? "Niet actief" : "Deelnemer"}</Badge>{row.indirect && <p className="mt-1 text-xs text-muted-foreground">Via {row.collective_name || "onderliggend collectief"}</p>}</TableCell><TableCell className="text-xs text-muted-foreground">{row.starts_on || row.ends_on ? `${formatDate(row.starts_on, "Onbepaald")} – ${formatDate(row.ends_on, "Doorlopend")}` : "Geen datums vastgelegd"}</TableCell><TableCell><div className="flex justify-end gap-1">{row.object && <Button variant="ghost" size="icon" asChild><Link to={`/Objects?id=${encodeURIComponent(row.object_id)}`} aria-label={`${row.object.name} openen`}><ArrowUpRight className="h-4 w-4" /></Link></Button>}{!row.indirect && <Button variant="ghost" size="icon" aria-label={`${row.object?.name || "Deelname"} deelname wijzigen`} onClick={() => setEditor(row)}><Pencil className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-5 text-center"><Users className="h-7 w-7 text-muted-foreground/60" /><p className="text-sm font-medium">{search ? "Geen overeenkomende deelnemers" : "Nog geen deelnemende objecten"}</p><p className="max-w-lg text-xs text-muted-foreground">Koppel bestaande klantobjecten. Nieuwe objecten maak je bij de betreffende klant aan; op de kaart kun je ze daarna aan een gebouw koppelen.</p></div>}
      <div className="m-5 rounded-xl border border-border/70"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" />Onderliggende collectieven</h3><Button size="sm" variant="outline" onClick={onCreateChild}><Plus className="h-4 w-4" />Subcollectief toevoegen</Button></header>{childCollectives.length ? <ul className="divide-y divide-border">{childCollectives.map(child => <li key={child.id}><button type="button" onClick={() => onOpenCollective(child.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30"><span><span className="block text-sm font-medium">{child.name}</span><span className="text-xs text-muted-foreground">{COLLECTIVE_TYPES[child.collectief_type] || child.collectief_type}</span></span><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></button></li>)}</ul> : <p className="p-4 text-xs text-muted-foreground">Bijvoorbeeld een bedrijfsverzamelgebouw op dit terrein. Een subcollectief behoudt een eigen dossier.</p>}</div>
    </>}
  </section>;
}

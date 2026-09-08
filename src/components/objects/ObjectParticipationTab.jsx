import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { invokeCustomerPlatformRead } from "@/components/customers/customerDossierUtils";
import { collectiveMutationRequest } from "@/components/collectief/collectiveDossierWorkflow";
import { useToast } from "@/components/ui/use-toast";

const ROLES = { joint_responsible: "Gezamenlijk verantwoordelijk", manager: "Beheerder", client: "Opdrachtgever" };
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function ObjectParticipationTab({ object }) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const retry = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const queryKey = ["object-collective-context", object.id];
  const query = useQuery({ queryKey, queryFn: () => invokeCustomerPlatformRead({ action: "get_object_collective_context", object_id: object.id }) });
  const data = query.data || {};
  const customers = data.customers || [];
  const collectives = data.collectives || [];
  const customerName = id => customers.find(row => row.id === id)?.name || id;
  const collectiveName = id => collectives.find(row => row.id === id)?.name || id;
  const readonly = object.status === "archived";
  const open = (kind, row = {}) => {
    retry.current = null;
    setError(null);
    setForm({ role: "joint_responsible", status: "active", starts_on: "", ends_on: "", ...row });
    setDialog(kind);
  };
  const change = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setError(null); };
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const common = { object_id: object.id, expected_version: form.id ? Number(form.version || 1) : 0, status: form.status, starts_on: form.starts_on || null, ends_on: form.ends_on || null };
      await collectiveMutationRequest(dialog === "customer" ? "upsert_object_customer_responsibility" : "upsert_collective_membership", {
        ...common,
        ...(dialog === "customer" ? { customer_id: form.customer_id, role: form.role, ...(form.id ? { responsibility_id: form.id } : {}) }
          : { collective_id: form.collective_id, ...(form.id ? { membership_id: form.id } : {}) }),
      }, retry);
      await Promise.all([
        cache.invalidateQueries({ queryKey }),
        cache.invalidateQueries({ queryKey: ["collective-dossiers"] }),
        cache.invalidateQueries({ queryKey: ["collective-dossier"] }),
        cache.invalidateQueries({ queryKey: ["customer-shared-objects"] }),
      ]);
      setDialog(null);
      toast({ title: "Koppeling opgeslagen", description: "Bestaande taken, facturatie en toegang blijven ongewijzigd." });
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  if (query.isPending) return <p className="p-5 text-sm text-muted-foreground">Klant- en collectiefkoppelingen laden…</p>;
  if (query.isError) return <div role="alert" className="p-5"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Opnieuw</Button></div>;
  return <div className="space-y-6 p-5">
    <header><h3 className="font-semibold">Klanten & collectieven</h3><p className="mt-1 text-sm text-muted-foreground">Meerdere klanten kunnen verantwoordelijk zijn voor ditzelfde object. Aparte huurders krijgen een eigen object binnen een bedrijfsverzamelgebouw.</p></header>
    <section className="rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b p-4"><h4 className="font-medium">Verantwoordelijke klanten</h4><Button size="sm" disabled={readonly} onClick={() => open("customer")}>Klant koppelen</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">Klant</th><th>Rol</th><th>Periode</th><th>Status</th><th><span className="sr-only">Actie</span></th></tr></thead><tbody>
        <tr className="border-b"><td className="p-3">{customerName(data.primary_customer_id || object.customer_id)}</td><td>Huidige hoofdklant</td><td>—</td><td>Bestaande koppeling</td><td /></tr>
        {(data.responsibilities || []).map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3">{customerName(row.customer_id)}</td><td>{ROLES[row.role] || row.role}</td><td>{row.starts_on || "Onbepaald"}{row.ends_on ? ` t/m ${row.ends_on}` : ""}</td><td>{row.status === "active" ? "Actief" : "Beëindigd"}</td><td><Button variant="ghost" size="sm" disabled={readonly} onClick={() => open("customer", row)}>Wijzigen</Button></td></tr>)}
      </tbody></table></div>
      <p className="border-t p-4 text-xs text-muted-foreground">Een klantkoppeling wijzigt geen facturen, taakopdrachtgevers, rapportageontvangers of portaaltoegang. Verdeling per klant wordt later afzonderlijk ingericht.</p>
    </section>
    <section className="rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b p-4"><h4 className="font-medium">Deelname aan collectieven</h4><Button size="sm" disabled={readonly} onClick={() => open("membership")}>Collectief koppelen</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-3">Collectief</th><th>Periode</th><th>Status</th><th><span className="sr-only">Actie</span></th></tr></thead><tbody>
        {(data.memberships || []).map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3"><Link className="text-primary hover:underline" to={`/Collectief?id=${encodeURIComponent(row.collective_id)}`}>{collectiveName(row.collective_id)}</Link></td><td>{row.starts_on || "Onbepaald"}{row.ends_on ? ` t/m ${row.ends_on}` : ""}</td><td>{row.status === "active" ? "Actief" : "Beëindigd"}</td><td><Button variant="ghost" size="sm" disabled={readonly} onClick={() => open("membership", row)}>Wijzigen</Button></td></tr>)}
        {!data.memberships?.length && <tr><td colSpan={4} className="p-5 text-muted-foreground">Dit object is nog niet gekoppeld aan een collectief.</td></tr>}
      </tbody></table></div>
    </section>
    <Dialog open={Boolean(dialog)} onOpenChange={value => { if (!value && !busy) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog === "customer" ? "Klantverantwoordelijkheid" : "Collectiefdeelname"}</DialogTitle><DialogDescription>Deze koppeling geldt alleen voor de inrichting van het dossier.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div><Label htmlFor="participation-target">{dialog === "customer" ? "Klant" : "Collectief"}</Label><select id="participation-target" required disabled={Boolean(form.id)} className={selectClass} value={(dialog === "customer" ? form.customer_id : form.collective_id) || ""} onChange={event => change(dialog === "customer" ? "customer_id" : "collective_id", event.target.value)}><option value="">Maak een keuze</option>{(dialog === "customer" ? customers.filter(row => row.id !== data.primary_customer_id) : collectives).filter(row => row.status !== "archived" || row.id === form.customer_id || row.id === form.collective_id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        {dialog === "customer" && <div><Label htmlFor="participation-role">Rol</Label><select id="participation-role" className={selectClass} value={form.role} onChange={event => change("role", event.target.value)}>{Object.entries(ROLES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></div>}
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="participation-start">Vanaf</Label><Input id="participation-start" type="date" value={form.starts_on || ""} onChange={event => change("starts_on", event.target.value)} /></div><div><Label htmlFor="participation-end">Tot en met</Label><Input id="participation-end" type="date" value={form.ends_on || ""} min={form.starts_on || undefined} onChange={event => change("ends_on", event.target.value)} /></div></div>
        <div><Label htmlFor="participation-status">Status</Label><select id="participation-status" className={selectClass} value={form.status} onChange={event => change("status", event.target.value)}><option value="active">Actief</option><option value="inactive">Beëindigd</option></select></div>
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>Annuleren</Button><Button type="submit" disabled={busy}>{busy ? "Opslaan…" : "Opslaan"}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}

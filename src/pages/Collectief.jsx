import React, { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowUpRight, Building2, Layers, Loader2, MapPin, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import PageHeader from "@/components/ui-custom/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import ObjectMapTab from "@/components/objects/ObjectMapTab";
import CollectiefForm, { collectiveSelectClass } from "@/components/collectief/CollectiefForm";
import CollectiveMembersTab from "@/components/collectief/CollectiveMembersTab";
import CollectiveRecordsTab, { collectiveRecordData } from "@/components/collectief/CollectiveRecordsTab";
import {
  COLLECTIVE_TABS, COLLECTIVE_TYPES, collectiveManagerId, collectiveMutationRequest,
  getCollectiveDossier, listCollectiveDossiers,
} from "@/components/collectief/collectiveDossierWorkflow";
import { formatDateTime, getCustomerName } from "@/components/customers/customerDossierUtils";

function RequestState({ loading, error, onRetry, overview = false }) {
  const details = [error?.status && `Status ${error.status}`, error?.requestId && `Referentie ${error.requestId}`].filter(Boolean).join(" · ");
  return <div className={`flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center ${overview ? "" : "rounded-xl border border-border"}`} role={loading ? "status" : "alert"}>
    {loading ? <><Loader2 className="h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{overview ? "Collectieven laden…" : "Collectiefdossier laden…"}</p></> : <><AlertCircle className="h-5 w-5 text-destructive" /><p className="text-sm font-medium">{overview ? "De collectieven konden niet worden geladen." : "Het collectiefdossier kon niet worden geladen."}</p><p className="max-w-lg text-xs text-muted-foreground">{error?.message || "Probeer het opnieuw."}</p>{details && <p className="text-xs text-muted-foreground">{details}</p>}<Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4" />Opnieuw laden</Button></>}
  </div>;
}

function CollectiveNavigation({ activeTab, onTabChange }) {
  const moveFocus = (event, index) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? COLLECTIVE_TABS.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + COLLECTIVE_TABS.length) % COLLECTIVE_TABS.length;
    onTabChange(COLLECTIVE_TABS[next].key);
    document.getElementById(`collective-tab-${COLLECTIVE_TABS[next].key}`)?.focus();
  };
  return <aside className="shrink-0 border-b border-border/70 bg-card/25 backdrop-blur-xl lg:w-56 lg:border-b-0 lg:border-r"><p className="hidden px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 lg:block">Collectiefkaart</p><div className="flex overflow-x-auto lg:block" role="tablist" aria-label="Collectiefkaart">{COLLECTIVE_TABS.map((tab, index) => <button type="button" key={tab.key} id={`collective-tab-${tab.key}`} role="tab" aria-selected={activeTab === tab.key} aria-controls={`collective-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={event => moveFocus(event, index)} onClick={() => onTabChange(tab.key)} className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-left text-[13px] font-medium transition-colors lg:block lg:w-full lg:border-b-0 lg:border-r-2 ${activeTab === tab.key ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>{tab.label}</button>)}</div></aside>;
}

function CollectiveLogbook({ records = [] }) {
  return <section><header className="border-b border-border p-5"><h2 className="text-sm font-semibold">Logboek</h2><p className="mt-1 text-xs text-muted-foreground">Historie van collectiefinstellingen, deelnames en dossierwijzigingen.</p></header>{records.length ? <Table aria-label="Collectief logboek"><TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Handeling</TableHead><TableHead>Door</TableHead></TableRow></TableHeader><TableBody>{records.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.occurred_at || row.created_date)}</TableCell><TableCell>{row.summary || "Dossier bijgewerkt"}</TableCell><TableCell className="text-sm text-muted-foreground">{row.actor_name || row.actor_user_id || "Systeem"}</TableCell></TableRow>)}</TableBody></Table> : <p className="p-8 text-center text-sm text-muted-foreground">Er zijn nog geen wijzigingen vastgelegd.</p>}</section>;
}

export default function CollectiefPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [formRecord, setFormRecord] = useState(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const selectedId = searchParams.get("id");
  const requestedTab = searchParams.get("tab") || "participants";
  const activeTab = COLLECTIVE_TABS.some(tab => tab.key === requestedTab) ? requestedTab : "participants";
  const guardRef = useRef(null);
  const retryRef = useRef(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listQuery = useQuery({ queryKey: ["collective-dossiers"], queryFn: listCollectiveDossiers });
  const dossierQuery = useQuery({ queryKey: ["collective-dossier", selectedId], queryFn: () => getCollectiveDossier(selectedId), enabled: Boolean(selectedId) });
  const list = listQuery.data || {};
  const dossier = dossierQuery.data || {};
  const collective = dossier.collective;
  const customers = dossier.customers || list.customers || [];
  const items = list.items || [];
  const onRegisterNavigationGuard = useCallback(guard => {
    guardRef.current = guard;
    return () => { if (guardRef.current === guard) guardRef.current = null; };
  }, []);
  const navigateSafely = action => guardRef.current ? guardRef.current(action) : action();
  const openCollective = id => navigateSafely(() => { setFormRecord(null); setSearchParams(id ? { id } : {}); });
  const changeTab = tab => navigateSafely(() => setSearchParams({ id: selectedId, tab }));
  const mutation = useMutation({
    mutationFn: ({ action, payload }) => collectiveMutationRequest(action, payload, retryRef),
    onSuccess: async () => {
      retryRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collective-dossiers"] }),
        queryClient.invalidateQueries({ queryKey: ["collective-dossier"] }),
        queryClient.invalidateQueries({ queryKey: ["collectieven"] }),
        queryClient.invalidateQueries({ queryKey: ["object-collective-context"] }),
        queryClient.invalidateQueries({ queryKey: ["building-associations"] }),
      ]);
    },
    onError: error => toast({ variant: "destructive", title: "Wijzigingen niet opgeslagen", description: error?.message || "Je lokale invoer blijft behouden. Probeer het opnieuw." }),
  });
  const openForm = record => navigateSafely(() => { mutation.reset(); setFormRecord(record || {}); });
  const saveCollective = async data => {
    const result = await mutation.mutateAsync({ action: formRecord?.id ? "update_collective_dossier" : "create_collective_dossier", payload: { ...data, ...(formRecord?.id ? { collective_id: formRecord.id } : {}), expected_version: formRecord?.version || 0 } });
    setFormRecord(null);
    const id = result.collective_id || result.resource_id || formRecord?.id;
    if (id) setSearchParams({ id });
    toast({ title: "Collectief opgeslagen", description: "Dossierinstellingen zijn bijgewerkt. Commerciële afspraken blijven ongewijzigd." });
  };
  const saveMembership = payload => mutation.mutateAsync({ action: "upsert_collective_membership", payload: { ...payload, collective_id: selectedId } });
  const saveRecord = ({ section, title, description, data, status, record_id, expected_version }) => mutation.mutateAsync({ action: "upsert_collective_dossier_record", payload: { collective_id: selectedId, section, title, description, data: collectiveRecordData(data, section), status, ...(record_id ? { record_id } : {}), expected_version } });

  if (formRecord) return <PageTransition><div className="mb-4"><Button variant="ghost" size="sm" onClick={() => navigateSafely(() => setFormRecord(null))}><ArrowLeft className="h-4 w-4" />Terug naar {selectedId ? "dossier" : "collectieven"}</Button></div><CollectiefForm key={formRecord.id || `new-${formRecord.parent_collectief_id || "root"}`} collectief={formRecord} customers={customers} collectieven={items} onSave={saveCollective} onCancel={() => setFormRecord(null)} saving={mutation.isPending} error={mutation.error} onRegisterNavigationGuard={onRegisterNavigationGuard} /></PageTransition>;

  if (selectedId) {
    if (dossierQuery.isLoading || dossierQuery.isError || !collective) return <PageTransition><Button variant="ghost" size="sm" className="mb-4" onClick={() => openCollective(null)}><ArrowLeft className="h-4 w-4" />Collectieven</Button><RequestState loading={dossierQuery.isLoading} error={dossierQuery.error} onRetry={() => dossierQuery.refetch()} /></PageTransition>;
    const manager = customers.find(customer => customer.id === collectiveManagerId(collective));
    const parent = items.find(item => item.id === collective.parent_collectief_id);
    return <PageTransition>
      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"><Button variant="ghost" size="sm" onClick={() => openCollective(null)}><ArrowLeft className="h-4 w-4" />Collectieven</Button>{parent && <><span>/</span><button type="button" className="hover:text-foreground" onClick={() => openCollective(parent.id)}>{parent.name}</button></>}<span>/</span><span className="text-foreground">{collective.name}</span></div>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/40 p-6"><div className="flex gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-card"><Building2 className="h-6 w-6 text-primary" /></span><div><h1 className="text-xl font-semibold">{collective.name}</h1><Badge variant="outline" className="mt-2">{COLLECTIVE_TYPES[collective.collectief_type] || collective.collectief_type}</Badge><p className="mt-2 text-sm text-muted-foreground">{manager ? `Beheerder: ${getCustomerName(manager)}` : "Geen beherende klant"}</p>{collective.address && <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{collective.address}</p>}</div></div><Button variant="outline" size="sm" onClick={() => openForm(collective)}><Pencil className="h-4 w-4" />Wijzigen</Button></section>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/35 shadow-sm lg:flex"><CollectiveNavigation activeTab={activeTab} onTabChange={changeTab} /><div id={`collective-panel-${activeTab}`} role="tabpanel" aria-labelledby={`collective-tab-${activeTab}`} className="min-w-0 flex-1">
        {activeTab === "participants" ? <CollectiveMembersTab key={`${selectedId}:participants`} dossier={dossier} onSave={saveMembership} saving={mutation.isPending} error={mutation.error} onOpenCollective={openCollective} onCreateChild={() => openForm({ parent_collectief_id: selectedId, collectief_type: "bedrijfsverzamelgebouw" })} onRegisterNavigationGuard={onRegisterNavigationGuard} />
          : activeTab === "map-area" ? <ObjectMapTab key={`${selectedId}:map`} collective={collective} onRegisterNavigationGuard={onRegisterNavigationGuard} />
            : activeTab === "logbook" ? <CollectiveLogbook records={dossier.logbook || []} />
              : <CollectiveRecordsTab key={`${selectedId}:${activeTab}`} section={activeTab} dossier={dossier} onSave={saveRecord} saving={mutation.isPending} error={mutation.error} onRegisterNavigationGuard={onRegisterNavigationGuard} />}
      </div></div>
    </PageTransition>;
  }

  const customerById = new Map((list.customers || []).map(customer => [customer.id, customer]));
  const visible = items.filter(item => (!type || item.collectief_type === type) && `${item.name} ${item.address || ""} ${getCustomerName(customerById.get(collectiveManagerId(item)))}`.toLowerCase().includes(search.toLowerCase()));
  return <PageTransition><PageHeader title="Collectieven" subtitle="Gezamenlijke gebieden en gebouwen, met hun eigen dossier en deelnemende klantobjecten." actions={<Button onClick={() => openForm({})}><Plus className="h-4 w-4" />Collectief toevoegen</Button>} />
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/35">
      <div className="flex flex-wrap gap-3 border-b border-border/70 p-4">
        <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Zoek collectief" placeholder="Zoek op naam, beheerder of adres…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
        <select aria-label="Filter type collectief" className={`${collectiveSelectClass} sm:w-64`} value={type} onChange={event => setType(event.target.value)}><option value="">Alle typen</option>{Object.entries(COLLECTIVE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      <Table aria-label="Collectieven" aria-busy={listQuery.isLoading}>
        <TableHeader><TableRow><TableHead>Collectief</TableHead><TableHead>Type</TableHead><TableHead>Beheerder</TableHead><TableHead>Onderdeel van</TableHead><TableHead><span className="sr-only">Openen</span></TableHead></TableRow></TableHeader>
        <TableBody>
          {listQuery.isLoading || listQuery.isError ? (
            <TableRow><TableCell colSpan={5} className="p-0"><RequestState overview loading={listQuery.isLoading} error={listQuery.error} onRetry={() => listQuery.refetch()} /></TableCell></TableRow>
          ) : visible.length ? visible.map(item => (
            <TableRow key={item.id} className="cursor-pointer" onClick={() => openCollective(item.id)}>
              <TableCell><button type="button" className="font-medium text-foreground hover:text-primary" onClick={event => { event.stopPropagation(); openCollective(item.id); }}>{item.name}</button>{item.address && <p className="mt-1 text-xs text-muted-foreground">{item.address}</p>}</TableCell>
              <TableCell><Badge variant="outline">{COLLECTIVE_TYPES[item.collectief_type] || item.collectief_type}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{collectiveManagerId(item) ? getCustomerName(customerById.get(collectiveManagerId(item))) : "Geen beheerder"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{items.find(parent => parent.id === item.parent_collectief_id)?.name || "Zelfstandig"}</TableCell>
              <TableCell><ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" /></TableCell>
            </TableRow>
          )) : (
            <TableRow><TableCell colSpan={5} className="p-0"><div className="flex min-h-72 flex-col items-center justify-center gap-2 p-6 text-center"><Layers className="h-8 w-8 text-muted-foreground/60" /><p className="text-sm font-medium">{search || type ? "Geen collectieven gevonden" : "Nog geen collectieven"}</p><p className="max-w-lg text-xs text-muted-foreground">Maak een bedrijventerrein, woonwijk of bedrijfsverzamelgebouw aan. De klantobjecten blijven zelfstandig en kunnen daarna worden gekoppeld.</p></div></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  </PageTransition>;
}

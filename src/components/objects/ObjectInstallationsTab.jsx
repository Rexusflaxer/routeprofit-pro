import React, { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, Search, Wrench, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ObjectInstallationDialog from "./ObjectInstallationDialog";
import ObjectInstallationTable from "./ObjectInstallationTable";
import { installationTypeLabel } from "./objectInstallationConfig";

export default function ObjectInstallationsTab({ object, view, searchTerm, onSearchChange, onOpenCreate, onCloseView }) {
  const queryClient = useQueryClient(); const { toast } = useToast();
  const queryKey = ["object-installations", object.id];
  const query = useQuery({ queryKey, queryFn: () => base44.entities.ObjectInstallation.filter({ object_id: object.id }, "-created_date", 250) });
  const create = useMutation({ mutationFn: form => base44.entities.ObjectInstallation.create({ ...form, customer_id: object.customer_id, object_id: object.id }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); onCloseView(); toast({ title: "Installatie toegevoegd" }); } });
  const rows = useMemo(() => { const term = searchTerm.trim().toLowerCase(); return (query.data || []).filter(item => !term || [item.name, installationTypeLabel(item), item.brand, item.model, item.location].some(value => String(value || "").toLowerCase().includes(term))); }, [query.data, searchTerm]);
  const archived = object.status === "archived";
  return <div className="flex min-h-[620px] flex-col bg-card">
    <ObjectInstallationDialog open={view === "new"} onClose={onCloseView} onSave={form => create.mutate(form)} saving={create.isPending} error={create.error} />
    <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-4 py-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Installaties</h2><p className="mt-0.5 text-xs text-muted-foreground">{(query.data || []).length} installatie{(query.data || []).length === 1 ? "" : "s"} bij dit object</p></div><div className="flex gap-2"><div className="relative w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek installatie..." className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div><Button size="sm" onClick={onOpenCreate} disabled={archived || view === "new"}><Plus className="h-4 w-4" /> Installatie toevoegen</Button></div></div>
    <div className="min-h-0 flex-1">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Installaties laden...</div> : query.isError ? <div className="m-4 flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Installaties konden niet worden geladen.</div> : rows.length ? <ObjectInstallationTable installations={rows} /> : <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><Wrench className="mb-3 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">{searchTerm ? "Geen installaties gevonden" : "Nog geen installaties"}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Voeg een alarm-, brandmeld- of andere installatie toe."}</p></div>}</div>
  </div>;
}
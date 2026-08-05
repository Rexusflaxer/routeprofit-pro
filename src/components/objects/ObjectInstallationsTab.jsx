import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, RefreshCw, Search, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ObjectInstallationArchiveDialog from "./ObjectInstallationArchiveDialog";
import ObjectInstallationManual from "./ObjectInstallationManual";
import ObjectInstallationTable from "./ObjectInstallationTable";
import ObjectInstallationWizard from "./ObjectInstallationWizard";
import { installationTypeLabel } from "./objectInstallationConfig";
import {
  archiveObjectInstallation,
  archiveObjectInstallationKey,
  createObjectInstallationKey,
  listObjectInstallations,
  saveObjectInstallation,
  updateObjectInstallationKey,
} from "./objectInstallationWorkflow";

export default function ObjectInstallationsTab({ object, view, selectedRow, searchTerm, onSearchChange, onOpenCreate, onOpenEdit, onOpenManual, onCloseView }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "installations"];
  const query = useQuery({ queryKey, queryFn: () => listObjectInstallations({ customerId: object.customer_id, objectId: object.id }), retry: 1 });
  const installations = query.data?.items || [];
  const currentInstallation = view === "edit" ? installations.find(item => item.id === selectedRow) || null : null;
  const manualInstallation = view === "manual" ? installations.find(item => item.id === selectedRow) || null : null;
  const saveKeyRef = useRef(null);
  const archiveKeysRef = useRef(new Map());
  const [archiveTarget, setArchiveTarget] = useState(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: form => saveObjectInstallation({ customerId: object.customer_id, objectId: object.id, installation: currentInstallation, form, idempotencyKey: saveKeyRef.current }),
    onSuccess: async () => { await refresh(); saveKeyRef.current = null; onCloseView(); toast({ title: currentInstallation ? "Installatie opgeslagen" : "Installatie toegevoegd" }); },
    onError: async error => {
      if (error.status === 409) await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: installation => archiveObjectInstallation({ customerId: object.customer_id, objectId: object.id, installation, idempotencyKey: archiveKeysRef.current.get(installation.id) }),
    onSuccess: async (_, installation) => { await refresh(); archiveKeysRef.current.delete(installation.id); setArchiveTarget(null); onCloseView(); toast({ title: "Installatie gearchiveerd" }); },
    onError: async error => {
      if (error.status === 409) await refresh();
      toast({ title: "Archiveren mislukt", description: error.message, variant: "destructive" });
    },
  });
  const rows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return installations.filter(item => !term || [item.name, installationTypeLabel(item), item.brand, item.model, item.control_device_name, item.serial_number, item.external_reference, item.control_panel_location, item.monitoring_provider_name, item.installer_name].some(value => String(value || "").toLowerCase().includes(term)));
  }, [installations, searchTerm]);
  const archived = object.status === "archived";
  const showWizard = !archived && (view === "new" || Boolean(currentInstallation));

  useEffect(() => {
    saveKeyRef.current = null;
    save.reset();
  }, [selectedRow, view]);
  useEffect(() => {
    const selectedInstallationMissing = view === "edit" ? !currentInstallation : view === "manual" ? !manualInstallation : false;
    if (selectedInstallationMissing && !query.isLoading && !query.isError) onCloseView();
  }, [currentInstallation, manualInstallation, onCloseView, query.isError, query.isLoading, view]);

  const saveForm = form => {
    if (!saveKeyRef.current) saveKeyRef.current = currentInstallation ? updateObjectInstallationKey() : createObjectInstallationKey();
    save.mutate(form);
  };
  const requestArchive = installation => {
    if (!archiveKeysRef.current.has(installation.id)) archiveKeysRef.current.set(installation.id, archiveObjectInstallationKey());
    setArchiveTarget(installation);
  };

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {manualInstallation ? <ObjectInstallationManual object={object} installation={manualInstallation} onBack={onCloseView} onEdit={() => onOpenEdit(manualInstallation.id)} disabled={archived} /> : <>
    {showWizard && <ObjectInstallationWizard key={currentInstallation ? `${currentInstallation.id}-${currentInstallation.version}` : "new-installation"} installation={currentInstallation} onCancel={onCloseView} onSave={saveForm} saving={save.isPending} error={save.error} />}
    <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Installaties</h2><p className="mt-0.5 text-xs text-muted-foreground">{installations.length} installatie{installations.length === 1 ? "" : "s"} bij dit object</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek installatie..." className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div>{!showWizard && <Button size="sm" onClick={onOpenCreate} disabled={archived}><Plus className="h-4 w-4" /> Installatie toevoegen</Button>}</div></div>
    <div className="min-h-0 flex-1">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Installaties laden...</div> : query.isError ? <div className="m-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"><AlertCircle className="h-4 w-4 text-destructive" /><div className="flex-1 text-sm text-destructive">De installaties konden niet worden geladen.<p className="mt-1 text-xs opacity-80">{query.error?.message}</p></div><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button></div> : rows.length ? <ObjectInstallationTable installations={rows} onOpen={installation => onOpenManual(installation.id)} onEdit={installation => !archived && onOpenEdit(installation.id)} onArchive={requestArchive} disabled={archived || archive.isPending} /> : <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><Wrench className="mb-3 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">{searchTerm ? "Geen installaties gevonden" : "Nog geen installaties"}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Voeg een alarm-, brandmeld- of andere objectinstallatie toe. Codes worden afzonderlijk beveiligd opgeslagen."}</p>{!searchTerm && !archived && !showWizard && <Button size="sm" className="mt-4" onClick={onOpenCreate}><Plus className="h-4 w-4" /> Installatie toevoegen</Button>}</div>}</div>
    </>}
    <ObjectInstallationArchiveDialog installation={archiveTarget} open={Boolean(archiveTarget)} pending={archive.isPending} onOpenChange={open => { if (!open && !archive.isPending) setArchiveTarget(null); }} onConfirm={() => archive.mutate(archiveTarget)} />
  </div>;
}

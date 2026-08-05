import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Layers3, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ObjectModuleTable from "./ObjectModuleTable";
import ObjectModuleStatusReasonDialog from "./ObjectModuleStatusReasonDialog";
import ObjectModuleWizard from "./ObjectModuleWizard";
import ObjectModuleWorkspace from "./ObjectModuleWorkspace";
import { objectModuleTypeLabel } from "./objectModuleConfig";
import {
  createObjectModule,
  createObjectModuleMutationKey,
  listObjectModules,
  setObjectModuleStatus,
} from "./objectModuleWorkflow";

export default function ObjectModulesTab({
  object,
  view = null,
  selectedRow = null,
  searchTerm = "",
  onSearchChange = () => {},
  onOpenCreate = () => {},
  onOpenEdit = () => {},
  onCloseView = () => {},
  onRegisterNavigationGuard,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "modules"];
  const query = useQuery({
    queryKey,
    queryFn: () => listObjectModules({ customerId: object.customer_id, objectId: object.id }),
    enabled: Boolean(object.id && object.customer_id),
    retry: 1,
  });
  const modules = query.data?.items || [];
  const createKeyRef = useRef(null);
  const statusKeysRef = useRef(new Map());
  const [statusDialog, setStatusDialog] = useState(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: data => createObjectModule({ customerId: object.customer_id, objectId: object.id, data, idempotencyKey: createKeyRef.current }),
    onSuccess: async result => {
      await refresh();
      createKeyRef.current = null;
      const moduleId = result?.module?.id;
      toast({ title: "Objectmodule toegevoegd", description: "Richt de module nu in en publiceer haar voor gebruik in beveiligingsplannen." });
      if (moduleId) onOpenEdit(moduleId);
      else onCloseView();
    },
    onError: async error => {
      if (Number(error?.status) === 409) await refresh();
    },
  });
  const status = useMutation({
    mutationFn: ({ module, nextStatus, reason = "" }) => setObjectModuleStatus({ customerId: object.customer_id, objectId: object.id, module, status: nextStatus, reason, idempotencyKey: statusKeysRef.current.get(`${module.id}:${nextStatus}:${reason.trim()}`) }),
    onSuccess: async (_, variables) => {
      statusKeysRef.current.delete(`${variables.module.id}:${variables.nextStatus}:${variables.reason.trim()}`);
      setStatusDialog(null);
      await refresh();
      toast({ title: variables.nextStatus === "archived" ? "Module gearchiveerd" : variables.nextStatus === "active" ? "Module hervat" : variables.nextStatus === "suspended" ? "Module gepauzeerd" : "Module hersteld" });
    },
    onError: async error => {
      if (Number(error?.status) === 409) await refresh();
      toast({ title: "Status wijzigen mislukt", description: error.message, variant: "destructive" });
    },
  });
  const rows = useMemo(() => {
    const term = String(searchTerm || "").trim().toLocaleLowerCase("nl-NL");
    if (!term) return modules;
    return modules.filter(module => [module.name, objectModuleTypeLabel(module), module.status].some(value => String(value || "").toLocaleLowerCase("nl-NL").includes(term)));
  }, [modules, searchTerm]);
  const archived = object.status === "archived";
  const showWizard = !archived && view === "new";

  useEffect(() => {
    createKeyRef.current = null;
    create.reset();
  }, [view]);

  if (view === "edit" && selectedRow) return <ObjectModuleWorkspace object={object} moduleId={selectedRow} onBack={onCloseView} onRegisterNavigationGuard={onRegisterNavigationGuard} />;

  const saveNew = form => {
    if (!createKeyRef.current) createKeyRef.current = createObjectModuleMutationKey("create");
    create.mutate(form);
  };
  const submitStatus = (module, nextStatus, reason = "") => {
    const normalizedReason = reason.trim();
    const key = `${module.id}:${nextStatus}:${normalizedReason}`;
    if (!statusKeysRef.current.has(key)) statusKeysRef.current.set(key, createObjectModuleMutationKey(`status-${nextStatus}`));
    status.mutate({ module, nextStatus, reason: normalizedReason });
  };
  const changeStatus = (module, nextStatus) => {
    if (["suspended", "archived"].includes(nextStatus)) {
      status.reset();
      setStatusDialog({ module, nextStatus });
      return;
    }
    submitStatus(module, nextStatus);
  };

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {showWizard && <ObjectModuleWizard existingTypes={modules.map(module => module.module_type)} onCancel={onCloseView} onSave={saveNew} saving={create.isPending} error={create.error} />}
    <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Modules</h2><p className="mt-0.5 text-xs text-muted-foreground">{modules.length} gedeelde objectmodule{modules.length === 1 ? "" : "s"} · inzetbaar in meerdere beveiligingsplannen</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek module..." className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div>{!showWizard && <Button type="button" size="sm" onClick={onOpenCreate} disabled={archived || modules.length >= 6}><Plus className="h-4 w-4" /> Module toevoegen</Button>}</div></div>
    <div className="min-h-0 flex-1">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Modules laden...</div> : query.isError ? <div className="m-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"><AlertCircle className="h-4 w-4 text-destructive" /><div className="flex-1 text-sm text-destructive">De objectmodules konden niet worden geladen.<p className="mt-1 text-xs opacity-80">{query.error?.message}</p></div><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button></div> : rows.length ? <ObjectModuleTable modules={rows} onOpen={module => onOpenEdit(module.id)} onStatusChange={changeStatus} disabled={archived || status.isPending} statusPendingId={status.variables?.module?.id || null} /> : <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/45 shadow-sm"><Layers3 className="h-5 w-5 text-muted-foreground" /></span><p className="mt-3 text-sm font-medium">{searchTerm ? "Geen modules gevonden" : "Nog geen objectmodules"}</p><p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Voeg een objectmodule toe, richt de gedeelde velden en regels in en koppel de gepubliceerde versie daarna alleen aan de relevante beveiligingsplannen."}</p>{!searchTerm && !archived && !showWizard && <Button size="sm" className="mt-4" onClick={onOpenCreate}><Plus className="h-4 w-4" /> Eerste module toevoegen</Button>}</div>}</div>
    <ObjectModuleStatusReasonDialog
      open={Boolean(statusDialog)}
      module={statusDialog?.module}
      targetStatus={statusDialog?.nextStatus}
      pending={status.isPending}
      error={status.error}
      onClose={() => { if (!status.isPending) { setStatusDialog(null); status.reset(); } }}
      onConfirm={reason => submitStatus(statusDialog.module, statusDialog.nextStatus, reason)}
    />
  </div>;
}

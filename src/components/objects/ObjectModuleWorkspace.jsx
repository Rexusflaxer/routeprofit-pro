import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BookOpenCheck,
  ClipboardList,
  Database,
  FileClock,
  LayoutDashboard,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  ObjectModuleFieldsEditor,
  ObjectModuleOverviewEditor,
  ObjectModuleVersionsView,
} from "./ObjectModuleConfigurationEditors";
import {
  ObjectModuleCatalogEditor,
  ObjectModulePrivacyEditor,
  ObjectModuleRulesEditor,
} from "./ObjectModuleAdvancedEditors";
import ObjectModuleLivePreview from "./ObjectModuleLivePreview";
import ObjectModuleStatusReasonDialog from "./ObjectModuleStatusReasonDialog";
import { useObjectModuleNavigationGuard } from "./useObjectModuleNavigationGuard";
import {
  getObjectModuleDefinition,
  normalizeObjectModuleConfiguration,
  objectModuleReadiness,
  objectModuleStatus,
} from "./objectModuleConfig";
import {
  createObjectModuleMutationKey,
  getObjectModule,
  publishObjectModule,
  saveObjectModuleDraft,
  setObjectModuleStatus,
} from "./objectModuleWorkflow";

const WORKSPACE_TABS = [
  { key: "overview", label: "Overzicht", icon: LayoutDashboard },
  { key: "fields", label: "Velden", icon: ClipboardList },
  { key: "catalog", label: "Catalogus & lijsten", icon: Database },
  { key: "rules", label: "Regels", icon: ShieldCheck },
  { key: "privacy", label: "Privacy", icon: BookOpenCheck },
  { key: "versions", label: "Versies & plannen", icon: FileClock },
];

function ModuleLoading() {
  return <div className="space-y-4 p-5" aria-label="Objectmodule laden" aria-busy="true"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9" /><div className="space-y-2"><Skeleton className="h-5 w-64" /><Skeleton className="h-3 w-40" /></div></div><Skeleton className="h-11 w-full" /><Skeleton className="h-[420px] w-full" /></div>;
}

function ModuleError({ error, onRetry, onBack }) {
  const forbidden = Number(error?.status) === 403;
  return <div className="flex min-h-[520px] items-center justify-center p-6 text-center"><div className="max-w-md"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div><h3 className="mt-4 text-sm font-semibold">{forbidden ? "Geen toegang tot deze objectmodule" : "Objectmodule niet beschikbaar"}</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{forbidden ? "Uw object- of bedrijfsrechten geven geen toegang tot deze module." : error?.message || "De module kon niet worden geladen."}</p><div className="mt-4 flex justify-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> Moduleoverzicht</Button>{!forbidden && <Button type="button" size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>}</div></div></div>;
}

function WorkspaceTabs({ active, onChange }) {
  return <div className="flex overflow-x-auto border-b border-border/70 bg-card/25 px-2 backdrop-blur-xl" role="tablist" aria-label="Module-inrichting"><div className="flex min-w-max">{WORKSPACE_TABS.map(tab => { const Icon = tab.icon; return <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${active === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>; })}</div></div>;
}

function ReadinessNotice({ readiness, dirty }) {
  if (!readiness.blocking.length && !readiness.warnings.length && !dirty) return null;
  return <div className="grid gap-2 border-b border-border/60 bg-card/20 px-4 py-3 lg:grid-cols-2">{dirty && <div className="flex items-start gap-2 rounded-lg border border-sky-300/50 bg-sky-500/5 p-2.5 text-xs text-sky-900 dark:text-sky-100"><Save className="mt-0.5 h-3.5 w-3.5 shrink-0" />Lokale wijzigingen zijn nog niet opgeslagen.</div>}{readiness.blocking.slice(0, 2).map(item => <div key={item} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />{item}</div>)}{readiness.warnings.slice(0, 2).map(item => <div key={item} className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-500/5 p-2.5 text-xs text-amber-900 dark:text-amber-100"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}</div>)}</div>;
}

function WorkspaceLoaded({ object, detail, onBack, onRegisterNavigationGuard, refetch }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSubtab = searchParams.get("module_tab") || "overview";
  const activeSubtab = WORKSPACE_TABS.some(tab => tab.key === requestedSubtab) ? requestedSubtab : "overview";
  const module = detail.module;
  const linkedPlanCount = new Set(detail.plan_links.map(link => link.security_plan_id).filter(Boolean)).size;
  const definition = getObjectModuleDefinition(module);
  const Icon = definition?.icon || Database;
  const sourceRevision = detail.draft_revision || detail.published_revision;
  const initial = useMemo(() => normalizeObjectModuleConfiguration(module.module_type, sourceRevision?.configuration), [module.module_type, sourceRevision]);
  const initialSnapshot = useMemo(() => JSON.stringify(initial), [initial]);
  const [configuration, setConfiguration] = useState(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const [statusDialog, setStatusDialog] = useState(null);
  const mutationKeys = useRef({});
  const remoteKey = `${module.version}:${detail.draft_revision?.id || detail.published_revision?.id || "new"}:${detail.draft_revision?.version || detail.published_revision?.version || 0}`;
  const remoteKeyRef = useRef(remoteKey);
  const dirty = JSON.stringify(configuration) !== savedSnapshot;
  const status = objectModuleStatus(module.status);
  const objectArchived = object.status === "archived";
  const archived = objectArchived || module.status === "archived";
  const localReadiness = objectModuleReadiness(module, { configuration });
  const serverBlocking = Array.isArray(detail.readiness?.blocking_issues) ? detail.readiness.blocking_issues.map(issue => issue?.message || issue).filter(Boolean) : [];
  const serverWarnings = Array.isArray(detail.readiness?.warnings) ? detail.readiness.warnings.map(issue => issue?.message || issue).filter(Boolean) : [];
  const readiness = {
    blocking: [...new Set([...localReadiness.blocking, ...serverBlocking])],
    warnings: [...new Set([...localReadiness.warnings, ...serverWarnings])],
    ready: localReadiness.ready && serverBlocking.length === 0,
  };

  useEffect(() => {
    if (remoteKeyRef.current === remoteKey) return;
    remoteKeyRef.current = remoteKey;
    setConfiguration(initial);
    setSavedSnapshot(initialSnapshot);
  }, [initial, initialSnapshot, remoteKey]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "modules"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "module", module.id] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const nextKey = action => mutationKeys.current[action] || (mutationKeys.current[action] = createObjectModuleMutationKey(action));
  const nextStatusKey = (nextStatus, reason = "") => {
    const fingerprint = `${nextStatus}\u0000${reason.trim()}`;
    const current = mutationKeys.current.status;
    if (current?.fingerprint === fingerprint) return current.key;
    const key = createObjectModuleMutationKey(`status-${nextStatus}`);
    mutationKeys.current.status = { fingerprint, key };
    return key;
  };
  const complete = async action => { delete mutationKeys.current[action]; await invalidate(); await refetch(); };
  const handleError = async (error, title) => {
    if (Number(error?.status) === 409) { await invalidate(); await refetch(); }
    toast({ title, description: error.message, variant: "destructive" });
  };
  const save = useMutation({
    mutationFn: () => saveObjectModuleDraft({ customerId: object.customer_id, objectId: object.id, module, configuration, idempotencyKey: nextKey("save") }),
    onSuccess: async () => { await complete("save"); toast({ title: "Moduleconcept opgeslagen", description: "De operationele versie is nog niet gewijzigd." }); },
    onError: error => handleError(error, "Module opslaan mislukt"),
  });
  const publish = useMutation({
    mutationFn: () => publishObjectModule({ customerId: object.customer_id, objectId: object.id, module, idempotencyKey: nextKey("publish") }),
    onSuccess: async () => { await complete("publish"); toast({ title: "Module gepubliceerd", description: "Beveiligingsplannen kunnen deze versie nu gebruiken." }); },
    onError: error => handleError(error, "Module publiceren mislukt"),
  });
  const statusMutation = useMutation({
    mutationFn: ({ nextStatus, reason = "" }) => setObjectModuleStatus({ customerId: object.customer_id, objectId: object.id, module, status: nextStatus, reason, idempotencyKey: nextStatusKey(nextStatus, reason) }),
    onSuccess: async (_, { nextStatus }) => { delete mutationKeys.current.status; setStatusDialog(null); await invalidate(); toast({ title: nextStatus === "archived" ? "Module gearchiveerd" : nextStatus === "active" ? "Module hervat" : nextStatus === "suspended" ? "Module gepauzeerd" : "Module hersteld" }); if (nextStatus === "archived") onBack(); else await refetch(); },
    onError: error => handleError(error, "Status wijzigen mislukt"),
  });
  const changeStatus = nextStatus => {
    if (["suspended", "archived"].includes(nextStatus)) {
      statusMutation.reset();
      setStatusDialog({ nextStatus });
      return;
    }
    statusMutation.mutate({ nextStatus, reason: "" });
  };
  const busy = save.isPending || publish.isPending || statusMutation.isPending;
  const navigationGuard = useObjectModuleNavigationGuard({
    dirty,
    moduleName: module.name,
    onSave: () => save.mutateAsync(),
    saving: save.isPending,
    onRegisterNavigationGuard,
  });
  const setSubtab = key => {
    if (key === activeSubtab) return;
    navigationGuard.navigateWithinWorkspace(() => {
      const next = new URLSearchParams(searchParams);
      next.set("module_tab", key);
      setSearchParams(next, { replace: true });
    });
  };
  const editable = !archived && !busy;
  const revisionNumber = detail.draft_revision?.revision_number || (detail.published_revision?.revision_number || 0) + 1 || 1;
  const activeEditor = activeSubtab === "overview"
    ? <ObjectModuleOverviewEditor configuration={configuration} onChange={setConfiguration} disabled={!editable} />
    : activeSubtab === "fields"
      ? <ObjectModuleFieldsEditor configuration={configuration} onChange={setConfiguration} disabled={!editable} />
      : activeSubtab === "catalog"
        ? <ObjectModuleCatalogEditor module={module} configuration={configuration} onChange={setConfiguration} disabled={!editable} />
        : activeSubtab === "rules"
          ? <ObjectModuleRulesEditor module={module} configuration={configuration} onChange={setConfiguration} disabled={!editable} />
          : activeSubtab === "privacy"
            ? <ObjectModulePrivacyEditor configuration={configuration} onChange={setConfiguration} disabled={!editable} />
            : <ObjectModuleVersionsView revisions={detail.revisions} planLinks={detail.plan_links} />;

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    <header className="border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-2xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigationGuard.requestNavigation(onBack, { kind: "leave", destinationLabel: "het moduleoverzicht" })} aria-label="Terug naar moduleoverzicht"><ArrowLeft className="h-4 w-4" /></Button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/60"><Icon className="h-4 w-4 text-primary" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold">{module.name}</h2><Badge variant="outline" className={status.className}>{status.label}</Badge>{dirty && <Badge variant="outline" className="border-sky-300/70 bg-sky-500/10 text-sky-800 dark:text-sky-200">Niet opgeslagen</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{definition?.label || "Objectmodule"} · werkversie {revisionNumber} · {linkedPlanCount} beveiligingsplan{linkedPlanCount === 1 ? "" : "nen"}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty ? <Button type="button" size="sm" onClick={() => save.mutate()} disabled={busy || archived}>{save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Concept opslaan</Button> : detail.draft_revision && <Button type="button" size="sm" onClick={() => publish.mutate()} disabled={busy || archived || !readiness.ready}>{publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Publiceren</Button>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={busy || objectArchived || dirty} title={dirty ? "Sla de werkversie eerst op voordat u de modulestatus wijzigt." : undefined}><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Meer acties</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {module.status === "active" ? <DropdownMenuItem onSelect={() => changeStatus("suspended")}><PauseCircle className="mr-2 h-4 w-4" /> Pauzeren</DropdownMenuItem> : module.status === "suspended" ? <DropdownMenuItem onSelect={() => changeStatus("active")}><ShieldCheck className="mr-2 h-4 w-4" /> Hervatten</DropdownMenuItem> : module.status === "archived" && !objectArchived ? <DropdownMenuItem onSelect={() => changeStatus(module.current_published_revision_id ? "suspended" : "concept")}><RefreshCw className="mr-2 h-4 w-4" /> Herstellen</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => changeStatus("archived")} disabled={archived || linkedPlanCount > 0} className="text-destructive focus:text-destructive"><Archive className="mr-2 h-4 w-4" /> {linkedPlanCount > 0 ? `Archiveren · eerst ${linkedPlanCount} plan${linkedPlanCount === 1 ? "" : "nen"} ontkoppelen` : "Archiveren"}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
      </div>
      {archived && <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Deze module is alleen-lezen. Historische versies en beveiligingsplankoppelingen blijven beschikbaar.</div>}
    </header>
    <ReadinessNotice readiness={readiness} dirty={dirty} />
    <WorkspaceTabs active={activeSubtab} onChange={setSubtab} />
    <div className="min-h-0 flex-1 p-4"><div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="min-w-0">{activeEditor}</div><ObjectModuleLivePreview module={module} configuration={configuration} /></div></div>
    <ObjectModuleStatusReasonDialog
      open={Boolean(statusDialog)}
      module={module}
      targetStatus={statusDialog?.nextStatus}
      pending={statusMutation.isPending}
      error={statusMutation.error}
      onClose={() => { if (!statusMutation.isPending) { setStatusDialog(null); statusMutation.reset(); } }}
      onConfirm={reason => statusMutation.mutate({ nextStatus: statusDialog.nextStatus, reason })}
    />
    {navigationGuard.dialog}
  </div>;
}

export default function ObjectModuleWorkspace({ object, moduleId, onBack, onRegisterNavigationGuard }) {
  const query = useQuery({
    queryKey: ["object-card", object.id, "module", moduleId],
    queryFn: () => getObjectModule({ customerId: object.customer_id, objectId: object.id, moduleId }),
    enabled: Boolean(object.id && object.customer_id && moduleId),
    retry: 1,
  });
  if (query.isLoading) return <ModuleLoading />;
  if (query.isError) return <ModuleError error={query.error} onRetry={() => query.refetch()} onBack={onBack} />;
  if (!query.data?.module?.id) return <ModuleError error={new Error("Deze objectmodule bestaat niet meer of is niet toegankelijk.")} onRetry={() => query.refetch()} onBack={onBack} />;
  return <WorkspaceLoaded object={object} detail={query.data} onBack={onBack} onRegisterNavigationGuard={onRegisterNavigationGuard} refetch={() => query.refetch()} />;
}

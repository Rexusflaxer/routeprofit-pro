import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BookOpenText,
  Boxes,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import SecurityPlanInstructionBuilder from "./SecurityPlanInstructionBuilder";
import SecurityPlanModulesEditor from "./SecurityPlanModulesEditor";
import {
  buildSecurityPlanReadiness,
  normalizeInstructionBlocks,
  normalizeRouteOverlay,
  securityPlanExecutionModeForTaskType,
  securityPlanExecutionModeLabel,
  securityPlanStatus,
  securityPlanTaskTypeLabel,
} from "./securityPlanConfig";
import {
  archiveObjectSecurityPlan,
  createSecurityPlanMutationKey,
  duplicateObjectSecurityPlan,
  getObjectSecurityPlan,
  publishObjectSecurityPlan,
  saveObjectSecurityPlanDraft,
} from "./securityPlanWorkflow";

const WORKSPACE_TABS = [
  { key: "overview", label: "Overzicht", icon: ShieldCheck },
  { key: "instructions", label: "Instructies", icon: BookOpenText },
  { key: "modules", label: "Modules", icon: Boxes },
];

function formFromDetail(detail) {
  const plan = detail.plan;
  const revision = detail.draft_revision || detail.published_revision || plan.current_revision || {};
  return {
    task_type: plan.task_type || "other",
    custom_task_type: plan.custom_task_type || "",
    variant_name: plan.variant_name || "",
    execution_mode: securityPlanExecutionModeForTaskType(plan.task_type),
    summary: revision.summary || "",
    duration_mode: "schedule_defined",
    duration_minutes: "",
    section_policy: revision.section_policy || "not_applicable",
    default_section_ids: revision.default_section_ids || [],
    allowed_section_ids: revision.allowed_section_ids || [],
    instruction_blocks: normalizeInstructionBlocks(revision.instruction_blocks),
    module_assignments: revision.module_assignments || [],
    floorplan_id: revision.floorplan_id || null,
    floorplan_revision: revision.floorplan_revision || null,
    route_overlay: normalizeRouteOverlay(revision.route_overlay),
  };
}

function mutationData(form) {
  return {
    ...form,
    custom_task_type: form.task_type === "other" ? form.custom_task_type.trim() : null,
    variant_name: form.variant_name.trim(),
    duration_mode: "schedule_defined",
    duration_minutes: null,
  };
}

function remoteReadiness(value) {
  const source = value || {};
  const blocking = source.blocking || source.blocking_reasons || source.blocking_issues || source.errors || [];
  const warnings = source.warnings || source.warning_reasons || [];
  return {
    blocking: Array.isArray(blocking) ? blocking.map(item => typeof item === "string" ? item : item.message || item.label).filter(Boolean) : [],
    warnings: Array.isArray(warnings) ? warnings.map(item => typeof item === "string" ? item : item.message || item.label).filter(Boolean) : [],
  };
}

function DetailLoading() {
  return <div className="space-y-4 p-5" aria-label="Beveiligingsplan laden" aria-busy="true"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9" /><div className="space-y-2"><Skeleton className="h-5 w-64" /><Skeleton className="h-3 w-40" /></div></div><Skeleton className="h-11 w-full" /><Skeleton className="h-[420px] w-full" /></div>;
}

function DetailError({ error, onRetry, onBack }) {
  const forbidden = Number(error?.status) === 403;
  return <div className="flex min-h-[520px] items-center justify-center p-6 text-center"><div className="max-w-md"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div><h3 className="mt-4 text-sm font-semibold">{forbidden ? "Geen toegang tot dit beveiligingsplan" : "Beveiligingsplan niet beschikbaar"}</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{forbidden ? "Uw object- of bedrijfsrechten geven geen toegang tot deze planvariant." : error?.message || "Het plan kon niet worden geladen."}</p><div className="mt-4 flex justify-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> Categorieoverzicht</Button>{!forbidden && <Button type="button" size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>}</div></div></div>;
}

function WorkspaceTabs({ active, onChange }) {
  return <div className="flex overflow-x-auto border-b border-border/70 bg-card/25 px-2 backdrop-blur-xl" role="tablist" aria-label="Beveiligingsplan"><div className="flex min-w-max">{WORKSPACE_TABS.map(tab => { const Icon = tab.icon; return <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${active === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>; })}</div></div>;
}

function OverviewTab({ form, onChange }) {
  const custom = form.task_type === "other";

  return (
    <div className="w-full">
      <section className="w-full space-y-5 rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
        <div>
          <h3 className="text-sm font-semibold">Identiteit en uitvoeringsvorm</h3>
          <p className="mt-1 text-xs text-muted-foreground">Deze gegevens maken de variant later herkenbaar in Taken, Planning en mobiele uitvoering.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Categorie</Label>
            <div className="flex h-10 items-center rounded-md border border-border/70 bg-muted/20 px-3 text-sm font-medium text-foreground">{custom ? "Anders" : securityPlanTaskTypeLabel(form)}</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">De categorie staat vast zodat het plan in het juiste categorieoverzicht blijft.</p>
          </div>
          {custom && <div className="space-y-1.5"><Label htmlFor="plan-custom-type" className="text-xs font-semibold">Eigen taaktype</Label><Input id="plan-custom-type" value={form.custom_task_type} onChange={event => onChange({ ...form, custom_task_type: event.target.value })} maxLength={120} /></div>}
          <div className={`space-y-1.5 ${custom ? "md:col-span-2" : ""}`}>
            <Label htmlFor="plan-variant-name" className="text-xs font-semibold">Variantnaam</Label>
            <Input id="plan-variant-name" value={form.variant_name} onChange={event => onChange({ ...form, variant_name: event.target.value })} placeholder="Bijvoorbeeld Werkdagen of Volledig" maxLength={200} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="plan-summary" className="text-xs font-semibold">Doel en context</Label>
            <Textarea id="plan-summary" value={form.summary} onChange={event => onChange({ ...form, summary: event.target.value })} placeholder="Beschrijf kort wanneer en met welk doel deze variant wordt gebruikt." rows={3} maxLength={2000} />
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkspaceLoaded({ object, detail, onBack, onOpenPlan, refetch }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSubtab = searchParams.get("plan_tab") || "overview";
  const activeSubtab = WORKSPACE_TABS.some(tab => tab.key === requestedSubtab) ? requestedSubtab : "overview";
  const initial = useMemo(() => formFromDetail(detail), [detail]);
  const initialSnapshot = useMemo(() => JSON.stringify(initial), [initial]);
  const [form, setForm] = useState(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const remoteKey = `${detail.plan.version}:${detail.draft_revision?.id || detail.published_revision?.id || "new"}:${detail.draft_revision?.version || detail.published_revision?.version || 0}`;
  const remoteKeyRef = useRef(remoteKey);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const mutationKeys = useRef({});
  const dirty = JSON.stringify(form) !== savedSnapshot;
  const plan = detail.plan;
  const archived = plan.status === "archived" || object.status === "archived";
  const migrationBlocked = Boolean(detail.migration_required || plan.migration_required || detail.draft_revision?.synthesized_from_legacy || detail.draft_revision?.read_only);
  const activeSections = detail.sections.filter(section => section.status !== "archived");
  const publishedFloorplans = detail.floorplans.filter(floorplan => floorplan.status === "published");
  const localReadiness = buildSecurityPlanReadiness({ plan: { ...plan, ...form }, revision: form, sections: activeSections, floorplans: publishedFloorplans, modules: detail.modules });
  const serverReadiness = remoteReadiness(detail.readiness);
  const readiness = { blocking: [...new Set([...localReadiness.blocking, ...serverReadiness.blocking])], warnings: [...new Set([...localReadiness.warnings, ...serverReadiness.warnings])] };

  useEffect(() => {
    if (remoteKeyRef.current === remoteKey) return;
    remoteKeyRef.current = remoteKey;
    setForm(initial);
    setSavedSnapshot(initialSnapshot);
  }, [initial, initialSnapshot, remoteKey]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plan", plan.id] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const nextKey = action => mutationKeys.current[action] || (mutationKeys.current[action] = createSecurityPlanMutationKey(action));
  const completeMutation = async action => {
    delete mutationKeys.current[action];
    await invalidate();
    await refetch();
  };
  const conflictRefresh = async error => { if (Number(error?.status) === 409) { await invalidate(); await refetch(); } };
  const save = useMutation({
    mutationFn: () => saveObjectSecurityPlanDraft({ customerId: object.customer_id, objectId: object.id, securityPlanId: plan.id, version: plan.version, data: mutationData(form), idempotencyKey: nextKey("save") }),
    onSuccess: async () => { await completeMutation("save"); toast({ title: "Concept opgeslagen", description: "De gepubliceerde revisie is niet gewijzigd." }); },
    onError: conflictRefresh,
  });
  const publish = useMutation({
    mutationFn: () => publishObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, securityPlan: plan, idempotencyKey: nextKey("publish") }),
    onSuccess: async () => { await completeMutation("publish"); toast({ title: "Beveiligingsplan gepubliceerd", description: "Deze revisie is nu beschikbaar voor operationeel gebruik." }); },
    onError: conflictRefresh,
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, securityPlan: plan, variantName: duplicateName.trim() || null, idempotencyKey: nextKey("duplicate") }),
    onSuccess: async result => { delete mutationKeys.current.duplicate; await invalidate(); setDuplicateOpen(false); setDuplicateName(""); const id = result?.plan?.id; toast({ title: "Planvariant gedupliceerd" }); if (id) onOpenPlan(id); },
    onError: conflictRefresh,
  });
  const archive = useMutation({
    mutationFn: () => archiveObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, securityPlan: plan, idempotencyKey: nextKey("archive") }),
    onSuccess: async () => { delete mutationKeys.current.archive; await invalidate(); setArchiveOpen(false); toast({ title: "Planvariant gearchiveerd" }); onBack(); },
    onError: conflictRefresh,
  });
  const setSubtab = key => { const next = new URLSearchParams(searchParams); next.set("plan_tab", key); setSearchParams(next); };
  const status = securityPlanStatus(plan.status);
  const busy = save.isPending || publish.isPending || duplicate.isPending || archive.isPending;
  const draftShapeValid = Boolean(form.variant_name.trim() && form.task_type && form.execution_mode && (form.task_type !== "other" || form.custom_task_type.trim()) && form.instruction_blocks.every(block => block.title.trim() && block.steps.every(step => step.title.trim() && step.instruction.trim())));
  const revisionNumber = detail.draft_revision?.revision_number || (detail.published_revision?.revision_number || 0) + 1 || 1;

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    <header className="border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-2xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3"><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Terug naar categorieoverzicht"><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold">{plan.variant_name}</h2><Badge variant="outline" className={status.className}>{status.label}</Badge>{plan.migration_required && <Badge variant="outline" className="border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200">Voorbereiding nodig</Badge>}{dirty && <Badge variant="outline" className="border-sky-300/70 bg-sky-500/10 text-sky-800 dark:text-sky-200">Niet opgeslagen</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{securityPlanTaskTypeLabel(plan)} · {securityPlanExecutionModeLabel(plan.execution_mode)} · revisie {revisionNumber}</p></div></div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty ? <Button type="button" size="sm" onClick={() => save.mutate()} disabled={busy || archived || migrationBlocked || !draftShapeValid}>{save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Concept opslaan</Button> : detail.draft_revision && <Button type="button" size="sm" onClick={() => publish.mutate()} disabled={busy || archived || migrationBlocked || readiness.blocking.length > 0}>{publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Publiceren</Button>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={busy}><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Meer acties</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setDuplicateName(`${plan.variant_name} - kopie`); setDuplicateOpen(true); }} disabled={archived}><Copy className="mr-2 h-4 w-4" /> Dupliceren</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setArchiveOpen(true)} disabled={archived} className="text-destructive focus:text-destructive"><Archive className="mr-2 h-4 w-4" /> Archiveren</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>
      {(save.error || publish.error || duplicate.error || archive.error) && <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{(save.error || publish.error || duplicate.error || archive.error).message}</div>}
      {migrationBlocked && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Bestaand plan moet eerst door de beheerde migratie worden voorbereid. Bewerken en publiceren zijn daarom tijdelijk uitgeschakeld.</span></div>}
      {archived && <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Deze planvariant is gearchiveerd en alleen-lezen. Historische revisies blijven beschikbaar.</div>}
    </header>
    <WorkspaceTabs active={activeSubtab} onChange={setSubtab} />
    <div className={`min-h-0 flex-1 ${activeSubtab === "modules" ? "p-0" : "p-4"} ${archived || migrationBlocked ? "pointer-events-none opacity-75" : ""}`}>
      {activeSubtab === "overview" ? <OverviewTab form={form} onChange={setForm} /> : activeSubtab === "instructions" ? <SecurityPlanInstructionBuilder value={form.instruction_blocks} sections={activeSections} installations={detail.installations} routeOverlay={form.route_overlay} onChange={instruction_blocks => setForm(current => ({ ...current, instruction_blocks }))} /> : <SecurityPlanModulesEditor modules={detail.modules} value={form.module_assignments} onChange={module_assignments => setForm(current => ({ ...current, module_assignments }))} />}
    </div>
    <Dialog open={duplicateOpen} onOpenChange={open => !duplicate.isPending && setDuplicateOpen(open)}><DialogContent><DialogHeader><DialogTitle>Planvariant dupliceren</DialogTitle><DialogDescription>Instructies, sectiekeuze en route worden gekopieerd naar een onafhankelijk concept. Geef de kopie een herkenbare naam.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="duplicate-plan-name" className="text-xs font-semibold">Variantnaam</Label><Input id="duplicate-plan-name" value={duplicateName} onChange={event => setDuplicateName(event.target.value)} autoFocus /></div>{duplicate.error && <p className="text-xs text-destructive">{duplicate.error.message}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setDuplicateOpen(false)} disabled={duplicate.isPending}>Annuleren</Button><Button type="button" onClick={() => duplicate.mutate()} disabled={!duplicateName.trim() || duplicate.isPending}>{duplicate.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Dupliceren</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={archiveOpen} onOpenChange={open => !archive.isPending && setArchiveOpen(open)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Planvariant archiveren?</AlertDialogTitle><AlertDialogDescription>{plan.variant_name} verdwijnt uit de actieve planbibliotheek. Gepubliceerde revisies, uitvoeringshistorie en het objectlogboek blijven behouden.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={archive.isPending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={archive.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event => { event.preventDefault(); archive.mutate(); }}>{archive.isPending ? "Archiveren..." : "Archiveren"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

export default function SecurityPlanWorkspace({ object, securityPlanId, onBack, onOpenPlan }) {
  const query = useQuery({
    queryKey: ["object-card", object.id, "security-plan", securityPlanId],
    queryFn: () => getObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, securityPlanId }),
    enabled: Boolean(object.id && object.customer_id && securityPlanId),
    retry: 1,
  });
  if (query.isLoading) return <DetailLoading />;
  if (query.isError) return <DetailError error={query.error} onRetry={() => query.refetch()} onBack={onBack} />;
  if (!query.data?.plan?.id) return <DetailError error={new Error("Dit beveiligingsplan bestaat niet meer of is niet toegankelijk.")} onRetry={() => query.refetch()} onBack={onBack} />;
  return <WorkspaceLoaded object={object} detail={query.data} onBack={onBack} onOpenPlan={onOpenPlan} refetch={() => query.refetch()} />;
}
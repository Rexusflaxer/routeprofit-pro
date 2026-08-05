import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import SecurityPlanWizard from "./SecurityPlanWizard";
import SecurityPlanWorkspace from "./SecurityPlanWorkspace";
import {
  SECURITY_PLAN_TASK_TYPES,
  getSecurityPlanTaskType,
  securityPlanDurationLabel,
  securityPlanExecutionModeLabel,
  securityPlanStatus,
  securityPlanTaskTypeLabel,
} from "./securityPlanConfig";
import {
  createObjectSecurityPlan,
  createSecurityPlanMutationKey,
  listObjectSecurityPlans,
  migrateLegacyObjectSecurityPlans,
} from "./securityPlanWorkflow";

const PAGE_SIZE = 50;
const CATEGORY_RESET_PARAMS = ["query", "page", "plan_status", "view", "row", "plan_tab"];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function sectionSummary(summary) {
  if (!summary || summary.section_policy === "not_applicable") return "Niet van toepassing";
  if (summary.section_policy === "fixed") return `${Number(summary.default_section_count || 0)} vast`;
  return `${Number(summary.default_section_count || 0)} standaard · ${Number(summary.allowed_section_count || 0)} toegestaan`;
}

function fallbackCategorySummary(rows) {
  return SECURITY_PLAN_TASK_TYPES.map(category => {
    const categoryRows = rows.filter(plan => plan.task_type === category.key && plan.status !== "archived");
    return {
      task_type: category.key,
      total: categoryRows.length,
      published: categoryRows.filter(plan => plan.has_publication || plan.status === "published").length,
      draft: categoryRows.filter(plan => plan.has_draft || plan.status === "draft" || plan.draft_revision_id).length,
      attention: categoryRows.filter(plan => plan.migration_required || Number(plan.current_revision_summary?.readiness_warning_count || 0) > 0).length,
    };
  });
}

function planDataForCategory(data, taskType) {
  return { ...(data || {}), task_type: taskType };
}

function LibraryLoading() {
  return <div className="space-y-2 p-4" aria-label="Plannen laden" aria-busy="true">{[1, 2, 3, 4, 5].map(index => <div key={index} className="h-14 animate-pulse rounded-xl border border-border/70 bg-card/35 backdrop-blur-xl" />)}</div>;
}

function LibraryError({ error, onRetry }) {
  const forbidden = Number(error?.status) === 403;
  return <div className="m-4 flex min-h-72 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><div className="max-w-md"><AlertCircle className="mx-auto h-6 w-6 text-destructive" /><p className="mt-3 text-sm font-medium">{forbidden ? "Geen toegang tot beveiligingsplannen" : "De plannen konden niet worden geladen"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{forbidden ? "Uw object- of bedrijfsrechten geven geen toegang tot deze operationele plannen." : error?.message || "Probeer het opnieuw."}</p>{!forbidden && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw proberen</Button>}</div></div>;
}

function EmptyCategory({ category, searching, archivedObject, onCreate }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center px-5 py-10 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">{searching ? <Search className="h-5 w-5 text-muted-foreground" /> : <BookOpenText className="h-5 w-5 text-muted-foreground" />}</div><p className="mt-3 text-sm font-medium">{searching ? "Geen planvarianten gevonden" : `Nog geen plannen voor ${category.label}`}</p><p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{searching ? "Pas de zoekopdracht aan." : "Voeg een eerste plan toe en werk daarna de instructies, objectsecties en eventuele looproute uit."}</p>{!searching && !archivedObject && <Button type="button" size="sm" className="mt-4" onClick={onCreate}><Plus className="h-3.5 w-3.5" /> Plan toevoegen</Button>}</div>;
}

function PlanStatus({ plan }) {
  const status = securityPlanStatus(plan.status);
  return <div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={status.className}>{status.label}</Badge>{plan.status === "published" && plan.draft_revision_id && <Badge variant="outline" className="border-sky-300/70 bg-sky-500/10 text-sky-800 dark:text-sky-200">Conceptwijziging</Badge>}{plan.migration_required && <Badge variant="outline" className="border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200">Controle nodig</Badge>}</div>;
}

function LegacyMigrationBanner({ count, pending, onPreview }) {
  return <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-500/10 p-4 text-amber-950 backdrop-blur-xl dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-semibold">{count} bestaand{count === 1 ? " plan" : "e plannen"} voorbereiden</p><p className="mt-1 max-w-2xl text-xs leading-relaxed opacity-80">Deze plannen komen uit de eerdere opzet. Een beheerder kan eerst veilig bekijken wat wordt omgezet en daarna expliciet conceptrevisies laten maken. Er wordt niets gepubliceerd.</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-400/60 bg-background/70" onClick={onPreview} disabled={pending}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />} Voorbereiding controleren</Button></div>;
}

function CategoryChoice({ category, summary, loading, unavailable, onClick }) {
  const total = Number(summary?.total || 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${category.label} openen`}
      className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-card/45 px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-all hover:border-primary hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{category.label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{category.description}</span>
        <span className="mt-1.5 block text-[11px] text-muted-foreground">{loading ? "Aantallen laden..." : unavailable ? "Aantal tijdelijk niet beschikbaar" : `${total} uitvoeringsplan${total === 1 ? "" : "nen"}`}</span>
      </span>
      <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function CategoryLanding({ summaries, loading, countError, migrationCount, migrationPending, archivedObject, onSelect, onRetryCounts, onPreviewMigration }) {
  const summaryByType = new Map(summaries.map(summary => [summary.task_type, summary]));
  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
      <div className="border-b border-border/70 bg-card/25 px-5 py-4 backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-foreground">Beveiligingsplan</h2>
        <p className="mt-1 text-xs text-muted-foreground">Kies eerst een categorie. Daarna beheert en ontwerpt u alleen de plannen voor dat soort werkzaamheden.</p>
      </div>
      {migrationCount > 0 && !archivedObject && <LegacyMigrationBanner count={migrationCount} pending={migrationPending} onPreview={onPreviewMigration} />}
      <div className="space-y-3 p-5">
        <div>
          <p className="text-sm font-medium text-foreground">Kies het soort beveiligingsplan</p>
          <p className="mt-1 text-xs text-muted-foreground">Iedere categorie bevat zijn eigen varianten, instructies, secties, routes en publicatiehistorie.</p>
        </div>
        {countError && <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"><span>De aantallen zijn tijdelijk niet beschikbaar. U kunt de categorieën wel openen.</span><Button type="button" variant="ghost" size="sm" className="h-7 shrink-0" onClick={onRetryCounts}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button></div>}
        <div className="grid grid-cols-1 gap-2">
          {SECURITY_PLAN_TASK_TYPES.map(category => <CategoryChoice key={category.key} category={category} summary={summaryByType.get(category.key)} loading={loading} unavailable={countError} onClick={() => onSelect(category.key)} />)}
        </div>
      </div>
    </div>
  );
}

function PlanRows({ rows, category, onOpen }) {
  return <>
    <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead className="pl-4 text-xs">Planvariant</TableHead><TableHead className="text-xs">Uitvoering</TableHead><TableHead className="text-xs">Secties</TableHead><TableHead className="text-xs">Duur</TableHead><TableHead className="text-xs">Route</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Revisie</TableHead><TableHead className="text-xs">Gewijzigd</TableHead><TableHead className="w-10 pr-4" /></TableRow></TableHeader><TableBody>{rows.map(plan => { const summary = plan.current_revision_summary || plan.current_revision || {}; return <TableRow key={plan.id} tabIndex={0} role="link" onClick={() => onOpen(plan.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(plan.id); } }} className="cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"><TableCell className="pl-4">{category.key === "other" && <p className="text-xs text-muted-foreground">{securityPlanTaskTypeLabel(plan)}</p>}<p className={category.key === "other" ? "mt-0.5 font-medium text-foreground" : "font-medium text-foreground"}>{plan.variant_name}</p></TableCell><TableCell className="text-muted-foreground">{securityPlanExecutionModeLabel(plan.execution_mode)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{sectionSummary(summary)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{securityPlanDurationLabel(plan, summary)}</TableCell><TableCell>{summary.has_route ? <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><Route className="h-3.5 w-3.5" /> Ingetekend</span> : <span className="text-muted-foreground">Nog niet</span>}</TableCell><TableCell><PlanStatus plan={plan} /></TableCell><TableCell className="tabular-nums text-muted-foreground">{plan.latest_revision_number || summary.revision_number || 1}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(plan.updated_date)}</TableCell><TableCell className="pr-4 text-right"><ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></TableCell></TableRow>; })}</TableBody></Table></div>
    <div className="divide-y divide-border md:hidden">{rows.map(plan => { const summary = plan.current_revision_summary || plan.current_revision || {}; return <button key={plan.id} type="button" onClick={() => onOpen(plan.id)} className="block w-full px-4 py-3 text-left hover:bg-muted/25"><div className="flex items-start justify-between gap-3"><div className="min-w-0">{category.key === "other" && <p className="text-[11px] text-muted-foreground">{securityPlanTaskTypeLabel(plan)}</p>}<p className="mt-0.5 truncate text-sm font-medium">{plan.variant_name}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{securityPlanDurationLabel(plan, summary)}</span><span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" />{sectionSummary(summary)}</span><span className="inline-flex items-center gap-1">{summary.has_route ? <Route className="h-3.5 w-3.5 text-emerald-600" /> : <Route className="h-3.5 w-3.5" />}{summary.has_route ? "Route" : "Geen route"}</span></div><div className="mt-2"><PlanStatus plan={plan} /></div></button>; })}</div>
  </>;
}

export default function ObjectSecurityPlanTab({ object, view, selectedRow, searchTerm, onSearchChange, page, onPageChange, onOpenCreate, onOpenEdit, onCloseView }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const createKeyRef = useRef(null);
  const migrationKeysRef = useRef({});
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const selectedType = searchParams.get("plan_type") || "";
  const selectedCategory = getSecurityPlanTaskType(selectedType);
  const statusFilter = "current";
  const archivedObject = object.status === "archived";
  const status = null;
  const facetQuery = useQuery({
    queryKey: ["object-card", object.id, "security-plans", "categories"],
    queryFn: () => listObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, page: 1, pageSize: 100 }),
    enabled: view !== "edit",
    retry: 1,
  });
  const listQuery = useQuery({
    queryKey: ["object-card", object.id, "security-plans", "list", selectedType, statusFilter, searchTerm.trim(), page],
    queryFn: () => listObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, status, taskType: selectedType, search: searchTerm, page, pageSize: PAGE_SIZE }),
    enabled: Boolean(selectedCategory) && view !== "edit",
    retry: 1,
  });
  const rows = listQuery.data?.items || [];
  const facetRows = facetQuery.data?.items || [];
  const categorySummaries = useMemo(() => facetQuery.data?.category_summary?.length
    ? facetQuery.data.category_summary
    : fallbackCategorySummary(facetRows), [facetQuery.data?.category_summary, facetRows]);
  const migrationRequiredCount = Number(facetQuery.data?.migration_required_count ?? facetRows.filter(plan => plan.migration_required).length);
  const selectedSummary = categorySummaries.find(summary => summary.task_type === selectedType) || { total: 0, published: 0, draft: 0, attention: 0 };
  const total = Number(listQuery.data?.total || 0);
  const hasNext = page * PAGE_SIZE < total;
  const wizardOpen = view === "new" && Boolean(selectedCategory) && !archivedObject;

  useEffect(() => {
    if (wizardOpen && !createKeyRef.current) createKeyRef.current = createSecurityPlanMutationKey("create");
    if (!wizardOpen) createKeyRef.current = null;
  }, [wizardOpen]);

  useEffect(() => {
    const invalidCategory = Boolean(selectedType && !selectedCategory);
    const orphanedCreateView = view === "new" && searchParams.get("view") === "new" && !selectedCategory;
    if (!invalidCategory && !orphanedCreateView) return;
    const next = new URLSearchParams(searchParams);
    if (invalidCategory) next.delete("plan_type");
    CATEGORY_RESET_PARAMS.forEach(key => next.delete(key));
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedCategory, selectedType, setSearchParams, view]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] });
  const create = useMutation({
    mutationFn: data => createObjectSecurityPlan({
      customerId: object.customer_id,
      objectId: object.id,
      data: planDataForCategory(data, selectedCategory.key),
      idempotencyKey: createKeyRef.current || createSecurityPlanMutationKey("create"),
    }),
    onSuccess: async result => {
      await invalidate();
      createKeyRef.current = null;
      const id = result?.plan?.id;
      toast({ title: "Plan aangemaakt", description: "Werk nu de instructies, secties en eventuele looproute uit." });
      if (id) onOpenEdit(id);
      else onCloseView();
    },
    onError: async error => { if (Number(error?.status) === 409) await invalidate(); },
  });
  const migrationPreview = useMutation({
    mutationFn: () => migrateLegacyObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, dryRun: true, idempotencyKey: migrationKeysRef.current.preview || (migrationKeysRef.current.preview = createSecurityPlanMutationKey("migration-preview")) }),
    onSuccess: () => { delete migrationKeysRef.current.preview; setMigrationDialogOpen(true); },
    onError: error => toast({ title: "Voorbereiding controleren mislukt", description: error.message, variant: "destructive" }),
  });
  const migrationExecute = useMutation({
    mutationFn: () => migrateLegacyObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, dryRun: false, idempotencyKey: migrationKeysRef.current.execute || (migrationKeysRef.current.execute = createSecurityPlanMutationKey("migration-execute")) }),
    onSuccess: async result => { delete migrationKeysRef.current.execute; await invalidate(); setMigrationDialogOpen(false); migrationPreview.reset(); toast({ title: "Bestaande plannen voorbereid", description: `${Number(result?.migrated_count || 0)} planvariant${Number(result?.migrated_count || 0) === 1 ? "" : "en"} als controleerbaar concept klaargezet.` }); },
    onError: async error => { if (Number(error?.status) === 409) await invalidate(); toast({ title: "Plannen voorbereiden mislukt", description: error.message, variant: "destructive" }); },
  });

  useEffect(() => { create.reset(); }, [view]);

  const openCategory = key => {
    const next = new URLSearchParams(searchParams);
    next.set("plan_type", key);
    CATEGORY_RESET_PARAMS.forEach(param => next.delete(param));
    setSearchParams(next);
  };
  const closeCategory = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("plan_type");
    CATEGORY_RESET_PARAMS.forEach(param => next.delete(param));
    setSearchParams(next);
  };
  const detailOpen = view === "edit"
    && searchParams.get("view") === "edit"
    && selectedRow
    && searchParams.get("row") === selectedRow
    && (!selectedType || selectedCategory);
  if (detailOpen) return <SecurityPlanWorkspace object={object} securityPlanId={selectedRow} onBack={onCloseView} onOpenPlan={onOpenEdit} />;
  if (!selectedCategory) return <>
    <CategoryLanding
      summaries={categorySummaries}
      loading={facetQuery.isLoading}
      countError={facetQuery.isError}
      migrationCount={migrationRequiredCount}
      migrationPending={migrationPreview.isPending}
      archivedObject={archivedObject}
      onSelect={openCategory}
      onRetryCounts={() => facetQuery.refetch()}
      onPreviewMigration={() => migrationPreview.mutate()}
    />
    <MigrationDialog open={migrationDialogOpen} onOpenChange={open => { if (migrationExecute.isPending) return; setMigrationDialogOpen(open); if (!open) migrationPreview.reset(); }} preview={migrationPreview.data} execute={migrationExecute} />
  </>;

  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {wizardOpen && <SecurityPlanWizard key={`new-${selectedCategory.key}`} initialTaskType={selectedCategory.key} categoryLabel={selectedCategory.label} saving={create.isPending} error={create.error} onCancel={onCloseView} onSave={data => create.mutate(data)} />}
    <div className="flex flex-col gap-3 border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-2xl xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground" onClick={closeCategory}><ChevronLeft className="mr-1 h-4 w-4" /> Alle categorieën</Button>
        <div className="min-w-0 border-l border-border/70 pl-3">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{selectedCategory.label}</h2><Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">{Number(selectedSummary.total || 0)} actief</Badge>{Number(selectedSummary.attention || 0) > 0 && <Badge variant="outline" className="border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200">{selectedSummary.attention} aandacht</Badge>}</div>
          <p className="mt-1 text-xs text-muted-foreground">{selectedCategory.description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek planvariant..." aria-label={`${selectedCategory.label} doorzoeken`} className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Zoekopdracht wissen"><X className="h-4 w-4" /></button>}</div>
        {!wizardOpen && <Button type="button" size="sm" onClick={onOpenCreate} disabled={archivedObject}><Plus className="h-3.5 w-3.5" /> Plan toevoegen</Button>}
      </div>
    </div>
    <div className="min-h-0 flex-1">{listQuery.isLoading ? <LibraryLoading /> : listQuery.isError ? <LibraryError error={listQuery.error} onRetry={() => listQuery.refetch()} /> : rows.length ? <PlanRows rows={rows} category={selectedCategory} onOpen={onOpenEdit} /> : <EmptyCategory category={selectedCategory} searching={Boolean(searchTerm.trim())} archivedObject={archivedObject} onCreate={onOpenCreate} />}</div>
    {(page > 1 || hasNext) && <div className="flex items-center justify-between border-t border-border/70 px-4 py-3"><p className="text-xs text-muted-foreground">Pagina {page} · {total} planvariant{total === 1 ? "" : "en"}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1 || listQuery.isFetching} onClick={() => onPageChange(page - 1)}>Vorige</Button><Button type="button" variant="outline" size="sm" disabled={!hasNext || listQuery.isFetching} onClick={() => onPageChange(page + 1)}>Volgende</Button></div></div>}
  </div>;
}

function MigrationDialog({ open, onOpenChange, preview, execute }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Bestaande plannen voorbereiden</DialogTitle><DialogDescription>De controle is alleen-lezen uitgevoerd. Na bevestiging worden uitsluitend binnen dit object conceptrevisies gemaakt; er wordt niets gepubliceerd of uit de historie verwijderd.</DialogDescription></DialogHeader><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-border/70 bg-muted/15 p-3"><p className="text-2xl font-semibold tabular-nums">{Number(preview?.would_migrate_count || 0)}</p><p className="text-xs text-muted-foreground">kunnen worden voorbereid</p></div><div className="rounded-lg border border-border/70 bg-muted/15 p-3"><p className="text-2xl font-semibold tabular-nums">{Number(preview?.review_required_count || 0)}</p><p className="text-xs text-muted-foreground">vereisen daarna controle</p></div></div>{(preview?.items || []).some(item => item.status === "partial_v2_create_requires_recovery") && <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Minimaal één gedeeltelijk aangemaakt V2-plan vereist technisch herstel en wordt niet automatisch aangepast.</span></div>}<div className="flex items-start gap-2 rounded-lg border border-emerald-300/50 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Alle aangemaakte revisies blijven concept en moeten inhoudelijk worden nagekeken voordat publicatie mogelijk is.</span></div>{execute.error && <p className="text-xs text-destructive">{execute.error.message}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={execute.isPending}>Annuleren</Button><Button type="button" onClick={() => execute.mutate()} disabled={execute.isPending || Number(preview?.would_migrate_count || 0) === 0}>{execute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Ja, maak conceptrevisies</Button></DialogFooter></DialogContent></Dialog>;
}
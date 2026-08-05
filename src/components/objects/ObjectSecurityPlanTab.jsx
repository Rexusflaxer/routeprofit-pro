import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import SecurityPlanWizard from "./SecurityPlanWizard";
import SecurityPlanWorkspace from "./SecurityPlanWorkspace";
import {
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

function LibraryLoading() {
  return <div className="space-y-2 p-4" aria-label="Planbibliotheek laden" aria-busy="true">{[1, 2, 3, 4, 5].map(index => <div key={index} className="h-14 animate-pulse rounded-xl border border-border/70 bg-card/35 backdrop-blur-xl" />)}</div>;
}

function LibraryError({ error, onRetry }) {
  const forbidden = Number(error?.status) === 403;
  return <div className="m-4 flex min-h-72 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><div className="max-w-md"><AlertCircle className="mx-auto h-6 w-6 text-destructive" /><p className="mt-3 text-sm font-medium">{forbidden ? "Geen toegang tot beveiligingsplannen" : "De planbibliotheek kon niet worden geladen"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{forbidden ? "Uw object- of bedrijfsrechten geven geen toegang tot deze operationele plannen." : error?.message || "Probeer het opnieuw."}</p>{!forbidden && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw proberen</Button>}</div></div>;
}

function EmptyLibrary({ searching, archivedObject, onCreate }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center px-5 py-10 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">{searching ? <Search className="h-5 w-5 text-muted-foreground" /> : <BookOpenText className="h-5 w-5 text-muted-foreground" />}</div><p className="mt-3 text-sm font-medium">{searching ? "Geen planvarianten gevonden" : "Nog geen beveiligingsplannen"}</p><p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{searching ? "Pas de zoekopdracht of filters aan." : "Maak een eerste planvariant en werk daarna instructies, objectsecties en de voorgestelde looproute uit."}</p>{!searching && !archivedObject && <Button type="button" size="sm" className="mt-4" onClick={onCreate}><Plus className="h-3.5 w-3.5" /> Planvariant toevoegen</Button>}</div>;
}

function TypeFilters({ rows, active, onChange }) {
  const types = useMemo(() => [...new Set(rows.map(row => row.task_type).filter(Boolean))].sort((left, right) => securityPlanTaskTypeLabel(left).localeCompare(securityPlanTaskTypeLabel(right), "nl")), [rows]);
  return <div className="flex overflow-x-auto border-b border-border/70 bg-card/20 px-3" role="tablist" aria-label="Filter op taaktype"><button type="button" role="tab" aria-selected={active === "all"} onClick={() => onChange("all")} className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium ${active === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Alle</button>{types.map(key => <button key={key} type="button" role="tab" aria-selected={active === key} onClick={() => onChange(key)} className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium ${active === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{securityPlanTaskTypeLabel(key)}</button>)}</div>;
}

function PlanStatus({ plan }) {
  const status = securityPlanStatus(plan.status);
  return <div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={status.className}>{status.label}</Badge>{plan.status === "published" && plan.draft_revision_id && <Badge variant="outline" className="border-sky-300/70 bg-sky-500/10 text-sky-800 dark:text-sky-200">Conceptwijziging</Badge>}{plan.migration_required && <Badge variant="outline" className="border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200">Controle nodig</Badge>}</div>;
}

function LegacyMigrationBanner({ count, pending, onPreview }) {
  return <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-500/10 p-4 text-amber-950 backdrop-blur-xl dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-semibold">{count} bestaand{count === 1 ? " plan" : "e plannen"} voorbereiden</p><p className="mt-1 max-w-2xl text-xs leading-relaxed opacity-80">Deze plannen komen uit de eerdere opzet. Een beheerder kan eerst veilig bekijken wat wordt omgezet en daarna expliciet conceptrevisies laten maken. Er wordt niets gepubliceerd.</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-400/60 bg-background/70" onClick={onPreview} disabled={pending}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />} Voorbereiding controleren</Button></div>;
}

function PlanRows({ rows, onOpen }) {
  return <>
    <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25"><TableHead className="pl-4 text-xs">Taaktype & variant</TableHead><TableHead className="text-xs">Uitvoering</TableHead><TableHead className="text-xs">Secties</TableHead><TableHead className="text-xs">Duur</TableHead><TableHead className="text-xs">Route</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Revisie</TableHead><TableHead className="text-xs">Gewijzigd</TableHead><TableHead className="w-10 pr-4" /></TableRow></TableHeader><TableBody>{rows.map(plan => { const summary = plan.current_revision_summary || plan.current_revision || {}; return <TableRow key={plan.id} tabIndex={0} role="link" onClick={() => onOpen(plan.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(plan.id); } }} className="cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"><TableCell className="pl-4"><p className="text-xs text-muted-foreground">{securityPlanTaskTypeLabel(plan)}</p><p className="mt-0.5 font-medium text-foreground">{plan.variant_name}</p></TableCell><TableCell className="text-muted-foreground">{securityPlanExecutionModeLabel(plan.execution_mode)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{sectionSummary(summary)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{securityPlanDurationLabel(plan, summary)}</TableCell><TableCell>{summary.has_route ? <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><Route className="h-3.5 w-3.5" /> Ingetekend</span> : <span className="text-muted-foreground">Nog niet</span>}</TableCell><TableCell><PlanStatus plan={plan} /></TableCell><TableCell className="tabular-nums text-muted-foreground">{plan.latest_revision_number || summary.revision_number || 1}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(plan.updated_date)}</TableCell><TableCell className="pr-4 text-right"><ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></TableCell></TableRow>; })}</TableBody></Table></div>
    <div className="divide-y divide-border md:hidden">{rows.map(plan => { const summary = plan.current_revision_summary || plan.current_revision || {}; return <button key={plan.id} type="button" onClick={() => onOpen(plan.id)} className="block w-full px-4 py-3 text-left hover:bg-muted/25"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{securityPlanTaskTypeLabel(plan)}</p><p className="mt-0.5 truncate text-sm font-medium">{plan.variant_name}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{securityPlanDurationLabel(plan, summary)}</span><span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" />{sectionSummary(summary)}</span><span className="inline-flex items-center gap-1">{summary.has_route ? <Route className="h-3.5 w-3.5 text-emerald-600" /> : <Route className="h-3.5 w-3.5" />}{summary.has_route ? "Route" : "Geen route"}</span></div><div className="mt-2"><PlanStatus plan={plan} /></div></button>; })}</div>
  </>;
}

export default function ObjectSecurityPlanTab({ object, view, selectedRow, searchTerm, onSearchChange, page, onPageChange, onOpenCreate, onOpenEdit, onCloseView }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const createKeyRef = useRef(null);
  const migrationKeysRef = useRef({});
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const selectedType = searchParams.get("plan_type") || "all";
  const statusFilter = searchParams.get("plan_status") || "current";
  const archivedObject = object.status === "archived";
  const status = statusFilter === "current" ? null : statusFilter;
  const facetQuery = useQuery({ queryKey: ["object-card", object.id, "security-plans", "facets", statusFilter], queryFn: () => listObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, status, page: 1, pageSize: 100 }), retry: 1 });
  const listQuery = useQuery({ queryKey: ["object-card", object.id, "security-plans", "list", selectedType, statusFilter, searchTerm.trim(), page], queryFn: () => listObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, status, taskType: selectedType, search: searchTerm, page, pageSize: PAGE_SIZE }), retry: 1 });
  const rows = listQuery.data?.items || [];
  const facetRows = facetQuery.data?.items || rows;
  const migrationRequiredRows = facetRows.filter(plan => plan.migration_required);
  const total = Number(listQuery.data?.total || 0);
  const hasNext = page * PAGE_SIZE < total;
  const wizardOpen = view === "new" && !archivedObject;

  useEffect(() => {
    if (wizardOpen && !createKeyRef.current) createKeyRef.current = createSecurityPlanMutationKey("create");
    if (!wizardOpen) createKeyRef.current = null;
  }, [wizardOpen]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] });
  const create = useMutation({
    mutationFn: data => createObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, data, idempotencyKey: createKeyRef.current || createSecurityPlanMutationKey("create") }),
    onSuccess: async result => { await invalidate(); createKeyRef.current = null; const id = result?.plan?.id; toast({ title: "Planvariant aangemaakt", description: "Werk nu de instructies, secties en eventuele looproute uit." }); if (id) onOpenEdit(id); else onCloseView(); },
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

  const setType = key => { const next = new URLSearchParams(searchParams); if (key === "all") next.delete("plan_type"); else next.set("plan_type", key); next.delete("page"); next.delete("view"); next.delete("row"); setSearchParams(next); };
  const setStatus = value => { const next = new URLSearchParams(searchParams); if (value === "current") next.delete("plan_status"); else next.set("plan_status", value); next.delete("page"); next.delete("view"); next.delete("row"); setSearchParams(next); };

  if (view === "edit" && selectedRow) return <SecurityPlanWorkspace object={object} securityPlanId={selectedRow} onBack={onCloseView} onOpenPlan={onOpenEdit} />;
  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {wizardOpen && <SecurityPlanWizard saving={create.isPending} error={create.error} onCancel={onCloseView} onSave={data => create.mutate(data)} />}
    <div className="flex flex-col gap-3 border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-2xl xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Beveiligingsplan</h2><Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">Planbibliotheek</Badge></div><p className="mt-1 text-xs text-muted-foreground">Beheer per taaktype hoe deze werkzaamheden op dit object worden uitgevoerd.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek planvariant..." aria-label="Planbibliotheek doorzoeken" className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Zoekopdracht wissen"><X className="h-4 w-4" /></button>}</div><Select value={statusFilter} onValueChange={setStatus}><SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter op status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">Actieve plannen</SelectItem><SelectItem value="draft">Concepten</SelectItem><SelectItem value="published">Gepubliceerd</SelectItem><SelectItem value="archived">Gearchiveerd</SelectItem></SelectContent></Select>{!wizardOpen && <Button type="button" size="sm" onClick={onOpenCreate} disabled={archivedObject}><Plus className="h-3.5 w-3.5" /> Planvariant toevoegen</Button>}</div></div>
    <TypeFilters rows={facetRows} active={selectedType} onChange={setType} />
    {migrationRequiredRows.length > 0 && statusFilter !== "archived" && !archivedObject && <LegacyMigrationBanner count={migrationRequiredRows.length} pending={migrationPreview.isPending} onPreview={() => migrationPreview.mutate()} />}
    <div className="min-h-0 flex-1">{listQuery.isLoading ? <LibraryLoading /> : listQuery.isError ? <LibraryError error={listQuery.error} onRetry={() => listQuery.refetch()} /> : rows.length ? <PlanRows rows={rows} onOpen={onOpenEdit} /> : <EmptyLibrary searching={Boolean(searchTerm.trim() || selectedType !== "all" || statusFilter !== "current")} archivedObject={archivedObject} onCreate={onOpenCreate} />}</div>
    {(page > 1 || hasNext) && <div className="flex items-center justify-between border-t border-border/70 px-4 py-3"><p className="text-xs text-muted-foreground">Pagina {page} · {total} planvariant{total === 1 ? "" : "en"}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1 || listQuery.isFetching} onClick={() => onPageChange(page - 1)}>Vorige</Button><Button type="button" variant="outline" size="sm" disabled={!hasNext || listQuery.isFetching} onClick={() => onPageChange(page + 1)}>Volgende</Button></div></div>}
    <Dialog open={migrationDialogOpen} onOpenChange={open => { if (migrationExecute.isPending) return; setMigrationDialogOpen(open); if (!open) migrationPreview.reset(); }}><DialogContent><DialogHeader><DialogTitle>Bestaande plannen voorbereiden</DialogTitle><DialogDescription>De controle is alleen-lezen uitgevoerd. Na bevestiging worden uitsluitend binnen dit object conceptrevisies gemaakt; er wordt niets gepubliceerd of uit de historie verwijderd.</DialogDescription></DialogHeader><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-border/70 bg-muted/15 p-3"><p className="text-2xl font-semibold tabular-nums">{Number(migrationPreview.data?.would_migrate_count || 0)}</p><p className="text-xs text-muted-foreground">kunnen worden voorbereid</p></div><div className="rounded-lg border border-border/70 bg-muted/15 p-3"><p className="text-2xl font-semibold tabular-nums">{Number(migrationPreview.data?.review_required_count || 0)}</p><p className="text-xs text-muted-foreground">vereisen daarna controle</p></div></div>{(migrationPreview.data?.items || []).some(item => item.status === "partial_v2_create_requires_recovery") && <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Minimaal één gedeeltelijk aangemaakt V2-plan vereist technisch herstel en wordt niet automatisch aangepast.</span></div>}<div className="flex items-start gap-2 rounded-lg border border-emerald-300/50 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Alle aangemaakte revisies blijven concept en moeten inhoudelijk worden nagekeken voordat publicatie mogelijk is.</span></div>{migrationExecute.error && <p className="text-xs text-destructive">{migrationExecute.error.message}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => { setMigrationDialogOpen(false); migrationPreview.reset(); }} disabled={migrationExecute.isPending}>Annuleren</Button><Button type="button" onClick={() => migrationExecute.mutate()} disabled={migrationExecute.isPending || Number(migrationPreview.data?.would_migrate_count || 0) === 0}>{migrationExecute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Ja, maak conceptrevisies</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

import React from "react";
import { ChevronRight, Layers3, PauseCircle, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getObjectModuleDefinition,
  objectModuleReadiness,
  objectModuleRevisionStatus,
  objectModuleStatus,
  objectModuleTypeLabel,
} from "./objectModuleConfig";

function revisionFor(module) {
  return module.draft_revision || module.published_revision || module.current_revision_summary || null;
}

function counts(module) {
  const configuration = revisionFor(module)?.configuration || {};
  return {
    fields: module.field_count || configuration.field_definitions?.filter(field => field.enabled !== false).length || 0,
    catalog: module.catalog_item_count || configuration.catalog_items?.filter(item => item.status !== "inactive").length || 0,
    lists: module.reference_list_count || configuration.reference_lists?.length || 0,
  };
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function ModuleIdentity({ module }) {
  const definition = getObjectModuleDefinition(module);
  const Icon = definition?.icon || Layers3;
  return <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/60 shadow-sm"><Icon className="h-4 w-4 text-primary" /></span><span className="min-w-0"><span className="block truncate font-medium">{module.name || definition?.label || "Objectmodule"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{definition?.description || objectModuleTypeLabel(module)}</span></span></div>;
}

function StatusBadges({ module }) {
  const status = objectModuleStatus(module.status);
  const revision = revisionFor(module);
  const revisionStatus = objectModuleRevisionStatus(revision?.status || (module.published_revision ? "published" : "draft"));
  return <div className="flex flex-wrap gap-1"><Badge variant="outline" className={`text-[11px] ${status.className}`}>{status.label}</Badge><Badge variant="outline" className={`text-[11px] ${revisionStatus.className}`}>{revisionStatus.label}</Badge></div>;
}

export default function ObjectModuleTable({ modules, onOpen, onStatusChange, disabled = false, statusPendingId = null }) {
  return <>
    <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-card/25 hover:bg-card/25"><TableHead>Module</TableHead><TableHead className="w-40">Inrichting</TableHead><TableHead className="w-36">Beveiligingsplannen</TableHead><TableHead className="w-44">Status</TableHead><TableHead className="w-36">Gewijzigd</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{modules.map(module => { const moduleCounts = counts(module); const readiness = module.current_revision_summary?.readiness_status ? { ready: module.current_revision_summary.readiness_status !== "blocked" } : objectModuleReadiness(module, revisionFor(module)); const active = module.status === "active"; const canToggle = ["active", "suspended"].includes(module.status); return <TableRow key={module.id} tabIndex={0} onClick={() => onOpen(module)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(module); } }} className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><TableCell className="max-w-lg"><ModuleIdentity module={module} /></TableCell><TableCell><p className="text-sm">{moduleCounts.fields} veld{moduleCounts.fields === 1 ? "" : "en"}</p><p className="mt-0.5 text-xs text-muted-foreground">{moduleCounts.catalog} catalogus · {moduleCounts.lists} lijst{moduleCounts.lists === 1 ? "" : "en"}</p>{!readiness.ready && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Inrichting onvolledig</p>}</TableCell><TableCell><p className="text-sm">{module.plan_link_count || 0} gekoppeld</p><p className="mt-0.5 text-xs text-muted-foreground">Gedeelde objectdata</p></TableCell><TableCell><StatusBadges module={module} /></TableCell><TableCell className="text-xs text-muted-foreground">{formatDateTime(module.updated_date || module.updated_at)}</TableCell><TableCell><div className="flex items-center justify-end">{canToggle && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100" disabled={disabled || statusPendingId === module.id} aria-label={active ? `${module.name} pauzeren` : `${module.name} hervatten`} onClick={event => { event.stopPropagation(); onStatusChange(module, active ? "suspended" : "active"); }} onKeyDown={event => event.stopPropagation()}>{active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}</Button>}<ChevronRight className="h-4 w-4 text-muted-foreground" /></div></TableCell></TableRow>; })}</TableBody></Table></div>
    <div className="divide-y divide-border/70 md:hidden">{modules.map(module => { const definition = getObjectModuleDefinition(module); const Icon = definition?.icon || Layers3; const moduleCounts = counts(module); const active = module.status === "active"; const canToggle = ["active", "suspended"].includes(module.status); return <article key={module.id} className="bg-card/20 px-4 py-3"><button type="button" onClick={() => onOpen(module)} className="w-full text-left"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card/60"><Icon className="h-4 w-4 text-primary" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{module.name || definition?.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{objectModuleTypeLabel(module)}</span></span><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadges module={module} /><span className="text-xs text-muted-foreground">{moduleCounts.fields} velden · {module.plan_link_count || 0} plannen</span></div></button>{canToggle && <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2 text-xs" disabled={disabled || statusPendingId === module.id} onClick={() => onStatusChange(module, active ? "suspended" : "active")}>{active ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}{active ? "Pauzeren" : "Hervatten"}</Button>}</article>; })}</div>
  </>;
}

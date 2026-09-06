import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  ContactRound,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Inbox,
  KeyRound,
  ListChecks,
  LockKeyhole,
  MapPin,
  Navigation,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { base44 } from "@/api/base44Client";
import {
  CONTACT_ROLE_LABELS,
  RECORD_STATUS_LABELS,
  formatDate,
  formatDateTime,
  getContactName,
} from "@/components/customers/customerDossierUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { objectCoordinatePair } from "@/lib/coordinates";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ObjectFloorPlanTab from "./ObjectFloorPlanTab";
import {
  GEOCODING_CLASSES,
  GEOCODING_LABELS,
  INSTRUCTION_FIELDS,
  OBJECT_DOSSIER_TABS,
  OBJECT_STATUS_LABELS,
  RESTRICTED_INSTRUCTION_FIELDS,
  buildObjectReadiness,
  getObjectStatus,
  getObjectTypeLabel,
  objectAddress,
} from "./objectDossierConfig";

const TABLE_QUERY_LIMIT = 250;
const TASK_EXECUTION_FIELDS = ["id", "object_id", "task_name", "task_type", "object_name", "status", "planned_arrival_time", "planned_start_time", "actual_completed_at", "duration_minutes", "financial_review_status", "billing_status"];
const MOBILE_REPORT_OVERVIEW_FIELDS = ["id", "object_id", "report_type", "status", "created_at", "submitted_at", "photo_count"];
const MOBILE_REPORT_FIELDS = ["id", "object_id", "report_type", "status", "report_text", "created_at", "submitted_at", "photo_count"];
const MANAGED_FILE_FIELDS = ["id", "object_id", "owner_type", "owner_id", "display_filename", "display_name", "download_filename", "original_filename", "document_label", "category", "version", "valid_from", "valid_until", "status", "security_classification", "uploaded_at", "created_date", "updated_date"];
const CUSTOMER_EVENT_FIELDS = ["id", "customer_id", "object_id", "event_type", "category", "action", "actor_type", "actor_name", "outcome", "summary", "external_reference", "occurred_at", "created_at", "created_date"];
const PORTAL_PUBLICATION_FIELDS = ["id", "object_id", "source_id", "publication_type", "status", "version", "published_at", "valid_from", "valid_until"];
const CONTACT_POINT_FIELDS = ["id", "customer_id", "contact_id", "point_type", "value", "is_primary", "status", "created_date", "updated_date"];
const CUSTOMER_CONTRACT_FIELDS = ["id", "customer_id", "contract_number", "title", "status", "start_date", "end_date"];
const PLANNING_SHIFT_FIELDS = ["id", "object_id", "object_ids", "service_name_snapshot", "service_date", "start_time", "end_time", "duration_minutes", "required_count", "status"];

async function projectedFilter(entityName, filter, sort, fields, limit = TABLE_QUERY_LIMIT) {
  const entity = base44.entities?.[entityName];
  if (!entity?.filter) return [];
  const result = await entity.filter(filter, sort, limit, 0, fields);
  return Array.isArray(result) ? result : [];
}

function currentDateKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function recordIsCurrent(record, today = currentDateKey()) {
  const validFrom = String(record?.valid_from || "").slice(0, 10);
  const validUntil = String(record?.valid_until || "").slice(0, 10);
  return (!record?.status || record.status === "active")
    && (!validFrom || validFrom <= today)
    && (!validUntil || validUntil >= today);
}

function hasCoordinatePair(object) {
  return objectCoordinatePair(object) !== null;
}

function useObjectRecords(entityName, objectId, enabled, sort = "-created_date", extraFilter = {}, fields, limit = TABLE_QUERY_LIMIT) {
  return useQuery({
    queryKey: ["object-dossier", objectId, entityName, extraFilter, sort, fields, limit],
    queryFn: () => projectedFilter(entityName, { object_id: objectId, ...extraFilter }, sort, fields, limit),
    enabled: Boolean(objectId && enabled),
    retry: 1,
  });
}

function useCustomerRecords(entityName, customerId, enabled, sort = "-created_date", fields, limit = TABLE_QUERY_LIMIT) {
  return useQuery({
    queryKey: ["object-dossier", customerId, entityName, sort, fields, limit],
    queryFn: () => projectedFilter(entityName, { customer_id: customerId }, sort, fields, limit),
    enabled: Boolean(customerId && enabled),
    retry: 1,
  });
}

function useObjectFiles(objectId, enabled) {
  return useQuery({
    queryKey: ["object-dossier", objectId, "ManagedFile", "scoped"],
    queryFn: async () => {
      const [scoped, owned] = await Promise.all([
        projectedFilter("ManagedFile", { object_id: objectId }, "-uploaded_at", MANAGED_FILE_FIELDS),
        projectedFilter("ManagedFile", { owner_type: "object", owner_id: objectId }, "-uploaded_at", MANAGED_FILE_FIELDS),
      ]);
      return [...new Map([...scoped, ...owned].map(file => [file.id, file])).values()]
        .sort((left, right) => String(right.uploaded_at || right.created_date || "").localeCompare(String(left.uploaded_at || left.created_date || "")));
    },
    enabled: Boolean(objectId && enabled),
    retry: 1,
  });
}

function usePlanningShifts(objectId, enabled, { sort = "service_date", extraFilter = {}, limit = TABLE_QUERY_LIMIT } = {}) {
  return useQuery({
    queryKey: ["object-dossier", objectId, "PlanningShift", "all-scopes", sort, extraFilter, limit],
    queryFn: async () => {
      const [direct, grouped] = await Promise.all([
        projectedFilter("PlanningShift", { object_id: objectId, ...extraFilter }, sort, PLANNING_SHIFT_FIELDS, limit),
        projectedFilter("PlanningShift", { object_ids: { $all: [objectId] }, ...extraFilter }, sort, PLANNING_SHIFT_FIELDS, limit),
      ]);
      const direction = sort.startsWith("-") ? -1 : 1;
      return [...new Map([...direct, ...grouped].map(shift => [shift.id, shift])).values()]
        .sort((left, right) => direction * String(`${left.service_date || ""}|${left.start_time || ""}|${left.id || ""}`).localeCompare(`${right.service_date || ""}|${right.start_time || ""}|${right.id || ""}`));
    },
    enabled: Boolean(objectId && enabled),
    retry: 1,
  });
}

function activeContactPointValue(points, contactId, type) {
  return points.find(point => (
    point.contact_id === contactId
    && point.point_type === type
    && recordIsCurrent(point)
  ))?.value || "";
}

function LoadingState({ label = "Objectgegevens laden..." }) {
  return (
    <div className="space-y-3 p-4" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      {[1, 2, 3].map(item => <div key={item} className="h-11 animate-pulse rounded-md border border-border bg-muted/30" />)}
    </div>
  );
}

function ErrorState({ query, label = "De gegevens konden niet worden geladen." }) {
  return (
    <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{query.error?.message || "Probeer het opnieuw."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>
      </div>
    </div>
  );
}

function QueryGate({ queries = [], children }) {
  const loading = queries.find(query => query?.isLoading);
  if (loading) return <LoadingState />;
  const failed = queries.find(query => query?.isError);
  if (failed) return <ErrorState query={failed} />;
  return children;
}

function SectionPanel({ title, description, action = null, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-border bg-card ${className}`}>
      {(title || action) && (
        <div className="flex flex-col gap-3 border-b border-border bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon = Inbox, title, description, action = null }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const value = status || "draft";
  const tone = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    published: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    synced: "border-blue-200 bg-blue-50 text-blue-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    failed: "border-red-200 bg-red-50 text-red-700",
    archived: "border-slate-200 bg-slate-100 text-slate-600",
  }[value] || "border-border bg-muted/40 text-muted-foreground";
  return <Badge variant="outline" className={`whitespace-nowrap text-[11px] font-medium ${tone}`}>{RECORD_STATUS_LABELS[value] || OBJECT_STATUS_LABELS[value] || String(value).replaceAll("_", " ")}</Badge>;
}

function TableToolbar({ value, onChange, placeholder, action = null }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-9 pl-9 pr-9" />
        {value && <button type="button" onClick={() => onChange("")} aria-label="Zoekopdracht wissen" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {action && <div className="sm:ml-auto">{action}</div>}
    </div>
  );
}

function ResponsiveTable({ rows, columns, onRowClick, selectedRowKey, getRowKey = row => row.id }) {
  if (!rows.length) return null;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader><TableRow className="bg-muted/20">{columns.map(column => <TableHead key={column.key} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{column.label}</TableHead>)}{onRowClick && <TableHead className="w-8" />}</TableRow></TableHeader>
          <TableBody>
            {rows.map(row => {
              const key = getRowKey(row);
              return (
                <TableRow
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? "cursor-pointer" : ""} ${selectedRowKey === key ? "bg-primary/5" : "hover:bg-muted/25"}`}
                >
                  {columns.map(column => <TableCell key={column.key} className={column.className || "text-sm"}>{column.render(row)}</TableCell>)}
                  {onRowClick && (
                    <TableCell>
                      <button
                        type="button"
                        aria-label="Details openen"
                        aria-expanded={selectedRowKey === key}
                        onClick={event => {
                          event.stopPropagation();
                          onRowClick(row);
                        }}
                        className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map(row => {
          const key = getRowKey(row);
          const MobileRow = onRowClick ? "button" : "div";
          return (
            <MobileRow key={key} type={onRowClick ? "button" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`w-full space-y-2 px-4 py-3 text-left ${selectedRowKey === key ? "bg-primary/5" : "hover:bg-muted/25"}`}>
              {columns.map(column => <div key={column.key} className="grid grid-cols-[108px_1fr] gap-3 text-sm"><span className="text-xs text-muted-foreground">{column.label}</span><div className="min-w-0">{column.render(row)}</div></div>)}
            </MobileRow>
          );
        })}
      </div>
    </>
  );
}

function RecordInspector({ record, title, description, items, action = null, onClose }) {
  return (
    <Sheet open={Boolean(record)} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
        {record && (
          <div className="mt-6 space-y-2">
            {items.filter(item => item.value !== undefined && item.value !== null && item.value !== "").map(item => (
              <div key={item.label} className="rounded-md border border-border px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <div className="mt-1 break-words text-sm text-foreground">{item.value}</div>
              </div>
            ))}
            {action && <div className="pt-3">{action}</div>}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = "default" }) {
  const iconTone = tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : tone === "positive" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-muted-foreground";
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-start gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${iconTone}`}><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-semibold text-foreground">{value}</p>{hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}</div></div></div>;
}

function OverviewTab({ object, tasks, scopedContacts, contractLines, onTabChange }) {
  const today = currentDateKey();
  const executionsQuery = useObjectRecords("TaskExecution", object.id, true, "-actual_completed_at", {}, TASK_EXECUTION_FIELDS, 50);
  const reportsQuery = useObjectRecords("MobileReport", object.id, true, "-created_at", {}, MOBILE_REPORT_OVERVIEW_FIELDS, 50);
  const documentsQuery = useObjectFiles(object.id, true);
  const eventsQuery = useObjectRecords("CustomerEvent", object.id, true, "-occurred_at", {}, CUSTOMER_EVENT_FIELDS, 12);
  const shiftsQuery = usePlanningShifts(object.id, true, {
    extraFilter: { service_date: { $gte: today }, status: "published" },
    limit: 12,
  });

  return (
    <QueryGate queries={[executionsQuery, reportsQuery, documentsQuery, eventsQuery, shiftsQuery]}>
      {(() => {
        const readiness = buildObjectReadiness({ object, scopedContacts, tasks, contractLines });
        const incomplete = readiness.filter(item => !item.complete);
        const executions = executionsQuery.data || [];
        const reports = reportsQuery.data || [];
        const documents = documentsQuery.data || [];
        const events = eventsQuery.data || [];
        const nextShift = (shiftsQuery.data || [])[0];
        return (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ListChecks} label="Operationele taken" value={tasks.length} hint={`${executions.length} uitvoeringen vastgelegd`} />
              <StatCard icon={CalendarClock} label="Eerstvolgende inzet" value={nextShift ? formatDate(nextShift.service_date) : "Niet gepland"} hint={nextShift?.service_name_snapshot || nextShift?.start_time || "Geen gepubliceerde dienst"} />
              <StatCard icon={FileText} label="Rapportages" value={reports.length} hint={reports[0] ? `Laatste: ${formatDateTime(reports[0].created_at)}` : "Nog geen rapport"} />
              <StatCard icon={TriangleAlert} label="Aandachtspunten" value={incomplete.length} hint={incomplete.length ? "Objectinrichting aanvullen" : "Basisinrichting compleet"} tone={incomplete.length ? "warning" : "positive"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <SectionPanel title="Object gereedmaken" description="De vereisten blijven dienstafhankelijk; dit is de basiscontrole voor de huidige app.">
                <div className="divide-y divide-border">
                  {readiness.map(item => (
                    <button key={item.key} type="button" onClick={() => onTabChange(item.tab)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/25">
                      {item.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span></span>
                      <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </SectionPanel>
              <SectionPanel title="Recente activiteit" description="Append-only gebeurtenissen voor dit object.">
                {events.length ? <div className="divide-y divide-border">{events.slice(0, 6).map(event => <div key={event.id} className="px-4 py-3"><div className="flex items-start gap-3"><History className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{event.summary || event.action?.replaceAll("_", " ") || event.event_type}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(event.occurred_at || event.created_at)}</p></div></div></div>)}</div> : <EmptyState icon={History} title="Nog geen historie" description="Objectwijzigingen en operationele gebeurtenissen verschijnen hier." />}
              </SectionPanel>
            </div>

            {documents.some(file => file.valid_until && file.valid_until < today && (!file.status || file.status === "active")) && (
              <button type="button" onClick={() => onTabChange("documents")} className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-amber-950">
                <TriangleAlert className="h-4 w-4" /><span className="flex-1 text-sm font-medium">Eén of meer objectdocumenten zijn verlopen.</span><ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })()}
    </QueryGate>
  );
}

function DetailsTab({ object, customer, collectives, onEdit }) {
  const geocode = object.geocoding_status || "unverified";
  const rows = [
    ["Objectnaam", object.name || "—"],
    ["Objectcode", object.object_code || "—"],
    ["Objecttype", getObjectTypeLabel(object.object_type)],
    ["Klant", customer?.trade_name || customer?.name || customer?.legal_name || "—"],
    ["Status", OBJECT_STATUS_LABELS[getObjectStatus(object)] || getObjectStatus(object)],
    ["Regio", object.region || "—"],
    ["Collectief", collectives.length ? collectives.map(item => item.name).join(", ") : "—"],
    ["Adres", objectAddress(object)],
    ["Land", object.country_name || object.country_code || "Nederland"],
    ["BAG-referentie", object.bag_address_id || "—"],
  ];
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <SectionPanel title="Identiteit en locatie" description="De fysieke operationele locatie; commerciële klantgegevens blijven op de klantenkaart." action={<Button size="sm" variant="outline" onClick={onEdit} disabled={getObjectStatus(object) === "archived"}><Pencil className="h-3.5 w-3.5" /> Wijzigen</Button>}>
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {rows.map(([label, value]) => <div key={label} className="bg-card px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p></div>)}
        </div>
      </SectionPanel>
      <SectionPanel title="Kaartpositie" description="Een mobiele objectkaart wordt alleen aangezet bij een gecontroleerde positie.">
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/30"><Navigation className="h-4 w-4 text-muted-foreground" /></div><div><Badge variant="outline" className={`${GEOCODING_CLASSES[geocode] || ""}`}>{GEOCODING_LABELS[geocode] || geocode}</Badge><p className="mt-2 text-xs text-muted-foreground">{hasCoordinatePair(object) ? `${Number(object.latitude).toFixed(6)}, ${Number(object.longitude).toFixed(6)}` : "Nog geen coördinaten vastgelegd"}</p></div></div>
          <div className="text-left md:text-right"><p className="text-xs text-muted-foreground">Mobiele zichtbaarheid</p><p className="text-sm font-medium">{getObjectStatus(object) === "active" && hasCoordinatePair(object) && ["verified", "manual"].includes(geocode) && object.show_on_mobile_map ? "Ingeschakeld" : "Uitgeschakeld"}</p></div>
        </div>
      </SectionPanel>
    </div>
  );
}

function ContactsTab({ object, customer, scopedContacts, contactRoles, searchTerm, onSearchChange, selectedRow, onSelectRow, navigate }) {
  const pointsQuery = useCustomerRecords("CustomerContactPoint", customer?.id, true, "-updated_date", CONTACT_POINT_FIELDS);
  return (
    <QueryGate queries={[pointsQuery]}>
      {(() => {
        const points = pointsQuery.data || [];
        const term = searchTerm.trim().toLowerCase();
        const rows = scopedContacts.filter(contact => [getContactName(contact), contact.job_title, activeContactPointValue(points, contact.id, "email"), activeContactPointValue(points, contact.id, "phone"), activeContactPointValue(points, contact.id, "mobile")].some(value => String(value || "").toLowerCase().includes(term)));
        const selected = scopedContacts.find(item => item.id === selectedRow);
        const roleMatchesObject = role => (
          recordIsCurrent(role)
          && (!(role.object_ids || []).length || role.object_ids.includes(object.id))
        );
        const selectedRoles = selected ? contactRoles.filter(role => role.contact_id === selected.id && roleMatchesObject(role)) : [];
        const roleLabels = contact => [...new Set(contactRoles.filter(role => role.contact_id === contact.id && roleMatchesObject(role)).map(role => CONTACT_ROLE_LABELS[role.role] || role.role))];
        const columns = [
          { key: "name", label: "Naam", render: item => <span className="font-medium text-foreground">{getContactName(item)}</span> },
          { key: "function", label: "Functie", render: item => item.job_title || "—" },
          { key: "roles", label: "Rollen", render: item => roleLabels(item).length ? roleLabels(item).join(", ") : "Algemeen contact" },
          { key: "email", label: "E-mail", render: item => activeContactPointValue(points, item.id, "email") || "—" },
          { key: "phone", label: "Telefoon", render: item => activeContactPointValue(points, item.id, "mobile") || activeContactPointValue(points, item.id, "phone") || "—" },
          { key: "scope", label: "Objectscope", render: () => "Dit object" },
          { key: "updated", label: "Gewijzigd", render: item => formatDate(item.updated_date || item.created_date) },
        ];
        return (
          <div className="p-4 sm:p-5">
            <SectionPanel title="Objectcontacten" description="Contactidentiteit blijft op klantniveau; deze tabel toont alleen contacten met klantbrede of expliciete objectscope.">
              <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek contact, functie of kanaal..." action={<Button size="sm" variant="outline" onClick={() => navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=contacts&contact_object=${encodeURIComponent(object.id)}`)}>Contacten beheren <ArrowUpRight className="h-3.5 w-3.5" /></Button>} />
              {!rows.length ? <EmptyState icon={ContactRound} title={searchTerm ? "Geen contacten gevonden" : "Nog geen objectcontacten"} description={searchTerm ? "Pas de zoekopdracht aan." : "Koppel een bestaand klantcontact aan dit object vanuit de klantenkaart."} /> : <ResponsiveTable rows={rows} columns={columns} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
            </SectionPanel>
            <RecordInspector record={selected} title={selected ? getContactName(selected) : "Contact"} description="Objectgescope contactgegevens uit het klantdossier." onClose={() => onSelectRow(null)} items={selected ? [
              { label: "Functie", value: selected.job_title || "—" },
              { label: "Afdeling", value: selected.department || "—" },
              { label: "E-mail", value: activeContactPointValue(points, selected.id, "email") || "—" },
              { label: "Telefoon", value: activeContactPointValue(points, selected.id, "mobile") || activeContactPointValue(points, selected.id, "phone") || "—" },
              { label: "Rollen", value: selectedRoles.map(role => CONTACT_ROLE_LABELS[role.role] || role.role).join(", ") || "Algemeen contact" },
              { label: "Status", value: <StatusBadge status={selected.status || "active"} /> },
            ] : []} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function InstructionsTab({ object, onEdit }) {
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <SectionPanel title="Operationele instructies" description="Blijvende objectinstructies. Versiebeheer en acknowledgements worden in een volgende backendfase toegevoegd." action={<Button size="sm" onClick={onEdit} disabled={getObjectStatus(object) === "archived"}><Pencil className="h-3.5 w-3.5" /> Instructies wijzigen</Button>}>
        <div className="grid gap-px bg-border md:grid-cols-2">
          {INSTRUCTION_FIELDS.map(field => <div key={field.key} className="min-h-28 bg-card p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold">{field.label}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{object[field.key] || "Nog niet vastgelegd."}</p></div>)}
        </div>
      </SectionPanel>
      <SectionPanel title="Beperkt toegankelijke informatie" description="Inhoud wordt niet door dit dossier opgevraagd of in zoekresultaten en klantpublicaties opgenomen.">
        <div className="divide-y divide-border">
          {RESTRICTED_INSTRUCTION_FIELDS.map(field => <div key={field.key} className="flex items-center gap-3 px-4 py-3"><LockKeyhole className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{field.label}</p><p className="text-xs text-muted-foreground">Beheer wordt pas vrijgegeven met server-side step-up-authenticatie en read-audit.</p></div><Badge variant="outline" className="text-[11px] text-muted-foreground">Afgeschermd</Badge></div>)}
        </div>
      </SectionPanel>
    </div>
  );
}

function SubTabs({ value, onChange, tabs }) {
  const moveFocus = (event, index) => {
    let nextIndex;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[nextIndex].key);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  return <div className="flex overflow-x-auto border-b border-border bg-muted/10" role="tablist" aria-label="Planningweergave">{tabs.map((tab, index) => <button key={tab.key} type="button" role="tab" aria-selected={value === tab.key} tabIndex={value === tab.key ? 0 : -1} onKeyDown={event => moveFocus(event, index)} onClick={() => onChange(tab.key)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium ${value === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}</div>;
}

function PlanningTab({ object, tasks, view, onViewChange, searchTerm, onSearchChange, selectedRow, onSelectRow, navigate }) {
  const allowedView = ["tasks", "shifts", "executions"].includes(view) ? view : "tasks";
  const shiftsQuery = usePlanningShifts(object.id, allowedView === "shifts");
  const executionsQuery = useObjectRecords("TaskExecution", object.id, allowedView === "executions", "-planned_start_time", {}, TASK_EXECUTION_FIELDS);
  const sourceRows = allowedView === "tasks" ? tasks : allowedView === "shifts" ? (shiftsQuery.data || []) : (executionsQuery.data || []);
  const term = searchTerm.trim().toLowerCase();
  const rows = sourceRows.filter(item => JSON.stringify([item.task_name, item.task_type, item.service_name_snapshot, item.status, item.object_name, item.billing_status, item.time_window_start, item.time_window_end]).toLowerCase().includes(term));
  const selected = sourceRows.find(item => item.id === selectedRow);
  const columns = allowedView === "tasks" ? [
    { key: "task", label: "Taak", render: item => <span className="font-medium">{item.task_type || item.name || "Taak"}</span> },
    { key: "scope", label: "Scope", render: item => item._object_scope || (item.object_id === object.id ? "Object" : "Collectief") },
    { key: "window", label: "Tijdvenster", render: item => [item.time_window_start, item.time_window_end].filter(Boolean).join(" – ") || "—" },
    { key: "duration", label: "Duur", render: item => item.duration_minutes ? `${item.duration_minutes} min` : "—" },
    { key: "repeat", label: "Uitvoeringen", render: item => Number(item.repeat_count || 1) },
  ] : allowedView === "shifts" ? [
    { key: "date", label: "Datum", render: item => formatDate(item.service_date) },
    { key: "service", label: "Dienst", render: item => <span className="font-medium">{item.service_name_snapshot || "Dienst"}</span> },
    { key: "time", label: "Tijd", render: item => [item.start_time, item.end_time].filter(Boolean).join(" – ") || "—" },
    { key: "required", label: "Bezetting", render: item => Number(item.required_count || 1) },
    { key: "status", label: "Status", render: item => <StatusBadge status={item.status} /> },
  ] : [
    { key: "task", label: "Uitvoering", render: item => <span className="font-medium">{item.task_name || item.task_type || "Uitvoering"}</span> },
    { key: "planned", label: "Gepland", render: item => formatDateTime(item.planned_start_time || item.planned_arrival_time) },
    { key: "actual", label: "Afgerond", render: item => formatDateTime(item.actual_completed_at) },
    { key: "status", label: "Status", render: item => <StatusBadge status={item.status} /> },
    { key: "billing", label: "Financieel", render: item => <StatusBadge status={item.financial_review_status || item.billing_status || "not_reviewed"} /> },
  ];
  const activeQuery = allowedView === "shifts" ? shiftsQuery : allowedView === "executions" ? executionsQuery : null;
  return (
    <div className="p-4 sm:p-5">
      <SectionPanel title="Planning en uitvoering" description="Objectweergave voor controle; zware roosterwijzigingen blijven in de centrale planning.">
        <SubTabs value={allowedView} onChange={onViewChange} tabs={[{ key: "tasks", label: "Taken" }, { key: "shifts", label: "Planning" }, { key: "executions", label: "Uitvoeringen" }]} />
        <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek in deze tabel..." action={<Button size="sm" variant="outline" onClick={() => navigate("/Planning?perspective=object")}>Naar centrale planning <ExternalLink className="h-3.5 w-3.5" /></Button>} />
        {activeQuery?.isLoading ? <LoadingState /> : activeQuery?.isError ? <ErrorState query={activeQuery} /> : !rows.length ? <EmptyState icon={Clock3} title={searchTerm ? "Geen resultaten" : `Nog geen ${allowedView === "tasks" ? "taken" : allowedView === "shifts" ? "diensten" : "uitvoeringen"}`} description="Zodra deze gegevens zijn ingericht, verschijnen ze in deze objecttabel." /> : <ResponsiveTable rows={rows} columns={columns} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
      </SectionPanel>
      <RecordInspector record={selected} title={selected?.task_name || selected?.service_name_snapshot || selected?.task_type || "Operationeel record"} description="Alleen-lezen objectprojectie. Wijzigen gebeurt in de bijbehorende werkruimte." onClose={() => onSelectRow(null)} items={selected ? [
        ...(allowedView === "tasks" ? [] : [{ label: "Status", value: <StatusBadge status={selected.status} /> }]),
        { label: "Datum", value: formatDate(selected.service_date || selected.planned_start_time) },
        { label: "Tijdvenster", value: [selected.start_time || selected.time_window_start, selected.end_time || selected.time_window_end].filter(Boolean).join(" – ") || "—" },
        { label: "Duur", value: selected.duration_minutes ? `${selected.duration_minutes} minuten` : "—" },
        { label: "Financiële review", value: selected.financial_review_status ? <StatusBadge status={selected.financial_review_status} /> : "Niet van toepassing" },
      ] : []} />
    </div>
  );
}

function ReportsTab({ object, searchTerm, onSearchChange, selectedRow, onSelectRow }) {
  const query = useObjectRecords("MobileReport", object.id, true, "-created_at", {}, MOBILE_REPORT_FIELDS);
  const publicationsQuery = useObjectRecords("CustomerPortalPublication", object.id, true, "-published_at", { publication_type: "report" }, PORTAL_PUBLICATION_FIELDS);
  const reports = query.data || [];
  const term = searchTerm.trim().toLowerCase();
  const rows = reports.filter(item => JSON.stringify([item.report_type, item.status, item.report_text]).toLowerCase().includes(term));
  const selected = reports.find(item => item.id === selectedRow);
  const publicationFor = report => (publicationsQuery.data || []).find(publication => publication.source_id === report.id && publication.status === "published")
    || (publicationsQuery.data || []).find(publication => publication.source_id === report.id);
  return (
    <div className="p-4 sm:p-5">
      <SectionPanel title="Rapportages" description="Interne rapportrecords. Klantpublicatie is een afzonderlijke, expliciete publicatieversie.">
        <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek type, status of inhoud..." />
        {query.isLoading || publicationsQuery.isLoading ? <LoadingState /> : query.isError || publicationsQuery.isError ? <ErrorState query={query.isError ? query : publicationsQuery} /> : !rows.length ? <EmptyState icon={FileText} title={searchTerm ? "Geen rapportages gevonden" : "Nog geen rapportages"} description="Rapportages uit uitgevoerde objecttaken verschijnen hier." /> : <ResponsiveTable rows={rows} columns={[
          { key: "type", label: "Type", render: item => <span className="font-medium">{item.report_type || "Objectrapport"}</span> },
          { key: "created", label: "Aangemaakt", render: item => formatDateTime(item.created_at) },
          { key: "submitted", label: "Ingediend", render: item => formatDateTime(item.submitted_at) },
          { key: "photos", label: "Foto's", render: item => Number(item.photo_count || 0) },
          { key: "publication", label: "Klantpublicatie", render: item => publicationFor(item) ? <StatusBadge status={publicationFor(item).status} /> : "Niet gepubliceerd" },
          { key: "status", label: "Status", render: item => <StatusBadge status={item.status} /> },
        ]} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
      </SectionPanel>
      <RecordInspector record={selected} title={selected?.report_type || "Objectrapport"} description="GPS, medewerker-ID's en ruwe fotolinks worden niet in dit inspectiepaneel getoond." onClose={() => onSelectRow(null)} items={selected ? [
        { label: "Status", value: <StatusBadge status={selected.status} /> },
        { label: "Aangemaakt", value: formatDateTime(selected.created_at) },
        { label: "Ingediend", value: formatDateTime(selected.submitted_at) },
        { label: "Rapport", value: selected.report_text || "Geen rapporttekst" },
        { label: "Foto's", value: Number(selected.photo_count || 0) },
        { label: "Klantpublicatie", value: publicationFor(selected) ? <StatusBadge status={publicationFor(selected).status} /> : "Niet gepubliceerd" },
      ] : []} />
    </div>
  );
}

function DocumentsTab({ object, searchTerm, onSearchChange, selectedRow, onSelectRow }) {
  const query = useObjectFiles(object.id, true);
  const publicationsQuery = useObjectRecords("CustomerPortalPublication", object.id, true, "-published_at", { publication_type: "document" }, PORTAL_PUBLICATION_FIELDS);
  const [preview, setPreview] = useState(null);
  const documents = query.data || [];
  const term = searchTerm.trim().toLowerCase();
  const rows = documents.filter(item => JSON.stringify([item.display_filename, item.display_name, item.document_label, item.category, item.status]).toLowerCase().includes(term));
  const selected = documents.find(item => item.id === selectedRow);
  const filename = file => file?.display_filename || file?.display_name || file?.download_filename || file?.original_filename || "Document";
  const publicationFor = file => (publicationsQuery.data || []).find(publication => publication.source_id === file.id && publication.status === "published")
    || (publicationsQuery.data || []).find(publication => publication.source_id === file.id);
  return (
    <div className="p-4 sm:p-5">
      <SectionPanel title="Objectdocumenten" description="Bestanden blijven privé; uploaden betekent nooit automatisch publiceren naar het klantportaal.">
        <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek document of categorie..." />
        {query.isLoading || publicationsQuery.isLoading ? <LoadingState /> : query.isError || publicationsQuery.isError ? <ErrorState query={query.isError ? query : publicationsQuery} /> : !rows.length ? <EmptyState icon={FolderOpen} title={searchTerm ? "Geen documenten gevonden" : "Nog geen objectdocumenten"} description="Objectgescope documenten verschijnen hier zodra ze veilig zijn opgeslagen." /> : <ResponsiveTable rows={rows} columns={[
          { key: "name", label: "Document", render: item => <span className="font-medium">{filename(item)}</span> },
          { key: "category", label: "Categorie", render: item => item.document_label || item.category || "Overig" },
          { key: "version", label: "Versie", render: item => `v${Number(item.version || 1)}` },
          { key: "valid", label: "Geldig tot", render: item => formatDate(item.valid_until) },
          { key: "security", label: "Classificatie", render: item => String(item.security_classification || "confidential").replaceAll("_", " ") },
          { key: "publication", label: "Klantpublicatie", render: item => publicationFor(item) ? <StatusBadge status={publicationFor(item).status} /> : "Niet gepubliceerd" },
          { key: "status", label: "Status", render: item => <StatusBadge status={item.status || "active"} /> },
        ]} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
      </SectionPanel>
      <RecordInspector record={selected} title={selected ? filename(selected) : "Document"} description="Veilige objectbestandsmetadata. Publicatie en opslag zijn afzonderlijke begrippen." onClose={() => onSelectRow(null)} items={selected ? [
        { label: "Categorie", value: selected.document_label || selected.category || "Overig" },
        { label: "Versie", value: `v${Number(selected.version || 1)}` },
        { label: "Geldigheid", value: [formatDate(selected.valid_from), formatDate(selected.valid_until)].join(" – ") },
        { label: "Classificatie", value: String(selected.security_classification || "confidential").replaceAll("_", " ") },
        { label: "Klantportaal", value: publicationFor(selected) ? <StatusBadge status={publicationFor(selected).status} /> : "Niet gepubliceerd" },
      ] : []} action={selected ? <Button className="w-full" onClick={() => setPreview(selected)}><FileText className="h-4 w-4" /> Veilig bekijken</Button> : null} />
      <ManagedFilePreviewDialog open={Boolean(preview)} onOpenChange={open => !open && setPreview(null)} managedFileId={preview?.id} fileUrl={undefined} filename={preview ? filename(preview) : undefined} title={preview ? filename(preview) : "Document bekijken"} />
    </div>
  );
}

function ServicesTab({ object, customer, collectives, contractLines, searchTerm, onSearchChange, selectedRow, onSelectRow, navigate }) {
  const contractsQuery = useCustomerRecords("CustomerContract", customer?.id, true, "-start_date", CUSTOMER_CONTRACT_FIELDS);
  const collectiveIds = new Set(collectives.map(item => item.id));
  const relevantLines = contractLines.filter(line => line.scope_type === "customer" || line.object_id === object.id || (line.scope_type === "collective" && collectiveIds.has(line.collective_id)));
  const term = searchTerm.trim().toLowerCase();
  const rows = relevantLines.filter(item => JSON.stringify([item.name, item.service_code, item.status, item.billing_model]).toLowerCase().includes(term));
  const selected = relevantLines.find(item => item.id === selectedRow);
  const contractFor = line => (contractsQuery.data || []).find(contract => contract.id === line.contract_id);
  return (
    <div className="p-4 sm:p-5">
      <SectionPanel title="Dienstverlening" description="Alleen-lezen objectprojectie. Contracten, tarieven en commerciële wijzigingen blijven eigendom van de klantkaart.">
        <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek dienst, code of status..." action={<Button size="sm" variant="outline" onClick={() => navigate(`/Commercial?customer_id=${encodeURIComponent(customer.id)}&object_id=${encodeURIComponent(object.id)}`)}>Commerciële werkruimte <ArrowUpRight className="h-3.5 w-3.5" /></Button>} />
        {contractsQuery.isLoading ? <LoadingState /> : contractsQuery.isError ? <ErrorState query={contractsQuery} /> : !rows.length ? <EmptyState icon={ShieldCheck} title={searchTerm ? "Geen dienstverlening gevonden" : "Nog geen dienstverlening gekoppeld"} description="Koppel een object- of klantbrede contractregel vanuit de commerciële werkruimte." /> : <ResponsiveTable rows={rows} columns={[
          { key: "service", label: "Dienst", render: item => <span className="font-medium">{item.name}</span> },
          { key: "contract", label: "Contract", render: item => contractFor(item)?.contract_number || contractFor(item)?.title || "—" },
          { key: "scope", label: "Scope", render: item => item.scope_type === "customer" ? "Klantbreed" : item.scope_type === "collective" ? "Collectief" : "Object" },
          { key: "billing", label: "Facturatie", render: item => String(item.billing_model || "—").replaceAll("_", " ") },
          { key: "period", label: "Periode", render: item => `${formatDate(item.valid_from)} – ${formatDate(item.valid_until)}` },
          { key: "status", label: "Status", render: item => <StatusBadge status={item.status} /> },
        ]} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
      </SectionPanel>
      <RecordInspector record={selected} title={selected?.name || "Dienstverlening"} description="Commerciële objectscope; tarieven worden niet uit legacy taakprijzen afgeleid." onClose={() => onSelectRow(null)} items={selected ? [
        { label: "Contract", value: contractFor(selected)?.contract_number || contractFor(selected)?.title || "—" },
        { label: "Dienstcode", value: selected.service_code || "—" },
        { label: "Scope", value: selected.scope_type },
        { label: "Facturatiemodel", value: String(selected.billing_model || "—").replaceAll("_", " ") },
        { label: "Geldigheid", value: `${formatDate(selected.valid_from)} – ${formatDate(selected.valid_until)}` },
        { label: "Status", value: <StatusBadge status={selected.status} /> },
      ] : []} />
    </div>
  );
}

function HistoryTab({ object, customer, searchTerm, onSearchChange, selectedRow, onSelectRow }) {
  const query = useObjectRecords("CustomerEvent", object.id, true, "-occurred_at", { customer_id: customer.id }, CUSTOMER_EVENT_FIELDS);
  const events = query.data || [];
  const term = searchTerm.trim().toLowerCase();
  const rows = events.filter(item => JSON.stringify([item.summary, item.action, item.event_type, item.category, item.actor_name]).toLowerCase().includes(term));
  const selected = events.find(item => item.id === selectedRow);
  return (
    <div className="p-4 sm:p-5">
      <SectionPanel title="Objecthistorie" description="Append-only wijzigingen, publicaties en systeemacties. Ruwe auditpayloads worden niet in de UI uitgelezen.">
        <TableToolbar value={searchTerm} onChange={onSearchChange} placeholder="Zoek gebeurtenis, actor of categorie..." />
        {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState query={query} /> : !rows.length ? <EmptyState icon={History} title={searchTerm ? "Geen gebeurtenissen gevonden" : "Nog geen objecthistorie"} description="Veilige objectmutaties en gekoppelde processen verschijnen hier." /> : <ResponsiveTable rows={rows} columns={[
          { key: "event", label: "Gebeurtenis", render: item => <span className="font-medium">{item.summary || item.action?.replaceAll("_", " ") || item.event_type}</span> },
          { key: "category", label: "Categorie", render: item => item.category || "change" },
          { key: "actor", label: "Actor", render: item => item.actor_name || item.actor_type || "Systeem" },
          { key: "outcome", label: "Resultaat", render: item => item.outcome || "vastgelegd" },
          { key: "date", label: "Moment", render: item => formatDateTime(item.occurred_at || item.created_at) },
        ]} onRowClick={item => onSelectRow(item.id)} selectedRowKey={selectedRow} />}
      </SectionPanel>
      <RecordInspector record={selected} title={selected?.summary || selected?.action?.replaceAll("_", " ") || "Gebeurtenis"} description="Auditcontext zonder gevoelige waarden of technische payload." onClose={() => onSelectRow(null)} items={selected ? [
        { label: "Categorie", value: selected.category || "change" },
        { label: "Actie", value: selected.action || selected.event_type },
        { label: "Actor", value: selected.actor_name || selected.actor_type || "Systeem" },
        { label: "Resultaat", value: selected.outcome || "Vastgelegd" },
        { label: "Moment", value: formatDateTime(selected.occurred_at || selected.created_at) },
        { label: "Externe referentie", value: selected.external_reference || "—" },
      ] : []} />
    </div>
  );
}

function ManageTab({ object, onEditIdentity, onEditOperations, onRequestStatus, statusPending }) {
  const status = getObjectStatus(object);
  const targets = status === "concept" ? ["active", "inactive", "archived"] : status === "active" ? ["inactive", "archived"] : status === "inactive" ? ["active", "archived"] : ["inactive"];
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <SectionPanel title="Objectbeheer" description="Lifecycle en technische objectinstellingen. Historie wordt nooit door statuswijzigingen herschreven.">
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <button type="button" onClick={onEditIdentity} disabled={status === "archived"} className="flex items-start gap-3 bg-card p-4 text-left hover:bg-muted/25 disabled:cursor-not-allowed disabled:opacity-50"><MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-medium">Identiteit en locatie</span><span className="mt-1 block text-xs text-muted-foreground">Naam, type, adres, geocode en regio.</span></span></button>
          <button type="button" onClick={onEditOperations} disabled={status === "archived"} className="flex items-start gap-3 bg-card p-4 text-left hover:bg-muted/25 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-medium">Operationele inrichting</span><span className="mt-1 block text-xs text-muted-foreground">Instructies en mobiele kaartinstellingen.</span></span></button>
        </div>
      </SectionPanel>
      <SectionPanel title="Status en archivering" description="Hard verwijderen is niet beschikbaar voor objecten met operationele relaties.">
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Huidige status</p><div className="mt-2"><StatusBadge status={status} /></div></div><div className="flex flex-wrap gap-2">{targets.map(target => <Button key={target} size="sm" variant={target === "archived" ? "destructive" : "outline"} onClick={() => onRequestStatus(target)} disabled={statusPending}>{target === "archived" ? "Archiveren" : target === "active" ? "Activeren" : "Inactief zetten"}</Button>)}</div></div>
          {status === "archived" && <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground"><p><strong className="text-foreground">Gearchiveerd op:</strong> {formatDateTime(object.archived_at)}</p><p className="mt-1"><strong className="text-foreground">Reden:</strong> {object.archive_reason || "Niet vastgelegd"}</p></div>}
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/15 p-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><p className="text-xs leading-relaxed text-muted-foreground">Sleutels, alarmcodes, installaties en checkpoints krijgen pas een eigen beheermodule wanneer de bijbehorende rechten, versie- en custody-events server-side beschikbaar zijn.</p></div>
        </div>
      </SectionPanel>
    </div>
  );
}

export default function ObjectDossierTabs({
  object,
  customer,
  collectives,
  tasks,
  contractLines,
  scopedContacts,
  contactRoles,
  activeTab,
  onTabChange,
  view,
  onViewChange,
  searchTerm,
  onSearchChange,
  selectedRow,
  onSelectRow,
  navigate,
  onEditIdentity,
  onEditOperations,
  onRequestStatus,
  statusPending,
}) {
  const moveTabFocus = (event, index, orientation) => {
    let nextIndex;
    if ((orientation === "horizontal" && event.key === "ArrowLeft") || (orientation === "vertical" && event.key === "ArrowUp")) nextIndex = (index - 1 + OBJECT_DOSSIER_TABS.length) % OBJECT_DOSSIER_TABS.length;
    else if ((orientation === "horizontal" && event.key === "ArrowRight") || (orientation === "vertical" && event.key === "ArrowDown")) nextIndex = (index + 1) % OBJECT_DOSSIER_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = OBJECT_DOSSIER_TABS.length - 1;
    else return;
    event.preventDefault();
    onTabChange(OBJECT_DOSSIER_TABS[nextIndex].key);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab object={object} tasks={tasks} scopedContacts={scopedContacts} contractLines={contractLines} onTabChange={onTabChange} />;
      case "details": return <DetailsTab object={object} customer={customer} collectives={collectives} onEdit={onEditIdentity} />;
      case "contacts": return <ContactsTab object={object} customer={customer} scopedContacts={scopedContacts} contactRoles={contactRoles} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} navigate={navigate} />;
      case "instructions": return <InstructionsTab object={object} onEdit={onEditOperations} />;
      case "planning": return <PlanningTab object={object} tasks={tasks} view={view} onViewChange={onViewChange} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} navigate={navigate} />;
      case "floorplans": return <div className="p-4 sm:p-5"><ObjectFloorPlanTab objectId={object.id} /></div>;
      case "reports": return <ReportsTab object={object} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "documents": return <DocumentsTab object={object} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "services": return <ServicesTab object={object} customer={customer} collectives={collectives} contractLines={contractLines} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} navigate={navigate} />;
      case "history": return <HistoryTab object={object} customer={customer} searchTerm={searchTerm} onSearchChange={onSearchChange} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "manage": return <ManageTab object={object} onEditIdentity={onEditIdentity} onEditOperations={onEditOperations} onRequestStatus={onRequestStatus} statusPending={statusPending} />;
      default: return <OverviewTab object={object} tasks={tasks} scopedContacts={scopedContacts} contractLines={contractLines} onTabChange={onTabChange} />;
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex overflow-x-auto border-b border-border bg-muted/15 lg:hidden" role="tablist" aria-label="Objectdossier" aria-orientation="horizontal">
        {OBJECT_DOSSIER_TABS.map((tab, index) => <button key={tab.key} id={`object-tab-mobile-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`object-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={event => moveTabFocus(event, index, "horizontal")} onClick={() => onTabChange(tab.key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><tab.icon className="h-3.5 w-3.5" />{tab.label}</button>)}
      </div>
      <div className="flex min-h-[560px]">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-muted/15 py-2 lg:block">
          <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Objectdossier</p>
          <div role="tablist" aria-label="Objectdossier" aria-orientation="vertical">
            {OBJECT_DOSSIER_TABS.map((tab, index) => <button key={tab.key} id={`object-tab-desktop-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`object-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={event => moveTabFocus(event, index, "vertical")} onClick={() => onTabChange(tab.key)} className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium transition-colors ${activeTab === tab.key ? "border-r-2 border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}><tab.icon className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">{tab.label}</span></button>)}
          </div>
        </aside>
        <main id={`object-panel-${activeTab}`} role="tabpanel" aria-labelledby={`object-tab-mobile-${activeTab} object-tab-desktop-${activeTab}`} tabIndex={0} className="min-w-0 flex-1 bg-background/30">{renderTab()}</main>
      </div>
    </div>
  );
}

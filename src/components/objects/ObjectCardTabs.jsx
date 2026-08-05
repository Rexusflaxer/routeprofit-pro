import React, { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Clock3,
  ContactRound,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import ObjectWarningAddressWizard from "./ObjectWarningAddressWizard";
import ObjectWarningAddressesTable from "./ObjectWarningAddressesTable";
import ObjectInstallationsTab from "./ObjectInstallationsTab";
import ObjectKeysTab from "./ObjectKeysTab";
import ObjectRelationshipsTab from "./ObjectRelationshipsTab";
import ObjectSecurityPlanTab from "./ObjectSecurityPlanTab";
import ObjectFloorPlanPlaceholderTab from "./ObjectFloorPlanPlaceholderTab";
import ObjectTasksTab from "./ObjectTasksTab";
import {
  OBJECT_CARD_TABS,
  formatObjectLogValue,
  warningAvailabilityLabel,
} from "./objectWarningAddressConfig";
import {
  createObjectWarningAddress,
  createObjectWarningAddressKey,
  deleteObjectWarningAddress,
  deleteObjectWarningAddressKey,
  listObjectLogbook,
  listObjectWarningAddresses,
  reorderObjectWarningAddresses,
  reorderObjectWarningAddressesKey,
  updateObjectWarningAddress,
  updateObjectWarningAddressKey,
} from "./objectWarningAddressWorkflow";

const LOGBOOK_PAGE_SIZE = 50;

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

function LoadingState({ label }) {
  return (
    <div className="space-y-3 p-4" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      {[1, 2, 3, 4].map(value => <div key={value} className="h-12 animate-pulse rounded-xl border border-border/70 bg-card/35 backdrop-blur-xl" />)}
    </div>
  );
}

function ErrorState({ error, onRetry, title = "De gegevens konden niet worden geladen." }) {
  return (
    <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error?.message || "Probeer het opnieuw."}</p>
          {(error?.status || error?.requestId) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {[error.status && `Status ${error.status}`, error.requestId && `Referentie ${error.requestId}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>
      </div>
    </div>
  );
}

function EmptyTable({ icon: Icon, title, description, action = null }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SearchField({ value, onChange, placeholder, label }) {
  return (
    <div className="relative min-w-0 sm:w-80">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={label} className="h-9 pl-9 pr-9" />
      {value && <button type="button" onClick={() => onChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
    </div>
  );
}

function changeDescription(change) {
  if (change?.before == null && change?.after == null) {
    return `${change?.label || change?.field || "Gegeven"}: Gewijzigd`;
  }
  const before = formatObjectLogValue(change?.before);
  const after = formatObjectLogValue(change?.after);
  if (before === after || change?.before === undefined) return `${change?.label || change?.field || "Gegeven"}: ${after}`;
  return `${change?.label || change?.field || "Gegeven"}: ${before} → ${after}`;
}

function LogbookTable({ rows }) {
  if (!rows.length) return null;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/25 hover:bg-muted/25">
              <TableHead className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Datum en tijd</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Handeling</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Gewijzigde gegevens</TableHead>
              <TableHead className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Door</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id} className="hover:bg-muted/25">
                <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">{formatDateTime(row.occurred_at)}</TableCell>
                <TableCell className="align-top">
                  <p className="text-sm font-medium text-foreground">{row.summary || row.action_label || String(row.action || "Object bijgewerkt").replaceAll("_", " ")}</p>
                  {row.category && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{row.category}</p>}
                </TableCell>
                <TableCell className="align-top">
                  {row.changes?.length ? (
                    <ul className="space-y-1 text-sm">
                      {row.changes.map((change, index) => <li key={`${change.field || change.label}-${index}`}>{changeDescription(change)}</li>)}
                    </ul>
                  ) : <span className="text-sm text-muted-foreground">{row.description || "Geen aanvullende details"}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top text-sm">{row.actor_name || "Systeem"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map(row => (
          <article key={row.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{row.summary || row.action_label || String(row.action || "Object bijgewerkt").replaceAll("_", " ")}</p>
              <time className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.occurred_at)}</time>
            </div>
            {row.changes?.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{row.changes.map((change, index) => <li key={`${change.field || change.label}-${index}`}>{changeDescription(change)}</li>)}</ul>}
            <p className="text-xs text-muted-foreground">Door {row.actor_name || "Systeem"}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function ObjectTabNavigation({ activeTab, onTabChange }) {
  const moveFocus = (event, index, orientation) => {
    const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    if (![previous, next, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? OBJECT_CARD_TABS.length - 1
        : (index + (event.key === next ? 1 : -1) + OBJECT_CARD_TABS.length) % OBJECT_CARD_TABS.length;
    onTabChange(OBJECT_CARD_TABS[nextIndex].key);
    requestAnimationFrame(() => document.getElementById(`object-tab-${orientation}-${OBJECT_CARD_TABS[nextIndex].key}`)?.focus());
  };
  return (
    <>
      <div className="flex overflow-x-auto border-b border-border/70 bg-card/25 backdrop-blur-xl lg:hidden" role="tablist" aria-label="Objectkaart" aria-orientation="horizontal">
        {OBJECT_CARD_TABS.map((tab, index) => <button key={tab.key} id={`object-tab-horizontal-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={event => moveFocus(event, index, "horizontal")} onClick={() => onTabChange(tab.key)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}
      </div>
      <aside className="hidden w-56 shrink-0 border-r border-border/70 bg-card/25 py-2 backdrop-blur-xl lg:block">
        <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Objectkaart</p>
        <div role="tablist" aria-label="Objectkaart" aria-orientation="vertical">
          {OBJECT_CARD_TABS.map((tab, index) => <button key={tab.key} id={`object-tab-vertical-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={event => moveFocus(event, index, "vertical")} onClick={() => onTabChange(tab.key)} className={`flex w-full items-center px-4 py-2 text-left text-[13px] font-medium transition-colors ${activeTab === tab.key ? "border-r-2 border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}><span className="flex-1">{tab.label}</span></button>)}
        </div>
      </aside>
    </>
  );
}

function warningAddressFormChanged(record, form) {
  const fields = ["primary_contact_point_id", "relationship_type", "relationship_label", "availability_mode"];
  if (fields.some(field => String(record?.[field] || "") !== String(form?.[field] || ""))) return true;
  if (String(record?.secondary_contact_point_id || "") !== String(form?.secondary_contact_point_id || "")) return true;
  if (Number(record?.call_order) !== Number(form?.call_order)) return true;
  return JSON.stringify(record?.availability_periods || []) !== JSON.stringify(form?.availability_periods || []);
}

export default function ObjectCardTabs({
  object,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  page,
  onPageChange,
  view,
  selectedRow,
  onOpenCreate,
  onOpenEdit,
  onOpenManual,
  onCloseView,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createKeyRef = useRef(null);
  const updateKeyRef = useRef(null);
  const warningQuery = useQuery({
    queryKey: ["object-card", object.id, "warning-addresses"],
    queryFn: () => listObjectWarningAddresses({ customerId: object.customer_id, objectId: object.id }),
    enabled: activeTab === "warning-addresses",
    retry: 1,
  });
  const logbookQuery = useQuery({
    queryKey: ["object-card", object.id, "logbook", searchTerm.trim(), page],
    queryFn: () => listObjectLogbook({ customerId: object.customer_id, objectId: object.id, search: searchTerm, page, pageSize: LOGBOOK_PAGE_SIZE }),
    enabled: activeTab === "logbook",
    retry: 1,
  });

  const warningData = warningQuery.data || {};
  const warnings = warningData.items || [];
  const contactOptions = warningData.contact_options || [];
  const selectedWarning = view === "edit" ? warnings.find(item => item.id === selectedRow) || null : null;
  const filteredWarnings = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("nl-NL");
    if (!term) return warnings;
    return warnings.filter(item => [
      item.display_name,
      item.job_title,
      item.relationship_label,
      item.primary_phone,
      item.secondary_phone,
      warningAvailabilityLabel(item),
    ].some(value => String(value || "").toLocaleLowerCase("nl-NL").includes(term)));
  }, [searchTerm, warnings]);

  useEffect(() => {
    if (view === "new" && !createKeyRef.current) createKeyRef.current = createObjectWarningAddressKey();
    if (view !== "new") createKeyRef.current = null;
  }, [view]);

  useEffect(() => {
    if (view === "edit" && selectedRow) {
      if (updateKeyRef.current?.warningAddressId !== selectedRow) {
        updateKeyRef.current = {
          warningAddressId: selectedRow,
          key: updateObjectWarningAddressKey(),
        };
      }
    } else {
      updateKeyRef.current = null;
    }
  }, [selectedRow, view]);

  useEffect(() => {
    if (view === "edit" && !warningQuery.isLoading && !warningQuery.isError && !selectedWarning) onCloseView();
  }, [onCloseView, selectedWarning, view, warningQuery.isError, warningQuery.isLoading]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "warning-addresses"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: form => createObjectWarningAddress({
      customerId: object.customer_id,
      objectId: object.id,
      form,
      idempotencyKey: createKeyRef.current || createObjectWarningAddressKey(),
    }),
    onSuccess: async () => {
      await invalidate();
      createKeyRef.current = null;
      onCloseView();
      toast({ title: "Waarschuwingsadres toegevoegd" });
    },
    onError: async error => { if (error.status === 409) await invalidate(); },
  });
  const updateMutation = useMutation({
    mutationFn: form => warningAddressFormChanged(selectedWarning, form)
      ? updateObjectWarningAddress({
          customerId: object.customer_id,
          objectId: object.id,
          warningAddressId: selectedWarning.id,
          expectedVersion: selectedWarning.version,
          form,
          idempotencyKey: updateKeyRef.current?.key || updateObjectWarningAddressKey(),
        })
      : Promise.resolve({ unchanged: true }),
    onSuccess: async result => {
      if (!result?.unchanged) await invalidate();
      updateKeyRef.current = null;
      onCloseView();
      toast({ title: "Waarschuwingsadres opgeslagen" });
    },
    onError: async error => { if (error.status === 409) await invalidate(); },
  });
  useEffect(() => {
    createMutation.reset();
    updateMutation.reset();
  }, [selectedRow, view]);

  const reorderMutation = useMutation({
    mutationFn: orderedRows => reorderObjectWarningAddresses({
      customerId: object.customer_id,
      objectId: object.id,
      orderedRows,
      expectedOrderVersion: Number(warningData.order_version || 0),
      idempotencyKey: reorderObjectWarningAddressesKey(),
    }),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Belvolgorde bijgewerkt" });
    },
    onError: async error => { if (error.status === 409) await invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: row => deleteObjectWarningAddress({
      customerId: object.customer_id,
      objectId: object.id,
      warningAddressId: row.id,
      expectedVersion: row.version,
      idempotencyKey: deleteObjectWarningAddressKey(),
    }),
    onSuccess: async () => {
      await invalidate();
      onCloseView();
      toast({ title: "Waarschuwingsadres verwijderd" });
    },
    onError: async error => {
      if (error.status === 409) await invalidate();
      toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" });
    },
  });

  const archived = object.status === "archived";
  const logbook = logbookQuery.data?.items || [];
  const logbookTotal = Number(logbookQuery.data?.total || 0);
  const logbookHasNext = page * LOGBOOK_PAGE_SIZE < logbookTotal;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">
      <div className="lg:flex lg:min-h-[620px]">
        <ObjectTabNavigation activeTab={activeTab} onTabChange={onTabChange} />
        <main role="tabpanel" tabIndex={0} className="min-w-0 flex-1 bg-background/30">
          {activeTab === "security-plan" ? (
            <ObjectSecurityPlanTab
              object={object}
              view={view}
              selectedRow={selectedRow}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              page={page}
              onPageChange={onPageChange}
              onOpenCreate={onOpenCreate}
              onOpenEdit={onOpenEdit}
              onCloseView={onCloseView}
            />
          ) : activeTab === "floor-plan" ? (
            <ObjectFloorPlanPlaceholderTab />
          ) : activeTab === "tasks" ? (
            <ObjectTasksTab
              object={object}
              view={view}
              selectedRow={selectedRow}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onOpenCreate={onOpenCreate}
              onOpenEdit={onOpenEdit}
              onCloseView={onCloseView}
            />
          ) : activeTab === "relationships" ? (
            <ObjectRelationshipsTab
              object={object}
              view={view}
              selectedRow={selectedRow}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onOpenCreate={onOpenCreate}
              onOpenEdit={onOpenEdit}
              onCloseView={onCloseView}
            />
          ) : activeTab === "keys" ? (
            <ObjectKeysTab
              object={object}
              view={view}
              selectedRow={selectedRow}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onOpenCreate={onOpenCreate}
              onOpenEdit={onOpenEdit}
              onCloseView={onCloseView}
            />
          ) : activeTab === "installations" ? (
            <ObjectInstallationsTab
              object={object}
              view={view}
              selectedRow={selectedRow}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onOpenCreate={onOpenCreate}
              onOpenEdit={onOpenEdit}
              onOpenManual={onOpenManual}
              onCloseView={onCloseView}
            />
          ) : activeTab === "warning-addresses" ? (
            <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
              {!archived && !warningQuery.isError && (view === "new" || selectedWarning) && (
                <ObjectWarningAddressWizard
                  key={view === "new" ? "new-warning-address" : `edit-${selectedWarning.id}-${selectedWarning.version}`}
                  mode={view === "new" ? "create" : "edit"}
                  initialValue={selectedWarning}
                  contactOptions={contactOptions}
                  nextCallOrder={warningData.next_call_order || 1}
                  onCancel={onCloseView}
                  onSave={form => view === "new" ? createMutation.mutate(form) : updateMutation.mutate(form)}
                  saving={createMutation.isPending || updateMutation.isPending}
                  error={view === "new" ? createMutation.error : updateMutation.error}
                />
              )}
              <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Waarschuwingsadressen</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{filteredWarnings.length} van {warnings.length} contact{warnings.length === 1 ? "" : "en"} in de belvolgorde</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <SearchField value={searchTerm} onChange={onSearchChange} placeholder="Zoek op naam, rol of telefoon..." label="Waarschuwingsadressen zoeken" />
                  {!warningQuery.isError && view !== "new" && !selectedWarning && <Button size="sm" onClick={onOpenCreate} disabled={archived}><Plus className="h-4 w-4" /> Waarschuwingsadres toevoegen</Button>}
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {warningQuery.isLoading ? <LoadingState label="Waarschuwingsadressen laden..." /> : warningQuery.isError ? <ErrorState title="De waarschuwingsadressen konden niet worden geladen." error={warningQuery.error} onRetry={() => warningQuery.refetch()} /> : filteredWarnings.length ? <ObjectWarningAddressesTable rows={filteredWarnings} overrides={warningData.availability_overrides || []} editingId={selectedWarning?.id} deletingId={deleteMutation.variables?.id} onEdit={row => !archived && onOpenEdit(row.id)} onDelete={row => deleteMutation.mutate(row)} onReorder={orderedRows => reorderMutation.mutateAsync(orderedRows)} onOverridesChanged={invalidate} reorderDisabled={archived || Boolean(searchTerm.trim()) || reorderMutation.isPending || deleteMutation.isPending} actionsDisabled={archived || deleteMutation.isPending} /> : <EmptyTable icon={searchTerm ? Search : ContactRound} title={searchTerm ? "Geen waarschuwingsadressen gevonden" : "Nog geen waarschuwingsadressen"} description={searchTerm ? "Pas de zoekopdracht aan." : "Voeg de eerste contactpersoon toe die bij een alarm of calamiteit mag worden gebeld."} action={!searchTerm && !archived && view !== "new" ? <Button size="sm" onClick={onOpenCreate}><Plus className="h-4 w-4" /> Waarschuwingsadres toevoegen</Button> : null} />}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
              <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Logboek</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Alle vastgelegde handelingen en wijzigingen binnen deze objectkaart</p>
                </div>
                <SearchField value={searchTerm} onChange={onSearchChange} placeholder="Zoek op handeling, veld of gebruiker..." label="Logboek doorzoeken" />
              </div>
              <div className="min-h-0 flex-1">
                {logbookQuery.isLoading ? <LoadingState label="Logboek laden..." /> : logbookQuery.isError ? <ErrorState title="Het objectlogboek kon niet worden geladen." error={logbookQuery.error} onRetry={() => logbookQuery.refetch()} /> : logbook.length ? <LogbookTable rows={logbook} /> : <EmptyTable icon={Clock3} title={searchTerm ? "Geen logboekregels gevonden" : "Nog geen logboekregels"} description={searchTerm ? "Pas de zoekopdracht aan." : "Toevoegingen en wijzigingen op de objectkaart verschijnen hier automatisch met de uitvoerende gebruiker."} />}
              </div>
              {(page > 1 || logbookHasNext) && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">Pagina {page} · {logbookTotal} logboekregel{logbookTotal === 1 ? "" : "s"}</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Vorige</Button>
                    <Button type="button" variant="outline" size="sm" disabled={!logbookHasNext} onClick={() => onPageChange(page + 1)}>Volgende</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

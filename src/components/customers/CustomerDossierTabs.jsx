import React, { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ContactRound,
  FileCheck2,
  FileText,
  FolderOpen,
  Handshake,
  History,
  Inbox,
  Landmark,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CustomerContactWizard from "./CustomerContactWizard";
import {
  contactMatchesObject,
  formatContactObjectScope,
} from "./customerContactScope";
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
import {
  CUSTOMER_TABS,
  RECORD_STATUS_LABELS,
  contactPointValue,
  filterEntity,
  formatCurrencyCents,
  formatDate,
  formatDateTime,
  getCompanyName,
  getContactName,
  getRecordStatus,
  listEntity,
  matchesCustomerOwner,
  objectAddress,
  recordTitle,
} from "./customerDossierUtils";

function useCustomerRecords(entityName, customerId, enabled, sort = "-created_date", extraFilter = {}) {
  return useQuery({
    queryKey: ["customer-dossier", customerId, entityName, extraFilter, sort],
    queryFn: () => filterEntity(entityName, { customer_id: customerId, ...extraFilter }, sort),
    enabled: Boolean(customerId && enabled),
    retry: 1,
  });
}

function useEntityRecords(entityName, filter, enabled, sort = "-created_date") {
  return useQuery({
    queryKey: ["customer-dossier", entityName, filter, sort],
    queryFn: () => filterEntity(entityName, filter, sort),
    enabled: Boolean(enabled),
    retry: 1,
  });
}

function useAllEntityRecords(entityName, enabled, sort = "-created_date") {
  return useQuery({
    queryKey: ["customer-dossier", entityName, "all", sort],
    queryFn: () => listEntity(entityName, sort),
    enabled: Boolean(enabled),
    retry: 1,
  });
}

function StatusBadge({ status }) {
  const value = status || "draft";
  const tone = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    signed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    published: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
    submitted: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
    under_review: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
    partially_paid: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    blocked: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    failed: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    archived: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }[value] || "border-border bg-muted/40 text-muted-foreground";

  return (
    <Badge variant="outline" className={`whitespace-nowrap text-[11px] font-medium ${tone}`}>
      {RECORD_STATUS_LABELS[value] || String(value).replaceAll("_", " ")}
    </Badge>
  );
}

function SectionPanel({ title, description, action, children, className = "" }) {
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

function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function LoadingState({ label = "Dossiergegevens laden..." }) {
  return (
    <div className="space-y-3 p-4" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      {[1, 2, 3].map(value => (
        <div key={value} className="h-11 animate-pulse rounded-md border border-border bg-muted/30" />
      ))}
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
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Opnieuw
        </Button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = "default" }) {
  const iconClass = tone === "warning"
    ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40"
    : tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/40"
      : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function ResponsiveTable({
  rows,
  columns,
  getRowKey = row => row.id,
  onRowClick,
  selectedRowKey,
  empty,
}) {
  if (!rows.length) return empty;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/25 hover:bg-muted/25">
              {columns.map(column => (
                <TableHead key={column.key} className={column.headClassName || "text-xs font-semibold text-muted-foreground"}>
                  {column.label}
                </TableHead>
              ))}
              {onRowClick && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const key = getRowKey(row);
              return (
                <TableRow
                  key={key}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={selectedRowKey === key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  } : undefined}
                  className={`${onRowClick ? "cursor-pointer" : ""} ${selectedRowKey === key ? "bg-primary/5" : "hover:bg-muted/25"}`}
                >
                  {columns.map(column => (
                    <TableCell key={column.key} className={column.className || "text-sm"}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                  {onRowClick && <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>}
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
            <MobileRow
              type={onRowClick ? "button" : undefined}
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`w-full space-y-2 px-4 py-3 text-left ${selectedRowKey === key ? "bg-primary/5" : "hover:bg-muted/25"}`}
            >
              {columns.map(column => (
                <div key={column.key} className="grid grid-cols-[110px_1fr] gap-3 text-sm">
                  <span className="text-xs text-muted-foreground">{column.label}</span>
                  <div className="min-w-0">{column.render(row)}</div>
                </div>
              ))}
            </MobileRow>
          );
        })}
      </div>
    </>
  );
}

function RecordInspector({ record, title, open, onOpenChange }) {
  const visibleEntries = Object.entries(record || {})
    .filter(([key, value]) => !["id", "created_by", "updated_by"].includes(key) && value !== null && value !== undefined && value !== "")
    .slice(0, 18);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title || recordTitle(record, "Dossierrecord")}</SheetTitle>
          <SheetDescription>Details uit het klantdossier. Wijzigen gebeurt in de bijbehorende werkruimte.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {visibleEntries.map(([key, value]) => (
            <div key={key} className="rounded-md border border-border px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{key.replaceAll("_", " ")}</p>
              <p className="mt-1 break-words text-sm text-foreground">
                {typeof value === "object" ? JSON.stringify(value) : typeof value === "boolean" ? (value ? "Ja" : "Nee") : String(value)}
              </p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QueryGate({ queries, children }) {
  const loading = queries.find(query => query.isLoading);
  if (loading) return <LoadingState />;
  const failed = queries.find(query => query.isError);
  if (failed) return <ErrorState query={failed} />;
  return children;
}

function onboardingItems({ customer, accounts, contacts, objects, contracts }) {
  return [
    { label: "Primaire bedrijfsrelatie", complete: accounts.some(item => item.is_primary) || accounts.length > 0, tab: "manage" },
    { label: "Hoofdcontact", complete: contacts.some(item => item.is_primary) || Boolean(customer.primary_contact_id), tab: "contacts" },
    { label: "Eerste object", complete: objects.length > 0, tab: "objects" },
    { label: "Contract en tarief", complete: contracts.some(item => ["active", "signed"].includes(getRecordStatus(item))), tab: "commercial" },
  ];
}

function OverviewTab({ customer, customerId, core, onTabChange }) {
  const objectsQuery = useCustomerRecords("SurveillanceObject", customerId, true, "name");
  const contractsQuery = useCustomerRecords("CustomerContract", customerId, true);
  const invoicesQuery = useCustomerRecords("SalesInvoice", customerId, true, "-issue_date");
  const eventsQuery = useCustomerRecords("CustomerEvent", customerId, true, "-occurred_at");

  return (
    <QueryGate queries={[objectsQuery, contractsQuery, invoicesQuery, eventsQuery]}>
      {(() => {
        const objects = objectsQuery.data || [];
        const contracts = contractsQuery.data || [];
        const invoices = invoicesQuery.data || [];
        const events = eventsQuery.data || [];
        const outstandingCents = invoices
          .filter(invoice => !["paid", "cancelled", "credited"].includes(invoice.payment_status || invoice.status))
          .reduce((sum, invoice) => sum + Number(invoice.open_cents ?? invoice.outstanding_amount_cents ?? invoice.total_amount_cents ?? invoice.total_cents ?? 0), 0);
        const checklist = onboardingItems({
          customer,
          accounts: core.accounts,
          contacts: core.contacts,
          objects,
          contracts,
        });
        const incomplete = checklist.filter(item => !item.complete);

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={MapPin} label="Actieve objecten" value={objects.filter(item => item.status !== "archived").length} hint={`${objects.length} totaal`} />
              <StatCard icon={Handshake} label="Actieve contracten" value={contracts.filter(item => ["active", "signed"].includes(getRecordStatus(item))).length} />
              <StatCard icon={CircleDollarSign} label="Openstaand" value={formatCurrencyCents(outstandingCents)} tone={outstandingCents > 0 ? "warning" : "positive"} />
              <StatCard icon={ContactRound} label="Contactpersonen" value={core.contacts.filter(item => item.status !== "archived").length} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
              <SectionPanel
                title="Aandachtspunten"
                description={incomplete.length ? `${incomplete.length} onderdeel${incomplete.length === 1 ? "" : "en"} nog aan te vullen` : "Het klantdossier is bedrijfsklaar."}
              >
                <div className="divide-y divide-border">
                  {checklist.map(item => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onTabChange(item.tab)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/25"
                    >
                      {item.complete
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />}
                      <span className="flex-1 text-sm text-foreground">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.complete ? "Gereed" : "Aanvullen"}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </SectionPanel>

              <SectionPanel title="Hoofdcontact" description="Primair aanspreekpunt voor deze klant">
                {(() => {
                  const contact = core.contacts.find(item => item.id === customer.primary_contact_id)
                    || core.contacts.find(item => item.is_primary)
                    || core.contacts[0];
                  if (!contact) {
                    return <EmptyState icon={UserRound} title="Nog geen hoofdcontact" description="Voeg een contactpersoon toe en markeer deze als primair." />;
                  }
                  const email = contactPointValue(core.contactPoints, contact.id, "email") || contact.email;
                  const phone = contactPointValue(core.contactPoints, contact.id, "phone")
                    || contactPointValue(core.contactPoints, contact.id, "mobile")
                    || contact.phone;
                  return (
                    <div className="space-y-3 p-4">
                      <div>
                        <p className="font-medium text-foreground">{getContactName(contact)}</p>
                        <p className="text-xs text-muted-foreground">{contact.job_title || contact.department || "Functie niet vastgelegd"}</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /><span className="truncate">{email || "Geen e-mailadres"}</span></div>
                        <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span>{phone || "Geen telefoonnummer"}</span></div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onTabChange("contacts")}>Contacten openen</Button>
                    </div>
                  );
                })()}
              </SectionPanel>
            </div>

            <SectionPanel title="Recente activiteit" description="Wijzigingen en gebeurtenissen in het klantdossier">
              {events.length ? (
                <div className="divide-y divide-border">
                  {events.slice(0, 6).map(event => (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{event.title || event.action || event.event_type || "Dossier bijgewerkt"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.description || event.actor_name || event.source || "LOQ"}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(event.occurred_at || event.created_date)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={History} title="Nog geen historie" description="Nieuwe dossieracties verschijnen hier automatisch." />
              )}
            </SectionPanel>
          </div>
        );
      })()}
    </QueryGate>
  );
}

export function ContactsTab({
  core,
  objects = [],
  activeObjectId = "all",
  onObjectChange,
  onAddContact,
  wizardOpen,
  onCloseWizard,
  onSaveContact,
  contactSaving,
  contactError,
  selectedRow,
  onSelectRow,
}) {
  const activeObjects = useMemo(
    () => objects.filter(object => object.is_active_customer_object !== false && object.status !== "archived"),
    [objects],
  );
  const normalizedObjectId = activeObjects.some(object => object.id === activeObjectId)
    ? activeObjectId
    : "all";
  const contacts = useMemo(
    () => core.contacts
      .filter(contact => contact.status !== "archived")
      .filter(contact => contactMatchesObject(core.contactRoles, contact.id, normalizedObjectId)),
    [core.contactRoles, core.contacts, normalizedObjectId],
  );

  useEffect(() => {
    if (activeObjectId !== normalizedObjectId) onObjectChange?.(normalizedObjectId);
  }, [activeObjectId, normalizedObjectId, onObjectChange]);

  const contactColumns = [
    {
      key: "name",
      label: "Naam",
      render: contact => (
        <div>
          <p className="font-medium text-foreground">{getContactName(contact)}</p>
          {contact.is_primary && <p className="text-xs text-primary">Hoofdcontact</p>}
        </div>
      ),
    },
    {
      key: "job_title",
      label: "Functie",
      render: contact => contact.job_title || contact.department || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "email",
      label: "E-mail",
      render: contact => {
        const value = contactPointValue(core.contactPoints, contact.id, "email") || contact.email;
        return value ? <a href={`mailto:${value}`} onClick={event => event.stopPropagation()} className="text-sm hover:underline">{value}</a> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "phone",
      label: "Telefoon",
      render: contact => {
        const value = contactPointValue(core.contactPoints, contact.id, "phone") || contactPointValue(core.contactPoints, contact.id, "mobile") || contact.phone;
        return value || <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "scope",
      label: "Bevoegd voor",
      render: contact => (
        <div className="flex max-w-[260px] items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">
            {formatContactObjectScope(core.contactRoles, contact.id, activeObjects)}
          </span>
        </div>
      ),
    },
    {
      key: "portal",
      label: "Portaal",
      render: contact => (
        <Badge variant="outline" className="whitespace-nowrap text-[11px] font-medium">
          {contact.portal_status === "active" ? "Actief" : contact.portal_status === "invited" ? "Uitgenodigd" : "Geen toegang"}
        </Badge>
      ),
    },
    {
      key: "changed",
      label: "Gewijzigd",
      render: contact => <span className="whitespace-nowrap text-muted-foreground">{formatDate(contact.updated_date || contact.created_date)}</span>,
    },
  ];

  const selectedContact = selectedRow?.startsWith("contact:")
    ? core.contacts.find(item => `contact:${item.id}` === selectedRow)
    : null;

  return (
    <div className="flex min-h-[520px] flex-col bg-card">
      <div
        role="tablist"
        aria-label="Contacten per object"
        className="flex overflow-x-auto border-b border-border bg-muted/15"
      >
        <button
          type="button"
          role="tab"
          aria-selected={normalizedObjectId === "all"}
          onClick={() => onObjectChange?.("all")}
          className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
            normalizedObjectId === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Alle
        </button>
        {activeObjects.map(object => (
          <button
            key={object.id}
            type="button"
            role="tab"
            aria-selected={normalizedObjectId === object.id}
            title={object.name || object.object_code || "Object"}
            onClick={() => onObjectChange?.(object.id)}
            className={`max-w-[240px] shrink-0 truncate border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
              normalizedObjectId === object.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {object.name || object.object_code || "Naamloos object"}
          </button>
        ))}
      </div>

      {wizardOpen && (
        <CustomerContactWizard
          objects={activeObjects}
          onCancel={onCloseWizard}
          onSave={onSaveContact}
          saving={contactSaving}
          error={contactError}
        />
      )}

      <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {normalizedObjectId === "all"
              ? "Alle contacten"
              : `Contacten voor ${activeObjects.find(object => object.id === normalizedObjectId)?.name || "object"}`}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {contacts.length} contact{contacts.length === 1 ? "" : "en"} in deze selectie
          </p>
        </div>
        {!wizardOpen && (
          <Button size="sm" onClick={onAddContact}>
            <Plus className="h-4 w-4" /> Contact toevoegen
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveTable
          rows={contacts}
          columns={contactColumns}
          getRowKey={contact => `contact:${contact.id}`}
          selectedRowKey={selectedRow}
          onRowClick={contact => onSelectRow(`contact:${contact.id}`)}
          empty={(
            <EmptyState
              icon={ContactRound}
              title={normalizedObjectId === "all" ? "Nog geen contacten" : "Geen contacten voor dit object"}
              description={normalizedObjectId === "all"
                ? "Voeg het eerste contact toe en bepaal voor welke objecten deze persoon bevoegd is."
                : "Contacten met klantbrede bevoegdheid of toegang tot dit object verschijnen hier."}
              action={!wizardOpen ? <Button size="sm" onClick={onAddContact}><Plus className="h-4 w-4" /> Contact toevoegen</Button> : null}
            />
          )}
        />
      </div>

      <RecordInspector
        record={selectedContact}
        title={selectedContact ? getContactName(selectedContact) : ""}
        open={Boolean(selectedContact)}
        onOpenChange={open => !open && onSelectRow(null)}
      />
    </div>
  );
}

function ObjectsTab({ customerId, navigate, selectedRow, onSelectRow }) {
  const objectsQuery = useCustomerRecords("SurveillanceObject", customerId, true, "name");
  const collectivesQuery = useCustomerRecords("Collectief", customerId, true, "name");

  return (
    <QueryGate queries={[objectsQuery, collectivesQuery]}>
      {(() => {
        const objects = objectsQuery.data || [];
        const collectives = collectivesQuery.data || [];
        const columns = [
          {
            key: "object",
            label: "Object",
            render: object => (
              <div>
                <p className="font-medium text-foreground">{object.name || "Naamloos object"}</p>
                <p className="text-xs text-muted-foreground">{object.object_code || "Geen objectcode"}</p>
              </div>
            ),
          },
          { key: "address", label: "Adres", render: object => <span>{objectAddress(object)}</span> },
          {
            key: "collective",
            label: "Collectief / regio",
            render: object => {
              const memberships = collectives.filter(item => (item.object_ids || []).includes(object.id));
              return memberships.length ? memberships.map(item => item.name).join(", ") : <span className="text-muted-foreground">—</span>;
            },
          },
          {
            key: "service",
            label: "Dienstverlening",
            render: object => object.service_summary || object.default_service_function_type || <span className="text-muted-foreground">Nog niet ingericht</span>,
          },
          { key: "status", label: "Status", render: object => <StatusBadge status={object.status || (object.is_active === false ? "inactive" : "active")} /> },
        ];

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={MapPin} label="Objecten" value={objects.length} />
              <StatCard icon={Building2} label="Collectieven" value={collectives.length} />
              <StatCard icon={TriangleAlert} label="Aandacht nodig" value={objects.filter(item => item.status === "inactive" || item.attention_required).length} />
            </div>
            <SectionPanel title="Objecten" description="Operationele codes, sleutels en instructies blijven uitsluitend op objectniveau.">
              <ResponsiveTable
                rows={objects}
                columns={columns}
                getRowKey={object => `object:${object.id}`}
                selectedRowKey={selectedRow}
                onRowClick={object => {
                  onSelectRow(`object:${object.id}`);
                  navigate(`/Objects?id=${encodeURIComponent(object.id)}`);
                }}
                empty={<EmptyState icon={MapPin} title="Geen objecten gekoppeld" description="Maak het eerste object aan vanuit de objectenmodule en koppel het aan deze klant." action={<Button size="sm" variant="outline" onClick={() => navigate("/Objects")}><ArrowUpRight className="h-4 w-4" /> Naar objecten</Button>} />}
              />
            </SectionPanel>
          </div>
        );
      })()}
    </QueryGate>
  );
}

function CommercialTab({ customerId, accounts, navigate, selectedRow, onSelectRow }) {
  const quotesQuery = useCustomerRecords("CustomerQuote", customerId, true);
  const quoteLinesQuery = useCustomerRecords("CustomerQuoteLine", customerId, true);
  const contractsQuery = useCustomerRecords("CustomerContract", customerId, true);
  const contractLinesQuery = useCustomerRecords("CustomerContractLine", customerId, true);
  const ratesQuery = useCustomerRecords("CustomerContractRate", customerId, true);

  return (
    <QueryGate queries={[quotesQuery, quoteLinesQuery, contractsQuery, contractLinesQuery, ratesQuery]}>
      {(() => {
        const quotes = quotesQuery.data || [];
        const contracts = contractsQuery.data || [];
        const rates = ratesQuery.data || [];
        const primaryAccount = accounts.find(item => item.is_primary) || accounts[0];
        const commercialUrl = primaryAccount
          ? `/Commercial?view=quote&customer_id=${encodeURIComponent(customerId)}&customer_account_id=${encodeURIComponent(primaryAccount.id)}&company_id=${encodeURIComponent(primaryAccount.company_id)}`
          : "";
        const all = [...quotes.map(item => ({ ...item, _kind: "Offerte" })), ...contracts.map(item => ({ ...item, _kind: "Contract" }))];
        const selected = all.find(item => `${item._kind.toLowerCase()}:${item.id}` === selectedRow);
        const columns = [
          {
            key: "number",
            label: "Nummer / titel",
            render: item => <div><p className="font-medium text-foreground">{item.quote_number || item.contract_number || item.title || "Zonder nummer"}</p><p className="text-xs text-muted-foreground">Versie {item.version_number || item.document_version || item.version || 1}</p></div>,
          },
          { key: "period", label: "Periode", render: item => <span>{formatDate(item.valid_from || item.start_date)} – {formatDate(item.valid_until || item.end_date, "doorlopend")}</span> },
          { key: "amount", label: "Waarde", render: item => formatCurrencyCents(item.total_cents ?? item.total_amount_cents ?? item.value_cents) },
          { key: "status", label: "Status", render: item => <StatusBadge status={getRecordStatus(item)} /> },
          { key: "changed", label: "Gewijzigd", render: item => <span className="text-muted-foreground">{formatDate(item.updated_date || item.created_date)}</span> },
        ];
        const rateColumns = [
          { key: "service", label: "Dienst", render: rate => <div><p className="font-medium text-foreground">{rate.service_name || rate.service_type || rate.description || "Tariefregel"}</p><p className="text-xs text-muted-foreground">{rate.object_name || rate.scope_type || "Klantbreed"}</p></div> },
          { key: "model", label: "Model", render: rate => String(rate.unit || rate.pricing_model || rate.unit_type || rate.rate_type || "—").replaceAll("_", " ") },
          { key: "rate", label: "Tarief", render: rate => <span className="font-medium">{formatCurrencyCents(rate.amount_cents ?? rate.rate_cents)}{rate.unit ? ` / ${String(rate.unit).replaceAll("_", " ")}` : ""}</span> },
          { key: "period", label: "Geldig", render: rate => <span>{formatDate(rate.valid_from)} – {formatDate(rate.valid_until, "doorlopend")}</span> },
          { key: "status", label: "Status", render: rate => <StatusBadge status={rate.status || "active"} /> },
        ];

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={FileCheck2} label="Open offertes" value={quotes.filter(item => !["accepted", "rejected", "expired", "withdrawn", "converted"].includes(getRecordStatus(item))).length} />
              <StatCard icon={Handshake} label="Actieve contracten" value={contracts.filter(item => ["active", "signed"].includes(getRecordStatus(item))).length} />
              <StatCard icon={Banknote} label="Actieve tarieven" value={rates.filter(item => item.status !== "archived").length} />
            </div>
            <SectionPanel
              title="Offertes"
              description="Verzonden versies blijven onveranderlijk en zijn afzonderlijk traceerbaar."
              action={primaryAccount ? (
                <Button size="sm" onClick={() => navigate(commercialUrl)}>
                  <ArrowUpRight className="h-4 w-4" /> Commerciële werkruimte
                </Button>
              ) : null}
            >
              <ResponsiveTable
                rows={quotes.map(item => ({ ...item, _kind: "Offerte" }))}
                columns={columns}
                getRowKey={item => `${item._kind.toLowerCase()}:${item.id}`}
                selectedRowKey={selectedRow}
                onRowClick={item => onSelectRow(`${item._kind.toLowerCase()}:${item.id}`)}
                empty={<EmptyState icon={FileCheck2} title="Geen offertes" description="Nieuwe offerteversies verschijnen hier zodra de commerciële workflow is gestart." />}
              />
            </SectionPanel>
            <SectionPanel title="Contracten" description="Ondertekening, looptijd en commerciële status per contractversie.">
              <ResponsiveTable
                rows={contracts.map(item => ({ ...item, _kind: "Contract" }))}
                columns={columns}
                getRowKey={item => `${item._kind.toLowerCase()}:${item.id}`}
                selectedRowKey={selectedRow}
                onRowClick={item => onSelectRow(`${item._kind.toLowerCase()}:${item.id}`)}
                empty={<EmptyState icon={Handshake} title="Geen contracten" description="Geaccepteerde offertes worden als conceptcontract in deze tabel zichtbaar." />}
              />
            </SectionPanel>
            <SectionPanel title="Tariefregels" description="Tarieven zijn periodegebonden en hebben een expliciete dienst- en objectscope.">
              <ResponsiveTable rows={rates} columns={rateColumns} empty={<EmptyState icon={Banknote} title="Geen tariefregels" description="Een uitvoering zonder geldige tariefmatch blijft geblokkeerd voor facturatie." />} />
            </SectionPanel>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function PlanningTab({ customerId, onAddRequest, selectedRow, onSelectRow }) {
  const requestsQuery = useCustomerRecords("CustomerRequest", customerId, true);
  const objectsQuery = useCustomerRecords("SurveillanceObject", customerId, true, "name");
  const tasksQuery = useAllEntityRecords("Task", true, "name");
  const executionsQuery = useCustomerRecords("TaskExecution", customerId, true, "-planned_start_time");

  return (
    <QueryGate queries={[requestsQuery, objectsQuery, tasksQuery, executionsQuery]}>
      {(() => {
        const requests = requestsQuery.data || [];
        const objects = objectsQuery.data || [];
        const objectIds = new Set(objects.map(item => item.id));
        const tasks = (tasksQuery.data || []).filter(item => objectIds.has(item.object_id));
        const executions = executionsQuery.data || [];
        const selected = requests.find(item => `request:${item.id}` === selectedRow);
        const requestColumns = [
          { key: "request", label: "Aanvraag", render: request => <div><p className="font-medium text-foreground">{request.title || request.subject || "Aanvraag"}</p><p className="text-xs text-muted-foreground">{request.request_number || String(request.request_type || "overig").replaceAll("_", " ")}</p></div> },
          { key: "priority", label: "Prioriteit", render: request => <span className="capitalize">{request.priority || "normaal"}</span> },
          { key: "requested", label: "Gewenst", render: request => formatDate(request.requested_for || request.requested_for_date) },
          { key: "status", label: "Status", render: request => <StatusBadge status={getRecordStatus(request)} /> },
          { key: "changed", label: "Gewijzigd", render: request => <span className="text-muted-foreground">{formatDate(request.updated_date || request.created_date)}</span> },
        ];
        const planning = [...executions, ...tasks.filter(task => !executions.some(execution => execution.original_task_id === task.id))]
          .sort((a, b) => String(a.planned_start_time || a.start_date || "").localeCompare(String(b.planned_start_time || b.start_date || "")));
        const planningColumns = [
          { key: "date", label: "Datum / tijd", render: item => <span>{formatDateTime(item.planned_start_time || item.start_date || item.service_date)}</span> },
          { key: "object", label: "Object", render: item => item.object_name || objects.find(object => object.id === item.object_id)?.name || "—" },
          { key: "service", label: "Dienst", render: item => item.task_name || item.name || item.title || "Dienst" },
          { key: "status", label: "Status", render: item => <StatusBadge status={item.status || "pending"} /> },
        ];

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <SectionPanel
              title="Klantaanvragen"
              description="Een aanvraag wordt eerst intern beoordeeld voordat deze planning wordt."
              action={<Button size="sm" onClick={onAddRequest}><Plus className="h-4 w-4" /> Aanvraag</Button>}
            >
              <ResponsiveTable
                rows={requests}
                columns={requestColumns}
                getRowKey={request => `request:${request.id}`}
                selectedRowKey={selectedRow}
                onRowClick={request => onSelectRow(`request:${request.id}`)}
                empty={<EmptyState icon={MessageSquareText} title="Geen aanvragen" description="Nieuwe of telefonisch ontvangen klantvragen kunnen hier worden vastgelegd." action={<Button size="sm" onClick={onAddRequest}><Plus className="h-4 w-4" /> Aanvraag vastleggen</Button>} />}
              />
            </SectionPanel>
            <SectionPanel title="Planning" description="Klantbrede, alleen-lezen weergave van diensten op gekoppelde objecten.">
              <ResponsiveTable rows={planning.slice(0, 100)} columns={planningColumns} empty={<EmptyState icon={CalendarClock} title="Geen planning gevonden" description="Geplande taken op gekoppelde objecten verschijnen hier automatisch." />} />
            </SectionPanel>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function ReportsTab({ customerId, selectedRow, onSelectRow }) {
  const objectsQuery = useCustomerRecords("SurveillanceObject", customerId, true, "name");
  const reportsQuery = useAllEntityRecords("MobileReport", true, "-created_date");
  const publicationsQuery = useCustomerRecords("CustomerPortalPublication", customerId, true);

  return (
    <QueryGate queries={[objectsQuery, reportsQuery, publicationsQuery]}>
      {(() => {
        const objects = objectsQuery.data || [];
        const objectIds = new Set(objects.map(object => object.id));
        const publications = publicationsQuery.data || [];
        const reports = (reportsQuery.data || []).filter(report => objectIds.has(report.object_id) || report.customer_id === customerId);
        const selected = reports.find(report => `report:${report.id}` === selectedRow);
        const columns = [
          { key: "report", label: "Rapport", render: report => <div><p className="font-medium text-foreground">{report.title || report.report_type || report.task_name || "Mobiele rapportage"}</p><p className="text-xs text-muted-foreground">{objects.find(object => object.id === report.object_id)?.name || report.object_name || "Object onbekend"}</p></div> },
          { key: "submitted", label: "Ingediend", render: report => formatDateTime(report.submitted_at || report.completed_at || report.created_date) },
          { key: "review", label: "Review", render: report => <StatusBadge status={report.review_status || report.status || "submitted"} /> },
          {
            key: "publication",
            label: "Klantpublicatie",
            render: report => {
              const publication = publications.find(item => item.source_id === report.id || item.source_entity_id === report.id || item.report_id === report.id);
              return publication ? <StatusBadge status={publication.status || "published"} /> : <span className="text-xs text-muted-foreground">Niet gepubliceerd</span>;
            },
          },
          { key: "version", label: "Versie", render: report => report.publication_version || report.version || "—" },
        ];
        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={FileText} label="Rapporten" value={reports.length} />
              <StatCard icon={Clock3} label="Wacht op review" value={reports.filter(item => ["submitted", "pending_review", "review"].includes(item.review_status || item.status)).length} tone="warning" />
              <StatCard icon={FileCheck2} label="Gepubliceerd" value={publications.filter(item => ["report", "report_publication"].includes(item.publication_type || item.type) && item.status === "published").length} tone="positive" />
            </div>
            <SectionPanel title="Rapportages" description="Alleen een expliciet goedgekeurde publicatieversie wordt klantzichtbaar.">
              <ResponsiveTable
                rows={reports}
                columns={columns}
                getRowKey={report => `report:${report.id}`}
                selectedRowKey={selectedRow}
                onRowClick={report => onSelectRow(`report:${report.id}`)}
                empty={<EmptyState icon={FileText} title="Geen rapportages" description="Uitvoeringsrapporten van gekoppelde objecten verschijnen hier na indiening." />}
              />
            </SectionPanel>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function BillingTab({ customerId, accounts, companies, navigate, selectedRow, onSelectRow }) {
  const candidatesQuery = useCustomerRecords("BillingCandidate", customerId, true);
  const invoicesQuery = useCustomerRecords("SalesInvoice", customerId, true, "-issue_date");
  const invoiceLinesQuery = useCustomerRecords("SalesInvoiceLine", customerId, true);
  const paymentsQuery = useCustomerRecords("Payment", customerId, true, "-payment_date");
  const allocationsQuery = useCustomerRecords("PaymentAllocation", customerId, true);
  const remindersQuery = useCustomerRecords("PaymentReminder", customerId, true);

  return (
    <QueryGate queries={[candidatesQuery, invoicesQuery, invoiceLinesQuery, paymentsQuery, allocationsQuery, remindersQuery]}>
      {(() => {
        const invoices = invoicesQuery.data || [];
        const payments = paymentsQuery.data || [];
        const candidates = candidatesQuery.data || [];
        const reminders = remindersQuery.data || [];
        const outstanding = invoices.reduce((sum, invoice) => (
          ["paid", "cancelled", "credited"].includes(invoice.payment_status || invoice.status)
            ? sum
            : sum + Number(invoice.open_cents ?? invoice.outstanding_amount_cents ?? invoice.total_amount_cents ?? invoice.total_cents ?? 0)
        ), 0);
        const selected = invoices.find(invoice => `invoice:${invoice.id}` === selectedRow);
        const columns = [
          { key: "number", label: "Factuur", render: invoice => <div><p className="font-medium text-foreground">{invoice.invoice_number || "Nog niet uitgegeven"}</p><p className="text-xs text-muted-foreground">{invoice.document_type === "credit_note" ? "Creditnota" : "Factuur"}</p></div> },
          { key: "date", label: "Datum", render: invoice => formatDate(invoice.issue_date || invoice.invoice_date || invoice.created_date) },
          { key: "due", label: "Vervaldatum", render: invoice => formatDate(invoice.due_date) },
          { key: "amount", label: "Totaal", render: invoice => <span className="font-medium">{formatCurrencyCents(invoice.total_amount_cents ?? invoice.total_cents, invoice.currency)}</span> },
          { key: "delivery", label: "Aflevering", render: invoice => <StatusBadge status={invoice.delivery_status || invoice.send_status || "draft"} /> },
          { key: "payment", label: "Betaling", render: invoice => <StatusBadge status={invoice.payment_status || "pending"} /> },
        ];
        const account = accounts.find(item => item.is_primary) || accounts[0];
        const company = companies.find(item => item.id === account?.company_id);
        const billingUrl = account
          ? `/Billing?view=candidate&customer_id=${encodeURIComponent(customerId)}&customer_account_id=${encodeURIComponent(account.id)}&company_id=${encodeURIComponent(account.company_id)}`
          : "";

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={WalletCards} label="Openstaand saldo" value={formatCurrencyCents(outstanding)} tone={outstanding > 0 ? "warning" : "positive"} />
              <StatCard icon={ReceiptText} label="Facturen" value={invoices.length} />
              <StatCard icon={CircleDollarSign} label="Betalingen" value={payments.length} />
              <StatCard icon={TriangleAlert} label="Geblokkeerde regels" value={candidates.filter(item => getRecordStatus(item) === "blocked").length} tone={candidates.some(item => getRecordStatus(item) === "blocked") ? "warning" : "default"} />
            </div>

            <SectionPanel title="Factuurprofiel" description="De financiële instellingen van de primaire bedrijfsrelatie.">
              {account ? (
                <div className="grid gap-4 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Verkopende BV</p><p className="mt-1 font-medium">{getCompanyName(company)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Debiteurnummer</p><p className="mt-1 font-medium">{account.debtor_number || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Betalingstermijn</p><p className="mt-1 font-medium">{account.payment_term_days || 30} dagen</p></div>
                  <div><p className="text-xs text-muted-foreground">Aflevering</p><p className="mt-1 font-medium">{String(account.invoice_delivery_method || "email").replaceAll("_", " ")}</p></div>
                  {account.finance_hold && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:col-span-2 xl:col-span-4">
                      <p className="font-medium">Financiële blokkade actief</p>
                      <p className="mt-1 text-xs">{account.finance_hold_reason || "Nieuwe factuuruitgiftes zijn geblokkeerd."}</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState icon={Landmark} title="Geen factuurprofiel" description="Voeg eerst een bedrijfsrelatie toe onder Beheer." />
              )}
            </SectionPanel>

            <SectionPanel
              title="Facturen en creditnota's"
              description="Uitgegeven documenten zijn onveranderlijk; correcties lopen via creditnota's."
              action={account ? (
                <Button size="sm" onClick={() => navigate(billingUrl)}>
                  <ArrowUpRight className="h-4 w-4" /> Facturatiewerkruimte
                </Button>
              ) : null}
            >
              <ResponsiveTable
                rows={invoices}
                columns={columns}
                getRowKey={invoice => `invoice:${invoice.id}`}
                selectedRowKey={selectedRow}
                onRowClick={invoice => onSelectRow(`invoice:${invoice.id}`)}
                empty={<EmptyState icon={ReceiptText} title="Geen facturen" description="Definitieve facturen en creditnota's verschijnen hier na uitgifte." />}
              />
            </SectionPanel>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionPanel title="Betalingen" description={`${allocationsQuery.data?.length || 0} toewijzing(en) geregistreerd`}>
                {payments.length ? (
                  <div className="divide-y divide-border">
                    {payments.slice(0, 8).map(payment => (
                      <div key={payment.id} className="flex items-center gap-3 px-4 py-3">
                        <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{payment.payment_reference || payment.reference || payment.description || "Betaling"}</p><p className="text-xs text-muted-foreground">{formatDate(payment.received_at || payment.value_date || payment.payment_date || payment.booked_at)}</p></div>
                        <p className="text-sm font-semibold">{formatCurrencyCents(payment.amount_cents, payment.currency)}</p>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={CircleDollarSign} title="Geen betalingen" description="Handmatige en geïmporteerde betalingen verschijnen hier." />}
              </SectionPanel>
              <SectionPanel title="Herinneringen">
                {reminders.length ? (
                  <div className="divide-y divide-border">
                    {reminders.slice(0, 8).map(reminder => (
                      <div key={reminder.id} className="flex items-center gap-3 px-4 py-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{reminder.subject || `Herinnering ${reminder.sequence || reminder.reminder_level || ""}`}</p><p className="text-xs text-muted-foreground">{formatDate(reminder.sent_at || reminder.scheduled_for || reminder.scheduled_at)}</p></div>
                        <StatusBadge status={reminder.status || "pending"} />
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={Mail} title="Geen herinneringen" description="Verzonden en geplande betaalherinneringen worden hier getoond." />}
              </SectionPanel>
            </div>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function DocumentsTab({ customerId, selectedRow, onSelectRow }) {
  const filesQuery = useEntityRecords("ManagedFile", { owner_type: "customer", owner_id: customerId }, true);

  return (
    <QueryGate queries={[filesQuery]}>
      {(() => {
        const files = (filesQuery.data || []).filter(file => matchesCustomerOwner(file, customerId));
        const selected = files.find(file => `document:${file.id}` === selectedRow);
        const columns = [
          { key: "file", label: "Document", render: file => <div><p className="font-medium text-foreground">{file.display_filename || file.original_filename || file.name || "Document"}</p><p className="text-xs text-muted-foreground">{file.category || file.domain || "Overig"}</p></div> },
          { key: "scope", label: "Scope", render: file => file.object_name || file.scope_label || "Klantbreed" },
          { key: "version", label: "Versie", render: file => file.version || file.version_number || "1" },
          { key: "valid", label: "Geldig tot", render: file => formatDate(file.valid_until || file.expires_at) },
          { key: "portal", label: "Portaal", render: file => file.portal_published || file.publication_status === "published" ? <StatusBadge status="published" /> : <span className="text-xs text-muted-foreground">Niet gepubliceerd</span> },
          { key: "changed", label: "Gewijzigd", render: file => formatDate(file.updated_date || file.created_date) },
        ];
        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Uploaden maakt een document nooit automatisch klantzichtbaar. Publicatie vereist een aparte gecontroleerde klantpublicatie.</p>
              </div>
            </div>
            <SectionPanel title="Documenten" description="Bestanden, versies, geldigheid en publicatiestatus.">
              <ResponsiveTable
                rows={files}
                columns={columns}
                getRowKey={file => `document:${file.id}`}
                selectedRowKey={selectedRow}
                onRowClick={file => onSelectRow(`document:${file.id}`)}
                empty={<EmptyState icon={FolderOpen} title="Geen klantdocumenten" description="Klantbrede documenten verschijnen hier nadat ze in de beveiligde bestandsopslag zijn vastgelegd." />}
              />
            </SectionPanel>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function PortalTab({ customerId, core, selectedRow, onSelectRow }) {
  const invitationsQuery = useCustomerRecords("CustomerPortalInvitation", customerId, true);
  const membershipsQuery = useCustomerRecords("CustomerPortalMembership", customerId, true);
  const grantsQuery = useCustomerRecords("CustomerPortalGrant", customerId, true);
  const publicationsQuery = useCustomerRecords("CustomerPortalPublication", customerId, true);
  const auditQuery = useCustomerRecords("CustomerPortalAuditLog", customerId, true, "-occurred_at");
  const supportQuery = useCustomerRecords("CustomerSupportSession", customerId, true);

  return (
    <QueryGate queries={[invitationsQuery, membershipsQuery, grantsQuery, publicationsQuery, auditQuery, supportQuery]}>
      {(() => {
        const invitations = invitationsQuery.data || [];
        const memberships = membershipsQuery.data || [];
        const grants = grantsQuery.data || [];
        const publications = publicationsQuery.data || [];
        const audit = auditQuery.data || [];
        const users = [
          ...memberships.map(item => {
            const contact = core.contacts.find(candidate => candidate.id === item.contact_id);
            const email = contact ? contactPointValue(core.contactPoints, contact.id, "email") : "";
            const membershipGrants = grants.filter(grant => grant.membership_id === item.id && grant.status !== "revoked");
            return {
              ...item,
              _kind: "Lidmaatschap",
              _display_name: contact ? getContactName(contact) : item.user_id || "Portaalgebruiker",
              _email: email,
              _object_count: new Set(membershipGrants.flatMap(grant => grant.object_ids || [])).size,
            };
          }),
          ...invitations.filter(invitation => !memberships.some(membership => membership.invitation_id === invitation.id)).map(item => {
            const contact = core.contacts.find(candidate => candidate.id === item.contact_id);
            return {
              ...item,
              _kind: "Uitnodiging",
              _display_name: contact ? getContactName(contact) : item.email,
              _email: item.email,
              _object_count: 0,
            };
          }),
        ];
        const selected = users.find(item => `portal:${item.id}` === selectedRow);
        const columns = [
          { key: "person", label: "Gebruiker", render: item => <div><p className="font-medium text-foreground">{item._display_name}</p><p className="text-xs text-muted-foreground">{item._email || item._kind}</p></div> },
          { key: "kind", label: "Type", render: item => item._kind },
          { key: "scope", label: "Objectscope", render: item => item._object_count ? `${item._object_count} object(en)` : "Geen objecttoegang" },
          { key: "grants", label: "Rechten", render: item => `${grants.filter(grant => grant.membership_id === item.id && grant.status !== "revoked").length} recht(en)` },
          { key: "status", label: "Status", render: item => <StatusBadge status={item.status || "pending"} /> },
          { key: "valid", label: "Geldig tot", render: item => formatDate(item.expires_at || item.valid_until) },
        ];

        return (
          <div className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={UsersRound} label="Actieve gebruikers" value={memberships.filter(item => item.status === "active").length} />
              <StatCard icon={Mail} label="Open uitnodigingen" value={invitations.filter(item => ["pending", "invited"].includes(item.status)).length} />
              <StatCard icon={ShieldCheck} label="Expliciete rechten" value={grants.filter(item => item.status !== "revoked").length} />
              <StatCard icon={FileCheck2} label="Publicaties" value={publications.filter(item => item.status === "published").length} />
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Toegang wordt per lidmaatschap, module en object verleend. Geen expliciet recht betekent geen toegang; een contactpersoon is niet automatisch een portaalgebruiker.</p>
              </div>
            </div>
            <SectionPanel title="Gebruikers en uitnodigingen">
              <ResponsiveTable
                rows={users}
                columns={columns}
                getRowKey={item => `portal:${item.id}`}
                selectedRowKey={selectedRow}
                onRowClick={item => onSelectRow(`portal:${item.id}`)}
                empty={<EmptyState icon={ShieldCheck} title="Klantportaal niet ingericht" description="Uitnodigingen en rechten worden zichtbaar zodra het portaal voor deze klant is geactiveerd." />}
              />
            </SectionPanel>
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionPanel title="Recente toegang">
                {audit.length ? (
                  <div className="divide-y divide-border">
                    {audit.slice(0, 8).map(item => (
                      <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.action || item.event_type || "Portaalactiviteit"}</p><p className="text-xs text-muted-foreground">{item.actor_email || item.actor_name || "Portaalgebruiker"}</p></div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(item.created_at || item.occurred_at || item.created_date)}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={History} title="Geen toegangshistorie" description="Portaaltoegang en downloads worden hier geaudit." />}
              </SectionPanel>
              <SectionPanel title="Supporttoegang">
                {(supportQuery.data || []).length ? (
                  <div className="divide-y divide-border">
                    {(supportQuery.data || []).slice(0, 8).map(session => (
                      <div key={session.id} className="flex items-center gap-3 px-4 py-3">
                        <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.ticket_reference || "Supportsessie"}</p><p className="text-xs text-muted-foreground">{session.reason || "Geen reden vastgelegd"}</p></div>
                        <StatusBadge status={session.status || "active"} />
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={LockKeyhole} title="Geen supporttoegang" description="Tijdgebonden read-only supportsessies verschijnen hier." />}
              </SectionPanel>
            </div>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function HistoryTab({ customerId, selectedRow, onSelectRow }) {
  const eventsQuery = useCustomerRecords("CustomerEvent", customerId, true, "-occurred_at");
  const requestsQuery = useCustomerRecords("CustomerRequest", customerId, true);

  return (
    <QueryGate queries={[eventsQuery, requestsQuery]}>
      {(() => {
        const events = eventsQuery.data || [];
        const selected = events.find(item => `event:${item.id}` === selectedRow);
        return (
          <div className="space-y-4 p-4 lg:p-5">
            <SectionPanel title="Dossiertijdlijn" description="Interne notities, wijzigingen, communicatie, publicaties en systeemacties.">
              {events.length ? (
                <div className="divide-y divide-border">
                  {events.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectRow(`event:${event.id}`)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/25"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
                        {event.category === "note" ? <MessageSquareText className="h-4 w-4 text-muted-foreground" /> : <History className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{event.title || event.action || event.event_type || "Dossieractiviteit"}</p>
                          {event.category && <Badge variant="outline" className="text-[10px]">{event.category}</Badge>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description || event.summary || event.actor_name || event.source || "LOQ"}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(event.occurred_at || event.created_date)}</span>
                    </button>
                  ))}
                </div>
              ) : <EmptyState icon={History} title="Nog geen historie" description="Append-only klantgebeurtenissen verschijnen hier zodra dossieracties worden uitgevoerd." />}
            </SectionPanel>
            <RecordInspector record={selected} open={Boolean(selected)} onOpenChange={open => !open && onSelectRow(null)} />
          </div>
        );
      })()}
    </QueryGate>
  );
}

function ManageTab({
  customer,
  core,
  companies,
  personnel,
  onAddAccount,
  onEditCustomer,
  onArchive,
  onRestore,
  archivePending,
}) {
  const accountColumns = [
    {
      key: "company",
      label: "Eigen bedrijf",
      render: account => (
        <div>
          <p className="font-medium text-foreground">{getCompanyName(companies.find(company => company.id === account.company_id))}</p>
          <p className="text-xs text-muted-foreground">{account.is_primary ? "Primaire relatie" : "Aanvullende relatie"}</p>
        </div>
      ),
    },
    { key: "debtor", label: "Debiteurnummer", render: account => account.debtor_number || "—" },
    {
      key: "manager",
      label: "Accountmanager",
      render: account => {
        const person = personnel.find(item => item.id === (account.account_manager_id || account.account_manager_personnel_id));
        return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Niet toegewezen";
      },
    },
    { key: "billing", label: "Facturatie", render: account => `${account.payment_term_days || 30} dagen · ${String(account.invoice_delivery_method || "email").replaceAll("_", " ")}` },
    { key: "status", label: "Status", render: account => <StatusBadge status={account.status || "active"} /> },
  ];
  const archived = customer.status === "archived";

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <SectionPanel
        title="Bedrijfsrelaties"
        description="Elke relatie bepaalt de verkopende BV, debiteurcontext en factuurinstellingen."
        action={<Button size="sm" onClick={onAddAccount}><Plus className="h-4 w-4" /> Bedrijfsrelatie</Button>}
      >
        <ResponsiveTable
          rows={core.accounts}
          columns={accountColumns}
          empty={<EmptyState icon={Landmark} title="Geen bedrijfsrelatie" description="Een klant moet aan minimaal één eigen bedrijf worden gekoppeld." action={<Button size="sm" onClick={onAddAccount}><Plus className="h-4 w-4" /> Relatie toevoegen</Button>} />}
        />
      </SectionPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionPanel title="Dossierbeheer">
          <div className="space-y-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Basisgegevens</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Wijzig juridische naam, klantnummer, taal en dossierstatus.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onEditCustomer}>Klantgegevens wijzigen</Button>
          </div>
        </SectionPanel>

        <SectionPanel title={archived ? "Herstellen" : "Archiveren"}>
          <div className="space-y-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">{archived ? "Klant is gearchiveerd" : "Naar archief verplaatsen"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {archived
                  ? "Herstellen maakt de klant weer beschikbaar voor actieve processen."
                  : "Relaties en bewaarplichtige historie blijven behouden. Lopende contracten worden niet automatisch beëindigd."}
              </p>
            </div>
            <Button
              variant={archived ? "outline" : "destructive"}
              size="sm"
              onClick={archived ? onRestore : onArchive}
              disabled={archivePending}
            >
              {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {archivePending ? "Bezig..." : archived ? "Klant herstellen" : "Klant archiveren"}
            </Button>
          </div>
        </SectionPanel>
      </div>

      <SectionPanel title="Definitief verwijderen" description="Alleen lege concepten zonder relaties komen hiervoor in aanmerking.">
        <div className="flex items-start gap-3 p-4">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Verwijderen is afgeschermd</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Voor deze klant wordt archiveren gebruikt. Definitief verwijderen vereist een server-side controle op objecten, collectieven, commerciële administratie, facturen, publicaties, documenten en bewaartermijnen.</p>
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}

export default function CustomerDossierTabs({
  customer,
  customerId,
  activeTab,
  onTabChange,
  selectedRow,
  onSelectRow,
  navigate,
  core,
  companies,
  personnel,
  coreQueries,
  onAddContact,
  contactWizardOpen,
  onCloseContactWizard,
  onSaveContact,
  contactSaving,
  contactError,
  activeContactObjectId,
  onContactObjectChange,
  onAddAccount,
  onAddRequest,
  onEditCustomer,
  onArchive,
  onRestore,
  archivePending,
}) {
  const contactObjectsQuery = useCustomerRecords(
    "SurveillanceObject",
    customerId,
    activeTab === "contacts",
    "name",
  );

  const renderTab = () => {
    if (coreQueries.some(query => query.isLoading)) return <LoadingState label="Klantdossier laden..." />;
    const coreError = coreQueries.find(query => query.isError);
    if (coreError) return <ErrorState query={coreError} label="De basisgegevens van het klantdossier konden niet worden geladen." />;

    switch (activeTab) {
      case "contacts":
        return (
          <QueryGate queries={[contactObjectsQuery]}>
            <ContactsTab
              core={core}
              objects={contactObjectsQuery.data || []}
              activeObjectId={activeContactObjectId}
              onObjectChange={onContactObjectChange}
              onAddContact={onAddContact}
              wizardOpen={contactWizardOpen}
              onCloseWizard={onCloseContactWizard}
              onSaveContact={onSaveContact}
              contactSaving={contactSaving}
              contactError={contactError}
              selectedRow={selectedRow}
              onSelectRow={onSelectRow}
            />
          </QueryGate>
        );
      case "objects":
        return <ObjectsTab customerId={customerId} navigate={navigate} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "commercial":
        return <CommercialTab customerId={customerId} accounts={core.accounts} navigate={navigate} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "planning":
        return <PlanningTab customerId={customerId} onAddRequest={onAddRequest} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "reports":
        return <ReportsTab customerId={customerId} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "billing":
        return <BillingTab customerId={customerId} accounts={core.accounts} companies={companies} navigate={navigate} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "documents":
        return <DocumentsTab customerId={customerId} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "portal":
        return <PortalTab customerId={customerId} core={core} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "history":
        return <HistoryTab customerId={customerId} selectedRow={selectedRow} onSelectRow={onSelectRow} />;
      case "manage":
        return (
          <ManageTab
            customer={customer}
            core={core}
            companies={companies}
            personnel={personnel}
            onAddAccount={onAddAccount}
            onEditCustomer={onEditCustomer}
            onArchive={onArchive}
            onRestore={onRestore}
            archivePending={archivePending}
          />
        );
      default:
        return <OverviewTab customer={customer} customerId={customerId} core={core} onTabChange={onTabChange} />;
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex overflow-x-auto border-b border-border bg-muted/15 lg:hidden">
        {CUSTOMER_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-[520px]">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-muted/15 py-2 lg:block">
          <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Klantdossier</p>
          {CUSTOMER_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-r-2 border-primary bg-primary/5 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{tab.label}</span>
            </button>
          ))}
        </aside>
        <main className="min-w-0 flex-1 bg-background/30">{renderTab()}</main>
      </div>
    </div>
  );
}

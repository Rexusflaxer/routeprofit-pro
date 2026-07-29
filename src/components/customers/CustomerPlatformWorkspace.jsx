import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarRange,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Handshake,
  Inbox,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import PageHeader from "@/components/ui-custom/PageHeader";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  createCustomerMutationKey,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  all: "Alle statussen",
  draft: "Concept",
  pending: "In afwachting",
  collecting: "Verzamelen",
  review: "In beoordeling",
  approved: "Goedgekeurd",
  ready: "Gereed",
  blocked: "Geblokkeerd",
  rejected: "Afgewezen",
  sent: "Verzonden",
  sent_for_signature: "Ter ondertekening",
  signed: "Ondertekend",
  accepted: "Geaccepteerd",
  expired: "Verlopen",
  withdrawn: "Ingetrokken",
  converted: "Omgezet",
  active: "Actief",
  suspended: "Gepauzeerd",
  ended: "Beëindigd",
  superseded: "Vervangen",
  archived: "Gearchiveerd",
  invoiced: "Gefactureerd",
  issuing: "Uitgeven",
  completed: "Afgerond",
  partial_failed: "Deels mislukt",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
  issue_pending: "Uitgifte gepland",
  issued: "Uitgegeven",
  issue_failed: "Uitgifte mislukt",
  not_scheduled: "Niet gepland",
  queued: "In wachtrij",
  delivered: "Afgeleverd",
  not_due: "Nog niet vervallen",
  open: "Open",
  partially_paid: "Deels betaald",
  overdue: "Vervallen",
  overpaid: "Te veel betaald",
  written_off: "Afgeboekt",
  booked: "Geboekt",
  partially_allocated: "Deels toegewezen",
  allocated: "Toegewezen",
  reversed: "Teruggedraaid",
  scheduled: "Gepland",
  paid: "Betaald",
};

const WORKSPACES = {
  commercial: {
    action: "list_commercial",
    title: "Commercie",
    subtitle: "Offertes, contracten en periodegebonden tariefregels",
    featureFlag: "commercial_contracts",
    views: {
      quote: {
        label: "Offertes",
        singular: "Offerte",
        icon: FileCheck2,
        statuses: ["all", "draft", "review", "approved", "sent", "accepted", "rejected", "expired", "withdrawn", "converted"],
        defaultSort: "-updated_date",
        emptyTitle: "Geen offertes gevonden",
        emptyDescription: "Er zijn geen offerteversies die aan deze filters voldoen.",
      },
      contract: {
        label: "Contracten",
        singular: "Contract",
        icon: Handshake,
        statuses: ["all", "draft", "review", "approved", "sent_for_signature", "signed", "active", "suspended", "ended", "superseded", "archived"],
        defaultSort: "-updated_date",
        emptyTitle: "Geen contracten gevonden",
        emptyDescription: "Er zijn geen contractversies die aan deze filters voldoen.",
      },
      rate: {
        label: "Tariefregels",
        singular: "Tariefregel",
        icon: Banknote,
        statuses: ["all", "draft", "active", "superseded", "ended", "archived"],
        defaultSort: "-valid_from",
        emptyTitle: "Geen tariefregels gevonden",
        emptyDescription: "Er zijn geen tarieven die aan deze filters voldoen.",
      },
    },
  },
  billing: {
    action: "list_billing",
    title: "Facturatie",
    subtitle: "Factureerbare regels, factuurruns, facturen, betalingen en herinneringen",
    featureFlag: "billing_shadow",
    views: {
      candidate: {
        label: "Factureerbare regels",
        singular: "Factureerbare regel",
        icon: FileText,
        statuses: ["all", "pending", "blocked", "ready", "approved", "invoiced", "rejected", "cancelled"],
        defaultSort: "-service_date",
        emptyTitle: "Geen factureerbare regels",
        emptyDescription: "Er zijn geen uitvoeringen of periodeposten die aan deze filters voldoen.",
      },
      run: {
        label: "Factuurruns",
        singular: "Factuurrun",
        icon: CalendarRange,
        statuses: ["all", "draft", "collecting", "review", "approved", "issuing", "completed", "partial_failed", "failed", "cancelled"],
        defaultSort: "-created_date",
        emptyTitle: "Geen factuurruns",
        emptyDescription: "Er zijn geen factuurruns die aan deze filters voldoen.",
      },
      invoice: {
        label: "Facturen",
        singular: "Factuur",
        icon: FileText,
        statuses: ["all", "draft", "review", "approved", "issue_pending", "issued", "issue_failed", "cancelled"],
        defaultSort: "-invoice_date",
        emptyTitle: "Geen facturen gevonden",
        emptyDescription: "Er zijn geen facturen of creditnota's die aan deze filters voldoen.",
      },
      payment: {
        label: "Betalingen",
        singular: "Betaling",
        icon: CircleDollarSign,
        statuses: ["all", "pending", "booked", "partially_allocated", "allocated", "reversed", "failed"],
        defaultSort: "-received_at",
        emptyTitle: "Geen betalingen gevonden",
        emptyDescription: "Er zijn geen handmatige of geïmporteerde betalingen die aan deze filters voldoen.",
      },
      reminder: {
        label: "Herinneringen",
        singular: "Herinnering",
        icon: ShieldAlert,
        statuses: ["all", "draft", "scheduled", "sent", "failed", "cancelled", "paid"],
        defaultSort: "-scheduled_for",
        emptyTitle: "Geen herinneringen gevonden",
        emptyDescription: "Er zijn geen geplande of verzonden betaalherinneringen die aan deze filters voldoen.",
      },
    },
  },
};

function first(record, keys, fallback = "—") {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], record);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return fallback;
}

function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value, currency = "EUR") {
  if (value === null || value === undefined || value === "—") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: currency || "EUR" }).format(amount / 100);
}

function statusValue(record) {
  return first(record, ["lifecycle_status", "status"], "draft");
}

function StatusBadge({ status }) {
  const value = status || "draft";
  const tone = ["active", "approved", "signed", "accepted", "issued", "completed", "allocated", "paid", "ready"].includes(value)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    : ["blocked", "failed", "issue_failed", "partial_failed", "rejected"].includes(value)
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      : ["review", "pending", "collecting", "issuing", "scheduled", "partially_allocated"].includes(value)
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-border bg-muted/35 text-muted-foreground";
  return <Badge variant="outline" className={`whitespace-nowrap text-[11px] ${tone}`}>{STATUS_LABELS[value] || String(value).replaceAll("_", " ")}</Badge>;
}

function customerName(record) {
  const resolved = first(record, [
    "customer_name",
    "customer_snapshot.name",
    "customer_snapshot.trade_name",
    "customer_snapshot.legal_name",
    "customer.name",
  ], null);
  return resolved || (record.customer_id ? `Klant ${String(record.customer_id).slice(0, 8)}` : "Klant");
}

function companyName(record) {
  const resolved = first(record, [
    "company_name",
    "company_snapshot.display_name",
    "company_snapshot.trade_name",
    "company_snapshot.legal_name",
  ], null);
  return resolved || (record.company_id ? `BV ${String(record.company_id).slice(0, 8)}` : "—");
}

function CustomerLink({ record }) {
  const customerId = first(record, ["customer_id"], null);
  const name = customerName(record);
  if (!customerId) return <span>{name}</span>;
  return (
    <Link
      to={`/CustomerDetail?id=${encodeURIComponent(customerId)}&tab=overview`}
      onClick={event => event.stopPropagation()}
      className="font-medium text-foreground hover:text-primary hover:underline"
    >
      {name}
    </Link>
  );
}

function columnsFor(workspace, view) {
  const sharedCustomer = { key: "customer", label: "Klant", render: record => <CustomerLink record={record} /> };
  if (workspace === "commercial" && view === "quote") {
    return [
      { key: "quote", label: "Offerte", render: record => <TitleCell title={first(record, ["quote_number", "title"], "Conceptofferte")} hint={first(record, ["title", "description"], "")} /> },
      sharedCustomer,
      { key: "company", label: "Verkopende BV", render: record => companyName(record) },
      { key: "valid", label: "Uitgegeven / geldig tot", render: record => `${formatDate(first(record, ["issue_date"], null))} · ${formatDate(first(record, ["valid_until"], null))}` },
      { key: "total", label: "Totaal", render: record => <strong>{formatCurrency(first(record, ["total_cents"], null), record.currency)}</strong> },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  if (workspace === "commercial" && view === "contract") {
    return [
      { key: "contract", label: "Contract", render: record => <TitleCell title={first(record, ["contract_number", "title"], "Conceptcontract")} hint={first(record, ["title", "description"], "")} /> },
      sharedCustomer,
      { key: "company", label: "Verkopende BV", render: record => companyName(record) },
      { key: "period", label: "Looptijd", render: record => `${formatDate(record.start_date)} – ${formatDate(record.end_date, "doorlopend")}` },
      { key: "frequency", label: "Facturatie", render: record => String(first(record, ["billing_frequency"], "—")).replaceAll("_", " ") },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  if (workspace === "commercial" && view === "rate") {
    return [
      { key: "rate", label: "Tariefregel", render: record => <TitleCell title={first(record, ["rate_code", "service_name", "description"], "Tariefregel")} hint={first(record, ["description", "contract_title"], "")} /> },
      sharedCustomer,
      { key: "unit", label: "Eenheid", render: record => String(first(record, ["unit"], "—")).replaceAll("_", " ") },
      { key: "amount", label: "Tarief", render: record => <strong>{formatCurrency(record.amount_cents, record.currency)}</strong> },
      { key: "period", label: "Geldig", render: record => `${formatDate(record.valid_from)} – ${formatDate(record.valid_until, "doorlopend")}` },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  if (workspace === "billing" && view === "candidate") {
    return [
      { key: "candidate", label: "Factureerbare regel", render: record => <TitleCell title={first(record, ["description"], "Factureerbare regel")} hint={first(record, ["block_reason", "source_type"], "")} /> },
      sharedCustomer,
      { key: "service", label: "Dienst-/periodedatum", render: record => formatDate(first(record, ["service_date", "period_start"], null)) },
      { key: "quantity", label: "Aantal / eenheid", render: record => `${first(record, ["quantity", "quantity_minor"], "—")} ${String(first(record, ["unit"], "")).replaceAll("_", " ")}` },
      { key: "total", label: "Totaal", render: record => <strong>{formatCurrency(record.total_cents, record.currency)}</strong> },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  if (workspace === "billing" && view === "run") {
    return [
      { key: "run", label: "Factuurrun", render: record => <TitleCell title={first(record, ["run_number"], "Concept-run")} hint={`${record.candidate_count || 0} regels · ${record.invoice_count || 0} facturen`} /> },
      { key: "company", label: "Verkopende BV", render: record => companyName(record) },
      { key: "period", label: "Periode", render: record => `${formatDate(record.period_start)} – ${formatDate(record.period_end)}` },
      { key: "blocked", label: "Geblokkeerd", render: record => record.blocked_count || 0 },
      { key: "total", label: "Totaal", render: record => <strong>{formatCurrency(record.total_cents, record.currency)}</strong> },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  if (workspace === "billing" && view === "invoice") {
    return [
      { key: "invoice", label: "Factuur", render: record => <TitleCell title={first(record, ["invoice_number"], "Nog niet uitgegeven")} hint={record.document_type === "credit_note" ? "Creditnota" : "Factuur"} /> },
      sharedCustomer,
      { key: "date", label: "Factuur / vervaldatum", render: record => `${formatDate(first(record, ["invoice_date", "issue_date"], null))} · ${formatDate(record.due_date)}` },
      { key: "total", label: "Totaal", render: record => <strong>{formatCurrency(record.total_cents, record.currency)}</strong> },
      { key: "delivery", label: "Aflevering", render: record => <StatusBadge status={record.delivery_status || "not_scheduled"} /> },
      { key: "payment", label: "Betaling", render: record => <StatusBadge status={record.payment_status || "not_due"} /> },
    ];
  }
  if (workspace === "billing" && view === "payment") {
    return [
      { key: "payment", label: "Betaling", render: record => <TitleCell title={first(record, ["payment_reference", "description"], "Betaling")} hint={first(record, ["payer_name", "source"], "")} /> },
      sharedCustomer,
      { key: "received", label: "Ontvangen", render: record => formatDateTime(first(record, ["received_at", "value_date"], null)) },
      { key: "amount", label: "Bedrag", render: record => <strong>{formatCurrency(record.amount_cents, record.currency)}</strong> },
      { key: "unallocated", label: "Niet toegewezen", render: record => formatCurrency(record.unallocated_cents, record.currency) },
      { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
    ];
  }
  return [
    { key: "reminder", label: "Herinnering", render: record => <TitleCell title={`Herinnering ${record.sequence || ""}`} hint={String(first(record, ["reminder_type", "channel"], "")).replaceAll("_", " ")} /> },
    sharedCustomer,
    { key: "scheduled", label: "Gepland / verzonden", render: record => `${formatDateTime(record.scheduled_for)} · ${formatDateTime(record.sent_at)}` },
    { key: "amount", label: "Openstaand", render: record => <strong>{formatCurrency(record.open_amount_cents, record.currency)}</strong> },
    { key: "channel", label: "Kanaal", render: record => String(first(record, ["channel"], "—")).replaceAll("_", " ") },
    { key: "status", label: "Status", render: record => <StatusBadge status={statusValue(record)} /> },
  ];
}

function TitleCell({ title, hint }) {
  return (
    <div className="min-w-0">
      <p className="max-w-[280px] truncate font-medium text-foreground" title={title}>{title}</p>
      {hint && hint !== title && <p className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function normalizeResponse(response, fallbackPage) {
  const payload = response?.data?.data || response?.data || {};
  if (payload?.error) throw new Error(payload.error.message || payload.error);
  if (payload?.ok === false) throw new Error(payload.message || "De werkruimte kon niet worden geladen.");
  const hasItemsContract = Array.isArray(payload.items);
  return {
    ...payload,
    available: payload.available !== false && payload.backend_available !== false && hasItemsContract,
    items: hasItemsContract ? payload.items : [],
    total: Number(payload.total || 0),
    page: Number(payload.page || fallbackPage || 1),
    page_size: Number(payload.page_size || PAGE_SIZE),
  };
}

function featureFlagValue(data, flag) {
  const sources = [
    data?.feature_flags,
    data?.settings?.feature_flags,
    data?.billing_settings?.feature_flags,
    data?.company_billing_settings?.feature_flags,
  ].filter(Boolean);
  for (const source of sources) {
    if (Array.isArray(source) && source.includes(flag)) return true;
    if (!Array.isArray(source) && Object.prototype.hasOwnProperty.call(source, flag)) return source[flag];
  }
  return undefined;
}

function isBackendUnavailable(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return ["not found", "404", "unknown function", "function is not available", "nog niet beschikbaar"].some(fragment => message.includes(fragment));
}

async function loadWorkspace({ action, view, status, search, page, sort, row, companyId, customerId }) {
  const response = await base44.functions.invoke("customerPlatformApi", {
    action,
    view,
    company_id: companyId || null,
    customer_id: customerId || null,
    status: status === "all" ? null : status,
    search: search || null,
    page,
    page_size: PAGE_SIZE,
    sort,
    row: row || null,
  });
  return normalizeResponse(response, page);
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function MutationField({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required ? " *" : ""}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CommercialMutationDialog({
  kind,
  open,
  onOpenChange,
  onSubmit,
  pending,
  error,
  context,
}) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (!open) return;
    setForm(kind === "rate"
      ? {
          amount: "",
          unit: "hour",
          vat_rate_basis_points: "2100",
          valid_from: today(),
          valid_until: "",
        }
      : {
          title: "",
          description: "",
          valid_until: "",
          start_date: today(),
          end_date: "",
          billing_frequency: "monthly",
        });
  }, [kind, open]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const valid = kind === "rate"
    ? Boolean(context.contractLineId && form.amount !== "" && Number.isFinite(Number(form.amount)) && Number(form.amount) >= 0 && form.valid_from)
    : Boolean(context.customerId && context.customerAccountId && form.title?.trim());
  const labels = {
    quote: ["Conceptofferte maken", "Maak een nieuwe, nog niet verzonden offerteversie binnen de gekozen klant- en BV-context."],
    contract: ["Conceptcontract maken", "Maak een afzonderlijk conceptcontract; dienstverlening wordt hiermee nog niet geactiveerd."],
    rate: ["Concepttarief toevoegen", "Voeg een periodegebonden tarief toe aan de gekozen contractregel."],
  };
  const [title, description] = labels[kind] || labels.quote;

  const submit = event => {
    event.preventDefault();
    if (valid) onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id="commercial-mutation-form" className="space-y-4" onSubmit={submit}>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            {kind === "rate"
              ? `Contractregel ${String(context.contractLineId || "ontbreekt").slice(0, 12)}`
              : `Klant ${String(context.customerId || "ontbreekt").slice(0, 12)} · relatie ${String(context.customerAccountId || "ontbreekt").slice(0, 12)}`}
          </div>
          {kind === "rate" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <MutationField label="Tarief excl. btw" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount || ""}
                    onChange={event => set("amount", event.target.value)}
                    placeholder="0,00"
                    autoFocus
                  />
                </MutationField>
                <MutationField label="Eenheid" required>
                  <Select value={form.unit || "hour"} onValueChange={value => set("unit", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Vaste periode</SelectItem>
                      <SelectItem value="execution">Uitvoering</SelectItem>
                      <SelectItem value="minute">Minuut</SelectItem>
                      <SelectItem value="hour">Uur</SelectItem>
                      <SelectItem value="unit">Eenheid</SelectItem>
                      <SelectItem value="kilometer">Kilometer</SelectItem>
                    </SelectContent>
                  </Select>
                </MutationField>
                <MutationField label="Btw">
                  <Select value={form.vat_rate_basis_points || "2100"} onValueChange={value => set("vat_rate_basis_points", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2100">21%</SelectItem>
                      <SelectItem value="900">9%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </MutationField>
                <MutationField label="Geldig vanaf" required>
                  <Input type="date" value={form.valid_from || ""} onChange={event => set("valid_from", event.target.value)} />
                </MutationField>
                <MutationField label="Geldig tot">
                  <Input type="date" value={form.valid_until || ""} onChange={event => set("valid_until", event.target.value)} />
                </MutationField>
              </div>
            </>
          ) : (
            <>
              <MutationField label="Titel" required>
                <Input value={form.title || ""} onChange={event => set("title", event.target.value)} autoFocus />
              </MutationField>
              <MutationField label="Omschrijving">
                <Textarea value={form.description || ""} onChange={event => set("description", event.target.value)} rows={3} />
              </MutationField>
              {kind === "quote" ? (
                <MutationField label="Geldig tot">
                  <Input type="date" value={form.valid_until || ""} onChange={event => set("valid_until", event.target.value)} />
                </MutationField>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <MutationField label="Startdatum">
                    <Input type="date" value={form.start_date || ""} onChange={event => set("start_date", event.target.value)} />
                  </MutationField>
                  <MutationField label="Einddatum">
                    <Input type="date" value={form.end_date || ""} onChange={event => set("end_date", event.target.value)} />
                  </MutationField>
                  <MutationField label="Facturatiefrequentie">
                    <Select value={form.billing_frequency || "monthly"} onValueChange={value => set("billing_frequency", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Maandelijks</SelectItem>
                        <SelectItem value="four_weekly">Vierwekelijks</SelectItem>
                        <SelectItem value="quarterly">Per kwartaal</SelectItem>
                        <SelectItem value="yearly">Jaarlijks</SelectItem>
                        <SelectItem value="on_completion">Na uitvoering</SelectItem>
                      </SelectContent>
                    </Select>
                  </MutationField>
                </div>
              )}
            </>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message || "Opslaan is niet gelukt."}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuleren</Button>
          <Button type="submit" form="commercial-mutation-form" disabled={!valid || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Concept maken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceState({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function WorkspaceTabs({ config, activeView, onViewChange }) {
  return (
    <div className="flex overflow-x-auto border-b border-border bg-muted/15">
      {Object.entries(config.views).map(([key, view]) => (
        <button
          key={key}
          type="button"
          onClick={() => onViewChange(key)}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
            activeView === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <view.icon className="h-3.5 w-3.5" />
          {view.label}
        </button>
      ))}
    </div>
  );
}

function WorkspaceTable({
  rows,
  columns,
  selectedRow,
  onSelectRow,
  emptyConfig,
  selectable,
  selectedIds,
  onToggleSelection,
}) {
  if (!rows.length) {
    return <WorkspaceState icon={Inbox} title={emptyConfig.emptyTitle} description={emptyConfig.emptyDescription} />;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/25 hover:bg-muted/25">
              {selectable && <TableHead className="w-10"><span className="sr-only">Selecteren</span></TableHead>}
              {columns.map(column => <TableHead key={column.key} className="text-xs font-semibold text-muted-foreground">{column.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(record => (
              <TableRow
                key={record.id}
                tabIndex={0}
                aria-selected={selectedRow === record.id}
                onClick={() => onSelectRow(record.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRow(record.id);
                  }
                }}
                className={`cursor-pointer ${selectedRow === record.id ? "bg-primary/5" : "hover:bg-muted/25"}`}
              >
                {selectable && (
                  <TableCell
                    className="w-10"
                    onClick={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(record.id)}
                      disabled={!selectable(record)}
                      onCheckedChange={() => onToggleSelection(record)}
                      aria-label={`${first(record, ["description"], "Factureerbare regel")} selecteren`}
                    />
                  </TableCell>
                )}
                {columns.map(column => <TableCell key={column.key} className="text-sm">{column.render(record)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map(record => (
          <div key={record.id} className={`flex items-start ${selectedRow === record.id ? "bg-primary/5" : "hover:bg-muted/25"}`}>
            {selectable && (
              <div className="px-3 pt-4">
                <Checkbox
                  checked={selectedIds.has(record.id)}
                  disabled={!selectable(record)}
                  onCheckedChange={() => onToggleSelection(record)}
                  aria-label={`${first(record, ["description"], "Factureerbare regel")} selecteren`}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectRow(record.id)}
              className="min-w-0 flex-1 space-y-2 px-4 py-3 text-left"
            >
              {columns.map(column => (
                <div key={column.key} className="grid grid-cols-[108px_minmax(0,1fr)] gap-3 text-sm">
                  <span className="text-xs text-muted-foreground">{column.label}</span>
                  <div className="min-w-0">{column.render(record)}</div>
                </div>
              ))}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function RecordPanel({ config, view, rowId, record, onClose }) {
  const viewConfig = config.views[view];
  const hiddenKeys = new Set(["id", "created_by", "updated_by"]);
  const entries = record
    ? Object.entries(record).filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== undefined && value !== "").slice(0, 22)
    : [];
  return (
    <Sheet open={Boolean(rowId)} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{record ? first(record, ["title", "quote_number", "contract_number", "invoice_number", "run_number", "payment_reference", "description"], viewConfig.singular) : viewConfig.singular}</SheetTitle>
          <SheetDescription>Alleen-lezen detail uit de centrale {config.title.toLowerCase()}werkruimte.</SheetDescription>
        </SheetHeader>
        {record ? (
          <div className="mt-6 space-y-2">
            {record.customer_id && (
              <Link to={`/CustomerDetail?id=${encodeURIComponent(record.customer_id)}&tab=overview`} className="mb-4 flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/10">
                {customerName(record)}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {entries.map(([key, value]) => (
              <div key={key} className="rounded-md border border-border px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{key.replaceAll("_", " ")}</p>
                <p className="mt-1 break-words text-sm text-foreground">
                  {typeof value === "object" ? JSON.stringify(value) : typeof value === "boolean" ? (value ? "Ja" : "Nee") : String(value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Het geselecteerde record staat niet in deze resultatenpagina. Sluit het paneel of pas de filters aan.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Pagination({ page, total, pageSize, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total ? (page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">{firstResult}–{lastResult} van {total}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Vorige
        </Button>
        <span className="min-w-20 text-center text-xs text-muted-foreground">Pagina {page} van {totalPages}</span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Volgende <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function CustomerPlatformWorkspace({ workspace }) {
  const config = WORKSPACES[workspace];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultView = Object.keys(config.views)[0];
  const requestedView = searchParams.get("view") || defaultView;
  const view = config.views[requestedView] ? requestedView : defaultView;
  const viewConfig = config.views[view];
  const requestedStatus = searchParams.get("status") || "all";
  const status = viewConfig.statuses.includes(requestedStatus) ? requestedStatus : "all";
  const search = searchParams.get("search") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const sort = searchParams.get("sort") || viewConfig.defaultSort;
  const row = searchParams.get("row") || "";
  const companyId = searchParams.get("company_id") || "";
  const customerId = searchParams.get("customer_id") || "";
  const customerAccountId = searchParams.get("customer_account_id") || "";
  const contractLineId = searchParams.get("contract_line_id") || "";
  const [searchInput, setSearchInput] = useState(search);
  const [commercialDialog, setCommercialDialog] = useState(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(() => new Set());

  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => setSelectedCandidateIds(new Set()), [page, search, sort, status, view, workspace]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.get("view") !== view) { next.set("view", view); changed = true; }
    if (next.get("status") !== status) { next.set("status", status); changed = true; }
    if (next.get("page") !== String(page)) { next.set("page", String(page)); changed = true; }
    if (!next.get("sort")) { next.set("sort", sort); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  }, [page, searchParams, setSearchParams, sort, status, view]);

  useEffect(() => {
    if (searchInput === search) return undefined;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) next.set("search", searchInput.trim());
      else next.delete("search");
      next.set("page", "1");
      next.delete("row");
      setSearchParams(next);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, searchInput, searchParams, setSearchParams]);

  const query = useQuery({
    queryKey: ["customer-platform-workspace", workspace, view, status, search, page, sort, row, companyId, customerId],
    queryFn: () => loadWorkspace({
      action: config.action,
      view,
      status,
      search,
      page,
      sort,
      row,
      companyId,
      customerId,
    }),
    retry: 1,
    placeholderData: previous => previous,
  });

  const data = query.data;
  const items = data?.items || [];
  const columns = useMemo(() => columnsFor(workspace, view), [view, workspace]);
  const selectedRecord = items.find(item => item.id === row);
  const actionContext = {
    companyId: companyId || selectedRecord?.company_id || "",
    customerId: customerId || selectedRecord?.customer_id || "",
    customerAccountId: customerAccountId || selectedRecord?.customer_account_id || "",
    contractLineId: contractLineId
      || selectedRecord?.contract_line_id
      || selectedRecord?.customer_contract_line_id
      || "",
  };
  const selectedCandidates = items.filter(item => selectedCandidateIds.has(item.id));
  const featureEnabled = data ? featureFlagValue(data, config.featureFlag) : undefined;
  const workspaceBlocked = data?.workspace_enabled === false || data?.feature_enabled === false || featureEnabled === false;

  const changeParams = changes => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next);
  };

  const changeView = nextView => {
    const target = config.views[nextView];
    changeParams({
      view: nextView,
      status: "all",
      page: 1,
      sort: target.defaultSort,
      row: null,
    });
  };

  const refreshWorkspace = () => queryClient.invalidateQueries({
    queryKey: ["customer-platform-workspace", workspace],
  });

  const commercialMutation = useMutation({
    mutationFn: async ({ kind, form, context, idempotencyKey }) => {
      if (kind === "quote") {
        return invokeCustomerPlatformMutation({
          action: "create_quote",
          idempotency_key: idempotencyKey,
          expected_version: 0,
          customer_id: context.customerId,
          data: {
            customer_account_id: context.customerAccountId,
            title: form.title.trim(),
            description: form.description?.trim() || null,
            currency: "EUR",
            valid_until: form.valid_until || null,
          },
          lines: [],
        });
      }
      if (kind === "contract") {
        return invokeCustomerPlatformMutation({
          action: "create_contract",
          idempotency_key: idempotencyKey,
          expected_version: 0,
          customer_id: context.customerId,
          data: {
            customer_account_id: context.customerAccountId,
            title: form.title.trim(),
            description: form.description?.trim() || null,
            currency: "EUR",
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            billing_frequency: form.billing_frequency || "monthly",
          },
        });
      }
      return invokeCustomerPlatformMutation({
        action: "create_contract_rate",
        idempotency_key: idempotencyKey,
        expected_version: 0,
        contract_line_id: context.contractLineId,
        data: {
          unit: form.unit,
          amount_cents: Math.round(Number(form.amount) * 100),
          currency: selectedRecord?.currency || "EUR",
          vat_rate_basis_points: Number(form.vat_rate_basis_points || 2100),
          minimum_quantity_minor: 0,
          rounding_increment_minor: 1,
          priority: 0,
          valid_from: form.valid_from,
          valid_until: form.valid_until || null,
        },
      });
    },
    onSuccess: async (result, variables) => {
      await refreshWorkspace();
      setCommercialDialog(null);
      const created = result.quote || result.contract || result.rate;
      changeParams({
        view: variables.kind,
        status: "all",
        page: 1,
        row: created?.id || null,
      });
      toast({
        title: variables.kind === "quote"
          ? "Conceptofferte gemaakt"
          : variables.kind === "contract"
            ? "Conceptcontract gemaakt"
            : "Concepttarief toegevoegd",
      });
    },
  });

  const approveCandidatesMutation = useMutation({
    mutationFn: async records => {
      const results = [];
      for (const { candidate, idempotencyKey } of records) {
        results.push(await invokeCustomerPlatformMutation({
          action: "transition_billing_candidate",
          idempotency_key: idempotencyKey,
          expected_version: Number(candidate.version || 1),
          billing_candidate_id: candidate.id,
          status: "approved",
          ...(candidate.task_execution_id
            ? { task_execution_expected_version: Number(candidate.task_execution_version) }
            : {}),
        }));
      }
      return results;
    },
    onSuccess: async results => {
      setSelectedCandidateIds(new Set());
      await refreshWorkspace();
      toast({
        title: results.length === 1 ? "Factuurregel goedgekeurd" : `${results.length} factuurregels goedgekeurd`,
      });
    },
  });

  const invoiceDraftMutation = useMutation({
    mutationFn: ({ candidates, idempotencyKey }) => invokeCustomerPlatformMutation({
      action: "create_invoice_draft",
      idempotency_key: idempotencyKey,
      expected_version: 0,
      billing_candidate_ids: candidates.map(candidate => candidate.id),
      candidate_expected_versions: Object.fromEntries(
        candidates.map(candidate => [candidate.id, Number(candidate.version || 1)]),
      ),
    }),
    onSuccess: async result => {
      setSelectedCandidateIds(new Set());
      await refreshWorkspace();
      changeParams({
        view: "invoice",
        status: "all",
        page: 1,
        sort: WORKSPACES.billing.views.invoice.defaultSort,
        row: result.invoice?.id || null,
      });
      toast({ title: "Conceptfactuur gemaakt", description: "De factuur is nog niet uitgegeven of verzonden." });
    },
  });

  const toggleCandidate = candidate => {
    setSelectedCandidateIds(current => {
      const next = new Set(current);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
  };
  const canSelectCandidate = candidate => ["pending", "ready", "approved"].includes(statusValue(candidate));
  const readySelection = selectedCandidates.length > 0
    && selectedCandidates.every(candidate => ["pending", "ready"].includes(statusValue(candidate)))
    && selectedCandidates.every(candidate => !candidate.task_execution_id || Number(candidate.task_execution_version) >= 1);
  const approvedSelection = selectedCandidates.length > 0
    && selectedCandidates.every(candidate => statusValue(candidate) === "approved");
  const commercialContextReady = view === "rate"
    ? Boolean(actionContext.contractLineId)
    : Boolean(actionContext.customerId && actionContext.customerAccountId);
  const mutationError = commercialMutation.error || approveCandidatesMutation.error || invoiceDraftMutation.error;
  const commercialActionLabel = view === "quote"
    ? "Nieuwe offerte"
    : view === "contract"
      ? "Nieuw contract"
      : "Tarief toevoegen";

  return (
    <PageTransition>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={workspace === "commercial" ? (
          <Button
            onClick={() => setCommercialDialog(view)}
            disabled={!commercialContextReady || workspaceBlocked || query.isLoading}
            title={!commercialContextReady ? "Open deze werkruimte vanuit een klantdossier of selecteer een record met de juiste context." : undefined}
          >
            <Plus className="h-4 w-4" /> {commercialActionLabel}
          </Button>
        ) : undefined}
      />

      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <WorkspaceTabs config={config} activeView={view} onViewChange={changeView} />
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto] lg:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder={`Zoek in ${viewConfig.label.toLowerCase()}...`}
              className="pl-9"
            />
            {query.isFetching && !query.isLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <Select value={status} onValueChange={value => changeParams({ status: value, page: 1, row: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {viewConfig.statuses.map(value => <SelectItem key={value} value={value}>{STATUS_LABELS[value] || value}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={value => changeParams({ sort: value, page: 1, row: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={viewConfig.defaultSort}>Nieuwste eerst</SelectItem>
              <SelectItem value={viewConfig.defaultSort.replace(/^-/, "")}>Oudste eerst</SelectItem>
              <SelectItem value="status">Status A–Z</SelectItem>
              <SelectItem value="-status">Status Z–A</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex justify-end">
            <span className="whitespace-nowrap rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{data?.total || 0}</strong> resultaten
            </span>
          </div>
        </div>
      </div>

      {workspace === "billing" && view === "candidate" && data?.available && !workspaceBlocked && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {selectedCandidates.length ? `${selectedCandidates.length} regel${selectedCandidates.length === 1 ? "" : "s"} geselecteerd` : "Selecteer factureerbare regels"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gereedstaande regels worden eerst goedgekeurd; alleen goedgekeurde regels kunnen samen een conceptfactuur vormen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!readySelection || approveCandidatesMutation.isPending || invoiceDraftMutation.isPending}
              onClick={() => approveCandidatesMutation.mutate(selectedCandidates.map(candidate => ({
                candidate,
                idempotencyKey: createCustomerMutationKey("approve_billing_candidate"),
              })))}
            >
              {approveCandidatesMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Selectie goedkeuren
            </Button>
            <Button
              size="sm"
              disabled={!approvedSelection || invoiceDraftMutation.isPending || approveCandidatesMutation.isPending}
              onClick={() => invoiceDraftMutation.mutate({
                candidates: selectedCandidates,
                idempotencyKey: createCustomerMutationKey("create_invoice_draft"),
              })}
            >
              {invoiceDraftMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Conceptfactuur maken
            </Button>
          </div>
        </div>
      )}

      {mutationError && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {mutationError.message || "De actie kon niet worden uitgevoerd."}
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          {[1, 2, 3, 4, 5].map(value => <div key={value} className="h-12 animate-pulse rounded-md bg-muted/30" />)}
        </div>
      ) : query.isError ? (
        isBackendUnavailable(query.error) ? (
          <WorkspaceState
            icon={LockKeyhole}
            title="Backend nog niet beschikbaar"
            description={`De read-action ${config.action} is nog niet gedeployed. Er worden geen lokale of directe entiteitsreads als fallback uitgevoerd.`}
            action={<Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw controleren</Button>}
          />
        ) : (
          <WorkspaceState
            icon={AlertCircle}
            title="Werkruimte kon niet worden geladen"
            description={query.error?.message || "Controleer de verbinding en probeer het opnieuw."}
            action={<Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button>}
          />
        )
      ) : !data?.available ? (
        <WorkspaceState
          icon={LockKeyhole}
          title="Werkruimte nog niet geactiveerd"
          description={data?.message || `De backend levert nog geen geldige ${config.action}-response. Er wordt bewust geen directe datafallback gebruikt.`}
        />
      ) : workspaceBlocked ? (
        <WorkspaceState
          icon={LockKeyhole}
          title={`${config.title} is uitgeschakeld`}
          description={data?.blocked_reason || data?.settings?.blocked_reason || `De feature flag ${config.featureFlag} is voor deze bedrijfscontext niet actief.`}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <WorkspaceTable
            rows={items}
            columns={columns}
            selectedRow={row}
            onSelectRow={id => changeParams({ row: id })}
            emptyConfig={viewConfig}
            selectable={workspace === "billing" && view === "candidate" ? canSelectCandidate : null}
            selectedIds={selectedCandidateIds}
            onToggleSelection={toggleCandidate}
          />
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.page_size}
            onPageChange={nextPage => changeParams({ page: nextPage, row: null })}
          />
        </div>
      )}

      <RecordPanel
        config={config}
        view={view}
        rowId={data?.available && !workspaceBlocked ? row : ""}
        record={selectedRecord}
        onClose={() => changeParams({ row: null })}
      />
      <CommercialMutationDialog
        kind={commercialDialog || view}
        open={Boolean(commercialDialog)}
        onOpenChange={open => !open && setCommercialDialog(null)}
        onSubmit={form => commercialMutation.mutate({
          kind: commercialDialog || view,
          form,
          context: actionContext,
          idempotencyKey: createCustomerMutationKey(`create_${commercialDialog || view}`),
        })}
        pending={commercialMutation.isPending}
        error={commercialMutation.error}
        context={actionContext}
      />
    </PageTransition>
  );
}

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ContactRound,
  Edit,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import PageHeader from "@/components/ui-custom/PageHeader";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import CustomerWizard from "@/components/customers/CustomerWizard";
import {
  CUSTOMER_STATUS_CLASSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  createCustomerMutationKey,
  formatAddress,
  getCustomerName,
  getCustomerStatus,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

function normalized(value) {
  return String(value || "").toLocaleLowerCase("nl-NL");
}

function objectLabel(object) {
  return `${object.object_code ? `[${object.object_code}] ` : ""}${object.name || "Object"}`;
}

function CustomerObjects({ objects }) {
  if (!objects.length) return <span className="text-xs text-muted-foreground">Geen objecten</span>;
  const visible = objects.slice(0, 2);
  return (
    <div className="flex max-w-[340px] flex-wrap gap-1">
      {visible.map(object => (
        <span
          key={object.id}
          className="max-w-[160px] truncate rounded border border-border bg-muted/35 px-2 py-0.5 text-[11px] font-medium text-foreground"
          title={objectLabel(object)}
        >
          {objectLabel(object)}
        </span>
      ))}
      {objects.length > visible.length && (
        <span className="rounded border border-border bg-muted/35 px-2 py-0.5 text-[11px] text-muted-foreground">
          +{objects.length - visible.length}
        </span>
      )}
    </div>
  );
}

function CustomerStatus({ customer }) {
  const status = getCustomerStatus(customer);
  return (
    <Badge variant="outline" className={`text-[11px] ${CUSTOMER_STATUS_CLASSES[status] || ""}`}>
      {CUSTOMER_STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function customerDetailHref(customerId, { edit = false } = {}) {
  const params = new URLSearchParams({
    id: String(customerId),
    tab: "overview",
  });
  if (edit) params.set("edit", "1");
  return `/CustomerDetail?${params.toString()}`;
}

export function CustomerRow({ customer, objects, onOpen }) {
  const contact = [customer.contact_person, customer.email, customer.phone].filter(Boolean);
  const detailHref = customerDetailHref(customer.id);
  const editHref = customerDetailHref(customer.id, { edit: true });
  return (
    <TableRow
      tabIndex={0}
      role="link"
      aria-label={`${getCustomerName(customer)} openen`}
      data-customer-id={customer.id}
      className="cursor-pointer hover:bg-muted/30"
      onClick={event => {
        if (event.defaultPrevented || event.target.closest("a, button, input, select, textarea")) return;
        onOpen(customer);
      }}
      onKeyDown={event => {
        if (
          event.currentTarget === event.target
          && (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onOpen(customer);
        }
      }}
    >
      <TableCell className="min-w-[230px]">
        <Link
          to={detailHref}
          className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={event => event.stopPropagation()}
        >
          <p className="font-medium text-foreground">{getCustomerName(customer)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{customer.customer_number || customer.kvk_number || "Nog geen klantnummer"}</p>
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="text-[11px]">{CUSTOMER_TYPE_LABELS[customer.customer_type] || customer.customer_type || "Klant"}</Badge>
          <CustomerStatus customer={customer} />
        </div>
      </TableCell>
      <TableCell className="min-w-[220px]">
        {contact.length ? (
          <div className="space-y-0.5">
            {contact.map(value => <p key={value} className="max-w-[250px] truncate text-xs text-muted-foreground">{value}</p>)}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><ContactRound className="h-3.5 w-3.5" /> Contact ontbreekt</span>
        )}
      </TableCell>
      <TableCell className="min-w-[250px]">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">{objects.length} object{objects.length === 1 ? "" : "en"}</p>
          <CustomerObjects objects={objects} />
        </div>
      </TableCell>
      <TableCell className="max-w-[250px] truncate text-xs text-muted-foreground" title={customer.address || ""}>
        {customer.address || "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={`${getCustomerName(customer)} wijzigen`}
          >
            <Link to={editHref} onClick={event => event.stopPropagation()}>
              <Edit className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={`${getCustomerName(customer)} openen`}
          >
            <Link to={detailHref} onClick={event => event.stopPropagation()}>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [objectFilter, setObjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("current");

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    retry: 1,
  });
  const objectsQuery = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
    retry: 1,
  });
  const customers = customersQuery.data || [];
  const objects = objectsQuery.data || [];

  const objectsByCustomer = useMemo(() => objects.reduce((grouped, object) => {
    if (!object.customer_id) return grouped;
    grouped[object.customer_id] = grouped[object.customer_id] || [];
    grouped[object.customer_id].push(object);
    return grouped;
  }, {}), [objects]);

  const filteredCustomers = useMemo(() => {
    const query = normalized(searchTerm).trim();
    return customers.filter(customer => {
      const customerObjects = objectsByCustomer[customer.id] || [];
      const status = getCustomerStatus(customer);
      if (typeFilter !== "all" && customer.customer_type !== typeFilter) return false;
      if (objectFilter === "with" && customerObjects.length === 0) return false;
      if (objectFilter === "without" && customerObjects.length > 0) return false;
      if (statusFilter === "current" && status === "archived") return false;
      if (statusFilter === "archived" && status !== "archived") return false;
      if (statusFilter === "attention" && !["concept", "on_hold", "inactive"].includes(status)) return false;
      if (!query) return true;
      const searchable = [
        customer.name,
        customer.trade_name,
        customer.legal_name,
        customer.customer_number,
        customer.contact_person,
        customer.email,
        customer.phone,
        customer.address,
        customer.kvk_number,
        customer.vat_number,
        customer.notes,
        ...customerObjects.flatMap(object => [object.name, object.object_code, object.external_object_code, object.address]),
      ].map(normalized).join(" ");
      return searchable.includes(query);
    });
  }, [customers, objectFilter, objectsByCustomer, searchTerm, statusFilter, typeFilter]);

  const createMutation = useMutation({
    mutationFn: async ({ setup, idempotencyKey }) => {
      const primaryContact = setup.contact
        ? {
            ...Object.fromEntries(Object.entries(setup.contact).filter(([key]) => !["email", "phone", "roles", "version"].includes(key))),
            contact_points: [
              setup.contact.email && {
                point_type: "email",
                label: "Zakelijk",
                value: setup.contact.email,
                is_primary: true,
                purposes: setup.contact.roles || ["primary"],
                status: "active",
              },
              setup.contact.phone && {
                point_type: "phone",
                label: "Zakelijk",
                value: setup.contact.phone,
                is_primary: true,
                purposes: setup.contact.roles || ["primary"],
                status: "active",
              },
            ].filter(Boolean),
            roles: [...new Set(setup.contact.roles || ["primary"])],
          }
        : null;
      const result = await invokeCustomerPlatformMutation({
        action: "create_customer",
        idempotency_key: idempotencyKey,
        expected_version: 0,
        customer: setup.customer,
        customer_account: setup.account,
        company_id: setup.account.company_id,
        addresses: (setup.addresses || []).map(address => ({
          ...address,
          country_code: address.country_name === "Nederland" ? "NL" : null,
          formatted_address: formatAddress(address),
          status: "active",
        })),
        primary_contact: primaryContact,
      });
      const setupIncomplete = result.setup_incomplete || {};
      const warnings = [
        setupIncomplete.requested_addresses_missing && "Niet alle adressen konden worden hersteld.",
        setupIncomplete.requested_primary_contact_missing && "De primaire contactpersoon ontbreekt.",
      ].filter(Boolean);
      return { customer: result.customer, warnings };
    },
    onSuccess: async ({ customer, warnings }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-dossier", customer.id] }),
      ]);
      if (warnings.length) {
        toast({
          title: "Klant aangemaakt met aandachtspunten",
          description: "Open het dossier om de ontbrekende onderdelen aan te vullen.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Klant aangemaakt", description: "Het nieuwe klantdossier staat klaar." });
      }
      setShowWizard(false);
      navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=overview&new=1${warnings.length ? "&setup=partial" : ""}`);
    },
  });

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setObjectFilter("all");
    setStatusFilter("current");
  };
  const hasFilters = Boolean(searchTerm || typeFilter !== "all" || objectFilter !== "all" || statusFilter !== "current");

  if (showWizard) {
    return (
      <PageTransition>
        <Button variant="ghost" size="sm" onClick={() => setShowWizard(false)} className="mb-4 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Terug naar klanten
        </Button>
        <CustomerWizard
          onSave={setup => createMutation.mutate({
            setup,
            idempotencyKey: createCustomerMutationKey("create_customer"),
          })}
          onCancel={() => setShowWizard(false)}
          saving={createMutation.isPending}
          error={createMutation.error}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageHeader
        title="Klanten"
        subtitle="Juridische en commerciële relaties met hun objecten, contacten en dossiers"
        actions={<Button onClick={() => setShowWizard(true)}><Plus className="h-4 w-4" /> Nieuwe klant</Button>}
      />

      <div className="mb-4 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_170px_170px_auto] xl:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Zoek op klant, contact, KvK, adres of object..."
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle klanttypes</SelectItem>
              <SelectItem value="bedrijf">Bedrijven</SelectItem>
              <SelectItem value="particulier">Particulieren</SelectItem>
            </SelectContent>
          </Select>
          <Select value={objectFilter} onValueChange={setObjectFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle objectkoppelingen</SelectItem>
              <SelectItem value="with">Met objecten</SelectItem>
              <SelectItem value="without">Zonder objecten</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Actueel</SelectItem>
              <SelectItem value="attention">Aandacht nodig</SelectItem>
              <SelectItem value="archived">Archief</SelectItem>
              <SelectItem value="all">Alle statussen</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end gap-2">
            <span className="whitespace-nowrap rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{filteredCustomers.length}</strong> van {customers.length}
            </span>
            {hasFilters && <Button variant="outline" size="sm" onClick={resetFilters}>Reset</Button>}
          </div>
        </div>
      </div>

      {customersQuery.isLoading || objectsQuery.isLoading ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          {[1, 2, 3, 4].map(value => <div key={value} className="h-12 animate-pulse rounded-md bg-muted/30" />)}
        </div>
      ) : customersQuery.isError || objectsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-5">
          <p className="text-sm font-medium text-destructive">De klantenlijst kon niet volledig worden geladen.</p>
          <p className="mt-1 text-xs text-muted-foreground">{customersQuery.error?.message || objectsQuery.error?.message}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={() => {
            customersQuery.refetch();
            objectsQuery.refetch();
          }}><RefreshCw className="h-4 w-4" /> Opnieuw</Button>
        </div>
      ) : customers.length ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Klant</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Type & status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Contact</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Objecten</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Adres</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-muted-foreground">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map(customer => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    objects={objectsByCustomer[customer.id] || []}
                    onOpen={item => navigate(`/CustomerDetail?id=${encodeURIComponent(item.id)}&tab=overview`)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredCustomers.length === 0 && (
            <div className="border-t border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Geen klanten gevonden</p>
              <p className="mt-1 text-xs text-muted-foreground">Pas de zoekopdracht of filters aan.</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={resetFilters}>Filters wissen</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30">
            <ContactRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Nog geen klanten</p>
          <p className="mt-1 text-xs text-muted-foreground">Voeg de eerste juridische klantrelatie toe om een dossier op te bouwen.</p>
          <Button className="mt-4" size="sm" onClick={() => setShowWizard(true)}><Plus className="h-4 w-4" /> Klant toevoegen</Button>
        </div>
      )}
    </PageTransition>
  );
}

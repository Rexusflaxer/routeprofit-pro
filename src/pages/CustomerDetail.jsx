import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ContactRound,
  Edit,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import CustomerDossierTabs from "@/components/customers/CustomerDossierTabs";
import {
  CustomerArchiveDialog,
  CustomerBasisDialog,
  CustomerRecordDialog,
} from "@/components/customers/CustomerRecordDialogs";
import { createCustomerContactRecords } from "@/components/customers/customerContactWorkflow";
import { createCustomerObject } from "@/components/customers/customerObjectWorkflow";
import {
  CUSTOMER_STATUS_CLASSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TABS,
  CUSTOMER_TYPE_LABELS,
  contactPointValue,
  createCustomerMutationKey,
  filterEntity,
  formatAddress,
  getCompanyName,
  getContactName,
  getCustomerName,
  getCustomerStatus,
  initials,
  invokeCustomerPlatformMutation,
  listEntity,
} from "@/components/customers/customerDossierUtils";

function useCustomerRecords(entityName, customerId, sort = "-created_date") {
  return useQuery({
    queryKey: ["customer-dossier", customerId, entityName, sort],
    queryFn: () => filterEntity(entityName, { customer_id: customerId }, sort),
    enabled: Boolean(customerId),
    retry: 1,
  });
}

function InlineMeta({ icon: Icon, children, href }) {
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
        {content}
      </a>
    );
  }
  return <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{content}</div>;
}

function CustomerProfileHeader({
  customer,
  accounts,
  contacts,
  contactPoints,
  addresses,
  companies,
  personnel,
  onEdit,
  onAddContact,
}) {
  const status = getCustomerStatus(customer);
  const primaryAccount = accounts.find(item => item.id === customer.primary_customer_account_id)
    || accounts.find(item => item.is_primary)
    || accounts[0];
  const company = companies.find(item => item.id === primaryAccount?.company_id);
  const accountManager = personnel.find(item => item.id === (primaryAccount?.account_manager_id || primaryAccount?.account_manager_personnel_id));
  const primaryContact = contacts.find(item => item.id === customer.primary_contact_id)
    || contacts.find(item => item.is_primary)
    || contacts[0];
  const email = primaryContact
    ? contactPointValue(contactPoints, primaryContact.id, "email") || primaryContact.email
    : customer.email;
  const phone = primaryContact
    ? contactPointValue(contactPoints, primaryContact.id, "phone")
      || contactPointValue(contactPoints, primaryContact.id, "mobile")
      || primaryContact.phone
    : customer.phone;
  const primaryAddress = addresses.find(item => item.is_primary && ["visiting", "registered"].includes(item.address_type))
    || addresses.find(item => ["visiting", "registered"].includes(item.address_type))
    || addresses[0];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {status === "archived" && (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Deze klant is gearchiveerd. Historie blijft beschikbaar, maar gebruik in nieuwe operationele en commerciële processen is geblokkeerd.</p>
        </div>
      )}
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-base font-bold tracking-wide text-foreground">
            {initials(getCustomerName(customer))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-foreground">{getCustomerName(customer)}</h1>
              <Badge variant="outline" className="text-[11px]">{CUSTOMER_TYPE_LABELS[customer.customer_type] || customer.customer_type || "Klant"}</Badge>
              <Badge variant="outline" className={`text-[11px] ${CUSTOMER_STATUS_CLASSES[status] || ""}`}>
                {CUSTOMER_STATUS_LABELS[status] || status}
              </Badge>
            </div>
            {customer.legal_name && customer.legal_name !== getCustomerName(customer) && (
              <p className="mt-1 truncate text-xs text-muted-foreground">Juridische naam: {customer.legal_name}</p>
            )}
            <div className="mt-3 grid max-w-4xl gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              <InlineMeta icon={Building2}>{getCompanyName(company)}</InlineMeta>
              <InlineMeta icon={ContactRound}>{primaryContact ? getContactName(primaryContact) : customer.contact_person || "Geen hoofdcontact"}</InlineMeta>
              <InlineMeta icon={Mail} href={email ? `mailto:${email}` : undefined}>{email || "Geen e-mailadres"}</InlineMeta>
              <InlineMeta icon={Phone} href={phone ? `tel:${phone}` : undefined}>{phone || "Geen telefoonnummer"}</InlineMeta>
              <InlineMeta icon={MapPin}>{primaryAddress ? formatAddress(primaryAddress) : customer.address || "Geen bezoekadres"}</InlineMeta>
              <InlineMeta icon={ContactRound}>
                {accountManager?.name || [accountManager?.first_name, accountManager?.last_name].filter(Boolean).join(" ") || "Geen accountmanager"}
              </InlineMeta>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {!primaryContact && (
            <Button size="sm" onClick={onAddContact}><Plus className="h-4 w-4" /> Hoofdcontact</Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}><Edit className="h-4 w-4" /> Wijzigen</Button>
        </div>
      </div>
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Klantnummer", customer.customer_number || "Niet toegekend"],
          ["Debiteurnummer", primaryAccount?.debtor_number || "Niet toegekend"],
          ["KvK-nummer", customer.kvk_number || "Niet vastgelegd"],
          ["Taal", ({ nl: "Nederlands", en: "Engels", de: "Duits", fr: "Frans" })[customer.preferred_language || customer.language] || "Nederlands"],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewCustomerBanner({ customer, onDismiss, onOpenTab }) {
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{getCustomerName(customer)} is aangemaakt</p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">Het dossier staat als concept klaar. Vul de ontbrekende contact-, object- en contractgegevens aan wanneer deze beschikbaar zijn.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onOpenTab("contacts")}>Contacten</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenTab("objects")}>Objecten</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>Melding sluiten</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
        <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/20" />
        <div className="h-[520px] animate-pulse rounded-xl border border-border bg-muted/20" />
      </div>
    </PageTransition>
  );
}

function PageError({ title, description, onRetry, onBack }) {
  return (
    <PageTransition>
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Klanten</Button>
          {onRetry && <Button onClick={onRetry}><RefreshCw className="h-4 w-4" /> Opnieuw</Button>}
        </div>
      </div>
    </PageTransition>
  );
}

export default function CustomerDetail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const customerId = searchParams.get("id");
  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = CUSTOMER_TABS.some(tab => tab.key === requestedTab) ? requestedTab : "overview";
  const selectedRow = searchParams.get("row");
  const isNewFlow = searchParams.get("new") === "1";
  const [basisOpen, setBasisOpen] = useState(false);
  const [recordDialog, setRecordDialog] = useState(null);
  const [contactWizardOpen, setContactWizardOpen] = useState(false);
  const [objectWizardOpen, setObjectWizardOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const initializedEdit = useRef(false);
  const contactMutationKeyRef = useRef(null);
  const objectMutationKeyRef = useRef(null);
  const activeContactObjectId = searchParams.get("contact_object") || "all";
  const objectSearchTerm = searchParams.get("object_query") || "";
  const objectStatusFilter = searchParams.get("object_status") || "all";

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    retry: 1,
  });
  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => listEntity("Company", "display_name"),
    retry: 1,
  });
  const personnelQuery = useQuery({
    queryKey: ["personnel"],
    queryFn: () => listEntity("Personnel", "name"),
    retry: 1,
  });
  const accountsQuery = useCustomerRecords("CustomerAccount", customerId);
  const addressesQuery = useCustomerRecords("CustomerAddress", customerId);
  const contactsQuery = useCustomerRecords("CustomerContact", customerId);
  const contactPointsQuery = useCustomerRecords("CustomerContactPoint", customerId);
  const contactRolesQuery = useCustomerRecords("CustomerContactRole", customerId);

  const customer = useMemo(
    () => (customersQuery.data || []).find(item => item.id === customerId),
    [customerId, customersQuery.data],
  );
  const core = {
    accounts: accountsQuery.data || [],
    addresses: addressesQuery.data || [],
    contacts: contactsQuery.data || [],
    contactPoints: contactPointsQuery.data || [],
    contactRoles: contactRolesQuery.data || [],
  };
  const companies = companiesQuery.data || [];
  const personnel = personnelQuery.data || [];
  const coreQueries = [
    accountsQuery,
    addressesQuery,
    contactsQuery,
    contactPointsQuery,
    contactRolesQuery,
    companiesQuery,
    personnelQuery,
  ];

  useEffect(() => {
    if (!customer || initializedEdit.current || searchParams.get("edit") !== "1") return;
    setBasisOpen(true);
    initializedEdit.current = true;
  }, [customer, searchParams]);

  const invalidateCustomer = async (extraKeys = []) => {
    const keys = [
      ["customers"],
      ["customer-dossier", customerId],
      ...extraKeys.map(key => Array.isArray(key) ? key : [key]),
    ];
    await Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })));
  };

  const basisMutation = useMutation({
    mutationFn: async ({ payload, idempotencyKey }) => {
      const displayName = payload.name?.trim();
      const identityResult = await invokeCustomerPlatformMutation({
        action: "update_customer",
        idempotency_key: `${idempotencyKey}:identity`,
        expected_version: Number(customer?.version || 1),
        customer_id: customerId,
        data: {
          customer_type: payload.customer_type,
          legal_name: payload.legal_name || displayName,
          trade_name: payload.trade_name || displayName,
          kvk_number: payload.kvk_number,
          vat_number: payload.vat_number,
          preferred_language: payload.language || "nl",
        },
      });
      if (payload.status && payload.status !== customer.status) {
        return invokeCustomerPlatformMutation({
          action: "set_customer_status",
          idempotency_key: `${idempotencyKey}:status`,
          expected_version: Number(identityResult.customer?.version || customer.version || 1),
          customer_id: customerId,
          status: payload.status,
          reason: payload.status === "archived" ? "Gewijzigd vanuit klantdossier" : null,
        });
      }
      return identityResult;
    },
    onSuccess: async () => {
      await invalidateCustomer();
      setBasisOpen(false);
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
      toast({ title: "Klantgegevens opgeslagen" });
    },
  });

  const recordMutation = useMutation({
    mutationFn: async ({ type, form, idempotencyKey }) => {
      if (type === "account") {
        return invokeCustomerPlatformMutation({
          action: "create_customer_account",
          idempotency_key: idempotencyKey,
          expected_version: 0,
          customer_id: customerId,
          data: {
            company_id: form.company_id,
            debtor_number: form.debtor_number?.trim() || null,
            status: form.status || "active",
            is_primary: Boolean(form.is_primary || core.accounts.length === 0),
            account_manager_id: form.account_manager_personnel_id || null,
            currency: "EUR",
            payment_term_days: Number(form.payment_term_days || 30),
            invoice_delivery_method: form.invoice_delivery_method || "email",
            finance_hold: Boolean(form.finance_hold),
          },
        });
      }

      if (type === "contact") {
        return createCustomerContactRecords({
          invoke: invokeCustomerPlatformMutation,
          customerId,
          customer,
          existingContacts: core.contacts,
          form,
          idempotencyKey,
        });
      }

      if (type === "address") {
        return invokeCustomerPlatformMutation({
          action: "create_customer_address",
          idempotency_key: idempotencyKey,
          expected_version: 0,
          customer_id: customerId,
          data: {
            customer_account_id: form.customer_account_id || null,
            address_type: form.address_type || "visiting",
            label: form.label?.trim() || null,
            street_name: form.street_name?.trim() || null,
            house_number: form.house_number?.trim() || null,
            house_number_addition: form.house_number_addition?.trim() || null,
            postal_code: form.postal_code?.trim().toUpperCase() || null,
            city: form.city?.trim() || null,
            country_code: form.country === "Nederland" ? "NL" : null,
            country_name: form.country?.trim() || "Nederland",
            formatted_address: formatAddress({
              street_name: form.street_name,
              house_number: form.house_number,
              house_number_addition: form.house_number_addition,
              postal_code: form.postal_code,
              city: form.city,
              country_name: form.country,
            }),
            is_primary: Boolean(form.is_primary || core.addresses.length === 0),
            status: "active",
          },
        });
      }

      const primaryAccount = core.accounts.find(item => item.is_primary) || core.accounts[0];
      return invokeCustomerPlatformMutation({
        action: "create_customer_request",
        idempotency_key: idempotencyKey,
        expected_version: 0,
        customer_id: customerId,
        data: {
          customer_account_id: primaryAccount?.id || null,
          request_type: form.request_type || "new_service",
          title: form.title?.trim(),
          description: form.description?.trim(),
          status: "draft",
          priority: form.priority || "normal",
          requested_for: form.requested_for_date ? new Date(`${form.requested_for_date}T12:00:00`).toISOString() : null,
          source: "backoffice",
        },
      });
    },
    onSuccess: async (_result, variables) => {
      await invalidateCustomer();
      if (variables.type === "contact") {
        setContactWizardOpen(false);
        contactMutationKeyRef.current = null;
        const next = new URLSearchParams(searchParams);
        next.delete("contact_object");
        next.delete("row");
        next.delete("view");
        setSearchParams(next);
      } else {
        setRecordDialog(null);
      }
      const labels = {
        account: "Bedrijfsrelatie toegevoegd",
        contact: "Contactpersoon toegevoegd",
        address: "Adres toegevoegd",
        request: "Aanvraag vastgelegd",
      };
      toast({ title: labels[variables.type] || "Dossier bijgewerkt" });
    },
  });

  const objectMutation = useMutation({
    mutationFn: ({ form, idempotencyKey }) => createCustomerObject({
      customerId,
      form,
      idempotencyKey,
      invoke: invokeCustomerPlatformMutation,
    }),
    onSuccess: async () => {
      await invalidateCustomer([["objects"]]);
      setObjectWizardOpen(false);
      objectMutationKeyRef.current = null;
      const next = new URLSearchParams(searchParams);
      next.delete("object_query");
      next.delete("object_status");
      next.delete("row");
      next.delete("view");
      setSearchParams(next);
      toast({
        title: "Object toegevoegd",
        description: "Het concept staat in de tabel. De verdere inrichting gebeurt op de objectpagina.",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ restore = false, idempotencyKey }) => {
      await invokeCustomerPlatformMutation({
        action: "set_customer_status",
        idempotency_key: idempotencyKey,
        expected_version: Number(customer?.version || 1),
        customer_id: customerId,
        status: restore ? "inactive" : "archived",
        reason: restore ? null : "Handmatig gearchiveerd vanuit klantdossier",
      });
      return restore;
    },
    onSuccess: async restored => {
      await invalidateCustomer();
      setArchiveOpen(false);
      setRestoreOpen(false);
      toast({ title: restored ? "Klant hersteld" : "Klant gearchiveerd" });
    },
  });

  const setTab = tab => {
    const next = new URLSearchParams(searchParams);
    next.set("id", customerId);
    next.set("tab", tab);
    next.delete("row");
    next.delete("view");
    if (tab !== "contacts") {
      next.delete("contact_object");
      setContactWizardOpen(false);
      contactMutationKeyRef.current = null;
    }
    if (tab !== "objects") {
      next.delete("object_query");
      next.delete("object_status");
      setObjectWizardOpen(false);
      objectMutationKeyRef.current = null;
    }
    setSearchParams(next);
  };

  const setContactObject = objectId => {
    const next = new URLSearchParams(searchParams);
    if (objectId && objectId !== "all") next.set("contact_object", objectId);
    else next.delete("contact_object");
    next.delete("row");
    next.delete("view");
    setSearchParams(next);
  };

  const setObjectSearch = value => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("object_query", value);
    else next.delete("object_query");
    next.delete("row");
    next.delete("view");
    setSearchParams(next, { replace: true });
  };

  const setObjectStatus = status => {
    const next = new URLSearchParams(searchParams);
    if (status && status !== "all") next.set("object_status", status);
    else next.delete("object_status");
    next.delete("row");
    next.delete("view");
    setSearchParams(next);
  };

  const openContactWizard = () => {
    recordMutation.reset();
    if (!contactMutationKeyRef.current) {
      contactMutationKeyRef.current = createCustomerMutationKey("create_customer_contact");
    }
    setContactWizardOpen(true);
    setTab("contacts");
  };

  const closeContactWizard = () => {
    if (recordMutation.isPending) return;
    setContactWizardOpen(false);
    contactMutationKeyRef.current = null;
    recordMutation.reset();
  };

  const openObjectWizard = () => {
    objectMutation.reset();
    if (!objectMutationKeyRef.current) {
      objectMutationKeyRef.current = createCustomerMutationKey("create_customer_object");
    }
    setObjectWizardOpen(true);
    setTab("objects");
  };

  const closeObjectWizard = () => {
    if (objectMutation.isPending) return;
    setObjectWizardOpen(false);
    objectMutationKeyRef.current = null;
    objectMutation.reset();
  };

  const setSelectedRow = row => {
    const next = new URLSearchParams(searchParams);
    if (row) {
      next.set("row", row);
      next.set("view", "detail");
    } else {
      next.delete("row");
      next.delete("view");
    }
    setSearchParams(next);
  };

  const dismissNew = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  };

  const openRequestDialog = () => {
    if (!core.accounts.length) {
      setTab("manage");
      toast({
        title: "Bedrijfsrelatie nodig",
        description: "Voeg eerst de verkopende BV en debiteurcontext toe voordat je een aanvraag vastlegt.",
      });
      return;
    }
    setRecordDialog("request");
  };

  if (!customerId) {
    return <PageError title="Geen klant geselecteerd" description="Open een klant vanuit de klantenlijst om het dossier te bekijken." onBack={() => navigate("/Customers")} />;
  }
  if (customersQuery.isLoading) return <PageLoading />;
  if (customersQuery.isError) {
    return <PageError title="Klantdossier niet beschikbaar" description={customersQuery.error?.message || "De klant kon niet worden geladen."} onRetry={() => customersQuery.refetch()} onBack={() => navigate("/Customers")} />;
  }
  if (!customer) {
    return <PageError title="Klant niet gevonden" description="Deze klant bestaat niet meer of je hebt geen toegang tot dit dossier." onBack={() => navigate("/Customers")} />;
  }

  return (
    <PageTransition>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => navigate("/Customers")}>
          <ArrowLeft className="h-4 w-4" /> Klanten
        </Button>
        <span className="text-muted-foreground/40">/</span>
        <span className="max-w-[280px] truncate text-sm font-medium text-foreground">{getCustomerName(customer)}</span>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => navigate(`/Objects?customer=${encodeURIComponent(customerId)}`)}>
          Objecten <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isNewFlow && <NewCustomerBanner customer={customer} onDismiss={dismissNew} onOpenTab={setTab} />}

      <CustomerProfileHeader
        customer={customer}
        accounts={core.accounts}
        contacts={core.contacts}
        contactPoints={core.contactPoints}
        addresses={core.addresses}
        companies={companies}
        personnel={personnel}
        onEdit={() => setBasisOpen(true)}
        onAddContact={openContactWizard}
      />

      <CustomerDossierTabs
        customer={customer}
        customerId={customerId}
        activeTab={activeTab}
        onTabChange={setTab}
        selectedRow={selectedRow}
        onSelectRow={setSelectedRow}
        navigate={navigate}
        core={core}
        companies={companies}
        personnel={personnel}
        coreQueries={coreQueries}
        onAddContact={openContactWizard}
        contactWizardOpen={contactWizardOpen}
        onCloseContactWizard={closeContactWizard}
        onSaveContact={form => {
          if (!contactMutationKeyRef.current) {
            contactMutationKeyRef.current = createCustomerMutationKey("create_customer_contact");
          }
          recordMutation.mutate({
            type: "contact",
            form,
            idempotencyKey: contactMutationKeyRef.current,
          });
        }}
        contactSaving={recordMutation.isPending}
        contactError={recordMutation.error}
        activeContactObjectId={activeContactObjectId}
        onContactObjectChange={setContactObject}
        onAddObject={openObjectWizard}
        objectWizardOpen={objectWizardOpen}
        onCloseObjectWizard={closeObjectWizard}
        onSaveObject={form => {
          if (!objectMutationKeyRef.current) {
            objectMutationKeyRef.current = createCustomerMutationKey("create_customer_object");
          }
          objectMutation.mutate({
            form,
            idempotencyKey: objectMutationKeyRef.current,
          });
        }}
        objectSaving={objectMutation.isPending}
        objectError={objectMutation.error}
        objectSearchTerm={objectSearchTerm}
        onObjectSearchChange={setObjectSearch}
        objectStatusFilter={objectStatusFilter}
        onObjectStatusChange={setObjectStatus}
        onAddAccount={() => setRecordDialog("account")}
        onAddRequest={openRequestDialog}
        onEditCustomer={() => setBasisOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        onRestore={() => setRestoreOpen(true)}
        archivePending={archiveMutation.isPending}
      />

      <CustomerBasisDialog
        customer={customer}
        open={basisOpen}
        onOpenChange={open => {
          setBasisOpen(open);
          if (!open && searchParams.get("edit") === "1") {
            const next = new URLSearchParams(searchParams);
            next.delete("edit");
            setSearchParams(next, { replace: true });
          }
        }}
        onSave={payload => basisMutation.mutate({
          payload,
          idempotencyKey: createCustomerMutationKey("update_customer"),
        })}
        saving={basisMutation.isPending}
        error={basisMutation.error}
      />
      <CustomerRecordDialog
        type={recordDialog}
        open={Boolean(recordDialog)}
        onOpenChange={open => !open && setRecordDialog(null)}
        onSave={(type, form) => recordMutation.mutate({
          type,
          form,
          idempotencyKey: createCustomerMutationKey(`create_customer_${type}`),
        })}
        saving={recordMutation.isPending}
        error={recordMutation.error}
        companies={companies}
        personnel={personnel}
        accounts={core.accounts}
      />
      <CustomerArchiveDialog
        customer={customer}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={() => archiveMutation.mutate({
          restore: false,
          idempotencyKey: createCustomerMutationKey("archive_customer"),
        })}
        pending={archiveMutation.isPending}
      />
      <CustomerArchiveDialog
        customer={customer}
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        onConfirm={() => archiveMutation.mutate({
          restore: true,
          idempotencyKey: createCustomerMutationKey("restore_customer"),
        })}
        pending={archiveMutation.isPending}
        restoring
      />
    </PageTransition>
  );
}

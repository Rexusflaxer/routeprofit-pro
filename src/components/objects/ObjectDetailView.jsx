import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Building2, RefreshCw } from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import ObjectDossierTabs from "./ObjectDossierTabs";
import ObjectProfileHeader from "./ObjectProfileHeader";
import {
  ObjectIdentityDialog,
  ObjectOperationsDialog,
  ObjectStatusDialog,
} from "./ObjectRecordDialogs";
import {
  OBJECT_DOSSIER_TABS,
  buildObjectReadiness,
} from "./objectDossierConfig";
import {
  setCustomerObjectStatus,
  updateCustomerObjectIdentity,
  updateCustomerObjectOperations,
} from "./objectWorkflow";

const CORE_QUERY_LIMIT = 5000;
const CUSTOMER_FIELDS = ["id", "trade_name", "name", "legal_name", "status"];
const COLLECTIVE_FIELDS = ["id", "name", "object_ids", "parent_collectief_id"];
const TASK_FIELDS = ["id", "object_id", "collectief_id", "selected_object_ids", "task_type", "time_window_start", "time_window_end", "duration_minutes", "repeat_count"];
const CONTACT_FIELDS = ["id", "customer_id", "display_name", "first_name", "middle_name", "last_name", "job_title", "department", "status", "created_date", "updated_date"];
const CONTACT_ROLE_FIELDS = ["id", "customer_id", "contact_id", "role", "object_ids", "status", "valid_from", "valid_until", "created_date", "updated_date"];
const CONTRACT_LINE_FIELDS = ["id", "contract_id", "customer_id", "name", "service_code", "scope_type", "object_id", "collective_id", "billing_model", "status", "valid_from", "valid_until"];
const RESTRICTED_OBJECT_FIELDS = new Set(["access_instruction", "alarm_instruction", "key_instruction"]);

async function projectedFilter(entityName, filter, sort, fields, limit = CORE_QUERY_LIMIT) {
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

function contactMatchesCurrentObject(roles, contactId, objectId, today) {
  const contactRoles = roles.filter(role => role.contact_id === contactId);
  if (!contactRoles.length) return true;
  return contactRoles.some(role => (
    recordIsCurrent(role, today)
    && (!(role.object_ids || []).length || role.object_ids.includes(objectId))
  ));
}

function sanitizeObjectRecord(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([key]) => !RESTRICTED_OBJECT_FIELDS.has(key)),
  );
}

function customerName(customer) {
  return customer?.trade_name || customer?.name || customer?.legal_name || "Klant";
}

function CoreLoading() {
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted/40" />
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/20" />
        <div className="h-[560px] animate-pulse rounded-xl border border-border bg-muted/20" />
      </div>
    </PageTransition>
  );
}

function CoreError({ message, onRetry, onBack }) {
  return (
    <PageTransition>
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
        <h1 className="mt-4 text-lg font-semibold">Objectdossier niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Objecten</Button>
          <Button onClick={onRetry}><RefreshCw className="h-4 w-4" /> Opnieuw</Button>
        </div>
      </div>
    </PageTransition>
  );
}

export default function ObjectDetailView({ object, onBack }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [identityOpen, setIdentityOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = OBJECT_DOSSIER_TABS.some(tab => tab.key === requestedTab) ? requestedTab : "overview";
  const selectedRow = searchParams.get("row");
  const view = searchParams.get("view") || "tasks";
  const searchTerm = searchParams.get("query") || "";
  const dossierObject = useMemo(() => sanitizeObjectRecord(object), [object]);

  useEffect(() => {
    if (requestedTab === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set("id", object.id);
    next.set("tab", "overview");
    next.delete("row");
    next.delete("view");
    next.delete("query");
    setSearchParams(next, { replace: true });
  }, [activeTab, object.id, requestedTab, searchParams, setSearchParams]);

  const customerQuery = useQuery({
    queryKey: ["object-dossier", object.id, "customer", object.customer_id],
    queryFn: async () => {
      if (!object.customer_id) return null;
      const matches = await projectedFilter("Customer", { id: object.customer_id }, "-updated_date", CUSTOMER_FIELDS, 1);
      return matches[0] || null;
    },
    enabled: Boolean(object.customer_id),
    retry: 1,
  });
  const collectivesQuery = useQuery({
    queryKey: ["object-dossier", object.id, "collectives"],
    queryFn: () => projectedFilter("Collectief", { object_ids: { $all: [object.id] } }, "name", COLLECTIVE_FIELDS),
    retry: 1,
  });
  const tasksQuery = useQuery({
    queryKey: ["object-dossier", object.id, "tasks"],
    queryFn: async () => {
      const [direct, collective] = await Promise.all([
        projectedFilter("Task", { object_id: object.id }, "task_type", TASK_FIELDS),
        projectedFilter("Task", { selected_object_ids: { $all: [object.id] } }, "task_type", TASK_FIELDS),
      ]);
      return [...new Map([...direct, ...collective].map(task => [task.id, task])).values()];
    },
    retry: 1,
  });
  const contactsQuery = useQuery({
    queryKey: ["object-dossier", object.id, "contacts", object.customer_id],
    queryFn: () => projectedFilter("CustomerContact", { customer_id: object.customer_id }, "display_name", CONTACT_FIELDS),
    enabled: Boolean(object.customer_id),
    retry: 1,
  });
  const contactRolesQuery = useQuery({
    queryKey: ["object-dossier", object.id, "contact-roles", object.customer_id],
    queryFn: () => projectedFilter("CustomerContactRole", { customer_id: object.customer_id }, "-updated_date", CONTACT_ROLE_FIELDS),
    enabled: Boolean(object.customer_id),
    retry: 1,
  });
  const contractLinesQuery = useQuery({
    queryKey: ["object-dossier", object.id, "contract-lines", object.customer_id],
    queryFn: () => projectedFilter("CustomerContractLine", { customer_id: object.customer_id }, "name", CONTRACT_LINE_FIELDS),
    enabled: Boolean(object.customer_id),
    retry: 1,
  });

  const collectives = useMemo(
    () => (collectivesQuery.data || []).filter(item => (item.object_ids || []).includes(object.id)),
    [collectivesQuery.data, object.id],
  );
  const tasks = useMemo(() => {
    const collectiveIds = new Set(collectives.map(item => item.id));
    return (tasksQuery.data || []).filter(task => (
      task.object_id === object.id
      || (task.collectief_id && collectiveIds.has(task.collectief_id) && (task.selected_object_ids || []).includes(object.id))
    )).map(task => ({
      ...task,
      _object_scope: task.object_id === object.id
        ? "Object"
        : collectives.find(item => item.id === task.collectief_id)?.name || "Collectief",
    }));
  }, [collectives, object.id, tasksQuery.data]);
  const today = currentDateKey();
  const contactRoles = useMemo(
    () => (contactRolesQuery.data || []).filter(role => recordIsCurrent(role, today)),
    [contactRolesQuery.data, today],
  );
  const scopedContacts = useMemo(
    () => (contactsQuery.data || []).filter(contact => (
      recordIsCurrent(contact, today)
      && contactMatchesCurrentObject(contactRolesQuery.data || [], contact.id, object.id, today)
    )),
    [contactRolesQuery.data, contactsQuery.data, object.id, today],
  );
  const contractLines = useMemo(() => {
    const collectiveIds = new Set(collectives.map(item => item.id));
    return (contractLinesQuery.data || []).filter(line => (
      line.scope_type === "customer"
      || line.object_id === object.id
      || (line.scope_type === "collective" && collectiveIds.has(line.collective_id))
    ));
  }, [collectives, contractLinesQuery.data, object.id]);
  const readiness = buildObjectReadiness({ object: dossierObject, scopedContacts, tasks, contractLines });

  const invalidateObject = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["objects"] }),
      queryClient.invalidateQueries({ queryKey: ["object-dossier", object.id] }),
      queryClient.invalidateQueries({ queryKey: ["customer-dossier", object.customer_id, "SurveillanceObject"] }),
    ]);
  };

  const identityMutation = useMutation({
    mutationFn: form => updateCustomerObjectIdentity({
      objectId: object.id,
      customerId: object.customer_id,
      expectedVersion: Number(object.version || 1),
      form,
    }),
    onSuccess: async () => {
      await invalidateObject();
      setIdentityOpen(false);
      toast({ title: "Objectgegevens opgeslagen" });
    },
  });

  const operationsMutation = useMutation({
    mutationFn: form => updateCustomerObjectOperations({
      objectId: object.id,
      customerId: object.customer_id,
      expectedVersion: Number(object.version || 1),
      form,
    }),
    onSuccess: async () => {
      await invalidateObject();
      setOperationsOpen(false);
      toast({ title: "Operationele inrichting opgeslagen", description: "De audit bevat alleen gewijzigde veldnamen, niet de instructie-inhoud." });
    },
  });

  /** @param {{ status: string, reason?: string }} variables */
  const mutateObjectStatus = ({ status, reason }) => setCustomerObjectStatus({
      objectId: object.id,
      customerId: object.customer_id,
      expectedVersion: Number(object.version || 1),
      status,
      reason,
    });
  const statusMutation = useMutation({
    mutationFn: mutateObjectStatus,
    onSuccess: async () => {
      await invalidateObject();
      setStatusTarget(null);
      toast({ title: "Objectstatus bijgewerkt" });
    },
  });

  const setTab = tab => {
    const next = new URLSearchParams(searchParams);
    next.set("id", object.id);
    next.set("tab", tab);
    next.delete("row");
    next.delete("query");
    if (tab === "planning") next.set("view", "tasks");
    else next.delete("view");
    setSearchParams(next);
  };

  const setView = nextView => {
    const next = new URLSearchParams(searchParams);
    next.set("view", nextView);
    next.delete("row");
    next.delete("query");
    setSearchParams(next);
  };

  const setSearch = value => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("query", value);
    else next.delete("query");
    next.delete("row");
    setSearchParams(next, { replace: true });
  };

  const setSelectedRow = row => {
    const next = new URLSearchParams(searchParams);
    if (row) next.set("row", row);
    else next.delete("row");
    setSearchParams(next);
  };

  const coreQueries = [customerQuery, collectivesQuery, tasksQuery, contactsQuery, contactRolesQuery, contractLinesQuery];
  if (coreQueries.some(query => query.isLoading)) return <CoreLoading />;
  const failed = coreQueries.find(query => query.isError);
  if (failed) {
    return <CoreError message={failed.error?.message || "De gekoppelde objectgegevens konden niet worden geladen."} onRetry={() => Promise.all(coreQueries.map(query => query.refetch()))} onBack={onBack} />;
  }

  const customer = customerQuery.data;
  if (!customer) {
    return <CoreError message="De gekoppelde klant bestaat niet meer of is niet toegankelijk. Het object kan daarom niet veilig worden beheerd." onRetry={() => customerQuery.refetch()} onBack={onBack} />;
  }
  return (
    <PageTransition>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Objecten</Button>
        <span className="text-muted-foreground/40">/</span>
        {customer?.id && <><button type="button" onClick={() => navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=objects`)} className="max-w-[220px] truncate text-sm text-muted-foreground hover:text-foreground hover:underline">{customerName(customer)}</button><span className="text-muted-foreground/40">/</span></>}
        <span className="max-w-[280px] truncate text-sm font-medium text-foreground">{dossierObject.name}</span>
        {customer?.id && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=overview`)}><Building2 className="h-3.5 w-3.5" /> Klantkaart</Button>}
      </div>

      <ObjectProfileHeader
        object={dossierObject}
        customer={customer}
        collectives={collectives}
        taskCount={tasks.length}
        readinessOpenCount={readiness.filter(item => !item.complete).length}
        onEdit={() => { identityMutation.reset(); setIdentityOpen(true); }}
        onOpenCustomer={() => navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=overview`)}
      />

      <ObjectDossierTabs
        object={dossierObject}
        customer={customer}
        collectives={collectives}
        tasks={tasks}
        contractLines={contractLines}
        scopedContacts={scopedContacts}
        contactRoles={contactRoles}
        activeTab={activeTab}
        onTabChange={setTab}
        view={view}
        onViewChange={setView}
        searchTerm={searchTerm}
        onSearchChange={setSearch}
        selectedRow={selectedRow}
        onSelectRow={setSelectedRow}
        navigate={navigate}
        onEditIdentity={() => { identityMutation.reset(); setIdentityOpen(true); }}
        onEditOperations={() => { operationsMutation.reset(); setOperationsOpen(true); }}
        onRequestStatus={target => { statusMutation.reset(); setStatusTarget(target); }}
        statusPending={statusMutation.isPending}
      />

      <ObjectIdentityDialog object={dossierObject} open={identityOpen} onOpenChange={setIdentityOpen} onSave={form => identityMutation.mutate(form)} saving={identityMutation.isPending} error={identityMutation.error} />
      <ObjectOperationsDialog object={dossierObject} open={operationsOpen} onOpenChange={setOperationsOpen} onSave={form => operationsMutation.mutate(form)} saving={operationsMutation.isPending} error={operationsMutation.error} />
      <ObjectStatusDialog object={dossierObject} targetStatus={statusTarget} open={Boolean(statusTarget)} onOpenChange={open => !open && setStatusTarget(null)} onConfirm={reason => statusMutation.mutate({ status: statusTarget, reason })} saving={statusMutation.isPending} error={statusMutation.error} />
    </PageTransition>
  );
}

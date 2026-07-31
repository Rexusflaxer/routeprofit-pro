import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { uploadManagedFile, updateManagedFileSource } from "@/lib/managedFiles";
import ObjectCardTabs from "./ObjectCardTabs";
import ObjectProfileHeader from "./ObjectProfileHeader";
import { OBJECT_CARD_TABS } from "./objectWarningAddressConfig";
import { updateCustomerObjectIdentity } from "./objectWorkflow";

const CUSTOMER_FIELDS = ["id", "trade_name", "name", "legal_name", "status"];
const RESTRICTED_OBJECT_FIELDS = new Set(["access_instruction", "alarm_instruction", "key_instruction"]);

async function projectedFilter(entityName, filter, sort, fields, limit = 1) {
  const entity = base44.entities?.[entityName];
  if (!entity?.filter) return [];
  const result = await entity.filter(filter, sort, limit, 0, fields);
  return Array.isArray(result) ? result : [];
}

function sanitizeObjectRecord(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([key]) => !RESTRICTED_OBJECT_FIELDS.has(key)),
  );
}

function customerName(customer) {
  return customer?.trade_name || customer?.name || customer?.legal_name || "Klant";
}

function identityForm(object) {
  return {
    name: object?.name || "",
    object_type: object?.object_type || "",
    address: object?.address || "",
    street_name: object?.street_name || "",
    house_number: object?.house_number || "",
    house_number_addition: object?.house_number_addition || "",
    postal_code: object?.postal_code || "",
    city: object?.city || "",
    country_code: object?.country_code || "NL",
    country_name: object?.country_name || "Nederland",
    latitude: object?.latitude ?? null,
    longitude: object?.longitude ?? null,
    bag_address_id: object?.bag_address_id || null,
    geocoding_status: object?.geocoding_status || "unverified",
    logo_file_url: object?.logo_file_url || null,
    logo_file_id: object?.logo_file_id || null,
    logo_download_filename: object?.logo_download_filename || null,
    logo_logical_path: object?.logo_logical_path || null,
  };
}

function CoreLoading() {
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted/40" />
        <div className="h-36 animate-pulse rounded-xl border border-border bg-muted/20" />
        <div className="h-[620px] animate-pulse rounded-xl border border-border bg-muted/20" />
      </div>
    </PageTransition>
  );
}

function CoreError({ message, onRetry, onBack }) {
  return (
    <PageTransition>
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
        <h1 className="mt-4 text-lg font-semibold">Objectkaart niet beschikbaar</h1>
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
  const dossierObject = useMemo(() => sanitizeObjectRecord(object), [object]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => identityForm(dossierObject));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const requestedTab = searchParams.get("tab") || "warning-addresses";
  const activeTab = OBJECT_CARD_TABS.some(tab => tab.key === requestedTab)
    ? requestedTab
    : "warning-addresses";
  const view = searchParams.get("view") || "";
  const selectedRow = searchParams.get("row") || null;
  const searchTerm = searchParams.get("query") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);

  useEffect(() => {
    if (requestedTab === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set("id", object.id);
    next.set("tab", "warning-addresses");
    next.delete("view");
    next.delete("row");
    next.delete("query");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }, [activeTab, object.id, requestedTab, searchParams, setSearchParams]);

  useEffect(() => {
    if (!editing) setForm(identityForm(dossierObject));
  }, [dossierObject, editing]);

  const customerQuery = useQuery({
    queryKey: ["object-card", object.id, "customer", object.customer_id],
    queryFn: async () => {
      if (!object.customer_id) return null;
      const matches = await projectedFilter("Customer", { id: object.customer_id }, "-updated_date", CUSTOMER_FIELDS, 1);
      return matches[0] || null;
    },
    enabled: Boolean(object.customer_id),
    retry: 1,
  });

  const invalidateObject = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["objects"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id] }),
      queryClient.invalidateQueries({ queryKey: ["customer-dossier", object.customer_id, "SurveillanceObject"] }),
    ]);
  };
  const identityMutation = useMutation({
    mutationFn: currentForm => updateCustomerObjectIdentity({
      objectId: object.id,
      customerId: object.customer_id,
      expectedVersion: Number(dossierObject.version || 1),
      form: currentForm,
    }),
    onSuccess: async () => {
      await invalidateObject();
      setEditing(false);
      setProfileError(null);
      toast({ title: "Objectgegevens opgeslagen" });
    },
  });

  const setTab = useCallback(nextTab => {
    const next = new URLSearchParams(searchParams);
    next.set("id", object.id);
    next.set("tab", nextTab);
    next.delete("view");
    next.delete("row");
    next.delete("query");
    next.delete("page");
    setSearchParams(next);
  }, [object.id, searchParams, setSearchParams]);
  const setSearch = useCallback(value => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("query", value);
    else next.delete("query");
    next.delete("page");
    next.delete("view");
    next.delete("row");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const setPage = useCallback(nextPage => {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const openCreate = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("view", "new");
    next.delete("row");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const openEdit = useCallback(id => {
    const next = new URLSearchParams(searchParams);
    next.set("view", "edit");
    next.set("row", id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const closeView = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    next.delete("row");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const startEdit = () => {
    identityMutation.reset();
    setProfileError(null);
    setForm(identityForm(dossierObject));
    setEditing(true);
  };
  const cancelEdit = () => {
    setForm(identityForm(dossierObject));
    setProfileError(null);
    identityMutation.reset();
    setEditing(false);
  };
  const setIdentityField = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const changeAddressQuery = address => setForm(current => ({
    ...current,
    address,
    street_name: "",
    house_number: "",
    house_number_addition: "",
    postal_code: "",
    city: "",
    latitude: null,
    longitude: null,
    bag_address_id: null,
    geocoding_status: "unverified",
  }));
  const selectAddress = address => setForm(current => ({
    ...current,
    ...address,
    address: address.formatted_address
      || address.address
      || [address.street_name, address.house_number, address.postal_code, address.city].filter(Boolean).join(" "),
    country_code: address.country_code || (address.country === "Nederland" ? "NL" : current.country_code),
    country_name: address.country_name || address.country || current.country_name,
  }));
  const uploadLogo = async file => {
    setProfileError(null);
    if (!file?.type?.startsWith("image/")) {
      setProfileError(new Error("Kies een geldig afbeeldingsbestand."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError(new Error("Het logo mag maximaal 10 MB zijn."));
      return;
    }
    setUploadingLogo(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "object",
        ownerId: object.id,
        objectId: object.id,
        ownerLabel: form.name || dossierObject.name || "Object",
        domain: "branding",
        category: "object_logo",
        sourceEntity: "SurveillanceObject",
        sourceEntityId: object.id,
        sourceField: "logo_file_url",
        documentLabel: "Logo",
        isSensitive: false,
        folderSegments: ["branding", "logo"],
      });
      setForm(current => ({
        ...current,
        logo_file_url: result.file_url,
        logo_file_id: result.managed_file_id,
        logo_download_filename: result.download_filename,
        logo_logical_path: result.logical_path,
      }));
      await updateManagedFileSource(result.managed_file_id, { source_entity_id: object.id, object_id: object.id });
    } catch (error) {
      setProfileError(error);
    } finally {
      setUploadingLogo(false);
    }
  };

  if (customerQuery.isLoading) return <CoreLoading />;
  if (customerQuery.isError) return <CoreError message={customerQuery.error?.message || "De gekoppelde klant kon niet worden geladen."} onRetry={() => customerQuery.refetch()} onBack={onBack} />;
  const customer = customerQuery.data;
  if (!customer) return <CoreError message="De gekoppelde klant bestaat niet meer of is niet toegankelijk." onRetry={() => customerQuery.refetch()} onBack={onBack} />;

  return (
    <PageTransition>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Objecten</Button>
        <span className="text-muted-foreground/40">/</span>
        <button type="button" onClick={() => navigate(`/CustomerDetail?id=${encodeURIComponent(customer.id)}&tab=objects`)} className="max-w-[220px] truncate text-sm text-muted-foreground hover:text-foreground hover:underline">{customerName(customer)}</button>
        <span className="text-muted-foreground/40">/</span>
        <span className="max-w-[280px] truncate text-sm font-medium text-foreground">{dossierObject.name}</span>
      </div>

      <ObjectProfileHeader
        object={dossierObject}
        editing={editing}
        form={form}
        onChange={setIdentityField}
        onAddressQueryChange={changeAddressQuery}
        onAddressSelect={selectAddress}
        onUploadLogo={uploadLogo}
        onStartEdit={startEdit}
        onCancel={cancelEdit}
        onSave={() => identityMutation.mutate(form)}
        saving={identityMutation.isPending}
        uploadingLogo={uploadingLogo}
        error={profileError || identityMutation.error}
      />

      <ObjectCardTabs
        object={dossierObject}
        activeTab={activeTab}
        onTabChange={setTab}
        searchTerm={searchTerm}
        onSearchChange={setSearch}
        page={page}
        onPageChange={setPage}
        view={view}
        selectedRow={selectedRow}
        onOpenCreate={openCreate}
        onOpenEdit={openEdit}
        onCloseView={closeView}
      />
    </PageTransition>
  );
}

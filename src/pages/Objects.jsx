import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, MapPin, Plus, RefreshCw, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ObjectDetailView from "@/components/objects/ObjectDetailView";
import ObjectTable from "@/components/objects/ObjectTable";
import { invokeCustomerPlatformRead } from "@/components/customers/customerDossierUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/ui-custom/EmptyState";
import PageHeader from "@/components/ui-custom/PageHeader";
import PageTransition from "@/components/ui-custom/PageTransition";

const OBJECT_PAGE_SIZE = 50;
const OBJECT_LIST_FIELDS = [
  "id",
  "customer_id",
  "object_code",
  "external_object_code",
  "name",
  "object_type",
  "status",
  "address",
  "postal_code",
  "city",
  "region",
  "logo_file_url",
  "logo_file_id",
  "logo_download_filename",
  "logo_logical_path",
  "is_active_customer_object",
  "updated_date",
];
const OBJECT_DETAIL_FIELDS = [
  ...OBJECT_LIST_FIELDS,
  "street_name",
  "house_number",
  "house_number_addition",
  "country_code",
  "country_name",
  "latitude",
  "longitude",
  "bag_address_id",
  "geocoding_status",
  "parking_instruction",
  "entry_instruction",
  "walking_instruction",
  "object_notes",
  "safety_notes",
  "show_on_mobile_map",
  "mobile_map_priority",
  "notes",
  "archived_at",
  "archive_reason",
  "version",
  "created_date",
];

async function listObjects({ customerId, search, page }) {
  const query = {};
  if (customerId) query.customer_id = customerId;
  const boundedSearch = String(search || "").trim().slice(0, 120);
  if (boundedSearch) {
    const result = await invokeCustomerPlatformRead({
      action: "search_customer_objects",
      customer_id: customerId || undefined,
      search: boundedSearch,
      page,
      page_size: OBJECT_PAGE_SIZE,
    });
    return {
      rows: Array.isArray(result.items) ? result.items : [],
      hasNext: result.has_more === true,
    };
  }
  const skip = (page - 1) * OBJECT_PAGE_SIZE;
  const rows = Object.keys(query).length
    ? await base44.entities.SurveillanceObject.filter(query, "name", OBJECT_PAGE_SIZE + 1, skip, OBJECT_LIST_FIELDS)
    : await base44.entities.SurveillanceObject.list("name", OBJECT_PAGE_SIZE + 1, skip, OBJECT_LIST_FIELDS);
  return {
    rows: rows.slice(0, OBJECT_PAGE_SIZE),
    hasNext: rows.length > OBJECT_PAGE_SIZE,
  };
}

async function getObjectDetail(objectId) {
  const rows = await base44.entities.SurveillanceObject.filter(
    { id: objectId },
    "name",
    1,
    0,
    OBJECT_DETAIL_FIELDS,
  );
  return rows[0] || null;
}

function ObjectPageState({ loading = false, title, description, onRetry, onBack }) {
  if (loading) {
    return <PageTransition><div className="space-y-4"><div className="h-8 w-52 animate-pulse rounded-md bg-muted/40" /><div className="h-48 animate-pulse rounded-xl border border-border bg-muted/20" /><div className="h-[560px] animate-pulse rounded-xl border border-border bg-muted/20" /></div></PageTransition>;
  }
  return (
    <PageTransition>
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-center gap-2">
          {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Objecten</Button>}
          {onRetry && <Button onClick={onRetry}><RefreshCw className="h-4 w-4" /> Opnieuw</Button>}
        </div>
      </div>
    </PageTransition>
  );
}

export default function Objects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedObjectId = searchParams.get("id");
  const customerFilter = searchParams.get("customer") || "";
  const searchTerm = selectedObjectId ? "" : searchParams.get("query") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const objectsQuery = useQuery({
    queryKey: ["objects", "list", customerFilter, searchTerm.trim(), page],
    queryFn: () => listObjects({ customerId: customerFilter, search: searchTerm.trim(), page }),
    enabled: !selectedObjectId,
    retry: 1,
  });
  const selectedObjectQuery = useQuery({
    queryKey: ["objects", "detail", selectedObjectId],
    queryFn: () => getObjectDetail(selectedObjectId),
    enabled: Boolean(selectedObjectId),
    retry: 1,
  });

  const objects = objectsQuery.data?.rows || [];
  const selectedObject = selectedObjectQuery.data;
  const hasListContext = Boolean(searchTerm.trim() || customerFilter || page > 1);

  const selectObject = object => {
    const next = new URLSearchParams(searchParams);
    next.set("id", object.id);
    next.set("tab", "warning-addresses");
    next.delete("row");
    next.delete("view");
    next.delete("query");
    next.delete("page");
    setSearchParams(next);
  };

  const closeObject = () => {
    const next = new URLSearchParams(searchParams);
    ["id", "tab", "row", "view", "query", "page"].forEach(key => next.delete(key));
    setSearchParams(next);
  };

  const setSearchTerm = value => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("query", value);
    else next.delete("query");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const setPage = nextPage => {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next);
  };

  if (selectedObjectId && selectedObjectQuery.isLoading) return <ObjectPageState loading />;
  if (selectedObjectId && selectedObjectQuery.isError) {
    return <ObjectPageState title="Objectdossier niet beschikbaar" description={selectedObjectQuery.error?.message || "Het object kon niet worden geladen."} onRetry={() => selectedObjectQuery.refetch()} onBack={closeObject} />;
  }
  if (selectedObjectId && !selectedObject) {
    return <ObjectPageState title="Object niet gevonden" description="Dit object bestaat niet meer of je hebt geen toegang tot het dossier." onBack={closeObject} />;
  }
  if (selectedObject) return <ObjectDetailView object={selectedObject} onBack={closeObject} />;
  if (objectsQuery.isLoading) return <ObjectPageState loading />;
  if (objectsQuery.isError) {
    return <ObjectPageState title="Objecten niet beschikbaar" description={objectsQuery.error?.message || "De objecten konden niet worden geladen."} onRetry={() => objectsQuery.refetch()} />;
  }

  return (
    <PageTransition>
      <PageHeader
        title="Objecten"
        subtitle="Operationele locaties van klanten"
        actions={<Button onClick={() => navigate("/Customers")}><Plus className="h-4 w-4" /> Object toevoegen via klant</Button>}
      />

      {objects.length > 0 || hasListContext ? (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Zoek op objectcode, externe code, naam, adres of regio..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} maxLength={120} className="pl-9 pr-9" />
            {searchTerm && <button type="button" onClick={() => setSearchTerm("")} aria-label="Zoekopdracht wissen" className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
          </div>
          {objects.length === 0
            ? <EmptyState icon={MapPin} title="Geen resultaten" description={`Geen objecten gevonden met “${searchTerm}”.`} />
            : <ObjectTable objects={objects} onSelect={selectObject} />}
          {(page > 1 || objectsQuery.data?.hasNext) && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Pagina {page}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Vorige</Button>
                <Button type="button" variant="outline" size="sm" disabled={!objectsQuery.data?.hasNext} onClick={() => setPage(page + 1)}>Volgende</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={MapPin} title="Geen objecten" description="Voeg het eerste object toe vanuit de objectentab van een klantdossier." actionLabel="Naar klanten" onAction={() => navigate("/Customers")} />
      )}
    </PageTransition>
  );
}

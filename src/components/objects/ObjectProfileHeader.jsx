import React from "react";
import {
  Building2,
  Edit3,
  Layers3,
  MapPin,
  Navigation,
  Route,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GEOCODING_CLASSES,
  GEOCODING_LABELS,
  OBJECT_STATUS_CLASSES,
  OBJECT_STATUS_LABELS,
  getObjectStatus,
  getObjectTypeLabel,
  objectAddress,
} from "./objectDossierConfig";

function InlineMeta({ icon: Icon, children, onClick = null }) {
  const className = "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left hover:text-foreground hover:underline`}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{children}</span>
      </button>
    );
  }
  return (
    <div className={className}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export default function ObjectProfileHeader({
  object,
  customer,
  collectives = [],
  taskCount = 0,
  readinessOpenCount = 0,
  onEdit,
  onOpenCustomer,
}) {
  const status = getObjectStatus(object);
  const geocodingStatus = object.geocoding_status || "unverified";
  const customerName = customer?.trade_name || customer?.name || customer?.legal_name || "Geen klant gekoppeld";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {status === "archived" && (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Dit object is gearchiveerd. Historie blijft beschikbaar; controleer eventuele toekomstige planning voordat het dossier gesloten blijft.</p>
        </div>
      )}
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-foreground">{object.name || "Naamloos object"}</h1>
              <Badge variant="outline" className="text-[11px]">{getObjectTypeLabel(object.object_type)}</Badge>
              <Badge variant="outline" className={`text-[11px] ${OBJECT_STATUS_CLASSES[status] || ""}`}>
                {OBJECT_STATUS_LABELS[status] || status}
              </Badge>
              {readinessOpenCount > 0 && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[11px] text-amber-700">
                  {readinessOpenCount} aandachtspunt{readinessOpenCount === 1 ? "" : "en"}
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{objectAddress(object)}</p>
            <div className="mt-3 grid max-w-4xl gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              <InlineMeta icon={Building2} onClick={customer?.id ? onOpenCustomer : undefined}>{customerName}</InlineMeta>
              <InlineMeta icon={Layers3}>{collectives.length ? collectives.map(item => item.name).join(", ") : "Geen collectief"}</InlineMeta>
              <InlineMeta icon={Route}>{taskCount} operationele taak{taskCount === 1 ? "" : "en"}</InlineMeta>
              <InlineMeta icon={Navigation}>{object.region || "Geen regio vastgelegd"}</InlineMeta>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={status === "archived"}>
            <Edit3 className="h-4 w-4" /> Gegevens wijzigen
          </Button>
        </div>
      </div>
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Objectcode", object.object_code || "Niet toegekend"],
          ["Locatiestatus", GEOCODING_LABELS[geocodingStatus] || geocodingStatus, GEOCODING_CLASSES[geocodingStatus]],
          ["Mobiele kaart", object.show_on_mobile_map ? "Zichtbaar" : "Niet zichtbaar"],
          ["Dossierversie", `Versie ${Number(object.version || 1)}`],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-card px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`mt-1 truncate text-sm font-medium ${tone ? `inline-flex rounded border px-1.5 py-0.5 text-xs ${tone}` : "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Box,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS = {
  draft: "Concept",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
  failed: "Mislukt",
};

const STATUS_STYLES = {
  draft: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-border bg-muted text-muted-foreground",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const SOURCE_LABELS = {
  ios_roomplan: "iOS RoomPlan",
  manual: "Handmatig",
  import: "Import",
};

const FLOORPLAN_FIELDS = [
  "id",
  "object_id",
  "status",
  "revision",
  "is_current",
  "title",
  "source",
  "captured_at",
  "published_at",
  "preview_2d_file_id",
  "preview_2d_download_filename",
  "usdz_file_id",
  "usdz_download_filename",
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function planFiles(plan) {
  const revision = plan.revision || 1;
  return [
    plan.preview_2d_file_id && {
      kind: "2D",
      label: "2D-plattegrond",
      icon: ImageIcon,
      managedFileId: plan.preview_2d_file_id,
      filename: plan.preview_2d_download_filename || `objectplattegrond-revisie-${revision}.png`,
    },
    plan.usdz_file_id && {
      kind: "3D",
      label: "3D-model",
      icon: Box,
      managedFileId: plan.usdz_file_id,
      filename: plan.usdz_download_filename || `objectmodel-revisie-${revision}.usdz`,
    },
  ].filter(Boolean);
}

function FileButton({ file, revision, onOpen }) {
  const Icon = file.icon;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 border-border bg-background text-xs shadow-none"
      onClick={() => onOpen({ ...file, revision })}
      aria-label={`${file.label} van revisie ${revision} veilig bekijken`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {file.kind}
    </Button>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-label="Plattegronden laden" aria-busy="true">
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Skeleton className="h-10 w-full rounded-none" />
        <Skeleton className="h-14 w-full rounded-none" />
        <Skeleton className="h-14 w-full rounded-none" />
      </div>
    </div>
  );
}

export default function ObjectFloorPlanTab({ objectId }) {
  const [previewFile, setPreviewFile] = useState(null);
  const {
    data: plans = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["object-floorplans", objectId],
    queryFn: () => base44.entities.ObjectFloorPlan.filter(
      { object_id: objectId },
      "-revision",
      100,
      0,
      FLOORPLAN_FIELDS,
    ),
    enabled: !!objectId,
  });

  const sortedPlans = useMemo(
    () => [...plans].sort((left, right) => Number(right.revision || 0) - Number(left.revision || 0)),
    [plans],
  );
  const current = sortedPlans.find((plan) => plan.is_current && plan.status === "published") || null;

  if (isLoading) return <LoadingState />;

  if (isError) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 p-6 text-center">
        <div className="max-w-md">
          <AlertTriangle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">Plattegronden konden niet worden geladen.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Probeer het opnieuw of controleer uw toegang tot dit object.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Opnieuw proberen
          </Button>
        </div>
      </div>
    );
  }

  if (sortedPlans.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center">
        <div className="max-w-md">
          <Box className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">Nog geen plattegrond</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Zodra een opname voor dit object is verwerkt, verschijnt hier de actuele revisie en de revisiehistorie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {current ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="current-floorplan-title">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="current-floorplan-title" className="truncate text-sm font-semibold text-foreground">
                  {current.title || "Actuele objectplattegrond"}
                </h3>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  Revisie {current.revision || 1}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">De gepubliceerde versie voor operationeel gebruik.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {planFiles(current).map((file) => (
                <FileButton
                  key={file.kind}
                  file={file}
                  revision={current.revision || 1}
                  onOpen={setPreviewFile}
                />
              ))}
              {planFiles(current).length === 0 && (
                <span className="text-xs text-muted-foreground">ManagedFile-koppeling vereist</span>
              )}
            </div>
          </div>

          <dl className="grid divide-y divide-border text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <dt className="text-xs text-muted-foreground">Bron</dt>
              <dd className="mt-1 font-medium text-foreground">{SOURCE_LABELS[current.source] || current.source || "—"}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-muted-foreground">Opgenomen</dt>
              <dd className="mt-1 font-medium text-foreground">{formatDate(current.captured_at)}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-muted-foreground">Gepubliceerd</dt>
              <dd className="mt-1 font-medium text-foreground">{formatDate(current.published_at)}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">Geen actuele publicatie</p>
          <p className="mt-1 text-xs text-amber-800">
            Er zijn wel revisies aanwezig, maar geen gepubliceerde revisie is als actueel gemarkeerd.
          </p>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="revision-history-title">
        <div className="border-b border-border px-4 py-3">
          <h3 id="revision-history-title" className="text-sm font-semibold text-foreground">Revisiehistorie</h3>
          <p className="mt-1 text-xs text-muted-foreground">Alle versies blijven herkenbaar; alleen een actuele publicatie geldt operationeel.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Revisie</TableHead>
              <TableHead>Titel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opgenomen</TableHead>
              <TableHead>Gepubliceerd</TableHead>
              <TableHead className="pr-4 text-right">Bestanden</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlans.map((plan) => {
              const files = planFiles(plan);
              return (
                <TableRow key={plan.id || `${plan.object_id}-${plan.revision}`}>
                  <TableCell className="pl-4 font-medium tabular-nums">
                    {plan.revision || 1}
                    {plan.is_current && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">Actueel</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{plan.title || "Objectplattegrond"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[plan.status] || STATUS_STYLES.archived}>
                      {STATUS_LABELS[plan.status] || plan.status || "Onbekend"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(plan.captured_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(plan.published_at)}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1.5">
                      {files.map((file) => (
                        <FileButton
                          key={file.kind}
                          file={file}
                          revision={plan.revision || 1}
                          onOpen={setPreviewFile}
                        />
                      ))}
                      {files.length === 0 && (
                        <span className="text-xs text-muted-foreground">ManagedFile-koppeling vereist</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <ManagedFilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => { if (!open) setPreviewFile(null); }}
        managedFileId={previewFile?.managedFileId}
        fileUrl={undefined}
        filename={previewFile?.filename}
        title={previewFile ? `${previewFile.label} — revisie ${previewFile.revision}` : "Plattegrond bekijken"}
      />
    </div>
  );
}

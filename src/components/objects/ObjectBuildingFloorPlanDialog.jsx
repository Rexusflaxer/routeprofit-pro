import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Building2, Loader2, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareManagedFilePreview, revokeManagedFilePreview } from "@/lib/managedFiles";
import { buildingFloorPlanDrawing, getObjectBuildingFloorPlan } from "./objectBuildingFloorPlanWorkflow";
import PublishedDesktopFloorPlan from "./PublishedDesktopFloorPlan";

function FloorPlanDrawing({ drawing, label }) {
  return <svg role="img" aria-label={`Plattegrond van ${label}`} viewBox={drawing.viewBox} className="h-[55vh] min-h-64 w-full bg-white">
    <g transform={`translate(0 ${drawing.reflectY}) scale(1 -1)`}>
    {drawing.rooms.map((room, index) => <polygon key={`room-${index}`} points={room.polygon.map(point => `${point.x},${point.y}`).join(" ")} fill="#f1f5f9" stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
    {drawing.walls.map((wall, index) => <line key={`wall-${index}`} x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} stroke="#0f172a" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
    {drawing.openings.map((opening, index) => <line key={`opening-${index}`} x1={opening.start.x} y1={opening.start.y} x2={opening.end.x} y2={opening.end.y} stroke={opening.type === "window" ? "#0284c7" : "#059669"} strokeWidth="4" vectorEffect="non-scaling-stroke" />)}
    </g>
  </svg>;
}

function PublishedFloorPlan({ plan, label }) {
  const [asset, setAsset] = useState({ loading: Boolean(plan.preview_2d_file_id), preview: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const drawing = buildingFloorPlanDrawing(plan.floorplan_2d_json);
  useEffect(() => {
    if (!plan.preview_2d_file_id) return undefined;
    let active = true;
    let ownedPreview = null;
    setAsset({ loading: true, preview: null, error: null });
    prepareManagedFilePreview({
      managedFileId: plan.preview_2d_file_id,
      filename: plan.preview_2d_download_filename || `gebouwplattegrond-revisie-${plan.revision}.png`,
    }).then(preview => {
      if (!active) { revokeManagedFilePreview(preview); return; }
      ownedPreview = preview;
      setAsset({ loading: false, preview, error: null });
    }).catch(error => {
      if (active) setAsset({ loading: false, preview: null, error });
    });
    return () => { active = false; revokeManagedFilePreview(ownedPreview); };
  }, [plan.preview_2d_file_id, plan.preview_2d_download_filename, plan.revision, attempt]);
  const image = asset.preview?.mimeType?.startsWith("image/");
  const pdf = asset.preview?.mimeType === "application/pdf";
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{plan.title || `Plattegrond van ${label}`}</p><Badge variant="outline">Revisie {plan.revision}</Badge></div>
    <div className="flex min-h-72 items-center justify-center overflow-auto rounded-xl border border-border bg-muted/10">
      {asset.loading ? <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Plattegrond openen…</p>
        : image ? <img src={asset.preview.url} alt={`Plattegrond van ${label}`} className="max-h-[60vh] max-w-full object-contain" onError={() => { revokeManagedFilePreview(asset.preview); setAsset({ loading: false, preview: null, error: new Error("De 2D-afbeelding kon niet worden weergegeven.") }); }} />
          : pdf ? <iframe title={`Plattegrond van ${label}`} src={asset.preview.url} className="h-[60vh] w-full bg-white" />
            : drawing ? <FloorPlanDrawing drawing={drawing} label={label} />
              : <div role="status" className="max-w-md p-6 text-center"><AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">De plattegrond kan nog niet worden weergegeven.</p><p className="mt-1 text-xs text-muted-foreground">Voeg een 2D-weergave toe via de LOQ desktop app.</p></div>}
    </div>
    {asset.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3"><p className="text-xs">Het plattegrondbestand kon niet worden geopend.{drawing ? " De opgeslagen 2D-tekening wordt getoond." : " Probeer opnieuw."}</p><Button type="button" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3.5 w-3.5" /> Bestand opnieuw laden</Button></div>}
  </div>;
}

function BuildingFloorPlanContent({ customerId, objectId, building }) {
  const query = useQuery({
    queryKey: ["object-building-floor-plan", customerId, objectId, building.key],
    queryFn: () => getObjectBuildingFloorPlan({ customerId, objectId, buildingSelectionKey: building.key }),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (query.isLoading || query.isFetching) return <p role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Plattegrond laden…</p>;
  if (query.isError) return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center"><AlertCircle className="mx-auto h-6 w-6 text-destructive" /><p className="mt-3 text-sm font-medium">Plattegrond kon niet worden geladen.</p><p className="mt-1 text-xs text-muted-foreground">{query.error?.message || "Probeer het opnieuw."}</p><Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw proberen</Button></div>;
  if (!query.data) return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center"><Monitor className="h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nog geen plattegrond voor dit gebouw</p><p className="mt-1 text-sm text-muted-foreground">Voeg een plattegrond toe via de LOQ desktop app.</p></div>;
  return query.data.desktop_document
    ? <PublishedDesktopFloorPlan key={`${query.data.id}:${query.data.revision}`} plan={query.data} />
    : <PublishedFloorPlan key={`${query.data.id}:${query.data.revision}`} plan={query.data} label={building.label} />;
}

export default function ObjectBuildingFloorPlanDialog({ customerId, objectId, building, onClose }) {
  return <Dialog open={Boolean(building)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />{building?.label || "Gebouwplattegrond"}</DialogTitle><DialogDescription>De actuele gepubliceerde plattegrond van dit gebouw.</DialogDescription></DialogHeader>
      {building && <BuildingFloorPlanContent key={`${customerId}:${objectId}:${building.key}`} customerId={customerId} objectId={objectId} building={building} />}
    </DialogContent>
  </Dialog>;
}

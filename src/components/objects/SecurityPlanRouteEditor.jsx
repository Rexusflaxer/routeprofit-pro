import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MapPin,
  MousePointer2,
  Pencil,
  Plus,
  Route,
  Trash2,
  Undo2,
} from "lucide-react";
import { prepareManagedFilePreview, revokeManagedFilePreview } from "@/lib/managedFiles";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SECURITY_PLAN_MARKER_TYPES,
  SECURITY_PLAN_SECTION_POLICIES,
  createSecurityPlanClientId,
  normalizeRouteOverlay,
} from "./securityPlanConfig";

function floorplanLabel(floorplan) {
  return `${floorplan.title || "Objectplattegrond"} · revisie ${floorplan.revision || 1}${floorplan.is_current ? " · actueel" : ""}`;
}

function move(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function resequenceRoute(route) {
  const path = route.path.map((point, index) => ({ ...point, sequence: index + 1 }));
  const markers = route.markers.map((marker, index) => ({ ...marker, sequence: index + 1 }));
  return {
    ...route,
    path,
    markers,
    start_point: path[0] ? { x: path[0].x, y: path[0].y, label: route.start_point?.label || null } : null,
    end_point: path.length ? { x: path.at(-1).x, y: path.at(-1).y, label: route.end_point?.label || null } : null,
  };
}

function useFloorplanPreview(floorplan) {
  const [state, setState] = useState({ preview: null, loading: false, error: null, aspectRatio: 16 / 10 });
  useEffect(() => {
    if (!floorplan?.preview_2d_file_id) {
      setState({ preview: null, loading: false, error: null, aspectRatio: 16 / 10 });
      return undefined;
    }
    let active = true;
    setState(current => ({ ...current, preview: null, loading: true, error: null }));
    prepareManagedFilePreview({
      managedFileId: floorplan.preview_2d_file_id,
      filename: floorplan.preview_2d_download_filename || `plattegrond-revisie-${floorplan.revision || 1}.png`,
    }).then(preview => {
      if (!active) return revokeManagedFilePreview(preview);
      setState(current => ({ ...current, preview, loading: false }));
    }).catch(error => {
      if (active) setState(current => ({ ...current, loading: false, error }));
    });
    return () => { active = false; };
  }, [floorplan?.id, floorplan?.preview_2d_download_filename, floorplan?.preview_2d_file_id, floorplan?.revision]);
  useEffect(() => () => revokeManagedFilePreview(state.preview), [state.preview]);
  return [state, ratio => setState(current => ({ ...current, aspectRatio: ratio }))];
}

function SectionForm({ section, floorplan, pending, onCancel, onSave }) {
  const [form, setForm] = useState({ code: section?.code || "", name: section?.name || "", description: section?.description || "" });
  const valid = form.code.trim() && form.name.trim();
  return (
    <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="space-y-1.5"><Label htmlFor="section-code" className="text-xs font-semibold">Sectiecode</Label><Input id="section-code" value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} placeholder="S1" maxLength={40} autoFocus /></div>
      <div className="space-y-1.5"><Label htmlFor="section-name" className="text-xs font-semibold">Naam</Label><Input id="section-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Productiehal noord" maxLength={160} /></div>
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="section-description" className="text-xs font-semibold">Toelichting</Label><Textarea id="section-description" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Optionele herkenningspunten of afbakening van deze sectie" rows={2} maxLength={2000} /></div>
      <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Annuleren</Button><Button type="button" size="sm" disabled={!valid || pending} onClick={() => onSave({ ...form, floorplan_id: section?.floorplan_id || floorplan?.id || null, floorplan_revision: section?.floorplan_revision || floorplan?.revision || null, geometry: section?.geometry || null })}>{pending ? "Opslaan..." : section ? "Sectie opslaan" : "Sectie toevoegen"}</Button></div>
    </div>
  );
}

function SectionManager({ sections, floorplan, sectionPolicy, defaultSectionIds, allowedSectionIds, onSelectionChange, onUpsert, onArchive, pending }) {
  const [editing, setEditing] = useState(undefined);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const defaultSet = new Set(defaultSectionIds);
  const allowedSet = new Set(allowedSectionIds);
  const controlled = sectionPolicy === "default_with_controlled_override";
  const toggleDefault = (id, checked) => {
    const nextDefault = checked ? [...new Set([...defaultSectionIds, id])] : defaultSectionIds.filter(value => value !== id);
    const nextAllowed = checked && controlled ? [...new Set([...allowedSectionIds, id])] : allowedSectionIds;
    onSelectionChange(nextDefault, nextAllowed);
  };
  const toggleAllowed = (id, checked) => {
    const nextAllowed = checked ? [...new Set([...allowedSectionIds, id])] : allowedSectionIds.filter(value => value !== id);
    const nextDefault = checked ? defaultSectionIds : defaultSectionIds.filter(value => value !== id);
    onSelectionChange(nextDefault, nextAllowed);
  };
  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Objectsecties</h3><p className="mt-1 text-xs text-muted-foreground">Maak secties één keer aan en hergebruik ze in alle planvarianten van dit object.</p></div>
        {editing === undefined && <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}><Plus className="h-3.5 w-3.5" /> Sectie toevoegen</Button>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Gebruik van secties in deze variant</Label>
        <Select value={sectionPolicy} onValueChange={value => onSelectionChange(value === "not_applicable" ? [] : defaultSectionIds, value === "not_applicable" ? [] : allowedSectionIds, value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SECURITY_PLAN_SECTION_POLICIES.map(policy => <SelectItem key={policy.key} value={policy.key}>{policy.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {editing !== undefined && <SectionForm key={editing?.id || "new-section"} section={editing} floorplan={floorplan} pending={pending} onCancel={() => setEditing(undefined)} onSave={data => onUpsert(editing, data).then(() => setEditing(undefined)).catch(() => {})} />}
      {sections.length ? (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_110px_78px] gap-3 border-b border-border bg-muted/25 px-3 py-2 text-[11px] font-semibold text-muted-foreground sm:grid">
            <span>Sectie</span><span>Standaard</span><span>{controlled ? "Toegestaan" : "Gebruik"}</span><span className="text-right">Acties</span>
          </div>
          <div className="divide-y divide-border/70">
            {sections.map(section => (
              <div key={section.id} className="grid gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_100px_110px_78px] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-medium"><span className="mr-2 text-xs text-primary">{section.code}</span>{section.name}</p>{section.description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{section.description}</p>}</div>
                {sectionPolicy === "not_applicable" ? <span className="text-xs text-muted-foreground sm:col-span-2">Niet gebruikt in deze variant</span> : <><label className="flex items-center gap-2 text-xs"><Checkbox checked={defaultSet.has(section.id)} onCheckedChange={checked => toggleDefault(section.id, checked === true)} /> Standaard</label><label className="flex items-center gap-2 text-xs"><Checkbox checked={controlled ? allowedSet.has(section.id) : defaultSet.has(section.id)} disabled={!controlled} onCheckedChange={checked => toggleAllowed(section.id, checked === true)} /> {controlled ? "Toegestaan" : "Vast"}</label></>}
                <div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(section)} aria-label={`${section.name} bewerken`}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setArchiveTarget(section)} aria-label={`${section.name} archiveren`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
              </div>
            ))}
          </div>
        </div>
      ) : editing === undefined && <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center"><Layers3 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-medium">Nog geen objectsecties</p><p className="mt-1 text-[11px] text-muted-foreground">Maak bijvoorbeeld S1 Productie, S2 Magazijn en S3 Expeditie.</p></div>}
      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={open => !open && !pending && setArchiveTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Objectsectie archiveren?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.code} · {archiveTarget?.name} verdwijnt uit nieuwe plannen. Publicaties en historie blijven behouden. Archiveren kan worden geblokkeerd wanneer een actief concept de sectie nog gebruikt.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event => { event.preventDefault(); onArchive(archiveTarget).then(() => setArchiveTarget(null)).catch(() => {}); }}>{pending ? "Archiveren..." : "Archiveren"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RouteCanvas({ floorplan, previewState, onImageRatio, route, onChange, mode, sections, drawingSection, polygonPoints, onPolygonChange }) {
  const addPoint = event => {
    if (!floorplan || previewState.loading || !previewState.preview) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    if (mode === "section") {
      if (!drawingSection) return;
      onPolygonChange([...polygonPoints, { x, y }]);
      return;
    }
    const sequence = route.path.length + 1;
    const marker = { id: createSecurityPlanClientId("marker"), x, y, sequence, step_id: null, section_id: null, label: `Punt ${sequence}`, marker_type: sequence === 1 ? "start" : "checkpoint" };
    onChange(resequenceRoute({ ...route, path: [...route.path, { x, y, sequence }], markers: [...route.markers, marker] }));
  };
  const points = route.path.map(point => `${point.x * 100},${point.y * 100}`).join(" ");
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-slate-100/70 shadow-inner dark:bg-slate-950/40" style={{ aspectRatio: previewState.aspectRatio }}>
      {previewState.preview && <img src={previewState.preview.url} alt={`Plattegrond ${floorplanLabel(floorplan)}`} className="absolute inset-0 h-full w-full select-none object-fill" draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) onImageRatio(image.naturalWidth / image.naturalHeight); }} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label="Ingetekende looproute">
        {sections.filter(section => section.id !== drawingSection?.id && section.geometry?.type === "polygon" && section.floorplan_id === floorplan.id && Number(section.floorplan_revision) === Number(floorplan.revision)).map(section => (
          <polygon key={section.id} points={(section.geometry.points || []).map(point => `${point.x * 100},${point.y * 100}`).join(" ")} fill="hsl(var(--primary) / 0.10)" stroke="hsl(var(--primary) / 0.42)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        ))}
        {polygonPoints.length >= 3 ? <polygon points={polygonPoints.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} fill="hsl(var(--primary) / 0.18)" stroke="hsl(var(--primary))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray="2 1" /> : polygonPoints.length > 1 && <polyline points={polygonPoints.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray="2 1" />}
        {polygonPoints.map((point, index) => <circle key={`polygon-${index}`} cx={point.x * 100} cy={point.y * 100} r="1.5" fill="hsl(var(--primary))" />)}
        {route.path.length > 1 && <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
        {route.markers.map((marker, index) => <g key={marker.id}><circle cx={marker.x * 100} cy={marker.y * 100} r="2.3" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" /><text x={marker.x * 100} y={marker.y * 100 + 0.9} textAnchor="middle" fontSize="2.6" fontWeight="700" fill="hsl(var(--primary))">{index + 1}</text></g>)}
      </svg>
      <button type="button" className={`absolute inset-0 ${mode === "section" && !drawingSection ? "cursor-not-allowed" : "cursor-crosshair"}`} onClick={addPoint} aria-label={mode === "section" ? "Klik om een hoekpunt aan het sectiegebied toe te voegen" : "Klik om een routepunt toe te voegen"}><span className="sr-only">{mode === "section" ? "Hoekpunt toevoegen" : "Routepunt toevoegen"}</span></button>
      {previewState.loading && <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs text-muted-foreground backdrop-blur-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Plattegrond veilig laden...</div>}
      {!previewState.loading && previewState.error && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 px-6 text-center"><AlertTriangle className="h-5 w-5 text-destructive" /><p className="mt-2 text-xs font-medium">De plattegrond kon niet veilig worden geopend.</p><p className="mt-1 text-[11px] text-muted-foreground">{previewState.error.message}</p></div>}
      {!previewState.loading && !previewState.preview && !previewState.error && <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs font-medium">Geen 2D-voorbeeld beschikbaar</p><p className="mt-1 text-[11px] text-muted-foreground">De route kan worden ingetekend zodra deze plattegrond een veilige preview heeft.</p></div>}
    </div>
  );
}

function RoutePointList({ route, sections, steps, onChange }) {
  const updateMarker = (index, patch) => {
    const markers = [...route.markers];
    markers[index] = { ...markers[index], ...patch };
    onChange(resequenceRoute({ ...route, markers }));
  };
  const remove = index => onChange(resequenceRoute({ ...route, path: route.path.filter((_, itemIndex) => itemIndex !== index), markers: route.markers.filter((_, itemIndex) => itemIndex !== index) }));
  const reorder = (index, direction) => onChange(resequenceRoute({ ...route, path: move(route.path, index, direction), markers: move(route.markers, index, direction) }));
  return (
    <div className="space-y-2">
      {route.markers.map((marker, index) => (
        <div key={marker.id} className="rounded-lg border border-border/70 bg-card/55 p-3">
          <div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{index + 1}</span><Input value={marker.label} onChange={event => updateMarker(index, { label: event.target.value })} aria-label={`Naam routepunt ${index + 1}`} className="h-8 min-w-0" maxLength={120} /><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(index)} aria-label="Routepunt verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Select value={marker.marker_type || "checkpoint"} onValueChange={value => updateMarker(index, { marker_type: value })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{SECURITY_PLAN_MARKER_TYPES.map(type => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}</SelectContent></Select>
            <Select value={marker.section_id || "none"} onValueChange={value => updateMarker(index, { section_id: value === "none" ? null : value })}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sectie" /></SelectTrigger><SelectContent><SelectItem value="none">Geen sectie</SelectItem>{sections.map(section => <SelectItem key={section.id} value={section.id}>{section.code} · {section.name}</SelectItem>)}</SelectContent></Select>
            <Select value={marker.step_id || "none"} onValueChange={value => updateMarker(index, { step_id: value === "none" ? null : value })}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Instructiestap" /></SelectTrigger><SelectContent><SelectItem value="none">Geen instructiestap</SelectItem>{steps.map(step => <SelectItem key={step.id} value={step.id}>{step.title}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="mt-2 flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label="Routepunt eerder"><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === route.markers.length - 1} onClick={() => reorder(index, 1)} aria-label="Routepunt later"><ArrowDown className="h-3.5 w-3.5" /></Button></div>
        </div>
      ))}
      {!route.markers.length && <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center"><MapPin className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-medium">Nog geen routepunten</p><p className="mt-1 text-[11px] text-muted-foreground">Klik in de plattegrond om de voorgestelde loopvolgorde vast te leggen.</p></div>}
    </div>
  );
}

export default function SecurityPlanRouteEditor({ revision, floorplans = [], sections = [], instructionBlocks = [], onChange, onUpsertSection, onArchiveSection, sectionPending = false }) {
  const route = normalizeRouteOverlay(revision.route_overlay);
  const selectedFloorplan = floorplans.find(item => item.id === revision.floorplan_id) || null;
  const [previewState, setImageRatio] = useFloorplanPreview(selectedFloorplan);
  const [drawMode, setDrawMode] = useState("route");
  const [drawingSectionId, setDrawingSectionId] = useState("");
  const drawingSection = sections.find(section => section.id === drawingSectionId) || null;
  const [polygonPoints, setPolygonPoints] = useState([]);
  const steps = useMemo(() => instructionBlocks.flatMap(block => block.steps || []), [instructionBlocks]);
  useEffect(() => {
    setPolygonPoints(drawingSection?.geometry?.type === "polygon" ? drawingSection.geometry.points || [] : []);
  }, [drawingSection?.id, drawingSection?.geometry]);
  const chooseFloorplan = id => {
    const floorplan = floorplans.find(item => item.id === id) || null;
    if (route.path.length && floorplan?.id !== revision.floorplan_id && !window.confirm("De bestaande routepunten blijven op dezelfde relatieve positie staan. Plattegrond toch wisselen?")) return;
    onChange({ ...revision, floorplan_id: floorplan?.id || null, floorplan_revision: floorplan?.revision || null });
  };
  const updateSelection = (defaultIds, allowedIds, policy = revision.section_policy) => onChange({ ...revision, section_policy: policy, default_section_ids: defaultIds, allowed_section_ids: policy === "fixed" ? defaultIds : allowedIds });
  const saveSectionGeometry = async () => {
    if (!drawingSection || !selectedFloorplan || polygonPoints.length < 3) return;
    await onUpsertSection(drawingSection, {
      code: drawingSection.code,
      name: drawingSection.name,
      description: drawingSection.description,
      floorplan_id: selectedFloorplan.id,
      floorplan_revision: selectedFloorplan.revision || 1,
      geometry: { type: "polygon", coordinate_space: "normalized", points: polygonPoints.map(point => ({ x: point.x, y: point.y })) },
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <SectionManager sections={sections} floorplan={selectedFloorplan} sectionPolicy={revision.section_policy} defaultSectionIds={revision.default_section_ids || []} allowedSectionIds={revision.allowed_section_ids || []} onSelectionChange={updateSelection} onUpsert={onUpsertSection} onArchive={onArchiveSection} pending={sectionPending} />
      <section className="space-y-4 rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><h3 className="text-sm font-semibold">Plattegrondontwerp</h3><p className="mt-1 max-w-2xl text-xs text-muted-foreground">Teken apart waar een sectie ligt en in welke volgorde de beveiliger loopt. Een route is nuttig, maar niet verplicht om het plan te publiceren.</p></div>
          <div className="w-full space-y-1.5 md:w-80"><Label className="text-xs font-semibold">Plattegrondrevisie</Label><Select value={selectedFloorplan?.id || "none"} onValueChange={value => chooseFloorplan(value === "none" ? null : value)}><SelectTrigger><SelectValue placeholder="Kies een plattegrond" /></SelectTrigger><SelectContent><SelectItem value="none">Geen plattegrond gekoppeld</SelectItem>{floorplans.map(floorplan => <SelectItem key={floorplan.id} value={floorplan.id}>{floorplanLabel(floorplan)}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/15 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-lg border border-border/70 bg-background/60 p-1">
            <button type="button" onClick={() => setDrawMode("route")} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${drawMode === "route" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Route className="h-3.5 w-3.5" /> Looproute</button>
            <button type="button" onClick={() => setDrawMode("section")} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${drawMode === "section" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><MousePointer2 className="h-3.5 w-3.5" /> Sectiegebied</button>
          </div>
          {drawMode === "route" ? <p className="text-xs text-muted-foreground">Klik punten in de gewenste loopvolgorde.</p> : <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"><div className="w-full sm:max-w-xs"><Select value={drawingSectionId || "none"} onValueChange={value => setDrawingSectionId(value === "none" ? "" : value)}><SelectTrigger className="h-9"><SelectValue placeholder="Kies de sectie om in te tekenen" /></SelectTrigger><SelectContent><SelectItem value="none">Kies een objectsectie</SelectItem>{sections.map(section => <SelectItem key={section.id} value={section.id}>{section.code} · {section.name}</SelectItem>)}</SelectContent></Select></div><Button type="button" variant="outline" size="sm" disabled={!polygonPoints.length || sectionPending} onClick={() => setPolygonPoints(points => points.slice(0, -1))}><Undo2 className="h-3.5 w-3.5" /> Laatste punt</Button><Button type="button" size="sm" disabled={!drawingSection || !selectedFloorplan || polygonPoints.length < 3 || sectionPending} onClick={saveSectionGeometry}>{sectionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />} Sectiegebied opslaan</Button></div>}
        </div>
        {!floorplans.length ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 text-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nog geen objectplattegrond beschikbaar</p><p className="mt-1 max-w-md text-xs text-muted-foreground">U kunt het plan zonder route publiceren. Zodra een plattegrond is gepubliceerd, kunt u hier secties en een looproute intekenen.</p></div> : !selectedFloorplan ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 text-center"><Route className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Kies een plattegrondrevisie</p><p className="mt-1 max-w-md text-xs text-muted-foreground">Sectiegebieden en routes blijven bewust aan deze specifieke revisie gekoppeld.</p></div> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]"><RouteCanvas floorplan={selectedFloorplan} previewState={previewState} onImageRatio={setImageRatio} route={route} onChange={next => onChange({ ...revision, route_overlay: next })} mode={drawMode} sections={sections} drawingSection={drawingSection} polygonPoints={polygonPoints} onPolygonChange={setPolygonPoints} /><div className="min-w-0">{drawMode === "route" ? <><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold">Routevolgorde</p><Badge variant="outline">{route.markers.length} punten</Badge></div><RoutePointList route={route} sections={sections} steps={steps} onChange={next => onChange({ ...revision, route_overlay: next })} /></> : <div className="rounded-lg border border-border/70 bg-muted/10 p-4"><p className="text-xs font-semibold">{drawingSection ? `${drawingSection.code} · ${drawingSection.name}` : "Geen sectie geselecteerd"}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{drawingSection ? `Klik minimaal drie hoekpunten rond het gebied. De punten worden opgeslagen op plattegrondrevisie ${selectedFloorplan.revision || 1}.` : "Kies hierboven eerst de objectsectie waarvan u het gebied wilt vastleggen."}</p>{drawingSection && <div className="mt-3 flex items-center gap-2"><Badge variant="outline">{polygonPoints.length} hoekpunten</Badge>{drawingSection.geometry && <Badge variant="outline" className="border-emerald-300/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">Gebied opgeslagen</Badge>}</div>}</div>}</div></div>}
      </section>
    </div>
  );
}

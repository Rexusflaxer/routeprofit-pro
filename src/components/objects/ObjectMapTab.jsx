import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Check,
  CircleOff,
  Eraser,
  Info,
  Loader2,
  Map as MapIcon,
  MousePointer2,
  PencilRuler,
  Redo2,
  RefreshCw,
  RotateCcw,
  Satellite,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { trustedObjectCoordinatePair } from "@/lib/coordinates";
import ObjectMapCanvas from "./ObjectMapCanvas";
import {
  appendPolygon,
  emptyFeatureCollection,
  featureCollectionAreaSquareMeters,
  featureSourceId,
  normalizeFeatureCollection,
  removeFeature,
  replaceVertex,
  suggestAutomaticBuildingIds,
} from "./objectMapGeometry";
import {
  createObjectMapMutationKey,
  getObjectMapConfiguration,
  listObjectBuildingCandidates,
  listObjectParcelCandidates,
  updateObjectMapConfiguration,
} from "./objectMapWorkflow";
import { useObjectModuleNavigationGuard } from "./useObjectModuleNavigationGuard";

const STATUS = {
  unconfigured: { label: "Niet ingesteld", className: "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:text-slate-200" },
  configured: { label: "Actief", className: "border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  needs_review: { label: "Controle nodig", className: "border-amber-300/70 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

function formatDateTime(value) {
  if (!value) return "Nog niet opgeslagen";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(date);
}

function formatArea(value) {
  const area = Math.max(0, Number(value) || 0);
  if (area >= 10000) return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(area / 10000)} ha`;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(area)} m²`;
}

function mapForm(configuration, object) {
  const showOnMobileMap = typeof configuration?.show_on_mobile_map === "boolean"
    ? configuration.show_on_mobile_map
    : typeof object?.show_on_mobile_map === "boolean"
      ? object.show_on_mobile_map
      : true;
  return {
    expected_version: Number(configuration?.expected_version ?? 0),
    building_selection_mode: configuration?.building_selection_mode === "manual" ? "manual" : "automatic",
    selected_bag_feature_ids: [...(configuration?.selected_bag_feature_ids || [])].sort(),
    building_selection_points: configuration?.building_selection_points || [],
    persisted_building_geojson: normalizeFeatureCollection(configuration?.building_polygon_geojson),
    manual_building_geojson: normalizeFeatureCollection(configuration?.manual_building_geojson),
    object_area_geojson: normalizeFeatureCollection(configuration?.object_area_geojson),
    show_on_mobile_map: showOnMobileMap,
  };
}

function persistedForm(form) {
  if (!form) return null;
  return {
    building_selection_mode: form.building_selection_mode,
    selected_bag_feature_ids: [...form.selected_bag_feature_ids].sort(),
    building_selection_points: form.building_selection_points || [],
    manual_building_geojson: normalizeFeatureCollection(form.manual_building_geojson),
    object_area_geojson: normalizeFeatureCollection(form.object_area_geojson),
    show_on_mobile_map: form.show_on_mobile_map === true,
  };
}

function sameForm(left, right) {
  return JSON.stringify(persistedForm(left)) === JSON.stringify(persistedForm(right));
}

function selectedBuildingCollection(form, candidates, effectiveBagFeatureIds) {
  if (!form) return emptyFeatureCollection();
  const wanted = new Set(effectiveBagFeatureIds || []);
  const byId = new globalThis.Map();
  (candidates || []).forEach(feature => {
    const id = featureSourceId(feature);
    if (wanted.has(id)) byId.set(id, feature);
  });
  normalizeFeatureCollection(form.persisted_building_geojson).features.forEach(feature => {
    const id = featureSourceId(feature);
    if (id && wanted.has(id) && !byId.has(id)) byId.set(id, feature);
  });
  return {
    type: "FeatureCollection",
    features: [
      ...byId.values(),
      ...(form.building_selection_mode === "manual" ? normalizeFeatureCollection(form.manual_building_geojson).features : []),
    ],
  };
}

function candidateLabel(feature) {
  const properties = feature?.properties || {};
  return properties.source_identificatie
    ? `BAG-pand ${properties.source_identificatie}`
    : `Gebouw ${String(featureSourceId(feature)).slice(0, 12)}`;
}

function apiErrorCode(error) {
  return String(error?.details?.code || error?.code || "").trim();
}

function isOverlapError(error) {
  return Number(error?.status) === 409 && apiErrorCode(error) === "building_assignment_overlap_confirmation_required";
}

function overlapConflictFingerprint(error) {
  if (!isOverlapError(error)) return null;
  const fingerprint = error?.details?.conflict_fingerprint;
  return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : null;
}

function isVersionConflictError(error) {
  return Number(error?.status) === 409 && ["", "object_map_version_conflict", "version_conflict"].includes(apiErrorCode(error));
}

function hasVersionDrift(base, latestConfiguration) {
  if (!base || !latestConfiguration) return false;
  const baseVersion = Number(base.expected_version);
  const latestVersion = Number(latestConfiguration.expected_version);
  return Number.isInteger(baseVersion) && Number.isInteger(latestVersion) && baseVersion !== latestVersion;
}

function ErrorPanel({ error, onRetry, title }) {
  return (
    <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error?.message || "Probeer het opnieuw."}</p>
          {(error?.status || error?.requestId) && <p className="mt-1 text-[11px] text-muted-foreground">{[error.status && `Status ${error.status}`, error.requestId && `Referentie ${error.requestId}`].filter(Boolean).join(" · ")}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>
      </div>
    </div>
  );
}

function ChoiceCard({ active, icon: Icon, title, description, onClick, disabled }) {
  return (
    <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary/60 bg-primary/10 shadow-sm" : "border-border/70 bg-background/35 hover:border-primary/30 hover:bg-background/55"} disabled:cursor-not-allowed disabled:opacity-60`}>
      <span className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-primary/30 bg-primary/15 text-primary" : "border-border/70 bg-card/50 text-muted-foreground"}`}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold text-foreground">{title}{active && <Check className="h-3.5 w-3.5 text-primary" />}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
      </span>
    </button>
  );
}

export default function ObjectMapTab({ object, onRegisterNavigationGuard }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState("buildings");
  const [mapView, setMapView] = useState("map");
  const [parcelsVisible, setParcelsVisible] = useState(false);
  const [parcelSelectionEnabled, setParcelSelectionEnabled] = useState(false);
  const [form, setForm] = useState(null);
  const [baseForm, setBaseForm] = useState(null);
  const [appliedConfiguration, setAppliedConfiguration] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [drawingTarget, setDrawingTarget] = useState(null);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [editingTarget, setEditingTarget] = useState(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [overlapDialog, setOverlapDialog] = useState(false);
  const [overlapReason, setOverlapReason] = useState("");
  const [overlapFingerprint, setOverlapFingerprint] = useState(null);
  const [serverOverlapConflicts, setServerOverlapConflicts] = useState([]);
  const [conflictNotice, setConflictNotice] = useState(null);
  const [drawingSaveNotice, setDrawingSaveNotice] = useState(false);
  const mutationKeyRef = useRef(null);
  const dragStartRef = useRef(null);
  const baseFormRef = useRef(baseForm);
  const appliedConfigurationRef = useRef(appliedConfiguration);
  const latestConfigurationRef = useRef(null);
  const drawingPointsRef = useRef(drawingPoints);
  const overlapContinuationRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;
  baseFormRef.current = baseForm;
  appliedConfigurationRef.current = appliedConfiguration;
  drawingPointsRef.current = drawingPoints;

  const configurationQuery = useQuery({
    queryKey: ["object-card", object.id, "map-configuration"],
    queryFn: () => getObjectMapConfiguration({ customerId: object.customer_id, objectId: object.id }),
    retry: 1,
  });
  latestConfigurationRef.current = configurationQuery.data;
  const mapObject = useMemo(() => ({ ...object, ...((appliedConfiguration || configurationQuery.data)?.object || {}) }), [appliedConfiguration, configurationQuery.data, object]);
  const verified = Boolean(trustedObjectCoordinatePair(mapObject));
  const archived = mapObject?.status === "archived";
  const readOnly = archived || !verified;
  const candidateConfigurationVersion = appliedConfiguration?.expected_version
    ?? configurationQuery.data?.expected_version
    ?? null;
  const candidatesQuery = useInfiniteQuery({
    queryKey: ["object-card", object.id, "map-building-candidates", candidateConfigurationVersion],
    queryFn: ({ pageParam }) => listObjectBuildingCandidates({ customerId: object.customer_id, objectId: object.id, radiusMeters: 250, limit: 100, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: lastPage => lastPage?.next_cursor && lastPage.next_cursor !== lastPage.cursor
      ? lastPage.next_cursor
      : undefined,
    enabled: verified && Boolean(configurationQuery.data),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const parcelsQuery = useInfiniteQuery({
    queryKey: ["object-card", object.id, "map-parcel-candidates", candidateConfigurationVersion],
    queryFn: ({ pageParam }) => listObjectParcelCandidates({ customerId: object.customer_id, objectId: object.id, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: lastPage => lastPage?.next_cursor && lastPage.next_cursor !== lastPage.cursor ? lastPage.next_cursor : undefined,
    enabled: verified && Boolean(configurationQuery.data) && workspace === "terrain" && parcelsVisible,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const applyConfiguration = useCallback(configuration => {
    const nextObject = { ...object, ...(configuration?.object || {}) };
    const next = mapForm(configuration, nextObject);
    setForm(next);
    setBaseForm(next);
    baseFormRef.current = next;
    setAppliedConfiguration(configuration);
    appliedConfigurationRef.current = configuration;
    setUndoStack([]);
    setRedoStack([]);
    setDrawingTarget(null);
    setDrawingPoints([]);
    setEditingTarget(null);
    setConflictNotice(null);
    setDrawingSaveNotice(false);
    setOverlapReason("");
    setOverlapFingerprint(null);
    setServerOverlapConflicts([]);
    mutationKeyRef.current = null;
  }, [object]);

  useEffect(() => {
    if (!configurationQuery.data || configurationQuery.data === appliedConfigurationRef.current) return;
    const current = formRef.current;
    const baseline = baseFormRef.current;
    const formIsClean = !current || (baseline && sameForm(current, baseline));
    if (formIsClean && drawingPointsRef.current.length === 0) applyConfiguration(configurationQuery.data);
  }, [applyConfiguration, configurationQuery.data]);

  const formDirty = Boolean(form && baseForm && !sameForm(form, baseForm));
  const dirty = formDirty || drawingPoints.length > 0;
  const staleConfiguration = dirty && hasVersionDrift(baseForm, configurationQuery.data);
  const candidatePages = candidatesQuery.data?.pages || [];
  const candidateMetadata = candidatePages.at(-1) || candidatePages[0] || null;
  const candidates = useMemo(() => {
    const byId = new globalThis.Map();
    candidatePages.forEach(page => (page?.items || []).forEach(feature => {
      const id = featureSourceId(feature);
      if (id) byId.set(id, feature);
    }));
    return [...byId.values()];
  }, [candidatePages]);
  const parcelCandidates = useMemo(() => {
    const selectedIds = new Set(normalizeFeatureCollection(form?.object_area_geojson).features
      .filter(feature => feature.properties?.derived_from === "pdok_brk")
      .map(feature => feature.properties.derived_from_id));
    const byId = new Map();
    (parcelsQuery.data?.pages || []).forEach(page => (page?.items || []).forEach(feature => {
      const id = featureSourceId(feature);
      if (id) byId.set(id, { ...feature, properties: { ...feature.properties, loq_selected: selectedIds.has(id) } });
    }));
    return [...byId.values()];
  }, [parcelsQuery.data, form?.object_area_geojson]);
  const automaticBagFeatureIds = useMemo(() => suggestAutomaticBuildingIds(candidates, [mapObject?.longitude, mapObject?.latitude]), [candidates, mapObject?.latitude, mapObject?.longitude]);
  const displayedBagFeatureIds = form?.building_selection_mode === "manual"
    ? form.selected_bag_feature_ids
    : automaticBagFeatureIds;
  const selectedBuildings = useMemo(() => selectedBuildingCollection(form, candidates, displayedBagFeatureIds), [candidates, displayedBagFeatureIds, form]);
  const terrainArea = featureCollectionAreaSquareMeters(form?.object_area_geojson);
  const buildingArea = featureCollectionAreaSquareMeters(selectedBuildings);
  const selectedCandidates = useMemo(() => {
    const ids = new Set(form?.selected_bag_feature_ids || []);
    return candidates.filter(feature => ids.has(featureSourceId(feature)));
  }, [candidates, form?.selected_bag_feature_ids]);
  const candidateConflicts = useMemo(() => selectedCandidates.filter(feature => Number(feature.properties?.conflict_count || 0) > 0), [selectedCandidates]);
  const conflictingFeatureIds = useMemo(() => {
    const ids = new Set(candidateConflicts.map(featureSourceId));
    const selectedIds = new Set(form?.selected_bag_feature_ids || []);
    (appliedConfiguration?.conflicts || []).forEach(conflict => {
      const id = String(conflict?.source_feature_id || "");
      if (selectedIds.has(id)) ids.add(id);
    });
    return ids;
  }, [appliedConfiguration?.conflicts, candidateConflicts, form?.selected_bag_feature_ids]);
  const newlyConflictingFeatureIds = useMemo(() => {
    const previouslySelected = new Set(baseForm?.selected_bag_feature_ids || []);
    return new Set([...conflictingFeatureIds].filter(id => !previouslySelected.has(id)));
  }, [baseForm?.selected_bag_feature_ids, conflictingFeatureIds]);
  const allConflicts = useMemo(() => {
    const ids = new Set(newlyConflictingFeatureIds);
    serverOverlapConflicts.forEach((conflict, index) => {
      ids.add(String(conflict?.source_feature_id || `server-conflict-${index}`));
    });
    return ids.size;
  }, [newlyConflictingFeatureIds, serverOverlapConflicts]);
  const overlapObjects = useMemo(() => {
    const objects = [
      ...candidateConflicts
        .filter(feature => newlyConflictingFeatureIds.has(featureSourceId(feature)))
        .flatMap(feature => feature.properties?.conflicts || []),
      ...serverOverlapConflicts.flatMap(conflict => conflict?.objects || []),
    ];
    const byId = new globalThis.Map();
    objects.forEach((conflictObject, index) => {
      const key = String(conflictObject?.object_id || conflictObject?.object_name || `conflict-object-${index}`);
      if (!byId.has(key)) byId.set(key, conflictObject);
    });
    return [...byId.values()];
  }, [candidateConflicts, newlyConflictingFeatureIds, serverOverlapConflicts]);

  const updateWithHistory = useCallback(updater => {
    setForm(current => {
      if (!current) return current;
      const next = updater(current);
      if (sameForm(current, next)) return current;
      setUndoStack(stack => [...stack, current].slice(-50));
      setRedoStack([]);
      setDrawingSaveNotice(false);
      setOverlapReason("");
      setOverlapFingerprint(null);
      setServerOverlapConflicts([]);
      mutationKeyRef.current = null;
      return next;
    });
  }, []);

  const undo = () => {
    if (drawingPoints.length) {
      setDrawingPoints(points => points.slice(0, -1));
      return;
    }
    setUndoStack(stack => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack(redos => [formRef.current, ...redos].slice(0, 50));
      setForm(previous);
      setOverlapReason("");
      setOverlapFingerprint(null);
      setServerOverlapConflicts([]);
      mutationKeyRef.current = null;
      return stack.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStack(stack => {
      if (!stack.length) return stack;
      const next = stack[0];
      setUndoStack(undos => [...undos, formRef.current].slice(-50));
      setForm(next);
      setOverlapReason("");
      setOverlapFingerprint(null);
      setServerOverlapConflicts([]);
      mutationKeyRef.current = null;
      return stack.slice(1);
    });
  };

  const discard = useCallback(() => {
    if (baseForm) {
      setForm(baseForm);
      setUndoStack([]);
      setRedoStack([]);
      setDrawingTarget(null);
      setDrawingPoints([]);
      setEditingTarget(null);
      setConflictNotice(null);
      setDrawingSaveNotice(false);
      setOverlapReason("");
      setOverlapFingerprint(null);
      setServerOverlapConflicts([]);
      mutationKeyRef.current = null;
    }
  }, [baseForm]);

  /** @type {(variables: {reason?: string, conflictFingerprint?: string | null}) => Promise<any>} */
  const saveMapConfiguration = variables => {
      const reason = String(variables?.reason || "");
      const conflictFingerprint = variables?.conflictFingerprint || null;
      return updateObjectMapConfiguration({
        customerId: object.customer_id,
        objectId: object.id,
        expectedVersion: baseFormRef.current?.expected_version,
        idempotencyKey: mutationKeyRef.current || createObjectMapMutationKey(),
        data: {
          ...persistedForm(formRef.current),
          ...(reason && conflictFingerprint ? { overlap_confirmation: { confirmed: true, reason, conflict_fingerprint: conflictFingerprint } } : {}),
        },
      });
  };
  const saveMutation = useMutation({
    mutationFn: saveMapConfiguration,
  });

  const saveNow = useCallback(async (reason, conflictFingerprint = null) => {
    if (!formRef.current || readOnly) return;
    if (hasVersionDrift(baseFormRef.current, latestConfigurationRef.current)) {
      const staleError = Object.assign(new Error("Er staat inmiddels een nieuwere kaartconfiguratie klaar."), {
        status: 409,
        code: "object_map_version_conflict",
      });
      setConflictNotice(staleError);
      throw staleError;
    }
    mutationKeyRef.current ||= createObjectMapMutationKey();
    setConflictNotice(null);
    if (!conflictFingerprint) setOverlapFingerprint(null);
    try {
      const saved = await saveMutation.mutateAsync({ reason: reason || "", conflictFingerprint });
      applyConfiguration(saved);
      queryClient.setQueryData(["object-card", object.id, "map-configuration"], saved);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["objects", "detail", object.id] }),
        queryClient.invalidateQueries({ queryKey: ["objects"] }),
        queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-dossier", object.customer_id, "SurveillanceObject"] }),
      ]);
      toast({ title: "Kaart en terrein toegepast", description: "De mobiele app ontvangt deze inrichting bij de volgende synchronisatie." });
    } catch (error) {
      if (isOverlapError(error)) {
        const nextFingerprint = overlapConflictFingerprint(error);
        setServerOverlapConflicts(Array.isArray(error?.details?.conflicts) ? error.details.conflicts : []);
        setOverlapFingerprint(nextFingerprint);
        setOverlapReason("");
        setConflictNotice(null);
        mutationKeyRef.current = null;
      } else if (isVersionConflictError(error)) {
        setOverlapFingerprint(null);
        setOverlapReason("");
        setConflictNotice(error);
        mutationKeyRef.current = null;
      } else {
        setOverlapFingerprint(null);
        setOverlapReason("");
      }
      throw error;
    }
  }, [applyConfiguration, object.customer_id, object.id, queryClient, readOnly, saveMutation, toast]);

  const openOverlapDialog = useCallback(fingerprint => {
    if (!fingerprint) return false;
    setOverlapFingerprint(fingerprint);
    setOverlapReason("");
    setOverlapDialog(true);
    return true;
  }, []);

  const requestOverlapConfirmationForNavigation = useCallback(fingerprint => new Promise((resolve, reject) => {
    if (!fingerprint) {
      reject(new Error("De conflictbevestiging ontbreekt. Probeer de wijziging opnieuw."));
      return;
    }
    overlapContinuationRef.current?.reject?.(new Error("De eerdere overlapbevestiging is vervangen."));
    overlapContinuationRef.current = { resolve, reject };
    openOverlapDialog(fingerprint);
  }), [openOverlapDialog]);

  const requestSave = async () => {
    if (drawingPointsRef.current.length > 0) {
      setDrawingSaveNotice(true);
      return;
    }
    if (staleConfiguration) {
      setConflictNotice(Object.assign(new Error("Er is een nieuwere kaartconfiguratie beschikbaar."), { status: 409, code: "object_map_version_conflict" }));
      return;
    }
    try {
      await saveNow();
    } catch (error) {
      const fingerprint = overlapConflictFingerprint(error);
      if (fingerprint) openOverlapDialog(fingerprint);
      // Mutation error remains visible in the workspace.
    }
  };

  const navigation = useObjectModuleNavigationGuard({
    dirty,
    moduleName: "Kaart & terrein",
    onSave: async () => {
      if (drawingPointsRef.current.length > 0) {
        setDrawingSaveNotice(true);
        throw new Error("Sluit of annuleer eerst het vlak dat u tekent.");
      }
      if (hasVersionDrift(baseFormRef.current, latestConfigurationRef.current)) {
        setConflictNotice(Object.assign(new Error("Er is een nieuwere kaartconfiguratie beschikbaar."), { status: 409, code: "object_map_version_conflict" }));
        throw new Error("Laad eerst de actuele kaartconfiguratie.");
      }
      try {
        await saveNow();
      } catch (error) {
        if (!isOverlapError(error)) throw error;
        await requestOverlapConfirmationForNavigation(overlapConflictFingerprint(error));
      }
    },
    onDiscard: discard,
    saving: saveMutation.isPending,
    onRegisterNavigationGuard,
  });

  const notifyBuildingMatchUnavailable = useCallback(message => {
    toast({
      title: "Gebouwselectie controleren",
      description: typeof message === "string" ? message : "Klik nogmaals op het gebouw van bovenaf. Zo bewaren we precies jouw gekozen plek, ook zonder BAG-koppeling.",
    });
  }, [toast]);

  const toggleBuildingPoint = point => {
    if (readOnly || !point?.id) return;
    updateWithHistory(current => {
      const points = current.building_selection_points || [];
      return {
        ...current,
        building_selection_mode: "manual",
        selected_bag_feature_ids: current.building_selection_mode === "automatic" ? automaticBagFeatureIds : current.selected_bag_feature_ids,
        building_selection_points: points.some(item => item.id === point.id)
          ? points.filter(item => item.id !== point.id)
          : [...points, point],
      };
    });
  };

  const toggleParcel = id => {
    if (readOnly || drawingTarget || editingTarget) return;
    const parcel = parcelCandidates.find(feature => featureSourceId(feature) === id);
    if (!parcel) return;
    updateWithHistory(current => {
      const features = normalizeFeatureCollection(current.object_area_geojson).features;
      const existing = features.find(feature => feature.properties?.derived_from === "pdok_brk" && feature.properties?.derived_from_id === id);
      const next = existing
        ? features.filter(feature => feature !== existing)
        : [...features, {
          type: "Feature",
          id: `terrain:${globalThis.crypto.randomUUID()}`,
          properties: { source: "user_drawn", derived_from: "pdok_brk", derived_from_id: id },
          geometry: JSON.parse(JSON.stringify(parcel.geometry)),
        }];
      return { ...current, object_area_geojson: { type: "FeatureCollection", features: next } };
    });
  };

  const toggleCandidate = sourceId => {
    if (!sourceId || readOnly) return;
    updateWithHistory(current => {
      const ids = new Set(current.building_selection_mode === "automatic"
        ? automaticBagFeatureIds
        : current.selected_bag_feature_ids || []);
      if (ids.has(sourceId)) ids.delete(sourceId);
      else ids.add(sourceId);
      return { ...current, building_selection_mode: "manual", selected_bag_feature_ids: [...ids].sort() };
    });
  };

  const startDrawing = target => {
    if (readOnly || target !== "terrain") return;
    setDrawingSaveNotice(false);
    setOverlapReason("");
    setOverlapFingerprint(null);
    setServerOverlapConflicts([]);
    setDrawingTarget(target);
    setDrawingPoints([]);
    setEditingTarget(null);
    setParcelSelectionEnabled(false);
  };
  const finishDrawing = () => {
    if (!drawingTarget || drawingPoints.length < 3) return;
    const featureId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    updateWithHistory(current => ({ ...current, object_area_geojson: appendPolygon(current.object_area_geojson, drawingPoints, { source: "user_drawn", local_id: `terrain:${featureId}` }) }));
    setDrawingTarget(null);
    setDrawingPoints([]);
    setDrawingSaveNotice(false);
  };
  const cancelDrawing = () => { setDrawingTarget(null); setDrawingPoints([]); setDrawingSaveNotice(false); };

  const switchWorkspace = nextWorkspace => {
    if (nextWorkspace === workspace) return;
    if (drawingPoints.length > 0) {
      setDrawingSaveNotice(true);
      return;
    }
    setWorkspace(nextWorkspace);
    setParcelSelectionEnabled(false);
    if (nextWorkspace === "terrain") {
      setParcelsVisible(true);
      setMapView("satellite");
    } else {
      setMapView("map");
    }
    cancelDrawing();
    setEditingTarget(null);
  };

  const startVertexDrag = () => { dragStartRef.current = formRef.current; };
  const moveVertex = (target, reference, coordinate) => {
    if (target !== "terrain") return;
    mutationKeyRef.current = null;
    setOverlapReason("");
    setOverlapFingerprint(null);
    setServerOverlapConflicts([]);
    setForm(current => ({ ...current, object_area_geojson: replaceVertex(current.object_area_geojson, reference, coordinate) }));
  };
  const finishVertexDrag = () => {
    const before = dragStartRef.current;
    dragStartRef.current = null;
    if (!before || sameForm(before, formRef.current)) return;
    setUndoStack(stack => [...stack, before].slice(-50));
    setRedoStack([]);
  };

  const reloadCurrentConfiguration = async () => {
    const configurationResult = await configurationQuery.refetch();
    if (configurationResult.data && !configurationResult.error) {
      applyConfiguration(configurationResult.data);
      try {
        await candidatesQuery.refetch();
      } catch {
        // De actuele configuratie is leidend; BAG-kandidaten zijn best-effort.
      }
    }
  };

  const cancelOverlapDialog = () => {
    if (saveMutation.isPending) return;
    const continuation = overlapContinuationRef.current;
    overlapContinuationRef.current = null;
    setOverlapDialog(false);
    setOverlapReason("");
    setOverlapFingerprint(null);
    continuation?.reject?.(new Error("De overlapbevestiging is geannuleerd."));
  };

  const confirmOverlapDialog = async () => {
    const reason = overlapReason.trim();
    const fingerprint = overlapFingerprint;
    if (reason.length < 3 || !fingerprint) return;
    try {
      await saveNow(reason, fingerprint);
      const continuation = overlapContinuationRef.current;
      overlapContinuationRef.current = null;
      setOverlapDialog(false);
      setOverlapReason("");
      setOverlapFingerprint(null);
      continuation?.resolve?.();
    } catch (error) {
      if (overlapConflictFingerprint(error)) return;
      const continuation = overlapContinuationRef.current;
      overlapContinuationRef.current = null;
      setOverlapDialog(false);
      setOverlapReason("");
      setOverlapFingerprint(null);
      continuation?.reject?.(error);
    }
  };

  if (configurationQuery.isError && !configurationQuery.data && !form) {
    return <div className="min-h-[620px]"><ErrorPanel title="Kaart en terrein konden niet worden geladen." error={configurationQuery.error} onRetry={() => configurationQuery.refetch()} /></div>;
  }
  if (configurationQuery.isLoading || !form || !appliedConfiguration) {
    return <div className="flex min-h-[620px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaartconfiguratie laden...</div>;
  }

  const status = STATUS[appliedConfiguration.map_geometry_status] || STATUS.unconfigured;
  const disabledReason = archived
    ? "Dit object is gearchiveerd. De kaartconfiguratie is alleen-lezen."
    : !verified
      ? "Controleer en bevestig eerst het objectadres. Daarna kunnen gebouwen en terrein veilig worden gekoppeld."
      : null;

  return (
    <div className="flex min-h-[700px] flex-col bg-card/30 backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/30 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-foreground">Kaart & terrein</h2><Badge variant="outline" className={status.className}>{status.label}</Badge>{dirty && <Badge variant="outline" className="border-blue-300/70 bg-blue-500/10 text-blue-700 dark:text-blue-300">Niet opgeslagen</Badge>}</div>
          <p className="mt-1 text-xs text-muted-foreground">Selecteer de gebouwen die bij dit object horen en leg het te bewaken terrein vast.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setFocusNonce(value => value + 1)}><MapIcon className="h-4 w-4" /> Passend tonen</Button>
          <Button type="button" size="sm" onClick={requestSave} disabled={readOnly || !dirty || saveMutation.isPending || Boolean(drawingTarget) || staleConfiguration}>{saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Opslaan en toepassen</Button>
        </div>
      </div>

      {disabledReason && <div className="m-4 mb-0 flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>{disabledReason}</p></div>}
      {appliedConfiguration.map_geometry_status === "needs_review" && <div className="m-4 mb-0 flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="font-medium">Controleer deze kaart opnieuw</p><p className="mt-0.5 text-xs text-muted-foreground">{["location_changed", "object_location_changed"].includes(appliedConfiguration.map_geometry_review_reason) ? "Het objectadres of de locatie is gewijzigd." : "De opgeslagen geometrie vraagt om een nieuwe controle."} Sla de gecontroleerde inrichting opnieuw op voordat mobiele kaartweergave wordt geactiveerd.</p></div></div>}
      {(configurationQuery.isRefetchError || (configurationQuery.error && configurationQuery.data)) && <ErrorPanel title="De opgeslagen kaart blijft zichtbaar, maar vernieuwen is mislukt." error={configurationQuery.error} onRetry={() => configurationQuery.refetch()} />}
      {(conflictNotice || staleConfiguration) && <div className="m-4 mb-0 rounded-xl border border-destructive/30 bg-destructive/10 p-4"><p className="text-sm font-medium text-destructive">De kaart is ondertussen door iemand anders gewijzigd.</p><p className="mt-1 text-xs text-muted-foreground">Uw lokale wijzigingen zijn niet overschreven. Laad de actuele versie en pas ze daarna opnieuw toe.</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={reloadCurrentConfiguration}><RefreshCw className="h-4 w-4" /> Actuele versie laden</Button></div>}
      {drawingSaveNotice && <div className="m-4 mb-0 flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm"><PencilRuler className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="font-medium">Maak het getekende vlak eerst af</p><p className="mt-0.5 text-xs text-muted-foreground">Sluit het vlak met minimaal drie hoekpunten, of kies Annuleren. Daarna kunt u opslaan of verder navigeren.</p></div></div>}
      {saveMutation.isError && (!isOverlapError(saveMutation.error) || !overlapConflictFingerprint(saveMutation.error)) && !conflictNotice && !staleConfiguration && !overlapDialog && <ErrorPanel title="Kaart en terrein konden niet worden opgeslagen." error={saveMutation.error} onRetry={requestSave} />}

      <div className="border-b border-border/70 px-4 pt-3">
        <div className="flex gap-1" role="tablist" aria-label="Kaartwerkruimte">
          <button type="button" role="tab" aria-selected={workspace === "buildings"} onClick={() => switchWorkspace("buildings")} className={`border-b-2 px-4 py-2 text-sm font-medium ${workspace === "buildings" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Building2 className="mr-2 inline h-4 w-4" />Gebouwen</button>
          <button type="button" role="tab" aria-selected={workspace === "terrain"} onClick={() => switchWorkspace("terrain")} className={`border-b-2 px-4 py-2 text-sm font-medium ${workspace === "terrain" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><PencilRuler className="mr-2 inline h-4 w-4" />Terrein</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/35 p-2 backdrop-blur-xl">
            {workspace === "buildings" ? <>
              <Button type="button" size="sm" variant="secondary" disabled={readOnly}><MousePointer2 className="h-4 w-4" /> Selecteren</Button>
              <span className="px-2 text-xs text-muted-foreground">Klik op een 3D-gebouw om het toe te voegen of te verwijderen.</span>
            </> : <>
              <Button type="button" size="sm" variant={parcelSelectionEnabled ? "secondary" : "ghost"} onClick={() => { cancelDrawing(); setEditingTarget(null); setParcelsVisible(true); setParcelSelectionEnabled(value => !value); }} disabled={readOnly || drawingPoints.length > 0}><MousePointer2 className="h-4 w-4" /> Perceel kiezen</Button>
              <Button type="button" size="sm" variant={drawingTarget === "terrain" ? "secondary" : "ghost"} onClick={() => startDrawing("terrain")} disabled={readOnly || drawingPoints.length > 0}><PencilRuler className="h-4 w-4" /> Zelf tekenen</Button>
              <Button type="button" size="sm" variant={editingTarget === "terrain" ? "secondary" : "ghost"} onClick={() => { cancelDrawing(); setParcelSelectionEnabled(false); setEditingTarget(value => value === "terrain" ? null : "terrain"); }} disabled={readOnly || drawingPoints.length > 0 || !form.object_area_geojson.features.length}><MousePointer2 className="h-4 w-4" /> Grens aanpassen</Button>
            </>}
            <span className="mx-1 h-6 w-px bg-border/70" />
            <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={readOnly || (!undoStack.length && !drawingPoints.length)} aria-label="Wijziging ongedaan maken"><Undo2 className="h-4 w-4" /> Ongedaan</Button>
            <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={readOnly || !redoStack.length || Boolean(drawingTarget)} aria-label="Wijziging opnieuw uitvoeren"><Redo2 className="h-4 w-4" /> Opnieuw</Button>
            {drawingTarget && <div className="ml-auto flex gap-2"><Button type="button" size="sm" variant="outline" onClick={cancelDrawing}>Annuleren</Button><Button type="button" size="sm" onClick={finishDrawing} disabled={drawingPoints.length < 3}>Vlak sluiten ({drawingPoints.length}/3)</Button></div>}
          </div>
          {workspace === "terrain" && <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg border border-border/70 bg-card/35 p-1" role="group" aria-label="Kaartweergave">
              <Button type="button" size="sm" variant={mapView === "map" ? "secondary" : "ghost"} aria-pressed={mapView === "map"} onClick={() => setMapView("map")}><MapIcon className="h-4 w-4" /> Kaart</Button>
              <Button type="button" size="sm" variant={mapView === "satellite" ? "secondary" : "ghost"} aria-pressed={mapView === "satellite"} onClick={() => setMapView("satellite")}><Satellite className="h-4 w-4" /> Luchtfoto</Button>
            </div>
            {workspace === "terrain" && <Label className="flex items-center gap-2 text-xs"><Switch aria-label="Kadastrale perceelgrenzen tonen" checked={parcelsVisible} onCheckedChange={value => { setParcelsVisible(value); if (!value) setParcelSelectionEnabled(false); }} /> Perceelgrenzen</Label>}
          </div>}
          {workspace === "terrain" && <p className="text-xs leading-relaxed text-muted-foreground">{drawingTarget ? "Klik voor ieder hoekpunt. Klik op het eerste punt of druk Enter om af te sluiten. Backspace verwijdert het laatste punt; Escape annuleert. Je kunt tussendoor van kaartweergave wisselen." : editingTarget ? "Sleep de hoekpunten om de grens nauwkeurig aan te passen. Ongedaan herstelt je vorige wijziging." : "Kies één of meer percelen als startpunt, of teken zelf. Pas de grens aan aan het gebied dat jullie daadwerkelijk bewaken."}</p>}
          {workspace === "terrain" && parcelsVisible && parcelsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Kadastrale percelen laden…</p>}
          {workspace === "terrain" && parcelsVisible && parcelsQuery.isError && <ErrorPanel title="Perceelgrenzen konden niet worden geladen. Je bestaande terrein blijft bewaard; zelf tekenen blijft mogelijk." error={parcelsQuery.error} onRetry={() => parcelsQuery.isFetchNextPageError ? parcelsQuery.fetchNextPage() : parcelsQuery.refetch()} />}
          {workspace === "terrain" && parcelsVisible && parcelsQuery.hasNextPage && <Button type="button" size="sm" variant="outline" disabled={parcelsQuery.isFetchingNextPage} onClick={() => parcelsQuery.fetchNextPage()}>{parcelsQuery.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Meer percelen laden</Button>}
          {candidatesQuery.isError && !candidatesQuery.data && workspace === "buildings" && <ErrorPanel title="BAG-gebouwen konden niet worden geladen." error={candidatesQuery.error} onRetry={() => candidatesQuery.refetch()} />}
          {candidatesQuery.isFetchNextPageError && workspace === "buildings" && <ErrorPanel title="Meer BAG-gebouwen konden niet worden geladen." error={candidatesQuery.error} onRetry={() => candidatesQuery.fetchNextPage()} />}
          {candidatesQuery.isRefetchError && candidatesQuery.data && !candidatesQuery.isFetchNextPageError && workspace === "buildings" && <ErrorPanel title="De geladen BAG-gebouwen blijven zichtbaar, maar vernieuwen is mislukt." error={candidatesQuery.error} onRetry={() => candidatesQuery.refetch()} />}
          <ObjectMapCanvas
            object={mapObject}
            workspace={workspace}
            mapView={mapView}
            parcelCandidates={parcelCandidates}
            parcelsVisible={parcelsVisible}
            parcelSelectionEnabled={parcelSelectionEnabled}
            onToggleParcel={toggleParcel}
            buildingSelectionPoints={form.building_selection_mode === "manual" ? form.building_selection_points : []}
            onToggleBuildingPoint={toggleBuildingPoint}
            candidates={candidates}
            selectedBagFeatureIds={displayedBagFeatureIds}
            selectedBuildings={selectedBuildings}
            manualBuildings={form.manual_building_geojson}
            terrain={form.object_area_geojson}
            drawingTarget={drawingTarget}
            drawingPoints={drawingPoints}
            editingTarget={editingTarget}
            disabled={readOnly}
            focusNonce={focusNonce}
            onToggleCandidate={toggleCandidate}
            onAddDrawingPoint={coordinate => { setDrawingSaveNotice(false); setOverlapReason(""); setOverlapFingerprint(null); setServerOverlapConflicts([]); setDrawingPoints(points => [...points, coordinate]); }}
            onVertexDragStart={startVertexDrag}
            onMoveVertex={moveVertex}
            onVertexDragEnd={finishVertexDrag}
            onBuildingMatchUnavailable={notifyBuildingMatchUnavailable}
            onFinishDrawing={finishDrawing}
            onCancelDrawing={cancelDrawing}
            onRemoveLastDrawingPoint={() => setDrawingPoints(points => points.slice(0, -1))}
          />
          <p className="text-[11px] text-muted-foreground">3D-gebouwen: Mapbox · gebouwgegevens en perceelgrenzen: Kadaster via PDOK · luchtfoto: PDOK / Beeldmateriaal Nederland.</p>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border border-border/70 bg-card/45 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">Mobiele kaart</p><p className="mt-1 text-xs text-muted-foreground">Toon dit object op de operationele kaart.</p></div><Switch aria-label="Object op mobiele kaart tonen" checked={form.show_on_mobile_map} disabled={readOnly} onCheckedChange={checked => updateWithHistory(current => ({ ...current, show_on_mobile_map: checked === true }))} /></div>
          </section>

          {workspace === "buildings" ? <>
            <section className="space-y-2 rounded-xl border border-border/70 bg-card/45 p-4 backdrop-blur-xl">
              <div><p className="text-sm font-semibold">Bepaling van gebouwen</p><p className="mt-1 text-xs text-muted-foreground">Handmatig voorkomt verkeerde markeringen bij gedeelde adressen.</p></div>
              <ChoiceCard active={form.building_selection_mode === "automatic"} icon={RotateCcw} title="Automatisch bepalen" description="Gebruik de bestaande adresnabijheid zolang geen exacte selectie nodig is." disabled={readOnly} onClick={() => updateWithHistory(current => ({ ...current, building_selection_mode: "automatic", selected_bag_feature_ids: [], building_selection_points: [], manual_building_geojson: emptyFeatureCollection() }))} />
              <ChoiceCard active={form.building_selection_mode === "manual"} icon={Building2} title="Exact vastleggen" description="Gebruik uitsluitend jouw aangeklikte gebouwen, met of zonder BAG-koppeling." disabled={readOnly} onClick={() => updateWithHistory(current => ({
                ...current,
                building_selection_mode: "manual",
                selected_bag_feature_ids: current.building_selection_mode === "automatic" && !(current.selected_bag_feature_ids || []).length
                  ? automaticBagFeatureIds
                  : current.selected_bag_feature_ids,
              }))} />
              <Button type="button" variant="outline" size="sm" className="w-full" disabled={readOnly} onClick={() => updateWithHistory(current => ({ ...current, building_selection_mode: "manual", selected_bag_feature_ids: [], building_selection_points: [], manual_building_geojson: emptyFeatureCollection() }))}><CircleOff className="h-4 w-4" /> Bewust geen gebouwen markeren</Button>
            </section>
            <section className="rounded-xl border border-border/70 bg-card/45 backdrop-blur-xl">
              <div className="border-b border-border/70 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{form.building_selection_mode === "automatic" ? "Automatische indicatie" : "Geselecteerde gebouwen"}</p>{form.building_selection_mode === "automatic" && <p className="mt-0.5 text-[11px] text-muted-foreground">Wordt als uitgangspunt gebruikt wanneer u Exact vastleggen kiest.</p>}</div><Badge variant="secondary">{displayedBagFeatureIds.length + (form.building_selection_mode === "manual" ? form.manual_building_geojson.features.length + form.building_selection_points.length : 0)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{candidatesQuery.isLoading ? "Gebouwen rond het object ophalen..." : `${candidates.length} BAG-kandidaten binnen 250 meter geladen`}</p>{candidateMetadata?.has_more && !candidateMetadata?.next_cursor && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Alleen de eerste 100 gebouwen worden getoond; deze bron levert geen geldige vervolgcodelink.</p>}</div>
              <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {!displayedBagFeatureIds.length && !(form.building_selection_mode === "manual" && (form.manual_building_geojson.features.length || form.building_selection_points.length)) && <p className="p-4 text-xs text-muted-foreground">{form.building_selection_mode === "manual" ? "Er wordt bewust geen gebouw gemarkeerd. Klik op een pand op de kaart om het toe te voegen." : candidatesQuery.isLoading ? "Automatische adresnabijheid wordt bepaald…" : "Er is geen passend BAG-pand gevonden; de mobiele app blijft de bestaande adresnabijheid gebruiken."}</p>}
                {displayedBagFeatureIds.map(id => {
                  const feature = candidates.find(item => featureSourceId(item) === id) || appliedConfiguration.building_polygon_geojson.features.find(item => featureSourceId(item) === id);
                  const recordedConflict = [...(appliedConfiguration.conflicts || []), ...serverOverlapConflicts]
                    .find(conflict => String(conflict?.source_feature_id || "") === id);
                  const conflictCount = Math.max(
                    Number(feature?.properties?.conflict_count || 0),
                    Array.isArray(recordedConflict?.objects) ? recordedConflict.objects.length : 0,
                    conflictingFeatureIds.has(id) ? 1 : 0,
                  );
                  return <div key={id} className="flex items-center gap-3 p-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${conflictCount ? "bg-amber-500" : "bg-blue-500"}`} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{feature ? candidateLabel(feature) : `BAG-pand ${id.slice(0, 12)}`}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{conflictCount ? `Gekoppeld aan ${conflictCount} ander object` : form.building_selection_mode === "automatic" ? "Automatisch voorgesteld · PDOK BAG" : "PDOK BAG"}</p></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={readOnly} onClick={() => toggleCandidate(id)} aria-label={`${feature ? candidateLabel(feature) : id} verwijderen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>;
                })}
                {form.building_selection_mode === "manual" && form.building_selection_points.map((point, index) => <div key={point.id} className="flex items-center gap-3 p-3"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">Gebouw {index + 1} · Zonder BAG-koppeling</p><p className="mt-0.5 text-[11px] text-muted-foreground">Eigen kaartselectie · geen bevestigde BAG-koppeling</p></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={readOnly} onClick={() => toggleBuildingPoint(point)} aria-label={`Gebouw zonder BAG-koppeling ${index + 1} verwijderen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}
                {form.building_selection_mode === "manual" && form.manual_building_geojson.features.map((_, index) => <div key={`manual-${index}`} className="flex items-center gap-3 p-3"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">Eerder ingetekend gebouw {index + 1}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Bestaande contour behouden</p></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={readOnly} onClick={() => updateWithHistory(current => ({ ...current, manual_building_geojson: removeFeature(current.manual_building_geojson, index) }))} aria-label={`Eerder ingetekend gebouw ${index + 1} verwijderen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}
              </div>
              {form.building_selection_mode === "manual" && form.building_selection_points.length > 0 && <p className="border-t border-border/70 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Zonder BAG-koppeling bewaren we jouw gekozen plek. Controleer gedeeld gebruik zelf: verschillende selecties in hetzelfde gebouw zijn niet altijd automatisch als overlap herkenbaar.</p>}
              {candidatesQuery.hasNextPage && <div className="border-t border-border/70 p-3"><Button type="button" size="sm" variant="outline" className="w-full" disabled={candidatesQuery.isFetchingNextPage} onClick={() => candidatesQuery.fetchNextPage()}>{candidatesQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Meer gebouwen laden</Button></div>}
              {buildingArea > 0 && <div className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">Oppervlakte bekende gebouwcontouren: {formatArea(buildingArea)}</div>}
            </section>
          </> : <>
            <section className="rounded-xl border border-border/70 bg-card/45 p-4 backdrop-blur-xl">
              <p className="text-sm font-semibold">Begin met een kadastraal perceel</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Via Perceel kiezen neem je een bestaande grens over. Daarna kun je hoekpunten verslepen of meerdere terreindelen toevoegen.</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Een perceel is een hulpmiddel, geen bevestiging van eigendom of bewakingsopdracht. Controleer de grens op de luchtfoto en pas hem zo nodig aan.</p>
              {parcelsQuery.data && <p className="mt-2 text-[11px] text-muted-foreground">{parcelCandidates.length} percelen rond het object geladen · <a className="underline" href="https://www.pdok.nl/introductie/-/article/kadastrale-kaart" target="_blank" rel="noreferrer">PDOK Kadastrale kaart</a></p>}
            </section>
            <section className="rounded-xl border border-border/70 bg-card/45 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Terreinbegrenzing</p><p className="mt-1 text-xs text-muted-foreground">Deze grens staat los van de gebouwselectie en wordt voorbereid voor toekomstige locatieondersteuning.</p></div><Badge variant="secondary">{form.object_area_geojson.features.length} vlak{form.object_area_geojson.features.length === 1 ? "" : "ken"}</Badge></div>
              <div className="mt-4 rounded-lg border border-border/60 bg-background/35 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totale oppervlakte</p><p className="mt-1 text-lg font-semibold">{formatArea(terrainArea)}</p></div>
              <div className="mt-3 space-y-2">{form.object_area_geojson.features.map((_, index) => <div key={`terrain-${index}`} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/35 px-3 py-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span className="flex-1 text-xs font-medium">Terreindeel {index + 1}</span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={readOnly} onClick={() => updateWithHistory(current => ({ ...current, object_area_geojson: removeFeature(current.object_area_geojson, index) }))} aria-label={`Terreindeel ${index + 1} verwijderen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
              {form.object_area_geojson.features.length > 0 && <Button type="button" variant="outline" size="sm" className="mt-3 w-full text-destructive hover:text-destructive" disabled={readOnly} onClick={() => updateWithHistory(current => ({ ...current, object_area_geojson: emptyFeatureCollection() }))}><Eraser className="h-4 w-4" /> Hele terreinbegrenzing wissen</Button>}
            </section>
          </>}

          <section className="rounded-xl border border-border/70 bg-card/45 p-4 text-xs backdrop-blur-xl">
            <p className="font-semibold text-foreground">Configuratie</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-muted-foreground"><dt>Revisie</dt><dd className="text-right text-foreground">{appliedConfiguration.map_geometry_revision || 0}</dd><dt>Bron</dt><dd className="text-right text-foreground">{candidateMetadata?.source || "BAG/Kadaster via PDOK"}</dd><dt>Bron opgehaald</dt><dd className="text-right text-foreground">{formatDateTime(candidateMetadata?.source_retrieved_at || appliedConfiguration.source_retrieved_at)}</dd><dt>Laatst gewijzigd</dt><dd className="text-right text-foreground">{formatDateTime(appliedConfiguration.map_geometry_updated_at)}</dd>{(appliedConfiguration.map_geometry_updated_by_name || appliedConfiguration.map_geometry_updated_by_user_id) && <><dt>Door</dt><dd className="break-all text-right text-foreground">{appliedConfiguration.map_geometry_updated_by_name || appliedConfiguration.map_geometry_updated_by_user_id}</dd></>}</dl>
          </section>
        </aside>
      </div>

      <Dialog open={overlapDialog} onOpenChange={open => { if (!open) cancelOverlapDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Gedeeld gebouw bevestigen</DialogTitle><DialogDescription>{allConflicts === 1 ? "1 geselecteerd gebouw is" : `${allConflicts} geselecteerde gebouwen zijn`} ook aan een ander actief object gekoppeld. Dit is toegestaan wanneer meerdere klanten of objecten hetzelfde pand gebruiken.</DialogDescription></DialogHeader>
          {overlapObjects.length > 0 && <div className="rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2"><p className="text-xs font-medium text-foreground">Reeds gekoppeld aan</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{overlapObjects.slice(0, 5).map((conflictObject, index) => <li key={conflictObject?.object_id || `${conflictObject?.object_name}-${index}`}>{conflictObject?.object_name || conflictObject?.object_code || "Ander object"}{conflictObject?.object_code && conflictObject?.object_name ? ` · ${conflictObject.object_code}` : ""}</li>)}</ul></div>}
          <div className="space-y-2"><Label htmlFor="object-map-overlap-reason">Waarom wordt dit gebouw gedeeld? *</Label><Textarea id="object-map-overlap-reason" value={overlapReason} onChange={event => setOverlapReason(event.target.value.slice(0, 500))} rows={4} maxLength={500} placeholder="Bijvoorbeeld: meerdere huurders in hetzelfde bedrijfsverzamelgebouw." />{overlapReason.length > 0 && overlapReason.trim().length < 3 ? <p className="text-[11px] text-destructive">Vul minimaal 3 tekens in.</p> : <p className="text-right text-[11px] text-muted-foreground">{overlapReason.length}/500</p>}</div>
          <DialogFooter><Button type="button" variant="outline" disabled={saveMutation.isPending} onClick={cancelOverlapDialog}>Annuleren</Button><Button type="button" disabled={!overlapFingerprint || overlapReason.trim().length < 3 || saveMutation.isPending} onClick={confirmOverlapDialog}>{saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Bevestigen en toepassen</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {navigation.dialog}
    </div>
  );
}

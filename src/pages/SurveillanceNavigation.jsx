import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteNavigationMap from "../components/navigation/RouteNavigationMap";
import NavigationStatusPanel from "../components/navigation/NavigationStatusPanel";
import { distanceMeters, routeStopsFromData } from "../components/navigation/routeStopUtils";

const VISIT_DISTANCE_METERS = 75;

export default function SurveillanceNavigation() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get("routeId");
  const plannedDate = urlParams.get("date") || new Date().toISOString().slice(0, 10);
  const [userPosition, setUserPosition] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [locationError, setLocationError] = useState("");

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: progresses = [] } = useQuery({ queryKey: ["route-progress", routeId, plannedDate], queryFn: () => base44.entities.SurveillanceRouteProgress.filter({ route_id: routeId, planned_date: plannedDate }), enabled: !!routeId });

  const route = routes.find(item => item.id === routeId);
  const progress = progresses.find(item => item.status === "active");
  const stops = useMemo(() => route ? routeStopsFromData(route, tasks, objects) : [], [route, tasks, objects]);
  const visitedIds = useMemo(() => new Set((progress?.visited_objects || []).map(item => item.object_id)), [progress]);

  const createProgress = useMutation({
    mutationFn: () => base44.entities.SurveillanceRouteProgress.create({
      route_id: route.id,
      planned_date: plannedDate,
      route_name: route.name || "Route",
      status: "active",
      started_at: new Date().toISOString(),
      visited_objects: [],
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-progress", routeId, plannedDate] }),
  });

  const updateProgress = useMutation({
    mutationFn: (data) => base44.entities.SurveillanceRouteProgress.update(progress.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-progress", routeId, plannedDate] }),
  });

  useEffect(() => {
    const hasPreviousProgress = progresses.length > 0;
    if (route && !progress && !hasPreviousProgress) createProgress.mutate();
  }, [route, progress, progresses.length]);

  useEffect(() => () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
  }, [watchId]);

  useEffect(() => {
    if (!progress || !userPosition) return;
    const currentVisited = progress.visited_objects || [];
    const newVisits = stops
      .filter(stop => !visitedIds.has(stop.id))
      .map(stop => ({ stop, distance: distanceMeters(userPosition, stop) }))
      .filter(item => item.distance <= VISIT_DISTANCE_METERS)
      .map(item => ({ object_id: item.stop.id, visited_at: new Date().toISOString(), distance_meters: Math.round(item.distance) }));

    if (newVisits.length || userPosition.latitude !== progress.last_latitude || userPosition.longitude !== progress.last_longitude) {
      updateProgress.mutate({
        last_latitude: userPosition.latitude,
        last_longitude: userPosition.longitude,
        visited_objects: [...currentVisited, ...newVisits],
      });
    }
  }, [userPosition]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setLocationError("GPS wordt niet ondersteund op dit apparaat.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      position => {
        setLocationError("");
        setUserPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setLocationError("Locatietoegang is geweigerd of niet beschikbaar."),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    setWatchId(id);
  };

  const finishRoute = () => {
    if (!progress) return;
    if (watchId) navigator.geolocation.clearWatch(watchId);
    updateProgress.mutate({ status: "completed", completed_at: new Date().toISOString() });
  };

  if (!routeId || !route) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="mt-4 text-xl font-bold">Geen route geselecteerd</h1>
          <p className="mt-2 text-sm text-slate-400">Start navigatie vanuit de Uitvoering-kalender.</p>
          <Button asChild className="mt-5 bg-amber-500 text-slate-950 hover:bg-amber-400"><Link to="/Uitvoering">Terug naar uitvoering</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950">
      <RouteNavigationMap stops={stops} objects={objects} userPosition={userPosition} visitedIds={visitedIds} />
      <div className="absolute left-3 top-3 z-[500] flex gap-2">
        <Button asChild variant="outline" className="border-white/20 bg-slate-950/80 text-white backdrop-blur hover:bg-white/10">
          <Link to="/Uitvoering"><ArrowLeft className="h-4 w-4" /> Uitvoering</Link>
        </Button>
      </div>
      {locationError && (
        <div className="absolute left-3 right-3 top-16 z-[500] rounded-xl bg-red-500 p-3 text-sm font-medium text-white md:left-auto md:w-96">
          {locationError}
        </div>
      )}
      <NavigationStatusPanel
        route={route}
        stops={stops}
        visitedIds={visitedIds}
        tracking={!!watchId}
        onStart={startTracking}
        onFinish={finishRoute}
      />
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Route as RouteIcon, Clock, MapPin, Calendar, Euro, Edit, Trash2, Navigation, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import RouteBuilder from "../components/routes/RouteBuilder";
import { AnimatePresence, motion } from "framer-motion";

const WEEKDAY_LABELS = {
  1: "Maandag", 2: "Dinsdag", 3: "Woensdag", 4: "Donderdag", 
  5: "Vrijdag", 6: "Zaterdag", 7: "Zondag"
};

export default function RouteDetails() {
  const [editing, setEditing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [loadingOptimization, setLoadingOptimization] = useState(false);
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get("id");

  const { data: route, isLoading } = useQuery({ 
    queryKey: ["route", routeId], 
    queryFn: async () => {
      const routes = await base44.entities.Route.list();
      return routes.find(r => r.id === routeId);
    },
    enabled: !!routeId
  });

  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: folders = [] } = useQuery({ queryKey: ["folders"], queryFn: () => base44.entities.RouteFolder.list() });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: costSettings = [] } = useQuery({ queryKey: ["costSettings"], queryFn: () => base44.entities.CostSettings.list() });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Route.update(id, data),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["routes"] }); 
      queryClient.invalidateQueries({ queryKey: ["route", routeId] }); 
      setEditing(false); 
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Route.delete(id),
    onSuccess: () => {
      window.location.href = createPageUrl("Routes");
    },
  });

  if (!routeId) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Geen route ID opgegeven</p>
        <Link to={createPageUrl("Routes")}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Terug naar Routes
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-12 text-slate-500">Route laden...</div>;
  }

  if (!route) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Route niet gevonden</p>
        <Link to={createPageUrl("Routes")}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Terug naar Routes
          </Button>
        </Link>
      </div>
    );
  }

  const folder = folders.find(f => f.id === route.folder_id);
  const vehicle = vehicles.find(v => v.id === route.vehicle_id);
  const routeTasks = tasks.filter(t => (route.assigned_tasks || []).some(at => at.task_id === t.id));

  // Bereken omzet
  const weeksPerMonth = 52 / 12;
  let totalRevenue = 0;
  routeTasks.forEach(t => {
    const assignment = route.assigned_tasks?.find(at => at.task_id === t.id);
    const visitsPerTask = (assignment?.days?.length || 0) * weeksPerMonth;
    const pricePerVisit = t.pricing_type === 'per_minuut' 
      ? (t.price_amount || 0) * (t.duration_minutes || 0)
      : (t.price_amount || 0);
    totalRevenue += pricePerVisit * visitsPerTask;
  });

  const totalServiceMinutes = route.total_service_minutes || 0;
  const avgTravelMinutes = route.avg_travel_minutes || 0;

  // Fetch route optimization
  useEffect(() => {
    const fetchOptimization = async () => {
      if (!route || routeTasks.length < 2) return;
      
      setLoadingOptimization(true);
      try {
        const response = await base44.functions.invoke('optimizeRoute', { route_id: route.id });
        setOptimizedRoute(response.data);
      } catch (error) {
        console.error('Fout bij route optimalisatie:', error);
      } finally {
        setLoadingOptimization(false);
      }
    };

    fetchOptimization();
  }, [route, routeTasks.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Routes")}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{route.name}</h1>
            {folder && <p className="text-sm text-slate-500">{folder.name}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Edit className="w-4 h-4 mr-2" /> Bewerken
          </Button>
          <Button variant="destructive" onClick={() => {
            if (confirm("Weet je zeker dat je deze route wilt verwijderen?")) {
              deleteMutation.mutate(route.id);
            }
          }}>
            <Trash2 className="w-4 h-4 mr-2" /> Verwijderen
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <RouteBuilder 
              route={route} 
              vehicles={vehicles} 
              routes={routes} 
              folders={folders} 
              onSave={(data) => updateMutation.mutate({ id: route.id, data })} 
              onCancel={() => setEditing(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!editing && (
        <>
          {/* Overzicht kaarten */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Taken</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{routeTasks.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Totale taaktijd</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalServiceMinutes} min</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Gem. reistijd per object</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{avgTravelMinutes} min</p>
              </CardContent>
            </Card>
          </div>

          {/* Omzet */}
          <Card className="border-2 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="w-5 h-5 text-green-600" />
                Opbrengst per route
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-700">€{totalRevenue.toFixed(2)}</p>
              <p className="text-sm text-slate-600 mt-1">Per maand (4x per week)</p>
            </CardContent>
          </Card>

          {/* Routeoptimalisatie */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-blue-600" />
                Routeoptimalisatie
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingOptimization ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Route berekenen...</span>
                </div>
              ) : optimizedRoute ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Totale routetijd</p>
                      <p className="text-xl font-bold text-blue-700">{optimizedRoute.total_route_time} min</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Reistijd</p>
                      <p className="text-xl font-bold">{optimizedRoute.total_travel_time} min</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Taaktijd</p>
                      <p className="text-xl font-bold">{optimizedRoute.total_service_time} min</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-3">Optimale volgorde:</p>
                    <div className="space-y-2">
                      {optimizedRoute.optimized_order?.map((item, index) => (
                        <div key={item.task_id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.address}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-600">{item.time_window_start} - {item.time_window_end}</p>
                            <p className="text-xs font-medium text-slate-700">{item.duration_minutes} min</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {optimizedRoute.tasks_skipped > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <strong>Let op:</strong> {optimizedRoute.tasks_skipped} {optimizedRoute.tasks_skipped === 1 ? 'taak' : 'taken'} niet opgenomen vanwege tijdsbeperkingen.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">Geen routeoptimalisatie beschikbaar</p>
              )}
            </CardContent>
          </Card>

          {/* Route informatie */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Route planning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="text-sm">
                    {route.weekdays?.map(d => WEEKDAY_LABELS[d]).join(", ") || "Geen dagen"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-sm">
                    {route.time_window_start} - {route.time_window_end}
                  </span>
                </div>
                {vehicle && (
                  <div className="flex items-center gap-2">
                    <RouteIcon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm">
                      {vehicle.license_plate} - {vehicle.brand} {vehicle.model}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Taken op route</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {routeTasks.map(task => {
                    const obj = objects.find(o => o.id === task.object_id);
                    return (
                      <div key={task.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                        <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{obj?.name || "Onbekend"}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{task.task_type}</span>
                            <span>•</span>
                            <span>{task.duration_minutes} min</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {routeTasks.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">Geen taken toegewezen</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {route.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Opmerkingen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{route.notes}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
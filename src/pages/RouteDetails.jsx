import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Route as RouteIcon, Clock, MapPin, Calendar, Euro, Edit, Trash2, Navigation, Loader2, Plus, X, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import RouteBuilder from "../components/routes/RouteBuilder";
import AddTaskDialog from "../components/routes/AddTaskDialog";
import RoutePersonnelCosts from "../components/routes/RoutePersonnelCosts";
import RouteOverheadSummary from "../components/routes/RouteOverheadSummary";
import RouteExportPdf from "../components/routes/RouteExportPdf";
import { AnimatePresence, motion } from "framer-motion";

function formatMinutes(minutes) {
  if (!minutes && minutes !== 0) return "–";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}u ${m}min` : `${h}u`;
}

const WEEKDAY_LABELS = {
  1: "Maandag", 2: "Dinsdag", 3: "Woensdag", 4: "Donderdag", 
  5: "Vrijdag", 6: "Zaterdag", 7: "Zondag"
};

export default function RouteDetails() {
  const [editing, setEditing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [loadingOptimization, setLoadingOptimization] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
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
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectiefs"], queryFn: () => base44.entities.Collectief.list() });
  const { data: offices = [] } = useQuery({ queryKey: ["offices"], queryFn: () => base44.entities.Office.list() });
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

  const removeTaskMutation = useMutation({
    mutationFn: async ({ routeId, taskId }) => {
      const updatedTasks = (route?.assigned_tasks || []).filter(at => at.task_id !== taskId);
      
      // Bereken nieuwe totale taaktijd
      const allTaskIds = updatedTasks.map(at => at.task_id);
      const routeTasksData = tasks.filter(t => allTaskIds.includes(t.id));
      const totalServiceMinutes = routeTasksData.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
      
      // Update route met nieuwe taken en taaktijd
      await base44.entities.Route.update(routeId, { 
        assigned_tasks: updatedTasks,
        total_service_minutes: totalServiceMinutes
      });
      
      // Als er nog taken zijn, bereken reistijd
      if (updatedTasks.length > 0) {
        const distanceResponse = await base44.functions.invoke('calculateRouteDistance', {
          route_id: routeId
        });
        
        await base44.entities.Route.update(routeId, {
          avg_travel_minutes: distanceResponse.data?.avg_travel_minutes || 0,
          total_distance_km: distanceResponse.data?.total_distance_km || 0
        });

        // Bereken route optimalisatie (forceer herberekening)
        const optimizationResponse = await base44.functions.invoke('optimizeRoute', { route_id: routeId, force_recalculate: true });
        return optimizationResponse.data;
      } else {
        // Geen taken meer, reset statistieken
        await base44.entities.Route.update(routeId, {
          avg_travel_minutes: 0,
          total_distance_km: 0,
          total_route_minutes: 0,
          personnel_costs_calculated_at: null,
          cached_optimization: null,
          optimization_hash: null
        });
        return null;
      }
    },
    onSuccess: (optimizedData) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["route", routeId] });
      if (optimizedData) {
        setOptimizedRoute(optimizedData);
      } else {
        setOptimizedRoute(null);
      }
    },
  });

  const recalculateRoute = async () => {
    if (!route || routeTasks.length === 0) return;
    
    setIsRecalculating(true);
    try {
      // Bereken totale taaktijd
      const totalServiceMinutes = routeTasks.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
      
      // Update route met taaktijd
      await base44.entities.Route.update(route.id, { 
        total_service_minutes: totalServiceMinutes
      });
      
      // Bereken reistijd statistieken
      const distanceResponse = await base44.functions.invoke('calculateRouteDistance', {
        route_id: route.id
      });
      
      // Update route met reistijd statistieken
      await base44.entities.Route.update(route.id, {
        avg_travel_minutes: distanceResponse.data?.avg_travel_minutes || 0,
        total_distance_km: distanceResponse.data?.total_distance_km || 0
      });

      // Bereken route optimalisatie (forceer herberekening)
      const optimizationResponse = await base44.functions.invoke('optimizeRoute', { route_id: route.id, force_recalculate: true });
      const optData = optimizationResponse.data;
      setOptimizedRoute(optData);

      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["route", routeId] });
    } catch (error) {
      console.error('Fout bij herberekenen:', error);
    } finally {
      setIsRecalculating(false);
    }
  };

  const addTaskMutation = useMutation({
    mutationFn: async ({ routeId, taskIds }) => {
      const selectedDay = route?.weekdays?.[0];
      const newTasks = taskIds.map(taskId => ({ 
        task_id: taskId, 
        days: selectedDay ? [selectedDay] : [] 
      }));
      const updatedTasks = [...(route?.assigned_tasks || []), ...newTasks];
      
      // Bereken totale taaktijd
      const allTaskIds = updatedTasks.map(at => at.task_id);
      const routeTasksData = tasks.filter(t => allTaskIds.includes(t.id));
      const totalServiceMinutes = routeTasksData.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
      
      // Update route met nieuwe taken en taaktijd eerst
      await base44.entities.Route.update(routeId, { 
        assigned_tasks: updatedTasks,
        total_service_minutes: totalServiceMinutes
      });
      
      // Bereken reistijd statistieken
      const distanceResponse = await base44.functions.invoke('calculateRouteDistance', {
        route_id: routeId
      });
      
      // Update route met reistijd statistieken
      await base44.entities.Route.update(routeId, {
        avg_travel_minutes: distanceResponse.data?.avg_travel_minutes || 0,
        total_distance_km: distanceResponse.data?.total_distance_km || 0
      });

      // Bereken route optimalisatie (forceer herberekening)
      const optimizationResponse = await base44.functions.invoke('optimizeRoute', { route_id: routeId, force_recalculate: true });
      return optimizationResponse.data;
    },
    onSuccess: (optimizedData) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["route", routeId] });
      setOptimizedRoute(optimizedData);
    },
  });

  const folder = folders.find(f => f.id === route?.folder_id);
  const vehicle = vehicles.find(v => v.id === route?.vehicle_id);
  const routeTasks = tasks.filter(t => (route?.assigned_tasks || []).some(at => at.task_id === t.id));

  // Bereken omzet per route
  let totalRevenue = 0;
  routeTasks.forEach(t => {
    const pricePerVisit = t.pricing_type === 'per_minuut' 
      ? (t.price_amount || 0) * (t.duration_minutes || 0)
      : (t.price_amount || 0);
    totalRevenue += pricePerVisit;
  });

  const totalServiceMinutes = route?.total_service_minutes || 0;
  const avgTravelMinutes = route?.avg_travel_minutes || 0;

  // Laad gecachte optimalisatie bij het openen van de pagina
  useEffect(() => {
    if (!route) return;
    if (route.cached_optimization) {
      setOptimizedRoute(route.cached_optimization);
    }
  }, [route?.id]);

  const parseClockMinutes = (time) => {
    if (!time) return 0;
    const [hours, minutes] = String(time).split(':').map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  };

  const formatClockMinutes = (minutes) => {
    const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  };

  const displayClockTime = (time) => time ? formatClockMinutes(parseClockMinutes(time)) : "–";
  const displayClockRange = (start, end) => `${displayClockTime(start)} – ${displayClockTime(end)}`;

  const getLocation = (id) => objects.find(o => o.id === id) || offices.find(o => o.id === id);

  const buildVisibleOptimizedOrder = () => {
    const lockedTaskIds = new Set((route.assigned_tasks || []).filter(item => item.locked_to_route).map(item => String(item.task_id)));
    const existingOrder = (optimizedRoute?.optimized_order || []).map(item => ({
      ...item,
      locked_to_route: !!item.locked_to_route || lockedTaskIds.has(String(item.task_id || '')),
    }));
    const serverTaskSteps = Array.isArray(optimizedRoute?.steps)
      ? optimizedRoute.steps.filter(step => step.type === 'task')
      : [];

    const order = existingOrder.length > 0
      ? existingOrder
      : serverTaskSteps.map((step, stepIndex) => {
          const taskId = String(step.original_task_id || step.task_id || '');
          const task = tasks.find(t => t.id === taskId);
          const location = task?.collectief_id
            ? collectiefs.find(c => c.id === task.collectief_id)
            : objects.find(o => o.id === task?.object_id);
          const arrival = Number(step.arrival_seconds || 0);
          const service = Number(step.service_seconds || (task?.duration_minutes || 0) * 60);

          return {
            task_id: taskId,
            name: step.name || location?.name || task?.task_type || `Stop ${stepIndex + 1}`,
            address: location?.address || step.address || '',
            task_type: task?.task_type,
            duration_minutes: Math.round(service / 60),
            time_window_start: task?.time_window_start || '',
            time_window_end: task?.time_window_end || '',
            arrival_time: formatClockMinutes(Math.round(arrival / 60)),
            actual_start_time: formatClockMinutes(Math.round(arrival / 60)),
            departure_time: formatClockMinutes(Math.round((arrival + service) / 60)),
            travel_time_minutes: Number(step.travel_from_previous_minutes ?? Math.round(Number(step.travel_from_previous_seconds || step.travel_seconds || 0) / 60)),
            distance_km: Number(step.distance_from_previous_km ?? step.distance_km ?? 0),
            travel_to_next_minutes: Number(step.travel_to_next_minutes ?? Math.round(Number(step.travel_to_next_seconds || 0) / 60)),
            distance_to_next_km: Number(step.distance_to_next_km || 0),
            sequence_index: stepIndex,
            locked_to_route: !!step.locked_to_route || lockedTaskIds.has(taskId),
          };
        });

    if (!optimizedRoute || order.length === 0) return order;

    const existingStartIndex = order.findIndex(item => item.is_start);
    const firstTaskIndex = existingStartIndex >= 0 ? order.findIndex((item, index) => index > existingStartIndex && !item.is_start && !item.is_end && !item.is_alarm_standby) : -1;
    if (existingStartIndex >= 0 && firstTaskIndex >= 0) {
      const startItem = order[existingStartIndex];
      const firstTask = order[firstTaskIndex];
      const inferredStartTravel = Number(startItem.travel_to_next_minutes || firstTask.travel_time_minutes || firstTask.waiting_time || startItem.waiting_time || 0);
      if (inferredStartTravel > 0) {
        startItem.departure_time = startItem.arrival_time;
        startItem.travel_to_next_minutes = inferredStartTravel;
        startItem.distance_to_next_km = startItem.distance_to_next_km || firstTask.distance_km || 0;
        startItem.waiting_time = 0;
        firstTask.travel_time_minutes = inferredStartTravel;
        firstTask.distance_km = firstTask.distance_km || startItem.distance_to_next_km || 0;
        firstTask.waiting_time = 0;
        firstTask.actual_start_time = firstTask.arrival_time;
      }
    }

    const startLocation = getLocation(route.start_location_id || vehicle?.startDepotLocationId);
    const endLocation = getLocation(route.end_location_id || vehicle?.eindDepotLocationId);

    if (startLocation && !order.some(item => item.is_start)) {
      const firstTask = order.find(item => !item.is_end && !item.is_alarm_standby);
      const routeStart = parseClockMinutes(optimizedRoute.time_window_start || route.time_window_start);
      const firstArrival = firstTask ? parseClockMinutes(firstTask.arrival_time) : routeStart;
      const normalizedArrival = firstArrival < routeStart ? firstArrival + 1440 : firstArrival;
      const travelMinutes = firstTask?.travel_time_minutes || 0;
      const departureMinute = firstTask ? Math.max(routeStart, normalizedArrival - travelMinutes) : routeStart;

      order.unshift({
        name: `START: ${startLocation.name || 'Startlocatie'}`,
        address: startLocation.address || '',
        is_start: true,
        arrival_time: formatClockMinutes(routeStart),
        actual_start_time: formatClockMinutes(routeStart),
        departure_time: formatClockMinutes(departureMinute),
        travel_to_next_minutes: travelMinutes,
        distance_to_next_km: firstTask?.distance_km || 0,
        waiting_time: Math.max(0, departureMinute - routeStart),
      });
    }

    if (endLocation && !order.some(item => item.is_end)) {
      const lastTask = [...order].reverse().find(item => !item.is_start && !item.is_alarm_standby);
      order.push({
        name: `EIND: ${endLocation.name || 'Eindlocatie'}`,
        address: endLocation.address || '',
        is_end: true,
        arrival_time: lastTask?.departure_time || optimizedRoute.time_window_end || route.time_window_end,
        actual_start_time: lastTask?.departure_time || optimizedRoute.time_window_end || route.time_window_end,
        departure_time: optimizedRoute.time_window_end || route.time_window_end,
        travel_time_minutes: lastTask?.travel_to_next_minutes || 0,
        distance_km: lastTask?.distance_to_next_km || 0,
        waiting_time: 0,
      });
    }

    return order;
  };

  const visibleOptimizedOrder = buildVisibleOptimizedOrder();

  const getTravelIntoStop = (item, index) => {
    const previousItem = visibleOptimizedOrder[index - 1];
    if (previousItem?.is_start) {
      return {
        label: 'Startlocatie naar taak 1',
        minutes: Number(previousItem.travel_to_next_minutes || item.travel_time_minutes || 0),
        distance: Number(previousItem.distance_to_next_km || item.distance_km || 0),
      };
    }
    return {
      label: 'Tussen stops',
      minutes: Number(item.travel_time_minutes || 0),
      distance: Number(item.distance_km || 0),
    };
  };

  const getRouteClockMinutes = (time) => {
    const routeStart = parseClockMinutes(optimizedRoute?.time_window_start || route?.time_window_start || '00:00');
    let minutes = parseClockMinutes(time);
    if (minutes < routeStart) minutes += 1440;
    return minutes;
  };

  const getWaitBeforeStop = (item, index) => {
    if (!item || item.is_start || item.is_end || item.is_alarm_standby) return null;
    const previousItem = visibleOptimizedOrder[index - 1];
    if (!previousItem || previousItem.is_start || !item.actual_start_time) return null;

    const previousDeparture = getRouteClockMinutes(previousItem.departure_time || previousItem.actual_start_time || previousItem.arrival_time);
    const travelMinutes = Number(previousItem.travel_to_next_minutes || item.travel_time_minutes || 0);
    const arrival = previousDeparture + travelMinutes;
    const start = getRouteClockMinutes(item.actual_start_time);
    const minutes = Math.max(0, Math.round(start - arrival));

    return minutes > 0 ? { minutes, start: formatClockMinutes(arrival), end: item.actual_start_time } : null;
  };

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
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overzicht</TabsTrigger>
                <TabsTrigger value="optimization">Routeoptimalisatie</TabsTrigger>
                <TabsTrigger value="costs">Kosten</TabsTrigger>
              </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* Overzicht kaarten */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Taken</CardTitle>
              </CardHeader>
              <CardContent>
                {(addTaskMutation.isPending || removeTaskMutation.isPending) ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Berekenen...</span>
                  </div>
                ) : (
                  <p className="text-2xl font-bold">{routeTasks.length}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Totale taaktijd</CardTitle>
              </CardHeader>
              <CardContent>
                {(addTaskMutation.isPending || removeTaskMutation.isPending || isRecalculating) ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Berekenen...</span>
                  </div>
                ) : (
                  <p className="text-2xl font-bold">{formatMinutes(totalServiceMinutes)}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Gem. reistijd per object</CardTitle>
              </CardHeader>
              <CardContent>
                {(addTaskMutation.isPending || removeTaskMutation.isPending || isRecalculating) ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Berekenen...</span>
                  </div>
                ) : (
                  <p className="text-2xl font-bold">{formatMinutes(avgTravelMinutes)}</p>
                )}
              </CardContent>
            </Card>
          </div>

              {/* Omzet */}
              <Card className="border-2 border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Euro className="w-5 h-5 text-green-600" />
                    Inkomsten in deze route
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-700">€{totalRevenue.toFixed(2)}</p>
                  <p className="text-sm text-slate-600 mt-1">Per gereden route</p>
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
                    <CardTitle className="text-lg">Locaties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {route.start_location_id && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-green-500" />
                        <div>
                          <p className="text-xs text-slate-500">Start</p>
                          <span className="text-sm font-medium">
                            {objects.find(o => o.id === route.start_location_id)?.name || 
                             offices.find(o => o.id === route.start_location_id)?.name || "Onbekend"}
                          </span>
                        </div>
                      </div>
                    )}
                    {route.end_location_id && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-500" />
                        <div>
                          <p className="text-xs text-slate-500">Eind</p>
                          <span className="text-sm font-medium">
                            {objects.find(o => o.id === route.end_location_id)?.name || 
                             offices.find(o => o.id === route.end_location_id)?.name || "Onbekend"}
                          </span>
                        </div>
                      </div>
                    )}
                    {!route.start_location_id && !route.end_location_id && (
                      <p className="text-sm text-slate-500">Geen start-/eindlocaties ingesteld</p>
                    )}
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

              {/* Taken op route */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Taken op route</CardTitle>
                    <Button size="sm" onClick={() => setShowAddTaskDialog(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Taak toevoegen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {routeTasks.map(task => {
                      const obj = task.collectief_id
                        ? collectiefs.find(c => c.id === task.collectief_id)
                        : objects.find(o => o.id === task.object_id);
                      return (
                        <div key={task.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <MapPin className="w-5 h-5 text-slate-500 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{obj?.name || "Onbekend"}</p>
                            <p className="text-xs text-slate-500 mb-2">{obj?.address}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {task.task_type}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                {task.duration_minutes} min
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Euro className="w-3 h-3 mr-1" />
                                €{task.pricing_type === 'per_minuut' ? task.price_amount : (task.price_amount / task.duration_minutes).toFixed(2)}/min
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm("Weet je zeker dat je deze taak wilt verwijderen uit de route?")) {
                                removeTaskMutation.mutate({ routeId: route.id, taskId: task.id });
                              }
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                    {routeTasks.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-sm text-slate-500 mb-3">Geen taken toegewezen aan deze route</p>
                        <Button size="sm" onClick={() => setShowAddTaskDialog(true)}>
                          <Plus className="w-4 h-4 mr-1" /> Taak toevoegen
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="optimization" className="space-y-6 mt-6">
              <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-blue-600" />
                  Routeoptimalisatie
                </CardTitle>
                <div className="flex gap-2">
                <RouteExportPdf route={route} vehicle={vehicle} optimizedRoute={optimizedRoute ? { ...optimizedRoute, optimized_order: visibleOptimizedOrder } : null} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={recalculateRoute}
                    disabled={isRecalculating || routeTasks.length === 0}
                  >
                    {isRecalculating ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Berekenen...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-1" /> Herberekenen</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingOptimization ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Route berekenen...</span>
                </div>
              ) : optimizedRoute ? (
                <div className="space-y-4">
                  <div className={`grid grid-cols-2 ${optimizedRoute.alarm_standby ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 p-4 bg-blue-50 rounded-lg`}>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Totale diensttijd</p>
                        <p className="text-xl font-bold text-blue-700">{formatMinutes(optimizedRoute.actual_shift_minutes ?? optimizedRoute.total_route_time ?? route.total_route_minutes ?? optimizedRoute.stats?.total_route_minutes)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Reistijd</p>
                        <p className="text-xl font-bold">{formatMinutes(optimizedRoute.total_travel_time ?? optimizedRoute.total_travel_minutes ?? optimizedRoute.stats?.total_travel_minutes)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Taaktijd</p>
                        <p className="text-xl font-bold">{formatMinutes(optimizedRoute.total_service_time ?? route.total_service_minutes ?? optimizedRoute.stats?.total_service_minutes)}</p>
                      </div>
                      {optimizedRoute.alarm_standby && (
                        <div>
                          <p className="text-xs text-amber-700 mb-1">🚨 Alarmdienst</p>
                          <p className="text-xl font-bold text-amber-700">{formatMinutes(optimizedRoute.total_alarm_standby_time)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Totale afstand</p>
                        <p className="text-xl font-bold">{optimizedRoute.total_distance_km ?? route.total_distance_km ?? optimizedRoute.stats?.total_distance_km ?? 0} km</p>
                      </div>
                    </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-3">Optimale volgorde:</p>
                    <div className="space-y-3">
                      {visibleOptimizedOrder.map((item, index) => (
                        <div key={`${item.task_id || item.name || 'stop'}-${index}`}>
                          {/* Alarmdienst eindblok */}
                          {item.is_alarm_standby && (
                            <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border-l-4 border-amber-500">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm">🚨</div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-900">Alarmdienst</p>
                                <p className="text-xs text-amber-700 mt-0.5">{item.arrival_time} – {item.departure_time} · {item.duration_minutes} min</p>
                              </div>
                            </div>
                          )}

                          {!item.is_alarm_standby && (
                            <>
                              {!item.is_start && (getTravelIntoStop(item, index).minutes > 0 || getTravelIntoStop(item, index).distance > 0) && (
                                <div className="flex items-center justify-center py-2">
                                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-full">
                                    <Navigation className="w-3 h-3 text-blue-600" />
                                    <span className="text-xs font-medium text-blue-700">
                                      {getTravelIntoStop(item, index).label}: {getTravelIntoStop(item, index).minutes || 0} min{getTravelIntoStop(item, index).distance ? ` · ${Number(getTravelIntoStop(item, index).distance).toFixed(2)} km` : ''}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {getWaitBeforeStop(item, index) && (
                                <div className="flex items-center justify-center py-2">
                                  {optimizedRoute.alarm_standby ? (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 rounded-full">
                                      <span className="text-xs">🚨</span>
                                      <span className="text-xs font-medium text-amber-700">
                                        Alarmdienst: {getWaitBeforeStop(item, index).minutes} min ({displayClockRange(getWaitBeforeStop(item, index).start, getWaitBeforeStop(item, index).end)})
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full">
                                      <Clock className="w-3 h-3 text-green-600" />
                                      <span className="text-xs font-medium text-green-700">
                                        Vrije tijd tussen stops: {getWaitBeforeStop(item, index).minutes} min ({displayClockRange(getWaitBeforeStop(item, index).start, getWaitBeforeStop(item, index).end)})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className={`flex items-start gap-3 p-4 rounded-lg border-l-4 ${item.is_start ? 'bg-green-50 border-green-600' : item.is_end ? 'bg-red-50 border-red-600' : item.is_split_part ? 'bg-purple-50 border-purple-600' : 'bg-slate-50 border-blue-600'}`}>
                                <div className={`flex-shrink-0 min-w-8 h-8 px-2 rounded-full text-white flex items-center justify-center text-xs font-bold ${item.is_start ? 'bg-green-600' : item.is_end ? 'bg-red-600' : item.is_split_part ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                  {item.is_start ? 'START' : item.is_end ? 'EIND' : visibleOptimizedOrder.slice(0, index).filter(stop => !stop.is_start && !stop.is_end).length + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                  <p className="text-xs text-slate-500 mb-2">{item.address}</p>
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {item.task_type && (
                                      <Badge variant="outline" className="text-xs">{item.task_type}</Badge>
                                    )}
                                    {item.is_split_part && (
                                      <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Deel {item.split_index}/{item.split_part_count}</Badge>
                                    )}
                                    {item.locked_to_route && (
                                      <Badge className="text-xs bg-slate-900 text-white">Vastgezet in route</Badge>
                                    )}
                                    {item.uses_arrival_deadline && (
                                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Aanwezig vóór {displayClockTime(item.arrival_deadline_time)}</Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    {item.arrival_time && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">Aankomst:</span>
                                        <span className="ml-1 font-medium text-slate-900">{displayClockTime(item.arrival_time)}</span>
                                      </div>
                                    )}
                                    {(item.is_start || item.is_end) && (
                                      <>
                                        {item.departure_time && (
                                          <div className="text-xs">
                                            <span className="text-slate-500">Vertrek:</span>
                                            <span className="ml-1 font-medium text-slate-900">{displayClockTime(item.departure_time)}</span>
                                          </div>
                                        )}
                                        {item.travel_to_next_minutes > 0 && (
                                          <div className="text-xs">
                                            <span className="text-slate-500">Naar eerste taak:</span>
                                            <span className="ml-1 font-medium text-slate-900">{item.travel_to_next_minutes} min{item.distance_to_next_km ? ` · ${Number(item.distance_to_next_km).toFixed(2)} km` : ''}</span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {!item.is_start && !item.is_end && (
                                      <>
                                        <div className="text-xs">
                                          <span className="text-slate-500">Tijdsvenster:</span>
                                          <span className="ml-1 font-medium text-slate-900">{displayClockRange(item.time_window_start, item.time_window_end)}</span>
                                        </div>
                                        <div className="text-xs">
                                          <span className="text-slate-500">Taakduur:</span>
                                          <span className="ml-1 font-medium text-slate-900">{item.duration_minutes} min</span>
                                        </div>
                                        {item.departure_time && (
                                          <div className="text-xs">
                                            <span className="text-slate-500">Vertrek:</span>
                                            <span className="ml-1 font-medium text-slate-900">{displayClockTime(item.departure_time)}</span>
                                          </div>
                                        )}
                                        {item.travel_to_next_minutes > 0 && (
                                          <div className="text-xs">
                                            <span className="text-slate-500">Naar volgende:</span>
                                            <span className="ml-1 font-medium text-slate-900">{item.travel_to_next_minutes} min{item.distance_to_next_km ? ` · ${Number(item.distance_to_next_km).toFixed(2)} km` : ''}</span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vroeg/laat indicatoren */}
                  {optimizedRoute.finished_early && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <p className="text-sm text-blue-800">
                        <strong>Route eerder klaar:</strong> de route eindigt {optimizedRoute.early_by_minutes} minuten eerder dan het geplande tijdsvenster. De dienst stopt direct na de route.
                      </p>
                    </div>
                  )}
                  {optimizedRoute.finished_late && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <Clock className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <p className="text-sm text-red-800">
                        <strong>Route loopt uit:</strong> de route eindigt {optimizedRoute.late_by_minutes} minuten na het geplande tijdsvenster.
                      </p>
                    </div>
                  )}
                  {optimizedRoute.tasks_skipped > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <p className="text-sm text-amber-800 font-semibold">
                        ⚠️ {optimizedRoute.tasks_skipped} {optimizedRoute.tasks_skipped === 1 ? 'taak' : 'taken'} niet opgenomen vanwege tijdsbeperkingen:
                      </p>
                      {(optimizedRoute.skipped_tasks || []).map((skipped, i) => (
                        <div key={i} className="ml-2 pl-2 border-l-2 border-amber-300">
                          <p className="text-xs font-semibold text-amber-900">{skipped.name}</p>
                          <p className="text-xs text-amber-700">Tijdvenster: {skipped.time_window}</p>
                          {skipped.earliest_arrival && (
                            <p className="text-xs text-amber-700">Vroegste aankomst: {skipped.earliest_arrival} (venster sluit: {skipped.task_end})</p>
                          )}
                          {skipped.current_time && !skipped.earliest_arrival && (
                            <p className="text-xs text-amber-700">Huidige tijd op moment van check: {skipped.current_time}</p>
                          )}
                          <p className="text-xs text-amber-600 italic">{skipped.reason}</p>
                          {skipped.conflicts?.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs font-semibold text-amber-800">Conflicten:</p>
                              {skipped.conflicts.map((conflict, conflictIndex) => (
                                <p key={conflictIndex} className="text-xs text-amber-700">
                                  • {conflict.name}: gepland {conflict.planned_time}{conflict.time_window ? ` · venster ${conflict.time_window}` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                          {skipped.advice && (
                            <p className="text-xs text-amber-800 mt-1"><strong>Advies:</strong> {skipped.advice}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">Geen routeoptimalisatie beschikbaar</p>
              )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="costs" className="space-y-6 mt-6">
              <RouteOverheadSummary route={route} allRoutes={routes} costSettings={costSettings[0]} />
              <RoutePersonnelCosts route={route} />
            </TabsContent>

            </Tabs>
        </>
      )}

      <AddTaskDialog
        open={showAddTaskDialog}
        onOpenChange={setShowAddTaskDialog}
        route={route}
        tasks={tasks}
        objects={objects}
        collectiefs={collectiefs}
        routes={routes}
        onAddTask={(taskIds) => {
          const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
          addTaskMutation.mutate({ routeId: route.id, taskIds: ids });
        }}
      />
    </div>
  );
}
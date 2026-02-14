import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Route as RouteIcon, Clock, MapPin, Calendar, Euro, TrendingUp, TrendingDown, Edit, Trash2 } from "lucide-react";
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

  const cs = costSettings[0];

  // Bereken financiële metrics
  const weeksPerMonth = 52 / 12;
  const uniqueDays = new Set();
  (route.assigned_tasks || []).forEach(at => {
    (at.days || []).forEach(d => uniqueDays.add(d));
  });
  const visitsPerMonth = Math.round(uniqueDays.size * weeksPerMonth * 10) / 10;

  let totalRevenue = 0;
  routeTasks.forEach(t => {
    const assignment = route.assigned_tasks?.find(at => at.task_id === t.id);
    const visitsPerTask = (assignment?.days?.length || 0) * weeksPerMonth;
    const pricePerVisit = t.pricing_type === 'per_minuut' 
      ? (t.price_amount || 0) * (t.duration_minutes || 0)
      : (t.price_amount || 0);
    totalRevenue += pricePerVisit * visitsPerTask;
  });

  // Voertuigkosten berekening
  let vehicleFixedCosts = 0;
  let vehicleVariableCosts = 0;

  if (vehicle) {
    const totalRouteMinutes = route.total_route_minutes || 0;
    const totalKmPerMonth = (totalRouteMinutes / 60) * 30 * visitsPerMonth;

    if (vehicle.acquisition_type === 'aankoop' || vehicle.acquisition_type === 'banklening') {
      const monthlyDepreciation = ((vehicle.purchase_price || 0) - (vehicle.residual_value || 0)) / ((vehicle.depreciation_years || 5) * 12);
      vehicleFixedCosts += monthlyDepreciation;
    }

    if (vehicle.acquisition_type === 'lease' || vehicle.acquisition_type === 'private_lease') {
      vehicleFixedCosts += vehicle.monthly_lease_cost || 0;
    }

    if (vehicle.acquisition_type === 'banklening') {
      vehicleFixedCosts += vehicle.monthly_loan_payment || 0;
    }

    vehicleFixedCosts += vehicle.insurance_per_month || 0;

    vehicleVariableCosts += (vehicle.fuel_cost_per_km || 0) * totalKmPerMonth;

    if (vehicle.maintenance_type === 'per_km') {
      vehicleVariableCosts += (vehicle.maintenance_cost || 0) * totalKmPerMonth / (vehicle.maintenance_interval_km || 1);
    } else if (vehicle.maintenance_type === 'per_month') {
      vehicleFixedCosts += vehicle.maintenance_cost || 0;
    }

    if (vehicle.tire_type === 'per_km') {
      vehicleVariableCosts += (vehicle.tire_cost || 0) * totalKmPerMonth / (vehicle.tire_interval_km || 1);
    } else if (vehicle.tire_type === 'per_month') {
      vehicleFixedCosts += vehicle.tire_cost || 0;
    }
  }

  const overheadCosts = (cs?.office_costs_per_month || 0) + (cs?.admin_salary_per_month || 0) + (cs?.other_fixed_costs_per_month || 0);
  const totalCosts = vehicleFixedCosts + vehicleVariableCosts + overheadCosts;
  const profit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const totalServiceMinutes = route.total_service_minutes || 0;
  const avgTravelMinutes = route.avg_travel_minutes || 0;
  const breakEvenPricePerMinute = totalServiceMinutes > 0 ? totalCosts / (totalServiceMinutes * visitsPerMonth) : 0;

  let avgPricePerMinute = 0;
  routeTasks.forEach(t => {
    const pricePerMin = t.pricing_type === 'per_minuut' ? (t.price_amount || 0) : (t.duration_minutes > 0 ? (t.price_amount || 0) / t.duration_minutes : 0);
    avgPricePerMinute += pricePerMin * (t.duration_minutes || 0);
  });
  avgPricePerMinute = totalServiceMinutes > 0 ? avgPricePerMinute / totalServiceMinutes : 0;

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <CardTitle className="text-sm font-medium text-slate-500">Gem. reistijd</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{avgTravelMinutes} min</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Bezoeken/maand</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{visitsPerMonth}</p>
              </CardContent>
            </Card>
          </div>

          {/* Financiële samenvatting */}
          <Card className={`border-2 ${profit > 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {profit > 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
                Financieel overzicht
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Omzet per maand</p>
                  <p className="text-2xl font-bold text-green-700">€{totalRevenue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Kosten per maand</p>
                  <p className="text-2xl font-bold text-red-700">€{totalCosts.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Winst per maand</p>
                  <p className={`text-2xl font-bold ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    €{profit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Marge</p>
                  <p className={`text-2xl font-bold ${margin > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kosten breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Voertuig variabel</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">€{vehicleVariableCosts.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Voertuig vast</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">€{vehicleFixedCosts.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Overhead</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">€{overheadCosts.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Break-even analyse */}
          <Card>
            <CardHeader>
              <CardTitle>Break-even analyse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Break-even prijs per minuut</span>
                <span className="font-semibold">€{breakEvenPricePerMinute.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Huidige prijs per minuut</span>
                <span className="font-semibold">€{avgPricePerMinute.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Verschil</span>
                <span className={`font-bold ${avgPricePerMinute >= breakEvenPricePerMinute ? 'text-green-600' : 'text-red-600'}`}>
                  €{(avgPricePerMinute - breakEvenPricePerMinute).toFixed(2)}
                </span>
              </div>
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
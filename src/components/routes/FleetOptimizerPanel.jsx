import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Zap, ChevronDown, ChevronRight, Clock, MapPin, AlertTriangle,
  CheckCircle, XCircle, Car, Route as RouteIcon, Info, Loader2
} from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Maandag" }, { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" }, { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" }, { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

function getTodayWeekday() {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function RouteResultCard({ route, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{route.vehicleName}</p>
          <p className="text-xs text-slate-500">{route.plannedStartTime} – {route.plannedEndTime}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge className="bg-blue-50 text-blue-700 text-xs">{route.taskCount} taken</Badge>
          <Badge className="bg-slate-100 text-slate-700 text-xs">{route.totalDistanceKm} km</Badge>
          {route.hasEstimatedTravelTimes && (
            <Badge className="bg-amber-50 text-amber-700 text-xs">Geschat</Badge>
          )}
          {!route.feasible && (
            <Badge className="bg-red-50 text-red-700 text-xs">Probleem</Badge>
          )}
          <span className="text-sm font-bold text-slate-900">€{route.estimatedCost.toFixed(2)}</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
          {/* Samenvatting */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Reistijd", value: `${route.totalTravelMinutes} min` },
              { label: "Taaktijd", value: `${route.totalServiceMinutes} min` },
              { label: "Wachttijd", value: `${route.totalWaitMinutes} min` },
              { label: "Totaal", value: `${route.totalDurationMinutes} min` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Stoppenvolgorde */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Stops in volgorde</p>
            {route.stops.map((stop, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                  stop.withinWindow ? "bg-white border-slate-100" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-slate-700">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{stop.name}</p>
                  <p className="text-xs text-slate-500 truncate">{stop.address}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-xs text-slate-600">
                      <Clock className="w-3 h-3 inline mr-0.5" />{stop.startTime} – {stop.departureTime}
                    </span>
                    {stop.travelMinutes > 0 && (
                      <span className="text-xs text-slate-500">+{stop.travelMinutes}min rij · {stop.distanceKm}km</span>
                    )}
                    {stop.waitMinutes > 0 && (
                      <span className="text-xs text-amber-600">⏳ {stop.waitMinutes}min wacht</span>
                    )}
                    {!stop.withinWindow && (
                      <span className="text-xs text-red-600 font-medium">⚠ Buiten venster</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{stop.durationMinutes}min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnassignedTask({ task }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 text-sm">{task.name}</p>
        {task.address && <p className="text-xs text-slate-500">{task.address}</p>}
        {task.windowStart && (
          <p className="text-xs text-slate-600 mt-0.5">
            Tijdvenster: {task.windowStart} – {task.windowEnd} ({task.durationMinutes} min)
          </p>
        )}
        <p className="text-xs text-red-700 mt-1">{task.reason}</p>
        {task.advice && (
          <p className="text-xs text-slate-600 mt-0.5 italic">{task.advice}</p>
        )}
      </div>
    </div>
  );
}

export default function FleetOptimizerPanel({ folders, vehicles, routes, tasks }) {
  const [weekday, setWeekday] = useState(getTodayWeekday());
  const [planningDate, setPlanningDate] = useState(getTodayDate());
  const [horizonStart, setHorizonStart] = useState("00:00");
  const [horizonEnd, setHorizonEnd] = useState("23:59");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id || "");
  const [costPerKm, setCostPerKm] = useState("0.30");
  const [costPerPersonnelMinute, setCostPerPersonnelMinute] = useState("0.27");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const activeVehicles = vehicles.filter(v => v.is_active !== false);

  const eligibleTaskCount = tasks.filter(t => t.weekdays?.includes(weekday)).length;

  const toggleVehicle = (id) => {
    setSelectedVehicleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleOptimize = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await base44.functions.invoke('globalFleetOptimizer', {
        planning_date: planningDate,
        weekday,
        horizon_start: horizonStart,
        horizon_end: horizonEnd,
        vehicle_ids: selectedVehicleIds.length > 0 ? selectedVehicleIds : null,
        folder_id: selectedFolderId || null,
        cost_per_km: parseFloat(costPerKm) || 0.3,
        cost_per_personnel_minute: parseFloat(costPerPersonnelMinute) || 0.27,
      });
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Automatisch optimaliseren
            <Badge className="ml-auto bg-amber-100 text-amber-800 text-xs">Nieuw</Badge>
          </CardTitle>
          <p className="text-sm text-slate-600">
            Kies een dag en de applicatie maakt zelf de optimale routes, verdeelt taken en bepaalt de volgorde.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dag + datum */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Weekdag</Label>
              <Select value={String(weekday)} onValueChange={v => setWeekday(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(d => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Planningsdatum</Label>
              <Input type="date" value={planningDate} onChange={e => setPlanningDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Opslaan in map</Label>
              <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                <SelectTrigger><SelectValue placeholder="Geen (niet opslaan)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Niet opslaan</SelectItem>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Planningshorizon */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Horizon start</Label>
              <Input type="time" value={horizonStart} onChange={e => setHorizonStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Horizon einde</Label>
              <Input type="time" value={horizonEnd} onChange={e => setHorizonEnd(e.target.value)} />
            </div>
          </div>

          {/* Voertuigen */}
          {activeVehicles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Voertuigen ({selectedVehicleIds.length === 0 ? "alle" : selectedVehicleIds.length} geselecteerd)
              </Label>
              <div className="flex flex-wrap gap-2">
                {activeVehicles.map(v => (
                  <label key={v.id} className="flex items-center gap-1.5 cursor-pointer bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                    <Checkbox
                      checked={selectedVehicleIds.includes(v.id)}
                      onCheckedChange={() => toggleVehicle(v.id)}
                    />
                    <Car className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-slate-700">{v.license_plate}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Kosteninstellingen */}
          <div>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              {showSettings ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Kosteninstellingen
            </button>
            {showSettings && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">€ per km</Label>
                  <Input type="number" step="0.01" value={costPerKm} onChange={e => setCostPerKm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">€ per min (personeel)</Label>
                  <Input type="number" step="0.01" value={costPerPersonnelMinute} onChange={e => setCostPerPersonnelMinute(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Info + actie */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Info className="w-3.5 h-3.5" />
              <span>{eligibleTaskCount} taken beschikbaar op {WEEKDAYS.find(d => d.value === weekday)?.label}</span>
              {activeVehicles.length > 0 && <span>· {activeVehicles.length} voertuigen</span>}
            </div>
            <Button
              onClick={handleOptimize}
              disabled={loading || activeVehicles.length === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Bezig...</>
              ) : (
                <><Zap className="w-4 h-4 mr-1" /> Optimaliseer</>
              )}
            </Button>
          </div>

          {activeVehicles.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Voeg eerst actieve voertuigen toe voordat je kunt optimaliseren.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Foutmelding */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Resultaat */}
      {result && (
        <div className="space-y-4">
          {/* Stats samenvatting */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Ingepland", value: result.stats.assigned, icon: CheckCircle, color: "text-green-600" },
              { label: "Niet ingepland", value: result.stats.unassigned + result.stats.skipped_no_data, icon: XCircle, color: "text-red-500" },
              { label: "Routes", value: result.stats.routes_generated, icon: RouteIcon, color: "text-blue-600" },
              { label: "Est. kosten", value: `€${result.stats.total_estimated_cost.toFixed(2)}`, icon: null, color: "text-slate-900" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {result.stats.total_km > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              <span><MapPin className="w-3 h-3 inline mr-0.5" />{result.stats.total_km} km totaal</span>
              <span><Clock className="w-3 h-3 inline mr-0.5" />{result.stats.total_travel_minutes} min reistijd</span>
              <span>{result.stats.vehicles_used} van {result.stats.vehicles_available} voertuigen gebruikt</span>
              {result.routes?.some(r => r.hasEstimatedTravelTimes) && (
                <span className="text-amber-600">⚠ Sommige reistijden zijn schattingen</span>
              )}
            </div>
          )}

          {/* Gegenereerde routes */}
          {result.routes?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Gegenereerde routes ({result.routes.length})
                {selectedFolderId && result.saved_route_ids?.length > 0 && (
                  <Badge className="bg-green-50 text-green-700 text-xs">Opgeslagen in map</Badge>
                )}
              </h3>
              {result.routes.map((route, i) => (
                <RouteResultCard key={i} route={route} index={i} />
              ))}
            </div>
          )}

          {/* Niet ingeplande taken */}
          {result.unassigned_tasks?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                Niet ingepland ({result.unassigned_tasks.length})
              </h3>
              <div className="space-y-2">
                {result.unassigned_tasks.map((t, i) => (
                  <UnassignedTask key={i} task={t} />
                ))}
              </div>
            </div>
          )}

          {result.routes?.length === 0 && result.unassigned_tasks?.length === 0 && (
            <div className="text-center py-6 text-slate-500 text-sm">
              {result.message || "Geen taken gevonden voor de gekozen dag."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
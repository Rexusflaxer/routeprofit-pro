import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X, Route, Clock, Euro, CheckSquare, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const WEEKDAYS = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

const WEEKDAY_LABELS = {
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
  7: "Zondag",
};

export default function RouteBuilder({ route, vehicles, routes, folders, onSave, onCancel }) {
  const [form, setForm] = useState(route || {
    name: "",
    folder_id: "",
    assigned_tasks: [],
    vehicle_id: "",
    time_window_start: "",
    time_window_end: "",
    weekdays: [],
    notes: "",
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ['objects'],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleTask = (taskId) => {
    const assigned = form.assigned_tasks || [];
    const existing = assigned.find(t => t.task_id === taskId);
    const selectedDay = form.weekdays?.[0];
    
    if (existing) {
      // Verwijder taak
      setForm(prev => ({
        ...prev,
        assigned_tasks: assigned.filter(t => t.task_id !== taskId)
      }));
    } else {
      // Voeg taak toe met de geselecteerde dag van de route
      setForm(prev => ({
        ...prev,
        assigned_tasks: [...assigned, { task_id: taskId, days: selectedDay ? [selectedDay] : [] }]
      }));
    }
  };

  const selectWeekday = (day) => {
    setForm(prev => {
      const newWeekdays = [day];
      // Auto-genereer routenaam als folder geselecteerd is
      const folder = folders?.find(f => f.id === prev.folder_id);
      const autoName = folder ? `${folder.name} - ${WEEKDAY_LABELS[day]}` : prev.name;
      
      return {
        ...prev,
        weekdays: newWeekdays,
        name: autoName
      };
    });
  };

  const handleFolderChange = (folderId) => {
    const folder = folders?.find(f => f.id === folderId);
    const day = form.weekdays?.[0];
    const autoName = folder && day ? `${folder.name} - ${WEEKDAY_LABELS[day]}` : form.name;
    
    setForm(prev => ({
      ...prev,
      folder_id: folderId,
      name: autoName
    }));
  };

  // Vind op welke dagen taken al in andere routes zitten
  const taskDayUsage = useMemo(() => {
    const usage = {}; // { taskId: [1, 2, 3] } = dagen waarop taak al gebruikt is
    
    routes.forEach(r => {
      if (route && r.id === route.id) return; // Skip huidige route bij editen
      
      (r.assigned_tasks || []).forEach(at => {
        if (!usage[at.task_id]) usage[at.task_id] = [];
        (at.days || []).forEach(day => {
          if (!usage[at.task_id].includes(day)) {
            usage[at.task_id].push(day);
          }
        });
      });
    });
    
    return usage;
  }, [routes, route]);

  const availableTasks = useMemo(() => {
    if (!form.time_window_start || !form.time_window_end || !form.weekdays || form.weekdays.length === 0) {
      return [];
    }

    const selectedDay = form.weekdays[0];
    const available = [];

    allTasks.forEach(task => {
      // Check of taak binnen tijdsvenster past
      const taskStart = task.time_window_start || "00:00";
      const taskEnd = task.time_window_end || "23:59";
      const routeStart = form.time_window_start;
      const routeEnd = form.time_window_end;

      const fitsInWindow = taskStart >= routeStart && taskEnd <= routeEnd;
      if (!fitsInWindow) return;

      // Check of taak op deze dag mag
      const taskWeekdays = task.weekdays || [];
      if (!taskWeekdays.includes(selectedDay)) return;
      
      // Check of deze dag al gebruikt is
      const usedDays = taskDayUsage[task.id] || [];
      if (usedDays.includes(selectedDay)) return;
      
      available.push(task);
    });

    return available;
  }, [allTasks, form.time_window_start, form.time_window_end, form.weekdays, taskDayUsage]);

  const selectedTasks = useMemo(() => {
    const assigned = form.assigned_tasks || [];
    return allTasks
      .filter(t => assigned.some(at => at.task_id === t.id))
      .map(t => {
        const assignment = assigned.find(at => at.task_id === t.id);
        return { ...t, assignedDays: assignment?.days || [] };
      });
  }, [allTasks, form.assigned_tasks]);

  // Bereken afstand tussen twee coördinaten (Haversine formule)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Fetch Google Maps route metrics
  const [googleMapsMetrics, setGoogleMapsMetrics] = useState({ totalDistanceKm: 0, avgTravelMinutes: 0, loading: false });

  useEffect(() => {
    const fetchRouteMetrics = async () => {
      if (!form.assigned_tasks || form.assigned_tasks.length < 2) {
        setGoogleMapsMetrics({ totalDistanceKm: 0, avgTravelMinutes: 0, loading: false });
        return;
      }

      setGoogleMapsMetrics(prev => ({ ...prev, loading: true }));
      
      try {
        // Haal object IDs van taken
        const objectIds = selectedTasks.map(t => t.object_id).filter(Boolean);
        
        if (objectIds.length < 2) {
          setGoogleMapsMetrics({ totalDistanceKm: 0, avgTravelMinutes: 0, loading: false });
          return;
        }

        const response = await base44.functions.invoke('calculateRouteDistance', { object_ids: objectIds });
        
        if (response.data && response.data.avg_travel_minutes !== undefined) {
          setGoogleMapsMetrics({
            totalDistanceKm: response.data.total_distance_km || 0,
            avgTravelMinutes: response.data.avg_travel_minutes || 0,
            loading: false
          });
        }
      } catch (error) {
        console.error('Fout bij ophalen routemetreken:', error);
        setGoogleMapsMetrics(prev => ({ ...prev, loading: false }));
      }
    };

    fetchRouteMetrics();
  }, [selectedTasks]);

  // Bereken route metrics
  const { totalDistanceKm, avgTravelMinutes, totalServiceMinutes, totalRouteMinutes, totalRevenuePerVisit, totalVisitsPerMonth } = useMemo(() => {
    const serviceMin = selectedTasks.reduce((s, t) => s + (t.duration_minutes || 0), 0);
    const travelMin = googleMapsMetrics.avgTravelMinutes || 0;
    const routeMin = serviceMin + travelMin;
    
    // Bereken omzet per taak per bezoek, vermenigvuldigd met aantal keer per maand (52 weken/jaar)
    const weeksPerMonth = 52 / 12;
    const revenue = selectedTasks.reduce((s, t) => {
      const visitsPerTask = (t.assignedDays?.length || 0) * weeksPerMonth;
      const pricePerVisit = t.pricing_type === 'per_minuut' 
        ? (t.price_amount || 0) * (t.duration_minutes || 0)
        : (t.price_amount || 0);
      return s + (pricePerVisit * visitsPerTask);
    }, 0);

    // Bereken totaal aantal route-bezoeken per maand
    const uniqueDays = new Set();
    selectedTasks.forEach(t => {
      (t.assignedDays || []).forEach(d => uniqueDays.add(d));
    });
    const visitsPerMonth = Math.round(uniqueDays.size * weeksPerMonth * 10) / 10;

    return { 
      totalDistanceKm: googleMapsMetrics.totalDistanceKm, 
      avgTravelMinutes: googleMapsMetrics.avgTravelMinutes,
      totalServiceMinutes: serviceMin,
      totalRouteMinutes: routeMin,
      totalRevenuePerVisit: revenue / Math.max(1, visitsPerMonth),
      totalVisitsPerMonth: visitsPerMonth
    };
  }, [selectedTasks, googleMapsMetrics]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!form.folder_id) {
      alert("Selecteer een uitschuifmap");
      return;
    }
    
    if (!form.weekdays || form.weekdays.length === 0) {
      alert("Selecteer een dag voor deze route");
      return;
    }
    
    onSave({
      ...form,
      total_service_minutes: totalServiceMinutes,
      avg_travel_minutes: avgTravelMinutes,
      total_distance_km: totalDistanceKm,
      total_route_minutes: totalRouteMinutes,
      total_revenue: totalRevenuePerVisit * totalVisitsPerMonth,
    });
  };

  const getObjectName = (task) => {
    const obj = objects.find(o => o.id === task.object_id);
    return obj ? obj.name : "Onbekend object";
  };

  const getPricePerMinute = (task) => {
    if (task.pricing_type === 'per_minuut') {
      return task.price_amount || 0;
    } else {
      return task.duration_minutes > 0 ? (task.price_amount || 0) / task.duration_minutes : 0;
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Route className="w-5 h-5 text-amber-600" />
          {route ? "Route bewerken" : "Nieuwe route"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uitschuifmap *</Label>
              <Select value={form.folder_id} onValueChange={handleFolderChange} required>
                <SelectTrigger><SelectValue placeholder="Selecteer map" /></SelectTrigger>
                <SelectContent>
                  {(folders || []).map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voertuig</Label>
              <Select value={form.vehicle_id} onValueChange={(v) => handleChange("vehicle_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecteer voertuig" /></SelectTrigger>
                <SelectContent>
                  {vehicles.filter(v => v.is_active).map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.license_plate} - {v.brand} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>



          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdsvenster van</Label>
              <Input 
                type="time" 
                value={form.time_window_start || ""} 
                onChange={(e) => handleChange("time_window_start", e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdsvenster tot</Label>
              <Input 
                type="time" 
                value={form.time_window_end || ""} 
                onChange={(e) => handleChange("time_window_end", e.target.value)} 
                min={form.time_window_start || undefined}
                required 
              />
              {form.time_window_start && form.time_window_end && form.time_window_end <= form.time_window_start && (
                <p className="text-xs text-red-600">Eindtijd moet na starttijd liggen</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dag van de week *</Label>
            <Select 
              value={form.weekdays?.[0]?.toString() || ""} 
              onValueChange={(v) => selectWeekday(parseInt(v))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer een dag" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map(day => (
                  <SelectItem key={day.value} value={day.value.toString()}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Kies de dag waarop deze route gereden wordt (4 keer per maand)
            </p>
          </div>

          {!form.time_window_start || !form.time_window_end || !form.weekdays || form.weekdays.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Tijdsvenster en dag vereist</p>
                <p className="text-xs text-amber-700 mt-1">Vul eerst het tijdsvenster en selecteer een dag om taken te kunnen selecteren.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taken op deze route</Label>
              
              {availableTasks.length === 0 ? (
                <div className="bg-slate-50 rounded-lg p-6 text-center">
                  <p className="text-sm text-slate-500">Geen taken beschikbaar op {WEEKDAYS.find(w => w.value === form.weekdays[0])?.label} binnen dit tijdsvenster.</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 max-h-96 overflow-y-auto space-y-2">
                  {availableTasks.map(task => {
                    const assigned = (form.assigned_tasks || []).find(at => at.task_id === task.id);
                    const isSelected = !!assigned;
                    
                    return (
                      <label key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        isSelected ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox 
                          checked={isSelected} 
                          onCheckedChange={() => toggleTask(task.id)} 
                          className="mt-1" 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">{getObjectName(task)}</span>
                            <Badge variant="secondary" className="text-xs bg-slate-200 text-slate-700">
                              {task.task_type}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.duration_minutes} min
                            </span>
                            <span className="flex items-center gap-1">
                              <Euro className="w-3 h-3" />
                              €{getPricePerMinute(task).toFixed(2)}/min
                            </span>
                            {task.time_window_start && task.time_window_end && (
                              <span>{task.time_window_start} - {task.time_window_end}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              
              {selectedTasks.length > 1 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs text-slate-500">
                    Totale afstand: <span className="font-semibold text-slate-700">{totalDistanceKm} km</span> (automatisch berekend)
                  </p>
                  <p className="text-xs text-slate-500">
                    Gem. reistijd tussen objecten: <span className="font-semibold text-slate-700">{avgTravelMinutes} min</span> (automatisch berekend via Google Maps)
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedTasks.length > 0 && (
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Route samenvatting</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Taken</p>
                  <p className="text-xl font-bold">{selectedTasks.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Bezoeken/mnd</p>
                  <p className="text-xl font-bold">{totalVisitsPerMonth}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Totale taaktijd</p>
                  <p className="text-xl font-bold">{totalServiceMinutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Gem. reistijd</p>
                  <p className="text-xl font-bold">{avgTravelMinutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Totale route</p>
                  <p className="text-xl font-bold">{totalRouteMinutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Omzet/mnd</p>
                  <p className="text-xl font-bold">€{(totalRevenuePerVisit * totalVisitsPerMonth).toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
            <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
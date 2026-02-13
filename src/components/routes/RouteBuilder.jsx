import React, { useState, useMemo } from "react";
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

export default function RouteBuilder({ route, vehicles, routes, onSave, onCancel }) {
  const [form, setForm] = useState(route || {
    name: "",
    assigned_tasks: [],
    vehicle_id: "",
    time_window_start: "",
    time_window_end: "",
    weekdays: [1, 2, 3, 4, 5],
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

  const toggleTask = (taskId, availableDays) => {
    const assigned = form.assigned_tasks || [];
    const existing = assigned.find(t => t.task_id === taskId);
    
    if (existing) {
      // Verwijder taak
      setForm(prev => ({
        ...prev,
        assigned_tasks: assigned.filter(t => t.task_id !== taskId)
      }));
    } else {
      // Voeg taak toe met alle beschikbare dagen
      setForm(prev => ({
        ...prev,
        assigned_tasks: [...assigned, { task_id: taskId, days: availableDays }]
      }));
    }
  };

  const toggleTaskDay = (taskId, day) => {
    const assigned = form.assigned_tasks || [];
    const existing = assigned.find(t => t.task_id === taskId);
    
    if (!existing) return;
    
    const newDays = existing.days.includes(day)
      ? existing.days.filter(d => d !== day)
      : [...existing.days, day].sort();
    
    if (newDays.length === 0) {
      // Geen dagen meer, verwijder taak
      setForm(prev => ({
        ...prev,
        assigned_tasks: assigned.filter(t => t.task_id !== taskId)
      }));
    } else {
      setForm(prev => ({
        ...prev,
        assigned_tasks: assigned.map(t => 
          t.task_id === taskId ? { ...t, days: newDays } : t
        )
      }));
    }
  };

  const toggleWeekday = (day) => {
    setForm(prev => ({
      ...prev,
      weekdays: (prev.weekdays || []).includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...(prev.weekdays || []), day].sort()
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

  // Filter taken: binnen tijdsvenster en beschikbaar op minstens 1 dag van deze route
  const availableTasks = useMemo(() => {
    if (!form.time_window_start || !form.time_window_end || !form.weekdays || form.weekdays.length === 0) {
      return [];
    }

    const available = [];

    allTasks.forEach(task => {
      // Check of taak binnen tijdsvenster past
      const taskStart = task.time_window_start || "00:00";
      const taskEnd = task.time_window_end || "23:59";
      const routeStart = form.time_window_start;
      const routeEnd = form.time_window_end;

      const fitsInWindow = taskStart >= routeStart && taskEnd <= routeEnd;
      if (!fitsInWindow) return;

      // Check of taak op deze dagen mag (overlap met taak weekdays EN beschikbaar)
      const taskWeekdays = task.weekdays || [];
      const routeWeekdays = form.weekdays || [];
      const usedDays = taskDayUsage[task.id] || [];
      
      // Vind overlappende dagen tussen route en taak
      const overlappingDays = routeWeekdays.filter(d => taskWeekdays.includes(d));
      
      // Vind welke van die dagen NOG beschikbaar zijn (niet al gebruikt)
      const availableDays = overlappingDays.filter(d => !usedDays.includes(d));
      
      // Als er minstens 1 dag beschikbaar is, toon de taak
      if (availableDays.length > 0) {
        available.push({
          ...task,
          availableDays,
          usedDays,
          overlappingDays
        });
      }
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

  // Bereken route metrics
  const { totalDistanceKm, avgTravelMinutes, totalServiceMinutes, totalRouteMinutes, totalRevenuePerVisit, totalVisitsPerMonth } = useMemo(() => {
    const taskObjects = selectedTasks.map(t => objects.find(o => o.id === t.object_id)).filter(Boolean);
    
    let totalDistance = 0;
    if (taskObjects.length > 1) {
      for (let i = 0; i < taskObjects.length - 1; i++) {
        const obj1 = taskObjects[i];
        const obj2 = taskObjects[i + 1];
        if (obj1.latitude && obj1.longitude && obj2.latitude && obj2.longitude) {
          totalDistance += calculateDistance(obj1.latitude, obj1.longitude, obj2.latitude, obj2.longitude);
        }
      }
    }
    
    const avgTime = taskObjects.length > 1 ? Math.round((totalDistance / (taskObjects.length - 1)) * 5) : 0;
    const serviceMin = selectedTasks.reduce((s, t) => s + (t.duration_minutes || 0), 0);
    const travelMin = taskObjects.length > 1 ? (taskObjects.length - 1) * Math.max(5, avgTime) : 0;
    const routeMin = serviceMin + travelMin;
    
    // Bereken omzet per taak per bezoek, vermenigvuldigd met aantal keer per maand
    const revenue = selectedTasks.reduce((s, t) => {
      const visitsPerTask = (t.assignedDays?.length || 0) * 4; // aantal dagen per week * 4 weken
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
    const visitsPerMonth = uniqueDays.size * 4;

    return { 
      totalDistanceKm: Math.round(totalDistance * 10) / 10, 
      avgTravelMinutes: Math.max(5, avgTime),
      totalServiceMinutes: serviceMin,
      totalRouteMinutes: routeMin,
      totalRevenuePerVisit: revenue / Math.max(1, visitsPerMonth), // gemiddelde per bezoek
      totalVisitsPerMonth: visitsPerMonth
    };
  }, [selectedTasks, objects]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Valideer dat alle toegewezen taken minstens 1 dag hebben
    const invalidTasks = (form.assigned_tasks || []).filter(at => !at.days || at.days.length === 0);
    if (invalidTasks.length > 0) {
      alert("Selecteer minstens 1 dag voor elke toegewezen taak");
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
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Routenaam</Label>
              <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Bijv. Route Noord" required />
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

          <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dagen waarop route actief is</Label>
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {WEEKDAYS.map(day => (
              <label key={day.value} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                <Checkbox 
                  checked={(form.weekdays || []).includes(day.value)} 
                  onCheckedChange={() => toggleWeekday(day.value)} 
                />
                <span className="text-sm font-medium text-slate-700">{day.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Deze dagen bepalen wanneer de route gereden kan worden. Per taak kun je vervolgens specifieke dagen selecteren.
          </p>
          </div>

          {!form.time_window_start || !form.time_window_end ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Tijdsvenster vereist</p>
                <p className="text-xs text-amber-700 mt-1">Vul eerst het tijdsvenster in om taken te kunnen selecteren.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taken op deze route</Label>
              
              {availableTasks.length === 0 ? (
                <div className="bg-slate-50 rounded-lg p-6 text-center">
                  <p className="text-sm text-slate-500">
                    {!form.weekdays || form.weekdays.length === 0 
                      ? "Selecteer eerst dagen voor deze route"
                      : "Geen taken beschikbaar binnen dit tijdsvenster en deze dagen."}
                  </p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 max-h-96 overflow-y-auto space-y-3">
                  {availableTasks.map(task => {
                    const hasConflict = task.usedDays && task.usedDays.length > 0;
                    const assigned = (form.assigned_tasks || []).find(at => at.task_id === task.id);
                    const isSelected = !!assigned;
                    
                    return (
                      <div key={task.id} className={`p-3 rounded-lg border-2 transition-all ${
                        isSelected ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white'
                      }`}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Checkbox 
                            checked={isSelected} 
                            onCheckedChange={() => toggleTask(task.id, task.availableDays)} 
                            className="mt-1" 
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-medium text-slate-900">{getObjectName(task)}</span>
                              <Badge variant="secondary" className="text-xs bg-slate-200 text-slate-700">
                                {task.task_type}
                              </Badge>
                              {hasConflict && (
                                <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                  Deels bezet
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
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
                            <div className="flex items-center gap-2 text-xs mb-2">
                              {task.availableDays && task.availableDays.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-green-700 font-medium">Beschikbaar:</span>
                                  <div className="flex gap-1">
                                    {task.availableDays.map(d => (
                                      <Badge key={d} className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0">
                                        {WEEKDAYS.find(w => w.value === d)?.label.substring(0, 2)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {task.usedDays && task.usedDays.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-amber-700 font-medium">Al bezet:</span>
                                  <div className="flex gap-1">
                                    {task.usedDays.map(d => (
                                      <Badge key={d} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0">
                                        {WEEKDAYS.find(w => w.value === d)?.label.substring(0, 2)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </label>
                        
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-700 mb-2">Selecteer dagen voor deze taak op deze route:</p>
                            <div className="flex flex-wrap gap-2">
                              {task.availableDays.map(day => (
                                <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                                  <Checkbox
                                    checked={(assigned?.days || []).includes(day)}
                                    onCheckedChange={() => toggleTaskDay(task.id, day)}
                                  />
                                  <span className="text-xs font-medium text-slate-700">
                                    {WEEKDAYS.find(w => w.value === day)?.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                            {assigned && assigned.days.length === 0 && (
                              <p className="text-xs text-red-600 mt-2">Selecteer minstens 1 dag</p>
                            )}
                          </div>
                        )}
                      </div>
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
                    Gem. reistijd tussen objecten: <span className="font-semibold text-slate-700">{avgTravelMinutes} min</span> (automatisch berekend)
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedTasks.length > 0 && (
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Route samenvatting</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Taken</p>
                  <p className="text-xl font-bold">{selectedTasks.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Bezoeken/mnd</p>
                  <p className="text-xl font-bold">{totalVisitsPerMonth}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Diensttijd</p>
                  <p className="text-xl font-bold">{totalServiceMinutes} min</p>
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
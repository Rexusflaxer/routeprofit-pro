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
import { Save, X, Route, AlertTriangle } from "lucide-react";
import RouteOverheadSelector from "./RouteOverheadSelector";

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

export default function RouteBuilder({ route, vehicles, folders, routes = [], onSave, onCancel }) {
  const [form, setForm] = useState(route || {
    name: "",
    folder_id: "",
    start_location_id: "",
    end_location_id: "",
    vehicle_id: "",
    time_window_start: "",
    time_window_end: "",
    flexible_end_time: false,
    max_route_minutes: 600,
    weekdays: [],
    notes: "",
    overhead_cost_ids: [],
    binnendienst_personnel_ids: [],
  });

  // Auto-set folder_id to first available folder when folders load
  useEffect(() => {
    if (!form.folder_id && folders?.length > 0) {
      setForm(prev => ({ ...prev, folder_id: folders[0].id }));
    }
  }, [folders]);

  const activeVehicles = useMemo(() => vehicles.filter(v => v.is_active), [vehicles]);

  // Controleer of het geselecteerde voertuig een tijdoverlap heeft met bestaande routes
  const vehicleTimeConflicts = useMemo(() => {
    if (!form.vehicle_id || !form.time_window_start || (!form.flexible_end_time && !form.time_window_end) || !form.weekdays?.length) return [];

    const parseMin = (t) => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const newStart = parseMin(form.time_window_start);
    let newEnd = form.flexible_end_time ? newStart + 600 : parseMin(form.time_window_end);
    if (newEnd === null || newStart === null) return [];
    if (!form.flexible_end_time && newEnd <= newStart) newEnd += 1440; // over middernacht

    const conflicts = [];
    for (const day of form.weekdays) {
      const conflicting = routes
        .filter(r => r.id !== route?.id)
        .filter(r => r.vehicle_id === form.vehicle_id)
        .filter(r => (r.weekdays || []).includes(day))
        .filter(r => r.time_window_start && (r.flexible_end_time || r.time_window_end))
        .filter(r => {
          const rStart = parseMin(r.time_window_start);
          let rEnd = r.flexible_end_time ? rStart + 600 : parseMin(r.time_window_end);
          if (!r.flexible_end_time && rEnd <= rStart) rEnd += 1440;
          return newStart < rEnd && rEnd > newStart && newEnd > rStart;
        });
      if (conflicting.length > 0) {
        conflicts.push({ day, routes: conflicting });
      }
    }
    return conflicts;
  }, [form.vehicle_id, form.time_window_start, form.time_window_end, form.flexible_end_time, form.max_route_minutes, form.weekdays, routes, route?.id]);

  const { data: objects = [] } = useQuery({
    queryKey: ['objects'],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ['offices'],
    queryFn: () => base44.entities.Office.list(),
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleWeekday = (day) => {
    setForm(prev => {
      const current = prev.weekdays || [];
      const newWeekdays = current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { ...prev, weekdays: newWeekdays };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!form.weekdays || form.weekdays.length === 0) {
      alert("Selecteer een dag voor deze route");
      return;
    }

    if (!form.vehicle_id) {
      alert("Selecteer een voertuig");
      return;
    }

    if (vehicleTimeConflicts.length > 0) {
      alert("Dit voertuig heeft een tijdoverlap met een bestaande route op de geselecteerde dag(en). Pas de tijden aan.");
      return;
    }

    if (!form.time_window_start) {
      alert("Vul een begintijd in");
      return;
    }

    if (!form.flexible_end_time && !form.time_window_end) {
      alert("Vul een eindtijd in of kies flexibele eindtijd");
      return;
    }

    onSave({
      ...form,
      time_window_end: form.flexible_end_time ? "" : form.time_window_end,
      max_route_minutes: 600,
    });
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

          {/* Dagen — bovenaan */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dag(en) van de week *</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => {
                const selected = (form.weekdays || []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selected
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            {form.weekdays?.length > 1 && (
              <p className="text-xs text-blue-600">De route wordt aangemaakt voor {form.weekdays.length} dagen tegelijk.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam route</Label>
            <Input
              value={form.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="bijv. Regio Kampen – Zwolle"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voertuig *</Label>
              <Select value={form.vehicle_id} onValueChange={(v) => handleChange("vehicle_id", v)} required>
                <SelectTrigger className={vehicleTimeConflicts.length > 0 ? "border-amber-400" : ""}>
                  <SelectValue placeholder="Selecteer voertuig" />
                </SelectTrigger>
                <SelectContent>
                  {activeVehicles.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-slate-500 text-center">Geen actieve voertuigen</div>
                  ) : (
                    activeVehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.license_plate} - {v.brand} {v.model}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {vehicleTimeConflicts.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-semibold mb-1">Tijdoverlap met bestaande route(s):</p>
                    {vehicleTimeConflicts.map(({ day, routes: cr }) => (
                      <p key={day}>
                        <span className="font-medium">{WEEKDAY_LABELS[day]}:</span>{" "}
                        {cr.map(r => `${r.time_window_start}–${r.time_window_end}`).join(', ')}
                      </p>
                    ))}
                    <p className="mt-1 text-amber-700">Pas de tijden aan zodat ze niet overlappen.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Startlocatie</Label>
              <Select value={form.start_location_id} onValueChange={(v) => handleChange("start_location_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecteer startlocatie" /></SelectTrigger>
                <SelectContent>
                  {offices.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Kantoren</div>
                      {offices.map(office => (
                        <SelectItem key={`office-${office.id}`} value={office.id}>
                          🏢 {office.name}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Objecten</div>
                    </>
                  )}
                  {objects.map(obj => (
                    <SelectItem key={obj.id} value={obj.id}>
                      {obj.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Eindlocatie</Label>
              <Select value={form.end_location_id} onValueChange={(v) => handleChange("end_location_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecteer eindlocatie" /></SelectTrigger>
                <SelectContent>
                  {offices.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Kantoren</div>
                      {offices.map(office => (
                        <SelectItem key={`office-${office.id}`} value={office.id}>
                          🏢 {office.name}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Objecten</div>
                    </>
                  )}
                  {objects.map(obj => (
                    <SelectItem key={obj.id} value={obj.id}>
                      {obj.name}
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
                disabled={!!form.flexible_end_time}
                required={!form.flexible_end_time}
              />
              {form.time_window_start && form.time_window_end && !form.flexible_end_time && form.time_window_end <= form.time_window_start && (
                <p className="text-xs text-blue-600">⏱ Eindtijd ligt na middernacht (volgende dag)</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
            <Checkbox
              id="flexible_end_time"
              checked={!!form.flexible_end_time}
              onCheckedChange={(v) => handleChange("flexible_end_time", !!v)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <label htmlFor="flexible_end_time" className="text-sm font-semibold text-blue-900 cursor-pointer">
                Flexibele eindtijd
              </label>
              <p className="text-xs text-blue-700 mt-0.5">
                De optimizer bepaalt zelf wanneer de route klaar is. De route mag maximaal 10 uur duren.
              </p>

            </div>
          </div>

          {/* Alarmdienst optie */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
            <Checkbox
              id="alarm_standby"
              checked={!!form.alarm_standby}
              onCheckedChange={(v) => handleChange("alarm_standby", !!v)}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="alarm_standby" className="text-sm font-semibold text-amber-900 cursor-pointer">
                Alarmdienst in overige tijd
              </label>
              <p className="text-xs text-amber-700 mt-0.5">
                Vrije tijd tussen stops én resterende tijd na de route worden meegeteld als alarmdienst. 
                De dienst loopt door tot het einde van het tijdsvenster ({form.time_window_end || "–"}). 
                Dit wordt meegenomen in de kostenbepaling.
              </p>
            </div>
          </div>

          {/* Overhead & binnendienst */}
          <div className="border-t border-slate-100 pt-4">
            <RouteOverheadSelector form={form} onChange={setForm} allRoutes={routes} />
          </div>

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
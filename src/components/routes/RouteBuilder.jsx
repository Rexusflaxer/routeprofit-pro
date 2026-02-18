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
import { Save, X, Route } from "lucide-react";
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

export default function RouteBuilder({ route, vehicles, folders, onSave, onCancel }) {
  const [form, setForm] = useState(route || {
    name: "",
    folder_id: "",
    start_location_id: "",
    end_location_id: "",
    vehicle_id: "",
    time_window_start: "",
    time_window_end: "",
    weekdays: [],
    notes: "",
  });

  const { data: objects = [] } = useQuery({
    queryKey: ['objects'],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ['offices'],
    queryFn: () => base44.entities.Office.list(),
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const selectWeekday = (day) => {
    const newWeekdays = [day];
    const autoName = WEEKDAY_LABELS[day];
    
    setForm(prev => ({
      ...prev,
      weekdays: newWeekdays,
      name: autoName
    }));
  };

  const handleFolderChange = (folderId) => {
    const day = form.weekdays?.[0];
    const autoName = day ? WEEKDAY_LABELS[day] : form.name;
    
    setForm(prev => ({
      ...prev,
      folder_id: folderId,
      name: autoName
    }));
  };

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
    
    onSave(form);
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
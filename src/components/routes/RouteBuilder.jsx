import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X, Route, Clock, Euro } from "lucide-react";

const SHIFT_TYPES = [
  { value: "dag", label: "Dag" },
  { value: "avond", label: "Avond" },
  { value: "nacht", label: "Nacht" },
  { value: "weekend", label: "Weekend" },
];

const FREQUENCIES = [
  { value: "dagelijks", label: "Dagelijks" },
  { value: "weekelijks", label: "Wekelijks" },
  { value: "maandelijks", label: "Maandelijks" },
];

export default function RouteBuilder({ route, objects, personnel, onSave, onCancel }) {
  const [form, setForm] = useState(route || {
    name: "",
    object_ids: [],
    personnel_id: "",
    shift_type: "nacht",
    frequency: "dagelijks",
    visits_per_month: 22,
    avg_travel_minutes: 10,
    total_distance_km: 50,
    notes: "",
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleObject = (objectId) => {
    setForm(prev => ({
      ...prev,
      object_ids: prev.object_ids.includes(objectId)
        ? prev.object_ids.filter(id => id !== objectId)
        : [...prev.object_ids, objectId]
    }));
  };

  const selectedObjects = useMemo(() => 
    objects.filter(o => form.object_ids.includes(o.id)),
    [objects, form.object_ids]
  );

  const totalServiceMinutes = selectedObjects.reduce((sum, o) => sum + (o.service_duration_minutes || 0), 0);
  const totalTravelMinutes = selectedObjects.length > 1 
    ? (selectedObjects.length - 1) * (form.avg_travel_minutes || 0) + (form.avg_travel_minutes || 0)
    : 0;
  const totalRouteMinutes = totalServiceMinutes + totalTravelMinutes;
  const totalRevenuePerVisit = selectedObjects.reduce((sum, o) => sum + (o.price_per_visit || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      total_service_minutes: totalServiceMinutes,
      total_route_minutes: totalRouteMinutes,
      total_revenue: totalRevenuePerVisit * (form.visits_per_month || 0),
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Routenaam</Label>
              <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Bijv. Route Noord" required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Medewerker</Label>
              <Select value={form.personnel_id} onValueChange={(v) => handleChange("personnel_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecteer medewerker" /></SelectTrigger>
                <SelectContent>
                  {personnel.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type dienst</Label>
              <Select value={form.shift_type} onValueChange={(v) => handleChange("shift_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Frequentie</Label>
              <Select value={form.frequency} onValueChange={(v) => handleChange("frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bezoeken per maand</Label>
              <Input type="number" min="1" value={form.visits_per_month} onChange={(e) => handleChange("visits_per_month", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gem. reistijd tussen objecten (min)</Label>
              <Input type="number" min="0" value={form.avg_travel_minutes} onChange={(e) => handleChange("avg_travel_minutes", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Geschatte totale afstand (km)</Label>
              <Input type="number" min="0" value={form.total_distance_km} onChange={(e) => handleChange("total_distance_km", Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Objecten op deze route</Label>
            <div className="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto space-y-2">
              {objects.length === 0 && <p className="text-sm text-slate-400">Geen objecten beschikbaar. Voeg eerst objecten toe.</p>}
              {objects.map(obj => (
                <label key={obj.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                  <Checkbox checked={form.object_ids.includes(obj.id)} onCheckedChange={() => toggleObject(obj.id)} />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900">{obj.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{obj.service_duration_minutes} min — €{(obj.price_per_visit || 0).toFixed(2)}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedObjects.length > 0 && (
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Route samenvatting</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Objecten</p>
                  <p className="text-xl font-bold">{selectedObjects.length}</p>
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
                  <p className="text-xs text-slate-400">Omzet/bezoek</p>
                  <p className="text-xl font-bold">€{totalRevenuePerVisit.toFixed(2)}</p>
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
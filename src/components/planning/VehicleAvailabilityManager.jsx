import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, X, Save, Clock, Car } from "lucide-react";

const WEEKDAYS = [{ v: 1, l: "Ma" }, { v: 2, l: "Di" }, { v: 3, l: "Wo" }, { v: 4, l: "Do" }, { v: 5, l: "Vr" }, { v: 6, l: "Za" }, { v: 7, l: "Zo" }];

function AvailabilityForm({ avail, vehicles, offices, objects, onSave, onCancel }) {
  const [form, setForm] = useState(avail || {
    vehicle_id: vehicles[0]?.id || "",
    name: "Avondroute",
    weekdays: [1, 2, 3, 4, 5],
    start_time: "17:30",
    end_time: "08:30",
    start_depot_id: "",
    end_depot_id: "",
    cost_per_km: 0.35,
    cost_per_minute: 0.10,
    fixed_cost_per_shift: 50,
    is_active: true,
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleDay = d => set("weekdays", form.weekdays.includes(d) ? form.weekdays.filter(x => x !== d) : [...form.weekdays, d]);

  const locations = [
    ...offices.map(o => ({ id: o.id, label: `[Kantoor] ${o.name}` })),
    ...objects.slice(0, 30).map(o => ({ id: o.id, label: o.name })),
  ];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Voertuig</Label>
          <Select value={form.vehicle_id} onValueChange={v => set("vehicle_id", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} ({v.license_plate})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Naam beschikbaarheidsblok</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Bijv. Avondroute" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Starttijd</Label>
          <Input type="time" value={form.start_time} onChange={e => set("start_time", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Eindtijd</Label>
          <Input type="time" value={form.end_time} onChange={e => set("end_time", e.target.value)} />
          {form.end_time <= form.start_time && <p className="text-xs text-blue-600">⏱ Eindigt volgende dag</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Start depot</Label>
          <Select value={form.start_depot_id || "__none__"} onValueChange={v => set("start_depot_id", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Kies depot..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Geen —</SelectItem>
              {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Eind depot</Label>
          <Select value={form.end_depot_id || "__none__"} onValueChange={v => set("end_depot_id", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Kies depot..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Zelfde als start —</SelectItem>
              {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Beschikbare dagen</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map(d => (
            <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.weekdays.includes(d.v) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {d.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[["Kosten/km (€)", "cost_per_km"], ["Kosten/min (€)", "cost_per_minute"], ["Vaste kosten/dienst (€)", "fixed_cost_per_shift"]].map(([label, key]) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <Input type="number" step="0.01" min="0" value={form[key]} onChange={e => set(key, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" />Annuleren</Button>
        <Button type="button" className="bg-slate-900 hover:bg-slate-800" onClick={() => onSave(form)}><Save className="w-4 h-4 mr-1" />Opslaan</Button>
      </div>
    </div>
  );
}

export default function VehicleAvailabilityManager() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: avails = [] } = useQuery({ queryKey: ["vehicle-avails"], queryFn: () => base44.entities.VehicleAvailability.list() });
  const { data: offices = [] } = useQuery({ queryKey: ["offices"], queryFn: () => base44.entities.Office.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["vehicle-avails"] });
  const createMut = useMutation({ mutationFn: d => base44.entities.VehicleAvailability.create(d), onSuccess: () => { invalidate(); setShowForm(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, d }) => base44.entities.VehicleAvailability.update(id, d), onSuccess: () => { invalidate(); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: id => base44.entities.VehicleAvailability.delete(id), onSuccess: invalidate });

  const getVehicleLabel = id => { const v = vehicles.find(x => x.id === id); return v ? `${v.brand || ''} ${v.model || ''} (${v.license_plate})`.trim() : id; };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Definieer wanneer elk voertuig beschikbaar is voor planning. Elk blok wordt een potentiële route tijdens de fleet-optimalisatie.</p>
        <Button className="bg-slate-900 hover:bg-slate-800 shrink-0" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Beschikbaarheid
        </Button>
      </div>

      {showForm && !editing && vehicles.length > 0 && (
        <AvailabilityForm vehicles={vehicles} offices={offices} objects={objects} onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />
      )}
      {showForm && vehicles.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Voeg eerst voertuigen toe via het Voertuigen-menu voordat je beschikbaarheid instelt.
        </div>
      )}

      <div className="space-y-2">
        {avails.length === 0 && !showForm && (
          <div className="text-center py-12 text-slate-400">
            <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nog geen voertuigbeschikbaarheid ingesteld.</p>
            <p className="text-xs mt-1">De optimizer gebruikt de volledige planningshorizon als fallback.</p>
          </div>
        )}
        {avails.map(avail => (
          <div key={avail.id}>
            {editing?.id === avail.id ? (
              <AvailabilityForm avail={editing} vehicles={vehicles} offices={offices} objects={objects}
                onSave={d => updateMut.mutate({ id: avail.id, d })} onCancel={() => setEditing(null)} />
            ) : (
              <Card className="border-slate-200">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{avail.name || "Beschikbaarheidsblok"}</span>
                        <Badge variant="outline" className="text-xs">{getVehicleLabel(avail.vehicle_id)}</Badge>
                        <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{avail.start_time} – {avail.end_time}</Badge>
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        {(avail.weekdays || []).map(d => (
                          <span key={d} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                            {WEEKDAYS.find(w => w.v === d)?.l}
                          </span>
                        ))}
                        <span className="text-xs text-slate-400 ml-2">€{avail.cost_per_km}/km · €{avail.cost_per_minute}/min · €{avail.fixed_cost_per_shift} vast</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(avail)}>
                        <span className="sr-only">Bewerken</span>✏️
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => deleteMut.mutate(avail.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
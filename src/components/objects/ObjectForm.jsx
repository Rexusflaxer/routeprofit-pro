import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Save } from "lucide-react";

const TASK_TYPES = [
  { value: "sluitronde", label: "Sluitronde" },
  { value: "openronde", label: "Openronde" },
  { value: "alarmopvolging", label: "Alarmopvolging" },
  { value: "surveillance", label: "Surveillance" },
  { value: "anders", label: "Anders" },
];

export default function ObjectForm({ object, onSave, onCancel }) {
  const [form, setForm] = useState(object || {
    name: "",
    address: "",
    service_duration_minutes: 15,
    task_type: "surveillance",
    time_window_start: "",
    time_window_end: "",
    price_per_visit: 0,
    notes: "",
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{object ? "Object bewerken" : "Nieuw object"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam</Label>
              <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Bijv. Kantoor ABC" required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type taak</Label>
              <Select value={form.task_type} onValueChange={(v) => handleChange("task_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres</Label>
            <Input value={form.address} onChange={(e) => handleChange("address", e.target.value)} placeholder="Straat, stad" required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dienstduur (min)</Label>
              <Input type="number" min="1" value={form.service_duration_minutes} onChange={(e) => handleChange("service_duration_minutes", Number(e.target.value))} required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdvenster van</Label>
              <Input type="time" value={form.time_window_start} onChange={(e) => handleChange("time_window_start", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdvenster tot</Label>
              <Input type="time" value={form.time_window_end} onChange={(e) => handleChange("time_window_end", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prijs per bezoek (€)</Label>
              <Input type="number" step="0.01" min="0" value={form.price_per_visit} onChange={(e) => handleChange("price_per_visit", Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
            <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} placeholder="Extra informatie..." />
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
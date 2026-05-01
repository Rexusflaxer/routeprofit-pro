import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Save } from "lucide-react";

const TASK_TYPES = [
  "Mobiele Controleronde",
  "Externe Controleronde",
  "Externe Sluitronde",
  "Brand- en Sluitronde",
  "Openingsronde",
  "Sluitbegeleiding"
];

const WEEKDAYS = [
  { value: 1, label: "Maandag" },
  { value: 2, label: "Dinsdag" },
  { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" },
  { value: 5, label: "Vrijdag" },
  { value: 6, label: "Zaterdag" },
  { value: 7, label: "Zondag" },
];

export default function TaskForm({ task, onSave, onCancel }) {
  const [form, setForm] = useState(task || {
    task_type: TASK_TYPES[0],
    duration_minutes: 15,
    time_window_start: "",
    time_window_end: "",
    use_arrival_deadline: false,
    arrival_deadline_time: "",
    weekdays: [],
    pricing_type: "per_taak",
    price_amount: 0,
    is_free: false,
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleWeekday = (day) => {
    setForm(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...prev.weekdays, day]
    }));
  };

  const usesArrivalDeadline = form.task_type === "Sluitbegeleiding" || (form.task_type === "Openingsronde" && form.use_arrival_deadline);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      use_arrival_deadline: usesArrivalDeadline,
      time_window_start: usesArrivalDeadline ? "" : form.time_window_start,
      time_window_end: usesArrivalDeadline ? "" : form.time_window_end,
    });
  };

  const pricePerMinute = form.pricing_type === 'per_minuut' 
    ? form.price_amount 
    : (form.duration_minutes > 0 ? form.price_amount / form.duration_minutes : 0);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type taak</Label>
            <Select value={form.task_type} onValueChange={(v) => handleChange("task_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taakduur (min)</Label>
            <Input 
              type="number" 
              min="1" 
              value={form.duration_minutes} 
              onChange={(e) => handleChange("duration_minutes", Number(e.target.value))} 
              required 
            />
          </div>
        </div>

        {form.task_type === "Openingsronde" && (
          <label className="flex items-center gap-3 cursor-pointer bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Checkbox
              checked={!!form.use_arrival_deadline}
              onCheckedChange={(v) => handleChange("use_arrival_deadline", v)}
            />
            <div>
              <p className="text-sm font-medium text-blue-800">Gebruik minimale aankomsttijd</p>
              <p className="text-xs text-blue-600 mt-0.5">De taak moet vóór deze tijd starten in plaats van binnen een volledig tijdvenster.</p>
            </div>
          </label>
        )}

        {usesArrivalDeadline ? (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aankomst vóór</Label>
            <Input
              type="time"
              value={form.arrival_deadline_time || ""}
              onChange={(e) => handleChange("arrival_deadline_time", e.target.value)}
              required
            />
            <p className="text-xs text-slate-500">Vertrek wordt automatisch berekend: aankomsttijd + taakduur.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdvenster van</Label>
              <Input 
                type="time" 
                value={form.time_window_start} 
                onChange={(e) => handleChange("time_window_start", e.target.value)} 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdvenster tot</Label>
              <Input 
                type="time" 
                value={form.time_window_end} 
                onChange={(e) => handleChange("time_window_end", e.target.value)} 
              />
              {form.time_window_start && form.time_window_end && form.time_window_end <= form.time_window_start && (
                <p className="text-xs text-blue-600">⏱ Eindtijd ligt na middernacht (volgende dag)</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dagen van de week</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {WEEKDAYS.map(day => (
              <label key={day.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox 
                  checked={form.weekdays.includes(day.value)}
                  onCheckedChange={() => toggleWeekday(day.value)}
                />
                <span className="text-sm text-slate-700">{day.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Checkbox
              checked={!!form.is_free}
              onCheckedChange={(v) => handleChange("is_free", v)}
            />
            <div>
              <p className="text-sm font-medium text-green-800">Gratis service</p>
              <p className="text-xs text-green-600 mt-0.5">Deze taak wordt niet in rekening gebracht bij de klant</p>
            </div>
          </label>

          {!form.is_free && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prijstype</Label>
                <Select value={form.pricing_type} onValueChange={(v) => handleChange("pricing_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_taak">Per taak</SelectItem>
                    <SelectItem value="per_minuut">Per minuut</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prijs (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price_amount}
                  onChange={(e) => handleChange("price_amount", parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prijs per minuut</Label>
                <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md text-sm font-medium text-slate-900">
                  €{pricePerMinute.toFixed(2)}/min
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" /> Annuleren
          </Button>
          <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
            <Save className="w-4 h-4 mr-1" /> Opslaan
          </Button>
        </div>
      </form>
    </div>
  );
}
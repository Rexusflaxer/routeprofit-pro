import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Save, Plus, Trash2, Info } from "lucide-react";

const TASK_TYPES = [
  "Mobiele Controleronde",
  "Externe Controleronde",
  "Externe Sluitronde",
  "Brand- en Sluitronde",
];

const WEEKDAYS = [
  { value: 1, label: "Ma" }, { value: 2, label: "Di" }, { value: 3, label: "Wo" },
  { value: 4, label: "Do" }, { value: 5, label: "Vr" }, { value: 6, label: "Za" },
  { value: 7, label: "Zo" },
];

export default function CollectiefTaskForm({ task, collectief, objects, allCollectieven, onSave, onCancel }) {
  // All direct objects in this collectief
  const directObjects = objects.filter(o => (collectief.object_ids || []).includes(o.id));
  // Sub-collectieven of this collectief
  const subCollectieven = allCollectieven.filter(c => c.parent_collectief_id === collectief.id);

  const [form, setForm] = useState({
    task_type: task?.task_type || "Mobiele Controleronde",
    duration_minutes: task?.duration_minutes || 15,
    time_window_start: task?.time_window_start || "",
    time_window_end: task?.time_window_end || "",
    extra_time_windows: task?.extra_time_windows || [],
    allow_split: task?.allow_split || false,
    weekdays: task?.weekdays || [],
    pricing_type: task?.pricing_type || "per_taak",
    price_amount: task?.price_amount || 0,
    selected_object_ids: task?.selected_object_ids ?? directObjects.map(o => o.id),
    selected_sub_collectief_ids: task?.selected_sub_collectief_ids ?? subCollectieven.map(c => c.id),
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleWeekday = (day) => setForm(prev => ({
    ...prev,
    weekdays: prev.weekdays.includes(day) ? prev.weekdays.filter(d => d !== day) : [...prev.weekdays, day],
  }));

  const toggleObject = (id) => setForm(prev => ({
    ...prev,
    selected_object_ids: prev.selected_object_ids.includes(id)
      ? prev.selected_object_ids.filter(x => x !== id)
      : [...prev.selected_object_ids, id],
  }));

  const toggleSubCollectief = (id) => setForm(prev => ({
    ...prev,
    selected_sub_collectief_ids: prev.selected_sub_collectief_ids.includes(id)
      ? prev.selected_sub_collectief_ids.filter(x => x !== id)
      : [...prev.selected_sub_collectief_ids, id],
  }));

  const addExtraWindow = () => setForm(prev => ({
    ...prev,
    extra_time_windows: [...prev.extra_time_windows, { start: "", end: "" }],
  }));

  const updateExtraWindow = (i, field, value) => setForm(prev => {
    const windows = [...prev.extra_time_windows];
    windows[i] = { ...windows[i], [field]: value };
    return { ...prev, extra_time_windows: windows };
  });

  const removeExtraWindow = (i) => setForm(prev => ({
    ...prev,
    extra_time_windows: prev.extra_time_windows.filter((_, idx) => idx !== i),
  }));

  // Calculate time per item
  const totalItems = form.selected_object_ids.length + form.selected_sub_collectief_ids.length;
  const timePerItem = totalItems > 0 ? (form.duration_minutes / totalItems).toFixed(1) : 0;

  const pricePerMinute = form.pricing_type === "per_minuut"
    ? form.price_amount
    : form.duration_minutes > 0 ? form.price_amount / form.duration_minutes : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4 space-y-5">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Type + duur */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type taak</Label>
            <Select value={form.task_type} onValueChange={(v) => handleChange("task_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Totale duur (min)</Label>
            <Input
              type="number" min="1"
              value={form.duration_minutes}
              onChange={(e) => handleChange("duration_minutes", Number(e.target.value))}
              required
            />
          </div>
        </div>

        {/* Objecten & sub-collectieven selectie */}
        {(directObjects.length > 0 || subCollectieven.length > 0) && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Objecten / sub-collectieven in deze ronde
            </Label>

            {directObjects.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 text-xs font-semibold text-slate-600">Objecten ({directObjects.length})</div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {directObjects.map(obj => (
                    <label key={obj.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                      <Checkbox checked={form.selected_object_ids.includes(obj.id)} onCheckedChange={() => toggleObject(obj.id)} />
                      <span className="text-sm text-slate-800">
                        {obj.object_code ? <span className="text-slate-400 mr-1 text-xs">[{obj.object_code}]</span> : null}
                        {obj.name}
                      </span>
                      {obj.address && <span className="text-xs text-slate-400 truncate ml-auto">{obj.address}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {subCollectieven.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-blue-50 text-xs font-semibold text-blue-700">Sub-collectieven ({subCollectieven.length})</div>
                <div className="divide-y divide-slate-100">
                  {subCollectieven.map(sub => {
                    const subObjCount = (sub.object_ids || []).length;
                    return (
                      <label key={sub.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                        <Checkbox checked={form.selected_sub_collectief_ids.includes(sub.id)} onCheckedChange={() => toggleSubCollectief(sub.id)} />
                        <span className="text-sm text-slate-800">{sub.name}</span>
                        <Badge className="text-xs bg-blue-50 text-blue-600 ml-auto">{subObjCount} obj.</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {totalItems > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span>
                  <strong className="text-slate-700">{totalItems} items</strong> geselecteerd →{" "}
                  <strong className="text-slate-700">{timePerItem} min</strong> per item
                  {" "}({form.duration_minutes} min totaal)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tijdvensters */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tijdvenster</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Van</Label>
              <Input type="time" value={form.time_window_start} onChange={(e) => handleChange("time_window_start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Tot</Label>
              <Input type="time" value={form.time_window_end} onChange={(e) => handleChange("time_window_end", e.target.value)} />
            </div>
          </div>

          {/* Extra tijdvensters */}
          {form.extra_time_windows.map((w, i) => (
            <div key={i} className="grid grid-cols-2 gap-4 relative">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Extra venster {i + 2} — Van</Label>
                <Input type="time" value={w.start} onChange={(e) => updateExtraWindow(i, "start", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Tot</Label>
                <div className="flex gap-2">
                  <Input type="time" value={w.end} onChange={(e) => updateExtraWindow(i, "end", e.target.value)} />
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-red-400 hover:text-red-600 flex-shrink-0" onClick={() => removeExtraWindow(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addExtraWindow}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Extra tijdvenster toevoegen
          </button>
        </div>

        {/* Opdelen */}
        <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
          <Checkbox
            checked={form.allow_split}
            onCheckedChange={(v) => handleChange("allow_split", v)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">Taak mag in meerdere delen worden uitgevoerd</p>
            <p className="text-xs text-slate-500 mt-0.5">De route-optimizer mag de taak opsplitsen over meerdere momenten binnen de tijdvensters.</p>
          </div>
        </div>

        {/* Weekdagen */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dagen van de week</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleWeekday(day.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  form.weekdays.includes(day.value)
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prijs */}
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
            <Input type="number" step="0.01" min="0" value={form.price_amount} onChange={(e) => handleChange("price_amount", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prijs per minuut</Label>
            <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md text-sm font-medium text-slate-900">
              €{pricePerMinute.toFixed(2)}/min
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
          <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
        </div>
      </form>
    </div>
  );
}
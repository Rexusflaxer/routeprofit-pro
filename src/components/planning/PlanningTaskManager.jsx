import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, X, Save, Clock, AlertTriangle, ClipboardList } from "lucide-react";

const TASK_TYPES = ["Mobiele Controleronde", "Externe Controleronde", "Externe Sluitronde", "Brand- en Sluitronde", "Openingsronde", "Service"];
const WEEKDAYS = [{ v: 1, l: "Ma" }, { v: 2, l: "Di" }, { v: 3, l: "Wo" }, { v: 4, l: "Do" }, { v: 5, l: "Vr" }, { v: 6, l: "Za" }, { v: 7, l: "Zo" }];
const PRIORITY_LABELS = { contractueel_verplicht: "Verplicht", belangrijk: "Belangrijk", optioneel: "Optioneel" };
const PRIORITY_COLORS = { contractueel_verplicht: "bg-red-100 text-red-700", belangrijk: "bg-amber-100 text-amber-700", optioneel: "bg-slate-100 text-slate-600" };

function TaskForm({ task, objects, onSave, onCancel }) {
  const [form, setForm] = useState(task || {
    name: "", task_type: "Mobiele Controleronde", duration_minutes: 15,
    time_windows: [{ start: "18:00", end: "23:00" }],
    weekdays: [1, 2, 3, 4, 5], priority: "contractueel_verplicht",
    penalty_if_unplanned: 1000, object_id: "", is_active: true,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleDay = (d) => set("weekdays", form.weekdays.includes(d) ? form.weekdays.filter(x => x !== d) : [...form.weekdays, d]);

  const updateWindow = (i, field, val) => {
    const wins = [...form.time_windows];
    wins[i] = { ...wins[i], [field]: val };
    set("time_windows", wins);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Naam</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Bijv. Controleronde PEC Zwolle" required />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.task_type} onValueChange={v => set("task_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Duur (min)</Label>
          <Input type="number" min="1" value={form.duration_minutes} onChange={e => set("duration_minutes", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Prioriteit</Label>
          <Select value={form.priority} onValueChange={v => set("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contractueel_verplicht">Contractueel verplicht</SelectItem>
              <SelectItem value="belangrijk">Belangrijk</SelectItem>
              <SelectItem value="optioneel">Optioneel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Object</Label>
          <Select value={form.object_id || "__none__"} onValueChange={v => set("object_id", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Kies object..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Geen object —</SelectItem>
              {objects.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time windows */}
      <div className="space-y-2">
        <Label>Tijdvensters</Label>
        {form.time_windows.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input type="time" value={w.start} onChange={e => updateWindow(i, "start", e.target.value)} className="w-32" />
            <span className="text-slate-400 text-sm">–</span>
            <Input type="time" value={w.end} onChange={e => updateWindow(i, "end", e.target.value)} className="w-32" />
            {w.end <= w.start && <span className="text-xs text-blue-600">+1 dag</span>}
            {form.time_windows.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => set("time_windows", form.time_windows.filter((_, j) => j !== i))}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set("time_windows", [...form.time_windows, { start: "00:00", end: "06:00" }])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Tijdvenster
        </Button>
      </div>

      {/* Weekdays */}
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

      <div className="flex items-center gap-3">
        <Checkbox checked={form.is_active !== false} onCheckedChange={v => set("is_active", v)} />
        <Label>Actief</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" />Annuleren</Button>
        <Button type="button" className="bg-slate-900 hover:bg-slate-800" onClick={() => onSave(form)}><Save className="w-4 h-4 mr-1" />Opslaan</Button>
      </div>
    </div>
  );
}

export default function PlanningTaskManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tasks = [] } = useQuery({ queryKey: ["planning-tasks"], queryFn: () => base44.entities.PlanningTask.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["planning-tasks"] });
  const createMut = useMutation({ mutationFn: d => base44.entities.PlanningTask.create(d), onSuccess: () => { invalidate(); setShowForm(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, d }) => base44.entities.PlanningTask.update(id, d), onSuccess: () => { invalidate(); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: id => base44.entities.PlanningTask.delete(id), onSuccess: invalidate });

  const filtered = tasks.filter(t => !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.task_type?.toLowerCase().includes(search.toLowerCase()));

  const getObjectName = (id) => objects.find(o => o.id === id)?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Input placeholder="Zoek taken..." className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} />
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nieuwe taak
        </Button>
      </div>

      {showForm && !editing && (
        <TaskForm objects={objects} onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nog geen planningtaken. Maak een taak aan om te beginnen.</p>
          </div>
        )}
        {filtered.map(task => (
          <div key={task.id}>
            {editing?.id === task.id ? (
              <TaskForm task={editing} objects={objects} onSave={d => updateMut.mutate({ id: task.id, d })} onCancel={() => setEditing(null)} />
            ) : (
              <Card className={`border-slate-200 ${task.is_active === false ? "opacity-50" : ""}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{task.name}</span>
                        <Badge variant="outline" className="text-xs">{task.task_type}</Badge>
                        <Badge className={`text-xs ${PRIORITY_COLORS[task.priority || "contractueel_verplicht"]}`}>
                          {PRIORITY_LABELS[task.priority || "contractueel_verplicht"]}
                        </Badge>
                        {task.is_active === false && <Badge variant="outline" className="text-xs text-slate-400">Inactief</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.duration_minutes} min</span>
                        {task.object_id && <span>📍 {getObjectName(task.object_id)}</span>}
                        {task.time_windows?.length > 0 && (
                          <span>{task.time_windows.map(w => `${w.start}–${w.end}`).join(", ")}</span>
                        )}
                        {task.weekdays?.length > 0 && (
                          <span>{task.weekdays.map(d => WEEKDAYS.find(w => w.v === d)?.l).filter(Boolean).join(" ")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(task)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => deleteMut.mutate(task.id)}>
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
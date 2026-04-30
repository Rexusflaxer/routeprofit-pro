import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Save, Trash2 } from "lucide-react";

function todayDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function TaskAdjustmentPanel({ tasks = [], objects = [], collectiefs = [], onChanged }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("one_time");
  const [form, setForm] = useState({ task_id: "", date: todayDate(), time_window_start: "", time_window_end: "", duration_minutes: "", notes: "" });

  const { data: adjustments = [] } = useQuery({
    queryKey: ["task-adjustments"],
    queryFn: () => base44.entities.TaskAdjustment.list("-date", 20),
  });

  const taskOptions = useMemo(() => tasks.map(task => {
    const object = objects.find(item => item.id === task.object_id);
    const collectief = collectiefs.find(item => item.id === task.collectief_id);
    return {
      ...task,
      label: `${task.task_type} · ${object?.name || collectief?.name || "Onbekende locatie"}`
    };
  }), [tasks, objects, collectiefs]);

  const selectedTask = tasks.find(task => task.id === form.task_id);

  const createAdjustment = useMutation({
    mutationFn: (data) => base44.entities.TaskAdjustment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-adjustments"] });
      onChanged?.();
      setForm({ task_id: "", date: todayDate(), time_window_start: "", time_window_end: "", duration_minutes: "", notes: "" });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      onChanged?.();
    },
  });

  const deleteAdjustment = useMutation({
    mutationFn: (id) => base44.entities.TaskAdjustment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-adjustments"] });
      onChanged?.();
    },
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.task_id) return;
    const updates = {
      time_window_start: form.time_window_start || selectedTask?.time_window_start || "",
      time_window_end: form.time_window_end || selectedTask?.time_window_end || "",
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : selectedTask?.duration_minutes,
    };

    if (mode === "permanent") {
      updateTask.mutate({ id: form.task_id, data: updates });
    } else {
      createAdjustment.mutate({
        task_id: form.task_id,
        mode: "one_time",
        date: form.date,
        ...updates,
        notes: form.notes,
        is_active: true,
      });
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="w-5 h-5 text-slate-700" />
          Taak tijdelijk of blijvend aanpassen
        </CardTitle>
        <p className="text-sm text-slate-500">
          Gebruik dit bijvoorbeeld als een supermarkt één keer later sluit; daarna kun je opnieuw automatisch plannen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Taak</Label>
            <Select value={form.task_id} onValueChange={(value) => update("task_id", value)}>
              <SelectTrigger><SelectValue placeholder="Selecteer taak" /></SelectTrigger>
              <SelectContent>
                {taskOptions.map(task => <SelectItem key={task.id} value={task.id}>{task.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Soort aanpassing</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">Eenmalig</SelectItem>
                <SelectItem value="permanent">Voor altijd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "one_time" && (
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tijdvenster van</Label>
            <Input type="time" value={form.time_window_start} onChange={(e) => update("time_window_start", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tijdvenster tot</Label>
            <Input type="time" value={form.time_window_end} onChange={(e) => update("time_window_end", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Duur minuten</Label>
            <Input type="number" min="1" value={form.duration_minutes} onChange={(e) => update("duration_minutes", e.target.value)} placeholder={selectedTask?.duration_minutes ? String(selectedTask.duration_minutes) : ""} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notitie</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Bijv. klant sluit deze dag later" rows={2} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={!form.task_id} className="bg-slate-900 hover:bg-slate-800">
          <Save className="w-4 h-4 mr-1" /> Aanpassing opslaan
        </Button>

        {adjustments.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">Actieve eenmalige aanpassingen</h4>
            {adjustments.map(adjustment => {
              const task = taskOptions.find(item => item.id === adjustment.task_id);
              return (
                <div key={adjustment.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task?.label || "Taak"}</p>
                    <p className="text-xs text-slate-500">{adjustment.date} · {adjustment.time_window_start || "--:--"} - {adjustment.time_window_end || "--:--"}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAdjustment.mutate(adjustment.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
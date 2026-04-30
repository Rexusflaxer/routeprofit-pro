import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarClock, Save, Trash2 } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Maandag" }, { value: 2, label: "Dinsdag" }, { value: 3, label: "Woensdag" },
  { value: 4, label: "Donderdag" }, { value: 5, label: "Vrijdag" }, { value: 6, label: "Zaterdag" }, { value: 7, label: "Zondag" },
];

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().split("T")[0];
}

export default function TaskPlanningExceptionPanel({ tasks }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ task_id: "", scope: "one_time", date: today(), weekday: 1, time_window_start: "", time_window_end: "", duration_minutes: "", is_cancelled: false });
  const { data: exceptions = [] } = useQuery({ queryKey: ["task-planning-exceptions"], queryFn: () => base44.entities.TaskPlanningException.list("-created_date", 20) });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskPlanningException.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-planning-exceptions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskPlanningException.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-planning-exceptions"] }),
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    createMutation.mutate({
      ...form,
      weekday: form.scope === "permanent" ? Number(form.weekday) : undefined,
      date: form.scope === "one_time" ? form.date : undefined,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
      is_active: true,
    });
  };

  const taskLabel = (id) => tasks.find(task => task.id === id)?.task_type || "Taak";

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="w-5 h-5 text-slate-700" /> Taak tijdelijk of blijvend aanpassen
        </CardTitle>
        <p className="text-sm text-slate-500">Bijvoorbeeld als een sluitronde eenmalig later moet. Draai daarna de automatische planner opnieuw.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Taak</Label>
            <Select value={form.task_id} onValueChange={(value) => setForm(prev => ({ ...prev, task_id: value }))} required>
              <SelectTrigger><SelectValue placeholder="Selecteer taak" /></SelectTrigger>
              <SelectContent>
                {tasks.map(task => <SelectItem key={task.id} value={task.id}>{task.task_type} · {task.duration_minutes} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Soort</Label>
            <Select value={form.scope} onValueChange={(value) => setForm(prev => ({ ...prev, scope: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">Eenmalig</SelectItem>
                <SelectItem value="permanent">Voor altijd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.scope === "one_time" ? (
            <div className="space-y-1"><Label className="text-xs">Datum</Label><Input type="date" value={form.date} onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} /></div>
          ) : (
            <div className="space-y-1"><Label className="text-xs">Dag</Label><Select value={String(form.weekday)} onValueChange={(value) => setForm(prev => ({ ...prev, weekday: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WEEKDAYS.map(day => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}</SelectContent></Select></div>
          )}
          <div className="space-y-1"><Label className="text-xs">Van</Label><Input type="time" value={form.time_window_start} onChange={(e) => setForm(prev => ({ ...prev, time_window_start: e.target.value }))} /></div>
          <div className="space-y-1"><Label className="text-xs">Tot</Label><Input type="time" value={form.time_window_end} onChange={(e) => setForm(prev => ({ ...prev, time_window_end: e.target.value }))} /></div>
          <div className="space-y-1"><Label className="text-xs">Duur</Label><Input type="number" min="1" placeholder="min" value={form.duration_minutes} onChange={(e) => setForm(prev => ({ ...prev, duration_minutes: e.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><Checkbox checked={form.is_cancelled} onCheckedChange={(value) => setForm(prev => ({ ...prev, is_cancelled: !!value }))} /> Vervalt</label>
          <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
        </form>

        {exceptions.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            {exceptions.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2 text-sm">
                <span className="text-slate-700">{taskLabel(item.task_id)} · {item.scope === "one_time" ? item.date : WEEKDAYS.find(day => day.value === item.weekday)?.label} · {item.is_cancelled ? "vervalt" : `${item.time_window_start || "–"}-${item.time_window_end || "–"}`}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
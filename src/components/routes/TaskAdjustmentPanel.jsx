import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Save } from "lucide-react";

function getTodayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().split("T")[0];
}

export default function TaskAdjustmentPanel({ tasks = [], objects = [], collectiefs = [] }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("one_time");
  const [form, setForm] = useState({
    task_id: "",
    effective_date: getTodayDate(),
    time_window_start: "",
    time_window_end: "",
    duration_minutes: "",
    reason: "",
  });

  const taskLabels = useMemo(() => tasks.map(task => {
    const object = objects.find(o => o.id === task.object_id);
    const collectief = collectiefs.find(c => c.id === task.collectief_id);
    return {
      id: task.id,
      label: `${task.task_type} — ${object?.name || collectief?.name || "Onbekend object"}`,
      task,
    };
  }), [tasks, objects, collectiefs]);

  const selectedTask = taskLabels.find(item => item.id === form.task_id)?.task;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        time_window_start: form.time_window_start || selectedTask?.time_window_start || "",
        time_window_end: form.time_window_end || selectedTask?.time_window_end || "",
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : selectedTask?.duration_minutes,
      };

      if (mode === "permanent") {
        return base44.entities.Task.update(form.task_id, payload);
      }

      return base44.entities.TaskOverride.create({
        task_id: form.task_id,
        effective_date: form.effective_date,
        reason: form.reason,
        is_active: true,
        ...payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-overrides"] });
      setForm({ task_id: "", effective_date: getTodayDate(), time_window_start: "", time_window_end: "", duration_minutes: "", reason: "" });
    },
  });

  const canSave = form.task_id && (mode === "permanent" || form.effective_date);

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="w-4 h-4 text-blue-600" />
          Taak tijdelijk of permanent aanpassen
        </CardTitle>
        <p className="text-sm text-slate-500">
          Gebruik dit bijvoorbeeld als een supermarkt één keer later sluit. Bereken daarna opnieuw de optimale routes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Wijziging</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">Eenmalig</SelectItem>
                <SelectItem value="permanent">Voor altijd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "one_time" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Datum</Label>
              <Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taak</Label>
          <Select value={form.task_id} onValueChange={(value) => setForm({ ...form, task_id: value })}>
            <SelectTrigger><SelectValue placeholder="Selecteer taak" /></SelectTrigger>
            <SelectContent>
              {taskLabels.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Van</Label>
            <Input type="time" value={form.time_window_start} onChange={(e) => setForm({ ...form, time_window_start: e.target.value })} placeholder={selectedTask?.time_window_start} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tot</Label>
            <Input type="time" value={form.time_window_end} onChange={(e) => setForm({ ...form, time_window_end: e.target.value })} placeholder={selectedTask?.time_window_end} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Duur min.</Label>
            <Input type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder={selectedTask?.duration_minutes?.toString()} />
          </div>
        </div>

        {mode === "one_time" && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reden</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Bijv. klant sluit vandaag later" />
          </div>
        )}

        <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="bg-slate-900 hover:bg-slate-800">
          <Save className="w-4 h-4 mr-1" /> Wijziging opslaan
        </Button>
      </CardContent>
    </Card>
  );
}
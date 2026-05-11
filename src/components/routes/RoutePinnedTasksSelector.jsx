import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Lock, Plus, Search, X } from "lucide-react";

function taskLabel(task, objects, collectiefs) {
  const target = task.collectief_id
    ? collectiefs.find(item => item.id === task.collectief_id)
    : objects.find(item => item.id === task.object_id);
  return target?.name || task.task_type || "Taak";
}

function parseMinutes(time) {
  if (!time) return null;
  const [hours, minutes = 0] = String(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function nextWeekday(day) {
  return Number(day) === 7 ? 1 : Number(day) + 1;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function taskMatchesRouteWindow(task, form) {
  const routeDays = form.weekdays || [];
  const routeStart = parseMinutes(form.time_window_start);
  const routeEndRaw = parseMinutes(form.time_window_end);
  if (!routeDays.length || routeStart === null || routeEndRaw === null) return false;

  const taskStart = parseMinutes(task.use_arrival_deadline ? (task.arrival_deadline_time || task.time_window_start) : task.time_window_start);
  const taskEndRaw = parseMinutes(task.latest_departure_time || task.time_window_end || task.arrival_deadline_time);
  if (taskStart === null || taskEndRaw === null) return false;

  const taskEnd = taskEndRaw <= taskStart ? taskEndRaw + 1440 : taskEndRaw;
  const taskDays = task.weekdays || [];

  return routeDays.some(day => {
    const crossesMidnight = routeEndRaw <= routeStart;
    const sameDayMatch = taskDays.includes(day) && overlaps(taskStart, taskEnd, routeStart, crossesMidnight ? 1440 : routeEndRaw);
    const nextDayMatch = crossesMidnight && taskDays.includes(nextWeekday(day)) && overlaps(taskStart, taskEnd, 0, routeEndRaw);
    return sameDayMatch || nextDayMatch;
  });
}

export default function RoutePinnedTasksSelector({ form, onChange }) {
  const [query, setQuery] = useState("");

  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectiefs"], queryFn: () => base44.entities.Collectief.list() });

  const assignedTasks = form.assigned_tasks || [];
  const routeRelevantTasks = useMemo(() => (
    tasks.filter(task => taskMatchesRouteWindow(task, form))
  ), [tasks, form.weekdays, form.time_window_start, form.time_window_end]);
  const routeRelevantTaskIds = new Set(routeRelevantTasks.map(task => String(task.id)));
  const pinnedItems = assignedTasks.filter(item => item.locked_to_route && routeRelevantTaskIds.has(String(item.task_id)));
  const pinnedIds = new Set(pinnedItems.map(item => String(item.task_id)));

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return routeRelevantTasks.slice(0, 8);

    return routeRelevantTasks.filter(task => {
      const label = taskLabel(task, objects, collectiefs).toLowerCase();
      return label.includes(normalizedQuery) || String(task.task_type || "").toLowerCase().includes(normalizedQuery);
    }).slice(0, 12);
  }, [routeRelevantTasks, objects, collectiefs, query]);

  const updateAssignedTask = (taskId, patch) => {
    const id = String(taskId);
    const existing = assignedTasks.find(item => String(item.task_id) === id);
    const next = existing
      ? assignedTasks.map(item => String(item.task_id) === id ? { ...item, ...patch } : item)
      : [
          ...assignedTasks,
          {
            task_id: id,
            days: form.weekdays || [],
            locked_to_route: true,
            locked_sequence: false,
            sequence_index: null,
            ...patch,
          },
        ];

    onChange(prev => ({ ...prev, assigned_tasks: next }));
  };

  const removePinnedTask = (taskId) => {
    const id = String(taskId);
    onChange(prev => ({
      ...prev,
      assigned_tasks: (prev.assigned_tasks || []).map(item =>
        String(item.task_id) === id
          ? { ...item, locked_to_route: false, locked_sequence: false }
          : item
      ),
    }));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vastgezette taken in deze route</Label>
        <p className="text-xs text-slate-500 mt-1">Deze taken blijven verplicht in deze handmatige route; de server mag de volgorde nog optimaliseren.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek taken of collectieve taken..." className="pl-9 bg-white" />
      </div>

      {query && (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-auto">
          {filteredTasks.map(task => {
            const label = taskLabel(task, objects, collectiefs);
            const isPinned = pinnedIds.has(String(task.id));
            return (
              <button
                key={task.id}
                type="button"
                disabled={isPinned}
                onClick={() => updateAssignedTask(task.id, { locked_to_route: true, locked_sequence: false, sequence_index: null })}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                  <p className="text-xs text-slate-500 truncate">{task.task_type} · {task.duration_minutes || 0} min</p>
                </div>
                <Plus className="w-4 h-4 text-slate-400" />
              </button>
            );
          })}
          {filteredTasks.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Geen taken binnen deze routedag en dit tijdsvenster gevonden</p>}
        </div>
      )}

      <div className="space-y-2">
        {pinnedItems.map(item => {
          const task = tasks.find(task => String(task.id) === String(item.task_id));
          if (!task) return null;
          return (
            <div key={item.task_id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{taskLabel(task, objects, collectiefs)}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{task.task_type}</Badge>
                    <Badge className="text-xs bg-slate-900 text-white"><Lock className="w-3 h-3 mr-1" />Vastgezet</Badge>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => removePinnedTask(item.task_id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <Checkbox checked={!!item.locked_to_route} onCheckedChange={(value) => updateAssignedTask(item.task_id, { locked_to_route: !!value })} />
                  Verplicht in deze route
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <Checkbox checked={!!item.locked_sequence} onCheckedChange={(value) => updateAssignedTask(item.task_id, { locked_sequence: !!value })} />
                  Volgorde vastzetten
                </label>
              </div>
            </div>
          );
        })}
        {pinnedItems.length === 0 && <p className="text-xs text-slate-400 italic">Nog geen vastgezette taken binnen deze routedag en dit tijdsvenster gekozen.</p>}
      </div>
    </div>
  );
}
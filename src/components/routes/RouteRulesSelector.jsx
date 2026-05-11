import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function taskLabel(task, objects, collectiefs) {
  const target = task.collectief_id
    ? collectiefs.find(item => item.id === task.collectief_id)
    : objects.find(item => item.id === task.object_id);
  return target?.name || task.task_type || "Taak";
}

export default function RouteRulesSelector({ form, onChange }) {
  const [query, setQuery] = useState("");
  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectiefs"], queryFn: () => base44.entities.Collectief.list() });

  const allowedTaskTypes = form.allowed_task_types || [];
  const excludedTaskIds = (form.excluded_task_ids || []).map(String);
  const excludedSet = new Set(excludedTaskIds);

  const taskTypes = useMemo(() => (
    [...new Set(tasks.map(task => task.task_type).filter(Boolean))].sort()
  ), [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tasks.slice(0, 10);

    return tasks.filter(task => {
      const label = taskLabel(task, objects, collectiefs).toLowerCase();
      return label.includes(normalizedQuery) || String(task.task_type || "").toLowerCase().includes(normalizedQuery);
    }).slice(0, 20);
  }, [tasks, objects, collectiefs, query]);

  const toggleTaskType = (taskType) => {
    onChange(prev => {
      const current = prev.allowed_task_types || [];
      return {
        ...prev,
        allowed_task_types: current.includes(taskType)
          ? current.filter(item => item !== taskType)
          : [...current, taskType],
      };
    });
  };

  const toggleExcludedTask = (taskId) => {
    const id = String(taskId);
    onChange(prev => {
      const current = (prev.excluded_task_ids || []).map(String);
      return {
        ...prev,
        excluded_task_ids: current.includes(id)
          ? current.filter(item => item !== id)
          : [...current, id],
      };
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Toegestane taaktypes</Label>
        <p className="text-xs text-slate-500">Laat leeg als deze route alle taaktypes mag aannemen.</p>
        <div className="flex flex-wrap gap-2">
          {taskTypes.map(taskType => (
            <button
              key={taskType}
              type="button"
              onClick={() => toggleTaskType(taskType)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${allowedTaskTypes.includes(taskType) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
            >
              {taskType}
            </button>
          ))}
          {taskTypes.length === 0 && <p className="text-xs text-slate-400 italic">Nog geen taaktypes gevonden.</p>}
        </div>
        {allowedTaskTypes.length > 0 && (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">Alleen: {allowedTaskTypes.join(", ")}</Badge>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taken uitsluiten voor deze route</Label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek taak of object..." className="pl-9" />
        </div>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-auto">
          {filteredTasks.map(task => {
            const excluded = excludedSet.has(String(task.id));
            return (
              <label key={task.id} className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <Checkbox checked={excluded} onCheckedChange={() => toggleExcludedTask(task.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{taskLabel(task, objects, collectiefs)}</p>
                  <p className="text-xs text-slate-500 truncate">{task.task_type} · {task.duration_minutes || 0} min</p>
                </div>
              </label>
            );
          })}
          {filteredTasks.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Geen taken gevonden</p>}
        </div>

        {excludedTaskIds.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {excludedTaskIds.map(id => {
              const task = tasks.find(item => String(item.id) === id);
              if (!task) return null;
              return (
                <Badge key={id} variant="outline" className="text-xs gap-1">
                  {taskLabel(task, objects, collectiefs)}
                  <Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => toggleExcludedTask(id)}>
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
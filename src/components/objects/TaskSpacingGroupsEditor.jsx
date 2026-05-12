import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

export const TASK_TYPES = [
  "Mobiele Controleronde",
  "Externe Controleronde",
  "Externe Sluitronde",
  "Brand- en Sluitronde",
  "Openingsronde",
  "Sluitbegeleiding",
  "Grote collectief",
];

export function expandTaskSpacingGroups(groups = []) {
  const rules = [];

  for (const group of groups || []) {
    const types = [...new Set(group.task_types || [])].filter(Boolean);
    const minutes = Number(group.min_minutes || 0);

    if (types.length < 2 || minutes <= 0) continue;

    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        if (types[i] === types[j]) continue;
        rules.push({
          task_type_a: types[i],
          task_type_b: types[j],
          min_minutes: minutes,
        });
      }
    }
  }

  return rules;
}

export function validateTaskSpacingGroups(groups = []) {
  return (groups || []).flatMap((group, index) => {
    const errors = [];
    const uniqueTypes = [...new Set(group.task_types || [])].filter(Boolean);
    if (uniqueTypes.length < 2) errors.push(`Regel ${index + 1}: Kies minimaal twee verschillende taaksoorten.`);
    if (Number(group.min_minutes || 0) <= 0) errors.push(`Regel ${index + 1}: vul het minimaal aantal minuten in.`);
    return errors;
  });
}

function readableList(items) {
  if (items.length <= 2) return items.join(" en ");
  return `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}`;
}

export function normalizeTaskSpacingGroups(groups = []) {
  return (groups || []).map(group => ({
    ...group,
    task_types: [...new Set(group.task_types || [])].filter(Boolean),
    include_same_type: false,
  }));
}

export default function TaskSpacingGroupsEditor({ groups = [], objectTaskTypes = [], onChange }) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const errors = validateTaskSpacingGroups(safeGroups);

  const availablePresetTypes = objectTaskTypes.length ? objectTaskTypes : TASK_TYPES;

  const updateGroup = (index, field, value) => {
    onChange(normalizeTaskSpacingGroups(safeGroups.map((group, i) => i === index ? { ...group, [field]: value } : group)));
  };

  const toggleTaskType = (index, type) => {
    const selected = safeGroups[index]?.task_types || [];
    updateGroup(index, "task_types", selected.includes(type) ? selected.filter(item => item !== type) : [...selected, type]);
  };

  const addGroup = (preset = false) => {
    onChange(normalizeTaskSpacingGroups([
      ...safeGroups,
      {
        id: `group_${Date.now()}`,
        label: "Taaksoorten uit elkaar houden",
        task_types: preset ? availablePresetTypes : [],
        min_minutes: preset ? 60 : 0,
        include_same_type: false,
      },
    ]));
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Afstand tussen verschillende taaktypes op dit object</h3>
        <p className="text-xs text-slate-500 mt-1">Deze regels worden gebruikt als planningscontrole en optimalisatievoorkeur. Ze voorkomen dat taken logisch te dicht op elkaar komen te liggen, maar blokkeren de planning niet volledig.</p>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
        Voorbeeld: Mobiele Controleronde en Externe Sluitronde moeten minimaal 60 minuten uit elkaar zitten.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addGroup(false)}><Plus className="w-4 h-4 mr-1" /> Regel toevoegen</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => addGroup(true)}>Alle taaksoorten uit elkaar houden</Button>
      </div>

      {safeGroups.map((group, index) => {
        const selected = group.task_types || [];
        return (
          <div key={group.id || index} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label>Taaksoorten</Label>
                <p className="text-xs text-slate-500">Welke verschillende taaksoorten moeten uit elkaar blijven?</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => onChange(safeGroups.filter((_, i) => i !== index))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {TASK_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleTaskType(index, type)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected.includes(type) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimale minuten ertussen</Label>
                <Input type="number" min="1" value={group.min_minutes || ""} onChange={(e) => updateGroup(index, "min_minutes", Number(e.target.value || 0))} placeholder="Bijv. 60" />
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 60, 120].map(minutes => (
                    <Button key={minutes} type="button" variant="outline" size="sm" onClick={() => updateGroup(index, "min_minutes", minutes)}>{minutes} min</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Omschrijving / reden</Label>
                <Input value={group.label || ""} onChange={(e) => updateGroup(index, "label", e.target.value)} placeholder="Bijv. sluitronde niet direct na controleronde" />
              </div>
            </div>

            {selected.length > 0 && Number(group.min_minutes || 0) > 0 && (
              <p className="text-sm text-slate-700 rounded-lg bg-blue-50 border border-blue-200 p-3">
                De planner neemt minimaal {group.min_minutes} minuten afstand mee tussen deze verschillende taaktypes op dit object.
              </p>
            )}
          </div>
        );
      })}

      {errors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3">
          {errors.map((error, index) => <p key={index} className="text-xs text-red-700">{error}</p>)}
        </div>
      )}
    </div>
  );
}

export function TaskSpacingGroupsSummary({ groups = [] }) {
  const validGroups = (groups || []).filter(group => (group.task_types || []).length >= 2 && Number(group.min_minutes || 0) > 0);
  if (!validGroups.length) return null;

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Plannerregels</p>
      <ul className="space-y-1 text-sm text-slate-700">
        {validGroups.map(group => (
          <li key={group.id || group.label}>- {group.min_minutes} min tussen verschillende taaksoorten: {readableList([...new Set(group.task_types || [])].filter(Boolean))}</li>
        ))}
      </ul>
    </div>
  );
}
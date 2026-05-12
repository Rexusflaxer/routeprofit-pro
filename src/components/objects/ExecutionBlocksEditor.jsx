import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

function parseMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatTime(totalMinutes) {
  const value = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function normalizeBlock(block, mainStart, mainEnd) {
  const startRaw = parseMinutes(block.time_window_start);
  const endRaw = parseMinutes(block.time_window_end);
  if (startRaw === null || endRaw === null) return null;

  let start = startRaw;
  let end = endRaw;
  if (mainEnd <= mainStart) mainEnd += 1440;
  if (mainEnd > 1440 && start < mainStart) start += 1440;
  if (end <= start) end += 1440;

  return { start, end, mainStart, mainEnd };
}

export function createSmartBlocks({ count, startTime, endTime }) {
  const countValue = Math.max(1, Number(count || 1));
  const mainStart = parseMinutes(startTime);
  let mainEnd = parseMinutes(endTime);
  if (mainStart === null || mainEnd === null) return [];
  if (mainEnd <= mainStart) mainEnd += 1440;

  if (countValue === 2 && mainEnd > 1440) {
    return [
      { label: "Avond", time_window_start: startTime, time_window_end: "23:00" },
      { label: "Nacht", time_window_start: "01:00", time_window_end: endTime },
    ];
  }

  const segment = Math.floor((mainEnd - mainStart) / countValue);
  return Array.from({ length: countValue }, (_, index) => ({
    label: `Uitvoering ${index + 1}`,
    time_window_start: formatTime(mainStart + (index * segment)),
    time_window_end: formatTime(index === countValue - 1 ? mainEnd : mainStart + ((index + 1) * segment)),
  }));
}

export function validateExecutionBlocks({ blocks, startTime, endTime, durationMinutes }) {
  const mainStart = parseMinutes(startTime);
  let mainEnd = parseMinutes(endTime);
  if (mainStart === null || mainEnd === null) return ["Vul eerst het hoofdvenster in."];
  if (mainEnd <= mainStart) mainEnd += 1440;

  return (blocks || []).flatMap((block, index) => {
    const errors = [];
    if (!block.time_window_start || !block.time_window_end) errors.push(`Blok ${index + 1}: vul start en einde in.`);
    if (block.time_window_start && block.time_window_end && block.time_window_start === block.time_window_end) errors.push(`Blok ${index + 1}: start en einde mogen niet gelijk zijn.`);

    const normalized = normalizeBlock(block, mainStart, mainEnd);
    if (!normalized) return errors;

    if (normalized.start < normalized.mainStart || normalized.end > normalized.mainEnd) {
      errors.push(`Blok ${index + 1}: dit blok valt buiten het hoofdvenster van ${startTime} tot ${endTime}.`);
    }
    if (normalized.end - normalized.start < Number(durationMinutes || 0)) {
      errors.push(`Blok ${index + 1}: de taak duurt ${durationMinutes} minuten, maar dit blok is korter.`);
    }
    return errors;
  });
}

export default function ExecutionBlocksEditor({ form, onChange, errors = [] }) {
  const blocks = Array.isArray(form.custom_execution_blocks) ? form.custom_execution_blocks : [];
  const isOvernight = form.time_window_start && form.time_window_end && form.time_window_end <= form.time_window_start;

  const updateBlock = (index, field, value) => {
    onChange("custom_execution_blocks", blocks.map((block, i) => i === index ? { ...block, [field]: value } : block));
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const nextDay = isOvernight && block.time_window_start && block.time_window_start < form.time_window_start;
        return (
          <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-white border border-slate-200 rounded-lg p-3">
            <div className="md:col-span-4 space-y-1">
              <Label className="text-xs text-slate-500">Label</Label>
              <Input value={block.label || ""} onChange={(e) => updateBlock(index, "label", e.target.value)} placeholder="Bijv. Avond" />
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label className="text-xs text-slate-500">Van</Label>
              <Input type="time" value={block.time_window_start || ""} onChange={(e) => updateBlock(index, "time_window_start", e.target.value)} />
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label className="text-xs text-slate-500">Tot</Label>
              <Input type="time" value={block.time_window_end || ""} onChange={(e) => updateBlock(index, "time_window_end", e.target.value)} />
              {nextDay && <p className="text-xs text-blue-600">Volgende dag</p>}
            </div>
            <Button type="button" variant="ghost" size="icon" className="md:col-span-2 text-red-600" onClick={() => onChange("custom_execution_blocks", blocks.filter((_, i) => i !== index))}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      })}

      {errors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3">
          {errors.map((error, index) => <p key={index} className="text-xs text-red-700">{error}</p>)}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange("custom_execution_blocks", [...blocks, { label: `Uitvoering ${blocks.length + 1}`, time_window_start: "", time_window_end: "" }])}>
        <Plus className="w-4 h-4 mr-1" /> Blok toevoegen
      </Button>
    </div>
  );
}
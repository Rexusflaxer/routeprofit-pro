import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

function defaultBlocks(count) {
  return Array.from({ length: Math.max(1, Number(count || 1)) }, (_, index) => ({
    label: index === 0 ? "Avond" : index === 1 ? "Nacht" : `Uitvoering ${index + 1}`,
    time_window_start: "",
    time_window_end: "",
  }));
}

export default function ExecutionBlocksEditor({ form, onChange }) {
  const blocks = Array.isArray(form.custom_execution_blocks) ? form.custom_execution_blocks : [];
  const mismatch = !!form.use_custom_execution_blocks && Number(form.repeat_count || 1) !== blocks.length;

  const updateBlock = (index, field, value) => {
    onChange("custom_execution_blocks", blocks.map((block, i) => i === index ? { ...block, [field]: value } : block));
  };

  return (
    <div className="md:col-span-2 space-y-3 border-t border-slate-100 pt-3">
      <label className="flex items-start gap-3 cursor-pointer rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
        <Checkbox
          checked={!!form.use_custom_execution_blocks}
          onCheckedChange={(checked) => {
            onChange("use_custom_execution_blocks", !!checked);
            if (checked && blocks.length === 0) onChange("custom_execution_blocks", defaultBlocks(form.repeat_count));
          }}
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium text-slate-800">Aangepaste blokken per uitvoering gebruiken</p>
          <p className="text-xs text-slate-500">Het hoofdvenster blijft de context; blokken mogen over middernacht lopen.</p>
        </div>
      </label>

      {form.use_custom_execution_blocks && (
        <div className="space-y-3">
          {mismatch && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Het aantal uitvoeringen komt niet overeen met het aantal aangepaste blokken.
            </p>
          )}

          {blocks.map((block, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-white border border-slate-200 rounded-lg p-3">
              <div className="md:col-span-4 space-y-1">
                <Label className="text-xs text-slate-500">Uitvoering {index + 1} label</Label>
                <Input value={block.label || ""} onChange={(e) => updateBlock(index, "label", e.target.value)} placeholder="Bijv. Avond" />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label className="text-xs text-slate-500">Van</Label>
                <Input type="time" value={block.time_window_start || ""} onChange={(e) => updateBlock(index, "time_window_start", e.target.value)} />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label className="text-xs text-slate-500">Tot</Label>
                <Input type="time" value={block.time_window_end || ""} onChange={(e) => updateBlock(index, "time_window_end", e.target.value)} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="md:col-span-2 text-red-600" onClick={() => onChange("custom_execution_blocks", blocks.filter((_, i) => i !== index))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={() => onChange("custom_execution_blocks", [...blocks, { label: `Uitvoering ${blocks.length + 1}`, time_window_start: "", time_window_end: "" }])}>
            <Plus className="w-4 h-4 mr-1" /> Blok toevoegen
          </Button>
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Save } from "lucide-react";
import ExecutionBlocksEditor, { createSmartBlocks, validateExecutionBlocks } from "./ExecutionBlocksEditor";
import TaskSpacingRulesEditor from "./TaskSpacingRulesEditor";

const TASK_TYPES = [
  "Mobiele Controleronde",
  "Externe Controleronde",
  "Externe Sluitronde",
  "Brand- en Sluitronde",
  "Openingsronde",
  "Sluitbegeleiding",
  "Grote collectief"
];

const WEEKDAYS = [
  { value: 1, label: "Ma" },
  { value: 2, label: "Di" },
  { value: 3, label: "Wo" },
  { value: 4, label: "Do" },
  { value: 5, label: "Vr" },
  { value: 6, label: "Za" },
  { value: 7, label: "Zo" },
];

function isOvernight(start, end) {
  return !!start && !!end && end <= start;
}

function createInitialForm(task) {
  return task || {
    task_type: TASK_TYPES[0],
    duration_minutes: 15,
    time_window_start: "",
    time_window_end: "",
    repeat_count: 1,
    min_minutes_between_visits: 0,
    use_custom_execution_blocks: false,
    custom_execution_blocks: [],
    task_spacing_rules: [],
    use_arrival_deadline: false,
    arrival_deadline_time: "",
    allow_split: false,
    weekdays: [],
    pricing_type: "per_taak",
    price_amount: 0,
    is_free: false,
  };
}

export default function TaskForm({ task, onSave, onCancel }) {
  const [form, setForm] = useState(createInitialForm(task));
  const [distribution, setDistribution] = useState(task?.use_custom_execution_blocks ? "custom" : "auto");

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleWeekday = (day) => {
    setForm(prev => ({
      ...prev,
      weekdays: (prev.weekdays || []).includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...(prev.weekdays || []), day]
    }));
  };

  const usesArrivalDeadline = form.task_type === "Sluitbegeleiding" || (form.task_type === "Openingsronde" && form.use_arrival_deadline);
  const repeatCount = Math.max(1, Number(form.repeat_count || 1));
  const overMidnight = isOvernight(form.time_window_start, form.time_window_end);
  const canUseEveningNight = repeatCount === 2 && overMidnight;
  const blockErrors = form.use_custom_execution_blocks
    ? validateExecutionBlocks({
        blocks: form.custom_execution_blocks || [],
        startTime: form.time_window_start,
        endTime: form.time_window_end,
        durationMinutes: form.duration_minutes,
      })
    : [];

  useEffect(() => {
    if (repeatCount <= 1 && distribution !== "auto") {
      setDistribution("auto");
      setForm(prev => ({ ...prev, use_custom_execution_blocks: false, custom_execution_blocks: [] }));
    }
  }, [repeatCount, distribution]);

  const applyDistribution = (value) => {
    setDistribution(value);
    if (value === "auto") {
      setForm(prev => ({ ...prev, use_custom_execution_blocks: false, custom_execution_blocks: [] }));
      return;
    }

    const blocks = createSmartBlocks({ count: repeatCount, startTime: form.time_window_start, endTime: form.time_window_end });
    setForm(prev => ({ ...prev, use_custom_execution_blocks: true, custom_execution_blocks: blocks }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.use_custom_execution_blocks && (!(form.custom_execution_blocks || []).length || blockErrors.length > 0)) return;

    onSave({
      ...form,
      use_arrival_deadline: usesArrivalDeadline,
      repeat_count: usesArrivalDeadline ? 1 : repeatCount,
      min_minutes_between_visits: usesArrivalDeadline ? 0 : Math.max(0, Number(form.min_minutes_between_visits || 0)),
      use_custom_execution_blocks: usesArrivalDeadline ? false : !!form.use_custom_execution_blocks,
      custom_execution_blocks: usesArrivalDeadline || !form.use_custom_execution_blocks ? [] : (form.custom_execution_blocks || []).filter(block => block.label || block.time_window_start || block.time_window_end),
      task_spacing_rules: (form.task_spacing_rules || []).filter(rule => rule.task_type_a && rule.task_type_b && Number(rule.min_minutes) > 0),
      time_window_start: usesArrivalDeadline ? "" : form.time_window_start,
      time_window_end: usesArrivalDeadline ? "" : form.time_window_end,
      allow_split: usesArrivalDeadline ? false : form.allow_split,
      split_part_count: 1,
    });
  };

  const pricePerMinute = form.pricing_type === "per_minuut"
    ? Number(form.price_amount || 0)
    : (Number(form.duration_minutes || 0) > 0 ? Number(form.price_amount || 0) / Number(form.duration_minutes || 1) : 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basis</TabsTrigger>
            <TabsTrigger value="repeat">Herhaling</TabsTrigger>
            <TabsTrigger value="advanced">Geavanceerd</TabsTrigger>
            <TabsTrigger value="costs">Kosten</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-5 mt-5">
            <div>
              <h3 className="font-semibold text-slate-900">Wanneer mag deze taak uitgevoerd worden?</h3>
              <p className="text-sm text-slate-500 mt-1">Vul alleen de basis in om snel een taak aan te maken.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type taak</Label>
                <Select value={form.task_type} onValueChange={(v) => handleChange("task_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Taakduur in minuten</Label>
                <Input type="number" min="1" value={form.duration_minutes} onChange={(e) => handleChange("duration_minutes", Number(e.target.value) || 1)} required />
              </div>
            </div>

            {usesArrivalDeadline ? (
              <div className="space-y-2">
                <Label>Aanwezig vóór</Label>
                <Input type="time" value={form.arrival_deadline_time || ""} onChange={(e) => handleChange("arrival_deadline_time", e.target.value)} required />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="space-y-2">
                  <Label>Van</Label>
                  <Input type="time" value={form.time_window_start || ""} onChange={(e) => handleChange("time_window_start", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tot</Label>
                  <Input type="time" value={form.time_window_end || ""} onChange={(e) => handleChange("time_window_end", e.target.value)} />
                </div>
                {form.time_window_start && form.time_window_end && (
                  <p className="md:col-span-2 text-sm text-blue-700">
                    {overMidnight
                      ? `Deze taak mag tussen ${form.time_window_start} en ${form.time_window_end} de volgende ochtend.`
                      : `Deze taak mag tussen ${form.time_window_start} en ${form.time_window_end}.`}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Dagen van de week</Label>
              <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                {WEEKDAYS.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${(form.weekdays || []).includes(day.value) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="repeat" className="space-y-5 mt-5">
            <div>
              <h3 className="font-semibold text-slate-900">Moet deze taak meerdere keren in dezelfde dienst gebeuren?</h3>
              <p className="text-sm text-slate-500 mt-1">Laat dit op 1 staan als de taak maar één keer uitgevoerd hoeft te worden.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aantal uitvoeringen binnen dit venster</Label>
                <Input type="number" min="1" value={repeatCount} onChange={(e) => handleChange("repeat_count", Number(e.target.value) || 1)} disabled={usesArrivalDeadline} />
              </div>
              {repeatCount > 1 && (
                <div className="space-y-2">
                  <Label>Minimale tijd tussen herhalingen</Label>
                  <Input type="number" min="0" value={form.min_minutes_between_visits || ""} onChange={(e) => handleChange("min_minutes_between_visits", Number(e.target.value) || 0)} placeholder="Bijv. 120" />
                  <p className="text-xs text-slate-500">Gebruik dit als dezelfde taak meerdere keren binnen hetzelfde venster moet gebeuren. Bijvoorbeeld een mobiele controleronde één keer in de avond en één keer in de nacht.</p>
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">Deze afstand geldt alleen tussen herhalingen van deze taak.</p>
                  {Number(form.min_minutes_between_visits || 0) <= 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Advies: vul een minimale tijd in zodat herhalingen beter over het venster worden verspreid.</p>
                  )}
                </div>
              )}
            </div>

            {repeatCount > 1 && !usesArrivalDeadline && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button type="button" variant={distribution === "auto" ? "default" : "outline"} onClick={() => applyDistribution("auto")}>Automatisch verspreiden</Button>
                  {canUseEveningNight && <Button type="button" variant={distribution === "evening_night" ? "default" : "outline"} onClick={() => applyDistribution("evening_night")}>Avond + Nacht</Button>}
                  <Button type="button" variant={distribution === "custom" ? "default" : "outline"} onClick={() => applyDistribution("custom")}>Zelf blokken instellen</Button>
                </div>

                {distribution === "evening_night" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(form.custom_execution_blocks || []).map((block, index) => (
                      <div key={index} className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800">
                        <strong>{block.label}:</strong> {block.time_window_start} - {block.time_window_end}{block.time_window_start < form.time_window_start ? " volgende dag" : ""}
                      </div>
                    ))}
                  </div>
                )}

                {distribution === "custom" && <ExecutionBlocksEditor form={form} onChange={handleChange} errors={blockErrors} />}

                <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  {distribution === "auto"
                    ? "De server gebruikt het volledige tijdvenster en verspreidt de herhalingen zo goed mogelijk."
                    : `Deze taak wordt ${repeatCount} keer uitgevoerd${distribution === "evening_night" ? ": één keer in de avond en één keer in de nacht" : ""}.`} Er moet minimaal {form.min_minutes_between_visits || 0} minuten tussen herhalingen zitten.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-5 mt-5">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">Alleen aanpassen als je precies weet wat je doet.</p>

            {form.task_type === "Openingsronde" && (
              <label className="flex items-start gap-3 cursor-pointer rounded-lg bg-white border border-slate-200 px-4 py-3">
                <Checkbox checked={!!form.use_arrival_deadline} onCheckedChange={(v) => handleChange("use_arrival_deadline", !!v)} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Gebruik “aanwezig vóór” tijd</p>
                  <p className="text-xs text-slate-500">De taak moet vóór een vast tijdstip starten.</p>
                </div>
              </label>
            )}

            <label className="flex items-start gap-3 cursor-pointer rounded-lg bg-white border border-slate-200 px-4 py-3">
              <Checkbox checked={!!form.allow_split} onCheckedChange={(v) => handleChange("allow_split", !!v)} className="mt-0.5" disabled={usesArrivalDeadline} />
              <div>
                <p className="text-sm font-medium text-slate-800">Taak mag in meerdere delen worden uitgevoerd</p>
                <p className="text-xs text-slate-500">De planner bepaalt zelf of splitsen nodig is.</p>
              </div>
            </label>

            <TaskSpacingRulesEditor
              rules={form.task_spacing_rules || []}
              onChange={(rules) => handleChange("task_spacing_rules", rules)}
              title="Minimale tijd tussen soorten taken"
              description="Gebruik dit alleen voor uitzonderingen; meestal stel je dit in bij het object."
            />
          </TabsContent>

          <TabsContent value="costs" className="space-y-5 mt-5">
            <label className="flex items-start gap-3 cursor-pointer bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <Checkbox checked={!!form.is_free} onCheckedChange={(v) => handleChange("is_free", !!v)} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Gratis service</p>
                <p className="text-xs text-green-600 mt-0.5">Deze taak wordt niet in rekening gebracht bij de klant.</p>
              </div>
            </label>

            {!form.is_free && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Prijstype</Label>
                  <Select value={form.pricing_type} onValueChange={(v) => handleChange("pricing_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_taak">Per taak</SelectItem>
                      <SelectItem value="per_minuut">Per minuut</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prijs (€)</Label>
                  <Input type="number" step="0.01" min="0" value={form.price_amount || 0} onChange={(e) => handleChange("price_amount", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Prijs per minuut</Label>
                  <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md text-sm font-medium text-slate-900">€{pricePerMinute.toFixed(2)}/min</div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
          <Button type="submit" disabled={form.use_custom_execution_blocks && blockErrors.length > 0} className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
        </div>
      </form>
    </div>
  );
}
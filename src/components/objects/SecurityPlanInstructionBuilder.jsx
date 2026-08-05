import React from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SECURITY_PLAN_ACTION_TYPES,
  createEmptyInstructionBlock,
  createSecurityPlanClientId,
  normalizeInstructionBlocks,
} from "./securityPlanConfig";

function resequence(blocks) {
  return blocks.map((block, blockIndex) => ({
    ...block,
    sequence: blockIndex + 1,
    steps: block.steps.map((step, stepIndex) => ({ ...step, sequence: stepIndex + 1 })),
  }));
}

function move(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function installationLabel(installation) {
  return [installation?.name, installation?.brand, installation?.model, installation?.control_device_name]
    .filter(Boolean)
    .join(" · ") || "Installatie";
}

function StepEditor({ step, stepIndex, stepCount, sections, installations, markers, onChange, onMove, onRemove }) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/45 p-3 shadow-sm backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs font-semibold text-primary">{stepIndex + 1}</div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
            <div className="space-y-1.5">
              <Label htmlFor={`step-title-${step.id}`} className="text-xs font-semibold">Titel</Label>
              <Input id={`step-title-${step.id}`} value={step.title} onChange={event => onChange({ ...step, title: event.target.value })} placeholder="Bijvoorbeeld Controleer expeditiedeur" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Handeling</Label>
              <Select value={step.action_type || "instruction"} onValueChange={value => onChange({ ...step, action_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SECURITY_PLAN_ACTION_TYPES.map(type => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`step-instruction-${step.id}`} className="text-xs font-semibold">Werkinstructie</Label>
            <Textarea id={`step-instruction-${step.id}`} value={step.instruction} onChange={event => onChange({ ...step, instruction: event.target.value })} placeholder="Beschrijf concreet wat de beveiliger controleert of uitvoert, inclusief afwijkingssituaties." rows={3} maxLength={5000} />
            <p className="text-[11px] text-muted-foreground">Neem geen alarm-, schakel- of sleutelcodes op. Koppel daarvoor de installatie; codes blijven apart beveiligd.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Objectsectie</Label>
              <Select value={step.section_id || "none"} onValueChange={value => onChange({ ...step, section_id: value === "none" ? null : value })}>
                <SelectTrigger><SelectValue placeholder="Geen sectie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen sectie</SelectItem>
                  {sections.map(section => <SelectItem key={section.id} value={section.id}>{section.code ? `${section.code} · ` : ""}{section.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Installatie</Label>
              <Select value={step.installation_id || "none"} onValueChange={value => onChange({ ...step, installation_id: value === "none" ? null : value })}>
                <SelectTrigger><SelectValue placeholder="Geen installatie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen installatie gekoppeld</SelectItem>
                  {installations.map(installation => <SelectItem key={installation.id} value={installation.id}>{installationLabel(installation)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Punt op plattegrond</Label>
              <Select value={step.floorplan_marker_id || "none"} onValueChange={value => onChange({ ...step, floorplan_marker_id: value === "none" ? null : value })}>
                <SelectTrigger><SelectValue placeholder="Geen kaartpunt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen kaartpunt</SelectItem>
                  {markers.map(marker => <SelectItem key={marker.id} value={marker.id}>{marker.sequence}. {marker.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={step.required !== false} onCheckedChange={checked => onChange({ ...step, required: checked === true })} />
              Verplichte uitvoeringsstap
            </label>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(-1)} disabled={stepIndex === 0} aria-label="Stap omhoog"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(1)} disabled={stepIndex === stepCount - 1} aria-label="Stap omlaag"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onRemove} aria-label="Stap verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Chapter({ block, blockIndex, blockCount, sections, installations, markers, onChange, onMove, onRemove }) {
  const [expanded, setExpanded] = React.useState(true);
  const updateStep = (stepIndex, step) => {
    const steps = [...block.steps];
    steps[stepIndex] = step;
    onChange({ ...block, steps });
  };
  const addStep = () => onChange({
    ...block,
    steps: [
      ...block.steps,
      {
        id: createSecurityPlanClientId("step"),
        sequence: block.steps.length + 1,
        title: "",
        instruction: "",
        action_type: "instruction",
        section_id: null,
        installation_id: null,
        floorplan_marker_id: null,
        required: true,
      },
    ],
  });
  const moveStep = (index, direction) => onChange({ ...block, steps: move(block.steps, index, direction) });
  const removeStep = index => onChange({ ...block, steps: block.steps.filter((_, itemIndex) => itemIndex !== index) });

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label={expanded ? "Hoofdstuk inklappen" : "Hoofdstuk uitklappen"}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        <div className="min-w-0 flex-1">
          <Input value={block.title} onChange={event => onChange({ ...block, title: event.target.value })} aria-label={`Titel hoofdstuk ${blockIndex + 1}`} className="h-8 border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0" placeholder={`Hoofdstuk ${blockIndex + 1}`} maxLength={200} />
          <p className="text-[11px] text-muted-foreground">{block.steps.length} {block.steps.length === 1 ? "stap" : "stappen"}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(-1)} disabled={blockIndex === 0} aria-label="Hoofdstuk omhoog"><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(1)} disabled={blockIndex === blockCount - 1} aria-label="Hoofdstuk omlaag"><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onRemove} aria-label="Hoofdstuk verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 p-4">
          <Textarea value={block.description} onChange={event => onChange({ ...block, description: event.target.value })} aria-label={`Omschrijving hoofdstuk ${blockIndex + 1}`} placeholder="Optionele toelichting op dit onderdeel van de uitvoering" rows={2} maxLength={2000} />
          {block.steps.map((step, stepIndex) => (
            <StepEditor key={step.id} step={step} stepIndex={stepIndex} stepCount={block.steps.length} sections={sections} installations={installations} markers={markers} onChange={next => updateStep(stepIndex, next)} onMove={direction => moveStep(stepIndex, direction)} onRemove={() => removeStep(stepIndex)} />
          ))}
          {!block.steps.length && (
            <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
              <p className="text-xs font-medium">Nog geen stappen in dit hoofdstuk</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Beschrijf de uitvoering in concrete, afvinkbare handelingen.</p>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={addStep}><Plus className="h-3.5 w-3.5" /> Instructiestap toevoegen</Button>
        </div>
      )}
    </section>
  );
}

export default function SecurityPlanInstructionBuilder({ value, sections = [], installations = [], routeOverlay, onChange }) {
  const blocks = normalizeInstructionBlocks(value);
  const markers = routeOverlay?.markers || [];
  const update = next => onChange(resequence(next));
  const updateBlock = (index, block) => {
    const next = [...blocks];
    next[index] = block;
    update(next);
  };
  const addBlock = () => update([...blocks, createEmptyInstructionBlock(blocks.length + 1)]);
  const removeBlock = index => update(blocks.filter((_, itemIndex) => itemIndex !== index));
  const moveBlock = (index, direction) => update(move(blocks, index, direction));
  const stepCount = blocks.reduce((total, block) => total + block.steps.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Instructies voor deze planvariant</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Groepeer de uitvoering in herkenbare hoofdstukken. Iedere stap kan aan een objectsectie, installatie en punt op de plattegrond worden gekoppeld.</p>
        </div>
        <Button type="button" size="sm" onClick={addBlock}><Plus className="h-3.5 w-3.5" /> Hoofdstuk toevoegen</Button>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
        {stepCount ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <BookOpenText className="h-4 w-4 shrink-0" />}
        {blocks.length} {blocks.length === 1 ? "hoofdstuk" : "hoofdstukken"} · {stepCount} {stepCount === 1 ? "instructiestap" : "instructiestappen"}
      </div>
      {blocks.map((block, index) => (
        <Chapter key={block.id} block={block} blockIndex={index} blockCount={blocks.length} sections={sections} installations={installations} markers={markers} onChange={next => updateBlock(index, next)} onMove={direction => moveBlock(index, direction)} onRemove={() => removeBlock(index)} />
      ))}
      {!blocks.length && (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-5 text-center">
          <BookOpenText className="h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Begin met het eerste instructiehoofdstuk</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">Denk bijvoorbeeld aan Dienststart, Bezoekers, Controleronde, Alarmhandelingen en Overdracht.</p>
          <Button type="button" size="sm" className="mt-4" onClick={addBlock}><Plus className="h-3.5 w-3.5" /> Eerste hoofdstuk toevoegen</Button>
        </div>
      )}
    </div>
  );
}

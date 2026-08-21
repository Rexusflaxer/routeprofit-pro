import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const planningSource = fs.readFileSync(path.join(root, "src/pages/Planning.jsx"), "utf8");

function sourceBetween(start, end) {
  return planningSource.slice(planningSource.indexOf(start), planningSource.indexOf(end));
}

const materializationSource = sourceBetween(
  "const materializeTaskSchedulesInBackground",
  "useEffect(() => {\n    const key = `${bootstrapStart}:${periodEnd}`",
);
const bootstrapMutationSource = sourceBetween(
  "const bootstrapMutation = useMutation",
  "const materializeTaskSchedulesInBackground",
);
const deleteSource = sourceBetween("const deleteTaskOccurrence", "const requestTaskDeletion");
const pasteSource = sourceBetween("const pasteTaskToDate", "const copyServiceToClipboard");

describe("Planning taak-plak- en verwijderlatency", () => {
  it("coalescet materialisatie en ververst pas na de achtergrond-bootstrap", () => {
    expect(materializationSource).toContain("if (taskMaterializationRunning.current) return");
    expect(materializationSource).toContain("while (taskMaterializationRequest.current)");
    expect(materializationSource).toContain("await bootstrapMutation.mutateAsync(payload)");
    expect(materializationSource).toContain("await refreshScheduler.current?.flush()");
    expect(materializationSource).toContain("if (taskMaterializationRequest.current) materializeTaskSchedulesInBackground()");
    expect(materializationSource).not.toContain("taskMaterializationRequest.current = null;\n      } finally");
  });

  it("ververst nieuwe of herstelde taak-occurrences direct na de openingsbootstrap", () => {
    expect(bootstrapMutationSource).toContain("result?.created_task_occurrence_ids?.length");
    expect(bootstrapMutationSource).toContain("result?.refreshed_task_occurrence_ids?.length");
    expect(bootstrapMutationSource).toContain("result?.superseded_task_occurrence_ids?.length");
    expect(bootstrapMutationSource).toContain("result?.repaired_single_task_occurrence_ids?.length");
    expect(bootstrapMutationSource).toContain("void refreshScheduler.current?.flush()");
  });

  it("verwijdert één taakdatum met één autoritatief exception-intent", () => {
    expect(deleteSource).toContain('action: "change_single_task_occurrence"');
    expect(deleteSource).toContain("occurrence_id: occurrence.id");
    expect(deleteSource).toContain("source_revision_id: occurrence.object_task_schedule_revision_id || null");
    expect(deleteSource).toContain("expected_occurrence_revision: Number(occurrence.revision || 1)");
    expect(deleteSource).toContain("cancel_occurrence: true");
    expect(deleteSource).toContain("confirm_remove_outside_shifts: true");
    expect(deleteSource).toContain("reconcilePlanningResult(result)");
    expect(deleteSource).toContain("refreshPlanningInBackground()");
    expect(deleteSource).not.toContain("await bootstrapMutation");
    expect(deleteSource).not.toContain("await refreshPlanning(");
    expect(deleteSource).not.toContain('action: "list_object_tasks"');
    expect(deleteSource).not.toContain('action: "cancel_task_shift"');
    expect(deleteSource).not.toContain('action: "stop_object_task_series"');
    expect(deleteSource).not.toContain('action: "add_object_task_series"');
    expect(deleteSource).not.toContain("addDays(");
  });

  it("laat plakken niet wachten en verzint geen occurrence vóór autoritatieve materialisatie", () => {
    expect(pasteSource).toContain("const result = await runIntentMutation");
    expect(pasteSource).toContain("reconcileTaskDefinitionVersion(result)");
    expect(pasteSource).toContain("materializeTaskSchedulesInBackground()");
    expect(pasteSource).not.toContain("await bootstrapMutation");
    expect(pasteSource).not.toContain("await refreshPlanning(");
    expect(pasteSource).not.toContain("task_occurrences:");
    expect(pasteSource).not.toContain("lifecycle_status:");
  });
});

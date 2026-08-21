import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const planningSource = fs.readFileSync(path.join(root, "src/pages/Planning.jsx"), "utf8");
const clientSource = fs.readFileSync(
  path.join(root, "src/components/planning/planningApiClient.js"),
  "utf8",
);
const saveTaskEditSource = planningSource.slice(
  planningSource.indexOf("const saveTaskEdit"),
  planningSource.indexOf("const copyTaskToClipboard"),
);

describe("Planning wijziging van één taak-occurrence", () => {
  it("gebruikt het revision-safe planningApi-intentcontract zonder voorafgaande cataloguscall", () => {
    expect(saveTaskEditSource).toContain('action: "change_single_task_occurrence"');
    expect(saveTaskEditSource).toContain("runIntentMutation(");
    expect(saveTaskEditSource).toContain("occurrence_id: occurrence.id");
    expect(saveTaskEditSource).toContain("source_revision_id: occurrence.object_task_schedule_revision_id || null");
    expect(saveTaskEditSource).toContain("start_time: startTime");
    expect(saveTaskEditSource).toContain("end_time: endTime");
    expect(saveTaskEditSource).toContain("expected_occurrence_revision: Number(occurrence.revision || 1)");
    expect(saveTaskEditSource).toContain("confirm_remove_outside_shifts: confirmRemoval");

    expect(saveTaskEditSource).not.toContain("list_object_tasks");
    expect(saveTaskEditSource).not.toContain("customer_id:");
    expect(saveTaskEditSource).not.toContain("object_id:");
    expect(saveTaskEditSource).not.toContain("task_definition_id:");
    expect(saveTaskEditSource).not.toContain("series_id:");
    expect(saveTaskEditSource).not.toContain("service_date:");
  });

  it("reconcilet de autoritatieve response direct en plant alleen een achtergrondrefresh", () => {
    expect(saveTaskEditSource).toContain("reconcilePlanningResult(result)");
    expect(saveTaskEditSource).toContain("refreshPlanningInBackground()");
    expect(saveTaskEditSource).not.toContain("bootstrapMutation");
    expect(saveTaskEditSource).not.toContain("refreshPlanning()");
  });

  it("bevat geen compatibiliteitsroute naar de oude losse functie meer", () => {
    expect(planningSource).not.toContain("invokeSinglePlanningTaskChange");
    expect(clientSource).not.toContain("changeSinglePlanningTask");
  });
});

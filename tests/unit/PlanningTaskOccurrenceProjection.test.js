import { describe, expect, it } from "vitest";
import { projectSegmentsToCurrentTaskOccurrences } from "@/components/planning/planningTaskOccurrenceProjection";

const baseOccurrence = {
  source_key: "task-source:r1",
  logical_source_key: "task-source",
  object_task_definition_id: "definition-reception",
  company_id: "company-operating",
  service_responsible_company_id: "company-operating",
  customer_id: "customer-1",
  object_id: "object-1",
  security_plan_id: "security-plan-1",
  security_plan_revision_id: "security-plan-revision-1",
  security_plan_checksum: "security-plan-checksum-1",
  task_type: "reception",
  task_type_key: "reception",
  custom_task_type: null,
  execution_mode: "continuous",
  service_date: "2026-08-24",
  end_date: "2026-08-24",
  window_start_time: "06:30",
  window_end_time: "18:00",
  timezone: "Europe/Amsterdam",
  required_minutes: 690,
  task_name_snapshot: "Receptiedienst",
  customer_name_snapshot: "Klant 1",
  object_name_snapshot: "Object 1",
  instructions_snapshot: "Meld bezoekers aan.",
};

const planningImpactFields = [
  "company_id",
  "service_responsible_company_id",
  "customer_id",
  "object_id",
  "security_plan_id",
  "security_plan_revision_id",
  "security_plan_checksum",
  "task_type",
  "task_type_key",
  "custom_task_type",
  "execution_mode",
  "service_date",
  "end_date",
  "window_start_time",
  "window_end_time",
  "timezone",
  "required_minutes",
  "task_name_snapshot",
  "customer_name_snapshot",
  "object_name_snapshot",
  "instructions_snapshot",
];

function backendPlanningImpactSnapshot(value, extra = {}) {
  return {
    ...Object.fromEntries(planningImpactFields.map(field => [field, value[field]])),
    ...extra,
  };
}

function occurrence(id, overrides = {}) {
  return { ...baseOccurrence, id, lifecycle_status: "active", ...overrides };
}

function segment(id, shiftId, overrides = {}) {
  return {
    id,
    shift_id: shiftId,
    task_occurrence_id: "occurrence-old",
    start_date: "2026-08-24",
    end_date: "2026-08-24",
    start_time: "06:30",
    end_time: "15:30",
    status: "draft",
    ...overrides,
  };
}

function sourceChange(overrides = {}) {
  return {
    id: "source-change-1",
    status: "open",
    change_type: "schedule_changed",
    source_task_occurrence_id: "occurrence-old",
    replacement_task_occurrence_id: "occurrence-current",
    shift_id: "shift-day",
    shift_ids: ["shift-day"],
    segment_ids: ["segment-day"],
    previous_snapshot: { ...baseOccurrence },
    desired_snapshot: { ...baseOccurrence },
    ...overrides,
  };
}

describe("planning task occurrence projection", () => {
  it("ververst commerciele segmentvelden ook wanneer de gekoppelde occurrence al actief is", () => {
    const activeOccurrence = occurrence("occurrence-old", {
      selling_company_id: "company-selling",
      service_responsible_company_id: "company-operating",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: {
        schema_version: 1,
        status: "resolved",
        customer_contract_id: "contract-1",
        customer_contract_line_id: "line-1",
      },
    });
    const staleSegment = segment("segment-day", "shift-day", {
      task_type_key: "fire_watch",
      commercial_routing_status: "missing_contract",
      customer_contract_id: null,
      customer_contract_line_id: null,
    });

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [staleSegment],
      [activeOccurrence],
    );

    expect(projected).toMatchObject({
      task_occurrence_id: activeOccurrence.id,
      selling_company_id: "company-selling",
      service_responsible_company_id: "company-operating",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
    });
    expect(projected.task_type_key).toBe("fire_watch");
    expect(projected.source_task_occurrence_id).toBeUndefined();
    expect(staleSegment.commercial_routing_status).toBe("missing_contract");
  });

  it("herstelt legacy segmenten via de directe vervangingspointer en houdt de brondata intact", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      source_key: "legacy:definition-reception:2026-08-24",
      logical_source_key: null,
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-current",
    });
    const routingSnapshot = {
      schema_version: 1,
      status: "resolved",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      selling_company_id: "company-selling",
    };
    const currentOccurrence = occurrence("occurrence-current", {
      source_key: "task-source:r2",
      supersedes_task_occurrence_id: oldOccurrence.id,
      selling_company_id: "company-selling",
      service_responsible_company_id: "company-operating",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: routingSnapshot,
    });
    const input = [
      segment("segment-day", "shift-day", {
        source_task_occurrence_id: "occurrence-original-root",
        selling_company_id: null,
        customer_contract_id: null,
      }),
      segment("segment-evening", "shift-evening", {
        start_time: "15:30",
        end_time: "18:00",
      }),
    ];
    const before = structuredClone(input);

    const projected = projectSegmentsToCurrentTaskOccurrences(
      input,
      [oldOccurrence, currentOccurrence],
    );

    expect(projected.map(item => item.task_occurrence_id)).toEqual([
      currentOccurrence.id,
      currentOccurrence.id,
    ]);
    expect(projected[0]).toMatchObject({
      source_task_occurrence_id: "occurrence-original-root",
      selling_company_id: "company-selling",
      service_responsible_company_id: "company-operating",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: routingSnapshot,
    });
    expect(projected[0].task_type_key).toBeUndefined();
    expect(projected[1].source_task_occurrence_id).toBe(oldOccurrence.id);
    expect(input).toEqual(before);
    expect(projected[0]).not.toBe(input[0]);
  });

  it("gebruikt alleen een open bronwijziging die exact bij het segment hoort", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
    });
    const currentOccurrence = occurrence("occurrence-current", {
      logical_source_key: "different-logical-key",
      source_key: "different-source-key",
    });
    const matching = segment("segment-day", "shift-day");
    const other = segment("segment-other", "shift-other");

    const projected = projectSegmentsToCurrentTaskOccurrences(
      [matching, other],
      [oldOccurrence, currentOccurrence],
      [sourceChange()],
    );

    expect(projected[0]).toMatchObject({
      task_occurrence_id: currentOccurrence.id,
      source_task_occurrence_id: oldOccurrence.id,
    });
    expect(projected[1]).toBe(other);
  });

  it("kan een ontbrekende bron alleen met eenduidige vorige en gewenste snapshots herstellen", () => {
    const currentOccurrence = occurrence("occurrence-current", {
      logical_source_key: "different-logical-key",
    });
    const linkedSegment = segment("segment-day", "shift-day");

    const projected = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [currentOccurrence],
      [sourceChange({
        object_task_definition_id: baseOccurrence.object_task_definition_id,
        previous_snapshot: backendPlanningImpactSnapshot(baseOccurrence),
        desired_snapshot: backendPlanningImpactSnapshot(baseOccurrence),
      })],
    );

    expect(projected[0]).toMatchObject({
      task_occurrence_id: currentOccurrence.id,
      source_task_occurrence_id: "occurrence-old",
    });
  });

  it.each([
    ["logical_source_key", { logical_source_key: "task-source" }],
    ["source_key", { logical_source_key: null, source_key: "shared-source" }],
  ])("gebruikt één unieke actieve %s als laatste fallback", (_field, sourceKeys) => {
    const oldOccurrence = occurrence("occurrence-old", {
      ...sourceKeys,
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
    });
    const currentOccurrence = occurrence("occurrence-current", sourceKeys);

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [segment("segment-day", "shift-day")],
      [oldOccurrence, currentOccurrence],
    );

    expect(projected.task_occurrence_id).toBe(currentOccurrence.id);
  });

  it.each([
    ["taakdefinitie", { object_task_definition_id: "definition-other" }],
    ["uitvoerend bedrijf", { company_id: "company-other" }],
    ["dienstverantwoordelijk bedrijf", { service_responsible_company_id: "company-other" }],
    ["klant", { customer_id: "customer-2" }],
    ["object", { object_id: "object-2" }],
    ["beveiligingsplan", { security_plan_id: "security-plan-2" }],
    ["beveiligingsplanrevisie", { security_plan_revision_id: "security-plan-revision-2" }],
    ["beveiligingsplanchecksum", { security_plan_checksum: "security-plan-checksum-2" }],
    ["ruwe taaksoort", { task_type: "reception_legacy" }],
    ["eigen taaksoort", { custom_task_type: "baliedienst" }],
    ["startdatum", { service_date: "2026-08-25", end_date: "2026-08-25" }],
    ["einddatum", { end_date: "2026-08-25" }],
    ["begintijd", { window_start_time: "07:00", required_minutes: 660 }],
    ["eindtijd", { window_end_time: "17:00", required_minutes: 630 }],
    ["tijdzone", { timezone: "UTC" }],
    ["uitvoeringsvorm", { execution_mode: "time_window" }],
    ["benodigde minuten", { required_minutes: 600 }],
    ["taaksoort", { task_type: "fire_watch", task_type_key: "fire_watch" }],
    ["taaknaam", { task_name_snapshot: "Andere receptietaak" }],
    ["klantnaam", { customer_name_snapshot: "Klant 2" }],
    ["objectnaam", { object_name_snapshot: "Object 2" }],
    ["instructies", { instructions_snapshot: "Volg andere instructies." }],
  ])("weigert projectie wanneer de operationele %s verschilt", (_label, replacementPatch) => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-current",
    });
    const currentOccurrence = occurrence("occurrence-current", replacementPatch);
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("weigert een gestopte taak ook als een actieve sleutelgenoot bestaat", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
    });
    const currentOccurrence = occurrence("occurrence-current");
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
      [sourceChange({
        change_type: "schedule_stopped",
        replacement_task_occurrence_id: null,
        desired_snapshot: null,
      })],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("weigert conflicterende directe en bronwijzigingspointers", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-direct",
    });
    const directOccurrence = occurrence("occurrence-direct");
    const changedOccurrence = occurrence("occurrence-current");
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, directOccurrence, changedOccurrence],
      [sourceChange()],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("weigert een niet-unieke actieve sleutel-fallback", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
    });
    const first = occurrence("occurrence-current-a");
    const second = occurrence("occurrence-current-b");
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, first, second],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("volgt een eenduidige vervangingsketen en weigert cycli", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-middle",
    });
    const middleOccurrence = occurrence("occurrence-middle", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-current",
    });
    const currentOccurrence = occurrence("occurrence-current");
    const chainSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [chainSegment],
      [oldOccurrence, middleOccurrence, currentOccurrence],
    );
    expect(projected.task_occurrence_id).toBe(currentOccurrence.id);

    const cyclicMiddle = {
      ...middleOccurrence,
      superseded_by_task_occurrence_id: oldOccurrence.id,
    };
    const cycleSegment = segment("segment-cycle", "shift-cycle");
    const [cyclicProjection] = projectSegmentsToCurrentTaskOccurrences(
      [cycleSegment],
      [oldOccurrence, cyclicMiddle],
    );
    expect(cyclicProjection).toBe(cycleSegment);
  });

  it.each(["missing", "cancelled"])("weigert een %s directe vervanger", status => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-current",
    });
    const currentOccurrences = status === "missing"
      ? []
      : [occurrence("occurrence-current", { lifecycle_status: "cancelled" })];
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, ...currentOccurrences],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("houdt een bewezen commerciele self-repair op de gekoppelde occurrence", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-old",
    });
    const currentOccurrence = occurrence("occurrence-current");
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
      [sourceChange({ replacement_task_occurrence_id: oldOccurrence.id })],
    );

    expect(projected).toMatchObject({
      task_occurrence_id: oldOccurrence.id,
    });
    expect(projected.source_task_occurrence_id).toBeUndefined();
  });

  it("herstelt een self-pointer met echte backend impactsnapshots zonder taakdefinitieveld", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-old",
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_status: "missing_contract",
    });
    const currentOccurrence = occurrence("occurrence-current", {
      selling_company_id: "company-selling",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
    });
    const previousSnapshot = backendPlanningImpactSnapshot(oldOccurrence, {
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_status: "missing_contract",
    });
    const desiredSnapshot = backendPlanningImpactSnapshot(oldOccurrence, {
      selling_company_id: "company-selling",
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
    });
    expect(previousSnapshot.object_task_definition_id).toBeUndefined();
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
      [sourceChange({
        object_task_definition_id: oldOccurrence.object_task_definition_id,
        customer_id: oldOccurrence.customer_id,
        object_id: oldOccurrence.object_id,
        service_date: oldOccurrence.service_date,
        replacement_task_occurrence_id: oldOccurrence.id,
        previous_snapshot: previousSnapshot,
        desired_snapshot: desiredSnapshot,
      })],
    );

    expect(projected).toMatchObject({
      task_occurrence_id: oldOccurrence.id,
      customer_contract_id: "contract-1",
      customer_contract_line_id: "line-1",
      commercial_routing_status: "resolved",
    });
    expect(projected.source_task_occurrence_id).toBeUndefined();
  });

  it("weigert een self-pointer wanneer een backend impactsnapshot onvolledig is", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-old",
    });
    const currentOccurrence = occurrence("occurrence-current");
    const incompletePrevious = backendPlanningImpactSnapshot(oldOccurrence);
    delete incompletePrevious.security_plan_checksum;
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
      [sourceChange({
        object_task_definition_id: oldOccurrence.object_task_definition_id,
        previous_snapshot: incompletePrevious,
        desired_snapshot: backendPlanningImpactSnapshot(oldOccurrence),
        replacement_task_occurrence_id: oldOccurrence.id,
      })],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("weigert een self-pointerfallback wanneer de bronwijziging toch roosterimpact bewijst", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-old",
    });
    const currentOccurrence = occurrence("occurrence-current");
    const linkedSegment = segment("segment-day", "shift-day");
    const operationalChange = sourceChange({
      replacement_task_occurrence_id: oldOccurrence.id,
      desired_snapshot: {
        ...baseOccurrence,
        window_end_time: "17:00",
        required_minutes: 630,
      },
    });

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
      [operationalChange],
    );

    expect(projected).toBe(linkedSegment);
  });

  it("weigert projectie wanneer verplichte operationele identiteit ontbreekt", () => {
    const oldOccurrence = occurrence("occurrence-old", {
      customer_id: null,
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: "occurrence-current",
    });
    const currentOccurrence = occurrence("occurrence-current", { customer_id: null });
    const linkedSegment = segment("segment-day", "shift-day");

    const [projected] = projectSegmentsToCurrentTaskOccurrences(
      [linkedSegment],
      [oldOccurrence, currentOccurrence],
    );

    expect(projected).toBe(linkedSegment);
  });
});

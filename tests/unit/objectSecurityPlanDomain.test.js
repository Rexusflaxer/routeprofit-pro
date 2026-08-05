import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SECURITY_PLAN_ACTION_TYPES,
  SECURITY_PLAN_DURATION_MODES,
  SECURITY_PLAN_MARKER_TYPES,
  SECURITY_PLAN_SECTION_POLICIES,
  buildSecurityPlanReadiness,
  normalizeInstructionBlocks,
  normalizeRouteOverlay,
  securityPlanDurationLabel,
  securityPlanTaskTypeLabel,
} from "@/components/objects/securityPlanConfig";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "base44/entities", `${name}.jsonc`), "utf8"));
}

function plan(overrides = {}) {
  return {
    id: "plan-saturn",
    customer_id: "customer-saturn",
    object_id: "object-saturn",
    task_type: "fire_closing_round",
    variant_name: "Productieavond",
    execution_mode: "round",
    status: "draft",
    version: 1,
    ...overrides,
  };
}

function revision(overrides = {}) {
  return {
    id: "revision-saturn-1",
    security_plan_id: "plan-saturn",
    customer_id: "customer-saturn",
    object_id: "object-saturn",
    revision_number: 1,
    status: "draft",
    duration_mode: "fixed",
    duration_minutes: 45,
    section_policy: "not_applicable",
    default_section_ids: [],
    allowed_section_ids: [],
    instruction_blocks: [{
      id: "block-1",
      sequence: 1,
      title: "Sluitronde",
      description: "",
      steps: [{
        id: "step-1",
        sequence: 1,
        title: "Controleer de receptie",
        instruction: "Controleer of alle bezoekers zijn uitgeschreven.",
        action_type: "inspect",
        section_id: null,
        installation_id: null,
        floorplan_marker_id: null,
        required: true,
      }],
    }],
    route_overlay: null,
    version: 1,
    ...overrides,
  };
}

const saturnSections = Array.from({ length: 8 }, (_, index) => ({
  id: `section-${index + 1}`,
  code: `S${index + 1}`,
  name: `Sectie ${index + 1}`,
}));

describe("Beveiligingsplan V2 domeincontract", () => {
  it("houdt frontendkeuzes exact gelijk aan de revision-schema-enums", () => {
    const revisionSchema = schema("ObjectSecurityPlanRevision");
    const stepProperties = revisionSchema.properties.instruction_blocks.items.properties.steps.items.properties;
    const markerProperties = revisionSchema.properties.route_overlay.properties.markers.items.properties;

    expect(SECURITY_PLAN_DURATION_MODES.map(item => item.key)).toEqual(
      revisionSchema.properties.duration_mode.enum,
    );
    expect(SECURITY_PLAN_SECTION_POLICIES.map(item => item.key).sort()).toEqual(
      [...revisionSchema.properties.section_policy.enum].sort(),
    );
    expect(SECURITY_PLAN_ACTION_TYPES.map(item => item.key).sort()).toEqual(
      [...stepProperties.action_type.enum].sort(),
    );
    expect(SECURITY_PLAN_MARKER_TYPES.map(item => item.key).sort()).toEqual(
      [...markerProperties.marker_type.enum].sort(),
    );
  });

  it("ondersteunt Saturn-varianten met drie verschillende duurmodellen", () => {
    const fullRound = buildSecurityPlanReadiness({
      plan: plan({ variant_name: "Volledig" }),
      revision: revision({ duration_mode: "fixed", duration_minutes: 75 }),
    });
    const weekdayReception = buildSecurityPlanReadiness({
      plan: plan({
        task_type: "reception",
        variant_name: "Werkdagen",
        execution_mode: "continuous_post",
      }),
      revision: revision({ duration_mode: "schedule_defined", duration_minutes: null }),
    });
    const durationlessInstruction = buildSecurityPlanReadiness({
      plan: plan({ variant_name: "Naslag", execution_mode: "other" }),
      revision: revision({ duration_mode: "none", duration_minutes: null }),
    });

    expect(fullRound.publishable).toBe(true);
    expect(weekdayReception.publishable).toBe(true);
    expect(durationlessInstruction.publishable).toBe(true);
    expect(securityPlanDurationLabel(null, revision({ duration_mode: "fixed", duration_minutes: 75 }))).toBe("75 min.");
    expect(securityPlanDurationLabel(null, revision({ duration_mode: "schedule_defined", duration_minutes: null }))).toBe("Door rooster bepaald");
    expect(securityPlanDurationLabel(null, revision({ duration_mode: "none", duration_minutes: null }))).toBe("Geen vaste duur");
  });

  it("blokkeert een ongeldige vaste duur maar niet een ontbrekende route", () => {
    const invalidDuration = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({ duration_minutes: null }),
    });
    expect(invalidDuration.publishable).toBe(false);
    expect(invalidDuration.blocking.join(" ")).toMatch(/duur/i);

    const noRoute = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({ floorplan_id: "floorplan-1", floorplan_revision: 3 }),
      floorplans: [{ id: "floorplan-1", revision: 3 }],
    });
    expect(noRoute.publishable).toBe(true);
    expect(noRoute.warnings.join(" ")).toMatch(/looproute/i);
  });

  it("handhaaft de hybride Saturn-secties als standaardset binnen de toegestane set", () => {
    const valid = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1", "section-2"],
        allowed_section_ids: saturnSections.map(section => section.id),
      }),
      sections: saturnSections,
    });
    expect(valid.publishable).toBe(true);

    const invalid = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1", "section-9"],
        allowed_section_ids: ["section-1", "section-2"],
      }),
      sections: [...saturnSections, { id: "section-9", code: "S9", name: "Sectie 9" }],
    });
    expect(invalid.publishable).toBe(false);
    expect(invalid.blocking.join(" ")).toMatch(/toegestane sectie/i);

    const emptyFixed = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({ section_policy: "fixed" }),
      sections: saturnSections,
    });
    expect(emptyFixed.publishable).toBe(false);
    expect(emptyFixed.blocking.join(" ")).toMatch(/standaardsectie/i);

    const emptyAllowed = buildSecurityPlanReadiness({
      plan: plan(),
      revision: revision({
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1"],
      }),
      sections: saturnSections,
    });
    expect(emptyAllowed.publishable).toBe(false);
    expect(emptyAllowed.blocking.join(" ")).toMatch(/toegestane sectie/i);
  });

  it("normaliseert stap- en routevolgorde zonder meerdere secties in één stap", () => {
    const blocks = normalizeInstructionBlocks([{
      id: "block-b",
      title: "Afronding",
      steps: [
        { id: "step-b", title: "Tweede", instruction: "Sluit sectie 2.", section_id: "section-2" },
        { id: "step-a", title: "Eerste", instruction: "Sluit sectie 1.", section_id: "section-1" },
      ],
    }]);
    expect(blocks[0].sequence).toBe(1);
    expect(blocks[0].steps.map(step => step.sequence)).toEqual([1, 2]);
    expect(blocks[0].steps.map(step => step.section_id)).toEqual(["section-2", "section-1"]);
    expect(blocks[0].steps.every(step => !Object.hasOwn(step, "section_ids"))).toBe(true);

    const route = normalizeRouteOverlay({
      path: [{ x: -1, y: 0.25 }, { x: 1.4, y: 2 }],
      markers: [{ id: "marker-1", x: 0.5, y: 0.5, marker_type: "checkpoint" }],
    });
    expect(route.path).toEqual([
      { x: 0, y: 0.25, sequence: 1 },
      { x: 1, y: 1, sequence: 2 },
    ]);
    expect(route.start_point).toEqual({ x: 0, y: 0.25, label: null });
    expect(route.end_point).toEqual({ x: 1, y: 1, label: null });
    expect(route.start_point).not.toHaveProperty("sequence");
    expect(route.end_point).not.toHaveProperty("sequence");
  });

  it("houdt legacy labels leesbaar tijdens de additieve migratie", () => {
    expect(securityPlanTaskTypeLabel({ category: "reception", title: "Legacy receptie" })).toBe("Receptie");
    expect(securityPlanTaskTypeLabel({ task_type: "other", custom_task_type: "Terreinwacht" })).toBe("Terreinwacht");

    const planSchema = schema("ObjectSecurityPlan");
    expect(planSchema.required).toEqual(expect.arrayContaining([
      "category",
      "title",
      "scope_type",
    ]));
    expect(planSchema.properties).toHaveProperty("migration_review_required");
    expect(planSchema.properties.status.enum).toEqual(expect.arrayContaining(["active", "draft", "published", "archived"]));
  });
});

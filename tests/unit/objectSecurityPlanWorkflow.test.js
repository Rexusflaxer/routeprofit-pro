import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeRead, invokeMutation, createKey } = vi.hoisted(() => ({
  invokeRead: vi.fn(),
  invokeMutation: vi.fn(),
  createKey: vi.fn(action => `${action}:generated`),
}));

vi.mock("@/components/customers/customerDossierUtils", () => ({
  invokeCustomerPlatformRead: invokeRead,
  invokeCustomerPlatformMutation: invokeMutation,
  createCustomerMutationKey: createKey,
}));

import {
  archiveObjectSection,
  archiveObjectSecurityPlan,
  createObjectSecurityPlan,
  createSecurityPlanMutationKey,
  duplicateObjectSecurityPlan,
  getObjectSecurityPlan,
  listObjectSections,
  listObjectSecurityPlans,
  migrateLegacyObjectSecurityPlans,
  normalizeSecurityPlanRevision,
  normalizeSecurityPlanSummary,
  publishObjectSecurityPlan,
  saveObjectSecurityPlanDraft,
  upsertObjectSection,
} from "@/components/objects/securityPlanWorkflow";

describe("securityPlanWorkflow", () => {
  beforeEach(() => {
    invokeRead.mockReset();
    invokeMutation.mockReset();
    createKey.mockClear();
  });

  it("maakt herkenbare mutatiesleutels en leest altijd binnen klant-/objectscope", async () => {
    invokeRead.mockResolvedValue({ items: [] });

    expect(createSecurityPlanMutationKey("create")).toBe("object-security-plan:create:generated");
    await listObjectSecurityPlans({
      customerId: "customer-saturn",
      objectId: "object-saturn",
      taskType: "fire_closing_round",
      search: "productie",
      page: 2,
      pageSize: 25,
    });
    await getObjectSecurityPlan({
      customerId: "customer-saturn",
      objectId: "object-saturn",
      securityPlanId: "plan-1",
    });
    await listObjectSections({ customerId: "customer-saturn", objectId: "object-saturn" });

    expect(invokeRead).toHaveBeenNthCalledWith(1, {
      action: "list_object_security_plans",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      task_type: "fire_closing_round",
      search: "productie",
      page: 2,
      page_size: 25,
    });
    expect(invokeRead).toHaveBeenNthCalledWith(2, {
      action: "get_object_security_plan",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      security_plan_id: "plan-1",
    });
    expect(invokeRead).toHaveBeenNthCalledWith(3, {
      action: "list_object_sections",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      status: "active",
    });
  });

  it("normaliseert de paginatie-onafhankelijke categoriesamenvatting voor de kaartweergave", async () => {
    invokeRead.mockResolvedValue({
      items: [{ id: "plan-1", task_type: "fire_closing_round", variant_name: "Volledig", version: 1 }],
      total: 121,
      page: 1,
      page_size: 25,
      has_more: true,
      migration_required_count: "4",
      category_summary: [{
        task_type: "fire_closing_round",
        total: "42",
        published: 30,
        draft: 15,
        attention: 3,
      }],
    });

    const result = await listObjectSecurityPlans({
      customerId: "customer-saturn",
      objectId: "object-saturn",
      pageSize: 25,
    });

    expect(result).toMatchObject({
      total: 121,
      page: 1,
      page_size: 25,
      has_more: true,
      migration_required_count: 4,
      category_summary: [{
        task_type: "fire_closing_round",
        total: 42,
        published: 30,
        draft: 15,
        attention: 3,
      }],
    });
  });

  it("maakt een concept met expected_version 0 en een genormaliseerde revisiepayload", async () => {
    invokeMutation.mockResolvedValue({ plan: { id: "plan-1", version: 1 } });

    await createObjectSecurityPlan({
      customerId: "customer-saturn",
      objectId: "object-saturn",
      idempotencyKey: "create-plan-key",
      data: {
        task_type: "fire_closing_round",
        variant_name: "Productieavond",
        execution_mode: "round",
        duration_mode: "fixed",
        duration_minutes: "45",
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1", "section-1"],
        allowed_section_ids: ["section-1", "section-2", "section-2"],
        instruction_blocks: [{
          id: "block-1",
          title: "Uitvoering",
          steps: [{
            id: "step-1",
            title: "Controleer sectie 1",
            instruction: "Controleer en sluit sectie 1.",
            action_type: "inspect",
            section_id: "section-1",
          }],
        }],
        module_assignments: [{
          id: "module-link-1",
          module_id: "module-items",
          module_revision_id: "module-revision-2",
          access_mode: "register",
          quick_action: true,
          instruction: "Controleer openstaande uitgiftes.",
        }],
        route_overlay: { path: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }] },
      },
    });

    expect(invokeMutation).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_object_security_plan",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      idempotency_key: "create-plan-key",
      expected_version: 0,
      data: expect.objectContaining({
        duration_minutes: 45,
        default_section_ids: ["section-1"],
        allowed_section_ids: ["section-1", "section-2"],
        module_assignments: [{
          id: "module-link-1",
          sequence: 1,
          module_id: "module-items",
          module_revision_id: "module-revision-2",
          access_mode: "register",
          quick_action: true,
          instruction: "Controleer openstaande uitgiftes.",
        }],
        route_overlay: expect.objectContaining({
          schema_version: "loq-route-v1",
          coordinate_space: "normalized",
          path: [
            { x: 0.2, y: 0.3, sequence: 1 },
            { x: 0.8, y: 0.7, sequence: 2 },
          ],
        }),
      }),
    }));
  });

  it("stuurt een werkelijk ontbrekende route als null zodat publiceren warning-only blijft", async () => {
    invokeMutation.mockResolvedValue({ plan: { id: "plan-2", version: 1 } });

    await createObjectSecurityPlan({
      customerId: "customer-saturn",
      objectId: "object-saturn",
      idempotencyKey: "create-no-route",
      data: {
        task_type: "reception",
        variant_name: "Werkdagen",
        execution_mode: "continuous_post",
        duration_mode: "schedule_defined",
        instruction_blocks: [{
          id: "block-1",
          title: "Receptie",
          steps: [{ id: "step-1", title: "Start", instruction: "Open de receptie." }],
        }],
        route_overlay: null,
      },
    });

    expect(invokeMutation.mock.calls[0][0].data.route_overlay).toBeNull();
  });

  it("gebruikt CAS voor opslaan, publiceren, dupliceren en archiveren", async () => {
    invokeMutation.mockResolvedValue({ plan: { id: "plan-1", version: 5 } });
    const securityPlan = { id: "plan-1", version: 4 };
    const context = {
      customerId: "customer-saturn",
      objectId: "object-saturn",
      securityPlan,
      idempotencyKey: "mutation-key",
    };

    await saveObjectSecurityPlanDraft({
      ...context,
      securityPlanId: securityPlan.id,
      version: securityPlan.version,
      data: {
        task_type: "reception",
        variant_name: "Weekend",
        execution_mode: "continuous_post",
        duration_mode: "schedule_defined",
        duration_minutes: 480,
      },
    });
    await publishObjectSecurityPlan(context);
    await duplicateObjectSecurityPlan({ ...context, variantName: "Weekend kopie" });
    await archiveObjectSecurityPlan(context);

    expect(invokeMutation.mock.calls.map(([payload]) => [
      payload.action,
      payload.expected_version,
    ])).toEqual([
      ["save_object_security_plan_draft", 4],
      ["publish_object_security_plan", 4],
      ["duplicate_object_security_plan", 4],
      ["archive_object_security_plan", 4],
    ]);
    expect(invokeMutation.mock.calls[0][0].data.duration_minutes).toBeNull();
  });

  it("gebruikt expected_version 0 voor een nieuwe sectie en CAS voor wijzigen/archiveren", async () => {
    invokeMutation.mockResolvedValue({ section: { id: "section-1", version: 1 } });
    const common = {
      customerId: "customer-saturn",
      objectId: "object-saturn",
      idempotencyKey: "section-key",
    };

    await upsertObjectSection({
      ...common,
      data: { code: "S1", name: "Sectie 1" },
    });
    await upsertObjectSection({
      ...common,
      section: { id: "section-1", version: 3 },
      data: { code: "S1", name: "Productie sectie 1" },
    });
    await archiveObjectSection({ ...common, section: { id: "section-1", version: 4 } });

    expect(invokeMutation.mock.calls.map(([payload]) => [
      payload.action,
      payload.expected_version,
    ])).toEqual([
      ["upsert_object_section", 0],
      ["upsert_object_section", 3],
      ["archive_object_section", 4],
    ]);
  });

  it("normaliseert legacyrecords alleen als concept en behoudt hun instructievolgorde", () => {
    const normalized = normalizeSecurityPlanSummary({
      id: "legacy-plan",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      category: "reception",
      title: "Receptie oud",
      status: "active",
      duration_minutes: null,
      instructions: ["Open de receptie.", "Schrijf bezoekers in."],
      version: 2,
    });

    expect(normalized).toMatchObject({
      task_type: "reception",
      variant_name: "Receptie oud",
      execution_mode: "continuous_post",
      status: "draft",
      migration_required: true,
    });

    const legacyRevision = normalizeSecurityPlanRevision({
      version: 2,
      duration_minutes: 30,
      scope_type: "full",
      instructions: ["Open de receptie.", "Schrijf bezoekers in."],
    });
    expect(legacyRevision.duration_mode).toBe("fixed");
    expect(legacyRevision.section_policy).toBe("fixed");
    expect(legacyRevision.instruction_blocks[0].steps.map(step => step.instruction)).toEqual([
      "Open de receptie.",
      "Schrijf bezoekers in.",
    ]);
  });

  it("maakt legacy-migratie eerst als read-only dry-run en pas expliciet muterend", async () => {
    invokeMutation.mockResolvedValue({ dry_run: true, items: [] });
    const context = {
      customerId: "customer-saturn",
      objectId: "object-saturn",
      idempotencyKey: "migration-key",
    };

    await migrateLegacyObjectSecurityPlans(context);
    await migrateLegacyObjectSecurityPlans({ ...context, dryRun: false });

    expect(invokeMutation).toHaveBeenNthCalledWith(1, {
      action: "migrate_legacy_object_security_plans",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      dry_run: true,
      idempotency_key: "migration-key",
      expected_version: 0,
    });
    expect(invokeMutation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "migrate_legacy_object_security_plans",
      dry_run: false,
      expected_version: 0,
    }));
  });
});

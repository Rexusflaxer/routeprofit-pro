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
  createObjectModule,
  createObjectModuleMutationKey,
  getObjectModule,
  listObjectModules,
  normalizeObjectModuleDetail,
  publishObjectModule,
  saveObjectModuleDraft,
  setObjectModuleStatus,
} from "@/components/objects/objectModuleWorkflow";

describe("objectModuleWorkflow", () => {
  beforeEach(() => {
    invokeRead.mockReset();
    invokeMutation.mockReset();
    createKey.mockClear();
  });

  it("leest uitsluitend binnen klant- en objectscope en normaliseert backendsamenvattingen", async () => {
    invokeRead
      .mockResolvedValueOnce({
        api_contract_version: "2026-08-05.2",
        items: [{
          id: "module-1",
          module_type: "item_issuance",
          display_name: "Sleuteluitgifte receptie",
          status: "suspended",
          linked_plan_count: "3",
          version: "4",
          current_revision_summary: {
            status: "published",
            field_count: 4,
            catalog_item_count: 12,
            reference_list_count: 2,
          },
        }],
        total: 1,
      })
      .mockResolvedValueOnce({ module: { id: "module-1", module_type: "item_issuance", display_name: "Sleuteluitgifte receptie", version: 4 } });

    expect(createObjectModuleMutationKey("save")).toBe("object-module:save:generated");
    const list = await listObjectModules({ customerId: "customer-1", objectId: "object-1" });
    await getObjectModule({ customerId: "customer-1", objectId: "object-1", moduleId: "module-1" });

    expect(list.items[0]).toMatchObject({
      name: "Sleuteluitgifte receptie",
      display_name: "Sleuteluitgifte receptie",
      status: "suspended",
      plan_link_count: 3,
      field_count: 4,
      catalog_item_count: 12,
      reference_list_count: 2,
      version: 4,
    });
    expect(list.api_contract_version).toBe("2026-08-05.2");
    expect(invokeRead).toHaveBeenNthCalledWith(1, {
      action: "list_object_modules",
      customer_id: "customer-1",
      object_id: "object-1",
    });
    expect(invokeRead).toHaveBeenNthCalledWith(2, {
      action: "get_object_module",
      customer_id: "customer-1",
      object_id: "object-1",
      module_id: "module-1",
    });
  });

  it("maakt de korte wizardpayload met display_name en expected_version 0", async () => {
    invokeMutation.mockResolvedValue({
      module: { id: "module-1", module_type: "item_issuance", display_name: "Middelen receptie", status: "concept", version: 1 },
      draft_revision: { id: "revision-1", revision_number: 1, status: "draft", field_definitions: [] },
    });

    const result = await createObjectModule({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "create-module-key",
      data: { module_type: "item_issuance", name: "Middelen receptie" },
    });

    expect(invokeMutation).toHaveBeenCalledWith({
      action: "create_object_module",
      customer_id: "customer-1",
      object_id: "object-1",
      idempotency_key: "create-module-key",
      expected_version: 0,
      data: { module_type: "item_issuance", display_name: "Middelen receptie" },
    });
    expect(result.module).toMatchObject({ id: "module-1", name: "Middelen receptie", status: "concept" });
  });

  it("bewaart een rijke uitgifteconfiguratie met de backendkeys en CAS", async () => {
    invokeMutation.mockResolvedValue({ module: { id: "module-1", module_type: "item_issuance", display_name: "Middelen", version: 8 } });
    const module = { id: "module-1", module_type: "item_issuance", display_name: "Middelen", version: 7 };

    await saveObjectModuleDraft({
      customerId: "customer-1",
      objectId: "object-1",
      module,
      idempotencyKey: "save-module-key",
      configuration: {
        summary: "Uitgifte vanuit de receptie.",
        responsible_role: "reception_lead",
        retention_days: 365,
        anonymize_after_retention: true,
        field_definitions: [{ id: "issued_to", label: "Uitgegeven aan", field_type: "select", required: true, enabled: true, options: [], reference_list_id: "people" }],
        reference_lists: [{ id: "people", name: "Personeel", subject_type: "employee", entries: [{ id: "person-1", label: "A. Jansen", status: "active" }] }],
        catalog_items: [{ id: "key-101", code: "K101", name: "Kamersleutel 101", tracking_mode: "serialized", quantity: 1, expected_return_minutes: 480, requires_authorization: true, status: "active" }],
        availability_windows: [{ id: "office-hours", name: "Receptietijden", days: ["mon", "tue"], start_time: "08:00", end_time: "18:00" }],
        authorization_rules: [{ id: "allow-101", name: "Kamer 101", effect: "allow", catalog_item_ids: ["key-101"], subject_entry_ids: ["person-1"], availability_window_ids: ["office-hours"], status: "active" }],
        workflow_settings: { require_expected_return: true },
        notification_settings: { enabled: true, channels: ["in_app"], reminder_minutes: [60], escalation_role: "object_manager" },
      },
    });

    const payload = invokeMutation.mock.calls[0][0];
    expect(payload).toMatchObject({
      action: "save_object_module_draft",
      module_id: "module-1",
      expected_version: 7,
      idempotency_key: "save-module-key",
    });
    expect(payload.data.field_definitions[0]).toMatchObject({ enabled: true, reference_list_id: "people" });
    expect(payload.data.catalog_items[0]).toMatchObject({ expected_return_minutes: 480, requires_authorization: true, tracking_mode: "serialized" });
    expect(payload.data.authorization_rules[0]).toMatchObject({ subject_entry_ids: ["person-1"] });
    expect(payload.data.authorization_rules[0]).not.toHaveProperty("reference_entry_ids");
  });

  it("gebruikt CAS voor publiceren, pauzeren en hervatten", async () => {
    invokeMutation.mockResolvedValue({ module: { id: "module-1", module_type: "action_points", display_name: "Actiepunten", version: 5 } });
    const module = { id: "module-1", module_type: "action_points", display_name: "Actiepunten", version: 4 };
    const context = { customerId: "customer-1", objectId: "object-1", module, idempotencyKey: "mutation-key" };

    await publishObjectModule(context);
    await setObjectModuleStatus({ ...context, status: "suspended", reason: "Tijdelijk onderhoud" });
    await setObjectModuleStatus({ ...context, status: "active" });

    expect(invokeMutation.mock.calls.map(([payload]) => [payload.action, payload.expected_version, payload.data?.status, payload.data?.reason])).toEqual([
      ["publish_object_module", 4, undefined, undefined],
      ["set_object_module_status", 4, "suspended", "Tijdelijk onderhoud"],
      ["set_object_module_status", 4, "active", undefined],
    ]);
  });

  it("weigert pauzeren en archiveren zonder een korte reden", async () => {
    const module = { id: "module-1", module_type: "action_points", display_name: "Actiepunten", version: 4 };
    const context = { customerId: "customer-1", objectId: "object-1", module, idempotencyKey: "mutation-key" };

    await expect(setObjectModuleStatus({ ...context, status: "suspended" })).rejects.toThrow(/reden voor pauzeren.*verplicht/i);
    await expect(setObjectModuleStatus({ ...context, status: "archived", reason: "x".repeat(501) })).rejects.toThrow(/maximaal 500/i);
    expect(invokeMutation).not.toHaveBeenCalled();
  });

  it("behoudt revisies en expliciete beveiligingsplankoppelingen in detail", () => {
    const detail = normalizeObjectModuleDetail({
      module: { id: "module-1", module_type: "visitor_registration", display_name: "Bezoekers", version: 2 },
      draft_revision: { id: "revision-2", revision_number: 2, status: "draft", field_definitions: [{ id: "visitor_name", label: "Naam bezoeker", field_type: "text", enabled: true }] },
      revision_history: [{ id: "revision-1", revision_number: 1, status: "published" }],
      plan_links: [{ security_plan_id: "plan-1", module_id: "module-1", access_mode: "register" }],
    });

    expect(detail.draft_revision.configuration.field_definitions[0]).toMatchObject({ id: "visitor_name", enabled: true });
    expect(detail.revisions).toHaveLength(1);
    expect(detail.plan_links).toEqual([{ security_plan_id: "plan-1", module_id: "module-1", access_mode: "register" }]);
  });
});

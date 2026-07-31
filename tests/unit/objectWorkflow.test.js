import { beforeEach, describe, expect, it, vi } from "vitest";

const { defaultInvoke, createKey } = vi.hoisted(() => ({
  defaultInvoke: vi.fn(),
  createKey: vi.fn(action => `${action}:generated`),
}));

vi.mock("@/components/customers/customerDossierUtils", () => ({
  invokeCustomerPlatformMutation: defaultInvoke,
  createCustomerMutationKey: createKey,
}));

import {
  setCustomerObjectStatus,
  updateCustomerObjectIdentity,
  updateCustomerObjectOperations,
} from "@/components/objects/objectWorkflow";

describe("objectWorkflow", () => {
  beforeEach(() => {
    defaultInvoke.mockReset();
    createKey.mockClear();
  });

  it("stuurt objectidentiteit via het gecontroleerde klantplatformcontract", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, object: { id: "object-1", version: 4 } });

    await expect(updateCustomerObjectIdentity({
      objectId: " object-1 ",
      customerId: "customer-1",
      expectedVersion: 3,
      idempotencyKey: "identity-key",
      invoke,
      form: {
        name: "  Hoofdkantoor ",
        object_type: "office",
        address: "Stationsplein 1, Amsterdam",
        postal_code: "1012 ab",
        country_code: "nl",
        latitude: "52.3791",
        longitude: "4.9003",
        geocoding_status: "verified",
        status: "archived",
      },
    })).resolves.toMatchObject({ ok: true });

    expect(invoke).toHaveBeenCalledWith({
      action: "update_customer_object_identity",
      object_id: "object-1",
      customer_id: "customer-1",
      expected_version: 3,
      idempotency_key: "identity-key",
      data: {
        name: "Hoofdkantoor",
        object_type: "office",
        address: "Stationsplein 1, Amsterdam",
        postal_code: "1012 AB",
        country_code: "NL",
        latitude: 52.3791,
        longitude: 4.9003,
        geocoding_status: "verified",
      },
    });
  });

  it("blokkeert een geverifieerde locatie zonder volledig coördinatenpaar", async () => {
    await expect(updateCustomerObjectIdentity({
      objectId: "object-1",
      customerId: "customer-1",
      expectedVersion: 2,
      idempotencyKey: "identity-key",
      invoke: vi.fn(),
      form: {
        latitude: 52.1,
        geocoding_status: "verified",
      },
    })).rejects.toThrow("breedte- en lengtegraad samen");
  });

  it("laat alleen operationele whitelistvelden door en gebruikt een nieuwe mutatiesleutel", async () => {
    defaultInvoke.mockResolvedValue({ ok: true });

    await updateCustomerObjectOperations({
      objectId: "object-1",
      customerId: "customer-1",
      expectedVersion: 7,
      form: {
        entry_instruction: "Meld bij de receptie.",
        alarm_instruction: "Niet via deze workflow beheren",
        show_on_mobile_map: true,
        mobile_map_priority: "12",
        customer_id: "customer-2",
      },
    });

    expect(defaultInvoke).toHaveBeenCalledWith({
      action: "update_customer_object_operations",
      object_id: "object-1",
      customer_id: "customer-1",
      expected_version: 7,
      idempotency_key: "update_customer_object_operations:generated",
      data: {
        entry_instruction: "Meld bij de receptie.",
        show_on_mobile_map: true,
        mobile_map_priority: 12,
      },
    });
  });

  it("vereist een reden voor archiveren en stuurt status buiten data", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const common = {
      objectId: "object-1",
      customerId: "customer-1",
      expectedVersion: 9,
      idempotencyKey: "status-key",
      invoke,
      status: "archived",
    };

    await expect(setCustomerObjectStatus(common)).rejects.toThrow("Reden voor archiveren is verplicht");

    await setCustomerObjectStatus({ ...common, reason: "Contract beëindigd" });
    expect(invoke).toHaveBeenCalledWith({
      action: "set_customer_object_status",
      object_id: "object-1",
      customer_id: "customer-1",
      expected_version: 9,
      idempotency_key: "status-key",
      status: "archived",
      reason: "Contract beëindigd",
    });
  });

  it("weigert een ontbrekende of verouderingsgevoelige versie", async () => {
    await expect(updateCustomerObjectOperations({
      objectId: "object-1",
      customerId: "customer-1",
      expectedVersion: 0,
      form: { notes: "Test" },
      invoke: vi.fn(),
    })).rejects.toThrow("actuele objectversie ontbreekt");
  });
});

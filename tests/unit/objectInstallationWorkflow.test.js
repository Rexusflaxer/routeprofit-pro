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
  archiveObjectInstallation,
  createObjectInstallationKey,
  listObjectInstallations,
  saveObjectInstallation,
} from "@/components/objects/objectInstallationWorkflow";

describe("objectInstallationWorkflow", () => {
  beforeEach(() => {
    defaultInvoke.mockReset();
    createKey.mockClear();
  });

  it("maakt stabiele installatiemutatiesleutels", () => {
    expect(createObjectInstallationKey()).toBe("create_object_installation:generated");
  });

  it("leest installaties uitsluitend binnen klant en object", async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [] });
    await listObjectInstallations({ customerId: "customer-1", objectId: "object-1", invoke });
    expect(invoke).toHaveBeenCalledWith({
      action: "list_object_installations",
      customer_id: "customer-1",
      object_id: "object-1",
    });
  });

  it("stuurt codes alleen als geneste credential-input bij het aanmaken", async () => {
    const invoke = vi.fn().mockResolvedValue({ installation: { id: "installation-1" } });
    const form = {
      installation_type: "alarm_system",
      brand: "Ajax",
      credentials: { switch_code: "1234", reset_code: "5678" },
    };
    await saveObjectInstallation({
      customerId: "customer-1",
      objectId: "object-1",
      form,
      idempotencyKey: "installation-key",
      invoke,
    });
    expect(invoke).toHaveBeenCalledWith({
      action: "create_object_installation",
      idempotency_key: "installation-key",
      expected_version: 0,
      customer_id: "customer-1",
      object_id: "object-1",
      data: form,
    });
  });

  it("gebruikt CAS bij wijzigen en archiveren", async () => {
    const invoke = vi.fn().mockResolvedValue({ installation: { id: "installation-1" } });
    const installation = { id: "installation-1", version: 4 };
    await saveObjectInstallation({
      customerId: "customer-1",
      objectId: "object-1",
      installation,
      form: { brand: "Bosch" },
      idempotencyKey: "update-key",
      invoke,
    });
    await archiveObjectInstallation({
      customerId: "customer-1",
      objectId: "object-1",
      installation,
      idempotencyKey: "archive-key",
      invoke,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "update_object_installation",
      expected_version: 4,
      installation_id: "installation-1",
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "archive_object_installation",
      expected_version: 4,
      installation_id: "installation-1",
    }));
  });
});

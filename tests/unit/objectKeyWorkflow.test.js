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
  archiveObjectKey,
  createObjectKeyMutationKey,
  listObjectKeys,
  saveObjectKey,
} from "@/components/objects/objectKeyWorkflow";

describe("objectKeyWorkflow", () => {
  beforeEach(() => {
    defaultInvoke.mockReset();
    createKey.mockClear();
  });

  it("maakt herkenbare mutatiesleutels", () => {
    expect(createObjectKeyMutationKey("archive_object_key")).toBe("archive_object_key:generated");
  });

  it("leest sleutels objectgebonden", async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [] });
    await listObjectKeys({ customerId: "customer-1", objectId: "object-1", invoke });
    expect(invoke).toHaveBeenCalledWith({
      action: "list_object_keys",
      customer_id: "customer-1",
      object_id: "object-1",
    });
  });

  it("maakt een sleutel aan met een idempotente servermutatie", async () => {
    const invoke = vi.fn().mockResolvedValue({ key: { id: "key-1" } });
    await saveObjectKey({
      customerId: "customer-1",
      objectId: "object-1",
      form: { key_type: "key", brand: "DOM", serial_number: "DOM-2" },
      idempotencyKey: "key-create",
      invoke,
    });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_object_key",
      idempotency_key: "key-create",
      expected_version: 0,
      customer_id: "customer-1",
      object_id: "object-1",
    }));
  });

  it("stuurt beide actuele versies mee bij wijzigen en archiveert alleen de objectkoppeling", async () => {
    const invoke = vi.fn().mockResolvedValue({ key: { id: "key-1" } });
    const key = { id: "key-1", version: 3, assignment_id: "assignment-1", assignment_version: 8, key_set_id: "set-1" };
    await saveObjectKey({
      customerId: "customer-1",
      objectId: "object-1",
      current: key,
      form: { key_type: "key", brand: "DOM", serial_number: "DOM-2", status: "in_storage", key_set_id: "set-1" },
      idempotencyKey: "key-update",
      invoke,
    });
    await archiveObjectKey({
      customerId: "customer-1",
      objectId: "object-1",
      key,
      idempotencyKey: "key-archive",
      invoke,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "update_object_key",
      expected_version: 3,
      key_assignment_id: "assignment-1",
      assignment_expected_version: 8,
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, {
      action: "archive_object_key",
      idempotency_key: "key-archive",
      expected_version: 8,
      customer_id: "customer-1",
      object_id: "object-1",
      key_assignment_id: "assignment-1",
      key_id: "key-1",
    });
  });
});

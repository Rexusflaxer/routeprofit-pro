import { beforeEach, describe, expect, it, vi } from "vitest";

const { readInvoke, mutationInvoke, createKey } = vi.hoisted(() => ({
  readInvoke: vi.fn(),
  mutationInvoke: vi.fn(),
  createKey: vi.fn(action => `${action}:generated`),
}));

vi.mock("@/components/customers/customerDossierUtils", () => ({
  createCustomerMutationKey: createKey,
  invokeCustomerPlatformRead: readInvoke,
  invokeCustomerPlatformMutation: mutationInvoke,
}));

import {
  archiveObjectRelationship,
  createObjectRelationshipKey,
  listObjectRelationships,
  saveObjectRelationship,
} from "@/components/objects/objectRelationshipWorkflow";

describe("objectRelationshipWorkflow", () => {
  beforeEach(() => {
    readInvoke.mockReset();
    mutationInvoke.mockReset();
    createKey.mockClear();
  });

  it("leest relaties via het centrale klantplatform binnen klant- en objectscope", async () => {
    readInvoke.mockResolvedValue({ items: [], organizations: [] });
    await listObjectRelationships({ customerId: "customer-1", objectId: "object-1" });
    expect(readInvoke).toHaveBeenCalledWith({
      action: "list_object_relationships",
      customer_id: "customer-1",
      object_id: "object-1",
    });
  });

  it("stuurt create en update met idempotency en de verwachte versie", async () => {
    const invoke = vi.fn().mockResolvedValue({ relationship: { id: "relationship-1" } });
    await saveObjectRelationship({
      customerId: "customer-1",
      objectId: "object-1",
      form: { relation_type: "pac" },
      idempotencyKey: "create-key",
      invoke,
    });
    await saveObjectRelationship({
      customerId: "customer-1",
      objectId: "object-1",
      relationship: { id: "relationship-1", version: 4 },
      form: { relation_type: "pac" },
      idempotencyKey: "update-key",
      invoke,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "create_object_relationship",
      expected_version: 0,
      idempotency_key: "create-key",
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "update_object_relationship",
      relationship_id: "relationship-1",
      expected_version: 4,
      idempotency_key: "update-key",
    }));
  });

  it("archiveert uitsluitend een concrete versie en valideert de mutatiesleutel", async () => {
    const invoke = vi.fn().mockResolvedValue({ archived: true });
    await archiveObjectRelationship({
      customerId: "customer-1",
      objectId: "object-1",
      relationship: { id: "relationship-1", version: 3 },
      idempotencyKey: "archive-key",
      invoke,
    });
    expect(invoke).toHaveBeenCalledWith({
      action: "archive_object_relationship",
      idempotency_key: "archive-key",
      expected_version: 3,
      customer_id: "customer-1",
      object_id: "object-1",
      relationship_id: "relationship-1",
    });
    expect(() => archiveObjectRelationship({
      customerId: "customer-1",
      objectId: "object-1",
      relationship: { id: "relationship-1", version: 3 },
      idempotencyKey: "",
      invoke,
    })).toThrow(/Mutatiesleutel/);
  });

  it("maakt een herkenbare, actiegebonden aanmaaksleutel", () => {
    expect(createObjectRelationshipKey()).toBe("create_object_relationship:generated");
  });
});

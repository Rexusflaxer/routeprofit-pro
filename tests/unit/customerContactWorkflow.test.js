import { describe, expect, it, vi } from "vitest";
import { createCustomerContactRecords } from "@/components/customers/customerContactWorkflow";

function createInvoke(contactId = "contact-1") {
  return vi.fn(async payload => {
    if (payload.action === "create_customer_contact") {
      return { contact: { id: contactId, ...payload.data } };
    }
    return { ok: true };
  });
}

function payloadsFor(invoke, action) {
  return invoke.mock.calls
    .map(([payload]) => payload)
    .filter(payload => payload.action === action);
}

describe("createCustomerContactRecords", () => {
  it("normaliseert geselecteerde objecten en gebruikt die voor iedere rol", async () => {
    const invoke = createInvoke("contact-selected");

    const result = await createCustomerContactRecords({
      customerId: "customer-1",
      customer: { preferred_language: "en" },
      existingContacts: [],
      idempotencyKey: "create-contact:stable-key",
      invoke,
      form: {
        first_name: "  Noor ",
        name_prefix: " van ",
        last_name: " Dijk  ",
        job_title: " Operationeel manager ",
        email: " noor@example.com ",
        phone: " +31 20 123 45 67 ",
        object_scope: "selected",
        object_ids: [" obj-1 ", "obj-3", "obj-1", "", null],
      },
    });

    expect(result.contact.id).toBe("contact-selected");
    expect(invoke).toHaveBeenNthCalledWith(1, {
      action: "create_customer_contact",
      idempotency_key: "create-contact:stable-key:contact",
      expected_version: 0,
      customer_id: "customer-1",
      data: {
        display_name: "Noor van Dijk",
        first_name: "Noor",
        middle_name: "van",
        last_name: "Dijk",
        job_title: "Operationeel manager",
        preferred_language: "en",
        preferred_channel: "email",
        is_primary: true,
        status: "active",
      },
    });

    expect(payloadsFor(invoke, "create_contact_point")).toEqual([
      expect.objectContaining({
        idempotency_key: "create-contact:stable-key:email",
        contact_id: "contact-selected",
        data: expect.objectContaining({
          point_type: "email",
          value: "noor@example.com",
          purposes: ["operational", "primary"],
        }),
      }),
      expect.objectContaining({
        idempotency_key: "create-contact:stable-key:phone",
        contact_id: "contact-selected",
        data: expect.objectContaining({
          point_type: "phone",
          value: "+31 20 123 45 67",
          purposes: ["operational", "primary"],
        }),
      }),
    ]);

    const roleCalls = payloadsFor(invoke, "create_contact_role");
    expect(roleCalls.map(call => call.data.role)).toEqual(["operational", "primary"]);
    expect(roleCalls.map(call => call.idempotency_key)).toEqual([
      "create-contact:stable-key:role:operational",
      "create-contact:stable-key:role:primary",
    ]);
    for (const call of roleCalls) {
      expect(call.data.object_ids).toEqual(["obj-1", "obj-3"]);
    }
  });

  it("maakt een expliciet primair klantbreed contact met lege objectscope", async () => {
    const invoke = createInvoke("contact-all");

    await createCustomerContactRecords({
      customerId: "customer-1",
      customer: { language: "de" },
      existingContacts: [{ id: "contact-existing" }],
      idempotencyKey: "create-contact:all-key",
      invoke,
      form: {
        first_name: " Lisa ",
        last_name: " Jansen ",
        job_title: " Directeur ",
        email: "   ",
        phone: " 020 765 43 21 ",
        is_primary: true,
        object_scope: "all",
        object_ids: ["obj-should-not-be-used"],
      },
    });

    expect(payloadsFor(invoke, "create_customer_contact")[0]).toEqual(
      expect.objectContaining({
        idempotency_key: "create-contact:all-key:contact",
        data: expect.objectContaining({
          display_name: "Lisa Jansen",
          job_title: "Directeur",
          preferred_language: "de",
          preferred_channel: "phone",
          is_primary: true,
        }),
      }),
    );
    expect(payloadsFor(invoke, "create_contact_point")).toEqual([
      expect.objectContaining({
        idempotency_key: "create-contact:all-key:phone",
        data: expect.objectContaining({
          point_type: "phone",
          value: "020 765 43 21",
        }),
      }),
    ]);

    const roleCalls = payloadsFor(invoke, "create_contact_role");
    expect(roleCalls.map(call => call.data.role)).toEqual(["operational", "primary"]);
    for (const call of roleCalls) {
      expect(call.data.object_ids).toEqual([]);
    }
  });

  it("weigert een lege specifieke objectselectie voordat records worden geschreven", async () => {
    const invoke = createInvoke();

    await expect(createCustomerContactRecords({
      customerId: "customer-1",
      idempotencyKey: "create-contact:invalid-scope",
      invoke,
      form: {
        first_name: "Noor",
        last_name: "Dijk",
        job_title: "Planner",
        email: "noor@example.nl",
        object_scope: "selected",
        object_ids: [],
      },
    })).rejects.toThrow("Selecteer minimaal één object.");

    expect(invoke).not.toHaveBeenCalled();
  });
});

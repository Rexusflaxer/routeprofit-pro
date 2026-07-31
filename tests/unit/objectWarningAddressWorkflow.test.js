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
  createObjectWarningAddress,
  listObjectLogbook,
  listObjectWarningAddresses,
  updateObjectWarningAddress,
  updateObjectWarningAddressKey,
} from "@/components/objects/objectWarningAddressWorkflow";

const baseForm = {
  contact_mode: "new",
  first_name: "Sanne",
  middle_name: "de",
  last_name: "Vries",
  email: "sanne@example.nl",
  primary_phone: "06 12345678",
  secondary_phone: "010 1234567",
  relationship_type: "keyholder",
  relationship_label: "Sleutelhouder",
  call_order: 1,
  availability_mode: "not_call_periods",
  not_call_periods: [{ days: ["mon", "tue"], start_time: "22:00", end_time: "07:00" }],
};

describe("objectWarningAddressWorkflow", () => {
  beforeEach(() => {
    defaultInvoke.mockReset();
    createKey.mockClear();
  });

  it("maakt een herkenbare stabiele mutatiesleutel voor een updatepoging", () => {
    expect(updateObjectWarningAddressKey()).toBe("update_object_warning_address:generated");
  });

  it("maakt een nieuw klantcontact met losse kanalen en koppelt daarna het waarschuwingsadres", async () => {
    const invoke = vi.fn(async payload => {
      if (payload.action === "create_customer_contact") return { contact: { id: "contact-1" } };
      if (payload.action === "create_contact_point" && payload.data.point_type === "phone") {
        return { contact_point: { id: payload.data.is_primary ? "point-primary" : "point-secondary" } };
      }
      if (payload.action === "create_contact_point") return { contact_point: { id: "point-email" } };
      if (payload.action === "create_object_warning_address") return { warning_address: { id: "warning-1" } };
      throw new Error(`Onverwachte actie ${payload.action}`);
    });

    await expect(createObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      form: baseForm,
      idempotencyKey: "warning-key",
      invoke,
    })).resolves.toMatchObject({ warning_address: { id: "warning-1" } });

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_customer_contact",
      idempotency_key: "warning-key:contact",
      customer_id: "customer-1",
      data: expect.objectContaining({ display_name: "Sanne de Vries" }),
    }));
    expect(invoke).toHaveBeenLastCalledWith({
      action: "create_object_warning_address",
      idempotency_key: "warning-key:assignment",
      expected_version: 0,
      customer_id: "customer-1",
      object_id: "object-1",
      data: {
        contact_id: "contact-1",
        primary_contact_point_id: "point-primary",
        secondary_contact_point_id: "point-secondary",
        relationship_type: "keyholder",
        relationship_label: "Sleutelhouder",
        call_order: 1,
        availability_mode: "not_call_periods",
        not_call_periods: [{ days: ["mon", "tue"], start_time: "22:00", end_time: "07:00" }],
      },
    });
  });

  it("hergebruikt een bestaand contactpunt zonder persoonsgegevens te dupliceren", async () => {
    const invoke = vi.fn().mockResolvedValue({ warning_address: { id: "warning-2" } });
    await createObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "existing-key",
      invoke,
      form: {
        ...baseForm,
        contact_mode: "existing",
        contact_id: "contact-existing",
        primary_contact_point_id: "point-existing",
        secondary_contact_point_id: "",
        availability_mode: "always",
        not_call_periods: [],
      },
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_object_warning_address",
      data: expect.objectContaining({
        contact_id: "contact-existing",
        primary_contact_point_id: "point-existing",
        secondary_contact_point_id: null,
        availability_mode: "always",
        not_call_periods: [],
      }),
    }));
  });

  it("stuurt updates via CAS en houdt de contactpersoon zelf buiten de patch", async () => {
    const invoke = vi.fn().mockResolvedValue({ warning_address: { id: "warning-1", version: 4 } });
    await updateObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      warningAddressId: "warning-1",
      expectedVersion: 3,
      idempotencyKey: "update-key",
      invoke,
      form: {
        ...baseForm,
        primary_contact_point_id: "point-primary",
        secondary_contact_point_id: "point-secondary",
        contact_id: "contact-mag-niet-wijzigen",
      },
    });

    expect(invoke).toHaveBeenCalledWith({
      action: "update_object_warning_address",
      idempotency_key: "update-key",
      expected_version: 3,
      customer_id: "customer-1",
      object_id: "object-1",
      warning_address_id: "warning-1",
      data: {
        primary_contact_point_id: "point-primary",
        secondary_contact_point_id: "point-secondary",
        relationship_type: "keyholder",
        relationship_label: "Sleutelhouder",
        call_order: 1,
        availability_mode: "not_call_periods",
        not_call_periods: [{ days: ["mon", "tue"], start_time: "22:00", end_time: "07:00" }],
      },
    });
  });

  it("maakt bij een onbruikbaar oud nummer eerst een nieuw actief contactpunt", async () => {
    const invoke = vi.fn(async payload => {
      if (payload.action === "create_contact_point") return { contact_point: { id: "point-replacement" } };
      return { warning_address: { id: "warning-1", version: 4 } };
    });

    await updateObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      warningAddressId: "warning-1",
      expectedVersion: 3,
      idempotencyKey: "replace-key",
      invoke,
      form: {
        ...baseForm,
        contact_id: "contact-1",
        primary_contact_point_id: "",
        primary_phone: "06 87654321",
        secondary_contact_point_id: "",
      },
    });

    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "create_contact_point",
      idempotency_key: "replace-key:replacement-primary-phone",
      contact_id: "contact-1",
      data: expect.objectContaining({ value: "06 87654321", status: "active" }),
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "update_object_warning_address",
      idempotency_key: "replace-key",
      data: expect.objectContaining({ primary_contact_point_id: "point-replacement" }),
    }));
  });

  it("leest waarschuwingsadressen en het objectbrede logboek via gescheiden acties", async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [] });
    await listObjectWarningAddresses({ customerId: "customer-1", objectId: "object-1", invoke });
    await listObjectLogbook({ customerId: "customer-1", objectId: "object-1", search: "Sanne", page: 2, invoke });

    expect(invoke).toHaveBeenNthCalledWith(1, {
      action: "list_object_warning_addresses",
      customer_id: "customer-1",
      object_id: "object-1",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      action: "list_object_logbook",
      customer_id: "customer-1",
      object_id: "object-1",
      search: "Sanne",
      page: 2,
      page_size: 50,
    });
  });

  it("weigert een onvolledige niet-bellenperiode voordat de backend wordt aangeroepen", async () => {
    const invoke = vi.fn();
    await expect(createObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "invalid-key",
      invoke,
      form: { ...baseForm, not_call_periods: [{ days: [], start_time: "22:00", end_time: "07:00" }] },
    })).rejects.toThrow("minimaal één dag");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("weigert een onbelbaar waarschuwingstelefoonnummer voor er records worden aangemaakt", async () => {
    const invoke = vi.fn();
    await expect(createObjectWarningAddress({
      customerId: "customer-1",
      objectId: "object-1",
      idempotencyKey: "invalid-phone-key",
      invoke,
      form: { ...baseForm, primary_phone: "abc" },
    })).rejects.toThrow("geldig primair telefoonnummer");
    expect(invoke).not.toHaveBeenCalled();
  });
});

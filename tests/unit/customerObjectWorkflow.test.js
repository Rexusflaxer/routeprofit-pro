import { describe, expect, it, vi } from "vitest";
import { createCustomerObject } from "@/components/customers/customerObjectWorkflow";

describe("createCustomerObject", () => {
  it("maakt via één bewaakte mutatie alleen een concept met basisgegevens", async () => {
    const invoke = vi.fn(async payload => ({
      ok: true,
      object: { id: "object-1", ...payload.data },
    }));

    const result = await createCustomerObject({
      customerId: "customer-1",
      idempotencyKey: "create_customer_object:stable-key",
      invoke,
      form: {
        name: "  Distributiecentrum Utrecht  ",
        object_code: " obj 004 ",
        object_type: "industrial_logistics",
        address: "  Reactorweg 1, 3542 AD Utrecht  ",
        street_name: " Reactorweg ",
        house_number: " 1 ",
        postal_code: " 3542 ad ",
        city: " Utrecht ",
        country_code: "nl",
        country_name: "Nederland",
        latitude: 52.116,
        longitude: 5.063,
        geocoding_status: "verified",
        bag_address_id: " bag-1 ",
        region: " Midden-Nederland ",
        duplicate_reviewed: true,
      },
    });

    expect(result.object.id).toBe("object-1");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({
      action: "create_customer_object",
      idempotency_key: "create_customer_object:stable-key",
      expected_version: 0,
      customer_id: "customer-1",
      duplicate_reviewed: true,
      data: {
        object_code: "OBJ-004",
        name: "Distributiecentrum Utrecht",
        object_type: "industrial_logistics",
        address: "Reactorweg 1, 3542 AD Utrecht",
        street_name: "Reactorweg",
        house_number: "1",
        house_number_addition: null,
        postal_code: "3542 AD",
        city: "Utrecht",
        country_code: "NL",
        country_name: "Nederland",
        latitude: 52.116,
        longitude: 5.063,
        geocoding_status: "verified",
        bag_address_id: "bag-1",
        region: "Midden-Nederland",
        status: "concept",
      },
    });
  });

  it("laat een lege code server-side invullen en markeert handmatige adressen als niet geverifieerd", async () => {
    const invoke = vi.fn(async payload => ({ object: { id: "object-2", ...payload.data } }));

    await createCustomerObject({
      customerId: "customer-1",
      idempotencyKey: "create_customer_object:auto-code",
      invoke,
      form: {
        name: "Tijdelijke locatie",
        object_code: "",
        object_type: "event_temporary",
        address: "Handmatig terrein nabij Haven 2",
        geocoding_status: "verified",
      },
    });

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        object_code: null,
        latitude: null,
        longitude: null,
        geocoding_status: "unverified",
      }),
    }));
  });

  it("weigert onvolledige of technisch ongeldige basisgegevens vóór de API-call", async () => {
    const invoke = vi.fn();
    const common = {
      customerId: "customer-1",
      idempotencyKey: "create_customer_object:invalid",
      invoke,
    };

    await expect(createCustomerObject({
      ...common,
      form: { name: "", object_type: "office", address: "Stationsplein 1" },
    })).rejects.toThrow("Vul een objectnaam in");
    await expect(createCustomerObject({
      ...common,
      form: { name: "Kantoor", object_type: "invalid", address: "Stationsplein 1" },
    })).rejects.toThrow("Kies een geldig objecttype");
    await expect(createCustomerObject({
      ...common,
      form: { name: "Kantoor", object_type: "office", address: "Stationsplein 1", latitude: 200 },
    })).rejects.toThrow("Breedtegraad");
    expect(invoke).not.toHaveBeenCalled();
  });
});

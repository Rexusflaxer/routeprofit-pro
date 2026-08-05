import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, invokeLatest } = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeLatest: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {},
    functions: { invoke },
  },
  base44LatestFunctions: {
    functions: { invoke: invokeLatest },
  },
  hasPinnedFunctionsVersion: true,
}));

import {
  invokeCustomerPlatformRead,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

describe("customerPlatformApi runtimecontract", () => {
  beforeEach(() => {
    invoke.mockReset();
    invokeLatest.mockReset();
  });

  it("geeft een Base44 gatewaymelding en status bruikbaar door aan de wizard", async () => {
    invoke.mockRejectedValue(Object.assign(new Error("Request failed with status code 503"), {
      response: {
        status: 503,
        data: 'Function "customerPlatformApi" must export default a request handler',
      },
    }));

    await expect(invokeCustomerPlatformMutation({
      action: "create_customer_contact",
    })).rejects.toMatchObject({
      message: 'Function "customerPlatformApi" must export default a request handler',
      status: 503,
      action: "create_customer_contact",
    });
  });

  it("behoudt het backendbericht, details en request-id bij JSON-fouten", async () => {
    invoke.mockRejectedValue(Object.assign(new Error("Request failed with status code 409"), {
      response: {
        status: 409,
        data: {
          error: "Objectscope bevat een object van een andere klant",
          details: { object_id: "object-2" },
          request_id: "request-123",
        },
      },
    }));

    await expect(invokeCustomerPlatformMutation({
      action: "create_contact_role",
    })).rejects.toMatchObject({
      message: "Objectscope bevat een object van een andere klant",
      status: 409,
      details: { object_id: "object-2" },
      requestId: "request-123",
      action: "create_contact_role",
    });
  });

  it("blijft succesvolle geneste Base44-responses normaliseren", async () => {
    invoke.mockResolvedValue({
      data: {
        data: {
          ok: true,
          contact: { id: "contact-1" },
        },
      },
    });

    await expect(invokeCustomerPlatformMutation({
      action: "create_customer_contact",
    })).resolves.toEqual({
      ok: true,
      contact: { id: "contact-1" },
    });
  });

  it("gebruikt voor afgeschermde zoekacties hetzelfde fout- en responsecontract", async () => {
    invoke.mockResolvedValue({ data: { data: { items: [{ id: "object-1" }], has_more: false } } });

    await expect(invokeCustomerPlatformRead({ action: "search_customer_objects", search: "extern 42" }))
      .resolves.toEqual({ items: [{ id: "object-1" }], has_more: false });
  });

  it("herstelt een objectmoduleactie uit een verouderde previewfunctieversie", async () => {
    const payload = {
      action: "create_object_module",
      customer_id: "customer-1",
      object_id: "object-1",
      idempotency_key: "module-key-1",
      expected_version: 0,
    };
    invoke.mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { error: "Onbekende actie" } },
    }));
    invokeLatest.mockResolvedValue({ data: { data: { ok: true, module: { id: "module-1" } } } });

    await expect(invokeCustomerPlatformMutation(payload)).resolves.toEqual({
      ok: true,
      module: { id: "module-1" },
    });
    expect(invoke).toHaveBeenCalledWith("customerPlatformApi", payload);
    expect(invokeLatest).toHaveBeenCalledWith("customerPlatformApi", payload);
  });

  it("toont een gerichte publicatiemelding als ook de nieuwste snapshot de moduleactie niet kent", async () => {
    const unknownAction = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { error: "Onbekende actie" } },
    });
    invoke.mockRejectedValue(unknownAction);
    invokeLatest.mockRejectedValue(unknownAction);

    await expect(invokeCustomerPlatformRead({ action: "list_object_modules" })).rejects.toMatchObject({
      message: "De objectmodule-backend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw.",
      status: 400,
      details: { code: "object_module_backend_outdated" },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {},
    functions: { invoke },
  },
}));

import {
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

describe("customerPlatformApi runtimecontract", () => {
  beforeEach(() => {
    invoke.mockReset();
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
});

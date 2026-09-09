import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const { invoke, invokeLatest, runtime } = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeLatest: vi.fn(),
  runtime: { pinned: true, sameClient: false },
}));

vi.mock("@/api/base44Client", () => {
  const base44 = { entities: {}, functions: { invoke } };
  const latest = { functions: { invoke: invokeLatest } };
  return { base44, get base44LatestFunctions() { return runtime.sameClient ? base44 : latest; }, get hasPinnedFunctionsVersion() { return runtime.pinned; } };
});

import {
  invokeCustomerPlatformRead,
  invokeCustomerPlatformMutation,
} from "@/components/customers/customerDossierUtils";

describe("customerPlatformApi runtimecontract", () => {
  beforeEach(() => {
    invoke.mockReset();
    invokeLatest.mockReset();
    runtime.pinned = true;
    runtime.sameClient = false;
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

  it("herstelt perceelvragen uit een verouderde previewfunctieversie", async () => {
    const payload = { action: "list_object_parcel_candidates", customer_id: "customer-1", object_id: "object-1" };
    invoke.mockRejectedValue(Object.assign(new Error("Onbekende actie"), { response: { status: 400, data: { error: "Onbekende actie" } } }));
    invokeLatest.mockResolvedValue({ data: { data: { candidates: { type: "FeatureCollection", features: [] } } } });
    await expect(invokeCustomerPlatformRead(payload)).resolves.toMatchObject({ candidates: { features: [] } });
    expect(invokeLatest).toHaveBeenCalledWith("customerPlatformApi", payload);
  });

  it("toont één gerichte objectplatformmelding als ook de nieuwste snapshot de actie niet kent", async () => {
    const unknownAction = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { error: "Onbekende actie" } },
    });
    invoke.mockRejectedValue(unknownAction);
    invokeLatest.mockRejectedValue(unknownAction);

    await expect(invokeCustomerPlatformRead({ action: "list_object_modules" })).rejects.toMatchObject({
      message: "De objectkaart-backend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw.",
      status: 400,
      details: { code: "object_platform_backend_outdated" },
    });
  });

  // Read the server action registry so a newly introduced collective action
  // cannot accidentally be omitted from current-contract routing again.
  const backend = fs.readFileSync(`${process.cwd()}/base44/functions/customerPlatformApi/collectiveDossier.ts`, "utf8");
  const collectiveActions = [...backend.matchAll(/export const COLLECTIVE_(READ|MUTATION)_ACTIONS = new Set\(\[([\s\S]*?)\]\)/g)]
    .flatMap(([, kind, actions]) => [...actions.matchAll(/'([^']+)'/g)].map(([, action]) => ({ kind, action })));
  const unknownAction = (requestId = "ddcce3a0-57fd-422a-9c2b-35c2c205a96c") => Object.assign(new Error("Request failed with status code 400"), {
    response: { status: 400, data: { error: "Onbekende actie", request_id: requestId } },
  });

  it("dekt de volledige collectiefactieregistratie", () => {
    expect(collectiveActions).toHaveLength(11);
    expect(collectiveActions).toContainEqual({ kind: "READ", action: "list_collective_dossiers" });
  });

  it.each(collectiveActions)("stuurt $action direct naar het actuele collectiefcontract zonder de payload te veranderen", async ({ kind, action }) => {
    const payload = Object.freeze({ action, collective_id: "collective-1", ...(kind === "MUTATION" ? { expected_version: 3, idempotency_key: `${action}:same-key` } : {}) });
    invoke.mockRejectedValue(unknownAction());
    invokeLatest.mockResolvedValue({ data: { data: { ok: true, items: [{ id: "collective-1", name: "Bedrijventerrein" }] } } });
    const call = kind === "READ" ? invokeCustomerPlatformRead : invokeCustomerPlatformMutation;
    await expect(call(payload)).resolves.toMatchObject({ items: [{ id: "collective-1" }] });
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", payload);
    expect(invokeLatest.mock.calls[0][1]).toBe(payload);
  });

  it("behoudt de referentie als de nieuwste collectiefbackend de actie niet kent, zonder oudere retry", async () => {
    invoke.mockRejectedValue(unknownAction());
    invokeLatest.mockRejectedValue(unknownAction("latest-request"));
    await expect(invokeCustomerPlatformRead({ action: "list_collective_dossiers" })).rejects.toMatchObject({
      message: "De collectieven-backend ondersteunt deze actie nog niet. Synchroniseer en publiceer de nieuwste Base44-versie en laad opnieuw.",
      status: 400, action: "list_collective_dossiers", requestId: "latest-request",
      details: { code: "collective_platform_backend_outdated" },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledTimes(1);
  });

  it.each([{ pinned: false, sameClient: false }, { pinned: true, sameClient: true }])("herhaalt geen actuele backend en houdt publicatie-informatie zichtbaar ($pinned/$sameClient)", async options => {
    Object.assign(runtime, options);
    invoke.mockRejectedValue(unknownAction());
    await expect(invokeCustomerPlatformRead({ action: "get_collective_dossier", collective_id: "collective-1" })).rejects.toMatchObject({
      status: 400, requestId: "ddcce3a0-57fd-422a-9c2b-35c2c205a96c", details: { code: "collective_platform_backend_outdated" },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it("gebruikt de collectiefmelding ook bij de gedeelde kaartacties met collectiefscope", async () => {
    invoke.mockRejectedValue(unknownAction());
    invokeLatest.mockRejectedValue(unknownAction());
    await expect(invokeCustomerPlatformRead({ action: "get_object_map_configuration", collective_id: "collective-1" })).rejects.toMatchObject({
      details: { code: "collective_platform_backend_outdated" },
    });
  });

  it.each([400, 401, 403, 409, 429, 503])("probeert een echte fout %i niet op een andere backend opnieuw", async status => {
    invokeLatest.mockRejectedValue({ response: { status, data: { error: status === 400 ? "Naam is verplicht" : "Onbekende actie", request_id: "real-error" } } });
    await expect(invokeCustomerPlatformMutation({ action: "create_collective_dossier", idempotency_key: "keep-key", expected_version: 0 })).rejects.toMatchObject({ status, requestId: "real-error", details: null });
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledTimes(1);
  });

  it("herhaalt geen onzekere timeout of niet-geregistreerde commerciële mutatie", async () => {
    invokeLatest.mockRejectedValue(new Error("Network timeout"));
    await expect(invokeCustomerPlatformMutation({ action: "confirm_building_association" })).rejects.toThrow("Network timeout");
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockRejectedValue(unknownAction());
    await expect(invokeCustomerPlatformMutation({ action: "create_customer_contact" })).rejects.toMatchObject({ message: "Onbekende actie", details: null });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokeLatest).toHaveBeenCalledTimes(1);
  });

  it("behoudt status en referentie van een geretourneerde fout zonder 2xx blind te herhalen", async () => {
    invokeLatest.mockResolvedValue({ status: 200, data: { error: "Onbekende actie", request_id: "resolved-error" } });
    await expect(invokeCustomerPlatformRead({ action: "list_collective_dossiers" })).rejects.toMatchObject({ status: 200, requestId: "resolved-error", message: "Onbekende actie" });
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledTimes(1);
  });

  it.each(["get_object_map_configuration", "list_object_building_candidates", "list_object_parcel_candidates", "update_object_map_configuration"])("houdt de bestaande klantobjectroute voor %s intact", async action => {
    const payload = { action, customer_id: "customer-1", object_id: "object-1", expected_version: 2, idempotency_key: "object-key" };
    invoke.mockResolvedValue({ data: { ok: true } });
    await expect(invokeCustomerPlatformRequestForAction(payload)).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", payload);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  function invokeCustomerPlatformRequestForAction(payload) {
    return payload.action === "update_object_map_configuration" ? invokeCustomerPlatformMutation(payload) : invokeCustomerPlatformRead(payload);
  }

  it.each([null, "", "   ", 42])("schakelt niet naar latest voor een ongeldige collectiefscope (%j)", async collectiveId => {
    invoke.mockRejectedValue({ response: { status: 400, data: { error: "customer_id is verplicht", request_id: "invalid-scope" } } });
    await expect(invokeCustomerPlatformRead({ action: "get_object_map_configuration", collective_id: collectiveId })).rejects.toMatchObject({ message: "customer_id is verplicht", details: null, requestId: "invalid-scope" });
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it("routeert onbekende of commerciële acties niet op basis van alleen collective_id", async () => {
    const payload = { action: "create_customer_contact", collective_id: "collective-1" };
    invoke.mockRejectedValue(unknownAction());
    await expect(invokeCustomerPlatformMutation(payload)).rejects.toMatchObject({ message: "Onbekende actie", details: null });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", payload);
    expect(invokeLatest).not.toHaveBeenCalled();
  });

  it.each([true, false])("legt een oude object-only kaartbackend uit zonder klantdata toe te voegen (pinned=%s)", async pinned => {
    runtime.pinned = pinned;
    const payload = Object.freeze({ action: "get_object_map_configuration", collective_id: "collective-1" });
    const client = pinned ? invokeLatest : invoke;
    client.mockRejectedValue({ response: { status: 400, data: { error: "customer_id is verplicht", request_id: "be5acd2c-5c7f-441c-b739-8ccce0a9bf32" } } });
    await expect(invokeCustomerPlatformRead(payload)).rejects.toMatchObject({
      status: 400, requestId: "be5acd2c-5c7f-441c-b739-8ccce0a9bf32", details: { code: "collective_platform_backend_outdated" },
      message: "De collectieven-backend ondersteunt deze actie nog niet. Synchroniseer en publiceer de nieuwste Base44-versie en laad opnieuw.",
    });
    expect(client).toHaveBeenCalledExactlyOnceWith("customerPlatformApi", payload);
    expect(pinned ? invoke : invokeLatest).not.toHaveBeenCalled();
  });
});

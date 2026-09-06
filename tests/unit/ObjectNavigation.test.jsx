import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { entities, functionInvoke, objectList, objectFilter } = vi.hoisted(() => {
  const emptyList = vi.fn(async () => []);
  const emptyFilter = vi.fn(async () => []);
  const object = {
    id: "object/1",
    customer_id: "customer-1",
    object_code: "OBJ-001",
    external_object_code: "MKA-7788",
    name: "Hoofdkantoor",
    object_type: "office",
    status: "active",
    address: "Coolsingel 1, Rotterdam",
    geocoding_status: "verified",
    latitude: 51.92,
    longitude: 4.48,
    version: 2,
  };
  const objectList = vi.fn(async () => [object]);
  const objectFilter = vi.fn(async query => [{
    ...object,
    id: query.id || object.id,
    name: query.id === "object-51" ? "Object eenenvijftig" : object.name,
  }]);
  const ajaxInstallation = {
    id: "installation-ajax",
    customer_id: "customer-1",
    object_id: object.id,
    installation_type: "alarm_system",
    name: "Ajax hoofdcentrale",
    brand: "Ajax Systems",
    control_device_key: "keypad",
    control_device_name: "KeyPad",
    manual_key: "ajax:numeric-keypad:nl",
    manual_version: "2026.08.2",
    lifecycle_status: "active",
    operational_status: "operational",
    credential_types: [],
    has_credentials: false,
    version: 1,
  };
  const handbookCategories = [
    { id: "handbook-installations", name: "Installaties", parent_category_id: null, status: "active", sort_order: 10 },
    { id: "handbook-alarm", name: "Alarminstallatie", parent_category_id: "handbook-installations", status: "active", sort_order: 10 },
    { id: "handbook-ajax", name: "Ajax hoofdcentrale", parent_category_id: "handbook-alarm", source_installation_id: ajaxInstallation.id, status: "active", sort_order: 10 },
  ];
  const functionInvoke = vi.fn(async (_functionName, payload) => {
    const data = payload?.action === "search_customer_objects"
      ? { items: [object], has_more: false }
      : payload?.action === "list_object_installations"
        ? { items: [ajaxInstallation] }
        : payload?.action === "list_object_handbook"
          ? { categories: handbookCategories, articles: [], sync_required: false, sync_token: "ajax-2026.08.2" }
          : {};
    return { data: { data } };
  });
  return {
    functionInvoke,
    objectList,
    objectFilter,
    entities: {
      SurveillanceObject: { list: objectList, filter: objectFilter },
      Customer: {
        get: vi.fn(async () => ({ id: "customer-1", trade_name: "Acme", status: "active" })),
        filter: vi.fn(async () => [{ id: "customer-1", trade_name: "Acme", status: "active" }]),
      },
      Task: { list: emptyList, filter: emptyFilter },
      Collectief: { list: emptyList, filter: emptyFilter },
      CustomerContact: { filter: emptyFilter },
      CustomerContactRole: { filter: emptyFilter },
      CustomerContractLine: { filter: emptyFilter },
      TaskExecution: { filter: emptyFilter },
      MobileReport: { filter: emptyFilter },
      ManagedFile: { filter: emptyFilter },
      CustomerEvent: { filter: emptyFilter },
      PlanningShift: { filter: emptyFilter },
    },
  };
});

vi.mock("@/api/base44Client", () => ({ base44: { entities, functions: { invoke: functionInvoke } } }));
vi.mock("@/components/objects/ObjectHeaderMap", () => ({ default: () => null }));

import Objects from "@/pages/Objects";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe("objectnavigatie", () => {
  it("opent een tabelrij als herlaadbare objectdossier-deeplink", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects"]}>
          <Routes>
            <Route path="/Objects" element={<><Objects /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText("Hoofdkantoor"));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(
      "/Objects?id=object%2F1&tab=warning-addresses",
    ));
    expect(await screen.findAllByRole("tab", { name: "Waarschuwingsadressen" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Modules" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Kaart & terrein" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Logboek" })).toHaveLength(2);
    expect(screen.getByText("OBJ-001")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("tab", { name: "Modules" })[0]);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(
      "/Objects?id=object%2F1&tab=modules",
    ));
    expect(await screen.findByRole("heading", { name: "Modules" })).toBeInTheDocument();
    expect(functionInvoke).toHaveBeenCalledWith("customerPlatformApi", expect.objectContaining({
      action: "list_object_modules",
      customer_id: "customer-1",
      object_id: "object/1",
    }));
  });

  it("laadt een directe deeplink los van de eerste objecttabelpagina en zonder afgeschermde velden", async () => {
    objectList.mockClear();
    objectFilter.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects?id=object-51&tab=warning-addresses"]}>
          <Routes>
            <Route path="/Objects" element={<><Objects /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("Object eenenvijftig")).length).toBeGreaterThan(0);
    expect(objectList).not.toHaveBeenCalled();
    const fields = objectFilter.mock.calls[0][4];
    expect(objectFilter).toHaveBeenCalledWith({ id: "object-51" }, "name", 1, 0, expect.any(Array));
    expect(fields).not.toContain("alarm_instruction");
    expect(fields).not.toContain("key_instruction");
    expect(fields).not.toContain("access_instruction");
    expect(fields).toEqual(expect.arrayContaining(["logo_file_url", "logo_file_id"]));
    expect(fields).toContain("external_object_code");
  });

  it("zoekt genormaliseerde interne en externe codes via de afgeschermde backendroute", async () => {
    objectFilter.mockClear();
    functionInvoke.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects?query=Ac.Me"]}>
          <Routes>
            <Route path="/Objects" element={<Objects />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Hoofdkantoor");
    expect(objectFilter).not.toHaveBeenCalled();
    expect(functionInvoke).toHaveBeenCalledWith("customerPlatformApi", {
      action: "search_customer_objects",
      customer_id: undefined,
      search: "Ac.Me",
      page: 1,
      page_size: 50,
    });
  });

  it("opent een Ajax-installatie rechtstreeks in haar eigen handboekcontext", async () => {
    functionInvoke.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects?id=object%2F1&tab=installations"]}>
          <Routes>
            <Route path="/Objects" element={<><Objects /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const installationNames = await screen.findAllByText("Ajax hoofdcentrale");
    const installationRow = installationNames.map(element => element.closest("tr")).find(Boolean);
    expect(installationRow).toBeTruthy();
    fireEvent.click(installationRow);

    await waitFor(() => {
      const location = screen.getByTestId("location").textContent;
      expect(location).toContain("tab=handbook");
      expect(location).toContain("installation=installation-ajax");
      expect(location).not.toContain("view=manual");
    });
    expect((await screen.findAllByText("Ajax hoofdcentrale")).length).toBeGreaterThan(0);
    expect(functionInvoke).toHaveBeenCalledWith("customerPlatformApi", expect.objectContaining({
      action: "list_object_handbook",
      customer_id: "customer-1",
      object_id: "object/1",
    }));
  });
});
